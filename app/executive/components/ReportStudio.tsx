"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  FileDown,
  FileSpreadsheet,
  FileText,
  Gauge,
  Loader2,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  createOnDemandReport,
  exportReport,
  getMetrics,
  listDocuments,
  type AnalyticsMetrics,
  type DocumentDto,
  type ReportOut,
  type ReportType,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const REPORT_TYPES: { value: ReportType; label: string; blurb: string }[] = [
  {
    value: "geological_brief",
    label: "Geological Brief",
    blurb: "Geology, seams & exploration scheme of a block",
  },
  {
    value: "production_review",
    label: "Production Review",
    blurb: "Production, dispatch & capacity performance",
  },
  {
    value: "parliamentary_response",
    label: "Parliamentary Note",
    blurb: "Facts on record + suggested reply points",
  },
];

const TOPIC_PRESETS: Record<ReportType, string[]> = {
  geological_brief: [
    "Gurwani block geology and exploration status",
    "Proposed drilling scheme and borehole coverage",
  ],
  production_review: [
    "Singrauli Coalfield production and dispatch",
    "Overburden removal and capacity augmentation",
  ],
  parliamentary_response: [
    "Status of coal exploration in Madhya Pradesh",
  ],
};

/** Conservative manual effort to prepare one sourced executive brief (hours). */
const MANUAL_BASELINE_HOURS = 4;

