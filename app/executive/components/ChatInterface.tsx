"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, CornerDownLeft, Sparkles } from "lucide-react";
import ResponseCard from "./ResponseCard";
import {
  MOCK_ASSISTANT_RESPONSE,
  SUGGESTED_PROMPTS,
} from "@/lib/mockData";
import { uid } from "@/lib/utils";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const streamResponse = useCallback((userContent: string) => {
    const assistantId = uid("msg");
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ]);
    setStreaming(true);

    const full = MOCK_ASSISTANT_RESPONSE.content;
    const words = full.split(/(?<=\s)/);
    let index = 0;
    // Stream a word at a time for a natural conversational cadence.
    const push = () => {
      index += 1;
      const chunk = words.slice(0, index).join("");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: chunk, timestamp: Date.now() }
            : m,
        ),
      );
      if (index >= words.length) {
        // Attach citations once streaming completes.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, citations: MOCK_ASSISTANT_RESPONSE.citations }
              : m,
          ),
        );
        setStreaming(false);
      } else {
        timers.current.push(window.setTimeout(push, 24 + Math.random() * 22));
      }
    };
    timers.current.push(window.setTimeout(push, 500));
  }, []);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setMessages((prev) => [
      ...prev,
      { id: uid("msg"), role: "user", content: text, timestamp: Date.now() },
    ]);
    setInput("");
    streamResponse(text);
  };

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
