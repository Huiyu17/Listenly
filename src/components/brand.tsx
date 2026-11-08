import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 items-center justify-center gap-[3px] rounded-xl bg-gradient-to-br from-lavender via-primary to-sky shadow-[0_6px_16px_-6px_var(--primary)]",
        className,
      )}
      aria-hidden
    >
      {[0.45, 0.85, 0.6, 1, 0.5].map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-white/95" style={{ height: `${h * 55}%` }} />
      ))}
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      <span className="font-serif text-[1.35rem] font-medium tracking-tight">Listenly</span>
    </Link>
  );
}

/** Deterministic decorative waveform bars. */
export function Waveform({
  bars = 64,
  className,
  seed = 7,
  animated = false,
}: {
  bars?: number;
  className?: string;
  seed?: number;
  animated?: boolean;
}) {
  const heights = Array.from({ length: bars }, (_, i) => {
    const x = i / bars;
    const envelope = Math.sin(Math.PI * x) ** 0.8;
    const wobble = (Math.sin(i * 1.7 + seed) + Math.sin(i * 0.53 + seed * 2) + 2) / 4;
    // Round so server (Node) and browser produce identical style strings —
    // tiny Math.sin/pow differences otherwise cause a hydration mismatch.
    return Math.round((0.12 + envelope * (0.25 + wobble * 0.75)) * 1000) / 10;
  });
  return (
    <div className={cn("flex h-16 items-center gap-[3px]", className)} aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-full bg-gradient-to-t from-lavender/70 to-sky/70", animated && "origin-center animate-wave")}
          style={{ height: `${h}%`, animationDelay: animated ? `${(i % 12) * 0.08}s` : undefined }}
        />
      ))}
    </div>
  );
}

export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-lavender/30 blur-3xl animate-float" />
      <div
        className="absolute top-1/3 -right-40 size-[30rem] rounded-full bg-sky/25 blur-3xl animate-float"
        style={{ animationDelay: "-5s" }}
      />
      <div
        className="absolute -bottom-48 left-1/4 size-[28rem] rounded-full bg-[oklch(0.93_0.04_60)]/50 blur-3xl animate-float"
        style={{ animationDelay: "-9s" }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(oklch(0.6 0.04 285 / 0.18) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(to bottom, black, transparent 70%)",
        }}
      />
    </div>
  );
}
