import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_MESSAGES } from "../../lib/chat-limits";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import * as store from "./conversations";

const user = (content: string) => ({ role: "user" as const, content, status: "done" as const });
const reply = (content: string, status: "done" | "stopped" | "failed" = "done") => ({
  role: "assistant" as const,
  content,
  status,
});

describe("buildHistory", () => {
  it("drops failed exchanges and empty replies, and keeps partial ones", () => {
    const turns = [
      user("a"),
      reply("A"),
      user("lost"),
      reply("half", "failed"),
      user("b"),
      reply("", "stopped"),
      user("c"),
      reply("C part", "stopped"),
    ];
    expect(store.buildHistory(turns, "d").map((m) => m.content)).toEqual([
      "a",
      "A",
      "b",
      "c",
      "C part",
      "d",
    ]);
  });

  it("never passes mock exchanges to the coach", () => {
    const canned = [user("test"), reply("canned")].map((turn) => ({ ...turn, mock: true }));
    expect(store.buildHistory([...canned, user("a"), reply("A")], "b").map((m) => m.content)).toEqual([
      "a",
      "A",
      "b",
    ]);
  });

  it("tells the coach about workout cards, even under an empty reply", () => {
    const card = "[Workout card: easy]";
    const turns = [user("plan"), { ...reply(""), workouts: [card] }, user("ok"), { ...reply("Done"), workouts: [card] }];
    expect(store.buildHistory(turns, "shorter?").map((m) => m.content)).toEqual([
      "plan",
      card,
      "ok",
      `Done\n\n${card}`,
      "shorter?",
    ]);
  });

  it("drops the oldest turns to fit and still starts with the athlete", () => {
    const turns = Array.from({ length: 40 }, (_, i) => (i % 2 ? reply(`r${i}`) : user(`u${i}`)));
    const sent = store.buildHistory(turns, "now");
    expect(sent.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(sent[0]?.role).toBe("user");
    expect(sent.at(-1)?.content).toBe("now");
    expect(store.buildHistory([user("x".repeat(70_000)), reply("y")], "short")).toEqual([
      { role: "user", content: "short" },
    ]);
  });
});

describe("conversation storage", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  it("saves an exchange, sends it back next time, and deletes it whole", async () => {
    const first = (await store.startExchange(db, undefined, `Long\nrun ${"?".repeat(80)}`, false))!;
    expect(first.history).toHaveLength(1);
    await store.finishReply(db, first.replyId, { content: "Easy.", status: "done", problem: null });

    const second = (await store.startExchange(db, first.conversationId, "And then?", false))!;
    expect(second.history.map((m) => m.role)).toEqual(["user", "assistant", "user"]);

    const saved = (await store.loadConversation(db, first.conversationId))!;
    expect(saved.title).toHaveLength(60);
    expect(saved.title.startsWith("Long run ?")).toBe(true);
    expect(saved.messages.map((m) => m.status)).toEqual(["done", "done", "done", "streaming"]);

    await store.deleteConversation(db, first.conversationId);
    expect(await store.listConversations(db)).toEqual([]);
    expect((await pool.query("select * from coach_messages")).rowCount).toBe(0);
    expect(await store.startExchange(db, first.conversationId, "Hello?", true)).toBeUndefined();
  });
});
