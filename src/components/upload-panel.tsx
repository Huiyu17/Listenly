"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AudioLines,
  Cpu,
  FileAudio,
  Loader2,
  RotateCcw,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Waveform } from "@/components/brand";
import { cn } from "@/lib/utils";
import {
  ACCEPT_ATTR,
  AudioValidationError,
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
  browserCanPlay,
  decodeForWhisper,
  formatBytes,
  formatDuration,
  probeDuration,
  validateFile,
} from "@/lib/audio/audio";
import { whisper } from "@/lib/transcription/client";
import { DEFAULT_MODEL_ID, type DevicePreference, type FileProgress, type WorkerResponse } from "@/lib/transcription/protocol";
import { buildSentences, makeId, validateSegments } from "@/lib/transcript/segments";
import { createExercise } from "@/lib/exercise/session";
import { saveAudio, saveExercise } from "@/lib/storage/db";

type Phase =
  | { kind: "idle" }
  | { kind: "selected" }
  | { kind: "decoding" }
  | { kind: "loading"; message: string }
  | { kind: "transcribing"; done: number; total: number; text: string }
  | { kind: "saving" }
  | { kind: "error"; message: string };

const DEVICE_OPTIONS: { value: DevicePreference; label: string; icon: typeof Zap; hint: string }[] = [
  { value: "auto", label: "Auto", icon: Sparkles, hint: "WebGPU if available, otherwise CPU" },
  { value: "webgpu", label: "WebGPU", icon: Zap, hint: "Fastest on supported GPUs" },
  { value: "wasm", label: "CPU", icon: Cpu, hint: "WebAssembly — works everywhere, slower" },
];

