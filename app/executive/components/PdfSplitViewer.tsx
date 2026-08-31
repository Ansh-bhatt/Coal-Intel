"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import BoundingBoxOverlay from "./BoundingBoxOverlay";
import { SAMPLE_DOCUMENT_NAME, SAMPLE_PDF_URL } from "@/lib/mockData";

// The bundled worker is served from /public so pdf.js never needs to resolve
// its own asset URL at runtime.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function PdfSplitViewer() {
  const pdfUrl = usePortalStore((s) => s.pdfUrl);
  const setPdfUrl = usePortalStore((s) => s.setPdfUrl);
  const activeCitation = usePortalStore((s) => s.activeCitation);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.35);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const renderPage = useCallback(
    async (proxy: PDFDocumentProxy, pageNum: number, scaleVal: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pdfPage = await proxy.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: scaleVal });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setDims({ width: viewport.width, height: viewport.height });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    },
    [],
  );

  // Load document once (defaults to the bundled sample report).
  useEffect(() => {
    let cancelled = false;
    const url = pdfUrl ?? SAMPLE_PDF_URL;
    setLoading(true);
    setError(null);
    pdfjsLib
      .getDocument(url)
      .promise.then((proxy) => {
        if (cancelled) return;
        setDoc(proxy);
        setNumPages(proxy.numPages);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load document.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // Re-render page when document, page or zoom changes.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    renderPage(doc, page, scale).catch(() => {
      if (!cancelled) setError("Failed to render page.");
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, renderPage]);

  // Navigate to the page referenced by the active citation.
  useEffect(() => {
    if (activeCitation && activeCitation.pageNumber !== page) {
      setPage(activeCitation.pageNumber);
    }
  }, [activeCitation, page]);

  const hasDoc = pdfUrl !== null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-black/10 bg-white/70 backdrop-blur-sm">
      {/* Viewer toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-ink text-white">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-mono text-[11px] text-ink">
              {hasDoc ? SAMPLE_DOCUMENT_NAME : "No document"}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
              pdf.js · {numPages} page{numPages === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-ink/60 hover:bg-ink hover:text-white"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center font-mono text-[11px] tabular-nums text-ink/60">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-ink/60 hover:bg-ink hover:text-white"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-5 w-px bg-black/10" />
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-ink/60 hover:bg-ink hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-[11px] tabular-nums text-ink/70">
            {page} / {numPages || "–"}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-ink/60 hover:bg-ink hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Page canvas + overlay */}
      <div className="relative flex-1 overflow-auto bg-[#E9E7E1] p-6">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-mono text-xs text-ink/70">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Rendering document…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <p className="rounded-xl border border-rose-500 bg-rose-500/10 px-4 py-2 font-mono text-xs text-rose-600">
              {error}
            </p>
          </div>
        )}
        <div className="relative mx-auto w-fit shadow-card-lift">
          <canvas ref={canvasRef} className="rounded-sm bg-white" />
          <BoundingBoxOverlay width={dims.width} height={dims.height} scale={scale} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-black/10 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
          Source-verified reference pane
        </span>
        {hasDoc ? (
          <span className="font-mono text-[10px] text-ink/50">
            ID: {SAMPLE_DOCUMENT_NAME}
          </span>
        ) : (
          <button
            onClick={() => setPdfUrl(SAMPLE_PDF_URL)}
            className="btn-pill-secondary !px-3 !py-1 !text-xs"
          >
            Load sample report
          </button>
        )}
      </div>
    </div>
  );
}
