import { describe, expect, it } from "vitest";
import {
  checkResponse,
  emptyResponse,
  finalStatus,
  gradeValue,
  hintFor,
  isCloseMiss,
  isCorrect,
  normalizeAnswer,
  revealResponse,
  summarize,
} from "@/lib/exercise/grade";
import type { ExerciseSentence } from "@/lib/types";

describe("normalizeAnswer", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeAnswer("  Hello   World ")).toBe("hello world");
  });
  it("ignores irrelevant punctuation", () => {
    expect(normalizeAnswer("morning.")).toBe("morning");
    expect(normalizeAnswer('"really?!"')).toBe("really");
    expect(normalizeAnswer("(coffee),")).toBe("coffee");
  });
  it("normalises curly apostrophes but keeps them meaningful", () => {
    expect(normalizeAnswer("Don’t")).toBe("don't");
    expect(normalizeAnswer("it's")).not.toBe(normalizeAnswer("its"));
  });
  it("drops quote-style apostrophes around words", () => {
    expect(normalizeAnswer("'hello'")).toBe("hello");
  });
  it("treats hyphens as spaces", () => {
    expect(normalizeAnswer("well-known")).toBe(normalizeAnswer("well known"));
  });
  it("keeps decimals and times intact, and strips thousands separators", () => {
    expect(normalizeAnswer("3.5")).toBe("3.5");
    expect(normalizeAnswer("10:30.")).toBe("10:30");
    expect(normalizeAnswer("1,000")).toBe("1000");
  });
  it("maps small number words to digits", () => {
    expect(normalizeAnswer("Ten")).toBe(normalizeAnswer("10"));
    expect(normalizeAnswer("twenty")).toBe("20");
  });
});

describe("isCorrect / gradeValue", () => {
  it("accepts case and punctuation variants", () => {
    expect(isCorrect("Beautiful", "beautiful,")).toBe(true);
    expect(isCorrect("a lot of", "A lot  of")).toBe(true);
  });
  it("preserves meaningful word differences", () => {
    expect(isCorrect("walk", "walked")).toBe(false);
    expect(isCorrect("their", "there")).toBe(false);
    expect(isCorrect("were", "we're")).toBe(false);
    expect(isCorrect("a lot", "a lot of")).toBe(false);
  });
  it("never accepts empty input", () => {
    expect(isCorrect("", "")).toBe(false);
    expect(gradeValue("   ", "word")).toBe("unanswered");
  });
  it("classifies statuses", () => {
    expect(gradeValue("Word", "word")).toBe("correct");
    expect(gradeValue("ward", "word")).toBe("incorrect");
  });
});

describe("close misses", () => {
  it("flags one-letter typos on longer words without accepting them", () => {
    expect(isCloseMiss("beautifull", "beautiful")).toBe(true);
    expect(isCorrect("beautifull", "beautiful")).toBe(false);
  });
  it("does not flag short words or distant answers", () => {
    expect(isCloseMiss("cat", "car")).toBe(false);
    expect(isCloseMiss("orange", "computer")).toBe(false);
  });
});

describe("responses", () => {
  it("counts attempts only for non-empty checks", () => {
    let r = emptyResponse();
    r = checkResponse(r, "word");
    expect(r.attempts).toBe(0);
    expect(r.status).toBe("unanswered");
    r = checkResponse({ ...r, value: "ward" }, "word");
    r = checkResponse({ ...r, value: "word" }, "word");
    expect(r.attempts).toBe(2);
    expect(r.status).toBe("correct");
  });
  it("revealed answers never count as correct", () => {
    const r = revealResponse({ ...emptyResponse(), value: "word" });
    expect(finalStatus(r, "word")).toBe("revealed");
    expect(checkResponse(r, "word").status).toBe("revealed");
  });
});

describe("summarize", () => {
  const items: ExerciseSentence[] = [
    {
      sentenceId: "s1",
      tokens: [
        { kind: "text", value: "I " },
        { kind: "blank", id: "a", answer: "love", wordCount: 1 },
        { kind: "text", value: " " },
        { kind: "blank", id: "b", answer: "coffee", wordCount: 1 },
        { kind: "text", value: "." },
      ],
    },
    {
      sentenceId: "s2",
      tokens: [
        { kind: "blank", id: "c", answer: "Really", wordCount: 1 },
        { kind: "text", value: "? " },
        { kind: "blank", id: "d", answer: "yes", wordCount: 1 },
      ],
    },
  ];
  it("computes accuracy, counts and hint totals", () => {
    const s = summarize(items, {
      a: { value: "LOVE", attempts: 1, hints: 1, revealed: false, status: "correct" },
      b: { value: "copy", attempts: 2, hints: 0, revealed: false, status: "incorrect" },
      c: { value: "", attempts: 0, hints: 2, revealed: true, status: "revealed" },
    });
    expect(s).toMatchObject({ total: 4, correct: 1, incorrect: 1, revealed: 1, unanswered: 1, hintsUsed: 3, attempts: 3, accuracy: 25 });
  });
  it("can be limited to a retry subset", () => {
    const s = summarize(items, { b: { value: "coffee", attempts: 1, hints: 0, revealed: false, status: "correct" } }, ["b"]);
    expect(s.total).toBe(1);
    expect(s.accuracy).toBe(100);
    expect(s.retry).toBe(true);
  });
});

describe("hintFor", () => {
  it("reveals the first letter, then every other letter", () => {
    expect(hintFor("coffee", 1)).toBe("c _ _ _ _ _");
    expect(hintFor("coffee", 2)).toBe("c _ f _ e _");
  });
  it("keeps word boundaries and apostrophes", () => {
    expect(hintFor("don't stop", 1)).toBe("d _ _ ' _   s _ _ _");
  });
  it("returns nothing at level 0", () => {
    expect(hintFor("word", 0)).toBe("");
  });
});
