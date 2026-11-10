"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ClassroomView } from "@/components/student/ClassroomView";

function ClassroomInner() {
  const searchParams = useSearchParams();
  const lectureId = Number(searchParams.get("lecture"));
  const replayMode = searchParams.get("replay") === "1";

  if (!lectureId || Number.isNaN(lectureId)) {
    return <p className="text-center text-slate-400">Invalid lecture session.</p>;
  }

  return (
    <DashboardShell title={replayMode ? "Recorded session" : "Live class"}>
      <ClassroomView lectureId={lectureId} replayMode={replayMode} />
    </DashboardShell>
  );
}

export default function StudentClassroomPage() {
  return (
    <Suspense fallback={<div className="mesh-bg min-h-screen p-8 text-slate-400">Loading class…</div>}>
      <ClassroomInner />
    </Suspense>
  );
}
