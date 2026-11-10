import { COMPANY_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const stats = [
  { value: "4", label: "Exam tracks", sub: "School, JEE, NEET, Govt" },
  { value: "40m", label: "Live lectures", sub: "Tutor-style AI narration" },
  { value: "100%", label: "Page sync", sub: "Textbook-aligned visuals" },
  { value: "1", label: "Sign-in", sub: "All roles, one portal" },
];

const highlights = [
  "School · JEE · NEET · Govt tracks",
  "AI lectures synced to textbook pages",
  "Live classes with wall-clock sync",
  `Built by ${COMPANY_NAME}`,
];

export function StatsSection() {
  return (
    <section className="w-full border-y border-white/[0.06] bg-white/[0.02] py-10 md:py-12">
      <MarketingContainer>
        <Reveal>
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            One platform for every learning path
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {highlights.map((item) => (
              <span key={item} className="text-sm font-medium text-slate-500">
                {item}
              </span>
            ))}
          </div>
        </Reveal>

        <div className="marketing-grid-4 mt-10 md:mt-12">
          {stats.map((stat, index) => (
            <Reveal key={stat.label} className="min-w-0" delay={index * 80}>
              <div className="text-center md:text-left">
                <p className="text-4xl font-bold tracking-tight text-white md:text-5xl">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">{stat.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{stat.sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
