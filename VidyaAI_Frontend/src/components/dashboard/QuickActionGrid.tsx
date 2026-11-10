"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type QuickAction = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  badge?: string;
};

export function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href + action.title}
            href={action.href}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/15 hover:bg-white/[0.04]"
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35"
              style={{ background: action.accent }}
            />
            <div className="relative flex items-start justify-between gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${action.accent}22`, color: action.accent }}
              >
                <Icon className="h-5 w-5" />
              </div>
              {action.badge ? (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: `${action.accent}22`, color: action.accent }}
                >
                  {action.badge}
                </span>
              ) : null}
            </div>
            <h3 className="relative mt-4 text-sm font-semibold text-slate-100">{action.title}</h3>
            <p className="relative mt-1 text-sm text-slate-500">{action.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
