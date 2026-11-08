/**
 * Browser audio helpers: validation, decoding and resampling to 16 kHz mono
 * for Whisper. Everything runs locally via the Web Audio API.
 */

export const WHISPER_SAMPLE_RATE = 16_000;
export const MAX_DURATION_SECONDS = 10 * 60;
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".m4a"] as const;
export const ACCEPT_ATTR = ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/x-m4a,audio/aac";

const EXT_MIME: Record<string, string[]> = {
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
  ".m4a": ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"],
};

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}

function extensionOf(name: string): string {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : "";
}

/** Fast checks that do not require decoding. Throws AudioValidationError. */
export function validateFile(file: { name: string; size: number; type: string }): void {
  const ext = extensionOf(file.name);
  const typeOk = Object.values(EXT_MIME).some((list) => list.includes(file.type));
  if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number]) && !typeOk) {
    throw new AudioValidationError(
      `“${file.name}” is not a supported format. Please upload an MP3, WAV or M4A file.`,
    );
  }
  if (file.size === 0) throw new AudioValidationError("This file is empty.");
  if (file.size > MAX_FILE_BYTES) {
    throw new AudioValidationError(
      `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} — try a shorter or more compressed recording.`,
    );
  }
}

/** Whether the browser claims it can play this container/codec at all. */
export function browserCanPlay(file: { name: string; type: string }): boolean {
  if (typeof document === "undefined") return true;
  const el = document.createElement("audio");
  const ext = extensionOf(file.name);
  const types = [file.type, ...(EXT_MIME[ext] ?? [])].filter(Boolean);
  return types.some((t) => el.canPlayType(t) !== "");
}

export interface DecodedAudio {
  /** 16 kHz mono PCM. */
  samples: Float32Array;
  duration: number;
}

/**
 * Decode an audio file and resample it to 16 kHz mono using an
 * OfflineAudioContext (which also down-mixes channels).
 */
export async function decodeForWhisper(file: Blob): Promise<DecodedAudio> {
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AC || typeof OfflineAudioContext === "undefined") {
    throw new AudioValidationError("This browser does not support the Web Audio API needed to decode audio.");
  }

  const bytes = await file.arrayBuffer();
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new AudioValidationError(
      "Your browser could not decode this file. The codec may be unsupported (some M4A/ALAC files fail in Firefox) — try converting it to MP3 or WAV.",
    );
  } finally {
    void ctx.close().catch(() => {});
  }

  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0.2) {
    throw new AudioValidationError("This recording is too short or contains no audio.");
  }
  if (decoded.duration > MAX_DURATION_SECONDS + 1) {
    throw new AudioValidationError(
      `This recording is ${formatDuration(decoded.duration)} long. Listenly currently supports up to ${formatDuration(MAX_DURATION_SECONDS)}.`,
    );
  }

  const length = Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, WHISPER_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const samples = new Float32Array(rendered.getChannelData(0));

  return { samples, duration: decoded.duration };
}

/** Read duration via an <audio> element (cheap, no full decode). */
export function probeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) resolve(el.duration);
      else reject(new Error("Unknown duration"));
    };
    el.onerror = () => reject(new AudioValidationError("The browser could not read this audio file."));
    el.src = url;
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
