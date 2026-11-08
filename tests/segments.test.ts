import { describe, expect, it } from "vitest";
import { buildSentences, splitSentences, validateSegments } from "@/lib/transcript/segments";
import { countChunks } from "@/lib/transcription/protocol";

let n = 0;
const ids = () => `id${n++}`;

describe("splitSentences", () => {
  it("splits on terminal punctuation", () => {
    expect(splitSentences("Hello there. How are you? I'm fine!")).toEqual(["Hello there.", "How are you?", "I'm fine!"]);
  });
  it("does not split abbreviations or decimals", () => {
    expect(splitSentences("Mr. Smith paid 3.5 dollars. Then he left.")).toEqual([
      "Mr. Smith paid 3.5 dollars.",
      "Then he left.",
    ]);
  });
  it("keeps closing quotes with the sentence", () => {
    expect(splitSentences('She said "stop." Then silence.')).toEqual(['She said "stop."', "Then silence."]);
  });
  it("keeps unterminated text", () => {
    expect(splitSentences("no punctuation here")).toEqual(["no punctuation here"]);
  });
});

describe("validateSegments", () => {
  it("keeps valid timestamps", () => {
    expect(validateSegments([{ text: " Hello. ", timestamp: [0, 2.5] }], 10)).toEqual([
      { text: "Hello.", start: 0, end: 2.5 },
    ]);
  });
  it("bounds a missing final end by the audio duration", () => {
    const s = validateSegments(
      [
        { text: "A.", timestamp: [0, 2] },
        { text: "B.", timestamp: [2, null] },
      ],
      5,
    );
    expect(s[1]).toEqual({ text: "B.", start: 2, end: 5 });
  });
  it("drops timing that is reversed, out of range, non-monotonic or missing", () => {
    const s = validateSegments(
      [
        { text: "A.", timestamp: [3, 1] },
        { text: "B.", timestamp: [0, 99] },
        { text: "C.", timestamp: [4, 6] },
        { text: "D.", timestamp: [1, 2] },
        { text: "E.", timestamp: [null, 2] },
      ],
      10,
    );
    expect(s.map((x) => x.start)).toEqual([null, null, 4, null, null]);
    expect(s.map((x) => x.text)).toEqual(["A.", "B.", "C.", "D.", "E."]);
  });
  it("skips empty chunks", () => {
    expect(validateSegments([{ text: "  ", timestamp: [0, 1] }], 5)).toHaveLength(0);
  });
});

describe("buildSentences", () => {
  it("maps one segment to one sentence with segment precision", () => {
    const out = buildSentences(
      [
        { text: "Hello there.", start: 0, end: 2 },
        { text: "Bye now.", start: 2, end: 3 },
      ],
      ids,
    );
    expect(out.map((s) => [s.text, s.start, s.end, s.timing])).toEqual([
      ["Hello there.", 0, 2, "segment"],
      ["Bye now.", 2, 3, "segment"],
    ]);
  });
  it("marks sentences spanning or sharing segments as approximate", () => {
    const out = buildSentences(
      [
        { text: "One. Two and", start: 0, end: 4 },
        { text: "three.", start: 4, end: 6 },
      ],
      ids,
    );
    expect(out[0]).toMatchObject({ text: "One.", start: 0, end: 4, timing: "approximate" });
    expect(out[1]).toMatchObject({ text: "Two and three.", start: 0, end: 6, timing: "approximate" });
  });
  it("does not invent timing for untimed segments", () => {
    const out = buildSentences([{ text: "Hello.", start: null, end: null }], ids);
    expect(out[0]).toMatchObject({ start: null, end: null, timing: "none" });
  });
});

describe("countChunks", () => {
  it("matches the Whisper 30 s / 5 s stride windowing", () => {
    expect(countChunks(16000 * 10, 16000)).toBe(1);
    expect(countChunks(16000 * 30, 16000)).toBe(1);
    expect(countChunks(16000 * 31, 16000)).toBe(2);
    expect(countChunks(16000 * 50, 16000)).toBe(2);
    expect(countChunks(16000 * 51, 16000)).toBe(3);
  });
});
