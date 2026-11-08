/** Pure helpers for creating and evolving Exercise records. */
import type { Exercise, ExerciseConfig, Sentence } from "../types";
import { generateExercise, listBlanks } from "./generate";
import { emptyResponse, finalStatus, summarize } from "./grade";

export function createExercise(input: {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number;
  modelId: string;
  device: string;
  rawTranscript: string;
  sentences: Sentence[];
  audioStored: boolean;
}): Exercise {
  const now = Date.now();
  return {
    ...input,
    title: input.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled recording",
    createdAt: now,
    updatedAt: now,
    status: "transcribed",
    config: null,
    items: [],
    responses: {},
    currentIndex: 0,
    retryBlankIds: null,
    results: [],
  };
}

/** (Re)generate blanks. Resets all responses — answers belong to a specific blank layout. */
export function applyConfig(ex: Exercise, config: ExerciseConfig): Exercise {
  const items = generateExercise(ex.sentences, config);
  const responses: Exercise["responses"] = {};
  for (const b of listBlanks(items)) responses[b.id] = emptyResponse();
  return { ...ex, config, items, responses, currentIndex: 0, retryBlankIds: null, status: "ready" };
}

/** Indices of sentences that are part of the current practice run. */
export function practiceSentenceIndices(ex: Exercise): number[] {
  if (!ex.retryBlankIds) return ex.items.map((_, i) => i);
  const ids = new Set(ex.retryBlankIds);
  return ex.items
    .map((it, i) => (it.tokens.some((t) => t.kind === "blank" && ids.has(t.id)) ? i : -1))
    .filter((i) => i >= 0);
}

export function finishExercise(ex: Exercise): Exercise {
  const summary = summarize(ex.items, ex.responses, ex.retryBlankIds);
  return { ...ex, status: "completed", results: [...ex.results, summary] };
}

/** Start a retry run limited to blanks that are not currently correct. */
export function startRetry(ex: Exercise): Exercise {
  const missed = listBlanks(ex.items)
    .filter((b) => finalStatus(ex.responses[b.id], b.answer) !== "correct")
    .map((b) => b.id);
  const responses = { ...ex.responses };
  for (const id of missed) responses[id] = emptyResponse();
  return { ...ex, responses, retryBlankIds: missed, currentIndex: 0, status: "in-progress" };
}
