"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Steps } from "@/components/steps";
import { ExerciseStateView } from "@/components/exercise-shell";
import { useExercise } from "@/hooks/use-exercise";
import {
  DIFFICULTY_PRESETS,
  MAX_PERCENTAGE,
  MIN_PERCENTAGE,
  countEligibleWords,
  generateExercise,
  listBlanks,
} from "@/lib/exercise/generate";
import { applyConfig } from "@/lib/exercise/session";
import type { Difficulty, ExerciseConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const LEVEL_DOTS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function SetupView({ id }: { id: string }) {
  const router = useRouter();
  const { exercise, state, update } = useExercise(id);
  const [config, setConfig] = useState<ExerciseConfig>({ difficulty: "medium", percentage: 30, variant: 0 });
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (exercise && !initialised) {
      if (exercise.config) setConfig(exercise.config);
      setInitialised(true);
    }
  }, [exercise, initialised]);

  const preview = useMemo(
    () => (exercise ? generateExercise(exercise.sentences, config) : []),
    [exercise, config],
  );
  const eligible = useMemo(() => (exercise ? countEligibleWords(exercise.sentences) : 0), [exercise]);
  const blanks = listBlanks(preview);
  const phrases = blanks.filter((b) => b.wordCount > 1).length;

  if (state !== "ready" || !exercise) return <ExerciseStateView state={state === "ready" ? "loading" : state} />;

  const sameAsCurrent =
    exercise.items.length > 0 &&
    exercise.config &&
    JSON.stringify(exercise.config) === JSON.stringify(config);
  const answered = Object.values(exercise.responses).some((r) => r.value || r.attempts || r.revealed);

  async function start() {
    if (!exercise) return;
    if (!sameAsCurrent) {
      if (answered && !window.confirm("Generating a new exercise will clear your current answers. Continue?")) return;
      await update(applyConfig(exercise, config));
    }
    router.push(`/exercises/${id}/practice`);
  }

  const previewItems = preview.filter((it) => it.tokens.some((t) => t.kind === "blank")).slice(0, 3);

  return (
    <div className="animate-fade-up">
      <Steps current="setup" id={id} reachable={exercise.items.length ? ["review", "practice"] : ["review"]} />
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Shape your exercise</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Choose how much to hide. Blanks are picked with deterministic rules — word frequency, stop-word filtering and
          common phrase patterns — so the same settings always give the same exercise.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map((lvl) => {
              const p = DIFFICULTY_PRESETS[lvl];
              const active = config.difficulty === lvl;
              return (
                <button
                  key={lvl}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setConfig((c) => ({ ...c, difficulty: lvl, percentage: p.percentage }))}
                  className={cn(
                    "glass group rounded-[1.4rem] border p-5 text-left transition-all duration-300 hover:-translate-y-0.5",
                    active ? "border-primary/70 ring-4 ring-primary/15" : "border-white/70",
                  )}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-serif text-xl">{p.label}</span>
                    <span className="flex gap-1">
                      {[1, 2, 3].map((d) => (
                        <span
                          key={d}
                          className={cn(
                            "size-2 rounded-full",
                            d <= LEVEL_DOTS[lvl] ? (active ? "bg-primary" : "bg-lavender") : "bg-secondary",
                          )}
                        />
                      ))}
                    </span>
                  </div>
                  <p className="text-sm leading-snug text-muted-foreground">{p.description}</p>
                </button>
              );
            })}
          </div>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <label className="font-semibold" htmlFor="pct">
                  Blank percentage
                </label>
                <span className="font-serif text-3xl tabular-nums text-primary">{config.percentage}%</span>
              </div>
              <Slider
                id="pct"
                aria-label="Blank percentage"
                min={MIN_PERCENTAGE}
                max={MAX_PERCENTAGE}
                step={1}
                value={[config.percentage]}
                onValueChange={([v]) => setConfig((c) => ({ ...c, percentage: v }))}
              />
              <p className="text-sm text-muted-foreground">
                {config.percentage === DIFFICULTY_PRESETS[config.difficulty].percentage
                  ? `${DIFFICULTY_PRESETS[config.difficulty].label} default.`
                  : `Custom — ${DIFFICULTY_PRESETS[config.difficulty].label} word selection with a different amount.`}{" "}
                Applied to {eligible} eligible words (function words like “the” or “of” are never blanked alone).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>The first few sentences with blanks</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfig((c) => ({ ...c, variant: c.variant + 1 }))}
                title="Pick a different set of blanks with the same settings"
              >
                <Shuffle /> Regenerate
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No words qualify for blanks at this setting. Try a higher percentage or edit the transcript.
                </p>
              ) : (
                previewItems.map((it) => (
                  <p key={it.sentenceId} className="font-serif text-lg leading-loose">
                    {it.tokens.map((t, i) =>
                      t.kind === "text" ? (
                        <span key={i}>{t.value}</span>
                      ) : (
                        <span
                          key={i}
                          className="mx-0.5 inline-block rounded-md border-b-2 border-primary/60 bg-secondary/70 align-baseline text-transparent select-none"
                          style={{ minWidth: `${Math.max(3, t.answer.length) * 0.6}em` }}
                          aria-label="blank"
                        >
                          {t.answer}
                        </span>
                      ),
                    )}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Blanks", blanks.length],
                  ["Sentences", exercise.sentences.length],
                  ["Phrases", phrases],
                  ["Eligible", eligible],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-white/60 p-3 ring-1 ring-border/60">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-serif text-2xl tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="capitalize">{config.difficulty}</Badge>
                <Badge variant="outline">Variant {config.variant + 1}</Badge>
              </div>
              <Button size="lg" className="w-full" onClick={start} disabled={blanks.length === 0}>
                {sameAsCurrent ? "Resume practice" : "Start practice"} <ArrowRight />
              </Button>
              {answered && !sameAsCurrent && (
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0" /> New settings will replace your current exercise and answers.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
