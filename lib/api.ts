/**
 * Thin typed API client for the Coal-Intel backend.
 *
 * Base URL comes from NEXT_PUBLIC_API_BASE_URL (see 05_Rules.md — the
 * NEXT_PUBLIC_ prefix is required for browser-visible env vars).
 *
 * lib/types.ts remains the single source of truth for the domain shapes;
 * the backend's Pydantic schemas mirror it.
 */
import type { SessionUser } from "@/lib/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Read the JWT access token (set by the auth store). */
function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("coal_intel_access_token");
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("coal_intel_access_token", token);
  else window.localStorage.removeItem("coal_intel_access_token");
}

export function clearAccessToken() {
  setAccessToken(null);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Raw body already serialised (e.g. FormData) — skips JSON.stringify. */
  raw?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T = unknown>(
  path: string,
  { method = "GET", body, raw, headers = {} }: RequestOptions = {},
): Promise<T> {
  const token = getAccessToken();
  const finalHeaders: Record<string, string> = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (raw !== undefined) {
    payload = raw as BodyInit;
  } else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: payload,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, String(detail));
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as T;
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: SessionUser;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    throw new ApiError(400, "Email and password are required.");
  }
  try {
    return await apiRequest<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email: trimmedEmail, password },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 400)) {
      throw new ApiError(err.status, "Invalid credentials. Verify your email and password.");
    }
    throw err;
  }
}

export async function uploadDocument(file: File, onProgress?: (pct: number) => void): Promise<{ document_id: string; status: string; file_name: string }> {
  const form = new FormData();
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/documents`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new ApiError(xhr.status, "Invalid response")); } }
      else { let detail = xhr.statusText; try { detail = JSON.parse(xhr.responseText).detail ?? detail; } catch { /* ignore */ } reject(new ApiError(xhr.status, String(detail))); }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.send(form);
  });
}

export interface DocumentOut { id: string; file_name: string; file_type: string; subsidiary: string | null; coalfield: string | null; category: string | null; fiscal_year: string | null; status: string; uploaded_at: string; committed_at: string | null; }
export async function getDocument(id: string): Promise<DocumentOut> { return apiRequest<DocumentOut>(`/documents/${id}`); }
export async function updateDocumentMetadata(id: string, metadata: { subsidiary: string; coalfield: string; category: string; fiscal_year: string }): Promise<DocumentOut> {
  return apiRequest<DocumentOut>(`/documents/${id}/metadata`, { method: "PATCH", body: metadata });
}

export interface ExtractedRecord { id: string; key: string; value: string; confidence: number; status: string; }
export async function getRecords(documentId: string): Promise<ExtractedRecord[]> {
  const data = await apiRequest<{ items: ExtractedRecord[]; total: number }>(`/documents/${documentId}/records`);
  return data.items;
}
export async function updateRecord(recordId: string, value: string): Promise<ExtractedRecord> {
  return apiRequest<ExtractedRecord>(`/documents/records/${recordId}`, { method: "PATCH", body: { value } });
}
export async function commitDocument(documentId: string): Promise<{ document_id: string; status: string; committed_at: string }> {
  return apiRequest(`/documents/${documentId}/commit`, { method: "POST" });
}
export interface CitationDto { id: string; documentName: string; pageNumber: number; boundingBox: { x1: number; y1: number; x2: number; y2: number }; }
export interface ChatRequest { message: string; session_id?: string; subsidiary?: string; coalfield?: string; fiscal_year?: string; }
export interface ChatStreamHandlers { onToken: (token: string) => void; onCitations: (citations: CitationDto[]) => void; onDone: (messageId: string, sessionId?: string) => void; onError: (err: Error) => void; }

/**
 * POST /chat returns an SSE stream. We read it with fetch + ReadableStream so
 * the browser never needs a separate EventSource (which can't send a POST body
 * with an Authorization header).
 */
export async function streamChat(payload: ChatRequest, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
    throw new ApiError(res.status, String(detail));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      const data = dataLines.join("\n");
      if (!data) continue;
      try {
        if (event === "token") handlers.onToken(JSON.parse(data).token);
        else if (event === "citations") handlers.onCitations(JSON.parse(data));
        else if (event === "done") handlers.onDone(JSON.parse(data).message_id, JSON.parse(data).session_id);
      } catch { /* skip malformed event */ }
    }
  }
}
export interface AnalyticsMetrics { total_documents: number; committed_documents: number; total_records: number; verified_records: number; average_confidence: number | null; extraction_accuracy: number | null; total_chunks: number; }
export async function getMetrics(): Promise<AnalyticsMetrics> { return apiRequest<AnalyticsMetrics>("/analytics/metrics"); }

export interface WordCloudItem { text: string; value: number; }
export async function getWordCloud(subsidiary?: string): Promise<WordCloudItem[]> {
  const q = subsidiary ? `?subsidiary=${encodeURIComponent(subsidiary)}` : "";
  return apiRequest<WordCloudItem[]>(`/analytics/wordcloud${q}`);
}

export interface DraftOut { id: string; title: string; preamble: string; body: string; citations: CitationDto[]; }
export async function generateDraft(sessionId: string): Promise<DraftOut> {
  return apiRequest<DraftOut>("/drafts", { method: "POST", body: { session_id: sessionId } });
}

export interface ReportOut {
  id: string;
  title: string;
  preamble: string;
  body: string;
  citations: { id: string; documentName: string; pageNumber: number }[];
  generated_at: string;
}

export async function createOnDemandReport(): Promise<ReportOut> {
  return apiRequest<ReportOut>("/reports/generate", { method: "POST" });
}

export function documentFileUrl(documentId: string): string {
  const token = getAccessToken();
  const sep = BASE_URL.includes("?") ? "&" : "?";
  const auth = token ? `${sep}auth=${encodeURIComponent(token)}` : "";
  return `${BASE_URL}/documents/${documentId}/file${auth}`;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === "TypeError");
}