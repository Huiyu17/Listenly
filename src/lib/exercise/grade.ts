/**
 * Local, deterministic answer grading.
 *
 * Normalisation (applied to both the answer and the user's input):
 *  - Unicode NFKC, case-insensitive
 *  - curly quotes/apostrophes → straight
 *  - hyphens and dashes are treated as spaces ("well-known" == "well known")
 *  - surrounding/irrelevant punctuation removed (. , ; : ! ? " ( ) …)
 *  - whitespace collapsed
 *  - digits and number words up to twenty, plus tens, are interchangeable
 *
 * Apostrophes inside words are kept, so "its" ≠ "it's" and "were" ≠ "we're":
 * those are meaningful differences. No spelling leniency is applied to the
 * verdict; a near-miss is only reported as a hint ("close").
 */
import type { BlankResponse, BlankStatus, ExerciseSentence, ResultSummary } from "../types";
import { listBlanks } from "./generate";

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13",
  fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90", hundred: "100",
};

export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    // thousands separators: "1,000" == "1000"
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    // keep decimal points / times between digits ("3.5", "10:30")
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/(\d):(?=\d)/g, "$1\u0002")
    .replace(/[\-‐‑‒–—―]/g, " ")
    .replace(/[.,;:!?"()[\]{}…]/g, " ")
    .replace(/\u0001/g, ".")
    .replace(/\u0002/g, ":")
    // apostrophes that are not inside a word are irrelevant
    .replace(/(^|\s)'+|'+(?=\s|$)/g, "$1")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ");
}

export function isCorrect(input: string, answer: string): boolean {
  const a = normalizeAnswer(input);
  return a.length > 0 && a === normalizeAnswer(answer);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** True for a wrong answer that is one or two edits away from the expected text. */
export function isCloseMiss(input: string, answer: string): boolean {
  const a = normalizeAnswer(input);
  const b = normalizeAnswer(answer);
  if (!a || a === b) return false;
  const d = levenshtein(a, b);
  return b.length >= 4 && d <= (b.length >= 8 ? 2 : 1);
}

export function gradeValue(input: string, answer: string): BlankStatus {
  if (!input.trim()) return "unanswered";
  return isCorrect(input, answer) ? "correct" : "incorrect";
}

export function emptyResponse(): BlankResponse {
  return { value: "", attempts: 0, hints: 0, revealed: false, status: "unanswered" };
}

/** Record a "Check" on one blank. Attempts only count non-empty submissions. */
export function checkResponse(r: BlankResponse, answer: string): BlankResponse {
  if (r.revealed) return { ...r, status: "revealed" };
  const status = gradeValue(r.value, answer);
  return { ...r, status, attempts: r.value.trim() ? r.attempts + 1 : r.attempts };
}

export function revealResponse(r: BlankResponse): BlankResponse {
  return { ...r, revealed: true, status: "revealed" };
}

/** Final status used for scoring: revealed answers never count as correct. */
export function finalStatus(r: BlankResponse | undefined, answer: string): BlankStatus {
  if (!r) return "unanswered";
  if (r.revealed) return "revealed";
  return gradeValue(r.value, answer);
}

export function summarize(
  items: ExerciseSentence[],
  responses: Record<string, BlankResponse>,
  onlyIds: string[] | null = null,
): ResultSummary {
  const filter = onlyIds ? new Set(onlyIds) : null;
  const blanks = listBlanks(items).filter((b) => !filter || filter.has(b.id));
  const s: ResultSummary = {
    completedAt: Date.now(),
    total: blanks.length,
    correct: 0,
    incorrect: 0,
    unanswered: 0,
    revealed: 0,
    hintsUsed: 0,
    attempts: 0,
    accuracy: 0,
    retry: Boolean(onlyIds),
  };
  for (const b of blanks) {
    const r = responses[b.id];
    const st = finalStatus(r, b.answer);
    s[st === "correct" ? "correct" : st === "incorrect" ? "incorrect" : st === "revealed" ? "revealed" : "unanswered"]++;
    s.hintsUsed += r?.hints ?? 0;
    s.attempts += r?.attempts ?? 0;
  }
  s.accuracy = s.total ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
  return s;
}

/**
 * Progressive hint. Level 1 shows the first letter of each word and the
 * length of the rest; level 2 additionally reveals every other letter.
 * Spaces, apostrophes and hyphens are always shown.
 */
export function hintFor(answer: string, level: number): string {
  if (level <= 0) return "";
  return answer
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return "   ";
      let letterIdx = 0;
      return Array.from(part)
        .map((ch) => {
          if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
          const i = letterIdx++;
          if (i === 0) return ch;
          if (level >= 2 && i % 2 === 0) return ch;
          return "_";
        })
        .join(" ");
    })
    .join("");
}

export const MAX_HINT_LEVEL = 2;
