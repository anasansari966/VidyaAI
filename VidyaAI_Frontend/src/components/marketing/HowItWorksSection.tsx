import {
  AdminAnalyticsAppShot,
  BookUploadAppShot,
  LectureGenerateAppShot,
  ScheduleAppShot,
} from "./AppScreenshots";
import { PRODUCT_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const steps = [
  {
    step: "01",
    title: "Upload your books",
    desc: `Admins upload curriculum PDFs. ${PRODUCT_NAME} extracts pages, classifies Introduction and chapters, and maps textbook visuals.`,
    shot: BookUploadAppShot,
  },
  {
    step: "02",
    title: "Generate lectures",
    desc: "Select chapters and generate AI narration, audio, and page-synced visuals. Long chapters become Part 1, 2, 3 automatically.",
    shot: LectureGenerateAppShot,
  },
  {
    step: "03",
    title: "Schedule live classes",
    desc: "Set class, subject, and timetable. Students who join late land at the current minute — no rewinding from zero.",
    shot: ScheduleAppShot,
  },
  {
    step: "04",
    title: "Learn & measure",
    desc: "Students attend live class, practice papers, and AI support. Admins track performance by domain and exam type.",
    shot: AdminAnalyticsAppShot,
  },
];

const SHOT_HEIGHT = "h-[248px]";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="w-full border-y border-white/[0.06] bg-white/[0.015] py-24">
      <MarketingContainer>
        <Reveal>
          <p className="section-label mb-3 text-center">How it works</p>
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight md:text-4xl">
            From textbook to live class in four steps
          </h2>
        </Reveal>

        <div className="marketing-grid-4 mt-14 items-stretch">
          {steps.map((item, index) => {
            const Shot = item.shot;
            return (
              <Reveal key={item.step} className="h-full" delay={index * 80}>
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e16]/60 transition hover:border-indigo-500/25">
                  <div className={`relative ${SHOT_HEIGHT} shrink-0 overflow-hidden border-b border-white/[0.06] bg-[#06080f]`}>
                    <Shot compact className="h-full" />
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-indigo-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-indigo-950/40">
                      {item.step}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-lg font-semibold leading-snug text-white">{item.title}</h3>
                    <p className="mt-2 min-h-[5.5rem] flex-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </MarketingContainer>
    </section>
  );
}
