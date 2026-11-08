/**
 * Tokenization helpers shared by sentence splitting, blank generation and grading.
 *
 * A "word" is a run of letters/digits that may contain internal apostrophes or
 * hyphens ("don't", "well-known"), or a number with internal separators
 * ("3.5", "1,000", "10:30"). Everything between words — spaces and
 * punctuation — is kept verbatim as separator text so the original transcript
 * can always be reconstructed exactly.
 */

export interface WordToken {
  /** Index among word tokens only. */
  index: number;
  value: string;
  /** Lower-cased, apostrophe-normalised form used for lookups. */
  lower: string;
  /** Char offset in the source string. */
  start: number;
  end: number;
}

export interface TokenizedText {
  source: string;
  words: WordToken[];
  /** separators[i] is the text before words[i]; separators[words.length] is the trailing text. */
  separators: string[];
}

const WORD_RE = /\p{N}+(?:[.,:]\p{N}+)*|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function normalizeApostrophes(s: string): string {
  return s.replace(/[‘’ʼ`´]/g, "'");
}

export function tokenize(source: string): TokenizedText {
  const words: WordToken[] = [];
  const separators: string[] = [];
  let cursor = 0;
  for (const match of source.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    const value = match[0];
    separators.push(source.slice(cursor, start));
    words.push({
      index: words.length,
      value,
      lower: normalizeApostrophes(value).toLowerCase(),
      start,
      end: start + value.length,
    });
    cursor = start + value.length;
  }
  separators.push(source.slice(cursor));
  return { source, words, separators };
}

export function countWords(source: string): number {
  return tokenize(source).words.length;
}
