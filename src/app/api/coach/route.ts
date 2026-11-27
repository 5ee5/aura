import { z } from "zod";
import { MAX_HISTORY, MAX_MESSAGE, MAX_MESSAGES, MAX_REPLY } from "@/lib/chat-limits";
import { hasSession } from "@/server/auth/dal";
import { getCoach } from "@/server/coach";
import { CoachError } from "@/server/coach/types";

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(MAX_MESSAGE) }),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(MAX_REPLY) }),
]);
const bodySchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((all) => all[0]?.role === "user" && all.at(-1)?.role === "user")
    .refine((all) => all.reduce((n, m) => n + m.content.length, 0) <= MAX_HISTORY),
});

const refuse = (status: number, error: string) => Response.json({ error }, { status });

// The session cookie is also sent by other sites on the same domain, so check.
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return URL.parse(origin ?? "")?.host === request.headers.get("host");
}

/**
 * Streams a reply as server-sent events: {"text"} pieces, then {"done"} or
 * {"error"}. A stream that ends with neither was cut off.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) return refuse(401, "Unauthorized");
  if (!fromThisSite(request)) return refuse(403, "Forbidden");

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return refuse(400, "That conversation is too long or empty. Reload to start again.");

  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  signal.addEventListener("abort", () => console.log("Coach reply stopped"), { once: true });
  const reply = getCoach().reply(body.data.messages, signal)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const event = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  let finished = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reply.next();
        if (signal.aborted) return;
        if (!next.done) return controller.enqueue(event({ text: next.value }));
        controller.enqueue(event({ done: true }));
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof CoachError)) console.error("Coach failed:", (error as Error).name);
        const message = error instanceof CoachError ? error.message : "The reply failed. Try again.";
        const keepReply = error instanceof CoachError && error.keepReply;
        controller.enqueue(event({ error: message, keepReply }));
      }
      finished = true;
      controller.close();
    },
    cancel() {
      if (finished) return;
      abort.abort();
      void reply.return?.();
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
