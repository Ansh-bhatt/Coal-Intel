"use client";

import { CheckCircle2, Upload } from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import { LOW_CONFIDENCE_THRESHOLD } from "@/store/portalStore";
import { cn } from "@/lib/utils";
import type { ExtractedRecord } from "@/lib/types";

const THRESHOLD = 0.85;

export default function VerificationGrid() {
  const records = usePortalStore((s) => s.extractedRecords);
  const updateRecord = usePortalStore((s) => s.updateRecord);
  const markAllVerified = usePortalStore((s) => s.markAllVerified);

  const verifiedCount = records.filter((r) => r.status === "verified" || r.status === "corrected").length;
  const avgConfidence =
    records.length > 0
      ? (records.reduce((a, r) => a + r.confidence, 0) / records.length * 100).toFixed(1)
      : "—";
  const allVerified = records.length > 0 && verifiedCount === records.length;

  if (records.length === 0) {
    return (
      <div className="card-editorial flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-ink/5 text-ink/40">
          <Upload className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold text-ink/60">
            No extracted records yet
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink/40">
            Stage documents and run extraction above to populate the grid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-editorial flex flex-1 flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold tracking-tight">
            Human-in-the-Loop Verification
          </h3>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/40">
            Review & correct machine-extracted values before committing
          </p>
        </div>
        <span className="engine-tag">
          avg. confidence {avgConfidence}%
        </span>
      </div>

      {/* Table header */}
      <div className="mb-1 grid grid-cols-[1fr_1.4fr_0.7fr_0.8fr] gap-2 px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
        <span>Field</span>
        <span>Extracted value</span>
        <span>Confidence</span>
        <span>Status</span>
      </div>

      {/* Rows */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {records.map((r) => (
          <RecordRow key={r.id} record={r} onUpdate={updateRecord} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
        <div className="flex items-center gap-2 font-mono text-[10px] text-ink/50">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              allVerified ? "bg-emerald-500" : "bg-accent",
            )}
          />
          {verifiedCount} of {records.length} records verified
        </div>
        <button
          onClick={markAllVerified}
          disabled={allVerified}
          className="btn-pill !px-4 !py-2 !text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {allVerified ? "Batch committed" : "Commit batch"}
        </button>
      </div>
    </div>
  );
}

function RecordRow({
  record,
  onUpdate,
}: {
  record: ExtractedRecord;
  onUpdate: (id: string, patch: Partial<ExtractedRecord>) => void;
}) {
  const isLowConfidence = record.confidence < THRESHOLD;
  const isVerified = record.status === "verified" || record.status === "corrected";

  const statusColors: Record<string, string> = {
    pending: "bg-black/5 text-ink/60",
    flagged: "bg-rose-500/10 text-rose-600",
    verified: "bg-emerald-500/10 text-emerald-600",
    corrected: "bg-cyan-500/10 text-cyan-700",
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_1.4fr_0.7fr_0.8fr] gap-2 rounded-xl border px-3 py-2.5 transition",
        isLowConfidence
          ? "border-rose-500 bg-rose-500/5"
          : "border-transparent bg-white/50",
      )}
    >
      {/* Key (read-only) */}
      <span className="self-center truncate font-mono text-[11px] font-medium text-ink">
        {record.key}
      </span>

      {/* Value (editable) */}
      <input
        value={record.value}
        onChange={(e) => onUpdate(record.id, { value: e.target.value })}
        className={cn(
          "w-full rounded-lg border px-2.5 py-1.5 font-mono text-[11px] outline-none transition",
          isLowConfidence
            ? "border-rose-500 bg-white text-rose-700 placeholder:text-rose-400 focus:ring-2 focus:ring-rose-500/30"
            : "border-black/10 bg-white text-ink focus:border-ink focus:ring-2 focus:ring-accent/25",
        )}
      />

      {/* Confidence */}
      <span
        className={cn(
          "self-center font-mono text-[11px] tabular-nums",
          isLowConfidence ? "font-semibold text-rose-600" : "text-ink/60",
        )}
      >
        {(record.confidence * 100).toFixed(0)}%
      </span>

      {/* Status badge */}
      <span
        className={cn(
          "self-center rounded-full px-2 py-0.5 text-center font-mono text-[8px] uppercase tracking-wider",
          statusColors[record.status] ?? "bg-black/5 text-ink/60",
        )}
      >
        {record.status}
      </span>
    </div>
  );
}