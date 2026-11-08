import type { Sentence, TranscriptSegment } from "../types";

/** Shape of a chunk returned by the Transformers.js ASR pipeline with `return_timestamps: true`. */
export interface RawWhisperChunk {
  text: string;
  timestamp: [number | null | undefined, number | null | undefined] | readonly unknown[];
}

const EPSILON = 0.05;

/**
 * Turn Whisper chunks into validated segments.
 *
 * Rules (we never invent timing):
 *  - start/end must be finite, non-negative numbers, end > start.
 *  - timestamps may not exceed the audio duration (small tolerance).
 *  - segments must be monotonically non-decreasing in start time.
 *  - a missing `end` on the final chunk is the pipeline's way of saying
 *    "until the end of the audio", so it is bounded by the known duration.
 *  - any segment failing a rule keeps its text but loses its timing.
 */
export function validateSegments(chunks: RawWhisperChunk[], duration: number): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let lastStart = -Infinity;
  const tolerance = Math.max(0.5, duration * 0.01);

  chunks.forEach((chunk, i) => {
    const text = (chunk.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const [rawStart, rawEnd] = (chunk.timestamp ?? []) as unknown[];
    let start = isTime(rawStart) ? rawStart : null;
    let end = isTime(rawEnd) ? rawEnd : null;

    if (end === null && start !== null && i === chunks.length - 1 && duration > start) {
      end = duration;
    }

    const valid =
      start !== null &&
      end !== null &&
      end > start + EPSILON / 5 &&
      start >= lastStart - EPSILON &&
      end <= duration + tolerance;

    if (valid) {
      start = Math.max(0, start as number);
      end = Math.min(duration, end as number);
      lastStart = start;
      out.push({ text, start, end });
    } else {
      out.push({ text, start: null, end: null });
    }
  });
  return out;
}

function isTime(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Split text into sentences. Handles ., !, ? and ellipses, keeps closing
 * quotes/brackets attached, and avoids splitting common abbreviations and
 * decimal numbers.
 */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const ABBREV = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|u\.s|a\.m|p\.m|no)\.$/i;
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      // absorb runs of terminators and closing quotes/brackets
      while (i + 1 < clean.length && /[.!?…"'”’)\]]/.test(clean[i + 1])) {
        buf += clean[++i];
      }
      const next = clean[i + 1];
      if (next === undefined) break;
      if (next !== " ") continue; // e.g. "3.5" or "U.S.A"
      if (ch === "." && ABBREV.test(buf.trim())) continue;
      const after = clean[i + 2] ?? "";
      // Only split when the next sentence plausibly starts here.
      if (!/[A-Z0-9"“'‘(\[]/.test(after)) continue;
      parts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

let idCounter = 0;
export function makeId(prefix = "s"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/**
 * Build sentence units from validated segments.
 *
 * Segment text is concatenated, split into sentences, and each sentence is
 * given the time span of every segment its characters overlap:
 *  - exactly one fully-covered segment → "segment" precision
 *  - several segments, or a segment shared with other sentences → "approximate"
 *  - any overlapping segment without timing → "none"
 */
export function buildSentences(
  segments: TranscriptSegment[],
  idFactory: () => string = () => makeId("s"),
): Sentence[] {
  // Concatenate with a single space and remember each segment's char range.
  const ranges: { from: number; to: number; seg: TranscriptSegment }[] = [];
  let full = "";
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    if (full) full += " ";
    const from = full.length;
    full += text;
    ranges.push({ from, to: full.length, seg });
  }

  const sentences: Sentence[] = [];
  let searchFrom = 0;
  for (const sentenceText of splitSentences(full)) {
    const from = full.indexOf(sentenceText, searchFrom);
    const to = from + sentenceText.length;
    searchFrom = to;

    const overlapping = ranges.filter((r) => r.from < to && r.to > from);
    const timed = overlapping.length > 0 && overlapping.every((r) => r.seg.start !== null && r.seg.end !== null);

    if (!timed) {
      sentences.push({ id: idFactory(), text: sentenceText, start: null, end: null, timing: "none" });
      continue;
    }
    const start = Math.min(...overlapping.map((r) => r.seg.start as number));
    const end = Math.max(...overlapping.map((r) => r.seg.end as number));
    const exact = overlapping.length === 1 && overlapping[0].from >= from && overlapping[0].to <= to;
    sentences.push({ id: idFactory(), text: sentenceText, start, end, timing: exact ? "segment" : "approximate" });
  }
  return sentences;
}

export function hasAnyTiming(sentences: Sentence[]): boolean {
  return sentences.some((s) => s.timing !== "none");
}
