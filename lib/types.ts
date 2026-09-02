/**
 * Shared domain types for the CIL / CMPDI Search Studio.
 * These mirror the state contracts described in Architecture.md.
 */

export type PortalMode = "EXECUTIVE" | "INGESTION";

export type UserRole = "EXECUTIVE" | "SUBSIDIARY";

export interface SessionUser {
  name: string;
  role: UserRole;
  subsidiary?: string;
  coalfield?: string;
  email?: string;
}

/** Citation metadata required by the bounding-box overlay engine. */
export interface Citation {
  id: string;
  documentName: string;
  pageNumber: number;
  /** Bounding coordinate set — top-left (x1, y1) and bottom-right (x2, y2). */
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: number;
}

export type RecordVerificationStatus =
  | "pending"
  | "flagged"
  | "verified"
  | "corrected";

/** Machine-extracted key-value pair with OCR confidence for HITL review. */
export interface ExtractedRecord {
  id: string;
  key: string;
  value: string;
  /** OCR confidence 0.0 – 1.0 */
  confidence: number;
  status: RecordVerificationStatus;
}

export type FileStatus =
  | "queued"
  | "processing"
  | "verified"
  | "committed"
  | "error";

export interface UploadedFileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: FileStatus;
  progress: number;
}

export interface IngestionMetadata {
  subsidiary: string;
  coalfield: string;
  category: string;
  fiscalYear: string;
}

export interface DraftDocument {
  title: string;
  preamble: string;
  body: string;
  citations: Citation[];
}
