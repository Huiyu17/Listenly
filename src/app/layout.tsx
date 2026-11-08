import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "./globals.css";
import { AmbientBackground, Logo } from "@/components/brand";
import { Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Listenly — English dictation practice",
  description:
    "Turn any English recording into a fill-in-the-blanks listening exercise. Whisper runs privately in your browser.",
};

export const viewport: Viewport = { themeColor: "#fbf9f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AmbientBackground />
        <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6">
          <header className="flex items-center justify-between py-5 sm:py-7">
            <Logo />
            <span className="hidden items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur sm:inline-flex">
              <Lock className="size-3.5" /> Audio stays on your device
            </span>
          </header>
          <main className="flex-1 pb-16">{children}</main>
          <footer className="border-t border-border/60 py-6 text-xs text-muted-foreground">
            Transcription by OpenAI Whisper (tiny.en) running locally via Transformers.js. Blanks are chosen by
            transparent word-frequency rules, not an AI model.
          </footer>
        </div>
      </body>
    </html>
  );
}
