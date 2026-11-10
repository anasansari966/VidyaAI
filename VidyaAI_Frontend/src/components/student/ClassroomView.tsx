"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { AI_TEACHER_NAME } from "@/lib/brand";
import { api } from "@/lib/api";
import type { LectureSession, VisualFrame } from "@/types";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import {
  BookOpen,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LectureNotesPanel } from "@/components/student/LectureNotesPanel";

function findActiveFrame(frames: VisualFrame[], currentTime: number): VisualFrame | null {
  if (!frames.length) return null;
  if (currentTime <= 0) return frames[0];

  return (
    frames.find(
      (frame) =>
        currentTime >= frame.start_seconds &&
        currentTime < frame.start_seconds + frame.duration_seconds
    ) ??
    frames[frames.length - 1] ??
    null
  );
}

function normalizeFramesToDuration(frames: VisualFrame[], totalSeconds: number): VisualFrame[] {
  if (!frames.length || totalSeconds <= 0) return frames;
  const perPage = totalSeconds / frames.length;
  return frames.map((frame, index) => {
    const start_seconds = index * perPage;
    const duration_seconds =
      index === frames.length - 1 ? Math.max(totalSeconds - start_seconds, 1) : perPage;
    return { ...frame, start_seconds, duration_seconds };
  });
}

