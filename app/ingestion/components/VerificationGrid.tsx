"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import { cn } from "@/lib/utils";
import {
  commitDocument,
  getRecords,
  isNetworkError,
  updateRecord,
} from "@/lib/api";
import type { ExtractedRecord } from "@/lib/types";

const THRESHOLD = 0.85;
/** Debounce window for persisting inline corrections (one PATCH per pause,
 *  instead of one request per keystroke). */
const PATCH_DEBOUNCE_MS = 400;

export default function VerificationGrid() {
  const records = usePortalStore((s) => s.extractedRecords);
  const uploadedFiles = usePortalStore((s) => s.uploadedFiles);
  const updateLocalRecord = usePortalStore((s) => s.updateRecord);
  const markAllVerified = usePortalStore((s) => s.markAllVerified);
  const setExtractedRecords = usePortalStore((s) => s.setExtractedRecords);
  const updateFileStatus = usePortalStore((s) => s.updateFileStatus);
  const committedDocIds = usePortalStore((s) => s.committedDocIds);
  const markDocCommitted = usePortalStore((s) => s.markDocCommitted);
  const extractedRecordsDocId = usePortalStore((s) => s.extractedRecordsDocId);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  // Per-record debounced save timers, keeping the record's pre-edit status so
  // a failed PATCH can revert the optimistic "corrected" badge.
  const patchTimers = useRef<
    Map<string, { timer: ReturnType<typeof setTimeout>; originalStatus: string }>
  >(new Map());

  // Cancel pending saves on unmount so no PATCH fires against a dead grid.
  useEffect(() => {
    const timers = patchTimers.current;
    return () => {
      for (const { timer } of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const verifiedCount = records.filter((r) => r.status === "verified" || r.status === "corrected").length;
  const avgConfidence =
    records.length > 0
      ? (records.reduce((a, r) => a + r.confidence, 0) / records.length * 100).toFixed(1)
      : "—";
  const allVerified = records.length > 0 && verifiedCount === records.length;
  // The document whose records are staged in this grid. MetadataForm tags the
  // extraction source (extractedRecordsDocId); before extraction runs the grid
  // falls back to the first staged upload that is not committed yet — so
  // committing one file advances the batch to the next instead of dead-ending.
  const targetDocId =
    extractedRecordsDocId ??
    uploadedFiles.find(
      (f) =>
        f.documentId &&
        f.status !== "error" &&
        !committedDocIds.includes(f.documentId),
    )?.documentId ??
    null;
  const alreadyCommitted = targetDocId
    ? committedDocIds.includes(targetDocId)
    : false;

  const handleLocalUpdate = (id: string, patch: Partial<ExtractedRecord>) => {
    const value = patch.value;
    updateLocalRecord(id, patch);
    if (value === undefined) return;
    // Debounce the backend PATCH — previously every keystroke fired a request.
    const timers = patchTimers.current;
    const existing = timers.get(id);
    const originalStatus =
      existing?.originalStatus ??
      usePortalStore.getState().extractedRecords.find((r) => r.id === id)?.status ??
      "pending";
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      timers.delete(id);
      updateRecord(id, value).catch((err) => {
        console.error("Failed to persist record correction:", err);
        // Revert the optimistic "corrected" status so the grid doesn't claim
        // the backend accepted a correction it never saw.
        updateLocalRecord(id, { status: originalStatus as ExtractedRecord["status"] });
      });
    }, PATCH_DEBOUNCE_MS);
    timers.set(id, { timer, originalStatus });
  };

  const handleCommit = async () => {
    // Commit the document whose records are staged in this grid. MetadataForm
    // tags the extraction source; before extraction runs, the grid targets the
    // first staged upload that is not committed yet — so committing one file
    // advances the batch to the next instead of dead-ending on file one. The
    // other staged uploads are committed through their own review pass, never
    // implicitly by this button.
    const doc = uploadedFiles.find(
      (f) =>
        f.documentId &&
        f.status !== "error" &&
        !committedDocIds.includes(f.documentId),
    );
    if (!doc?.documentId) return;
    setCommitting(true);
    setCommitError(null);
    try {
      await commitDocument(doc.documentId);
      // Flip the grid to the committed state only after the backend accepted
      // the commit — previously the UI marked everything verified up-front
      // and swallowed backend 400s (e.g. unresolved flagged records) as a
      // fake success.
      markAllVerified();
      updateFileStatus(doc.id, "committed");
      markDocCommitted(doc.documentId);
      // Re-sync statuses from the server: flagged rows were auto-accepted by
      // HITL_AUTO_RESOLVE during the commit (or the request would have 400'd),
      // so the backend is the source of truth for what actually got committed.
      try {
        const fresh = await getRecords(doc.documentId);
        setExtractedRecords(fresh as ExtractedRecord[]);
      } catch {
        /* refetch is best-effort — keep the locally-verified statuses */
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // Backend unreachable → keep the flow demoable offline.
        markAllVerified();
        markDocCommitted(doc.documentId);
      } else {
        console.error("Failed to commit batch:", err);
        setCommitError(
          err instanceof Error ? err.message : "Commit failed — please retry.",
        );
      }
    } finally {
      setCommitting(false);
    }
  };

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
          <RecordRow key={r.id} record={r} onUpdate={handleLocalUpdate} />
        ))}
      </div>

      {commitError && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[10px] text-rose-600"
        >
          Commit failed: {commitError}
        </p>
      )}

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
          onClick={handleCommit}
          disabled={committing || alreadyCommitted || !targetDocId}
          className="btn-pill !px-4 !py-2 !text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {alreadyCommitted
            ? "Batch committed"
            : committing
              ? "Committing…"
              : allVerified
                ? "Commit batch"
                : "Commit batch (auto-accepts flagged)"}
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