"use client";

import { create } from "zustand";
import type {
  Citation,
  ExtractedRecord,
  PortalMode,
  UploadedFileEntry,
} from "@/lib/types";
import { uid } from "@/lib/utils";

interface PortalState {
  // --- Active portal mode ---
  activePortal: PortalMode;
  setActivePortal: (mode: PortalMode) => void;

  // --- PDF & citation state ---
  pdfUrl: string | null;
  /** Display name of the document currently loaded in the viewer. */
  pdfName: string | null;
  activeCitation: Citation | null;
  setPdfUrl: (url: string | null, name?: string | null) => void;
  setActiveCitation: (citation: Citation | null) => void;

  // --- Draft generation ---
  activeChatSessionId: string | null;
  setActiveChatSessionId: (sessionId: string | null) => void;

  // --- Ingestion & verification state ---
  uploadedFiles: UploadedFileEntry[];
  /** Adds entries to the store and returns them so callers can track the
   *  exact rows they created (never match uploads by filename — duplicates
   *  collide). */
  addFiles: (files: File[]) => UploadedFileEntry[];
  updateFileStatus: (id: string, status: UploadedFileEntry["status"]) => void;
  /** Real upload progress (0–100) reported by the XHR in lib/api.ts. */
  setFileProgress: (id: string, progress: number) => void;
  setFileDocumentId: (id: string, documentId: string) => void;
  setFileError: (id: string, message: string) => void;
  removeFile: (id: string) => void;

  extractedRecords: ExtractedRecord[];
  setExtractedRecords: (records: ExtractedRecord[]) => void;
  updateRecord: (id: string, patch: Partial<ExtractedRecord>) => void;
  markAllVerified: () => void;
}

const LOW_CONFIDENCE_THRESHOLD = 0.85;

export const usePortalStore = create<PortalState>((set) => ({
  // --- Active portal ---
  activePortal: "EXECUTIVE",
  setActivePortal: (mode) => set({ activePortal: mode }),

  // --- PDF & citation ---
  pdfUrl: null,
  pdfName: null,
  activeCitation: null,
  setPdfUrl: (url, name = null) => set({ pdfUrl: url, pdfName: name }),
  setActiveCitation: (citation) => set({ activeCitation: citation }),

  // --- Draft generation ---
  activeChatSessionId: null,
  setActiveChatSessionId: (sessionId) => set({ activeChatSessionId: sessionId }),

  // --- Ingestion & verification ---
  uploadedFiles: [],
  addFiles: (files) => {
    const entries = files.map((file) => ({
      id: uid("file"),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "queued" as const,
      progress: 0,
    }));
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, ...entries],
    }));
    return entries;
  },
  updateFileStatus: (id, status) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === id ? { ...f, status, progress: status === "committed" ? 100 : f.progress } : f,
      ),
    })),
  setFileProgress: (id, progress) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === id ? { ...f, progress } : f,
      ),
    })),
  setFileDocumentId: (id, documentId) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === id ? { ...f, documentId } : f,
      ),
    })),
  setFileError: (id, message) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === id ? { ...f, errorMessage: message } : f,
      ),
    })),
  removeFile: (id) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
    })),

  extractedRecords: [],
  setExtractedRecords: (records) => set({ extractedRecords: records }),
  updateRecord: (id, patch) =>
    set((state) => ({
      extractedRecords: state.extractedRecords.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Re-evaluate status when a human corrects a value: any human-edited
        // value is authoritative, so the record is marked "corrected" (this
        // used to be a dead ternary whose branches were identical).
        if (patch.value !== undefined) {
          next.status = "corrected";
        }
        return next;
      }),
    })),
  markAllVerified: () =>
    set((state) => ({
      extractedRecords: state.extractedRecords.map((r) => ({
        ...r,
        status: "verified",
      })),
    })),
}));

export { LOW_CONFIDENCE_THRESHOLD };
