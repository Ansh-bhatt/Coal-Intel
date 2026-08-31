"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  icon: LucideIcon;
  accent?: "ink" | "accent" | "emerald";
}

export default function MetricCard({
  label,
  value,
  delta,
  deltaPositive = true,
  icon: Icon,
  accent = "ink",
}: MetricCardProps) {
  const accentStyles: Record<string, string> = {
    ink: "bg-ink text-white",
    accent: "bg-accent text-white",
    emerald: "bg-emerald-500 text-white",
  };

  return (
    <div className="card-editorial group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lift">
      <div className="flex items-start justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
          {label}
        </p>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
            accentStyles[accent],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
      {delta && (
        <p
          className={cn(
            "mt-1.5 font-mono text-[11px] tabular-nums",
            deltaPositive ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {deltaPositive ? "▲" : "▼"} {delta}
        </p>
      )}
    </div>
  );
}