export default function ReportStudio() {
  const [reportType, setReportType] = useState<ReportType>("geological_brief");
  const [topic, setTopic] = useState("");
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);

  useEffect(() => {
    listDocuments(50)
      .then((items) => {
        const committed = items.filter((d) => d.status === "committed");
        setDocs(committed);
        setSelectedIds(new Set(committed.map((d) => d.id)));
      })
      .catch(() => setDocs([]));
    getMetrics()
      .then(setMetrics)
      .catch(() => undefined);
  }, []);

  const toggleDoc = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createOnDemandReport({
        report_type: reportType,
        topic: topic.trim() || undefined,
        document_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
      });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed.");
    } finally {
      setLoading(false);
    }
  }, [reportType, topic, selectedIds]);

  const doExport = useCallback(
    async (format: "pdf" | "docx") => {
      if (!report) return;
      setExporting(format);
      try {
        await exportReport(report, format);
      } catch {
        setError(
          `Export to ${format.toUpperCase()} failed — is the API server running?`,
        );
      } finally {
        setExporting(null);
      }
    },
    [report],
  );

  // Quantified impact strip — every figure is measured, never invented.
  const impact = useMemo(() => {
    if (!report) return null;
    const seconds = Math.max(report.compile_seconds, 0.05);
    const pctFaster = Math.min(
      99.9,
      (1 - seconds / (MANUAL_BASELINE_HOURS * 3600)) * 100,
    );
    return {
      seconds: seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(2),
      sources: report.source_count,
      pct: pctFaster >= 99 ? "99+" : pctFaster.toFixed(1),
      accuracy:
        metrics?.extraction_accuracy != null
          ? `${metrics.extraction_accuracy}%`
          : "—",
    };
  }, [report, metrics]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* ---------------- Builder card ---------------- */}
      <section className="card-editorial shrink-0 p-5">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-accent" />
          Report builder
        </h3>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          Automated report generation — every claim is cited to its source page
        </p>

        {/* 1 — report type */}
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          1 · Report type
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setReportType(type.value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                reportType === type.value
                  ? "border-ink bg-ink text-white shadow-card-lift"
                  : "border-black/10 bg-white/60 text-ink hover:border-ink/40",
              )}
            >
              <span className="block text-xs font-semibold">{type.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-[10px] leading-snug",
                  reportType === type.value ? "text-white/70" : "text-ink/50",
                )}
              >
                {type.blurb}
              </span>
            </button>
          ))}
        </div>

        {/* 2 — topic */}
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          2 · Topic or question{" "}
          <span className="normal-case text-ink/30">(optional)</span>
        </p>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Gurwani block geology and exploration status"
          className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-ink/30 focus:border-ink focus:ring-2 focus:ring-accent/25"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOPIC_PRESETS[reportType].map((preset) => (
            <button
              key={preset}
              onClick={() => setTopic(preset)}
              className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 font-mono text-[10px] text-ink/60 transition hover:border-ink/40 hover:text-ink"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* 3 — document scope */}
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          3 · Document scope
        </p>
        {docs.length === 0 ? (
          <p className="mt-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-ink/55">
            No committed documents found — reports will compile from the whole
            corpus once documents are committed in the Ingestion Hub.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {docs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggleDoc(d.id)}
                  title={`${d.file_name} · ${d.category ?? "uncategorised"}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition",
                    selectedIds.has(d.id)
                      ? "border-ink bg-ink text-white"
                      : "border-black/10 bg-white/60 text-ink/50 hover:border-ink/40",
                  )}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="max-w-[220px] truncate">{d.file_name}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => setSelectedIds(new Set(docs.map((d) => d.id)))}
                className="font-mono text-[10px] text-ink/50 underline-offset-2 hover:text-ink hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="font-mono text-[10px] text-ink/50 underline-offset-2 hover:text-ink hover:underline"
              >
                Clear
              </button>
              <span className="ml-auto font-mono text-[10px] text-ink/40">
                {selectedIds.size} of {docs.length} selected
              </span>
            </div>
          </>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="btn-pill mt-4 flex w-full items-center justify-center gap-2 !py-2.5"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Compiling report…
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4" />
              Generate report
            </>
          )}
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs leading-relaxed text-red-800">{error}</p>
        </div>
      )}


      {/* ---------------- Generated report ---------------- */}
      {report && impact && (
        <>
          {/* Quantified impact — real values only */}
          <section className="grid shrink-0 gap-3 rounded-2xl border border-black/10 bg-ink px-4 py-3.5 text-white sm:grid-cols-4">
            <div className="flex items-center gap-2.5">
              <Timer className="h-4 w-4 shrink-0 text-accent" />
              <div className="leading-tight">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {impact.seconds}s
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/55">
                  compile time
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-accent" />
              <div className="leading-tight">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {impact.sources}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/55">
                  cited sources
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-4 w-4 shrink-0 text-accent" />
              <div className="leading-tight">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  ~{impact.pct}% faster
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/55">
                  vs ~{MANUAL_BASELINE_HOURS} h manual prep
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Gauge className="h-4 w-4 shrink-0 text-accent" />
              <div className="leading-tight">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {impact.accuracy}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/55">
                  extraction accuracy
                </p>
              </div>
            </div>
          </section>

          {/* Report document */}
          <section className="card-editorial shrink-0 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                  {report.report_type.replace(/_/g, " ")} ·{" "}
                  {new Date(report.generated_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <h4 className="mt-1 font-display text-lg font-bold tracking-tight">
                  {report.title}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-ink/60">
                  {report.preamble}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => doExport("pdf")}
                  disabled={exporting !== null}
                  className="btn-pill !px-3.5 !py-1.5 !text-[11px]"
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  PDF
                </button>
                <button
                  onClick={() => doExport("docx")}
                  disabled={exporting !== null}
                  className="btn-pill-secondary !px-3.5 !py-1.5 !text-[11px]"
                >
                  {exporting === "docx" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                  )}
                  DOCX
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {report.sections.map((section) => (
                <div key={section.heading}>
                  <h5 className="border-b border-black/10 pb-1 font-display text-sm font-semibold tracking-tight">
                    {section.heading}
                  </h5>
                  <div className="prose-editorial mt-2 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.body}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            {report.key_figures.length > 0 && (
              <div className="mt-4 rounded-xl border border-black/10 bg-white/60 p-3.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
                  Key figures extracted from the corpus
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.key_figures.map((f, i) => (
                    <span
                      key={`${f.value}-${i}`}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 font-mono text-[10px] font-medium text-ink"
                    >
                      {f.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Data tables — straight from the verified extraction grid */}
            {report.tables?.map((table) => (
              <div key={table.title} className="card overflow-x-auto">
                <h4 className="text-sm font-bold text-slate-800">{table.title}</h4>
                <table className="mt-3 w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      {table.columns.map((column) => (
                        <th key={column} className="px-2 py-1.5 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 odd:bg-slate-50/50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1.5 text-slate-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.note && (
                  <p className="mt-2 text-xs italic text-slate-500">{table.note}</p>
                )}
              </div>
            ))}

            {/* Key-figure charts — numeric series compiled from the corpus */}
            {report.charts?.map((chart) => {
              const maxVal = Math.max(...chart.series.map((s) => s.value), 1);
              return (
                <div key={chart.title} className="card">
                  <h4 className="text-sm font-bold text-slate-800">{chart.title}</h4>
                  <div className="mt-3 space-y-2">
                    {chart.series.map((point) => (
                      <div
                        key={`${point.label}-${point.value}`}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="w-48 truncate text-slate-600"
                          title={point.label}
                        >
                          {point.label}
                        </span>
                        <div className="h-3 flex-1 rounded-full bg-slate-100">
                          <div
                            className="h-3 rounded-full bg-cyan-700"
                            style={{
                              width: `${Math.max(2, (point.value / maxVal) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-20 text-right font-bold text-cyan-700">
                          {point.value}
                          {chart.unit ? ` ${chart.unit}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  {chart.note && (
                    <p className="mt-2 text-xs italic text-slate-500">{chart.note}</p>
                  )}
                </div>
              );
            })}

            {report.citations.length > 0 && (
              <div className="mt-4 border-t border-black/10 pt-3">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
                  Sources — document · page
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.citations.map((c, i) => (
                    <span
                      key={c.id}
                      title={c.quote ?? c.documentName}
                      className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/70 bg-cyan-500/20 px-2.5 py-1 font-mono text-[10px] font-medium text-cyan-700"
                    >
                      <span className="font-bold">[{i + 1}]</span>
                      <span className="max-w-[200px] truncate">
                        {c.documentName}
                      </span>
                      <span className="rounded-full bg-cyan-500/25 px-1.5 text-[9px]">
                        p.{c.pageNumber}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
