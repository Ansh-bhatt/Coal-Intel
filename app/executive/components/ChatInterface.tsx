"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, CornerDownLeft, Sparkles } from "lucide-react";
import ResponseCard from "./ResponseCard";
import { SUGGESTED_PROMPTS } from "@/lib/mockData";
import { uid } from "@/lib/utils";
import { streamChat, type CitationDto, type ChatRequest } from "@/lib/api";
import { usePortalStore } from "@/store/portalStore";
import type { ChatMessage } from "@/lib/types";

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  content:
    "Good day. I am the **CIL Search Studio engine**. Ask me about production, overburden removal, dispatch or capital expenditure — I will trace the answer back to its source document.",
  timestamp: Date.now(),
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setActiveChatSessionId = usePortalStore((s) => s.setActiveChatSessionId);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  // Cleanup in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      setMessages((prev) => [
        ...prev,
        { id: uid("msg"), role: "user", content: text, timestamp: Date.now() },
      ]);
      setInput("");

      const assistantId = uid("msg");
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);
      setStreaming(true);

      const payload: ChatRequest = { message: text, session_id: sessionId };
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        await streamChat(
          payload,
          {
            onToken: (token) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + token, timestamp: Date.now() }
                    : m,
                ),
              );
            },
            onCitations: (citations: CitationDto[]) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        citations: citations.map((c) => ({
                          id: c.id,
                          documentName: c.documentName,
                          pageNumber: c.pageNumber,
                          boundingBox: c.boundingBox,
                        })),
                      }
                    : m,
                ),
              );
            },
            onDone: (messageId: string, streamSessionId?: string) => {
              setStreaming(false);
              const next = sessionId ?? streamSessionId ?? messageId;
              setSessionId(next);
              setActiveChatSessionId(next);
            },
            onError: () => setStreaming(false),
          },
          ctrl.signal,
        );
      } catch {
        // Keep the UI demoable if the stream fails.
        setStreaming(false);
      }
    },
    [streaming, sessionId],
  );

  return (
    <div className="flex h-full flex-col rounded-2xl border border-black/10 bg-white/70 backdrop-blur-sm">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 bg-accent/10 text-accent">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-tight">
              Executive Search Studio
            </p>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-ink/50">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500" />
              Model online · RAG index warm
            </p>
          </div>
        </div>
      </div>

      {/* Message stream */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
      >
        {messages.map((m) => (
          <ResponseCard key={m.id} message={m} />
        ))}
        {streaming && (
          <div className="flex items-center gap-1.5 pl-1 font-mono text-[11px] text-ink/40">
            <span className="inline-block h-1.5 w-1.5 animate-cursor-blink rounded-full bg-accent" />
            synthesising response…
          </div>
        )}
      </div>

      {/* Suggested prompt pills */}
      <div className="border-t border-black/10 px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              disabled={streaming}
              className="shrink-0 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-left font-mono text-[10px] leading-snug text-ink/60 transition hover:border-black/30 hover:text-ink disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 pt-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-black/15 bg-white p-2 focus-within:border-ink focus-within:ring-2 focus-within:ring-accent/25"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about production, dispatch, overburden…"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink/35"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition hover:bg-black disabled:opacity-30"
            title="Send"
          >
            {streaming ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </form>
        <p className="mt-2 flex items-center justify-center gap-1 font-mono text-[9px] text-ink/35">
          <CornerDownLeft className="h-3 w-3" /> Enter to send · Shift+Enter for a
          new line · answers are source-cited
        </p>
      </div>
    </div>
  );
}
