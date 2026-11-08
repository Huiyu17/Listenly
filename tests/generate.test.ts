import { describe, expect, it } from "vitest";
import {
  countEligibleWords,
  generateExercise,
  listBlanks,
  tokensToText,
  DIFFICULTY_PRESETS,
} from "@/lib/exercise/generate";
import { STOP_WORDS } from "@/lib/text/wordlists";
import { tokenize } from "@/lib/text/tokenize";
import type { ExerciseConfig, Sentence } from "@/lib/types";

const TEXT = [
  "Every morning I wake up early and make a cup of coffee before work.",
  "My sister usually takes the bus, but yesterday she decided to walk instead.",
  "We talked about the weather, our families and a lot of other things.",
  "Honestly, the conference in Barcelona was fascinating and remarkably well organized.",
  "If you want to improve your listening, you have to practice every day.",
  "The researchers carefully analyzed thousands of recordings from 2019 to 2023.",
  "She picked up the phone, figured out the problem and solved it quickly.",
  "Sometimes the simplest explanations are the most convincing ones.",
];
const sentences: Sentence[] = TEXT.map((text, i) => ({
  id: `s${i}`,
  text,
  start: i * 4,
  end: i * 4 + 4,
  timing: "segment",
}));

const cfg = (
  difficulty: ExerciseConfig["difficulty"],
  percentage = DIFFICULTY_PRESETS[difficulty].percentage,
  variant = 0,
): ExerciseConfig => ({ difficulty, percentage, variant });

/** Eligible words hidden (a phrase counts its eligible words, minimum 1) — mirrors the generator's target. */
function hiddenWordCount(items: ReturnType<typeof generateExercise>) {
  let n = 0;
  for (const it of items)
    for (const t of it.tokens)
      if (t.kind === "blank") {
        const eligible = tokenize(t.answer).words.filter((w) => !STOP_WORDS.has(w.lower)).length;
        n += Math.max(1, eligible);
      }
  return n;
}

describe("tokenize", () => {
  it("keeps contractions, hyphenated words and numbers whole", () => {
    const words = tokenize("Don't stop — it's well-known: 3.5 kg, 1,000 people at 10:30.").words.map((w) => w.value);
    expect(words).toEqual(["Don't", "stop", "it's", "well-known", "3.5", "kg", "1,000", "people", "at", "10:30"]);
  });
  it("reconstructs the source exactly", () => {
    const src = "  Hello, world!  (Yes.) ";
    const t = tokenize(src);
    const rebuilt = t.words.map((w, i) => t.separators[i] + w.value).join("") + t.separators[t.words.length];
    expect(rebuilt).toBe(src);
  });
});

describe("generateExercise", () => {
  it("preserves the original transcript exactly", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      const items = generateExercise(sentences, cfg(d));
      items.forEach((it, i) => expect(tokensToText(it.tokens)).toBe(TEXT[i]));
    }
  });

  it("keeps punctuation outside blanks", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      for (const b of listBlanks(generateExercise(sentences, cfg(d, 60)))) {
        expect(b.answer).toMatch(/^[\p{L}\p{N}]/u);
        expect(b.answer).toMatch(/[\p{L}\p{N}]$/u);
        expect(b.answer).not.toMatch(/[,.!?;:]\s/);
      }
    }
  });

  it("never blanks a lone stop word", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      for (const b of listBlanks(generateExercise(sentences, cfg(d, 80)))) {
        if (!b.answer.includes(" ")) expect(STOP_WORDS.has(b.answer.toLowerCase())).toBe(false);
      }
    }
  });

  it("hides approximately the requested share of eligible words", () => {
    const eligible = countEligibleWords(sentences);
    for (const d of ["easy", "medium", "hard"] as const) {
      const pct = DIFFICULTY_PRESETS[d].percentage;
      const hidden = hiddenWordCount(generateExercise(sentences, cfg(d)));
      const target = Math.round((eligible * pct) / 100);
      expect(Math.abs(hidden - target)).toBeLessThanOrEqual(1);
    }
  });

  it("increases blanks with difficulty", () => {
    const n = (d: "easy" | "medium" | "hard") => hiddenWordCount(generateExercise(sentences, cfg(d)));
    expect(n("easy")).toBeLessThan(n("medium"));
    expect(n("medium")).toBeLessThan(n("hard"));
  });

  it("respects a custom percentage", () => {
    const eligible = countEligibleWords(sentences);
    const hidden = hiddenWordCount(generateExercise(sentences, cfg("medium", 50)));
    expect(Math.abs(hidden - Math.round(eligible / 2))).toBeLessThanOrEqual(1);
  });

  it("is deterministic for the same input and variant", () => {
    const a = JSON.stringify(generateExercise(sentences, cfg("medium")));
    const b = JSON.stringify(generateExercise(sentences, cfg("medium")));
    expect(a).toBe(b);
  });

  it("produces a different selection for a new variant", () => {
    const a = listBlanks(generateExercise(sentences, cfg("medium", 30, 0))).map((b) => b.id).join();
    const b = listBlanks(generateExercise(sentences, cfg("medium", 30, 1))).map((b) => b.id).join();
    expect(a).not.toBe(b);
  });

  it("easy mode uses single words and skips proper nouns", () => {
    const blanks = listBlanks(generateExercise(sentences, cfg("easy", 40)));
    expect(blanks.every((b) => !b.answer.includes(" "))).toBe(true);
    expect(blanks.map((b) => b.answer)).not.toContain("Barcelona");
  });

  it("medium and hard modes can include multiword expressions", () => {
    expect(listBlanks(generateExercise(sentences, cfg("hard", 60))).some((b) => b.wordCount > 1)).toBe(true);
    expect(listBlanks(generateExercise(sentences, cfg("medium", 50))).some((b) => b.wordCount > 1)).toBe(true);
  });

  it("hard mode prefers longer, less common vocabulary than easy mode", () => {
    const avgLen = (d: "easy" | "hard") => {
      const b = listBlanks(generateExercise(sentences, cfg(d, 20))).filter((x) => x.wordCount === 1);
      return b.reduce((s, x) => s + x.answer.length, 0) / b.length;
    };
    expect(avgLen("hard")).toBeGreaterThan(avgLen("easy"));
  });

  it("spreads blanks across sentences", () => {
    const items = generateExercise(sentences, cfg("medium"));
    const withBlanks = items.filter((it) => it.tokens.some((t) => t.kind === "blank")).length;
    expect(withBlanks).toBeGreaterThanOrEqual(sentences.length - 1);
  });

  it("gives every blank a unique id", () => {
    const ids = listBlanks(generateExercise(sentences, cfg("hard", 80))).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles empty and stop-word-only input", () => {
    expect(listBlanks(generateExercise([], cfg("medium")))).toHaveLength(0);
    const only: Sentence[] = [{ id: "x", text: "And so it is.", start: null, end: null, timing: "none" }];
    expect(listBlanks(generateExercise(only, cfg("hard")))).toHaveLength(0);
  });
});
