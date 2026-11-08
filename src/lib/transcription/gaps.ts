/**
 * Coverage-gap detection for Whisper output.
 *
 * Small Whisper models sometimes emit end-of-transcript early, silently
 * dropping the last sentence(s) of a window. We look for stretches of the
 * recording that contain speech-like energy but are not covered by any
 * timestamped segment, so the worker can re-transcribe just those slices.
 * Only real model output on real audio is ever added — nothing is invented.
 */

export interface TimedChunk {
  text: string;
  timestamp: [number | null, number | null];
}

export interface Gap {
  start: number;
  end: number;
}

const FRAME_S = 0.05;

/** Seconds of "voiced" audio (frame RMS above threshold) inside [start, end). */
export function voicedSeconds(audio: Float32Array, sampleRate: number, start: number, end: number, threshold: number) {
  const frame = Math.max(1, Math.round(FRAME_S * sampleRate));
  const from = Math.max(0, Math.floor(start * sampleRate));
  const to = Math.min(audio.length, Math.floor(end * sampleRate));
  let voiced = 0;
  for (let i = from; i + frame <= to; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += audio[j] * audio[j];
    if (Math.sqrt(s / frame) >= threshold) voiced++;
  }
  return voiced * FRAME_S;
}

/** Overall RMS, used to set a recording-relative speech threshold. */
export function rms(audio: Float32Array): number {
  let s = 0;
  for (let i = 0; i < audio.length; i++) s += audio[i] * audio[i];
  return Math.sqrt(s / Math.max(1, audio.length));
}

export function findSpeechGaps(
  audio: Float32Array,
  sampleRate: number,
  chunks: TimedChunk[],
  {
    minGap = 1.5,
    minVoiced = 0.6,
  }: { minGap?: number; minVoiced?: number } = {},
): Gap[] {
  const duration = audio.length / sampleRate;
  const threshold = Math.max(0.005, rms(audio) * 0.35);
  const timed = chunks
    .map((c) => c.timestamp)
    .filter((t): t is [number, number | null] => typeof t[0] === "number")
    .map(([s, e]) => [s, e ?? duration] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  // An untimed transcript gives us nothing to measure against.
  if (timed.length === 0) return [];

  const candidates: Gap[] = [];
  let cursor = 0;
  for (const [s, e] of timed) {
    if (s - cursor >= minGap) candidates.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (duration - cursor >= minGap) candidates.push({ start: cursor, end: duration });

  return candidates.filter((g) => voicedSeconds(audio, sampleRate, g.start, g.end, threshold) >= minVoiced);
}

/** Shift a gap transcription's timestamps back onto the full recording's timeline. */
export function offsetChunks(chunks: TimedChunk[], offset: number, limit: number): TimedChunk[] {
  return chunks
    .filter((c) => c.text.trim())
    .map((c) => ({
      text: c.text,
      timestamp: [
        c.timestamp[0] === null ? null : Math.min(limit, c.timestamp[0] + offset),
        c.timestamp[1] === null ? null : Math.min(limit, c.timestamp[1] + offset),
      ] as [number | null, number | null],
    }));
}

/** Merge recovered chunks into the main list, ordered by start time. */
export function mergeChunks(base: TimedChunk[], extra: TimedChunk[]): TimedChunk[] {
  return [...base, ...extra]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.timestamp[0] ?? Infinity) - (b.c.timestamp[0] ?? Infinity) || a.i - b.i)
    .map(({ c }) => c);
}
