"use client";

import { useEffect, useMemo, useState } from "react";
import cloud from "d3-cloud";
import { MOCK_WORD_CLOUD } from "@/lib/mockData";

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

/**
 * SVG word-cloud visualizer consuming keyphrase arrays via d3-cloud.
 */
export default function WordCloud() {
  const [words, setWords] = useState<PlacedWord[]>([]);

  const data = useMemo(
    () =>
      MOCK_WORD_CLOUD.map((d, i) => ({
        text: d.text,
        size: d.value,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );

  useEffect(() => {
    const layout = cloud()
      .size([WIDTH, HEIGHT])
      .words(data)
      .padding(4)
      .rotate(() => (Math.random() > 0.72 ? (Math.random() > 0.5 ? -30 : 30) : 0))
      .font("Space Grotesk")
      .fontSize((d) => d.size ?? 12)
      .on("end", (placed: Array<{ text: string; size: number; x: number; y: number; rotate: number }>) => {
        setWords(
          placed.map((w) => ({
            ...w,
            color: data.find((d) => d.text === w.text)?.color ?? "#111111",
          })),
        );
      })
      .start();

    return () => {
      layout.stop();
    };
  }, [data]);

  return (
    <div className="card-editorial p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold tracking-tight">
            Keyphrase trends
          </h3>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/40">
            Extracted terminology across indexed documents · d3-cloud
          </p>
        </div>
        <span className="engine-tag">{MOCK_WORD_CLOUD.length} terms</span>
      </div>

      <div className="flex items-center justify-center rounded-xl border border-black/10 bg-white/50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Word cloud of extracted keyphrases">
          {words.map((w, i) => (
            <text
              key={`${w.text}-${i}`}
              x={w.x}
              y={w.y}
              fontSize={w.size}
              fontWeight={w.size > 55 ? 700 : 500}
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
      </div>
    </div>
  );
}
