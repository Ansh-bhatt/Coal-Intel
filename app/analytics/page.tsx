"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Database, FileText, Gauge } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import MetricCard from "./components/MetricCard";
import WordCloud from "./components/WordCloud";

export default function AnalyticsPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login?portal=executive");
    else setActivePortal("EXECUTIVE");
  }, [isAuthenticated, router, setActivePortal]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-6 py-6">
        {/* Page header */}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            System analytics
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
            Overall operational metrics and keyphrase trends
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Ingestion Volume"
            value="148.2K"
            delta="+6.4% from Q3"
            deltaPositive
            icon={Database}
            accent="ink"
          />
          <MetricCard
            label="Extraction Accuracy"
            value="93.7%"
            delta="+1.2pp"
            deltaPositive
            icon={Gauge}
            accent="emerald"
          />
          <MetricCard
            label="Verified Citations"
            value="12.8K"
            delta="+18.2%"
            deltaPositive
            icon={FileText}
            accent="accent"
          />
          <MetricCard
            label="Operational Throughput"
            value="341"
            delta="−2.3% from target"
            deltaPositive={false}
            icon={BarChart3}
            accent="ink"
          />
        </div>

        {/* Word cloud */}
        <WordCloud />

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-black/10 pt-4 pb-2">
          <p className="font-mono text-[10px] text-ink/50">
            Data refreshed as of {new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
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