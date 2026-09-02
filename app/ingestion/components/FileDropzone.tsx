"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { usePortalStore } from "@/store/portalStore";
import { cn, formatBytes } from "@/lib/utils";
import type { UploadedFileEntry } from "@/lib/types";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
  "text/csv": [".csv"],
};

export default function FileDropzone() {
  const uploadedFiles = usePortalStore((s) => s.uploadedFiles);
  const addFiles = usePortalStore((s) => s.addFiles);
  const removeFile = usePortalStore((s) => s.removeFile);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) addFiles(accepted);
    },
    [addFiles],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPT,
      multiple: true,
    });

  return (
    <div className="card-editorial flex h-full flex-col p-5">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all",
          isDragActive
            ? "border-accent bg-accent/10"
            : "border-black/15 bg-white/40 hover:border-black/40 hover:bg-white/60",
        )}
      >
        <input {...getInputProps()} />
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border transition-all",
            isDragActive
              ? "border-accent bg-accent text-white"
              : "border-black/10 bg-ink text-white",
          )}
        >
          <UploadCloud className="h-6 w-6" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold">
            {isDragActive ? "Release to stage documents" : "Drag & drop documents"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink/50">
            .pdf · .xlsx · .docx — or click to browse
          </p>
        </div>
      </div>

      {fileRejections.length > 0 && (
        <p className="mt-2 rounded-lg border border-rose-500 bg-rose-500/10 px-3 py-1.5 font-mono text-[10px] text-rose-600">
          Unsupported file type — only PDF, XLSX and DOCX are accepted.
        </p>
      )}

      {/* Staged files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
            Staged documents · {uploadedFiles.length}
          </p>
          {uploadedFiles.map((f) => (
            <FileRow key={f.id} entry={f} onRemove={removeFile} />
          ))}
        </div>
      )}

      {uploadedFiles.length === 0 && (
        <p className="mt-4 flex items-center gap-1.5 font-mono text-[9px] text-ink/35">
          <FileText className="h-3 w-3" /> Files are staged locally — nothing is
          transmitted to a backend in this demo build.
        </p>
      )}
    </div>
  );
}

/** Individual staged-file row with simulated processing progress. */
function FileRow({
  entry,
  onRemove,
}: {
  entry: UploadedFileEntry;
  onRemove: (id: string) => void;
}) {
  const updateFileStatus = usePortalStore((s) => s.updateFileStatus);
  const [progress, setProgress] = useState(entry.status === "verified" ? 100 : 0);

  useEffect(() => {
    if (entry.status !== "queued") return;
    const start = window.setTimeout(() => {
      updateFileStatus(entry.id, "processing");
      const interval = window.setInterval(() => {
        setProgress((p) => Math.min(100, p + 10 + Math.floor(Math.random() * 15)));
      }, 130);
      const finish = window.setTimeout(() => {
        window.clearInterval(interval);
        updateFileStatus(entry.id, "verified");
      }, 3200);
      return () => window.clearTimeout(finish);
    }, 400);
    return () => window.clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, entry.status]);

  const isVerified = entry.status === "verified";
  const isProcessing = entry.status === "processing";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          isVerified
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-black/10 bg-ink/5 text-ink/60",
        )}
      >
        {isVerified ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-mono text-[11px] text-ink">{entry.name}</p>
          <span className="shrink-0 font-mono text-[9px] text-ink/40">
            {formatBytes(entry.size)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/10">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isVerified ? "bg-emerald-500" : "bg-accent",
              )}
              style={{ width: `${isVerified ? 100 : progress}%` }}
            />
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider",
              isVerified
                ? "bg-emerald-500/10 text-emerald-600"
                : isProcessing
                  ? "bg-accent/10 text-accent"
                  : "bg-black/5 text-ink/60",
            )}
          >
            {entry.status}
          </span>
        </div>
      </div>
      <button
        onClick={() => onRemove(entry.id)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/10 text-ink/40 transition hover:border-rose-500 hover:text-rose-600"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

