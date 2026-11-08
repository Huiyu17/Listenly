/** Message protocol between the UI thread and the Whisper Web Worker. */

export const DEFAULT_MODEL_ID = "onnx-community/whisper-tiny.en";

export type DevicePreference = "auto" | "webgpu" | "wasm";
export type ResolvedDevice = "webgpu" | "wasm";

export type WorkerRequest =
  | { type: "load"; modelId: string; device: DevicePreference }
  | {
      type: "transcribe";
      requestId: string;
      modelId: string;
      device: DevicePreference;
      /** 16 kHz mono PCM (transferred). */
      audio: Float32Array;
    };

export interface FileProgress {
  file: string;
  loaded: number;
  total: number;
  done: boolean;
}

export type WorkerResponse =
  | { type: "status"; status: "loading" | "ready"; message: string; device?: ResolvedDevice }
  | { type: "download"; files: FileProgress[] }
  | { type: "fallback"; reason: string }
  | {
      type: "progress";
      requestId: string;
      chunksDone: number;
      chunksTotal: number;
      partialText: string;
    }
  | {
      type: "result";
      requestId: string;
      text: string;
      chunks: { text: string; timestamp: [number | null, number | null] }[];
      device: ResolvedDevice;
      elapsedMs: number;
    }
  | { type: "error"; requestId?: string; message: string; phase: "load" | "transcribe" };

/** Whisper long-form chunking parameters (seconds). */
export const CHUNK_LENGTH_S = 30;
export const STRIDE_LENGTH_S = 5;

/** Mirrors the windowing loop in Transformers.js so we can report chunk progress. */
export function countChunks(samples: number, sampleRate: number): number {
  const window = sampleRate * CHUNK_LENGTH_S;
  const jump = window - 2 * sampleRate * STRIDE_LENGTH_S;
  if (samples <= window) return 1;
  return 1 + Math.ceil((samples - window) / jump);
}
