/**
 * Deterministic, rule-based blank selection.
 *
 * This is NOT semantic / LLM analysis. Words are scored with transparent
 * heuristics — an embedded frequency list, stop-word filtering, simple
 * morphology (suffixes) and a list of fixed multiword expressions — and the
 * highest-scoring units are hidden until the requested share of eligible
 * words is reached. A seeded hash breaks ties, so the same transcript +
 * settings + variant always yields the same exercise, and "regenerate" just
 * bumps the variant.
 */
import type { Difficulty, ExerciseConfig, ExerciseSentence, Sentence, Token } from "../types";
import { tokenize, type TokenizedText, type WordToken } from "../text/tokenize";
import {
  COMMON_VERBS,
  FREQUENCY_LIST_SIZE,
  PARTICLES,
  PHRASES,
  STOP_WORDS,
  frequencyRank,
} from "../text/wordlists";

export const DIFFICULTY_PRESETS: Record<Difficulty, { percentage: number; label: string; description: string }> = {
  easy: {
    percentage: 15,
    label: "Easy",
    description: "About 15% of eligible words, focused on common content words.",
  },
  medium: {
    percentage: 30,
    label: "Medium",
    description: "About 30% — verbs, adverbs, useful vocabulary and short phrases.",
  },
  hard: {
    percentage: 45,
    label: "Hard",
    description: "About 45% — less common vocabulary and multiword expressions.",
  },
};

export const MIN_PERCENTAGE = 5;
export const MAX_PERCENTAGE = 80;

const ADVERBS = new Set(
  `always never often sometimes usually really actually probably maybe perhaps already
   almost enough quite rather pretty together soon later away instead anyway seldom
   rarely hardly abroad ahead indoors outdoors nowhere somewhere everywhere anywhere`
    .split(/\s+/)
    .filter(Boolean),
);

interface Candidate {
  sentence: number;
  /** First word index (inclusive). */
  from: number;
  /** Last word index (exclusive). */
  to: number;
  /** How many eligible words this unit hides — counts toward the target. */
  weight: number;
  score: number;
  phrase: boolean;
}

interface Analyzed {
  sentence: Sentence;
  tok: TokenizedText;
  eligible: boolean[];
}

