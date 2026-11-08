"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, HardDrive, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteExercise, isPersistent, listExercises } from "@/lib/storage/db";
import { continueHref, STATUS_LABEL } from "@/lib/exercise/routes";
import { formatDuration } from "@/lib/audio/audio";
import type { Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RecentExercises() {
  const [items, setItems] = useState<Exercise[] | null>(null);
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, p] = await Promise.all([listExercises(), isPersistent()]);
      if (!alive) return;
      setItems(list);
      setPersistent(p);
    })().catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this exercise and its saved audio?")) return;
    await deleteExercise(id);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <section aria-labelledby="recent-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="recent-heading" className="font-serif text-2xl tracking-tight">
          Recent exercises
        </h2>
        {!persistent && (
          <Badge variant="warning">
            <CloudOff /> Storage unavailable — this tab only
          </Badge>
        )}
      </div>

      {items === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[1.6rem] bg-white/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-serif text-lg">No exercises yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a podcast clip, a lecture snippet or a voice memo to create your first one.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((ex) => {
            const last = ex.results.at(-1);
            return (
              <li key={ex.id}>
                <Card className="group flex h-full flex-col gap-3 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={ex.title}>
                        {ex.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {new Date(ex.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                        {formatDuration(ex.duration)} · {ex.sentences.length} sentences
                      </p>
                    </div>
                    {last && (
                      <span
                        className={cn(
                          "font-serif text-2xl tabular-nums",
                          last.accuracy >= 80 ? "text-success" : last.accuracy >= 50 ? "text-primary" : "text-destructive",
                        )}
                      >
                        {Math.round(last.accuracy)}%
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={ex.status === "completed" ? "success" : "default"}>{STATUS_LABEL[ex.status]}</Badge>
                    {ex.config && (
                      <Badge variant="outline" className="capitalize">
                        {ex.config.difficulty}
                      </Badge>
                    )}
                    {ex.audioStored ? (
                      <Badge variant="blue">
                        <HardDrive /> Audio saved
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <CloudOff /> Re-upload audio
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={continueHref(ex)}>
                        {ex.status === "completed" ? "View results" : "Continue"} <ArrowRight />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${ex.title}`}
                      onClick={() => remove(ex.id)}
                      className="opacity-60 hover:text-destructive hover:opacity-100"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
