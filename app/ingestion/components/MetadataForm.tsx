"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import { useAuthStore } from "@/store/authStore";
import {
  CATEGORY_OPTIONS,
  COALFIELD_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  MOCK_EXTRACTED_RECORDS as DEMO_RECORDS,
  SUBSIDIARY_OPTIONS,
} from "@/lib/mockData";
import { getRecords, isNetworkError, updateDocumentMetadata, ApiError } from "@/lib/api";
import type { ExtractedRecord } from "@/lib/types";

/**
 * Extraction runs asynchronously on the backend (the upload queued the
 * worker), so a single GET right after the metadata PATCH races it and often
 * returns an empty grid. Poll the records endpoint until rows appear — or
 * give up after ~15s and report 0 records (a legitimately empty extraction).
 */
const RECORD_POLL_ATTEMPTS = 12;
const RECORD_POLL_INTERVAL_MS = 1250;

async function pollRecords(documentId: string): Promise<ExtractedRecord[]> {
  let sawResponse = false;
  for (let attempt = 0; attempt < RECORD_POLL_ATTEMPTS; attempt++) {
    try {
      const records = (await getRecords(documentId)) as ExtractedRecord[];
      sawResponse = true;
      if (records.length > 0) return records;
    } catch (err) {
      // Only treat the backend as "unreachable" (which triggers the caller's
      // offline-demo fallback) if it never answered at all; a transient
      // blip mid-poll just delays the next attempt.
      if (!sawResponse && isNetworkError(err)) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, RECORD_POLL_INTERVAL_MS));
  }
  return [];
}

export default function MetadataForm() {
  const user = useAuthStore((s) => s.user);
  // Subsidiary users ingest for their own subsidiary only: default (and lock,
  // see `field(..., disabled)`) the scope selects to the signed-in user's
  // mapping. Executives/admins keep the full dropdown choice.
  const isSubsidiaryUser = user?.role === "SUBSIDIARY";
  const [subsidiary, setSubsidiary] = useState(() =>
    isSubsidiaryUser && user?.subsidiary && SUBSIDIARY_OPTIONS.includes(user.subsidiary)
      ? user.subsidiary
      : SUBSIDIARY_OPTIONS[6],
  );
  const [coalfield, setCoalfield] = useState(() =>
    isSubsidiaryUser && user?.coalfield && COALFIELD_OPTIONS.includes(user.coalfield)
      ? user.coalfield
      : COALFIELD_OPTIONS[0],
  );
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [fiscalYear, setFiscalYear] = useState(FISCAL_YEAR_OPTIONS[1]);

  const uploadedFiles = usePortalStore((s) => s.uploadedFiles);
  const extractedRecords = usePortalStore((s) => s.extractedRecords);
  const setExtractedRecords = usePortalStore((s) => s.setExtractedRecords);
  const committedDocIds = usePortalStore((s) => s.committedDocIds);
  const setExtractedRecordsDocId = usePortalStore((s) => s.setExtractedRecordsDocId);
  const [notice, setNotice] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const verifiedCount = uploadedFiles.filter((f) => f.status === "verified").length;

  const handleExtract = async () => {
    // Same selection rule as the verification grid's commit: the first staged
    // upload with a backend document id that is not committed yet (skips
    // errored rows) — committing one file advances extraction to the next.
    const target = uploadedFiles.find(
      (f) =>
        f.documentId &&
        f.status !== "error" &&
        !committedDocIds.includes(f.documentId),
    );
    if (!target?.documentId) {
      setNotice(
        committedDocIds.length > 0
          ? "All staged documents are committed. Upload more files to continue."
          : "Stage a document first — the upload must finish before extraction can run.",
      );
      return;
    }
    setExtracting(true);
    setNotice(null);
    try {
      await updateDocumentMetadata(target.documentId, {
        subsidiary,
        coalfield,
        category,
        fiscal_year: fiscalYear,
      });
      // Poll until the worker persists records instead of racing it with a
      // single fetch that often returned an empty grid.
      const records = await pollRecords(target.documentId);
      setExtractedRecords(records as ExtractedRecord[]);
      // Tag the source document so the verification grid commits exactly
      // these records (not whichever file happens to be first in the list).
      setExtractedRecordsDocId(target.documentId);
      setNotice(`Extraction complete — ${records.length} records staged for review.`);
    } catch (err) {
      console.error("Extraction / metadata update failed:", err);
      // Surface what actually happened — the old fallback printed a green
      // "Extraction complete" even when the backend returned 4xx/5xx (or was
      // unreachable) and staged no records at all.
      if (isNetworkError(err)) {
        setNotice("Backend unreachable — staged demo records for offline review.");
        setExtractedRecords(DEMO_RECORDS as ExtractedRecord[]);
      } else if (err instanceof ApiError) {
        setNotice(`Extraction failed (HTTP ${err.status}): ${err.message}`);
      } else {
        setNotice("Extraction failed unexpectedly — see the browser console.");
      }
    } finally {
      setExtracting(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
    disabled = false,
  ) => (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-ink/50">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-ink/60"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="card-editorial flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-sm font-semibold tracking-tight">
          Reporting metadata
        </h3>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/40">
          Scopes the extraction pipeline
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field("Subsidiary", subsidiary, setSubsidiary, SUBSIDIARY_OPTIONS, isSubsidiaryUser)}
        {field("Coalfield", coalfield, setCoalfield, COALFIELD_OPTIONS, isSubsidiaryUser)}
        {field("Category", category, setCategory, CATEGORY_OPTIONS)}
        {field("Reporting Year", fiscalYear, setFiscalYear, FISCAL_YEAR_OPTIONS)}
      </div>

      <button
        onClick={handleExtract}
        className="btn-pill w-full"
        disabled={uploadedFiles.length === 0 || extracting}
      >
        <ScanLine className={`h-4 w-4 ${extracting ? "animate-pulse" : ""}`} />
        {extracting ? "Extracting… polling records" : "Run extraction"}
      </button>

      {notice && (
        <p
          className={`rounded-lg border px-3 py-1.5 font-mono text-[10px] ${
            notice.includes("complete")
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
              : "border-rose-500/40 bg-rose-500/10 text-rose-600"
          }`}
        >
          {notice}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink/40">
          Files verified
        </span>
        <span className="font-mono text-sm font-medium tabular-nums text-ink">
          {verifiedCount} / {uploadedFiles.length}
        </span>
      </div>
      {extractedRecords.length > 0 && (
        <p className="font-mono text-[9px] text-emerald-600">
          {extractedRecords.length} records awaiting human review ↓
        </p>
      )}
    </div>
  );
}
