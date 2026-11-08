/**
 * Shared domain types for Listenly.
 */

/** How trustworthy a sentence's audio range is. */
export type TimingPrecision =
  /** The sentence maps 1:1 onto a single Whisper segment. */
  | "segment"
  /** The range is the union of Whisper segment(s) that contain the sentence; it may include neighbouring speech. */
  | "approximate"
  /** No valid timestamps — only whole-audio playback is possible. */
  | "none";

export interface Sentence {
  id: string;
  text: string;
  /** Seconds. null when no valid timing exists. */
  start: number | null;
  end: number | null;
  timing: TimingPrecision;
}

/** A raw timed chunk as produced by Whisper (`return_timestamps: true`). */
export interface TranscriptSegment {
  text: string;
  start: number | null;
  end: number | null;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface ExerciseConfig {
  difficulty: Difficulty;
  /** Target share of eligible words to hide, 0–100. */
  percentage: number;
  /** Variation counter — regenerating increments it to produce a different, deterministic selection. */
  variant: number;
}

export type Token =
  | { kind: "text"; value: string }
  | {
      kind: "blank";
      id: string;
      /** The original transcript text for this blank (one word or a short phrase). */
      answer: string;
      wordCount: number;
    };

export interface ExerciseSentence {
  sentenceId: string;
  tokens: Token[];
}

export type BlankStatus = "unanswered" | "correct" | "incorrect" | "revealed";

export interface BlankResponse {
  value: string;
  /** Number of times this blank was checked with a non-empty answer. */
  attempts: number;
  /** Hint level reached (0 = none). */
  hints: number;
  revealed: boolean;
  /** Status as of the last check. "unanswered" until checked. */
  status: BlankStatus;
}

export interface ResultSummary {
  completedAt: number;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  revealed: number;
  hintsUsed: number;
  attempts: number;
  accuracy: number;
  /** True when this run only covered previously-missed blanks. */
  retry: boolean;
}

export type ExerciseStatus = "transcribed" | "ready" | "in-progress" | "completed";

export interface Exercise {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Seconds. */
  duration: number;
  createdAt: number;
  updatedAt: number;
  modelId: string;
  device: string;
  /** Unedited Whisper output, kept for reference. */
  rawTranscript: string;
  sentences: Sentence[];
  /** Whether the audio blob lives in IndexedDB. */
  audioStored: boolean;
  status: ExerciseStatus;
  config: ExerciseConfig | null;
  items: ExerciseSentence[];
  responses: Record<string, BlankResponse>;
  currentIndex: number;
  /** When set, practice is limited to these blank ids (retry mode). */
  retryBlankIds: string[] | null;
  results: ResultSummary[];
}
