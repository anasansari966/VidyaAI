import { BookDemoLink } from "./BookDemoLink";
import { ArrowRight, CheckCircle2, Play, Sparkles } from "lucide-react";
import { COMPANY_TAGLINE, PRODUCT_NAME } from "@/lib/brand";
import { marketingImages } from "@/lib/marketingImages";
import { MarketingImage } from "./MarketingImage";
import { MarketingContainer } from "./MarketingContainer";

const highlights = [
  "AI lectures synced to textbook pages",
  "Live classes with wall-clock sync",
  "School · JEE · NEET · Govt tracks",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-24 pb-16 md:pt-28 md:pb-20 lg:pt-32 lg:pb-24">
      <div className="marketing-grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="marketing-orb marketing-orb-1" aria-hidden />
      <div className="marketing-orb marketing-orb-2" aria-hidden />

      <MarketingContainer className="relative">
        <div className="grid w-full min-w-0 items-center gap-12 lg:grid-cols-2 lg:gap-12 xl:gap-16 2xl:gap-20">
          <div className="min-w-0">
            <p className="hero-fade hero-delay-1 mb-6 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-4 py-1.5 text-sm text-teal-100 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {COMPANY_TAGLINE}
            </p>

            <h1 className="hero-fade hero-delay-2 text-4xl font-bold leading-[1.08] tracking-tight text-white md:text-5xl xl:text-6xl">
              The complete platform to{" "}
              <span className="marketing-gradient-text">teach, track, and transform</span> learning
            </h1>

            <p className="hero-fade hero-delay-3 mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              {PRODUCT_NAME} turns your curriculum books into live, AI-narrated classes — with admin analytics, student practice, and page-aware support in one professional suite.
            </p>

            <ul className="hero-fade hero-delay-4 mt-8 space-y-3">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="hero-fade hero-delay-5 mt-10 flex flex-wrap gap-4">
              <BookDemoLink className="marketing-cta inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white">
                Book a demo <ArrowRight className="h-4 w-4" />
              </BookDemoLink>
              <a
                href="#product"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/[0.07]"
              >
                <Play className="h-4 w-4" /> Watch product tour
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full min-w-0 max-w-xl lg:max-w-none">
            <div className="hero-bento-grid">
              <div className="hero-bento-main marketing-hero-frame group relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-teal-950/30">
                <MarketingImage
                  src={marketingImages.hero.src}
                  alt={marketingImages.hero.alt}
                  fill
                  priority
                  sizes="(max-width: 1024px) 90vw, 540px"
                  className="scale-105 transition duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/90 via-[#06080f]/10 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-[#0a0e16]/90 p-4 backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">Live Class · Science</p>
                      <p className="text-xs text-slate-400">Chapter 2 · 12:04 synced · 32 students</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-bento-accent marketing-float overflow-hidden rounded-2xl border border-amber-400/20 shadow-xl shadow-amber-950/20">
                <div className="relative h-full min-h-[120px] w-full">
                  <MarketingImage
                    src={marketingImages.heroAccent.src}
                    alt={marketingImages.heroAccent.alt}
                    fill
                    priority
                    eager
                    sizes="220px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
                </div>
              </div>

              <div className="hero-bento-classroom overflow-hidden rounded-2xl border border-violet-400/20 shadow-lg shadow-violet-950/20">
                <div className="relative h-full min-h-[100px] w-full">
                  <MarketingImage
                    src={marketingImages.classroom.src}
                    alt={marketingImages.classroom.alt}
                    fill
                    priority
                    eager
                    sizes="220px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/50 to-transparent" />
                </div>
              </div>

              <div className="hero-bento-study overflow-hidden rounded-2xl border border-cyan-400/20 shadow-lg">
                <div className="relative h-full min-h-[88px] w-full">
                  <MarketingImage
                    src={marketingImages.study.src}
                    alt={marketingImages.study.alt}
                    fill
                    priority
                    eager
                    sizes="180px"
                  />
                </div>
              </div>
            </div>

            <div className="marketing-float-delay absolute -bottom-2 left-2 rounded-2xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 backdrop-blur-md sm:left-4">
              <p className="text-2xl font-bold text-white">40 min</p>
              <p className="text-xs text-indigo-200/80">AI lecture per session</p>
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
