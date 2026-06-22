// ─── ERROR SYSTEM ────────────────────────────────────────────────────────────

/**
 * All possible failure modes in DocChat.
 * Using a string enum (not numeric) so error codes are readable in logs
 * and API responses without a lookup table.
 */
export enum ErrorCode {
  // Upload / ingest errors
  UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE",
  UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE",
  EMPTY_FILE = "EMPTY_FILE",
  ENCRYPTED_PDF = "ENCRYPTED_PDF",
  EMBEDDING_FAILED = "EMBEDDING_FAILED",
  TEXT_EXTRACTION_FAILED = "TEXT_EXTRACTION_FAILED",

  // LLM / AI errors
  GROQ_UNAVAILABLE = "GROQ_UNAVAILABLE",
  STREAM_INTERRUPTED = "STREAM_INTERRUPTED",

  // Auth errors
  UNAUTHORIZED = "UNAUTHORIZED",
  SESSION_EXPIRED = "SESSION_EXPIRED",

  // Rate limiting
  RATE_LIMITED = "RATE_LIMITED",

  // Data errors
  DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",

  // Network
  NETWORK_ERROR = "NETWORK_ERROR",
}

/**
 * Typed error class used throughout the app.
 * `retryable` lets the frontend decide whether to show a Retry button.
 * `details` carries extra context (e.g., retryAfterMs for rate limits).
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  /** Serialize for JSON API responses and SSE error events */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
    };
  }

  /** Reconstruct from a plain API response object */
  static fromJSON(obj: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }): AppError {
    return new AppError(
      obj.code,
      obj.message,
      obj.statusCode,
      obj.retryable,
      obj.details,
    );
  }
}

// ─── DOCUMENT TYPES ───────────────────────────────────────────────────────────

export type DocumentStatus = "processing" | "ready" | "error" | "partial";
export type DocumentType = "pdf" | "text" | "markdown";

export interface Document {
  id: string;
  userId: string;
  name: string;
  /** File size in bytes */
  size: number;
  type: DocumentType;
  status: DocumentStatus;
  chunkCount: number;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** Returned by GET /api/documents/:id */
export interface DocumentDetail extends Document {
  errorMessage?: string;
}

// ─── CHAT TYPES ───────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface SourceCitation {
  documentId: string;
  documentName: string;
  /** 1-indexed page number extracted from metadata */
  pageNumber: number;
  /** Short text excerpt from the matching chunk */
  snippet: string;
  /** Cosine similarity score 0-1 */
  similarity: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: MessageRole;
  content: string;
  /** Present only on assistant messages after streaming completes */
  sources?: SourceCitation[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  /** Null = session is about ALL uploaded docs, not one specific doc */
  documentId: string | null;
  /** Auto-generated from first user message, max 40 chars */
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  /** Whether full history has been fetched from DB */
  isLoaded: boolean;
}

// ─── SSE EVENT TYPES (chat streaming) ────────────────────────────────────────

export type SSEEvent =
  | { type: "start"; messageId: string; sessionId: string }
  | { type: "token"; content: string }
  | { type: "sources"; sources: SourceCitation[] }
  | { type: "done"; messageId: string; totalTokens: number }
  | { type: "error"; code: ErrorCode; message: string; retryable: boolean };

// ─── UPLOAD TYPES ─────────────────────────────────────────────────────────────

export interface UploadItem {
  /** Temporary client-side ID before server returns real document ID */
  tempId: string;
  fileName: string;
  /** 0-100 integer progress from XHR upload */
  progress: number;
  status: "uploading" | "processing" | "ready" | "error";
  /** Human-readable error for display */
  error?: string;
  /** Set after server responds 200 OK with documentId */
  documentId?: string;
}

// ─── API REQUEST / RESPONSE SHAPES ───────────────────────────────────────────

export interface IngestResponse {
  documentId: string;
  status: DocumentStatus;
  chunkCount: number;
}

export interface ChatRequest {
  sessionId?: string; // omit to create a new session
  content: string; // user's message (max 2000 chars)
  documentId?: string; // scope RAG to one document if provided
}

export interface HistoryResponse {
  session: ChatSession;
}

export interface DocumentsResponse {
  documents: Document[];
}

// ─── API CLIENT UTILITY TYPE ──────────────────────────────────────────────────

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };
