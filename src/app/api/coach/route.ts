import { z } from "zod";
import { MAX_MESSAGE } from "@/lib/chat-limits";
import { localToday } from "@/lib/dates";
import { hasSession } from "@/server/auth/dal";
import { getCoach } from "@/server/coach";
import { type Ending, finishReply, startExchange } from "@/server/coach/conversations";
import { describeProfile } from "@/server/coach/profile-summary";
import { CoachError, type CoachTools } from "@/server/coach/types";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/profile/data";
import { describeSchedule } from "@/server/calendar/schedule-summary";
import { proposeWorkout } from "@/server/workouts/propose";
import { proposeWeek } from "@/server/workouts/propose-week";
import { limitsFrom } from "@/server/workouts/rules";

const bodySchema = z.object({
  conversationId: z.number().int().positive().max(2_147_483_647).optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE),
});

const refuse = (status: number, error: string) => Response.json({ error }, { status });

// The session cookie is also sent by other sites on the same domain, so check.
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return URL.parse(origin ?? "")?.host === request.headers.get("host");
}

/**
 * Takes one new message; earlier turns come from the database. Streams
 * server-sent events: {"conversation"}, then {"text"}, {"readProfile"}, {"workout"} and {"week"},
 * then {"done"} or {"error"}. A stream that ends with neither was cut off.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) return refuse(401, "Unauthorized");
  if (!fromThisSite(request)) return refuse(403, "Forbidden");

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return refuse(400, `Send a message of 1 to ${MAX_MESSAGE} characters.`);

  const coach = getCoach();
  const db = getDb();
  const exchange = await startExchange(db, body.data.conversationId, body.data.message, coach.mock);
  if (!exchange) return refuse(404, "That chat was deleted. Start a new one.");

  // The reply is kept here, so it can be saved after the browser has gone.
  let text = "";
  let usedProfile = false;
  let saved: Promise<void> | undefined;
  const save = (status: Ending["status"], problem: string | null = null) =>
    (saved ??= finishReply(db, exchange.replyId, {
      content: text,
      status,
      problem,
      usedProfile,
    }).catch((error) => console.error("Could not save a coach reply:", (error as Error).name)));

  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const stopped = () => {
    if (!saved) console.log("Coach reply stopped");
    void save("stopped");
  };
  if (signal.aborted) stopped();
  else signal.addEventListener("abort", stopped, { once: true });

  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  const send = (data: object) => {
    if (!signal.aborted) output?.enqueue(event(data));
  };
  const tools: CoachTools = {
    async readProfile() {
      usedProfile = true;
      send({ readProfile: true });
      return describeProfile(await getProfile());
    },
    async proposeWorkout(input) {
      const link = { conversationId: exchange.conversationId, messageId: exchange.replyId, mock: coach.mock };
      const limits = async () => limitsFrom(await getProfile());
      const { outcome, workout, changes } = await proposeWorkout(db, input, limits, link, localToday());
      if (workout) send({ workout, changes });
      return outcome;
    },
    getSchedule: describeSchedule,
    async proposeWeek(input) {
      const link = { conversationId: exchange.conversationId, messageId: exchange.replyId, mock: coach.mock };
      const limits = async () => limitsFrom(await getProfile());
      const { outcome, week } = await proposeWeek(db, input, limits, link, localToday());
      if (week) send({ week });
      return outcome;
    },
  };
  const reply = coach.reply(exchange.history, signal, tools)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const event = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
      controller.enqueue(event({ conversation: exchange.conversationId }));
    },
    async pull(controller) {
      try {
        const next = await reply.next();
        if (signal.aborted) return;
        if (!next.done) {
          text += next.value;
          return controller.enqueue(event({ text: next.value }));
        }
        await save("done");
        controller.enqueue(event({ done: true }));
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof CoachError)) console.error("Coach failed:", (error as Error).name);
        const message = error instanceof CoachError ? error.message : "The reply failed. Try again.";
        const keepReply = error instanceof CoachError && error.keepReply;
        await save(keepReply ? "shortened" : "failed", message);
        controller.enqueue(event({ error: message, keepReply }));
      }
      controller.close();
    },
    cancel() {
      if (saved) return;
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