/** FNV-1a → [0, 1). */
export function hashUnit(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

function isNumberWord(w: WordToken) {
  return /^\p{N}/u.test(w.value);
}

function isProperNoun(w: WordToken, isFirst: boolean, prevSep: string) {
  if (!/^\p{Lu}/u.test(w.value) || w.lower === "i" || w.lower.startsWith("i'")) return false;
  // Sentence-initial or after a colon / quote: capitalisation is not informative.
  if (isFirst || /[:"“]\s*$/.test(prevSep)) return false;
  return true;
}

/** A word may be blanked on its own when it is not a function word. */
export function isEligibleWord(w: WordToken): boolean {
  if (STOP_WORDS.has(w.lower)) return false;
  if (isNumberWord(w)) return true;
  return w.lower.replace(/['-]/g, "").length >= 2;
}

function analyze(sentences: Sentence[]): Analyzed[] {
  return sentences.map((sentence) => {
    const tok = tokenize(sentence.text);
    return { sentence, tok, eligible: tok.words.map(isEligibleWord) };
  });
}

/** Total number of eligible words — the base the blank percentage is applied to. */
export function countEligibleWords(sentences: Sentence[]): number {
  return analyze(sentences).reduce((n, a) => n + a.eligible.filter(Boolean).length, 0);
}

function wordScore(
  w: WordToken,
  difficulty: Difficulty,
  proper: boolean,
): number | null {
  const rank = frequencyRank(w.lower);
  const commonness = rank === null ? 0 : 1 - rank / FREQUENCY_LIST_SIZE;
  const len = w.lower.replace(/['-]/g, "").length;
  const number = isNumberWord(w);
  const verb = COMMON_VERBS.has(w.lower) || (len > 4 && /(?:ed|ing)$/.test(w.lower));
  const adverb = ADVERBS.has(w.lower) || (len > 4 && w.lower.endsWith("ly"));

  switch (difficulty) {
    case "easy": {
      if (proper) return null;
      let s = rank !== null ? 0.6 + 0.4 * commonness : 0.15;
      if (len >= 3 && len <= 7) s += 0.2;
      if (len > 9) s -= 0.3;
      if (number) s -= 0.3;
      return s;
    }
    case "medium": {
      if (proper) return null;
      let s = 0.3;
      if (verb) s += 0.45;
      if (adverb) s += 0.4;
      if (rank !== null && commonness < 0.85) s += 0.25;
      if (rank === null && len >= 5) s += 0.3;
      if (number) s += 0.1;
      return s;
    }
    case "hard": {
      let s = 0.2 + (rank === null ? 0.6 : 0.6 * (1 - commonness));
      s += (Math.min(len, 12) / 12) * 0.4;
      if (verb) s += 0.1;
      if (adverb) s += 0.1;
      if (number) s += 0.3;
      if (proper) s -= 0.2;
      return s;
    }
  }
}

const PHRASE_TOKENS = PHRASES.map((p) => p.split(" "));

/** Fixed phrases and verb+particle combinations within one sentence. */
function phraseCandidates(a: Analyzed, difficulty: Difficulty): Omit<Candidate, "sentence" | "score">[] {
  if (difficulty === "easy") return [];
  const { words, separators } = a.tok;
  const out: Omit<Candidate, "sentence" | "score">[] = [];
  const maxLen = difficulty === "medium" ? 3 : 5;
  // Words in a phrase must be separated by plain whitespace only.
  const joinable = (i: number) => /^\s+$/.test(separators[i]);

  for (let i = 0; i < words.length; i++) {
    for (const p of PHRASE_TOKENS) {
      if (p.length > maxLen || i + p.length > words.length) continue;
      let ok = true;
      for (let k = 0; k < p.length && ok; k++) {
        if (words[i + k].lower !== p[k]) ok = false;
        if (k > 0 && !joinable(i + k)) ok = false;
      }
      if (ok) out.push({ from: i, to: i + p.length, weight: 0, phrase: true });
    }
    // phrasal verb: common verb + particle
    if (
      i + 1 < words.length &&
      COMMON_VERBS.has(words[i].lower) &&
      PARTICLES.has(words[i + 1].lower) &&
      joinable(i + 1)
    ) {
      out.push({ from: i, to: i + 2, weight: 0, phrase: true });
    }
  }
  for (const c of out) {
    let w = 0;
    for (let k = c.from; k < c.to; k++) if (a.eligible[k]) w++;
    c.weight = Math.max(1, w);
  }
  return out;
}

export function generateExercise(sentences: Sentence[], config: ExerciseConfig): ExerciseSentence[] {
  const analyzed = analyze(sentences);
  const percentage = Math.min(MAX_PERCENTAGE, Math.max(MIN_PERCENTAGE, config.percentage));
  const totalEligible = analyzed.reduce((n, a) => n + a.eligible.filter(Boolean).length, 0);
  const target = totalEligible === 0 ? 0 : Math.max(1, Math.round((totalEligible * percentage) / 100));

  const seedBase = `${config.difficulty}|${config.variant}`;
  const candidates: Candidate[] = [];

  analyzed.forEach((a, si) => {
    const { words, separators } = a.tok;
    words.forEach((w, wi) => {
      if (!a.eligible[wi]) return;
      const proper = isProperNoun(w, wi === 0, separators[wi]);
      const base = wordScore(w, config.difficulty, proper);
      if (base === null) return;
      const jitter = hashUnit(`${seedBase}|${a.sentence.text}|${wi}|${w.lower}`);
      candidates.push({ sentence: si, from: wi, to: wi + 1, weight: 1, score: base + jitter * 0.35, phrase: false });
    });
    for (const p of phraseCandidates(a, config.difficulty)) {
      const jitter = hashUnit(`${seedBase}|${a.sentence.text}|p${p.from}-${p.to}`);
      const base = config.difficulty === "medium" ? 0.8 : 0.9 + 0.05 * (p.to - p.from);
      candidates.push({ ...p, sentence: si, score: base + jitter * 0.35 });
    }
  });

  candidates.sort((x, y) => y.score - x.score || x.sentence - y.sentence || x.from - y.from);

  // Per-sentence cap keeps blanks spread across the transcript.
  const caps = analyzed.map((a) => {
    const n = a.eligible.filter(Boolean).length;
    return Math.max(1, Math.ceil(n * Math.min(0.85, (percentage / 100) * 1.6)));
  });

  const used = analyzed.map((a) => new Array<boolean>(a.tok.words.length).fill(false));
  const perSentence = analyzed.map(() => 0);
  const chosen: Candidate[] = [];
  let hidden = 0;

  const tryPick = (c: Candidate, allowAdjacent: boolean, ignoreCap: boolean) => {
    if (hidden >= target) return;
    const u = used[c.sentence];
    for (let k = c.from; k < c.to; k++) if (u[k]) return;
    if (!allowAdjacent && (u[c.from - 1] || u[c.to])) return;
    if (!ignoreCap && perSentence[c.sentence] + c.weight > caps[c.sentence]) return;
    // Do not overshoot the target with a multi-word unit.
    if (hidden + c.weight > target && c.weight > 1) return;
    for (let k = c.from; k < c.to; k++) u[k] = true;
    perSentence[c.sentence] += c.weight;
    hidden += c.weight;
    chosen.push(c);
  };

  // Pass 1: strict spacing + caps. Pass 2: allow adjacency. Pass 3: ignore caps.
  for (const c of candidates) tryPick(c, false, false);
  if (hidden < target) for (const c of candidates) tryPick(c, true, false);
  if (hidden < target) for (const c of candidates) tryPick(c, true, true);

  return analyzed.map((a, si) => buildTokens(a, chosen.filter((c) => c.sentence === si)));
}

function buildTokens(a: Analyzed, chosen: Candidate[]): ExerciseSentence {
  const { words, separators, source } = a.tok;
  const byStart = new Map(chosen.map((c) => [c.from, c]));
  const tokens: Token[] = [];
  let text = "";
  const flush = () => {
    if (text) tokens.push({ kind: "text", value: text });
    text = "";
  };

  let i = 0;
  while (i < words.length) {
    text += separators[i];
    const c = byStart.get(i);
    if (c) {
      flush();
      tokens.push({
        kind: "blank",
        id: `${a.sentence.id}:${c.from}`,
        answer: source.slice(words[c.from].start, words[c.to - 1].end),
        wordCount: c.to - c.from,
      });
      i = c.to;
    } else {
      text += words[i].value;
      i++;
    }
  }
  text += separators[words.length];
  flush();
  return { sentenceId: a.sentence.id, tokens };
}

/** All blank tokens across an exercise, in order. */
export function listBlanks(items: ExerciseSentence[]) {
  const out: { id: string; answer: string; wordCount: number; sentenceId: string; sentenceIndex: number }[] = [];
  items.forEach((it, sentenceIndex) => {
    for (const t of it.tokens) {
      if (t.kind === "blank") out.push({ id: t.id, answer: t.answer, wordCount: t.wordCount, sentenceId: it.sentenceId, sentenceIndex });
    }
  });
  return out;
}

/** Reconstruct the sentence text from tokens (always equals the original). */
export function tokensToText(tokens: Token[]): string {
  return tokens.map((t) => (t.kind === "text" ? t.value : t.answer)).join("");
}
