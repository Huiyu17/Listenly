"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachSessionAudio, getAudio, getExercise, saveAudio, saveExercise } from "@/lib/storage/db";
import type { Exercise } from "@/lib/types";

/** Load an exercise from IndexedDB and persist every update. */
export function useExercise(id: string) {
  const [exercise, setExerciseState] = useState<Exercise | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef<Exercise | null>(null);

  useEffect(() => {
    let alive = true;
    getExercise(id)
      .then((ex) => {
        if (!alive) return;
        latest.current = ex;
        setExerciseState(ex);
        setState(ex ? "ready" : "missing");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [id]);

  const update = useCallback(async (next: Exercise | ((prev: Exercise) => Exercise)) => {
    const prev = latest.current;
    if (!prev) return null;
    const value = typeof next === "function" ? next(prev) : next;
    latest.current = value;
    setExerciseState(value);
    try {
      await saveExercise(value);
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save progress locally.");
    }
    return value;
  }, []);

  return { exercise, state, update, saveError };
}

/** Resolve the exercise's audio into an object URL, with a re-attach path when it wasn't stored. */
export function useExerciseAudio(exercise: Exercise | null, update: ReturnType<typeof useExercise>["update"]) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!exercise) return;
    let alive = true;
    let created: string | null = null;
    getAudio(exercise.id)
      .then((blob) => {
        if (!alive) return;
        if (blob) {
          created = URL.createObjectURL(blob);
          setUrl(created);
          setStatus("ready");
        } else setStatus("missing");
      })
      .catch(() => alive && setStatus("missing"));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
    // Re-run only when the exercise identity changes, not on every progress save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id]);

  const attach = useCallback(
    async (file: File) => {
      if (!exercise) return;
      attachSessionAudio(exercise.id, file);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      setStatus("ready");
      const stored = await saveAudio(exercise.id, file, file.name);
      if (stored !== exercise.audioStored) await update((ex) => ({ ...ex, audioStored: stored }));
    },
    [exercise, update],
  );

  return { url, status, attach };
}
