"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BookDemoLink } from "./BookDemoLink";
import { MarketingContainer } from "./MarketingContainer";

const links = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#stories", label: "Solutions" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#company", label: "About" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-white/[0.08] bg-[#06080f]/90 shadow-lg shadow-black/20 backdrop-blur-xl"
          : "bg-[#06080f]/70 backdrop-blur-md"
      }`}
    >
      <MarketingContainer className="flex h-[4.5rem] items-center justify-between gap-3 md:h-20 md:gap-4">
        <div className="flex h-full min-w-0 shrink-0 items-center overflow-visible py-1">
          <BrandLogo href="/" variant="nav" />
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white lg:px-3.5 xl:px-4"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/pricing"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-teal-200 transition hover:text-teal-100 sm:inline-flex"
          >
            Pricing
          </Link>
          <Link
            href="/register"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-teal-200 transition hover:text-teal-100 sm:inline-flex"
          >
            Register
          </Link>
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <BookDemoLink className="marketing-cta hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white sm:inline-flex xl:px-5 xl:py-2.5">
            Book a demo <ArrowRight className="h-4 w-4" />
          </BookDemoLink>

          <button
            type="button"
            className="inline-flex rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </MarketingContainer>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#06080f]/98 backdrop-blur-xl lg:hidden">
          <MarketingContainer className="py-4">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
              <Link
                href="/pricing"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-teal-200 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/register"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-teal-200 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Register
              </Link>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
              <BookDemoLink
                className="marketing-cta inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Book a demo <ArrowRight className="h-4 w-4" />
              </BookDemoLink>
            </div>
          </MarketingContainer>
        </div>
      )}
    </header>
  );
}
