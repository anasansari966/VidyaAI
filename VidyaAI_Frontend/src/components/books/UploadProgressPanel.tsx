"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const UPLOAD_STEPS = [
  { id: "save", label: "Saving your book…" },
  { id: "read", label: "Reading through your textbook…" },
  { id: "chapters", label: "Finding every chapter…" },
  { id: "teacher", label: "Choosing the best teacher for this subject…" },
  { id: "finish", label: "Almost done…" },
];

type StepStatus = "pending" | "active" | "done";

function StreamingLine({ text, active }: { text: string; active: boolean }) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      return;
    }

    setDisplay("");
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setDisplay(text.slice(0, index));
      if (index >= text.length) clearInterval(timer);
    }, 16);

    return () => clearInterval(timer);
  }, [text, active]);

  return (
    <span>
      {display}
      {active && display.length < text.length && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo-300" />
      )}
    </span>
  );
}

export function UploadProgressPanel({
  phase,
  progress = 0,
  message = "",
  batchTotal = 1,
}: {
  phase: "idle" | "running" | "complete";
  progress?: number;
  message?: string;
  batchTotal?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === "idle") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setActiveIndex(0);
      return;
    }

    if (phase === "complete") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setActiveIndex(UPLOAD_STEPS.length - 1);
      return;
    }

    const derivedIndex = Math.min(
      UPLOAD_STEPS.length - 1,
      Math.floor((progress / 100) * UPLOAD_STEPS.length)
    );
    setActiveIndex(Math.max(derivedIndex, 0));
  }, [phase, progress]);

  if (phase === "idle") return null;

  function statusFor(index: number): StepStatus {
    if (phase === "complete" || index < activeIndex) return "done";
    if (index === activeIndex) return "active";
    return "pending";
  }

  const activeLabel = message || UPLOAD_STEPS[activeIndex]?.label || "Getting your book ready…";

  return (
    <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-indigo-200">
        <div className="flex items-center gap-2">
          {phase === "complete" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {phase === "complete"
            ? batchTotal > 1
              ? "Your books are ready!"
              : "Your book is ready!"
            : batchTotal > 1
              ? "Getting your books ready"
              : "Getting your book ready"}
        </div>
        {phase === "running" && progress > 0 && (
          <span className="text-xs text-indigo-300">{progress}%</span>
        )}
      </div>

      {phase === "running" && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-indigo-400 transition-all duration-500"
            style={{ width: `${Math.max(progress, 8)}%` }}
          />
        </div>
      )}

      <ul className="space-y-2.5">
        {UPLOAD_STEPS.map((step, index) => {
          const status = statusFor(index);
          const label = status === "active" && message ? activeLabel : step.label;
          return (
            <li
              key={step.id}
              className={`flex items-start gap-2.5 text-sm transition-all duration-300 ${
                status === "pending" ? "opacity-35" : "opacity-100"
              }`}
            >
              {status === "done" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : status === "active" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              )}
              <span className={status === "active" ? "text-indigo-100" : "text-slate-300"}>
                {status === "active" ? (
                  <StreamingLine text={label} active />
                ) : (
                  label
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
