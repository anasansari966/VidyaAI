"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LineChart,
  PlayCircle,
  Sparkles,
  Upload,
} from "lucide-react";
import { MarketingContainer } from "./MarketingContainer";
import { Reveal } from "./Reveal";

const JOURNEY_STEPS = [
  {
    id: "upload",
    step: "01",
    label: "Upload curriculum",
    desc: "Drop your PDF textbook — chapters classify automatically. Introduction, Chapter 1, 2, 3… all mapped in seconds.",
    icon: Upload,
    color: "#2dd4bf",
  },
  {
    id: "generate",
    step: "02",
    label: "Generate lectures",
    desc: "AI builds warm, spoken classes in English, Hindi, or Hinglish. Each lecture is ~40 minutes of tutor-style narration.",
    icon: Sparkles,
    color: "#fbbf24",
  },
  {
    id: "live",
    step: "03",
    label: "Run live class",
    desc: "Textbook pages sync on screen while students listen in real time. Late joiners land at the correct minute.",
    icon: PlayCircle,
    color: "#a78bfa",
  },
  {
    id: "practice",
    step: "04",
    label: "Practice & exams",
    desc: "CBSE-style papers, handwritten uploads, and AI grading — aligned to your curriculum chapters.",
    icon: BookOpen,
    color: "#f472b6",
  },
  {
    id: "insights",
    step: "05",
    label: "Track progress",
    desc: "Analytics for admins — scores, completion rates, growth trends, and domain leaderboards.",
    icon: LineChart,
    color: "#38bdf8",
  },
] as const;

export function ScrollJourneySection() {
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const nodes = stepRefs.current.filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - window.innerHeight * 0.35) -
              Math.abs(b.boundingClientRect.top - window.innerHeight * 0.35)
          );

        if (!visible.length) return;

        const index = Number(visible[0].target.getAttribute("data-step-index"));
        if (!Number.isNaN(index)) {
          setActiveIndex(index);
        }
      },
      { root: null, rootMargin: "-20% 0px -45% 0px", threshold: [0, 0.25, 0.5] }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section className="journey-section relative py-16 md:py-24" aria-label="Learning journey">
      <div className="journey-section-glow pointer-events-none absolute inset-0" aria-hidden />

      <MarketingContainer className="relative">
        <Reveal>
          <p className="section-label mb-3 text-center">Your learning journey</p>
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            From{" "}
            <span className="marketing-gradient-text">upload to outcomes</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400 md:text-base">
            Five steps that take you from curriculum upload to measurable student
            progress — scroll naturally through each stage.
          </p>
        </Reveal>

        <div className="mt-8 hidden justify-center gap-2 md:flex" aria-hidden>
          {JOURNEY_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i <= activeIndex ? "w-10 bg-gradient-to-r from-teal-400 to-violet-400" : "w-4 bg-white/10"
              }`}
            />
          ))}
        </div>

        <div className="relative mt-10 md:mt-14">
          <div className="journey-connector hidden md:block" aria-hidden />

          <ol className="relative space-y-5 md:space-y-7">
            {JOURNEY_STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === activeIndex;
              const isDone = i < activeIndex;

              return (
                <Reveal key={s.id} delay={i * 60}>
                  <li className="list-none">
                    <article
                      ref={(node) => {
                        stepRefs.current[i] = node;
                      }}
                      data-step-index={i}
                      className={`journey-step-card group relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-500 md:p-8 ${
                        isActive
                          ? "border-white/15 shadow-xl"
                          : isDone
                            ? "border-white/10"
                            : "border-white/[0.06]"
                      }`}
                      style={
                        isActive
                          ? {
                              borderColor: `${s.color}44`,
                              background: `linear-gradient(135deg, ${s.color}14 0%, rgba(10,14,22,0.88) 50%)`,
                              boxShadow: `0 20px 48px ${s.color}18`,
                            }
                          : {
                              background: "rgba(10,14,22,0.55)",
                            }
                      }
                    >
                      <span
                        className="pointer-events-none absolute right-4 top-2 select-none text-6xl font-black leading-none opacity-[0.05] md:text-7xl"
                        aria-hidden
                        style={{ color: s.color }}
                      >
                        {s.step}
                      </span>

                      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-transform duration-500 md:h-16 md:w-16 ${
                            isActive ? "scale-105" : "group-hover:scale-105"
                          }`}
                          style={{
                            background: `${s.color}${isActive ? "35" : "18"}`,
                            border: `1.5px solid ${s.color}${isActive ? "88" : "44"}`,
                            boxShadow: isActive
                              ? `0 0 32px ${s.color}33`
                              : undefined,
                          }}
                        >
                          <Icon
                            className="h-6 w-6 md:h-7 md:w-7"
                            strokeWidth={1.75}
                            style={{ color: s.color }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="text-xs font-bold uppercase tracking-wider"
                              style={{ color: s.color }}
                            >
                              Step {s.step}
                            </span>
                            {isActive && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: `${s.color}22`,
                                  color: s.color,
                                }}
                              >
                                In view
                              </span>
                            )}
                            {isDone && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                ✓ Done
                              </span>
                            )}
                          </div>
                          <h3 className="mt-2 text-xl font-semibold text-white md:text-2xl">
                            {s.label}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-400 md:text-base">
                            {s.desc}
                          </p>
                        </div>
                      </div>
                    </article>
                  </li>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </MarketingContainer>
    </section>
  );
}
