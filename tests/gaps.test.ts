import { describe, expect, it } from "vitest";
import { findSpeechGaps, mergeChunks, offsetChunks, type TimedChunk } from "@/lib/transcription/gaps";

const SR = 1000; // low rate keeps synthetic buffers small

/** Build audio with "speech" (a tone) in the given second ranges and silence elsewhere. */
function synth(seconds: number, speech: [number, number][]) {
  const a = new Float32Array(seconds * SR);
  for (const [s, e] of speech) for (let i = s * SR; i < e * SR; i++) a[i] = 0.3 * Math.sin(i * 0.9);
  return a;
}
const chunk = (s: number, e: number | null, text = "x"): TimedChunk => ({ text, timestamp: [s, e] });

describe("findSpeechGaps", () => {
  it("finds untranscribed speech at the end", () => {
    const audio = synth(26, [[0, 20], [21, 26]]);
    const gaps = findSpeechGaps(audio, SR, [chunk(0, 6), chunk(6, 13), chunk(13, 20.5)]);
    expect(gaps).toEqual([{ start: 20.5, end: 26 }]);
  });

  it("finds untranscribed speech between segments", () => {
    const audio = synth(30, [[0, 30]]);
    expect(findSpeechGaps(audio, SR, [chunk(0, 10), chunk(18, 30)])).toEqual([{ start: 10, end: 18 }]);
  });

  it("ignores silent gaps and short pauses", () => {
    const audio = synth(30, [[0, 10], [12, 20]]);
    expect(findSpeechGaps(audio, SR, [chunk(0, 10), chunk(12, 20)])).toEqual([]);
    expect(findSpeechGaps(synth(10, [[0, 10]]), SR, [chunk(0, 4), chunk(5, 10)])).toEqual([]);
  });

  it("does nothing when there are no timestamps to compare against", () => {
    expect(findSpeechGaps(synth(10, [[0, 10]]), SR, [{ text: "x", timestamp: [null, null] }])).toEqual([]);
  });

  it("treats an open final segment as reaching the end", () => {
    expect(findSpeechGaps(synth(20, [[0, 20]]), SR, [chunk(0, 5), chunk(5, null)])).toEqual([]);
  });
});

describe("offsetChunks / mergeChunks", () => {
  it("shifts recovered timestamps onto the full timeline and keeps order", () => {
    const extra = offsetChunks([chunk(0, 5.2, " If you want."), chunk(5.2, null, " ")], 20.5, 26);
    expect(extra).toEqual([{ text: " If you want.", timestamp: [20.5, 25.7] }]);
    const merged = mergeChunks([chunk(0, 10, "a"), chunk(30, 40, "c")], [chunk(10, 20, "b")]);
    expect(merged.map((c) => c.text)).toEqual(["a", "b", "c"]);
  });

  it("clamps shifted timestamps to the recording length", () => {
    expect(offsetChunks([chunk(0, 9, "x")], 20, 26)[0].timestamp).toEqual([20, 26]);
  });
});
