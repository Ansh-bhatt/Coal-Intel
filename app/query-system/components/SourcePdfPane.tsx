"use client";

import { FileText, ScanSearch } from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import { SAMPLE_PDF_URL } from "@/lib/mockData";

/**
 * Source-document pane for the query system. Renders the active PDF and a
 * traceability card for the most recently selected citation (document, page
 * and bounding-box coordinates) — wired to the shared portal store so
 * citation tags in the chat stream drive it directly.
 */
export default function SourcePdfPane() {
  const pdfUrl = usePortalStore((s) => s.pdfUrl);
  const activeCitation = usePortalStore((s) => s.activeCitation);

  const viewerSrc = pdfUrl
    ? `${pdfUrl}#page=${activeCitation?.pageNumber ?? 1}`
    : `${SAMPLE_PDF_URL}#page=1`;

  return (
    <aside className="flex flex-col gap-4">
      <div className="card-editorial flex min-h-[420px] flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            <FileText className="h-4 w-4 text-accent" />
            Source document
          </h3>
          {activeCitation && (
            <span className="engine-tag !px-2 !py-0.5 !text-[10px]">
              p.{activeCitation.pageNumber}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden rounded-xl border border-black/10 bg-white/60">
          <iframe
            title="Source document viewer"
            src={viewerSrc}
            className="h-full min-h-[380px] w-full"
          />
        </div>
      </div>

      <div className="card-editorial p-4">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
          <ScanSearch className="h-4 w-4 text-accent" />
          Citation traceability
        </h3>
        {activeCitation ? (
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="font-mono uppercase tracking-wider text-ink/45">Document</dt>
              <dd className="text-right font-medium text-ink">
                {activeCitation.documentName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-mono uppercase tracking-wider text-ink/45">Page</dt>
              <dd className="text-right font-medium text-ink">
                {activeCitation.pageNumber}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-mono uppercase tracking-wider text-ink/45">Bounding box</dt>
              <dd className="text-right font-mono text-[10px] text-ink/80">
                [{activeCitation.boundingBox.x1}, {activeCitation.boundingBox.y1},{" "}
                {activeCitation.boundingBox.x2}, {activeCitation.boundingBox.y2}]
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-ink/55">
            Click a citation tag on any engine response to jump to the exact
            page and inspect the highlighted region coordinates here.
          </p>
        )}
      </div>
    </aside>
  );
}