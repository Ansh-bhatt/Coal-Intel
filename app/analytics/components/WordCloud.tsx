"use client";

import { useEffect, useRef, useState } from "react";
import cloud from "d3-cloud";
import { getWordCloud } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PlacedWord {
  text: string;
  size: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
}

const WIDTH = 800;
const HEIGHT = 420;
const COLORS = ["#111111", "#F24E1E", "#3f3f46", "#a16207", "#0e7490"];

/** Dataset selector — values must match seeded subsidiary names. */
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

export default function WordCloud() {
  const [dataset, setDataset] = useState("");
  const [words, setWords] = useState<PlacedWord[]>([]);
  const [termCount, setTermCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    // Immediate re-fetch + re-render whenever the selected dataset changes;
    // stale responses are dropped via a monotonically increasing seq guard.
    const seq = ++requestSeq.current;
    setWords([]);
    setTermCount(0);
    setLoading(true);
    setFailed(false);

    getWordCloud(dataset || undefined)
      .then((items) => {
        if (seq !== requestSeq.current) return;
        setTermCount(items.length);
        if (items.length === 0) {
          setLoading(false);
          return;
        }
        const max = Math.max(...items.map((d) => d.value));
        const min = Math.min(...items.map((d) => d.value));
        const span = Math.max(max - min, 1);
        const seed = items.map((d, i) => ({
          text: d.text,
          size: Math.round(14 + ((d.value - min) / span) * 46),
          color: COLORS[i % COLORS.length],
        }));
        cloud()
          .size([WIDTH, HEIGHT])
          .words(seed)
          .padding(4)
          .rotate(() => (Math.random() > 0.72 ? (Math.random() > 0.5 ? -30 : 30) : 0))
          .font("Space Grotesk")
          .fontSize((d) => d.size ?? 12)
          .on("end", (placed) => {
            if (seq !== requestSeq.current) return;
            setWords(
              placed.map((w) => ({
                text: w.text ?? "",
                size: w.size ?? 12,
                x: w.x ?? 0,
                y: w.y ?? 0,
                rotate: w.rotate ?? 0,
                color: seed.find((d) => d.text === w.text)?.color ?? "#111111",
              })),
            );
            setLoading(false);
          })
          .start();
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setTermCount(0);
        setLoading(false);
        setFailed(true);
      });
  }, [dataset]);

  return (
    <div className="card-editorial p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold tracking-tight">
            Keyphrase trends
          </h3>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/40">
            TF-IDF keywords over committed documents · d3-cloud
          </p>
        </div>
        <span className="engine-tag">{termCount > 0 ? `${termCount} terms` : "…"}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
          Dataset
        </span>
        {DATASETS.map((d) => (
          <button
            key={d.value || "all"}
            onClick={() => setDataset(d.value)}
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
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50 py-16 font-mono text-[11px] text-ink/40">
          Analytics engine unreachable — start the API server to render the cloud.
        </div>
      ) : termCount === 0 && !loading ? (
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50 py-16 font-mono text-[11px] text-ink/40">
          No committed documents in this dataset yet — ingest &amp; commit
          reports to build the keyphrase cloud.
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50">
          {loading ? (
            <div className="flex items-center gap-2 py-16 font-mono text-[11px] text-ink/40">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
              Re-rendering cloud…
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-auto w-full"
              role="img"
              aria-label={`Word cloud of keyphrases for ${dataset || "all documents"}`}
            >
              {words.map((w, i) => (
                <text
                  key={`${w.text}-${i}`}
                  x={w.x}
                  y={w.y}
                  fontSize={w.size}
                  fontWeight={w.size > 40 ? 700 : 500}
                  fontFamily="'Space Grotesk', ui-sans-serif, sans-serif"
                  fill={w.color}
                  opacity={0.88}
                  textAnchor="middle"
                  transform={`translate(${w.x},${w.y}) rotate(${w.rotate}) translate(${-w.x},${-w.y})`}
                  style={{ transition: "opacity 0.2s" }}
                  className="cursor-default select-none hover:opacity-100"
                >
                  {w.text}
                </text>
              ))}
            </svg>
          )}
        </div>
      )}
    </div>
  );
}