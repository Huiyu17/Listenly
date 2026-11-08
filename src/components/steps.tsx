import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "setup", label: "Setup" },
  { key: "practice", label: "Practice" },
  { key: "results", label: "Results" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/** Workflow breadcrumb. Steps before `current` link back when `id` is given and `reachable` allows it. */
export function Steps({ current, id, reachable = [] }: { current: StepKey; id?: string; reachable?: StepKey[] }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Progress" className="mb-6 overflow-x-auto sm:mb-8">
      <ol className="flex min-w-max items-center gap-1.5 text-xs font-semibold sm:gap-2">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const href = s.key === "upload" ? "/" : id ? `/exercises/${id}/${s.key}` : undefined;
          const canLink = href && !active && (s.key === "upload" || reachable.includes(s.key));
          const pill = (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                active && "bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_var(--primary)]",
                done && "bg-white/70 text-secondary-foreground",
                !active && !done && "text-muted-foreground",
                canLink && "hover:bg-white",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check className="size-3.5" /> : <span className="tabular-nums opacity-70">{i + 1}</span>}
              {s.label}
            </span>
          );
          return (
            <li key={s.key} className="flex items-center gap-1.5 sm:gap-2">
              {canLink ? <Link href={href}>{pill}</Link> : pill}
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border sm:w-8" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