/** Keep authored frame timings when valid; otherwise scale/normalize to audio length. */
function syncFramesToDuration(frames: VisualFrame[], totalSeconds: number): VisualFrame[] {
  if (!frames.length || totalSeconds <= 0) return frames;

  const timed = frames.every((f) => Number(f.duration_seconds) > 0);
  if (!timed) return normalizeFramesToDuration(frames, totalSeconds);

  const timelineEnd = Math.max(
    ...frames.map((f) => Number(f.start_seconds || 0) + Number(f.duration_seconds || 0)),
    0
  );
  if (timelineEnd <= 1) return normalizeFramesToDuration(frames, totalSeconds);

  const ratio = totalSeconds / timelineEnd;
  if (ratio > 0.92 && ratio < 1.08) return frames;

  return frames.map((frame) => ({
    ...frame,
    start_seconds: Number(frame.start_seconds || 0) * ratio,
    duration_seconds: Math.max(Number(frame.duration_seconds || 0) * ratio, 0.5),
  }));
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function preferNotesFrames(frames: VisualFrame[]): VisualFrame[] {
  const notes = frames.filter((f) => f.source_type === "notes");
  if (notes.length) return notes;
  return frames;
}

type LiveSyncAnchor = { serverSeconds: number; atMs: number };

function liveTargetSeconds(anchor: LiveSyncAnchor | null, maxSeconds: number): number {
  if (!anchor) return 0;
  return Math.min(anchor.serverSeconds + (Date.now() - anchor.atMs) / 1000, maxSeconds);
}

function TeacherWaveCircle({ active, level }: { active: boolean; level: number }) {
  const scale = 0.35 + level * 0.65;

  return (
    <div className="relative flex h-28 w-28 items-center justify-center sm:h-36 sm:w-36 md:h-40 md:w-40 lg:h-48 lg:w-48">
      {active && (
        <>
          <span className="teacher-wave-ring absolute inset-0 rounded-full border border-indigo-400/30" />
          <span
            className="teacher-wave-ring teacher-wave-ring-delay-1 absolute inset-2 rounded-full border border-cyan-400/25 sm:inset-3"
            style={{ opacity: 0.4 + level * 0.4 }}
          />
        </>
      )}

      <div
        className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-2xl transition-all duration-300 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 ${
          active
            ? "border-emerald-400/80 bg-gradient-to-br from-indigo-600 to-violet-700 shadow-emerald-500/20"
            : "border-white/20 bg-gradient-to-br from-slate-700 to-slate-900"
        }`}
        style={active ? { transform: `scale(${scale})` } : undefined}
      >
        <User className="h-9 w-9 text-white/90 sm:h-11 sm:w-11 lg:h-14 lg:w-14" strokeWidth={1.5} />
      </div>
    </div>
  );
}

export function ClassroomView({
  lectureId,
  replayMode = false,
}: {
  lectureId: number;
  replayMode?: boolean;
}) {
  const router = useRouter();
  const [session, setSession] = useState<LectureSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [audioError, setAudioError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0.15);
  const [liveStarted, setLiveStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pulseRef = useRef<number | null>(null);
  const liveSyncRef = useRef<LiveSyncAnchor | null>(null);

  const isLive = Boolean(session?.is_live && !replayMode);
  const liveClassMode = !replayMode;

  const totalSeconds = duration > 0 ? duration : Math.max((session?.duration_minutes ?? 0) * 60, 1);

  const syncLiveAnchor = useCallback((serverSeconds: number) => {
    liveSyncRef.current = { serverSeconds, atMs: Date.now() };
    setCurrentTime(Math.min(serverSeconds, totalSeconds));
  }, [totalSeconds]);

  const loadSession = useCallback(async () => {
    const data = await api.lectureSession(lectureId);
    setSession(data);
    return data;
  }, [lectureId]);

  useEffect(() => {
    setLoading(true);
    loadSession()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load class"))
      .finally(() => setLoading(false));
  }, [loadSession]);

  useEffect(() => {
    if (session?.visual_status !== "generating" && session?.audio_status !== "generating") return;
    const timer = setInterval(() => {
      loadSession().catch(console.error);
    }, session?.audio_status === "generating" ? 2000 : 5000);
    return () => clearInterval(timer);
  }, [session?.visual_status, session?.audio_status, loadSession]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted, session]);

  // Recorded sessions always start at t=0 with matching board context.
  useEffect(() => {
    if (!replayMode || !session?.audio_url) return;
    setCurrentTime(0);
    setPlaying(false);
    const audio = audioRef.current;
    if (!audio) return;

    const syncStart = () => {
      audio.currentTime = 0;
      setCurrentTime(0);
    };

    if (audio.readyState >= 1) {
      syncStart();
    } else {
      audio.addEventListener("loadedmetadata", syncStart, { once: true });
    }
  }, [replayMode, session?.audio_url, lectureId]);

  useEffect(() => {
    if (replayMode || !session?.is_live) return;
    syncLiveAnchor(session.live_position_seconds ?? 0);
  }, [replayMode, session?.is_live, session?.live_position_seconds, syncLiveAnchor]);

  useEffect(() => {
    if (replayMode || liveStarted || !session?.audio_url) return;
    const audio = audioRef.current;
    if (!audio) return;

    const seekToLivePosition = () => {
      if (!session.is_live) return;
      const target = session.live_position_seconds ?? 0;
      syncLiveAnchor(target);
      audio.currentTime = Math.min(target, totalSeconds);
    };

    const startClass = async () => {
      seekToLivePosition();
      try {
        await audio.play();
        setPlaying(true);
        setLiveStarted(true);
      } catch {
        setAudioError("Allow audio in your browser to join the live class.");
      }
    };

    if (audio.readyState >= 1) {
      seekToLivePosition();
      void startClass();
    } else {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          seekToLivePosition();
          void startClass();
        },
        { once: true }
      );
    }
  }, [session, replayMode, liveStarted, syncLiveAnchor, totalSeconds]);

  useEffect(() => {
    if (replayMode || !session?.is_live) return;

    const syncAudioToLiveClock = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const target = liveTargetSeconds(liveSyncRef.current, totalSeconds);

      if (Math.abs(audio.currentTime - target) > 1.5) {
        audio.currentTime = target;
      }

      if (target >= totalSeconds - 1) {
        if (!audio.paused) audio.pause();
        setPlaying(false);
        return;
      }

      if (audio.paused) {
        audio.play().catch(() => {});
      }
    };

    syncAudioToLiveClock();
    const tick = setInterval(syncAudioToLiveClock, 1000);

    let raf = 0;
    let lastPaint = 0;
    const paintBoard = (ts: number) => {
      if (ts - lastPaint >= 80) {
        lastPaint = ts;
        setCurrentTime(liveTargetSeconds(liveSyncRef.current, totalSeconds));
      }
      raf = requestAnimationFrame(paintBoard);
    };
    raf = requestAnimationFrame(paintBoard);

    const resync = () => {
      loadSession()
        .then((data) => {
          if (!data.is_live) return;
          syncLiveAnchor(data.live_position_seconds ?? 0);
        })
        .catch(console.error);
    };

    resync();
    const poll = setInterval(resync, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      cancelAnimationFrame(raf);
    };
  }, [replayMode, session?.is_live, loadSession, syncLiveAnchor, totalSeconds]);

  useEffect(() => {
    if (!playing) {
      if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
      setAudioLevel(0.12);
      return;
    }
    let tick = 0;
    const animate = () => {
      tick += 1;
      setAudioLevel(0.25 + Math.abs(Math.sin(tick * 0.08)) * 0.55);
      pulseRef.current = requestAnimationFrame(animate);
    };
    pulseRef.current = requestAnimationFrame(animate);
    return () => {
      if (pulseRef.current) cancelAnimationFrame(pulseRef.current);
    };
  }, [playing]);

  const playbackDuration = duration > 0 ? duration : totalSeconds;

  const syncedFrames = useMemo(() => {
    const raw = preferNotesFrames(session?.frames ?? []);
    return syncFramesToDuration(raw, playbackDuration);
  }, [session?.frames, playbackDuration]);

  const activeFrame = useMemo(
    () => findActiveFrame(syncedFrames, currentTime),
    [syncedFrames, currentTime]
  );

  // Smooth board/pen sync with recorded audio (timeupdate alone is too coarse).
  useEffect(() => {
    if (!replayMode || !playing) return;
    let raf = 0;
    let lastPaint = 0;
    const tick = (ts: number) => {
      if (ts - lastPaint >= 80) {
        lastPaint = ts;
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          setCurrentTime(audio.currentTime);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replayMode, playing]);

  useEffect(() => {
    if (!session?.audio_url || currentTime <= 0 || isLive) return;
    const timer = setInterval(() => {
      api
        .saveProgress({
          lecture_part_id: lectureId,
          last_position_seconds: Math.floor(currentTime),
          completed: currentTime >= totalSeconds - 10,
        })
        .catch(console.error);
    }, 30000);
    return () => clearInterval(timer);
  }, [session?.audio_url, currentTime, lectureId, totalSeconds, isLive]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!replayMode) return;
      const audio = audioRef.current;
      if (!audio) return;
      const max = duration > 0 ? duration : Math.max((session?.duration_minutes ?? 0) * 60, 1);
      const next = Math.max(0, Math.min(seconds, max));
      audio.currentTime = next;
      setCurrentTime(next);
    },
    [replayMode, duration, session?.duration_minutes]
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      const base = audio?.currentTime ?? currentTime;
      seekTo(base + deltaSeconds);
    },
    [seekTo, currentTime]
  );

  const togglePlay = useCallback(async () => {
    if (!replayMode) return;
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError("");
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch (err) {
        setPlaying(false);
        setAudioError(err instanceof Error ? err.message : "Could not start audio.");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [replayMode]);

  function seekFromProgressClick(e: MouseEvent<HTMLButtonElement>) {
    if (!replayMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    seekTo(ratio * totalSeconds);
  }

  useEffect(() => {
    if (!replayMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") {
        e.preventDefault();
        skipBy(e.shiftKey ? -30 : -10);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "l") {
        e.preventDefault();
        skipBy(e.shiftKey ? 30 : 10);
      } else if (e.key === " " || e.key.toLowerCase() === "k") {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replayMode, skipBy, togglePlay]);

  if (loading) {
    return <FriendlyLoader message="Opening your class…" className="min-h-[420px]" />;
  }

  if (error || !session) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-slate-400">
        {error || "Classroom not available."}
      </div>
    );
  }

  const activeSession = session;

  function openSupportChat() {
    const params = new URLSearchParams({
      subject: activeSession.subject,
      chapter: String(activeSession.chapter_id),
    });
    if (activeFrame?.book_page_number) {
      params.set("page", String(activeFrame.book_page_number));
    }
    router.push(`/dashboard/student/support/chat?${params.toString()}`);
  }

  return (
    <div className="classroom-layout grid w-full min-w-0 gap-3">
      <section className="classroom-player glass flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {(playing || isLive) && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  playing || isLive ? "bg-red-500" : "bg-slate-500"
                }`}
              />
            </span>
            <span className="min-w-0 truncate text-sm font-medium">
              {isLive ? "Live class in progress" : replayMode ? "Recorded session" : playing ? "Class playing" : "Waiting to start"}
            </span>
          </div>
          <span className="shrink-0 text-xs text-slate-400">
            Class {session.class_grade} · {session.subject}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col bg-[#0b1220]">
          <div className="classroom-teacher-stage relative flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-3 sm:px-5 sm:py-5">
            <TeacherWaveCircle active={playing || isLive} level={audioLevel} />
            <div className="mt-2 text-center sm:mt-4">
              <p className="text-base font-semibold text-white sm:text-lg">{AI_TEACHER_NAME}</p>
              <p className="text-xs text-slate-400 sm:text-sm">Your class teacher</p>
              <p
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-medium sm:mt-3 sm:text-xs ${
                  playing || isLive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/5 text-slate-400"
                }`}
              >
                {isLive
                  ? "Following live lecture"
                  : replayMode
                    ? playing
                      ? "Replaying lecture…"
                      : "Ready to replay"
                    : playing
                      ? "Speaking…"
                      : "Ready to begin"}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-slate-950/50 px-3 py-3 sm:px-4 sm:py-4">
          {session.audio_url ? (
            <>
              <audio
                ref={audioRef}
                src={api.audioUrl(session.audio_url)}
                preload="auto"
                onLoadedMetadata={(e) => {
                  setDuration(e.currentTarget.duration);
                  setAudioError("");
                }}
                onError={() => {
                  setPlaying(false);
                  setAudioError(
                    session.audio_status === "generating"
                      ? "Audio is still preparing… refresh in a moment."
                      : "Audio file is missing. Refresh the page to regenerate it."
                  );
                }}
                onTimeUpdate={(e) => {
                  if (!isLive) {
                    setCurrentTime(e.currentTarget.currentTime);
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  if (isLive) {
                    audioRef.current?.play().catch(() => {});
                    return;
                  }
                  setPlaying(false);
                }}
                onEnded={() => setPlaying(false)}
                className="sr-only"
              />

              {replayMode ? (
                <button
                  type="button"
                  onClick={seekFromProgressClick}
                  aria-label="Seek recording"
                  className="mb-3 block h-2 w-full overflow-hidden rounded-full bg-white/10 transition hover:bg-white/15"
                >
                  <div
                    className="pointer-events-none h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(100, (currentTime / Math.max(totalSeconds, 1)) * 100)}%` }}
                  />
                </button>
              ) : (
                <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, (currentTime / Math.max(totalSeconds, 1)) * 100)}%` }}
                  />
                </div>
              )}

              <div className="classroom-player-meta flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 break-words text-sm font-medium [overflow-wrap:anywhere]">{session.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatTime(currentTime)} / {formatTime(totalSeconds)}
                  </p>
                </div>
                <div className="classroom-player-controls grid w-full grid-cols-6 items-center gap-1.5">
                  {replayMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => skipBy(-30)}
                        className="min-w-0 rounded-lg bg-white/5 px-1 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10 sm:px-2 sm:text-[11px]"
                        title="Back 30 seconds (Shift+←)"
                      >
                        −30s
                      </button>
                      <button
                        type="button"
                        onClick={() => skipBy(-10)}
                        className="flex h-9 w-9 max-w-full items-center justify-center justify-self-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10"
                        title="Back 10 seconds (← / J)"
                        aria-label="Skip back 10 seconds"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="flex h-11 w-11 max-w-full items-center justify-center justify-self-center rounded-full bg-indigo-500 text-white hover:bg-indigo-400"
                      >
                        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 pl-0.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => skipBy(10)}
                        className="flex h-9 w-9 max-w-full items-center justify-center justify-self-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10"
                        title="Forward 10 seconds (→ / L)"
                        aria-label="Skip forward 10 seconds"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => skipBy(30)}
                        className="min-w-0 rounded-lg bg-white/5 px-1 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10 sm:px-2 sm:text-[11px]"
                        title="Forward 30 seconds (Shift+→)"
                      >
                        +30s
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setMuted((prev) => !prev)}
                    className="flex h-9 w-9 max-w-full items-center justify-center justify-self-center rounded-full bg-white/5 text-slate-300"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {replayMode && (
                <p className="mt-2 hidden text-xs text-slate-500 sm:block">
                  Click the bar to jump · −10s / +10s · shortcuts ← → (Shift for 30s) · Space to play/pause
                </p>
              )}
              {liveClassMode && (
                <p className="mt-2 text-xs text-emerald-300">
                  Live class — follows the teacher automatically. Use volume only.
                </p>
              )}
              {audioError && <p className="mt-2 text-xs text-red-400">{audioError}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-400">Audio is preparing…</p>
          )}
        </div>
      </section>

      <section className="classroom-notes glass flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl">
        <div className="shrink-0 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <BookOpen className="h-4 w-4 shrink-0 text-indigo-300" />
              <h3 className="truncate font-semibold">Class notes</h3>
            </div>
            <span className="shrink-0 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] text-indigo-200 sm:px-3 sm:text-xs">
              AI · page by page
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400" title={session.chapter_title}>
            {session.chapter_title}
          </p>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-950/30">
          {syncedFrames.length ? (
            <>
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <LectureNotesPanel
                  frames={syncedFrames}
                  activeFrame={activeFrame}
                  currentTime={currentTime}
                  mode={replayMode ? "replay" : "live"}
                  playing={playing || isLive}
                />
              </div>
              <div className="shrink-0 border-t border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    Notes page {activeFrame?.frame_number ?? 0} of {syncedFrames.length || 1}
                  </p>
                  <button
                    type="button"
                    onClick={openSupportChat}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-indigo-200 hover:bg-white/10"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    Ask Support
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
              {session.visual_status === "generating"
                ? "Generating class notes…"
                : "Notes will appear here once this lecture is ready."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
