"use client";

import { useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Headphones,
  Mic,
  Monitor,
  Play,
  User,
  Users,
} from "lucide-react";
import { AI_TEACHER_NAME, APP_DOMAIN } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";
import { TextbookPagePreview } from "./TextbookPagePreview";

const tabs = [
  { id: "live", label: "Live Class" },
  { id: "admin", label: "Admin Console" },
  { id: "student", label: "Student Hub" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function LiveClassMock() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live class in progress
          </span>
          <span>Class 9 · Science</span>
        </div>
        <div className="flex flex-col items-center py-6">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-gradient-to-br from-indigo-600 to-violet-700 marketing-float">
            <User className="h-10 w-10 text-white/90" />
          </div>
          <p className="mt-3 text-sm font-semibold">{AI_TEACHER_NAME}</p>
          <p className="text-xs text-emerald-300">Speaking…</p>
        </div>
        <div className="mt-2 h-1 rounded-full bg-white/10">
          <div className="h-full w-[38%] rounded-full bg-indigo-500" />
        </div>
        <p className="mt-2 text-xs text-slate-400">12:04 / 40:00 · synced to class time</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-cyan-400" />
          Page context
        </div>
        <TextbookPagePreview caption="Textbook page · Chapter 2" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">Currently covering</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">
          Chapter 2: Is Matter Around Us Pure? — mixtures, solutions, and separation techniques.
        </p>
      </div>
    </div>
  );
}

function AdminMock() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Students", value: "248", icon: Users },
          { label: "Lectures", value: "86", icon: Mic },
          { label: "Books", value: "12", icon: BookOpen },
          { label: "Live today", value: "4", icon: Calendar },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <stat.icon className="mb-2 h-4 w-4 text-indigo-400" />
            <p className="text-lg font-bold">{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-indigo-400" />
            Content library
          </div>
          <div className="space-y-2">
            {["Science · Class 9", "Mathematics · Class 10", "Physics · JEE"].map((row) => (
              <div key={row} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                <span>{row}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Performance
          </div>
          <div className="flex h-28 items-end gap-2">
            {[40, 65, 52, 78, 61, 88].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-indigo-600 to-cyan-500 opacity-80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentMock() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[
        { label: "Live Class", desc: "Auto-synced lecture with textbook pages", icon: Mic, accent: "text-red-300" },
        { label: "Practice", desc: "Chapter tests & mock papers", icon: Play, accent: "text-violet-300" },
        { label: "AI Support", desc: "Text or voice doubts, page-aware", icon: Headphones, accent: "text-cyan-300" },
      ].map((card) => (
        <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <card.icon className={`mb-3 h-5 w-5 ${card.accent}`} />
          <p className="text-sm font-semibold">{card.label}</p>
          <p className="mt-1 text-xs text-slate-500">{card.desc}</p>
        </div>
      ))}
      <div className="md:col-span-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
        <p className="text-sm font-medium text-indigo-100">Domain-aware learning paths</p>
        <p className="mt-1 text-xs text-indigo-200/70">
          School classes, JEE, NEET, and government exam tracks — each student sees only their program content.
        </p>
      </div>
    </div>
  );
}

const mockByTab: Record<TabId, () => ReactNode> = {
  live: LiveClassMock,
  admin: AdminMock,
  student: StudentMock,
};

export function ProductShowcase() {
  const [active, setActive] = useState<TabId>("live");
  const Mock = mockByTab[active];

  return (
    <section id="product" className="w-full py-24">
      <MarketingContainer>
      <Reveal>
        <p className="section-label mb-3 text-center">Interactive demo</p>
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-bold tracking-tight md:text-4xl">
          Explore the product your clients will use every day
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
          Live classes synced to the textbook, an admin console for content and scheduling, and a student hub built for daily learning.
        </p>
      </Reveal>

      <Reveal className="mt-10" delay={120}>
        <div className="marketing-browser w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-indigo-950/40">
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1118] px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            <span className="ml-3 text-xs text-slate-500">{APP_DOMAIN}</span>
          </div>

          <div className="border-b border-white/10 bg-[#0a0e16] px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    active === tab.id
                      ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#090c12] p-4 md:p-6">
            <Mock />
          </div>
        </div>
      </Reveal>
      </MarketingContainer>
    </section>
  );
}
