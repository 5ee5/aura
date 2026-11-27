// Takes the database as an argument so tests can use their own.
import { asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { MAX_HISTORY, MAX_MESSAGES } from "../../lib/chat-limits";
import { coachConversations, coachMessages } from "../db/schema";
import type { ChatMessage } from "./types";

type Row = typeof coachMessages.$inferSelect;
type Turn = Pick<Row, "role" | "content" | "status"> & { mock?: boolean };
export type Ending = Pick<Row, "content" | "status" | "problem">;

/**
 * What to send the coach: earlier turns without failed or mock exchanges or
 * empty replies, then the new message, dropping the oldest until it fits.
 */
export function buildHistory(turns: Turn[], next: string): ChatMessage[] {
  const sent: ChatMessage[] = [];
  for (const [index, turn] of turns.entries()) {
    // Canned text must never reach Claude as something it said.
    if (turn.mock) continue;
    const failed = turn.role === "user" ? turns[index + 1] : turn;
    if (failed?.role === "assistant" && failed.status === "failed") continue;
    if (turn.content.trim()) sent.push({ role: turn.role, content: turn.content });
  }
  sent.push({ role: "user", content: next });
  let size = sent.reduce((n, m) => n + m.content.length, 0);
  while (
    sent.length > 1 &&
    (sent.length > MAX_MESSAGES || size > MAX_HISTORY || sent[0]?.role !== "user")
  ) {
    size -= sent.shift()!.content.length;
  }
  return sent;
}

const titleFrom = (text: string) => {
  const line = text.replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
};

const messagesOf = (db: Pick<NodePgDatabase, "select">, conversationId: number) =>
  db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.conversationId, conversationId))
    .orderBy(asc(coachMessages.id));

/**
 * Saves the new message and an empty reply to fill in later. Without an id this
 * starts a conversation. Returns undefined if the conversation no longer exists.
 */
export function startExchange(
  db: NodePgDatabase,
  conversationId: number | undefined,
  text: string,
  mock: boolean,
) {
  return db.transaction(async (tx) => {
    let id = conversationId;
    if (id === undefined) {
      const [created] = await tx
        .insert(coachConversations)
        .values({ title: titleFrom(text) })
        .returning({ id: coachConversations.id });
      id = created!.id;
    } else {
      const touched = await tx
        .update(coachConversations)
        .set({ updatedAt: new Date() })
        .where(eq(coachConversations.id, id))
        .returning({ id: coachConversations.id });
      if (touched.length === 0) return undefined;
    }
    const history = buildHistory(await messagesOf(tx, id), text);
    await tx.insert(coachMessages).values({ conversationId: id, role: "user", content: text, mock });
    const [reply] = await tx
      .insert(coachMessages)
      .values({ conversationId: id, role: "assistant", status: "streaming", mock })
      .returning({ id: coachMessages.id });
    return { conversationId: id, replyId: reply!.id, history };
  });
}

export async function finishReply(db: NodePgDatabase, replyId: number, ending: Ending) {
  await db.update(coachMessages).set(ending).where(eq(coachMessages.id, replyId));
}

export const listConversations = (db: NodePgDatabase) =>
  db.select().from(coachConversations).orderBy(desc(coachConversations.updatedAt));

export async function loadConversation(db: NodePgDatabase, id: number) {
  const [found] = await db.select().from(coachConversations).where(eq(coachConversations.id, id));
  return found && { ...found, messages: await messagesOf(db, id) };
}

export async function deleteConversation(db: NodePgDatabase, id: number) {
  await db.delete(coachConversations).where(eq(coachConversations.id, id));
}
