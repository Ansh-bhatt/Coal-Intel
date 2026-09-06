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

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("coal_intel_refresh_token");
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("coal_intel_access_token", token);
  else window.localStorage.removeItem("coal_intel_access_token");
}

export function setRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("coal_intel_refresh_token", token);
  else window.localStorage.removeItem("coal_intel_refresh_token");
}

export function clearAccessToken() {
  setAccessToken(null);
}

export function clearRefreshToken() {
  setRefreshToken(null);
}

/**
 * Exchange the stored refresh token for a fresh token pair (POST /auth/refresh).
 * Single-flight: concurrent 401s share one in-flight refresh instead of racing
 * the endpoint with already-rotated tokens. Resolves `false` when there is no
 * refresh token or the endpoint rejects it (caller then surfaces the 401).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenResponse;
    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
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
  // Headers are rebuilt per attempt so the retry picks up the fresh token.
  const build = (): RequestInit => {
    const finalHeaders: Record<string, string> = { ...headers };
    const token = getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;

    let payload: BodyInit | undefined;
    if (raw !== undefined) {
      payload = raw as BodyInit;
    } else if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return { method, headers: finalHeaders, body: payload };
  };

  let res = await fetch(`${BASE_URL}${path}`, build());
  // Access tokens are short-lived (ACCESS_TOKEN_EXPIRE_MINUTES, default 30).
  // On 401, try one silent refresh + retry before surfacing the error.
  if (res.status === 401 && (await refreshAccessToken())) {
    res = await fetch(`${BASE_URL}${path}`, build());
  }

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
export interface CitationDto { id: string; documentName: string; pageNumber: number; documentId?: string | null; boundingBox: { x1: number; y1: number; x2: number; y2: number }; }
export interface ChatRequest { message: string; session_id?: string; subsidiary?: string; coalfield?: string; fiscal_year?: string; }
export interface ChatStreamHandlers { onToken: (token: string) => void; onCitations: (citations: CitationDto[]) => void; onDone: (messageId: string, sessionId?: string) => void; onError: (err: Error) => void; }

/**
 * POST /chat returns an SSE stream. We read it with fetch + ReadableStream so
 * the browser never needs a separate EventSource (which can't send a POST body
 * with an Authorization header).
 */
export async function streamChat(payload: ChatRequest, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  const send = () => {
    const token = getAccessToken();
    return fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal,
    });
  };
  let res = await send();
  // Access tokens are short-lived — one silent refresh + retry on 401 before
  // the caller's error handling kicks in.
  if (res.status === 401 && (await refreshAccessToken())) {
    res = await send();
  }
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
        else if (event === "done") {
          const done = JSON.parse(data);
          handlers.onDone(done.message_id, done.session_id);
        }
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

export interface TopicItem { text: string; value: number; chunks: number; }
export async function getTopics(subsidiary?: string, limit = 12): Promise<TopicItem[]> {
  const q = new URLSearchParams();
  if (subsidiary) q.set("subsidiary", subsidiary);
  q.set("limit", String(limit));
  return apiRequest<TopicItem[]>(`/analytics/topics?${q.toString()}`);
}

export interface DocumentDto {
  id: string;
  file_name: string;
  file_type: string;
  subsidiary: string | null;
  coalfield: string | null;
  category: string | null;
  fiscal_year: string | null;
  status: string;
  uploaded_at: string;
  committed_at: string | null;
}
export async function listDocuments(limit = 50): Promise<DocumentDto[]> {
  const data = await apiRequest<{ items: DocumentDto[]; total: number }>(
    `/documents?limit=${limit}`,
  );
  return data.items;
}

export interface DraftOut { id: string; title: string; preamble: string; body: string; citations: CitationDto[]; }
export async function generateDraft(sessionId: string): Promise<DraftOut> {
  return apiRequest<DraftOut>("/drafts", { method: "POST", body: { session_id: sessionId } });
}

export type ReportType =
  | "geological_brief"
  | "production_review"
  | "parliamentary_response";

export interface ReportRequestDto {
  report_type: ReportType;
  topic?: string;
  document_ids?: string[];
}

export interface ReportSectionDto { heading: string; body: string; }
export interface ReportKeyFigureDto { label: string; value: string; }
export interface ReportCitationDto {
  id: string;
  documentName: string;
  pageNumber: number;
  documentId?: string | null;
  quote?: string | null;
}

export interface ReportOut {
  id: string;
  report_type: string;
  title: string;
  preamble: string;
  sections: ReportSectionDto[];
  key_figures: ReportKeyFigureDto[];
  citations: ReportCitationDto[];
  generated_at: string;
  compile_seconds: number;
  source_count: number;
}

export async function createOnDemandReport(
  payload?: Partial<ReportRequestDto>,
): Promise<ReportOut> {
  return apiRequest<ReportOut>("/reports/generate", {
    method: "POST",
    body: payload ?? { report_type: "geological_brief" },
  });
}

/** Stateless export — echoes the generated report back for PDF/DOCX rendering. */
export async function exportReport(
  report: ReportOut,
  format: "pdf" | "docx",
): Promise<void> {
  const blob = await apiRequest<Blob>("/reports/export", {
    method: "POST",
    body: { report, format },
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.title.replace(/[^\w.-]+/g, "-").slice(0, 80) || "report"}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === "TypeError");
}