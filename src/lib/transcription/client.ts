"use client";
/**
 * UI-thread façade over the Whisper worker. A single worker instance is kept
 * for the lifetime of the tab so the model is loaded once and reused across
 * page navigations. The worker is created lazily — nothing is downloaded
 * until the user starts a transcription.
 */
import {
  DEFAULT_MODEL_ID,
  type DevicePreference,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";

type Listener = (msg: WorkerResponse) => void;

export interface TranscriptionResult {
  text: string;
  chunks: { text: string; timestamp: [number | null, number | null] }[];
  device: string;
  elapsedMs: number;
}

class WhisperClient {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, { resolve: (r: TranscriptionResult) => void; reject: (e: Error) => void }>();

  isSupported(): boolean {
    return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => this.dispatch(e.data));
    worker.addEventListener("error", (e) => {
      const message = e.message || "The transcription worker crashed.";
      this.dispatch({ type: "error", phase: "load", message });
      for (const [, p] of this.pending) p.reject(new Error(message));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  private dispatch(msg: WorkerResponse) {
    for (const l of this.listeners) l(msg);
    if (msg.type === "result") {
      this.pending.get(msg.requestId)?.resolve(msg);
      this.pending.delete(msg.requestId);
    } else if (msg.type === "error" && msg.requestId) {
      this.pending.get(msg.requestId)?.reject(new Error(msg.message));
      this.pending.delete(msg.requestId);
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private send(req: WorkerRequest, transfer: Transferable[] = []) {
    this.ensure().postMessage(req, transfer);
  }

  load(modelId = DEFAULT_MODEL_ID, device: DevicePreference = "auto") {
    this.send({ type: "load", modelId, device });
  }

  transcribe(
    audio: Float32Array,
    { modelId = DEFAULT_MODEL_ID, device = "auto" }: { modelId?: string; device?: DevicePreference } = {},
  ): Promise<TranscriptionResult> {
    const requestId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.send({ type: "transcribe", requestId, modelId, device, audio }, [audio.buffer]);
    });
  }

  /** Abort any running work. The model is re-read from the browser cache next time. */
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    for (const [, p] of this.pending) p.reject(new Error("Transcription cancelled."));
    this.pending.clear();
  }
}

export const whisper = new WhisperClient();
