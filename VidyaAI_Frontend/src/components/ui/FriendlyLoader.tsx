"use client";

import { Sparkles } from "lucide-react";

const MESSAGES = [
  "Getting things ready for you…",
  "Almost there…",
  "Preparing your learning space…",
  "Just a moment…",
];

export function FriendlyLoader({
  message,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  const text = message ?? MESSAGES[0];

  return (
    <div
      className={`flex min-h-[240px] flex-col items-center justify-center gap-6 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-indigo-500/[0.08] to-transparent px-6 py-12 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400/20" />
        <span className="absolute inset-2 animate-pulse rounded-full bg-violet-500/15" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/10 shadow-lg shadow-indigo-500/20">
          <Sparkles className="h-6 w-6 animate-pulse text-indigo-300" />
        </span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-indigo-400/80 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <p className="max-w-xs text-center text-sm text-slate-300">{text}</p>
    </div>
  );
}
