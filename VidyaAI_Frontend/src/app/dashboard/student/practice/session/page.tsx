"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { PracticeSessionView } from "@/components/student/PracticeSessionView";

function SessionInner() {
  const searchParams = useSearchParams();
  const paperId = Number(searchParams.get("paper"));

  if (!paperId || Number.isNaN(paperId)) {
    return <p className="text-center text-slate-400">Invalid practice session.</p>;
  }

  return <PracticeSessionView paperId={paperId} />;
}

export default function PracticeSessionPage() {
  return (
    <DashboardShell title="Practice exam">
      <Suspense fallback={<p className="text-slate-400">Loading practice…</p>}>
        <SessionInner />
      </Suspense>
    </DashboardShell>
  );
}
