// FILE: /apps/web/app/api/_lib/response.ts
//
// Typed response factories used by every Route Handler.
// Centralizing these prevents inconsistent JSON shapes across endpoints.

import { NextResponse }          from "next/server";
import { AppError, ErrorCode }   from "@docchat/types";
import type { SSEEvent }         from "@docchat/types";

// ─── JSON RESPONSES ──────────────────────────────────────────────────────────

/** Standard success response */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Typed error response — frontend can parse error.code for specific UI */
export function errorResponse(err: unknown, defaultStatus = 500): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.toJSON() }, { status: err.statusCode });
  }

  // Unexpected error — log it, return generic 500
  console.error("[Route Handler] Unhandled error:", err);
  const fallback = new AppError(
    ErrorCode.NETWORK_ERROR,
    "An unexpected error occurred",
    defaultStatus,
    true
  );
  return NextResponse.json({ error: fallback.toJSON() }, { status: defaultStatus });
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
  generator: AsyncGenerator<SSEEvent>
): NextResponse {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of generator) {
          // SSE format: "data: <json>\n\n"
          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        // Emit an error event before closing so the client knows what happened
        const appErr = err instanceof AppError
          ? err
          : new AppError(ErrorCode.STREAM_INTERRUPTED, "Stream interrupted", 500, true);

        const errorEvent: SSEEvent = {
          type:      "error",
          code:      appErr.code,
          message:   appErr.message,
          retryable: appErr.retryable,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status:  200,
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
