"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PRODUCT_NAME } from "@/lib/brand";

export function MarketingIntroSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"logo" | "ring" | "out">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("ring"), 600);
    const t2 = setTimeout(() => setPhase("out"), 1800);
    const t3 = setTimeout(onDone, 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDone]);

  if (phase === "out") {
    return (
      <div className="intro-splash intro-splash-out fixed inset-0 z-[100] flex items-center justify-center bg-[#0c1220]">
        <div className="intro-logo-pulse text-center">
          <BrandLogo href={null} height={72} imagePosition="center" className="mx-auto" />
          <p className="mt-4 text-sm uppercase tracking-[0.35em] text-teal-300/80">Welcome to</p>
          <p className="mt-2 text-3xl font-bold text-white">{PRODUCT_NAME}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="intro-splash fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#0c1220]">
      <div className="intro-ring intro-ring-1" aria-hidden />
      <div className="intro-ring intro-ring-2" aria-hidden />
      <div className="intro-ring intro-ring-3" aria-hidden />
      <div className="relative text-center">
        <BrandLogo
          href={null}
          height={80}
          imagePosition="center"
          className="intro-logo-rise mx-auto mb-6"
        />
        <p className="intro-logo-rise text-sm uppercase tracking-[0.35em] text-teal-300/90">Loading experience</p>
        <p className="intro-logo-rise intro-delay-2 mt-3 text-2xl font-bold text-white">{PRODUCT_NAME}</p>
        <div className="intro-progress-track mx-auto mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="intro-progress-bar h-full rounded-full bg-gradient-to-r from-teal-400 via-amber-400 to-violet-500" />
        </div>
      </div>
    </div>
  );
}
