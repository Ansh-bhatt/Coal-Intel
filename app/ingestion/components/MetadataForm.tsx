"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import {
  CATEGORY_OPTIONS,
  COALFIELD_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  MOCK_EXTRACTED_RECORDS,
  SUBSIDIARY_OPTIONS,
} from "@/lib/mockData";

export default function MetadataForm() {
  const [subsidiary, setSubsidiary] = useState(SUBSIDIARY_OPTIONS[6]);
  const [coalfield, setCoalfield] = useState(COALFIELD_OPTIONS[0]);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [fiscalYear, setFiscalYear] = useState(FISCAL_YEAR_OPTIONS[1]);

  const uploadedFiles = usePortalStore((s) => s.uploadedFiles);
  const extractedRecords = usePortalStore((s) => s.extractedRecords);
  const setExtractedRecords = usePortalStore((s) => s.setExtractedRecords);
  const [notice, setNotice] = useState<string | null>(null);

  const verifiedCount = uploadedFiles.filter((f) => f.status === "verified").length;

  const handleExtract = () => {
    if (verifiedCount === 0) {
      setNotice("Wait for at least one staged document to finish processing.");
      return;
    }
    setExtractedRecords(MOCK_EXTRACTED_RECORDS);
    setNotice(
      `Extraction complete — ${MOCK_EXTRACTED_RECORDS.length} records staged for review.`,
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
  ) => (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-ink/50">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/25"
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
        {field("Subsidiary", subsidiary, setSubsidiary, SUBSIDIARY_OPTIONS)}
        {field("Coalfield", coalfield, setCoalfield, COALFIELD_OPTIONS)}
        {field("Category", category, setCategory, CATEGORY_OPTIONS)}
        {field("Reporting Year", fiscalYear, setFiscalYear, FISCAL_YEAR_OPTIONS)}
      </div>

      <button
        onClick={handleExtract}
        className="btn-pill w-full"
        disabled={uploadedFiles.length === 0}
      >
        <ScanLine className="h-4 w-4" />
        Run extraction
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
