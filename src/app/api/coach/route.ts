import { z } from "zod";
import { hasSession } from "@/server/auth/dal";
import { mockReply } from "@/server/coach/mock";

const bodySchema = z.object({ message: z.string().trim().min(1).max(4000) });

const refuse = (status: number, error: string) => Response.json({ error }, { status });

// The session cookie is also sent by other sites on the same domain, so check.
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return URL.parse(origin ?? "")?.host === request.headers.get("host");
}

/**
 * Streams a reply as server-sent events: {"text"} pieces, then {"done"}.
 * A stream that ends without "done" was cut off.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) return refuse(401, "Unauthorized");
  if (!fromThisSite(request)) return refuse(403, "Forbidden");

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return refuse(400, "Send a message of 1 to 4000 characters.");

  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const reply = mockReply(body.data.message, signal)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const event = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reply.next();
      if (signal.aborted) return;
      if (next.done) {
        controller.enqueue(event({ done: true }));
        controller.close();
      } else {
        controller.enqueue(event({ text: next.value }));
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression from holding pieces back.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
