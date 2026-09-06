"use client";

import { useEffect, useRef, useState } from "react";
import { ListOrdered } from "lucide-react";
import { getTopics, type TopicItem } from "@/lib/api";
import { cn } from "@/lib/utils";

const DATASETS: { value: string; short: string }[] = [
  { value: "", short: "All documents" },
  { value: "Eastern Coalfields Ltd", short: "ECL" },
  { value: "Bharat Coking Coal Ltd", short: "BCCL" },
  { value: "Central Coalfields Ltd", short: "CCL" },
  { value: "Western Coalfields Ltd", short: "WCL" },
  { value: "South Eastern Coalfields Ltd", short: "SECL" },
  { value: "Northern Coalfields Ltd", short: "NCL" },
  { value: "Mahanadi Coalfields Ltd", short: "MCL" },
];

/**
 * M2 — Topic identification, made explicit: the ranked TF-IDF keyphrases that
 * drive the word cloud, surfaced as a scored list with per-term chunk
 * coverage. Shares the dataset filter state with the word cloud.
 */
export default function TopTopics({
  dataset,
  onDatasetChange,
}: {
  dataset: string;
  onDatasetChange: (value: string) => void;
}) {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setFailed(false);
    getTopics(dataset || undefined, 12)
      .then((items) => {
        if (seq !== requestSeq.current) return;
        setTopics(items);
        setLoading(false);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setLoading(false);
        setFailed(true);
      });
  }, [dataset]);

  const max = topics.length > 0 ? Math.max(...topics.map((t) => t.value)) : 1;

  return (
    <div className="card-editorial flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            <ListOrdered className="h-4 w-4 text-accent" />
            Top topics
          </h3>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/40">
            M2 · topic identification · ranked TF-IDF keyphrases
          </p>
        </div>
        <span className="engine-tag">
          {topics.length > 0 ? `${topics.length} topics` : "…"}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          Dataset
        </span>
        {DATASETS.map((d) => (
          <button
            key={d.value || "all"}
            onClick={() => onDatasetChange(d.value)}
            disabled={loading && dataset === d.value}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition",
              dataset === d.value
                ? "border-ink bg-ink text-white"
                : "border-black/15 bg-white/60 text-ink/60 hover:border-ink/40 hover:text-ink",
            )}
          >
            {d.short}
          </button>
        ))}
      </div>

      {failed ? (
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50 py-10 font-mono text-[11px] text-ink/40">
          Analytics engine unreachable — start the API server to rank topics.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50 py-10 font-mono text-[11px] text-ink/40">
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
          Ranking topics…
        </div>
      ) : topics.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50 py-10 font-mono text-[11px] text-ink/40">
          No committed documents in this dataset yet — ingest &amp; commit
          reports to identify topics.
        </div>
      ) : (
        <ol className="space-y-2">
          {topics.map((topic, i) => (
            <li key={topic.text} className="group">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-ink/35">
                    {i + 1}.
                  </span>
                  <span className="truncate text-xs font-medium text-ink">
                    {topic.text}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink/45">
                  w {topic.value.toLocaleString("en-IN")} ·{" "}
                  {topic.chunks} chunk{topic.chunks === 1 ? "" : "s"}
                </span>
              </div>
              <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(4, (topic.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}