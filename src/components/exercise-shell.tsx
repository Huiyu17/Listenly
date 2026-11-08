"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, CloudOff, FileAudio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACCEPT_ATTR, formatDuration, probeDuration, validateFile } from "@/lib/audio/audio";
import type { Exercise } from "@/lib/types";

export function ExerciseStateView({ state }: { state: "loading" | "missing" | "error" }) {
  if (state === "loading")
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Loading exercise…
      </div>
    );
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <AlertCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-serif text-xl">
        {state === "missing" ? "Exercise not found" : "Could not open local storage"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {state === "missing"
          ? "It may have been deleted, or it was created in another browser or a private window."
          : "Your browser blocked IndexedDB access. Check your privacy settings and try again."}
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </Card>
  );
}

/** Shown when the exercise's audio is not stored locally and must be uploaded again. */
export function AudioReattach({ exercise, onAttach }: { exercise: Exercise; onAttach: (f: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    setWarning(null);
    try {
      validateFile(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const d = await probeDuration(url);
      if (Math.abs(d - exercise.duration) > 1.5) {
        setWarning(
          `Heads up: this file is ${formatDuration(d)} but the original was ${formatDuration(exercise.duration)}. Timings may not line up.`,
        );
      }
    } catch {
      /* duration unknown — accept anyway */
    } finally {
      URL.revokeObjectURL(url);
    }
    await onAttach(file);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-warning/10 p-4 ring-1 ring-warning/30 sm:flex-row sm:items-center">
      <CloudOff className="size-5 shrink-0 text-[oklch(0.5_0.1_65)]" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Audio needs to be uploaded again</p>
        <p className="text-foreground/70">
          Your transcript and progress are saved, but the browser didn&apos;t have room to keep “{exercise.fileName}”.
          Select the same file to keep listening.
        </p>
        {error && <p className="mt-1 text-destructive">{error}</p>}
        {warning && <p className="mt-1 text-[oklch(0.45_0.09_65)]">{warning}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <FileAudio /> Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
    </div>
  );
}
