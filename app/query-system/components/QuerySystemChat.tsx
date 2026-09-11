"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, CornerDownLeft } from "lucide-react";
import ResponseCard from "@/app/executive/components/ResponseCard";
import {
  COALFIELD_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  SUBSIDIARY_OPTIONS,
} from "@/lib/mockData";
import {
  ApiError,
  isNetworkError,
  streamChat,
  type ChatRequest,
  type CitationDto,
} from "@/lib/api";
import { simulateChatStream } from "@/lib/chatFallback";
import { uid } from "@/lib/utils";
import { usePortalStore } from "@/store/portalStore";
import type { ChatMessage } from "@/lib/types";

const GREETING: ChatMessage = {
  id: "qs-greeting",
  role: "assistant",
  content:
    "Welcome to the **Coal-Intel query system**. Pick a context filter or ask a high-priority question directly — every answer is traced to its source document and page. The corpus currently carries the Gurwani block G-3 exploration proposal (Northern Coalfields · Singrauli).",
  timestamp: Date.now(),
};

const HIGH_PRIORITY_QUESTIONS = [
  "Summarise the geology and stratigraphy of the Gurwani block.",
  "How many boreholes and how much drilling are proposed for the Gurwani block?",
  "What is the location and extent of the Gurwani block?",
  "Which coalfields missed their dispatch targets, and by how much?",
];

export default function QuerySystemChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [subsidiary, setSubsidiary] = useState("");
  const [coalfield, setCoalfield] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // First-token watchdog: if the engine accepts the request but never streams
  // anything, recover the composer instead of wedging the tab (empty
  // "Engine response" card + disabled composer until a manual refresh).
  const firstDataRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setActiveChatSessionId = usePortalStore((s) => s.setActiveChatSessionId);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
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
      setStreamError(null);

      const assistantId = uid("msg");
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
      ]);
      setStreaming(true);

      const payload: ChatRequest = {
        message: text,
        session_id: sessionId,
        subsidiary: subsidiary || undefined,
        coalfield: coalfield || undefined,
        fiscal_year: fiscalYear || undefined,
      };
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      firstDataRef.current = false;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (!firstDataRef.current && abortRef.current === ctrl) {
          ctrl.abort();
          setStreaming(false);
          setStreamError(
            "The query engine accepted the request but did not start answering within 30s. Check the backend (backend/start-backend.sh, log: /tmp/uvicorn.log) and try again.",
          );
        }
      }, 30000);

      const handlers = {
        onToken: (token: string) => {
          if (!firstDataRef.current) {
            firstDataRef.current = true;
            if (watchdogRef.current) clearTimeout(watchdogRef.current);
          }
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
                      documentId: c.documentId ?? undefined,
                      boundingBox: c.boundingBox,
                    })),
                  }
                : m,
            ),
          );
        },
        onDone: (messageId: string, streamSessionId?: string) => {
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          setStreaming(false);
          // A server-issued session id always wins (the backend echoes the
          // real id in "done"); the offline fallback sends none, keeping the
          // current (possibly undefined) session.
          const next = streamSessionId ?? sessionId;
          setSessionId(next);
          setActiveChatSessionId(next ?? null);
        },
        onError: () => {
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          setStreaming(false);
          setStreamError(
            "The response engine interrupted the stream. Please try again.",
          );
        },
      };

      try {
        await streamChat(payload, handlers, ctrl.signal);
      } catch (err) {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        // Watchdog abort: the banner above already recovered the composer —
        // do not fall through to the offline mock or a doomed retry (the
        // aborted controller would kill any retried request instantly).
        if (ctrl.signal.aborted) return;
        // Backend unreachable -> simulated stream keeps the query system
        // demoable offline, mirroring the SSE event cadence.
        if (isNetworkError(err)) {
          try {
            await simulateChatStream(handlers);
          } catch {
            setStreaming(false);
          }
          // The simulated stream above keeps the UI demoable offline, but a
          // silent mock is indistinguishable from a hang. Always say why the
          // answer is not a real one.
          setStreamError(
            "Query engine unreachable at localhost:8000 — the answer above is simulated demo content, not a real answer. Start the backend (backend/start-backend.sh) and refresh this page.",
          );
          return;
        }
        // A stale session id (server restarted, DB reset, other device) makes
        // every subsequent send 404 — drop it once and retry so the backend
        // can create a fresh session instead of failing forever.
        if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 403) &&
          payload.session_id
        ) {
          setSessionId(undefined);
          setActiveChatSessionId(null);
          const retryPayload = { ...payload, session_id: undefined };
          try {
            await streamChat(retryPayload, handlers, ctrl.signal);
            return;
          } catch (retryErr) {
            setStreaming(false);
            setStreamError(
              retryErr instanceof ApiError
                ? retryErr.message
                : "The query engine could not be reached. Check the API server and try again.",
            );
            return;
          }
        }
        // Expired/invalid credentials: the API client already attempted a
        // silent token refresh — surface the real problem instead of blaming
        // the API server.
        if (err instanceof ApiError && err.status === 401) {
          setStreaming(false);
          setStreamError("Your session has expired. Please log in again.");
          return;
        }
        setStreaming(false);
        // Surface the backend's actual reason (mid-stream interruption,
        // stream closed without done, 5xx detail) instead of a generic banner.
        setStreamError(
          err instanceof ApiError
            ? err.message
            : "The query engine could not be reached. Check the API server and try again.",
        );
      }
    },
    [streaming, sessionId, subsidiary, coalfield, fiscalYear, setActiveChatSessionId],
  );

  return (
    <div className="card-editorial flex h-full min-h-[640px] flex-col">
      {/* Context filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          Context
        </span>
        <select
          value={subsidiary}
          onChange={(e) => setSubsidiary(e.target.value)}
          className="engine-tag cursor-pointer bg-white/70 hover:border-ink/40"
          aria-label="Filter by subsidiary"
        >
          <option value="">All subsidiaries</option>
          {SUBSIDIARY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={coalfield}
          onChange={(e) => setCoalfield(e.target.value)}
          className="engine-tag cursor-pointer bg-white/70 hover:border-ink/40"
          aria-label="Filter by coalfield"
        >
          <option value="">All coalfields</option>
          {COALFIELD_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={fiscalYear}
          onChange={(e) => setFiscalYear(e.target.value)}
          className="engine-tag cursor-pointer bg-white/70 hover:border-ink/40"
          aria-label="Filter by fiscal year"
        >
          <option value="">All years</option>
          {FISCAL_YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m) => (
          <ResponseCard key={m.id} message={m} />
        ))}
        {streaming && (
          <div className="flex items-center gap-1.5 pl-1 font-mono text-[11px] text-ink/40">
            <span className="inline-block h-1.5 w-1.5 animate-cursor-blink rounded-full bg-accent" />
            retrieving context &amp; streaming answer…
          </div>
        )}
        {streamError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            <p className="text-xs leading-relaxed text-red-800">{streamError}</p>
          </div>
        )}
      </div>

      {/* High-priority question templates */}
      <div className="border-t border-black/10 px-4 pt-3">
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          High-priority questions
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {HIGH_PRIORITY_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={streaming}
              className="shrink-0 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-left font-mono text-[10px] leading-snug text-ink/60 transition hover:border-black/30 hover:text-ink disabled:opacity-40"
            >
              {q}
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
            placeholder="Ask a high-priority question…"
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
          <CornerDownLeft className="h-3 w-3" /> Enter to send
        </p>
      </div>
    </div>
  );
}