"use client";

import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAYBACK_RATES, type AudioPlayerApi } from "@/hooks/use-audio-player";
import { formatDuration } from "@/lib/audio/audio";
import { cn } from "@/lib/utils";

/** Visual progress bar with an optional highlighted range (current sentence). */
function Scrubber({
  api,
  highlight,
}: {
  api: AudioPlayerApi;
  highlight?: { start: number; end: number } | null;
}) {
  const d = api.duration || 1;
  const pct = (api.time / d) * 100;
  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
        {highlight && (
          <div
            className="absolute inset-y-0 bg-sky/50"
            style={{ left: `${(highlight.start / d) * 100}%`, width: `${((highlight.end - highlight.start) / d) * 100}%` }}
          />
        )}
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-lavender to-primary" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-white shadow"
        style={{ left: `${pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={d}
        step={0.05}
        value={api.time}
        onChange={(e) => {
          api.clearRange();
          api.seek(Number(e.target.value));
        }}
        aria-label="Seek"
        aria-valuetext={`${formatDuration(api.time)} of ${formatDuration(api.duration)}`}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

export function AudioPlayer({
  api,
  highlight,
  children,
  className,
}: {
  api: AudioPlayerApi;
  highlight?: { start: number; end: number } | null;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3 sm:gap-4">
        <Button
          size="icon-lg"
          onClick={api.toggle}
          aria-label={api.playing ? "Pause" : "Play"}
          title={api.playing ? "Pause (Alt+K)" : "Play (Alt+K)"}
          className="shrink-0 [&_svg:not([class*='size-'])]:size-6"
        >
          {api.playing ? <Pause /> : <Play className="translate-x-px" />}
        </Button>
        <div className="min-w-0 flex-1">
          <Scrubber api={api} highlight={highlight} />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatDuration(api.time)}</span>
            <span>{formatDuration(api.duration)}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => api.skip(-5)} title="Back 5 seconds (Alt+J)">
          <RotateCcw /> 5s
        </Button>
        <Button variant="outline" size="sm" onClick={() => api.skip(5)} title="Forward 5 seconds (Alt+L)">
          5s <RotateCw />
        </Button>
        <div className="flex rounded-full bg-secondary/70 p-0.5" role="radiogroup" aria-label="Playback speed">
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={api.rate === r}
              onClick={() => api.setRate(r)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition-all",
                api.rate === r ? "bg-white text-secondary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}×
            </button>
          ))}
        </div>
        {children}
      </div>
      {api.error && <p className="text-sm text-destructive">{api.error}</p>}
    </div>
  );
}
