"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { AiVoicePlayer } from "@/components/student/AiVoicePlayer";
import { Mic, Send } from "lucide-react";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  transcript?: string;
  audioUrl?: string;
};

function pickRecorderMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return ".m4a";
  if (mimeType.includes("ogg")) return ".ogg";
  return ".webm";
}

export function SupportChatView({
  subject,
  chapterId,
  bookPage,
  chapterLabel,
}: {
  subject: string;
  chapterId: number;
  bookPage?: number;
  chapterLabel?: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number>(0);
  const mimeTypeRef = useRef("audio/webm");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const touchActiveRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setHistoryLoading(true);
    api
      .supportHistory({ subject, chapter_id: chapterId })
      .then((res) => {
        if (cancelled) return;
        setMessages(
          (res.messages || [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              audioUrl: m.audio_url ?? undefined,
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject, chapterId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, recording]);

  useEffect(() => {
    return () => {
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function sendText() {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await api.supportChat({
        message: userMsg,
        subject,
        chapter_id: chapterId,
        book_page_number: bookPage || undefined,
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply, audioUrl: res.audio_url ?? undefined }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: err instanceof Error ? err.message : "Support unavailable." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (loading || historyLoading || startingRef.current) return;
    if (mediaRef.current && mediaRef.current.state !== "inactive") return;
    startingRef.current = true;
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRef.current = null;

        const durationMs = Date.now() - recordStartedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        if (durationMs < 700 || blob.size < 1000) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Recording too short. Hold the microphone a little longer and try again." },
          ]);
          return;
        }

        const ext = extensionForMime(mimeTypeRef.current);
        const form = new FormData();
        form.append("audio", blob, `voice${ext}`);
        form.append("subject", subject);
        form.append("chapter_id", String(chapterId));

        setLoading(true);
        try {
          const res = await api.supportVoice(form);
          setMessages((m) => [
            ...m,
            { role: "user", content: res.transcript || "Voice message", transcript: res.transcript ?? undefined },
            { role: "assistant", content: res.reply, audioUrl: res.audio_url ?? undefined },
          ]);
        } catch (err) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: err instanceof Error ? err.message : "Voice support failed." },
          ]);
        } finally {
          setLoading(false);
        }
      };
      mediaRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      recorder.start(250);
    } catch {
      setRecording(false);
      setMessages((m) => [...m, { role: "assistant", content: "Microphone access is required for voice support." }]);
    } finally {
      startingRef.current = false;
    }
  }

  function stopRecording() {
    setRecording(false);
    if (!mediaRef.current || mediaRef.current.state === "inactive") return;
    mediaRef.current.stop();
  }

  function handlePressStart(e: SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    void startRecording();
  }

  function handlePressEnd(e: SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    stopRecording();
  }

  return (
    <div className="glass relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col rounded-2xl">
      <div className="border-b border-white/10 px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-slate-200">{subject}</p>
        <p className="text-xs text-slate-400">
          {chapterLabel ? `${chapterLabel} — ` : ""}
          Answers only from this chapter · Hindi questions get Hinglish replies (English letters)
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {historyLoading ? (
          <FriendlyLoader message="Loading this chapter’s chat history…" className="min-h-[160px] py-8" />
        ) : !messages.length ? (
          <p className="text-center text-slate-400">
            Ask about topics from this chapter. Previous questions for this chapter will appear here.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={m.id ?? `${m.role}-${i}-${m.content.slice(0, 24)}`}
            className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm sm:max-w-[85%] ${
              m.role === "user" ? "ml-auto bg-indigo-600/40" : "bg-white/5 text-slate-200"
            }`}
          >
            {m.transcript && <p className="mb-1 text-xs text-slate-400">🎤 {m.transcript}</p>}
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.audioUrl && (
              <AiVoicePlayer src={api.supportAudioUrl(m.audioUrl)} label="Tap to hear the reply" />
            )}
          </div>
        ))}
        {loading && (
          <div className="py-2">
            <FriendlyLoader message="Your helper is thinking…" className="min-h-[120px] py-6" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {recording && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-slate-950/90 px-4 py-3 shadow-lg backdrop-blur">
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
              <span className="absolute inset-1 animate-pulse rounded-full bg-rose-500/25" />
              <Mic className="relative h-5 w-5 text-rose-300" />
            </span>
            <div>
              <p className="text-sm font-medium text-rose-100">Listening…</p>
              <p className="text-xs text-slate-400">Release to send your question</p>
            </div>
            <div className="ml-1 flex h-8 items-end gap-0.5 px-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 origin-bottom animate-bounce rounded-full bg-rose-400"
                  style={{
                    height: `${12 + (i % 3) * 6}px`,
                    animationDelay: `${i * 100}ms`,
                    animationDuration: "700ms",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-white/10 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
        >
          <input
            className="input-field flex-1"
            placeholder="Ask about this chapter…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || recording || historyLoading}
          />
          <Button type="submit" disabled={loading || recording || historyLoading}>
            <Send className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button !== 0 || touchActiveRef.current) return;
              handlePressStart(e);
            }}
            onMouseUp={(e) => {
              if (touchActiveRef.current) return;
              handlePressEnd(e);
            }}
            onMouseLeave={() => {
              if (!touchActiveRef.current && recording) stopRecording();
            }}
            onTouchStart={(e) => {
              touchActiveRef.current = true;
              handlePressStart(e);
            }}
            onTouchEnd={(e) => {
              handlePressEnd(e);
              window.setTimeout(() => {
                touchActiveRef.current = false;
              }, 400);
            }}
            onTouchCancel={(e) => {
              handlePressEnd(e);
              touchActiveRef.current = false;
            }}
            disabled={loading || historyLoading}
            aria-pressed={recording}
            aria-label="Hold to record voice"
            title="Hold to record voice"
            className={`relative flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-xl [-webkit-touch-callout:none] [-webkit-user-select:none] ${
              recording
                ? "bg-rose-500 text-white shadow-[0_0_0_4px_rgba(244,63,94,0.25)]"
                : "bg-white/10 text-slate-200 hover:bg-white/15"
            }`}
            style={{ WebkitTouchCallout: "none", userSelect: "none", touchAction: "none" }}
          >
            {recording && (
              <>
                <span className="pointer-events-none absolute inset-0 animate-ping rounded-xl bg-rose-400/35" />
                <span className="pointer-events-none absolute -inset-1 animate-pulse rounded-2xl border border-rose-300/40" />
              </>
            )}
            <Mic className={`relative h-4 w-4 ${recording ? "scale-110" : ""}`} />
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          {recording ? "Listening… release when you finish speaking" : "Hold the mic to ask with your voice"}
        </p>
      </div>
    </div>
  );
}
