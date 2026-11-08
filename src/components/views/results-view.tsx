"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Pause, Play, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Steps } from "@/components/steps";
import { AudioPlayer } from "@/components/audio-player";
import { AudioReattach, ExerciseStateView } from "@/components/exercise-shell";
import { TimingBadge } from "@/components/views/review-view";
import { useExercise, useExerciseAudio } from "@/hooks/use-exercise";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { finalStatus, summarize } from "@/lib/exercise/grade";
import { startRetry } from "@/lib/exercise/session";
import { tokensToText } from "@/lib/exercise/generate";
import type { BlankStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

function AccuracyRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--lavender)" />
            <stop offset="55%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--sky)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--secondary)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-4xl tabular-nums">{Math.round(value)}%</span>
        <span className="text-xs text-muted-foreground">accuracy</span>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<BlankStatus, string> = {
  correct: "bg-success/12 text-success",
  incorrect: "bg-destructive/10 text-destructive",
  revealed: "bg-accent text-accent-foreground",
  unanswered: "bg-warning/15 text-[oklch(0.45_0.09_65)]",
};

export function ResultsView({ id }: { id: string }) {
  const router = useRouter();
  const { exercise, state, update } = useExercise(id);
  const audio = useExerciseAudio(exercise, update);
  const player = useAudioPlayer(audio.url);

  const overall = useMemo(() => (exercise ? summarize(exercise.items, exercise.responses) : null), [exercise]);
  const mistakes = useMemo(() => {
    if (!exercise) return [];
    return exercise.items
      .map((it) => {
        const sentence = exercise.sentences.find((s) => s.id === it.sentenceId)!;
        const blanks = it.tokens.flatMap((t) =>
          t.kind === "blank" ? [{ ...t, response: exercise.responses[t.id], status: finalStatus(exercise.responses[t.id], t.answer) }] : [],
        );
        return { it, sentence, blanks, missed: blanks.filter((b) => b.status !== "correct") };
      })
      .filter((m) => m.missed.length > 0);
  }, [exercise]);

  if (state !== "ready" || !exercise || !overall) return <ExerciseStateView state={state === "ready" ? "loading" : state} />;

  const last = exercise.results.at(-1);
  const history = exercise.results.slice(-6);

  async function retry() {
    if (!exercise) return;
    await update(startRetry(exercise));
    router.push(`/exercises/${id}/practice`);
  }

  const message =
    overall.accuracy >= 90
      ? "Outstanding listening."
      : overall.accuracy >= 70
        ? "Great work — a few details to polish."
        : overall.accuracy >= 40
          ? "Solid effort. Replay the tricky parts below."
          : "Every replay trains your ear. Try the missed blanks again.";

  return (
    <div className="animate-fade-up">
      <Steps current="results" id={id} reachable={["review", "setup", "practice"]} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
              <AccuracyRing value={overall.accuracy} />
              <div className="flex-1 space-y-4 text-center sm:text-left">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="size-3.5" /> {exercise.title}
                  </p>
                  <h1 className="mt-1 font-serif text-3xl tracking-tight">{message}</h1>
                  <p className="mt-1 text-muted-foreground tabular-nums">
                    {overall.correct} of {overall.total} blanks correct
                    {last?.retry && ` · last retry: ${last.correct}/${last.total}`}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(
                    [
                      ["Correct", overall.correct, "text-success"],
                      ["Wrong", overall.incorrect, "text-destructive"],
                      ["Revealed", overall.revealed, "text-accent-foreground"],
                      ["Empty", overall.unanswered, "text-[oklch(0.5_0.1_65)]"],
                      ["Hints", overall.hintsUsed, "text-secondary-foreground"],
                    ] as const
                  ).map(([k, v, cls]) => (
                    <div key={k} className="rounded-2xl bg-white/60 px-3 py-2 ring-1 ring-border/60">
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className={cn("font-serif text-xl tabular-nums", cls)}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl tracking-tight">
              {mistakes.length ? "Review your mistakes" : "No mistakes to review 🎉"}
            </h2>
            {mistakes.map(({ it, sentence, blanks, missed }) => {
              const canReplay = sentence.start !== null && sentence.end !== null && audio.url;
              const playing =
                player.playing && player.range?.start === sentence.start && player.range?.end === sentence.end;
              return (
                <Card key={it.sentenceId}>
                  <CardContent className="space-y-4 p-5 sm:p-6">
                    <div className="flex items-center gap-2">
                      <TimingBadge s={sentence} />
                      <span className="text-xs text-muted-foreground">
                        {missed.length} of {blanks.length} missed
                      </span>
                      {canReplay && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="ml-auto"
                          onClick={() => (playing ? player.pause() : player.playRange(sentence.start!, sentence.end!))}
                        >
                          {playing ? <Pause /> : <Play />} Replay
                        </Button>
                      )}
                    </div>
                    <p className="font-serif text-lg leading-loose">
                      {it.tokens.map((t, i) => {
                        if (t.kind === "text") return <span key={i}>{t.value}</span>;
                        const st = finalStatus(exercise.responses[t.id], t.answer);
                        return (
                          <mark key={t.id} className={cn("rounded-md px-1 py-0.5", STATUS_STYLE[st])}>
                            {t.answer}
                          </mark>
                        );
                      })}
                    </p>
                    <ul className="divide-y divide-border/60 rounded-2xl bg-white/50 text-sm ring-1 ring-border/50">
                      {missed.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                          <Badge className={cn("capitalize", STATUS_STYLE[b.status])}>{b.status}</Badge>
                          <span className="text-muted-foreground">
                            You wrote{" "}
                            {b.response?.value.trim() && !b.response.revealed ? (
                              <span className="font-semibold text-destructive line-through decoration-1">{b.response.value}</span>
                            ) : (
                              <em>nothing</em>
                            )}
                          </span>
                          <span>
                            → <span className="font-semibold text-success">{b.answer}</span>
                          </span>
                          {(b.response?.hints ?? 0) > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">{b.response!.hints} hint(s)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <details className="text-sm text-muted-foreground">
                      <summary className="cursor-pointer select-none">Original sentence</summary>
                      <p className="mt-2">{tokensToText(it.tokens)}</p>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {audio.status === "missing" && <AudioReattach exercise={exercise} onAttach={audio.attach} />}
          {audio.url && (
            <Card>
              <CardContent className="p-5">
                <AudioPlayer api={player} highlight={player.range} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="space-y-3 p-5">
              <Button className="w-full" size="lg" onClick={retry} disabled={!mistakes.length}>
                <RotateCcw /> Retry missed blanks ({overall.total - overall.correct})
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/exercises/${id}/setup`}>
                  <RefreshCw /> New exercise from this audio
                </Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/">
                  <Home /> Home
                </Link>
              </Button>
            </CardContent>
          </Card>
          {history.length > 0 && (
            <Card>
              <CardHeader className="p-5 pb-0 sm:p-5 sm:pb-0">
                <CardTitle className="text-base">Attempts</CardTitle>
                <CardDescription>Most recent runs of this exercise</CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-5">
                <ul className="space-y-2 text-sm">
                  {history
                    .slice()
                    .reverse()
                    .map((r) => (
                      <li key={r.completedAt} className="flex items-center gap-3">
                        <span className="w-14 font-serif text-lg tabular-nums">{Math.round(r.accuracy)}%</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-gradient-to-r from-lavender to-primary" style={{ width: `${r.accuracy}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {r.retry ? "retry" : "full"} · {r.correct}/{r.total}
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                  {overall.attempts} checks · {overall.hintsUsed} hints across all blanks
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
