"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;

/**
 * Thin state wrapper around an HTMLAudioElement with precise range playback
 * (used for sentence repeat). Range end is checked on every animation frame,
 * since `timeupdate` only fires ~4×/s.
 */
export function useAudioPlayer(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rangeRef = useRef<{ start: number; end: number; loop: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState<number>(1);
  const [range, setRange] = useState<{ start: number; end: number; loop: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    const el = new Audio();
    el.preload = "auto";
    el.src = src;
    audioRef.current = el;
    const onTime = () => setTime(el.currentTime);
    const onMeta = () => Number.isFinite(el.duration) && setDuration(el.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setError("This audio could not be played in your browser.");
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("error", onError);
      audioRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [src]);

  // Frame loop: smooth progress + exact range stop/loop.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const el = audioRef.current;
      if (!el) return;
      setTime(el.currentTime);
      const r = rangeRef.current;
      if (r && el.currentTime >= r.end) {
        if (r.loop) el.currentTime = r.start;
        else {
          el.pause();
          rangeRef.current = null;
          setRange(null);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Playback was blocked or failed. Press play again.");
    }
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const clearRange = useCallback(() => {
    rangeRef.current = null;
    setRange(null);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void play();
    else el.pause();
  }, [play]);

  const seek = useCallback((t: number) => {
    const el = audioRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(d, t));
    setTime(el.currentTime);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (!el) return;
      // Skipping outside an active range cancels it.
      clearRange();
      seek(el.currentTime + delta);
    },
    [seek, clearRange],
  );

  const setRate = useCallback((r: number) => {
    if (audioRef.current) audioRef.current.playbackRate = r;
    setRateState(r);
  }, []);

  /** Play [start, end] once, or loop it. */
  const playRange = useCallback(
    (start: number, end: number, loop = false) => {
      const r = { start, end, loop };
      rangeRef.current = r;
      setRange(r);
      seek(start);
      void play();
    },
    [play, seek],
  );

  return { playing, time, duration, rate, range, error, toggle, play, pause, seek, skip, setRate, playRange, clearRange };
}

export type AudioPlayerApi = ReturnType<typeof useAudioPlayer>;
