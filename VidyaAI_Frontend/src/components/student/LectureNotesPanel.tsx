"use client";

import { useEffect, useMemo, useRef } from "react";
import type { VisualFrame } from "@/types";
import { displayNotesText } from "@/lib/hinglish";
import { BookOpen, Sparkles } from "lucide-react";

export type NoteSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type NoteLine = {
  text: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
};

export type NotePayload = {
  mode: "notes";
  title: string;
  summary?: string;
  transcript?: string;
  lines?: NoteLine[];
  sections: NoteSection[];
  key_points?: string[];
  practice?: Array<{ question: string; hint?: string; answer_outline?: string }>;
};

function sectionTone(heading: string) {
  const key = heading.trim().toLowerCase();
  if (key === "transcript") return "border-sky-400/25 bg-sky-500/5 text-sky-100";
  if (key === "theory") return "border-indigo-400/25 bg-indigo-500/5 text-indigo-100";
  if (key === "practice") return "border-emerald-400/25 bg-emerald-500/5 text-emerald-100";
  return "border-white/5 bg-black/20 text-indigo-200/90";
}

function splitTranscriptLines(text: string): string[] {
  const cleaned = (text || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  const parts: string[] = [];
  for (const para of cleaned.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    const sentences = p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    if (sentences.length) parts.push(...sentences);
    else parts.push(p);
  }
  return parts;
}

function synthesizeLines(
  transcript: string,
  startSeconds: number,
  durationSeconds: number
): NoteLine[] {
  const texts = splitTranscriptLines(transcript);
  if (!texts.length) return [];
  const weights = texts.map((t) => Math.max(t.split(/\s+/).filter(Boolean).length, 1));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(durationSeconds || 1, 0.5);
  let cursor = startSeconds || 0;
  return texts.map((text, index) => {
    const share = span * (weights[index] / total);
    const isLast = index === texts.length - 1;
    const end = isLast ? startSeconds + span : cursor + Math.max(share, 0.35);
    const start = cursor;
    const duration = Math.max(end - start, 0.2);
    cursor = end;
    return {
      text,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: duration,
    };
  });
}

function normalizeLines(
  raw: unknown,
  transcript: string,
  frame: VisualFrame
): NoteLine[] {
  if (Array.isArray(raw) && raw.length) {
    const parsed = raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const text = displayNotesText(String(row.text || "")).trim();
        if (!text) return null;
        const start = Number(row.start_seconds ?? 0);
        const end = Number(row.end_seconds ?? start + Number(row.duration_seconds ?? 1));
        return {
          text,
          start_seconds: start,
          end_seconds: Math.max(end, start + 0.2),
          duration_seconds: Math.max(end - start, 0.2),
        } satisfies NoteLine;
      })
      .filter(Boolean) as NoteLine[];
    if (parsed.length) return parsed;
  }
  return synthesizeLines(
    transcript,
    Number(frame.start_seconds || 0),
    Number(frame.duration_seconds || 1)
  );
}

export function parseNotesPayload(frame: VisualFrame | null): NotePayload | null {
  if (!frame) return null;
  try {
    const parsed = JSON.parse(frame.segment_text) as NotePayload;
    if (parsed?.mode === "notes") {
      const transcript = displayNotesText(parsed.transcript || "");
      const lines = normalizeLines(parsed.lines, transcript, frame);
      return {
        mode: "notes",
        title: displayNotesText(parsed.title || frame.caption || "Notes"),
        summary: displayNotesText(parsed.summary || ""),
        transcript,
        lines,
        sections: (parsed.sections || []).map((s) => ({
          heading: displayNotesText(s.heading || "Notes"),
          body: displayNotesText(s.body || ""),
          bullets: (s.bullets || []).map((b) => displayNotesText(b)),
        })),
        key_points: (parsed.key_points || []).map((p) => displayNotesText(p)),
        practice: (parsed.practice || []).map((p) => ({
          question: displayNotesText(p.question || ""),
          hint: displayNotesText(p.hint || ""),
          answer_outline: displayNotesText(p.answer_outline || ""),
        })),
      };
    }
  } catch {
    /* fall through */
  }
  if (frame.source_type === "notes" || frame.caption) {
    const body = displayNotesText(frame.segment_text || "");
    const lines = synthesizeLines(body, Number(frame.start_seconds || 0), Number(frame.duration_seconds || 1));
    return {
      mode: "notes",
      title: displayNotesText(frame.caption || "Notes"),
      summary: "",
      transcript: body,
      lines,
      sections: [
        { heading: "Transcript", body: lines.map((l) => l.text).join("\n"), bullets: [] },
        { heading: "Theory", body: "", bullets: [] },
        { heading: "Practice", body: "", bullets: [] },
      ],
      key_points: [],
      practice: [],
    };
  }
  return null;
}

