"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Database,
  FileSearch,
  MessagesSquare,
  Radio,
  ScanText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMetrics, type AnalyticsMetrics } from "@/lib/api";

/**
 * Landing metrics strip. When the API answers (i.e. a signed-in visitor with a
 * stored token), the counts come straight from GET /analytics/metrics and the
 * latency is the measured round-trip. Otherwise every cell shows an em dash —
 * an invented number is never displayed as measured.
 */
function LiveMetrics() {
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    getMetrics()
      .then((m) => {
        if (cancelled) return;
        setMetrics(m);
        setLatency(Math.max(1, Math.round(performance.now() - started)));
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = metrics !== null;
  const fmt = (n: number) => n.toLocaleString("en-IN");

  return (
    <div>
      <dl className="grid grid-cols-3 divide-x divide-black/10 rounded-2xl border border-black/10 bg-white/60 backdrop-blur-sm">
        {[
          {
            label: "API LATENCY",
            value: live && latency != null ? `${latency}ms` : "—",
            accent: true,
          },
          {
            label: "DOCS INGESTED",
            value: live ? fmt(metrics.total_documents) : "—",
          },
          {
            label: "RECORDS VERIFIED",
            value: live ? fmt(metrics.verified_records) : "—",
          },
        ].map((item) => (
          <div key={item.label} className="px-5 py-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-1 font-mono text-xl font-medium tabular-nums",
                item.accent ? "text-accent" : "text-ink",
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
        {live ? "measured from the live corpus" : "sign in for live counts"}
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* --- Top status strip --- */}
      <header className="border-b border-black/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">
              C
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold tracking-tight">
                COAL INDIA <span className="text-ink/50">·</span> CMPDI
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
                Data Intelligence Group
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="engine-tag">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              RAG ENGINE LIVE → DOCUMENT INTELLIGENCE ENGINE
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 py-1 font-mono text-[11px] text-ink/70 sm:inline-flex">
              <Radio className="h-3.5 w-3.5" /> DELHI · CMPDI
            </span>
          </div>
        </div>
      </header>

      {/* --- Hero --- */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-14">
        <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="animate-fade-in-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/70">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Conversational document intelligence
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
              Coal sector intelligence,
              <br />
              <span className="text-accent">searchable.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/70">
              Query geological reports, exploration schemes, production and
              dispatch data in plain language. Every answer is traced back to
              its source document with exact page-level citations.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/login?portal=executive" className="btn-pill">
                Enter Report Studio <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login?portal=subsidiary" className="btn-pill-secondary">
                Subsidiary Ingestion Hub
              </Link>
            </div>
          </div>

          <div className="animate-fade-in-up space-y-4" style={{ animationDelay: "120ms" }}>
            <LiveMetrics />
            <div className="rounded-2xl border border-black/10 bg-white/60 p-5 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
                Featured corpus
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/80">
                The{" "}
                <strong className="font-semibold text-ink">
                  Gurwani block (G-3)
                </strong>{" "}
                exploration proposal — Northern Coalfields, Singrauli Coalfield —
                is committed and indexed. Every figure in a generated report
                resolves back to a page of it.
              </p>
            </div>
          </div>
        </section>

        {/* --- Portal cards --- */}
        <section className="mt-16">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Operational portals
            </h2>
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {/* Executive card */}
            <Link
              href="/login?portal=executive"
              className="group card-editorial flex flex-col gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lift"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-ink text-white">
                  <FileSearch className="h-5 w-5" />
                </span>
                <span className="engine-tag">PORTAL · 01</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  Report Generation Studio
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                  Compile cited executive reports in seconds, ask the corpus in
                  plain language and inspect source documents in the
                  split-screen viewer — traceability built in.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/50">
                  Build → Cite → Export
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink transition-all group-hover:bg-ink group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>

            {/* Ingestion card */}
            <Link
              href="/login?portal=subsidiary"
              className="group card-editorial flex flex-col gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lift"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                  <Database className="h-5 w-5" />
                </span>
                <span className="engine-tag">PORTAL · 02</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  Subsidiary Ingestion Hub
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                  Upload subsidiary reports, tag metadata and verify
                  machine-extracted OCR records before they reach the central
                  data store.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/50">
                  Upload → Extract → Verify
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink transition-all group-hover:bg-ink group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>

            {/* Query System card — standalone RAG assistant */}
            <Link
              href="/query-system"
              className="group card-editorial flex flex-col gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lift"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-ink text-white">
                  <MessagesSquare className="h-5 w-5" />
                </span>
                <span className="engine-tag">PORTAL · 03</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  Query System
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                  Standalone RAG assistant for parliamentary and administrative
                  queries — context filters, streaming answers and direct
                  source-document traceability.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/50">
                  Ask → Retrieve → Verify
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink transition-all group-hover:bg-ink group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>

            {/* Analytics card */}
            <Link
              href="/login?portal=executive"
              className="group card-editorial flex flex-col gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lift"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-ink text-white">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <span className="engine-tag">PORTAL · 04</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  Analytics Dashboard
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                  Track ingestion volume, extraction accuracy and verified
                  citations across CIL subsidiaries in a single operational
                  overview.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink/50">
                  Track → Analyse → Report
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink transition-all group-hover:bg-ink group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* --- Footer strip --- */}
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-6 pb-4">
          <p className="font-mono text-[11px] text-ink/50">
            © 2024 Coal India Limited · CMPDI — Internal use only
          </p>
          <p className="flex items-center gap-2 font-mono text-[11px] text-ink/50">
            <ScanText className="h-3.5 w-3.5" /> Coal-Intel · document
            intelligence platform
          </p>
        </footer>
      </main>
    </div>
  );
}
