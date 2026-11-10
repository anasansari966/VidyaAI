"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SupportChatView } from "@/components/student/SupportChatView";

function ChatInner() {
  const searchParams = useSearchParams();
  const subject = searchParams.get("subject") ?? "";
  const chapterId = Number(searchParams.get("chapter"));
  const bookPage = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const chapterLabel = searchParams.get("label") ?? undefined;

  if (!subject || !chapterId || Number.isNaN(chapterId)) {
    return <p className="text-center text-slate-400">Select a subject and chapter first.</p>;
  }

  return (
    <SupportChatView
      subject={subject}
      chapterId={chapterId}
      bookPage={bookPage}
      chapterLabel={chapterLabel ?? undefined}
    />
  );
}

export default function SupportChatPage() {
  return (
    <DashboardShell title="AI Support">
      <Suspense fallback={<p className="text-slate-400">Loading support…</p>}>
        <ChatInner />
      </Suspense>
    </DashboardShell>
  );
}
