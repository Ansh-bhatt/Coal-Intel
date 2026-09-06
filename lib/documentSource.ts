"use client";

import { apiRequest } from "@/lib/api";
import { SAMPLE_PDF_URL } from "@/lib/mockData";

const blobCache = new Map<string, string>();

/**
 * Resolve the viewable source for a citation document: fetch the real stored
 * file (GET /documents/{id}/file, Authorization attached) and return a blob
 * URL the PDF viewer can render. This is what makes "click citation → see
 * the actual source page" work for ingested documents instead of the bundled
 * sample. Falls back to the bundled flagship PDF so the reference pane is
 * never blank (e.g. forbidden/expired document).
 */
export async function resolveDocumentUrl(
  documentId?: string | null,
): Promise<{ url: string; live: boolean }> {
  if (documentId) {
    const cached = blobCache.get(documentId);
    if (cached) return { url: cached, live: true };
    try {
      const blob = await apiRequest<Blob>(`/documents/${documentId}/file`);
      if (blob && typeof blob === "object" && "size" in blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        blobCache.set(documentId, url);
        return { url, live: true };
      }
    } catch {
      /* fall through to the bundled flagship document */
    }
  }
  return { url: SAMPLE_PDF_URL, live: false };
}