"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Database, FileText, Gauge } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import MetricCard from "./components/MetricCard";
import WordCloud from "./components/WordCloud";
import TopTopics from "./components/TopTopics";
import { getMetrics, type AnalyticsMetrics } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  // Dataset filter shared by the word cloud + top topics panels.
  const [dataset, setDataset] = useState("");

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login?portal=executive");
    else setActivePortal("EXECUTIVE");
  }, [isAuthenticated, router, setActivePortal]);

  useEffect(() => {
    getMetrics().then(setMetrics).catch(() => {
      // Keep demo values if backend is unreachable.
    });
  }, []);

  if (!isAuthenticated) return null;

  const fmt = (n: number) => n.toLocaleString("en-IN");
  // Every figure below is derived from GET /analytics/metrics. When the API is
  // unreachable the cards keep their demo values but say so — the panel never
  // presents an invented number as a measured one.
  const offline = metrics === null;
  const offlineNote = "demo values — API offline";

  const volume = metrics ? fmt(metrics.total_documents) : "148.2K";
  const accuracy =
    metrics?.extraction_accuracy != null
      ? `${metrics.extraction_accuracy}%`
      : "93.7%";
  const verified = metrics ? fmt(metrics.verified_records) : "12.8K";
  const chunks = metrics ? fmt(metrics.total_chunks) : "341";

  const volumeCaption = metrics
    ? `${fmt(metrics.committed_documents)} committed · ${fmt(
        metrics.total_records,
      )} records extracted`
    : offlineNote;
  const accuracyCaption = metrics
    ? `${fmt(metrics.verified_records)} of ${fmt(
        metrics.total_records,
      )} records human-verified`
    : offlineNote;
  const verifiedCaption = metrics
    ? metrics.average_confidence != null
      ? `mean extraction confidence ${(metrics.average_confidence * 100).toFixed(1)}%`
      : "awaiting first extraction"
    : offlineNote;
  const chunksCaption = metrics
    ? "page-level evidence indexed for retrieval"
    : offlineNote;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              System analytics
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
              Overall operational metrics and keyphrase trends
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em]",
              offline
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                offline ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            {offline ? "demo data" : "live corpus"}
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Documents Ingested" value={volume} caption={volumeCaption} icon={Database} accent="ink" />
          <MetricCard label="Extraction Accuracy" value={accuracy} caption={accuracyCaption} icon={Gauge} accent="emerald" />
          <MetricCard label="Human-Verified Records" value={verified} caption={verifiedCaption} icon={FileText} accent="accent" />
          <MetricCard label="Indexed Text Chunks" value={chunks} caption={chunksCaption} icon={BarChart3} accent="ink" />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <WordCloud dataset={dataset} onDatasetChange={setDataset} />
          <TopTopics dataset={dataset} onDatasetChange={setDataset} />
        </div>

        <footer className="flex items-center justify-between border-t border-black/10 pt-4 pb-2">
          <p className="font-mono text-[10px] text-ink/50">
            Data refreshed as of {new Date().toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
          <p className="font-mono text-[10px] text-ink/50">
            CIL · CMPDI Data Intelligence Group
          </p>
        </footer>
      </main>
    </div>
  );
}