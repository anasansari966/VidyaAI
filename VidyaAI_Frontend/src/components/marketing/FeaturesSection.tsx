import {
  BarChart3,
  BookOpen,
  Calendar,
  Globe,
  Mic,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const features = [
  {
    icon: BookOpen,
    title: "Smart book ingestion",
    desc: "Upload PDF or Word files. Chapters are classified automatically — Introduction, Chapter 1, 2, 3… Long chapters split into lecture parts, not duplicate records.",
  },
  {
    icon: Mic,
    title: "AI lecture generation",
    desc: "40-minute tutor-style audio with textbook page visuals synced to narration. Students see exactly what is on screen, not mismatched script.",
  },
  {
    icon: Calendar,
    title: "Scheduled live classes",
    desc: "Admin schedules sessions; students join mid-lecture at the correct timestamp. Refresh-safe sync — like a real classroom bell.",
  },
  {
    icon: Sparkles,
    title: "Personal AI tutor",
    desc: "Students ask doubts by text or voice with chapter and page context. Support that understands where they are in the book.",
  },
  {
    icon: Globe,
    title: "Multi-domain isolation",
    desc: "School, JEE, NEET, and Govt programs are fully isolated — content, students, schedules, and analytics per track.",
  },
  {
    icon: BarChart3,
    title: "Admin analytics",
    desc: "Enrollment by domain, top performers, practice scores, and domain leaderboards — built for decisions, not vanity metrics.",
  },
  {
    icon: Users,
    title: "Student access control",
    desc: "Suspend or stop service per student. Account status flows through the entire platform instantly.",
  },
  {
    icon: Shield,
    title: "Enterprise-ready roles",
    desc: "Super admin, school admin, and student roles with one unified sign-in. Secure, scoped dashboards for each persona.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="w-full py-24">
      <MarketingContainer>
      <Reveal>
        <p className="section-label mb-3 text-center">Platform capabilities</p>
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-bold tracking-tight md:text-4xl">
          Enterprise features, polished for everyday use
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-slate-500">
          Every module in {PRODUCT_NAME} is built to mirror how real schools and coaching centers operate.
        </p>
      </Reveal>

      <div className="marketing-grid-4 mt-14">
        {features.map((feature, index) => (
          <Reveal key={feature.title} className="h-full min-w-0" delay={index * 60}>
            <div className="marketing-feature-card group h-full rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6">
              <div className="mb-4 inline-flex rounded-xl bg-indigo-500/10 p-3 ring-1 ring-indigo-500/20 transition group-hover:bg-indigo-500/20">
                <feature.icon className="h-5 w-5 text-indigo-300" />
              </div>
              <h3 className="font-semibold text-slate-100">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{feature.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
      </MarketingContainer>
    </section>
  );
}