function activeLineIndex(lines: NoteLine[] | undefined, currentTime: number, isActive: boolean): number {
  if (!lines?.length || !isActive) return -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentTime >= line.start_seconds && currentTime < line.end_seconds) return i;
  }
  if (currentTime < lines[0].start_seconds) return 0;
  return lines.length - 1;
}

type LectureNotesPanelProps = {
  frames: VisualFrame[];
  activeFrame: VisualFrame | null;
  currentTime: number;
  mode?: "live" | "replay";
  playing?: boolean;
};

export function LectureNotesPanel({
  frames,
  activeFrame,
  currentTime,
  mode = "live",
  playing = true,
}: LectureNotesPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activePageRef = useRef<HTMLElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const pages = useMemo(() => {
    return frames.map((frame) => ({
      frame,
      payload: parseNotesPayload(frame),
    }));
  }, [frames]);

  const activeId = activeFrame?.id;
  const activePayload = useMemo(() => {
    const hit = pages.find((p) => p.frame.id === activeId);
    return hit?.payload || null;
  }, [pages, activeId]);
  const liveLineIdx = activeLineIndex(activePayload?.lines, currentTime, true);

  useEffect(() => {
    const container = scrollRef.current;
    const target = activeLineRef.current || activePageRef.current;
    if (!container || !target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const delta = tRect.top - cRect.top - cRect.height / 2 + tRect.height / 2;
    if (Math.abs(delta) < 8) return;
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, [activeId, liveLineIdx]);

  const statusLabel = mode === "live" ? "Live notes" : playing ? "Line sync" : "Paused";

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-gradient-to-b from-slate-950/80 to-slate-900/90 md:rounded-none">
      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200/90 sm:text-[11px] sm:tracking-[0.18em]">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Transcribed notes · Ms. Vidya</span>
        </p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            mode === "live"
              ? "bg-emerald-400/15 text-emerald-100"
              : playing
                ? "bg-indigo-400/15 text-indigo-100"
                : "bg-white/10 text-slate-300"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="notes-scroll relative z-10 min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4"
      >
        {!pages.length && (
          <p className="py-10 text-center text-sm text-slate-400">Notes will appear here during class…</p>
        )}

        {pages.map(({ frame, payload }, index) => {
          const isActive = frame.id === activeId;
          const start = frame.start_seconds || 0;
          const span = Math.max(frame.duration_seconds || 1, 0.5);
          const progress = isActive
            ? Math.min(1, Math.max(0, (currentTime - start) / span))
            : currentTime > start
              ? 1
              : 0;
          const note = payload || {
            mode: "notes" as const,
            title: frame.caption || `Page ${index + 1}`,
            summary: "",
            sections: [],
            key_points: [],
            lines: [],
          };
          const lineIdx = activeLineIndex(note.lines, currentTime, isActive);

          return (
            <article
              key={frame.id}
              ref={isActive ? activePageRef : undefined}
              className={`w-full min-w-0 max-w-full rounded-xl border px-3 py-3 transition-colors duration-500 sm:px-4 sm:py-4 ${
                isActive
                  ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
                  : "border-white/8 bg-white/[0.03] opacity-70"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Page {frame.frame_number} of {frames.length}
                </p>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    Teaching now
                  </span>
                )}
              </div>

              <h3
                className={`break-words text-base font-semibold sm:text-lg ${
                  isActive ? "text-white" : "text-slate-200"
                }`}
              >
                {note.title}
              </h3>
              {note.summary && (
                <p className="mt-1 break-words text-sm leading-relaxed text-slate-300">{note.summary}</p>
              )}

              {isActive && (
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}

              {!!note.lines?.length && (
                <div className="mt-3 w-full min-w-0 rounded-lg border border-sky-400/25 bg-sky-500/5 p-2.5 sm:p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Transcript</p>
                  <div className="mt-2 space-y-1.5">
                    {note.lines.map((line, lIdx) => {
                      const isLiveLine = isActive && lIdx === lineIdx;
                      const isPast = isActive && lIdx < lineIdx;
                      const lineProgress =
                        isLiveLine && line.duration_seconds > 0
                          ? Math.min(
                              1,
                              Math.max(0, (currentTime - line.start_seconds) / line.duration_seconds)
                            )
                          : isPast
                            ? 1
                            : 0;
                      return (
                        <p
                          key={`${frame.id}-line-${lIdx}`}
                          ref={isLiveLine ? activeLineRef : undefined}
                          className={`relative w-full min-w-0 rounded-md px-2.5 py-2 text-sm leading-relaxed transition-colors duration-300 ${
                            isLiveLine
                              ? "bg-cyan-400/20 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
                              : isPast
                                ? "bg-white/[0.04] text-slate-300"
                                : "text-slate-400"
                          }`}
                        >
                          {isLiveLine && (
                            <span
                              className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-cyan-300/15 transition-[width] duration-150 ease-linear"
                              style={{ width: `${Math.round(lineProgress * 100)}%` }}
                              aria-hidden
                            />
                          )}
                          <span className="relative z-[1] block break-words [overflow-wrap:anywhere]">
                            {line.text}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-3">
                {note.sections.map((section, sIdx) => {
                  if (section.heading.trim().toLowerCase() === "transcript") return null;
                  if (!section.body?.trim() && !section.bullets?.length) return null;
                  const tone = sectionTone(section.heading);
                  return (
                    <div
                      key={`${frame.id}-sec-${sIdx}`}
                      className={`w-full min-w-0 rounded-lg border p-3 transition-opacity duration-700 ${tone} ${
                        isActive ? "opacity-100" : "opacity-80"
                      }`}
                      style={isActive ? { transitionDelay: `${sIdx * 80}ms` } : undefined}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide">{section.heading}</p>
                      {section.body && (
                        <p className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-200 [overflow-wrap:anywhere]">
                          {section.body}
                        </p>
                      )}
                      {!!section.bullets?.length && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
                          {section.bullets.map((bullet, bIdx) => (
                            <li key={`${frame.id}-b-${sIdx}-${bIdx}`} className="break-words">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {!!note.key_points?.length && (
                <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">Key points</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-amber-50/90">
                    {note.key_points.map((point, pIdx) => (
                      <li key={`${frame.id}-kp-${pIdx}`} className="break-words">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!note.practice?.length && (
                <div className="mt-3 space-y-2 rounded-lg border border-emerald-400/25 bg-emerald-500/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">Practice</p>
                  {note.practice.map((item, pIdx) => (
                    <div key={`${frame.id}-pr-${pIdx}`} className="rounded-md bg-black/20 p-2.5 text-sm text-slate-200">
                      <p className="break-words font-medium text-emerald-100">
                        Q{pIdx + 1}. {item.question}
                      </p>
                      {item.hint && <p className="mt-1 break-words text-xs text-slate-400">Hint: {item.hint}</p>}
                      {item.answer_outline && (
                        <p className="mt-1 break-words text-xs text-slate-400">Answer path: {item.answer_outline}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
