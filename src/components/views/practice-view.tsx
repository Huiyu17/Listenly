"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Flag,
  Keyboard,
  Lightbulb,
  Repeat,
  Repeat1,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Steps } from "@/components/steps";
import { AudioPlayer } from "@/components/audio-player";
import { AudioReattach, ExerciseStateView } from "@/components/exercise-shell";
import { TimingBadge } from "@/components/views/review-view";
import { useExercise, useExerciseAudio } from "@/hooks/use-exercise";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import {
  MAX_HINT_LEVEL,
  checkResponse,
  emptyResponse,
  hintFor,
  isCloseMiss,
  revealResponse,
} from "@/lib/exercise/grade";
import { finishExercise, practiceSentenceIndices } from "@/lib/exercise/session";
import type { BlankResponse, Exercise, Token } from "@/lib/types";
import { cn } from "@/lib/utils";

type BlankToken = Extract<Token, { kind: "blank" }>;

export function PracticeView({ id }: { id: string }) {
  const router = useRouter();
  const { exercise, state, update, saveError } = useExercise(id);
  const audio = useExerciseAudio(exercise, update);
  const player = useAudioPlayer(audio.url);
  const [focusedBlank, setFocusedBlank] = useState<string | null>(null);
  const [shake, setShake] = useState<Record<string, number>>({});
  const [loop, setLoop] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const lastAutoPlayed = useRef<string | null>(null);

  const order = useMemo(() => (exercise ? practiceSentenceIndices(exercise) : []), [exercise]);
  const pos = exercise ? Math.min(exercise.currentIndex, Math.max(0, order.length - 1)) : 0;
  const itemIndex = order[pos] ?? 0;
  const item = exercise?.items[itemIndex];
  const sentence = exercise?.sentences.find((s) => s.id === item?.sentenceId);
  const retryIds = useMemo(() => (exercise?.retryBlankIds ? new Set(exercise.retryBlankIds) : null), [exercise?.retryBlankIds]);

  const isActiveBlank = useCallback((id: string) => !retryIds || retryIds.has(id), [retryIds]);
  const blanks = useMemo(
    () => (item ? item.tokens.filter((t): t is BlankToken => t.kind === "blank" && isActiveBlank(t.id)) : []),
    [item, isActiveBlank],
  );
  const timed = sentence && sentence.start !== null && sentence.end !== null;

  const allActive = useMemo(() => {
    if (!exercise) return [];
    return order.flatMap((i) =>
      exercise.items[i].tokens.filter((t): t is BlankToken => t.kind === "blank" && isActiveBlank(t.id)),
    );
  }, [exercise, order, isActiveBlank]);
  const resolved = exercise
    ? allActive.filter((b) => ["correct", "revealed"].includes(exercise.responses[b.id]?.status)).length
    : 0;
  const attempted = exercise ? allActive.filter((b) => exercise.responses[b.id]?.value.trim()).length : 0;

  const resp = useCallback(
    (id: string): BlankResponse => exercise?.responses[id] ?? emptyResponse(),
    [exercise],
  );

  const setResponses = useCallback(
    (fn: (r: Exercise["responses"]) => Exercise["responses"]) =>
      update((ex) => ({
        ...ex,
        responses: fn(ex.responses),
        status: ex.status === "completed" && !ex.retryBlankIds ? "completed" : "in-progress",
      })),
    [update],
  );

  const playSentence = useCallback(() => {
    if (sentence && sentence.start !== null && sentence.end !== null) player.playRange(sentence.start, sentence.end, loop);
  }, [sentence, player, loop]);

  // Auto-play the sentence when it becomes current (after a user navigation).
  useEffect(() => {
    if (!sentence || !audio.url || !timed) return;
    if (lastAutoPlayed.current === null) {
      lastAutoPlayed.current = sentence.id; // don't autoplay on first page load
      return;
    }
    if (lastAutoPlayed.current !== sentence.id) {
      lastAutoPlayed.current = sentence.id;
      playSentence();
    }
  }, [sentence, audio.url, timed, playSentence]);

  // Focus the first open blank when the sentence changes.
  useEffect(() => {
    if (!blanks.length) return;
    const first = blanks.find((b) => !["correct", "revealed"].includes(resp(b.id).status)) ?? blanks[0];
    const t = setTimeout(() => inputs.current.get(first.id)?.focus(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.sentenceId]);

  const goTo = useCallback(
    (p: number) => {
      if (!exercise) return;
      const next = Math.max(0, Math.min(order.length - 1, p));
      void update((ex) => ({ ...ex, currentIndex: next }));
    },
    [exercise, order.length, update],
  );

  const check = useCallback(() => {
    if (!exercise) return;
    let allGood = true;
    const wrong: string[] = [];
    const next = { ...exercise.responses };
    for (const b of blanks) {
      const r = checkResponse(next[b.id] ?? emptyResponse(), b.answer);
      next[b.id] = r;
      if (r.status !== "correct" && r.status !== "revealed") allGood = false;
      if (r.status === "incorrect") wrong.push(b.id);
    }
    void setResponses(() => next);
    if (wrong.length) {
      setShake((s) => Object.fromEntries([...Object.entries(s), ...wrong.map((w) => [w, (s[w] ?? 0) + 1])]));
      inputs.current.get(wrong[0])?.focus();
      inputs.current.get(wrong[0])?.select();
    } else if (!allGood) {
      const firstEmpty = blanks.find((b) => next[b.id].status === "unanswered");
      if (firstEmpty) inputs.current.get(firstEmpty.id)?.focus();
    }
    return allGood;
  }, [exercise, blanks, setResponses]);

  const hint = useCallback(() => {
    const target =
      blanks.find((b) => b.id === focusedBlank && !["correct", "revealed"].includes(resp(b.id).status)) ??
      blanks.find((b) => !["correct", "revealed"].includes(resp(b.id).status));
    if (!target) return;
    void setResponses((rs) => {
      const r = rs[target.id] ?? emptyResponse();
      return { ...rs, [target.id]: { ...r, hints: Math.min(MAX_HINT_LEVEL, r.hints + 1) } };
    });
    inputs.current.get(target.id)?.focus();
  }, [blanks, focusedBlank, resp, setResponses]);

  const reveal = useCallback(() => {
    void setResponses((rs) => {
      const next = { ...rs };
      for (const b of blanks) {
        const r = next[b.id] ?? emptyResponse();
        if (r.status !== "correct") next[b.id] = revealResponse(r);
      }
      return next;
    });
  }, [blanks, setResponses]);

  const finish = useCallback(async () => {
    if (!exercise) return;
    const open = allActive.filter((b) => !exercise.responses[b.id]?.value.trim() && !exercise.responses[b.id]?.revealed).length;
    if (open > 0 && !window.confirm(`${open} blank${open > 1 ? "s are" : " is"} still empty. Submit anyway?`)) return;
    player.pause();
    await update((ex) => {
      // Grade everything that was typed but never checked, so attempts reflect the submission.
      const responses = { ...ex.responses };
      for (const b of allActive) {
        const r = responses[b.id] ?? emptyResponse();
        if (r.status === "unanswered" && r.value.trim()) responses[b.id] = checkResponse(r, b.answer);
      }
      return finishExercise({ ...ex, responses });
    });
    router.push(`/exercises/${id}/results`);
  }, [exercise, allActive, update, router, id, player]);

  const isLast = pos >= order.length - 1;
  const sentenceDone = blanks.every((b) => ["correct", "revealed"].includes(resp(b.id).status));

  // Global keyboard shortcuts (Alt+key so they never collide with typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const map: Record<string, () => void> = {
        KeyK: player.toggle,
        KeyJ: () => player.skip(-5),
        KeyL: () => player.skip(5),
        KeyR: playSentence,
        KeyH: hint,
        KeyN: () => goTo(pos + 1),
        KeyP: () => goTo(pos - 1),
      };
      const fn = map[e.code];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, playSentence, hint, goTo, pos]);

  if (state !== "ready" || !exercise) return <ExerciseStateView state={state === "ready" ? "loading" : state} />;
  if (!exercise.items.length || !item || !sentence) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="font-serif text-xl">No exercise generated yet</p>
        <Button className="mt-6" onClick={() => router.push(`/exercises/${id}/setup`)}>
          Go to setup
        </Button>
      </Card>
    );
  }

  return (
    <div className="animate-fade-up">
      <Steps current="practice" id={id} reachable={["review", "setup", ...(exercise.results.length ? (["results"] as const) : [])]} />

      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {exercise.retryBlankIds ? "Retry missed blanks" : `${exercise.config?.difficulty} · ${exercise.config?.percentage}%`}
            </p>
            <h1 className="font-serif text-2xl tracking-tight sm:text-3xl">{exercise.title}</h1>
          </div>
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            Sentence <span className="font-semibold text-foreground">{pos + 1}</span> of {order.length} · {resolved}/
            {allActive.length} solved
          </div>
        </div>
        <Progress value={allActive.length ? (resolved / allActive.length) * 100 : 0} aria-label="Exercise progress" />

        {audio.status === "missing" && <AudioReattach exercise={exercise} onAttach={audio.attach} />}

        <Card className="sticky top-2 z-10">
          <CardContent className="p-4 sm:p-5">
            {audio.url ? (
              <AudioPlayer api={player} highlight={timed ? { start: sentence.start!, end: sentence.end! } : null}>
                {timed ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={playSentence} title="Play this sentence (Alt+R)">
                      <Repeat1 /> Sentence
                    </Button>
                    <Button
                      variant={loop ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        const v = !loop;
                        setLoop(v);
                        if (v && sentence.start !== null && sentence.end !== null) player.playRange(sentence.start, sentence.end, true);
                        else player.clearRange();
                      }}
                      aria-pressed={loop}
                      title="Loop this sentence"
                    >
                      <Repeat /> Loop
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Whole-audio playback (no sentence timing)</span>
                )}
              </AudioPlayer>
            ) : (
              <p className="text-sm text-muted-foreground">{audio.status === "loading" ? "Loading audio…" : "Audio unavailable."}</p>
            )}
          </CardContent>
        </Card>

        <Card key={item.sentenceId} className="animate-fade-up">
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2">
              <TimingBadge s={sentence} />
              {sentence.timing === "approximate" && (
                <span className="text-xs text-muted-foreground">Segment may include nearby speech</span>
              )}
              {blanks.length === 0 && <Badge variant="outline">No blanks — just listen</Badge>}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const ok = check();
                if (ok && sentenceDone && !isLast) goTo(pos + 1);
              }}
              className="font-serif text-[1.35rem] leading-[2.6] sm:text-[1.6rem]"
            >
              {item.tokens.map((t, i) =>
                t.kind === "text" ? (
                  <span key={i} className="whitespace-pre-wrap">
                    {t.value}
                  </span>
                ) : isActiveBlank(t.id) ? (
                  <BlankInput
                    key={t.id}
                    token={t}
                    response={resp(t.id)}
                    shake={shake[t.id] ?? 0}
                    inputRef={(el) => {
                      if (el) inputs.current.set(t.id, el);
                      else inputs.current.delete(t.id);
                    }}
                    onFocus={() => setFocusedBlank(t.id)}
                    onChange={(value) =>
                      void setResponses((rs) => {
                        const r = rs[t.id] ?? emptyResponse();
                        if (r.revealed || r.status === "correct") return rs;
                        return { ...rs, [t.id]: { ...r, value, status: "unanswered" } };
                      })
                    }
                  />
                ) : (
                  <span key={t.id} className="text-muted-foreground/90 underline decoration-success/50 decoration-2 underline-offset-8">
                    {t.answer}
                  </span>
                ),
              )}
              <button type="submit" className="sr-only">
                Check answers
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-5">
              <Button onClick={() => check()} disabled={!blanks.length || sentenceDone}>
                <Check /> Check
              </Button>
              <Button variant="outline" onClick={hint} disabled={!blanks.length || sentenceDone} title="Hint for the focused blank (Alt+H)">
                <Lightbulb /> Hint
              </Button>
              <Button variant="ghost" onClick={reveal} disabled={!blanks.length || sentenceDone}>
                <Eye /> Show answer
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => goTo(pos - 1)} disabled={pos === 0} aria-label="Previous sentence" title="Previous (Alt+P)">
                  <ArrowLeft />
                </Button>
                {isLast ? (
                  <Button onClick={finish} variant={sentenceDone ? "default" : "secondary"}>
                    <Flag /> Finish
                  </Button>
                ) : (
                  <Button variant={sentenceDone ? "default" : "secondary"} onClick={() => goTo(pos + 1)} title="Next sentence (Alt+N)">
                    Next sentence <ArrowRight />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => setShowKeys((v) => !v)}>
            <Keyboard className="size-4" /> Keyboard shortcuts
          </button>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">{attempted} answered</span>
            {!isLast && (
              <Button variant="link" size="sm" onClick={finish}>
                Submit all now
              </Button>
            )}
          </div>
        </div>
        {showKeys && (
          <Card className="p-5 text-sm">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                ["Enter", "Check sentence (again to continue)"],
                ["Tab / Shift+Tab", "Next / previous blank"],
                ["Alt+K", "Play / pause"],
                ["Alt+J / Alt+L", "Back / forward 5 s"],
                ["Alt+R", "Replay sentence"],
                ["Alt+H", "Hint"],
                ["Alt+N / Alt+P", "Next / previous sentence"],
              ].map(([k, d]) => (
                <li key={k} className="flex items-center gap-3">
                  <kbd className="rounded-md bg-white px-2 py-0.5 font-sans text-xs font-semibold ring-1 ring-border">{k}</kbd>
                  <span className="text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {saveError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <Info className="size-4" /> Progress could not be saved: {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

function BlankInput({
  token,
  response,
  shake,
  inputRef,
  onFocus,
  onChange,
}: {
  token: BlankToken;
  response: BlankResponse;
  shake: number;
  inputRef: (el: HTMLInputElement | null) => void;
  onFocus: () => void;
  onChange: (v: string) => void;
}) {
  const st = response.status;
  const locked = st === "correct" || st === "revealed";
  const value = st === "revealed" ? token.answer : response.value;
  const width = Math.max(3, token.answer.length, value.length) + 1.5;
  const close = st === "incorrect" && isCloseMiss(response.value, token.answer);
  const hint = !locked && response.hints > 0 ? hintFor(token.answer, response.hints) : null;
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!shake) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 520);
    return () => clearTimeout(t);
  }, [shake]);

  return (
    <span className="relative mx-0.5 inline-flex flex-col align-baseline">
      <input
        ref={inputRef}
        value={value}
        readOnly={locked}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Blank, ${token.wordCount > 1 ? `${token.wordCount} words` : "one word"}`}
        aria-invalid={st === "incorrect"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{ width: `${width * 0.62}em` }}
        className={cn(
          "h-[1.6em] rounded-lg border-b-2 bg-white/75 px-1.5 text-center font-sans text-[0.8em] font-medium leading-none outline-none transition-all duration-200",
          "border-lavender focus:border-primary focus:bg-white focus:shadow-[0_6px_18px_-10px_var(--primary)]",
          st === "correct" && "border-success bg-success/10 text-success",
          st === "incorrect" && "border-destructive bg-destructive/8 text-destructive",
          st === "revealed" && "border-sky bg-accent/70 text-accent-foreground",
          shaking && "animate-shake",
        )}
      />
      {(hint || close) && (
        <span
          className={cn(
            "pointer-events-none absolute top-full left-1/2 mt-[-0.35em] -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 font-sans text-[0.5em] leading-normal font-semibold",
            close ? "bg-warning/15 text-[oklch(0.45_0.09_65)]" : "bg-secondary text-secondary-foreground",
          )}
        >
          {close ? "Almost — check spelling" : hint}
        </span>
      )}
    </span>
  );
}
