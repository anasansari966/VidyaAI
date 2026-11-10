import { ArrowRight, ExternalLink, Mail, MapPin } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  COMPANY_EMAIL,
  COMPANY_LINKEDIN,
  COMPANY_NAME,
  COMPANY_TAGLINE,
  PRODUCT_NAME,
} from "@/lib/brand";
import { MarketingContainer } from "./MarketingContainer";
import { BookDemoLink } from "./BookDemoLink";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Live Class", href: "#product" },
      { label: "Admin Console", href: "#product" },
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#company" },
      { label: "Solutions", href: "#stories" },
      { label: "Book a demo", href: "/book-demo", external: true },
      { label: "Pricing", href: "/pricing", external: true },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Programs",
    links: [
      { label: "School (Class 1–12)", href: "#get-started" },
      { label: "JEE & NEET", href: "#get-started" },
      { label: "Government exams", href: "#get-started" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="w-full border-t border-cyan-500/10 bg-[#020617]">
      <MarketingContainer className="py-16">
        <div className="grid w-full gap-12 lg:grid-cols-5 lg:gap-16">
          <div className="lg:col-span-2">
            <BrandLogo href="/" height={72} className="lg:!h-[88px] lg:!w-[117px]" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              Enterprise-grade AI learning for schools and exam preparation institutes.
            </p>
            <div className="mt-6 space-y-2 text-sm text-slate-500">
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-slate-600" />
                <a
                  href={`mailto:${COMPANY_EMAIL}`}
                  className="transition hover:text-cyan-200"
                >
                  {COMPANY_EMAIL}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-600" />
                <a
                  href={COMPANY_LINKEDIN}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-cyan-200"
                >
                  {COMPANY_NAME} on LinkedIn
                </a>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-slate-600" /> India
              </p>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-white">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <BookDemoLink className="text-sm text-slate-500 transition hover:text-slate-300">
                        {link.label}
                      </BookDemoLink>
                    ) : (
                      <a href={link.href} className="text-sm text-slate-500 transition hover:text-slate-300">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-cyan-500/10 pt-8 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-xs text-slate-600">
              © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
            </p>
            <p className="mt-1 text-xs text-slate-500">{COMPANY_TAGLINE}</p>
          </div>
          <BookDemoLink className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 hover:text-cyan-200">
            Book a demo <ArrowRight className="h-4 w-4" />
          </BookDemoLink>
        </div>
      </MarketingContainer>
    </footer>
  );
}
