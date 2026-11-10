"use client";

import { Suspense } from "react";
import StudentLecturesInner from "./LecturesInner";

export default function StudentLecturesPage() {
  return (
    <Suspense fallback={<div className="mesh-bg min-h-screen p-8 text-slate-400">Loading class…</div>}>
      <StudentLecturesInner />
    </Suspense>
  );
}
