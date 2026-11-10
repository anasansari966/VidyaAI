import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { marketingImages } from "@/lib/marketingImages";
import { MarketingImage } from "./MarketingImage";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";
import { BookDemoLink } from "./BookDemoLink";

export function CTASection() {
  return (
    <section className="w-full py-12">
      <MarketingContainer>
        <Reveal className="w-full">
          <div className="relative w-full overflow-hidden rounded-3xl border border-white/10">
            <div className="absolute inset-0">
              <MarketingImage src={marketingImages.cta.src} alt={marketingImages.cta.alt} fill eager sizes="100vw" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#06080f]/95 via-[#06080f]/75 to-[#06080f]/40" />
            </div>

            <div className="relative grid min-h-[280px] w-full items-center gap-8 px-8 py-14 lg:min-h-[320px] lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-16 xl:px-16">
              <div className="text-center lg:text-left">
                <p className="text-sm font-semibold uppercase tracking-widest text-indigo-300">
                  Ready to impress your stakeholders?
                </p>
                <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl xl:text-5xl">
                  Launch {PRODUCT_NAME} at your institution this semester
                </h2>
                <p className="mt-4 text-base text-slate-300 lg:max-w-2xl xl:text-lg">
                  Book a personalized demo and see live classes, admin analytics, and AI tutoring in one platform.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
                  <BookDemoLink className="marketing-cta inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white">
                    Book a demo <ArrowRight className="h-4 w-4" />
                  </BookDemoLink>
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Student register
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Student pricing
                  </Link>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:block">
                <div className="relative aspect-[16/10] min-h-[220px] w-full">
                  <MarketingImage
                    src={marketingImages.focus.src}
                    alt={marketingImages.focus.alt}
                    fill
                    eager
                    sizes="(max-width: 1024px) 0px, 40vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </MarketingContainer>
    </section>
  );
}
