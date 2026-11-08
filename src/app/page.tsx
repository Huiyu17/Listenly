import { Headphones, PenLine, ShieldCheck } from "lucide-react";
import { UploadPanel } from "@/components/upload-panel";
import { RecentExercises } from "@/components/recent-exercises";
import { Steps } from "@/components/steps";

export default function HomePage() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pt-10">
        <div className="animate-fade-up space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-secondary-foreground ring-1 ring-white">
            <span className="size-1.5 rounded-full bg-primary" /> Intensive listening, made calm
          </p>
          <h1 className="font-serif text-4xl leading-[1.08] font-medium tracking-tight sm:text-5xl lg:text-6xl">
            Turn any English recording into a <span className="text-gradient italic">dictation</span> practice.
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload audio, let Whisper transcribe it right in your browser, then listen closely and fill in the missing
            words. No account, no API keys, no uploads.
          </p>
          <ul className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              { icon: ShieldCheck, t: "Private by design", d: "Whisper runs locally" },
              { icon: PenLine, t: "Editable transcript", d: "Fix errors before practice" },
              { icon: Headphones, t: "Focused practice", d: "Replay, slow down, retry" },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-center gap-3 rounded-2xl bg-white/45 p-3 ring-1 ring-white/80">
                <Icon className="size-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="text-xs text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="animate-fade-up [animation-delay:120ms]">
          <Steps current="upload" />
          <UploadPanel />
        </div>
      </section>
      <RecentExercises />
    </div>
  );
}
