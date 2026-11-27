import Anthropic from "@anthropic-ai/sdk";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import { claudeReply, createClaudeClient } from "./claude";
import type { ChatMessage } from "./types";
import { costUsd, databaseLedger, type Ledger, type Tokens } from "./usage";

// Nothing here reaches Anthropic: the client is a stand-in.
const ask: ChatMessage[] = [{ role: "user", content: "How far should I run?" }];
const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 20 };

function fakeClient(pieces: string[], stopReason = "end_turn", fail?: Error) {
  type Stream = (body: unknown, options: { signal: AbortSignal }) => object;
  const stream = vi.fn<Stream>(() => ({
    async *[Symbol.asyncIterator]() {
      if (fail) throw fail;
      for (const text of pieces) yield { type: "content_block_delta", delta: { type: "text_delta", text } };
    },
    finalMessage: async () => ({ stop_reason: stopReason, usage }),
  }));
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
}

function fakeLedger() {
  const settled: Tokens[] = [];
  const ledger: Ledger = { reserve: async () => 1, settle: async (_id, tokens) => void settled.push(tokens) };
  return { ledger, settled };
}

const collect = async (reply: AsyncIterable<string>) => {
  const pieces: string[] = [];
  for await (const piece of reply) pieces.push(piece);
  return pieces.join("");
};

afterEach(() => vi.unstubAllEnvs());

describe("createClaudeClient", () => {
  it("only ever talks to Anthropic with the given key", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://elsewhere.invalid");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "someone-elses-token");
    const client = createClaudeClient("sk-test");
    expect(client.baseURL).toBe("https://api.anthropic.com");
    expect(client.apiKey).toBe("sk-test");
    expect(client.authToken).toBeNull();
  });
});

describe("claudeReply", () => {
  it("streams text, sends the history and records what was used", async () => {
    const { client, stream } = fakeClient(["Run ", "easy."]);
    const { ledger, settled } = fakeLedger();
    expect(await collect(claudeReply(client, ledger)(ask, new AbortController().signal))).toBe("Run easy.");
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      messages: ask,
      output_config: { effort: "low" },
      fallbacks: "default",
    });
    expect(settled).toEqual([{ input: 100, output: 50, cacheRead: 10, cacheWrite: 20 }]);
  });

  it.each([
    ["refusal", /declined/],
    ["max_tokens", /length limit/],
  ])("explains a reply that ends with %s", async (reason, message) => {
    const { client } = fakeClient(["Part"], reason);
    const reply = claudeReply(client, fakeLedger().ledger)(ask, new AbortController().signal);
    await expect(collect(reply)).rejects.toThrow(message);
  });

  it("marks only a shortened reply as worth keeping", async () => {
    for (const [reason, keep] of [["max_tokens", true], ["refusal", false]] as const) {
      const reply = claudeReply(fakeClient(["Part"], reason).client, fakeLedger().ledger);
      await expect(collect(reply(ask, new AbortController().signal))).rejects.toMatchObject({ keepReply: keep });
    }
  });

  it("cancels the request when stopped and keeps the reservation", async () => {
    const { client, stream } = fakeClient(["one", "two"]);
    const { ledger, settled } = fakeLedger();
    const controller = new AbortController();
    const reply = claudeReply(client, ledger)(ask, controller.signal)[Symbol.asyncIterator]();
    await reply.next();
    expect(stream.mock.calls[0]?.[1].signal).toBe(controller.signal);
    controller.abort();
    await reply.return?.();
    expect(settled).toEqual([]);
  });

  it("explains a rejected key without counting its cost", async () => {
    const rejected = new Anthropic.AuthenticationError(401, undefined, "no", new Headers());
    const { client } = fakeClient([], "end_turn", rejected);
    const { ledger, settled } = fakeLedger();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reply = claudeReply(client, ledger)(ask, new AbortController().signal);
    await expect(collect(reply)).rejects.toThrow(/API key/);
    expect(settled).toEqual([{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }]);
  });
});

describe("databaseLedger", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  it("prices tokens", () => {
    expect(costUsd({ input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 })).toBeCloseTo(14.6);
  });

  it("holds the daily limit, even for requests made at once, and frees what was not used", async () => {
    const ledger = databaseLedger(db, 1);
    const results = await Promise.allSettled([0.6, 0.6].map((usd) => ledger.reserve("m", usd)));
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const first = results.find((r) => r.status === "fulfilled")!;
    await ledger.settle((first as PromiseFulfilledResult<number>).value, {
      input: 1000,
      output: 1000,
      cacheRead: 0,
      cacheWrite: 0,
    });
    await expect(ledger.reserve("m", 0.6)).resolves.toBeGreaterThan(0);
    await expect(ledger.reserve("m", 0.6)).rejects.toThrow("daily limit");
  });
});