export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [device, setDevice] = useState<DevicePreference>("auto");
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setGpuAvailable(typeof navigator !== "undefined" && "gpu" in navigator);
  }, []);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  useEffect(
    () =>
      whisper.subscribe((msg: WorkerResponse) => {
        if (msg.type === "download") setFiles(msg.files);
        if (msg.type === "status") {
          if (msg.device) setActiveDevice(msg.device);
          if (msg.status === "loading") setPhase({ kind: "loading", message: msg.message });
        }
        if (msg.type === "fallback")
          setNotice("WebGPU could not start on this device, so Whisper switched to the CPU (WASM) backend.");
        if (msg.type === "progress")
          setPhase({ kind: "transcribing", done: msg.chunksDone, total: msg.chunksTotal, text: msg.partialText });
      }),
    [],
  );

  const reset = useCallback(() => {
    setFile(null);
    setUrl(null);
    setDuration(null);
    setWarning(null);
    setNotice(null);
    setPhase({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const accept = useCallback(async (f: File) => {
    setNotice(null);
    setWarning(null);
    try {
      validateFile(f);
    } catch (e) {
      setFile(null);
      setPhase({ kind: "error", message: (e as Error).message });
      return;
    }
    if (!browserCanPlay(f)) {
      setWarning("Your browser reports it may not support this codec. We'll still try to decode it.");
    }
    const u = URL.createObjectURL(f);
    setFile(f);
    setUrl(u);
    setDuration(null);
    setPhase({ kind: "selected" });
    try {
      const d = await probeDuration(u);
      setDuration(d);
      if (d > MAX_DURATION_SECONDS + 1) {
        setPhase({
          kind: "error",
          message: `This recording is ${formatDuration(d)} long. Listenly currently supports up to ${formatDuration(MAX_DURATION_SECONDS)}.`,
        });
      }
    } catch {
      setWarning("Could not read the duration in advance — we'll find out while decoding.");
    }
  }, []);

  const busy = ["decoding", "loading", "transcribing", "saving"].includes(phase.kind);

  async function start() {
    if (!file) return;
    if (!whisper.isSupported()) {
      setPhase({ kind: "error", message: "This browser lacks Web Workers or WebAssembly, which local transcription needs." });
      return;
    }
    setNotice(null);
    setFiles([]);
    setPhase({ kind: "decoding" });
    try {
      const { samples, duration: exactDuration } = await decodeForWhisper(file);
      setDuration(exactDuration);
      setPhase({ kind: "loading", message: "Preparing Whisper…" });
      const result = await whisper.transcribe(samples, { modelId: DEFAULT_MODEL_ID, device });
      setPhase({ kind: "saving" });

      const segments = validateSegments(result.chunks, exactDuration);
      const sentences = buildSentences(segments);
      if (sentences.length === 0 || !result.text.trim()) {
        throw new AudioValidationError(
          "Whisper didn't detect any English speech in this recording. Try a clearer or louder file.",
        );
      }
      const id = makeId("ex");
      const audioStored = await saveAudio(id, file, file.name);
      const ex = createExercise({
        id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        duration: exactDuration,
        modelId: DEFAULT_MODEL_ID,
        device: result.device,
        rawTranscript: result.text.trim(),
        sentences,
        audioStored,
      });
      await saveExercise(ex);
      router.push(`/exercises/${id}/review`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPhase({ kind: "error", message });
    }
  }

  function cancel() {
    whisper.cancel();
    setPhase({ kind: "selected" });
  }

  const download = useMemo(() => {
    const sized = files.filter((f) => f.total > 0);
    const total = sized.reduce((s, f) => s + f.total, 0);
    const loaded = sized.reduce((s, f) => s + Math.min(f.loaded, f.total), 0);
    return { total, loaded, pct: total ? (loaded / total) * 100 : 0, count: files.length };
  }, [files]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 sm:p-8">
        {!file || phase.kind === "idle" ? (
          <>
            <label
              htmlFor="audio-input"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void accept(f);
              }}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.25rem] border-2 border-dashed border-lavender/60 bg-gradient-to-b from-white/70 to-secondary/40 px-6 py-12 text-center transition-all duration-300 hover:border-primary/60 hover:bg-white/80 sm:py-16",
                dragging && "scale-[1.01] border-primary bg-white",
              )}
            >
              <Waveform className="absolute inset-x-8 bottom-4 h-12 opacity-40 transition-opacity group-hover:opacity-70" bars={72} />
              <span className="relative mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border transition-transform duration-300 group-hover:-translate-y-0.5">
                <UploadCloud className="size-6 text-primary" />
              </span>
              <span className="relative font-serif text-xl">Drop an English recording here</span>
              <span className="relative mt-1.5 text-sm text-muted-foreground">
                or <span className="font-semibold text-primary underline-offset-4 group-hover:underline">browse files</span> · MP3,
                WAV or M4A · up to {formatDuration(MAX_DURATION_SECONDS)} and {formatBytes(MAX_FILE_BYTES)}
              </span>
              <input
                ref={inputRef}
                id="audio-input"
                type="file"
                accept={ACCEPT_ATTR}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void accept(f);
                }}
              />
            </label>
            {phase.kind === "error" && <ErrorBox message={phase.message} onRetry={reset} />}
          </>
        ) : (
          <div className="animate-fade-up space-y-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary to-accent">
                <FileAudio className="size-5 text-secondary-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                  {duration !== null ? formatDuration(duration) : "—:—"} · {formatBytes(file.size)}
                </p>
              </div>
              {!busy && (
                <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Remove file">
                  <X />
                </Button>
              )}
            </div>

            {url && <audio controls src={url} className="h-10 w-full" preload="metadata" />}

            {warning && phase.kind === "selected" && (
              <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-sm text-[oklch(0.45_0.09_65)]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {warning}
              </p>
            )}

            {phase.kind === "selected" && (
              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Processing
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {DEVICE_OPTIONS.map((o) => {
                      const disabled = o.value === "webgpu" && gpuAvailable === false;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={disabled}
                          onClick={() => setDevice(o.value)}
                          title={disabled ? "WebGPU is not available in this browser" : o.hint}
                          aria-pressed={device === o.value}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40",
                            device === o.value
                              ? "border-primary bg-secondary text-secondary-foreground"
                              : "border-border bg-white/50 hover:border-lavender",
                          )}
                        >
                          <o.icon className="size-4" />
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <Button size="lg" className="w-full" onClick={start}>
                  <AudioLines /> Transcribe with Whisper
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  First run downloads the Whisper tiny.en model (about 65&nbsp;MB for CPU, 120&nbsp;MB for WebGPU) from Hugging Face; it&apos;s cached for next time.
                  Your audio is processed on this device and never uploaded.
                </p>
              </div>
            )}

            {busy && (
              <WorkingState
                phase={phase}
                download={download}
                device={activeDevice}
                onCancel={phase.kind === "saving" ? undefined : cancel}
              />
            )}

            {notice && (
              <p className="rounded-xl bg-accent/60 px-3.5 py-2.5 text-sm text-accent-foreground">{notice}</p>
            )}
            {phase.kind === "error" && <ErrorBox message={phase.message} onRetry={() => setPhase({ kind: "selected" })} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkingState({
  phase,
  download,
  device,
  onCancel,
}: {
  phase: Phase;
  download: { total: number; loaded: number; pct: number; count: number };
  device: string | null;
  onCancel?: () => void;
}) {
  let title = "";
  let detail: React.ReactNode = null;
  let pct: number | null = null;

  if (phase.kind === "decoding") {
    title = "Decoding audio";
    detail = "Converting to 16 kHz mono for Whisper…";
  } else if (phase.kind === "loading") {
    title = phase.message;
    if (download.total > 0) {
      pct = download.pct;
      detail = `${formatBytes(download.loaded)} of ${formatBytes(download.total)} · ${download.count} files`;
    } else detail = "Checking the local model cache…";
  } else if (phase.kind === "transcribing") {
    title = `Transcribing · part ${Math.min(phase.done + 1, phase.total)} of ${phase.total}`;
    pct = (phase.done / phase.total) * 100;
    detail = phase.text.trim() ? (
      <span className="line-clamp-3 italic">“…{phase.text.trim().slice(-220)}”</span>
    ) : (
      "Listening carefully…"
    );
  } else if (phase.kind === "saving") {
    title = "Saving your exercise";
    pct = 100;
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white/60 p-4 ring-1 ring-border/70 sm:p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
        <p className="flex-1 font-semibold">{title}</p>
        {device && (
          <Badge variant="blue" className="uppercase">
            {device === "webgpu" ? <Zap /> : <Cpu />} {device === "webgpu" ? "WebGPU" : "WASM"}
          </Badge>
        )}
      </div>
      {pct !== null ? <Progress value={pct} /> : <Waveform bars={40} className="h-6" animated />}
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      {onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-destructive/8 p-4 text-sm ring-1 ring-destructive/20" role="alert">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="font-semibold text-destructive">Something went wrong</p>
        <p className="mt-1 text-foreground/80">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
