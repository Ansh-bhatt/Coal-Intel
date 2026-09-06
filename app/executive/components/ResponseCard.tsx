"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, Citation } from "@/lib/types";

function CitationTag({ citation }: { citation: Citation }) {
  return (
    <span
      title={`${citation.documentName} · p.${citation.pageNumber}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/70 bg-cyan-500/20 px-2.5 py-1 font-mono text-[10px] font-medium text-cyan-700"
    >
      <FileText className="h-3 w-3" />
      <span className="truncate">{citation.documentName}</span>
      <span className="rounded-full bg-cyan-500/25 px-1.5 text-[9px]">p.{citation.pageNumber}</span>
    </span>
  );
}

export default function ResponseCard({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-white animate-fade-in-up">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="card-editorial animate-fade-in-up p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent">
          <FileText className="h-3 w-3" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
          Engine response
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink/40">
          {new Date(message.timestamp).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="prose-editorial text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>

      {message.citations && message.citations.length > 0 && (
        <div className="mt-4 border-t border-black/10 pt-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
            Source citations — document · page
          </p>
          <div className={cn("flex flex-wrap gap-2")}>
            {message.citations.map((c) => (
              <CitationTag key={c.id} citation={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
