// FILE: /apps/web/app/api/_lib/response.ts
//
// Typed response factories used by every Route Handler.
// Centralizing these prevents inconsistent JSON shapes across endpoints.

import { NextResponse } from "next/server";
import { AppError, ErrorCode } from "@docchat/types";
import type { SSEEvent } from "@docchat/types";

// ─── JSON RESPONSES ──────────────────────────────────────────────────────────

/** Standard success response */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Typed error response — frontend can parse error.code for specific UI */
export function errorResponse(err: unknown, defaultStatus = 500): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.toJSON() },
      { status: err.statusCode },
    );
  }

  // Unexpected error — log it, return generic 500
  console.error("[Route Handler] Unhandled error:", err);
  const fallback = new AppError(
    ErrorCode.NETWORK_ERROR,
    "An unexpected error occurred",
    defaultStatus,
    true,
  );
  return NextResponse.json(
    { error: fallback.toJSON() },
    { status: defaultStatus },
  );
}

// ─── SSE STREAM RESPONSE ─────────────────────────────────────────────────────
//
// Returns a NextResponse with Content-Type: text/event-stream.
// The caller provides an async generator that yields SSEEvent objects.
// We serialize each event to "data: {...}\n\n" format.
//
// HEADERS EXPLAINED:
//   Content-Type: text/event-stream  — tells browser to use EventSource protocol
//   Cache-Control: no-cache          — prevent any proxy from caching the stream
//   no-transform                     — stops nginx/Vercel from buffering the body
//   Connection: keep-alive           — keep the TCP connection open
//   X-Accel-Buffering: no            — disable nginx proxy buffering specifically
//                                       (Vercel uses nginx under the hood)
//
// Without X-Accel-Buffering: no, tokens accumulate in a buffer and get
// flushed in large batches, ruining the character-by-character streaming UX.

export function streamResponse(
  generator: AsyncGenerator<SSEEvent>,
): NextResponse {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (event: SSEEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        for await (const event of generator) {
          enqueue(event);
        }
      } catch (err) {
        // ── FIX: surface the REAL error message, not a generic fallback ──
        // Previously all errors collapsed to "Stream interrupted" which made
        // debugging impossible. Now we log the original error and pass its
        // message through to the client so you can see what actually failed
        // (e.g. "Embedding failed: Service Unavailable", "Vector search failed: ...",
        //  "HuggingFace 503", etc.)
        console.error("[streamResponse] Generator threw:", err);

        let appErr: AppError;
        if (err instanceof AppError) {
          appErr = err;
        } else if (err instanceof Error) {
          // Wrap native errors — preserve the original message
          appErr = new AppError(
            ErrorCode.STREAM_INTERRUPTED,
            err.message, // <-- real message, not "Stream interrupted"
            500,
            true,
          );
        } else {
          appErr = new AppError(
            ErrorCode.STREAM_INTERRUPTED,
            String(err),
            500,
            true,
          );
        }

        enqueue({
          type: "error",
          code: appErr.code,
          message: appErr.message,
          retryable: appErr.retryable,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
