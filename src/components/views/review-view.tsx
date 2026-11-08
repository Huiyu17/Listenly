"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Info, Merge, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Steps } from "@/components/steps";
import { AudioPlayer } from "@/components/audio-player";
import { AudioReattach, ExerciseStateView } from "@/components/exercise-shell";
import { useExercise, useExerciseAudio } from "@/hooks/use-exercise";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { formatDuration } from "@/lib/audio/audio";
import { hasAnyTiming } from "@/lib/transcript/segments";
import { countWords } from "@/lib/text/tokenize";
import type { Sentence } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TimingBadge({ s }: { s: Sentence }) {
  if (s.timing === "none" || s.start === null || s.end === null)
    return <Badge variant="outline">No timing</Badge>;
  return (
    <Badge
      variant={s.timing === "segment" ? "blue" : "outline"}
      title={
        s.timing === "segment"
          ? "Timestamps from the Whisper segment for this sentence"
          : "Approximate: this range is the Whisper segment(s) that contain the sentence and may include neighbouring speech"
      }
      className="tabular-nums"
    >
      {s.timing === "approximate" && "≈ "}
      {formatDuration(s.start)}–{formatDuration(s.end)}
    </Badge>
  );
}

export function ReviewView({ id }: { id: string }) {
  const router = useRouter();
  const { exercise, state, update } = useExercise(id);
  const audio = useExerciseAudio(exercise, update);
  const player = useAudioPlayer(audio.url);
  const [draft, setDraft] = useState<Sentence[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exercise && draft === null) setDraft(exercise.sentences);
  }, [exercise, draft]);

  const dirty = useMemo(
    () => !!exercise && !!draft && JSON.stringify(draft) !== JSON.stringify(exercise.sentences),
    [exercise, draft],
  );
  const hasProgress = !!exercise && exercise.items.length > 0;

  // Autosave edits while no exercise has been generated yet (nothing to lose).
  useEffect(() => {
    if (!dirty || hasProgress || !draft) return;
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => void update((ex) => ({ ...ex, sentences: draft })), 700);
    return () => {
      if (autosave.current) clearTimeout(autosave.current);
    };
  }, [draft, dirty, hasProgress, update]);

  if (state !== "ready" || !exercise || !draft) return <ExerciseStateView state={state === "ready" ? "loading" : state} />;

  const timed = hasAnyTiming(draft);
  const words = draft.reduce((n, s) => n + countWords(s.text), 0);
  const empty = draft.filter((s) => !s.text.trim()).length;

  function edit(i: number, text: string) {
    setDraft((d) => d!.map((s, j) => (j === i ? { ...s, text } : s)));
  }
  function remove(i: number) {
    setDraft((d) => d!.filter((_, j) => j !== i));
  }
  function mergeNext(i: number) {
    setDraft((d) => {
      const a = d![i];
      const b = d![i + 1];
      const bothTimed = a.start !== null && a.end !== null && b.start !== null && b.end !== null;
      const merged: Sentence = {
        ...a,
        text: `${a.text.trim()} ${b.text.trim()}`,
        start: bothTimed ? Math.min(a.start!, b.start!) : null,
        end: bothTimed ? Math.max(a.end!, b.end!) : null,
        timing: bothTimed ? "approximate" : "none",
      };
      return [...d!.slice(0, i), merged, ...d!.slice(i + 2)];
    });
  }

  async function confirm() {
    if (!exercise || !draft) return;
    const cleaned = draft.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() })).filter((s) => s.text);
    if (cleaned.length === 0) return;
    const changed = JSON.stringify(cleaned) !== JSON.stringify(exercise.sentences);
    if (changed && hasProgress) {
      const ok = window.confirm(
        "Changing the transcript will regenerate the exercise and clear your current answers. Continue?",
      );
      if (!ok) return;
    }
    await update((ex) =>
      changed
        ? { ...ex, sentences: cleaned, items: [], responses: {}, retryBlankIds: null, status: "transcribed", currentIndex: 0 }
        : ex,
    );
    router.push(`/exercises/${id}/setup`);
  }

  const playingIndex = player.range
    ? draft.findIndex((s) => s.start === player.range!.start && s.end === player.range!.end)
    : -1;

  return (
    <div className="animate-fade-up">
      <Steps
        current="review"
        id={id}
        reachable={exercise.items.length ? ["setup", "practice"] : ["setup"]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Review the transcript</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Whisper can mishear names, numbers and fast speech. Listen and correct anything that&apos;s wrong — the
              exercise is built from exactly what you confirm here.
            </p>
          </div>

          {audio.status === "missing" && <AudioReattach exercise={exercise} onAttach={audio.attach} />}

          {!timed && (
            <p className="flex items-start gap-2 rounded-2xl bg-accent/50 p-4 text-sm text-accent-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              Whisper didn&apos;t return usable timestamps for this recording, so sentence-by-sentence playback isn&apos;t
              available. You can still play and scrub the whole recording.
            </p>
          )}

          <ol className="space-y-3">
            {draft.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "group glass rounded-2xl border border-white/70 p-3 transition-all sm:p-4",
                  playingIndex === i && "ring-2 ring-sky",
                  !s.text.trim() && "ring-2 ring-destructive/40",
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-6 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <TimingBadge s={s} />
                  <div className="ml-auto flex items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                    {s.start !== null && s.end !== null && audio.url && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={playingIndex === i ? "Stop" : `Play sentence ${i + 1}`}
                        onClick={() =>
                          playingIndex === i && player.playing
                            ? (player.pause(), player.clearRange())
                            : player.playRange(s.start!, s.end!)
                        }
                      >
                        {playingIndex === i && player.playing ? <Square /> : <Play />}
                      </Button>
                    )}
                    {i < draft.length - 1 && (
                      <Button variant="ghost" size="icon-sm" aria-label="Merge with next sentence" title="Merge with next" onClick={() => mergeNext(i)}>
                        <Merge />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete sentence ${i + 1}`}
                      title="Delete sentence"
                      onClick={() => remove(i)}
                      className="hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={s.text}
                  onChange={(e) => edit(i, e.target.value)}
                  aria-label={`Sentence ${i + 1}`}
                  spellCheck
                  rows={1}
                  className="border-transparent bg-white/50 font-serif text-[17px] focus-visible:bg-white"
                />
              </li>
            ))}
          </ol>

          <Card>
            <button
              className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold"
              onClick={() => setShowRaw((v) => !v)}
              aria-expanded={showRaw}
            >
              Original Whisper output
              <ChevronDown className={cn("size-4 transition-transform", showRaw && "rotate-180")} />
            </button>
            {showRaw && (
              <div className="space-y-3 px-5 pb-5">
                <p className="text-sm leading-relaxed text-muted-foreground">{exercise.rawTranscript}</p>
                <Button variant="outline" size="sm" onClick={() => setDraft(exercise.sentences)} disabled={!dirty}>
                  <RotateCcw /> Discard unsaved edits
                </Button>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{exercise.title}</CardTitle>
              <CardDescription className="tabular-nums">
                {formatDuration(exercise.duration)} · {draft.length} sentences · {words} words
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {audio.url ? (
                <AudioPlayer
                  api={player}
                  highlight={player.range}
                />
              ) : (
                audio.status === "loading" && <p className="text-sm text-muted-foreground">Loading audio…</p>
              )}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">Model: whisper-tiny.en</Badge>
                <Badge variant="outline" className="uppercase">{exercise.device}</Badge>
              </div>
              {empty > 0 && <p className="text-sm text-destructive">{empty} empty sentence(s) will be removed.</p>}
              <Button size="lg" className="w-full" onClick={confirm} disabled={draft.every((s) => !s.text.trim())}>
                Confirm transcript <ArrowRight />
              </Button>
              <p className="text-xs text-muted-foreground">
                {hasProgress
                  ? dirty
                    ? "You have unsaved edits. Confirming will regenerate the exercise."
                    : "No changes — your existing exercise is kept."
                  : dirty
                    ? "Saving…"
                    : "Edits are saved automatically on this device."}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
