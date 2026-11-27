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

interface Turn {
  pieces?: string[];
  stop?: string;
  content?: object[];
}

/** Answers each request with the next turn, repeating the last one. */
function scripted(turns: Turn[], fail?: Error) {
  let asked = 0;
  type Stream = (body: { messages: unknown[]; system: unknown }, options: { signal: AbortSignal }) => object;
  const stream = vi.fn<Stream>(() => {
    const turn = turns[Math.min(asked++, turns.length - 1)] ?? {};
    return {
      async *[Symbol.asyncIterator]() {
        if (fail) throw fail;
        for (const text of turn.pieces ?? []) {
          yield { type: "content_block_delta", delta: { type: "text_delta", text } };
        }
      },
      finalMessage: async () => ({ stop_reason: turn.stop ?? "end_turn", usage, content: turn.content ?? [] }),
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
}

const fakeClient = (pieces: string[], stop?: string, fail?: Error) => scripted([{ pieces, stop }], fail);
const profile = async () => "PROFILE";

function fakeLedger() {
  const settled: Tokens[] = [];
  const reserve = vi.fn<Ledger["reserve"]>(async () => 1);
  const ledger: Ledger = { reserve, settle: async (_id, tokens) => void settled.push(tokens) };
  return { ledger, settled, reserve };
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
    expect(await collect(claudeReply(client, ledger, profile)(ask, new AbortController().signal))).toBe("Run easy.");
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
    const reply = claudeReply(client, fakeLedger().ledger, profile)(ask, new AbortController().signal);
    await expect(collect(reply)).rejects.toThrow(message);
  });

  it("marks only a shortened reply as worth keeping", async () => {
    for (const [reason, keep] of [["max_tokens", true], ["refusal", false]] as const) {
      const reply = claudeReply(fakeClient(["Part"], reason).client, fakeLedger().ledger, profile);
      await expect(collect(reply(ask, new AbortController().signal))).rejects.toMatchObject({ keepReply: keep });
    }
  });

  it("cancels the request when stopped and keeps the reservation", async () => {
    const { client, stream } = fakeClient(["one", "two"]);
    const { ledger, settled } = fakeLedger();
    const controller = new AbortController();
    const reply = claudeReply(client, ledger, profile)(ask, controller.signal)[Symbol.asyncIterator]();
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
    const reply = claudeReply(client, ledger, profile)(ask, new AbortController().signal);
    await expect(collect(reply)).rejects.toThrow(/API key/);
    expect(settled).toEqual([{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }]);
  });
});

describe("claudeReply with the profile tool", () => {
  const call = { type: "tool_use", id: "toolu_1", name: "get_profile", input: {} };
  const thinking = { type: "thinking", thinking: "", signature: "sig" };
  const signal = () => new AbortController().signal;

  it("returns the turn unchanged with the result, and counts each request", async () => {
    const first = { pieces: ["Let me look."], stop: "tool_use", content: [thinking, call] };
    const { client, stream } = scripted([first, { pieces: ["Rest today."] }]);
    const { ledger, settled, reserve } = fakeLedger();
    const readProfile = vi.fn();
    const reply = claudeReply(client, ledger, profile)(ask, signal(), { readProfile });

    expect(await collect(reply)).toBe("Let me look.\n\nRest today.");
    expect(readProfile).toHaveBeenCalledOnce();
    const [one, two] = stream.mock.calls.map(([body]) => body);
    expect(one?.messages).toEqual(ask);
    expect(two?.messages).toEqual([
      ...ask,
      { role: "assistant", content: [thinking, call] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "PROFILE" }] },
    ]);
    expect(two?.system).toBe(one?.system);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(settled).toHaveLength(2);
  });

  it("sends nothing more when stopped while reading the profile", async () => {
    const controller = new AbortController();
    const { client, stream } = scripted([{ stop: "tool_use", content: [call] }]);
    const { ledger, reserve } = fakeLedger();
    const stopping = async () => {
      controller.abort();
      return "PROFILE";
    };
    await collect(claudeReply(client, ledger, stopping)(ask, controller.signal));
    expect(stream).toHaveBeenCalledOnce();
    expect(reserve).toHaveBeenCalledOnce();
  });

  it("stops after a few rounds", async () => {
    const { client, stream } = scripted([{ stop: "tool_use", content: [call] }]);
    const reply = claudeReply(client, fakeLedger().ledger, profile)(ask, signal());
    await expect(collect(reply)).rejects.toThrow("without answering");
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it("tells Claude when the profile cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, stream } = scripted([{ stop: "tool_use", content: [call] }, { pieces: ["ok"] }]);
    const broken = () => Promise.reject(new Error("db"));
    await collect(claudeReply(client, fakeLedger().ledger, broken)(ask, signal()));
    expect(JSON.stringify(stream.mock.calls[1]?.[0].messages)).toContain('"is_error":true');
  });

  it("drops what came before a fallback, and never runs tools after a refusal", async () => {
    const fallback = { type: "fallback" };
    const mixed = [thinking, { ...call, id: "old" }, fallback, call];
    const first = scripted([{ stop: "tool_use", content: mixed }, { pieces: ["ok"] }]);
    await collect(claudeReply(first.client, fakeLedger().ledger, profile)(ask, signal()));
    expect(first.stream.mock.calls[1]?.[0].messages.at(-2)).toEqual({
      role: "assistant",
      content: [fallback, call],
    });

    const read = vi.fn(profile);
    const refused = scripted([{ stop: "refusal", content: [call] }]);
    await expect(
      collect(claudeReply(refused.client, fakeLedger().ledger, read)(ask, signal())),
    ).rejects.toThrow("declined");
    expect(read).not.toHaveBeenCalled();
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
