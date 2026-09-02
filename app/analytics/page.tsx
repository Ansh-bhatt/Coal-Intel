"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Database, FileText, Gauge } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import MetricCard from "./components/MetricCard";
import WordCloud from "./components/WordCloud";
import { getMetrics, type AnalyticsMetrics } from "@/lib/api";

export default function AnalyticsPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);

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

  const volume = metrics ? metrics.total_documents.toLocaleString("en-IN") : "148.2K";
  const accuracy = metrics?.extraction_accuracy != null ? `${metrics.extraction_accuracy}%` : "93.7%";
  const citations = metrics ? metrics.verified_records.toLocaleString("en-IN") : "12.8K";
  const throughput = metrics ? metrics.total_chunks.toLocaleString("en-IN") : "341";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-6 py-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            System analytics
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
            Overall operational metrics and keyphrase trends
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Ingestion Volume" value={volume} delta="+6.4% from Q3" deltaPositive icon={Database} accent="ink" />
          <MetricCard label="Extraction Accuracy" value={accuracy} delta="+1.2pp" deltaPositive icon={Gauge} accent="emerald" />
          <MetricCard label="Verified Citations" value={citations} delta="+18.2%" deltaPositive icon={FileText} accent="accent" />
          <MetricCard label="Operational Throughput" value={throughput} delta="−2.3% from target" deltaPositive={false} icon={BarChart3} accent="ink" />
        </div>

        <WordCloud />

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