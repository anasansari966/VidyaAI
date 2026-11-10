"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

export function AiVoicePlayer({ src, label = "Listen to reply" }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  return (
    <div className="mt-3 rounded-2xl border border-teal-400/20 bg-gradient-to-r from-teal-500/10 via-indigo-500/10 to-violet-500/10 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (playing) audio.pause();
            else void audio.play();
          }}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all ${
            playing
              ? "border-teal-400/50 bg-teal-500/20 shadow-lg shadow-teal-500/25"
              : "border-white/15 bg-white/10 hover:bg-white/15"
          }`}
          aria-label={playing ? "Pause voice reply" : "Play voice reply"}
        >
          {playing && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/20" />
              <span className="absolute -inset-1 animate-pulse rounded-full border border-teal-400/30" />
            </>
          )}
          <Volume2 className={`relative h-5 w-5 ${playing ? "text-teal-200" : "text-slate-200"}`} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-teal-200/90">{label}</p>
          <div className="mt-2 flex h-8 items-end gap-0.5">
            {Array.from({ length: 24 }).map((_, i) => {
              const height = playing
                ? 30 + Math.sin((progress * 40 + i) * 0.9) * 22 + ((i * 7) % 18)
                : 18 + ((i * 5) % 12);
              return (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    playing ? "bg-gradient-to-t from-teal-500 to-indigo-300" : "bg-white/20"
                  }`}
                  style={{ height: `${Math.max(8, Math.min(32, height))}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-indigo-400 transition-[width] duration-100"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="none" className="hidden" />
    </div>
  );
}
