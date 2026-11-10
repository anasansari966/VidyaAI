"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function FocusShell({
  children,
  backHref = "/dashboard/student",
  backLabel = "Back",
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    router.push(backHref);
  }

  return (
    <div className="mesh-bg min-h-screen">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="flex h-12 items-center px-3 sm:px-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        </div>
      </header>
      <main className="min-h-screen px-3 pb-6 pt-14 sm:px-5 sm:pt-16">{children}</main>
    </div>
  );
}
