import { ArrowRight, Building2, GraduationCap, Stethoscope } from "lucide-react";
import { marketingImages } from "@/lib/marketingImages";
import { MarketingImage } from "./MarketingImage";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";
import { BookDemoLink } from "./BookDemoLink";

const audiences = [
  {
    title: "Schools (Class 1–12)",
    desc: "Upload NCERT-aligned books, run live AI classes, and track student progress by class and subject.",
    icon: GraduationCap,
    gradient: "from-indigo-500 to-blue-600",
  },
  {
    title: "JEE & NEET coaching",
    desc: "Domain-isolated content, mock analytics, and lecture sync built for competitive exam institutes.",
    icon: Building2,
    gradient: "from-cyan-500 to-teal-600",
  },
  {
    title: "Government exam prep",
    desc: "Structured curriculum delivery with admin control, practice tracking, and scalable scheduling.",
    icon: Stethoscope,
    gradient: "from-violet-500 to-purple-600",
  },
];

export function GetStartedSection() {
  return (
    <section id="get-started" className="relative w-full overflow-hidden py-24">
      <div className="absolute inset-0 opacity-30">
        <MarketingImage src={marketingImages.library.src} alt="" fill eager sizes="100vw" />
        <div className="absolute inset-0 bg-[#06080f]/90" />
      </div>

      <MarketingContainer className="relative">
        <Reveal>
          <p className="section-label mb-3 text-center">Schedule a demo</p>
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight md:text-4xl">
            Built for every type of learning institution
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            Tell us about your school or coaching center — we&apos;ll show you a tailored walkthrough.
          </p>
        </Reveal>

        <div className="marketing-grid-3 mt-12">
          {audiences.map((item, index) => (
            <Reveal key={item.title} className="h-full min-w-0" delay={index * 100}>
              <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-[#0a0e16]/80 p-8 backdrop-blur-md transition hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-950/30">
                <div className={`mb-5 inline-flex w-fit rounded-2xl bg-gradient-to-br ${item.gradient} p-3.5 shadow-lg`}>
                  <item.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{item.desc}</p>
                <BookDemoLink className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/10 transition group-hover:bg-indigo-500/20 group-hover:ring-indigo-500/30">
                  Book a demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </BookDemoLink>
              </div>
            </Reveal>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
