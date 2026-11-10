import { Building2, Rocket, ShieldCheck } from "lucide-react";
import { COMPANY_EMAIL, COMPANY_LINKEDIN, COMPANY_NAME, PRODUCT_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const pillars = [
  {
    icon: Building2,
    title: "Built by Desalia Solution Pvt Ltd",
    desc: `${PRODUCT_NAME} is developed and maintained by Desalia Solution Pvt Ltd — focused on practical EdTech for Indian schools and coaching institutes.`,
  },
  {
    icon: Rocket,
    title: "Fresh, purpose-built platform",
    desc: "A new product designed from the ground up for AI lectures, live sync, and domain-scoped learning — not a patchwork of legacy tools.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-ready from day one",
    desc: "Role-based access, program isolation, admin analytics, and student lifecycle controls — ready for pilots and institutional rollouts.",
  },
];

export function CompanySection() {
  return (
    <section id="company" className="w-full border-y border-white/[0.06] bg-white/[0.015] py-24">
      <MarketingContainer>
        <Reveal>
          <p className="section-label mb-3 text-center">About {PRODUCT_NAME}</p>
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight md:text-4xl">
            A new learning platform from {COMPANY_NAME}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            We are a fresh startup building {PRODUCT_NAME} to help institutions deliver textbook-aligned AI classes,
            structured practice, and clear performance insights — all in one place.
          </p>
        </Reveal>

        <div className="marketing-grid-3 mt-14">
          {pillars.map((item, index) => (
            <Reveal key={item.title} className="h-full min-w-0" delay={index * 100}>
              <article className="marketing-feature-card h-full rounded-2xl border border-white/10 bg-[#0a0e16]/60 p-6">
                <div className="mb-4 inline-flex rounded-xl bg-indigo-500/10 p-3 ring-1 ring-indigo-500/20">
                  <item.icon className="h-5 w-5 text-indigo-300" />
                </div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          Contact us at{" "}
          <a href={`mailto:${COMPANY_EMAIL}`} className="text-cyan-300 transition hover:text-cyan-200">
            {COMPANY_EMAIL}
          </a>{" "}
          ·{" "}
          <a
            href={COMPANY_LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 transition hover:text-cyan-200"
          >
            LinkedIn
          </a>
        </p>
      </MarketingContainer>
    </section>
  );
}
