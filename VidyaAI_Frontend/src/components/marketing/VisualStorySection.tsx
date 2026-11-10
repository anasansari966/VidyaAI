import {
  AdminAnalyticsAppShot,
  AdminPipelineAppShot,
  LiveClassAppShot,
} from "./AppScreenshots";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const stories = [
  {
    title: "Live classes that feel real",
    desc: "Students join at the current minute — refresh-safe, schedule-driven, and paired with the exact textbook page on screen. Late joiners catch up; no one rewinds from zero.",
    shot: LiveClassAppShot,
    points: ["Wall-clock lecture sync", "Textbook page context panel", "Teacher-style AI narration"],
  },
  {
    title: "Admin control from upload to analytics",
    desc: "Upload PDFs, auto-classify chapters, generate lectures, schedule sessions, and monitor performance across domains — without juggling five different tools.",
    shot: AdminPipelineAppShot,
    points: ["Book & chapter pipeline", "Schedule & access control", "Domain-scoped dashboards"],
    reverse: true,
  },
  {
    title: "Insights that drive outcomes",
    desc: "See enrollment by program, top performers, practice completion, and exam-type score trends. Built for principals and coaching directors who need clarity, not clutter.",
    shot: AdminAnalyticsAppShot,
    points: ["Leaderboards by domain", "Practice & mock tracking", "Student access management"],
  },
];

export function VisualStorySection() {
  return (
    <section id="stories" className="w-full py-24">
      <MarketingContainer>
      <Reveal>
        <p className="section-label mb-3">Solutions</p>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          Designed for every stakeholder in your institution
        </h2>
      </Reveal>

      <div className="mt-16 space-y-24">
        {stories.map((story, index) => {
          const Shot = story.shot;
          return (
            <Reveal key={story.title} delay={index * 100}>
              <div
                className={`grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16 2xl:gap-24 ${
                  story.reverse ? "lg:[direction:rtl]" : ""
                }`}
              >
                <div className={`${story.reverse ? "lg:[direction:ltr]" : ""}`}>
                  <Shot />
                </div>

                <div className={`${story.reverse ? "lg:[direction:ltr]" : ""}`}>
                  <h3 className="text-2xl font-bold text-white md:text-3xl">{story.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-400">{story.desc}</p>
                  <ul className="mt-6 space-y-3">
                    {story.points.map((point) => (
                      <li key={point} className="flex items-center gap-3 text-sm text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
      </MarketingContainer>
    </section>
  );
}
