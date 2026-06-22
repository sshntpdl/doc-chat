import { NextResponse } from "next/server";
import { AppError, ErrorCode } from "@docchat/types";
import type { SSEEvent } from "@docchat/types";

// ─── JSON RESPONSES ──────────────────────────────────────────────────────────

/** Standard success response */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Typed error response*/
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
        console.error("[streamResponse] Generator threw:", err);

        let appErr: AppError;
        if (err instanceof AppError) {
          appErr = err;
        } else if (err instanceof Error) {
          // Wrap native errors — preserve the original message
          appErr = new AppError(
            ErrorCode.STREAM_INTERRUPTED,
            err.message,
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
