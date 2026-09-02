"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, FileDown, FileText, X } from "lucide-react";
import {
  downloadDraftAsDocxStub,
  downloadDraftAsPdf,
} from "@/lib/exportStubs";
import { DRAFT_DOCUMENT } from "@/lib/mockData";

export default function ParliamentaryDraftModal() {
  const [open, setOpen] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const handlePdf = () => {
    downloadDraftAsPdf(DRAFT_DOCUMENT);
    setExportNote("PDF generated & downloaded.");
  };

  const handleDocx = () => {
    downloadDraftAsDocxStub(DRAFT_DOCUMENT);
    setExportNote("DOCX pipeline is stubbed — placeholder downloaded.");
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="btn-pill !px-4 !py-2 !text-xs">
          <FileDown className="h-3.5 w-3.5" />
          Draft parliamentary response
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-black/10 bg-canvas shadow-2xl animate-fade-in-up">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-black/10 px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-lg font-bold tracking-tight">
                Parliamentary Response Draft
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
                Generated from the active engine response · pre-circulation
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink/60 hover:bg-ink hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Draft preview */}
          <div className="max-h-[50vh] overflow-y-auto px-6 py-5">
            <div className="rounded-xl border border-black/10 bg-white/70 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {DRAFT_DOCUMENT.title}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                <strong className="font-semibold text-ink">Question:</strong>{" "}
                {DRAFT_DOCUMENT.preamble}
              </p>
              <div className="my-4 h-px bg-black/10" />
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink/85">
                {DRAFT_DOCUMENT.body}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {DRAFT_DOCUMENT.citations.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-500/70 bg-cyan-500/20 px-2 py-0.5 font-mono text-[9px] text-cyan-700"
                  >
                    <FileText className="h-2.5 w-2.5" />
                    {c.documentName} · p.{c.pageNumber}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Export bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-6 py-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-ink/50">
              {exportNote ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {exportNote}
                </>
              ) : (
                "Select an export format below."
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDocx}
                className="btn-pill-secondary !px-4 !py-2 !text-xs"
              >
                <FileText className="h-3.5 w-3.5" />
                Export DOCX
              </button>
              <button onClick={handlePdf} className="btn-pill !px-4 !py-2 !text-xs">
                <FileDown className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
