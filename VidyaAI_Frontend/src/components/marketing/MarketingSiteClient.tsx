"use client";

import { useCallback, useState } from "react";
import { MarketingNav } from "./MarketingNav";
import { HeroSection } from "./HeroSection";
import { StatsSection } from "./StatsSection";
import { ScrollJourneySection } from "./ScrollJourneySection";
import { MarketingBentoGallery } from "./MarketingBentoGallery";
import { ProductShowcase } from "./ProductShowcase";
import { VisualStorySection } from "./VisualStorySection";
import { FeaturesSection } from "./FeaturesSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { CompanySection } from "./CompanySection";
import { GetStartedSection } from "./GetStartedSection";
import { CTASection } from "./CTASection";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingIntroSplash } from "./MarketingIntroSplash";

export function MarketingSiteClient() {
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  return (
    <>
      {!introDone && <MarketingIntroSplash onDone={finishIntro} />}
      <div className="marketing-site marketing-theme-v2 mesh-bg min-h-screen w-full">
        <MarketingNav />
        <main className="w-full">
          <HeroSection />
          <StatsSection />
          <ScrollJourneySection />
          <MarketingBentoGallery />
          <ProductShowcase />
          <VisualStorySection />
          <FeaturesSection />
          <HowItWorksSection />
          <CompanySection />
          <GetStartedSection />
          <CTASection />
        </main>
        <MarketingFooter />
      </div>
    </>
  );
}
