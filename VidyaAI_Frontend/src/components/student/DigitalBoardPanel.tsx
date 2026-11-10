"use client";

import { useMemo } from "react";
import type { VisualFrame } from "@/types";
import { displayNotesText } from "@/lib/hinglish";

export type BoardLine = {
  kind: "heading" | "equation" | "step" | "note" | string;
  text: string;
};

export type BoardPayload = {
  mode: "board";
  narration?: string;
  lines: BoardLine[];
};

function hinglishLine(line: BoardLine): BoardLine {
  return { ...line, text: displayNotesText(line.text) };
}

export function parseBoardPayload(frame: VisualFrame | null): BoardPayload | null {
  if (!frame || frame.source_type !== "board") return null;
  try {
    const parsed = JSON.parse(frame.segment_text) as BoardPayload;
    if (parsed?.mode === "board" && Array.isArray(parsed.lines)) {
      return {
        ...parsed,
        narration: parsed.narration ? displayNotesText(parsed.narration) : parsed.narration,
        lines: parsed.lines.map(hinglishLine),
      };
    }
  } catch {
    /* fall through */
  }
  if (frame.caption?.trim()) {
    return {
      mode: "board",
      narration: displayNotesText(frame.caption),
      lines: [{ kind: "heading", text: displayNotesText(frame.caption) }],
    };
  }
  return null;
}

function lineClass(kind: string) {
  if (kind === "equation") return "font-mono text-xl tracking-wide text-amber-100 sm:text-2xl lg:text-3xl";
  if (kind === "heading") return "text-lg font-semibold text-white sm:text-xl lg:text-2xl";
  if (kind === "step") return "text-base text-emerald-100 sm:text-lg lg:text-xl";
  return "text-sm text-slate-100 sm:text-base lg:text-lg";
}

type DigitalBoardPanelProps = {
  frames: VisualFrame[];
  activeFrame: VisualFrame | null;
  currentTime: number;
  /** Live stream vs recorded replay — drives badge + pen animation. */
  mode?: "live" | "replay";
  playing?: boolean;
};

export function DigitalBoardPanel({
  frames,
  activeFrame,
  currentTime,
  mode = "live",
  playing = true,
}: DigitalBoardPanelProps) {
  const { settledLines, writingLines, revealCount, penVisible, partialChars } = useMemo(() => {
    if (!activeFrame) {
      return {
        settledLines: [] as BoardLine[],
        writingLines: [] as BoardLine[],
        revealCount: 0,
        penVisible: false,
        partialChars: 0,
      };
    }

    const activeIndex = frames.findIndex((f) => f.id === activeFrame.id);
    const settled: BoardLine[] = [];
    for (let i = 0; i < activeIndex; i++) {
      const payload = parseBoardPayload(frames[i]);
      if (payload?.lines?.length) settled.push(...payload.lines);
    }
    // Keep only recent settled lines so board matches current teaching focus.
    const settledTail = settled.slice(-5);

    const current = parseBoardPayload(activeFrame);
    const writing = current?.lines ?? [];
    const elapsed = Math.max(0, currentTime - (activeFrame.start_seconds || 0));
    const span = Math.max(activeFrame.duration_seconds || 1, 0.5);
    // Ease-in so early words appear as teacher starts the segment.
    const progress = Math.min(1, Math.pow(elapsed / span, 0.85));

    const exact = progress * Math.max(writing.length, 1);
    const completedLines = Math.min(writing.length, Math.floor(exact));
    const revealCount = writing.length === 0 ? 0 : Math.min(writing.length, Math.max(1, completedLines + (progress > 0 ? 1 : 0)));
    const frac = exact - Math.floor(exact);
    const activeWriting = writing[Math.min(revealCount - 1, writing.length - 1)];
    const partialChars =
      activeWriting && revealCount > completedLines
        ? Math.max(1, Math.ceil(frac * activeWriting.text.length))
        : activeWriting
          ? activeWriting.text.length
          : 0;
    const penVisible =
      writing.length > 0 && progress < 0.98 && (mode === "live" || playing) && revealCount > completedLines;

    return {
      settledLines: settledTail,
      writingLines: writing,
      revealCount,
      penVisible,
      partialChars,
    };
  }, [frames, activeFrame, currentTime, mode, playing]);

  const statusLabel = mode === "live" ? "Pen live" : playing ? "Replay sync" : "Paused";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-emerald-900/40 bg-[#0c1f14] shadow-inner">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(255,255,255,0.05) 28px)",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80 sm:text-[11px]">
          Digital board · Ms. Vidya
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            mode === "live"
              ? "bg-amber-400/15 text-amber-100"
              : playing
                ? "bg-indigo-400/15 text-indigo-100"
                : "bg-white/10 text-slate-300"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:gap-3 sm:px-6 sm:py-5 lg:px-7">
        {settledLines.map((line, index) => (
          <p key={`settled-${index}-${line.text}`} className={`${lineClass(line.kind)} opacity-55`}>
            {line.text}
          </p>
        ))}

        {writingLines.map((line, index) => {
          const fullyVisible = index < revealCount - 1 || (index < revealCount && !penVisible);
          const isWriting = index === revealCount - 1 && penVisible;
          const visible = index < revealCount;
          if (!visible) {
            return (
              <p
                key={`write-${activeFrame?.id}-${index}-${line.text}`}
                className={`${lineClass(line.kind)} translate-y-2 opacity-0`}
                aria-hidden
              >
                {line.text}
              </p>
            );
          }

          const shown = isWriting ? line.text.slice(0, partialChars) : fullyVisible || !penVisible ? line.text : line.text.slice(0, partialChars);

          return (
            <p
              key={`write-${activeFrame?.id}-${index}-${line.text}`}
              className={`${lineClass(line.kind)} translate-y-0 opacity-100 ${isWriting ? "tracking-wide" : ""}`}
            >
              {shown}
              {isWriting && (
                <span className="ml-1 inline-block h-5 w-1.5 animate-pulse rounded-sm bg-amber-200/90 align-middle" />
              )}
            </p>
          );
        })}

        {!writingLines.length && !settledLines.length && (
          <p className="text-sm text-emerald-100/70">Teacher is preparing the board…</p>
        )}
      </div>
    </div>
  );
}
