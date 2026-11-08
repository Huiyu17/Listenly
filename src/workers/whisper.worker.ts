/// <reference lib="webworker" />
/**
 * Whisper inference worker. Loads a Transformers.js ASR pipeline on demand
 * (WebGPU when available, WASM otherwise) and transcribes 16 kHz PCM sent
 * from the UI thread. Audio never leaves the device: the only network
 * traffic is the one-time download of model weights from Hugging Face,
 * which the browser then caches.
 */
import {
  env,
  pipeline,
  WhisperTextStreamer,
  type WhisperTokenizer,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import {
  CHUNK_LENGTH_S,
  STRIDE_LENGTH_S,
  countChunks,
  type DevicePreference,
  type FileProgress,
  type ResolvedDevice,
  type WorkerRequest,
  type WorkerResponse,
} from "../lib/transcription/protocol";
import { findSpeechGaps, mergeChunks, offsetChunks, type TimedChunk } from "../lib/transcription/gaps";

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

let loaded: { key: string; device: ResolvedDevice; pipe: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;
const files = new Map<string, FileProgress>();

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function onProgress(info: unknown) {
  const p = info as { status: string; file?: string; loaded?: number; total?: number };
  if (!p.file) return;
  const prev = files.get(p.file) ?? { file: p.file, loaded: 0, total: 0, done: false };
  if (p.status === "progress") {
    prev.loaded = p.loaded ?? prev.loaded;
    prev.total = p.total ?? prev.total;
  } else if (p.status === "done") {
    prev.done = true;
    if (prev.total) prev.loaded = prev.total;
  }
  files.set(p.file, prev);
  post({ type: "download", files: [...files.values()] });
}

function createPipeline(modelId: string, device: ResolvedDevice) {
  // Cast through a loose signature: the overloaded pipeline() typing is too complex for tsc here.
  const create = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
  return create("automatic-speech-recognition", modelId, {
    device,
    dtype:
      device === "webgpu"
        ? { encoder_model: "fp32", decoder_model_merged: "q4" }
        : { encoder_model: "fp32", decoder_model_merged: "q8" },
    progress_callback: onProgress,
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
}

async function getPipeline(modelId: string, pref: DevicePreference) {
  const wantGpu = pref === "webgpu" || (pref === "auto" && (await hasWebGPU()));
  const device: ResolvedDevice = wantGpu ? "webgpu" : "wasm";
  const key = `${modelId}|${pref}`;
  if (loaded && loaded.key === key) return loaded;

  files.clear();
  post({
    type: "status",
    status: "loading",
    message: device === "webgpu" ? "Loading Whisper (WebGPU)…" : "Loading Whisper (CPU / WASM)…",
    device,
  });

  let entry = { key, device, pipe: createPipeline(modelId, device) };
  loaded = entry;
  try {
    await entry.pipe;
  } catch (err) {
    if (device === "webgpu" && pref === "auto") {
      // WebGPU adapters can exist yet fail at session creation — fall back to WASM.
      post({ type: "fallback", reason: errorMessage(err) });
      entry = { key, device: "wasm", pipe: createPipeline(modelId, "wasm") };
      loaded = entry;
      try {
        await entry.pipe;
      } catch (err2) {
        loaded = null;
        throw err2;
      }
    } else {
      loaded = null;
      throw err;
    }
  }
  post({ type: "status", status: "ready", message: "Model ready", device: entry.device });
  return entry;
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to load|404|ERR_/i.test(raw)) {
    return `Could not download the Whisper model. Check your connection (the model is fetched once from huggingface.co and then cached). Details: ${raw}`;
  }
  if (/memory|allocation|OOM/i.test(raw)) {
    return `The device ran out of memory while running Whisper. Close other tabs and try again. Details: ${raw}`;
  }
  return raw;
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "load") {
    try {
      await getPipeline(msg.modelId, msg.device);
    } catch (err) {
      post({ type: "error", phase: "load", message: errorMessage(err) });
    }
    return;
  }

  if (msg.type === "transcribe") {
    let entry;
    try {
      entry = await getPipeline(msg.modelId, msg.device);
    } catch (err) {
      post({ type: "error", phase: "load", requestId: msg.requestId, message: errorMessage(err) });
      return;
    }

    try {
      const pipe = await entry.pipe;
      const started = performance.now();
      const chunksTotal = countChunks(msg.audio.length, 16_000);
      let chunksDone = 0;
      let partialText = "";
      post({ type: "progress", requestId: msg.requestId, chunksDone, chunksTotal, partialText });

      const streamer = new WhisperTextStreamer(pipe.tokenizer as WhisperTokenizer, {
        skip_prompt: true,
        callback_function: (text: string) => {
          partialText += text;
          post({ type: "progress", requestId: msg.requestId, chunksDone, chunksTotal, partialText });
        },
        on_finalize: () => {
          chunksDone = Math.min(chunksTotal, chunksDone + 1);
          partialText += " ";
          post({ type: "progress", requestId: msg.requestId, chunksDone, chunksTotal, partialText });
        },
      });

      type Output = { text: string; chunks?: TimedChunk[] };
      const run = async (audio: Float32Array, withStreamer: boolean) =>
        (await pipe(audio, {
          chunk_length_s: CHUNK_LENGTH_S,
          stride_length_s: STRIDE_LENGTH_S,
          return_timestamps: true,
          ...(withStreamer ? { streamer } : {}),
        } as Record<string, unknown>)) as Output;

      const output = await run(msg.audio, true);
      let chunks: TimedChunk[] = output.chunks ?? [];

      // Recovery: re-transcribe stretches that contain speech but got no segment
      // (small Whisper models sometimes stop early and drop trailing sentences).
      const SR = 16_000;
      const duration = msg.audio.length / SR;
      for (let pass = 0; pass < 2; pass++) {
        const gaps = findSpeechGaps(msg.audio, SR, chunks);
        if (!gaps.length) break;
        let added = 0;
        for (const gap of gaps) {
          post({
            type: "progress",
            requestId: msg.requestId,
            chunksDone,
            chunksTotal,
            partialText: `${partialText} [re-checking ${gap.start.toFixed(1)}–${gap.end.toFixed(1)} s]`,
          });
          const slice = msg.audio.slice(Math.floor(gap.start * SR), Math.ceil(gap.end * SR));
          const extra = offsetChunks((await run(slice, false)).chunks ?? [], gap.start, duration);
          added += extra.length;
          chunks = mergeChunks(chunks, extra);
        }
        if (!added) break;
      }

      post({
        type: "result",
        requestId: msg.requestId,
        text: chunks.length ? chunks.map((c) => c.text).join("").trim() : (output.text ?? ""),
        chunks,
        device: entry.device,
        elapsedMs: performance.now() - started,
      });
    } catch (err) {
      post({ type: "error", phase: "transcribe", requestId: msg.requestId, message: errorMessage(err) });
    }
  }
});
