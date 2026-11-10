import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BookDemoForm } from "@/components/marketing/BookDemoForm";
import { MarketingContainer } from "@/components/marketing/MarketingContainer";

export const metadata: Metadata = {
  title: `Book a Demo — ${PRODUCT_NAME}`,
  description: `Schedule a personalized ${PRODUCT_NAME} demo for your school or coaching institute.`,
};

export default function BookDemoPage() {
  return (
    <div className="marketing-site mesh-bg min-h-screen w-full">
      <header className="border-b border-white/[0.06] bg-[#06080f]/80 backdrop-blur-xl">
        <MarketingContainer className="flex h-20 items-center justify-between py-4">
          <BrandLogo href="/" height={56} />
          <Link
            href="/"
            className="text-sm font-medium text-slate-400 transition hover:text-white"
          >
            ← Back to home
          </Link>
        </MarketingContainer>
      </header>

      <main className="w-full py-12 md:py-16 lg:py-20">
        <MarketingContainer>
          <BookDemoForm />
        </MarketingContainer>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Desalia Solution Pvt Ltd · {PRODUCT_NAME}
      </footer>
    </div>
  );
}
