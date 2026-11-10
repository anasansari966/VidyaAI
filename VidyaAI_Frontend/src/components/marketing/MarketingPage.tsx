import { MarketingNav } from "./MarketingNav";
import { HeroSection } from "./HeroSection";
import { StatsSection } from "./StatsSection";
import { ProductShowcase } from "./ProductShowcase";
import { VisualStorySection } from "./VisualStorySection";
import { FeaturesSection } from "./FeaturesSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { CompanySection } from "./CompanySection";
import { GetStartedSection } from "./GetStartedSection";
import { CTASection } from "./CTASection";
import { MarketingFooter } from "./MarketingFooter";

export function MarketingPage() {
  return (
    <div className="marketing-site mesh-bg min-h-screen w-full">
      <MarketingNav />
      <main className="w-full">
        <HeroSection />
        <StatsSection />
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
  );
}
