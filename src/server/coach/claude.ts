import Anthropic from "@anthropic-ai/sdk";
import { localToday } from "../../lib/dates";
import { PROPOSE_WORKOUT_TOOL } from "../workouts/proposal";
import { SYSTEM_PROMPT } from "./prompt";
import { CoachError, type CoachReply, type CoachTools, type ToolOutcome } from "./types";
import { costUsd, type Ledger, type Tokens } from "./usage";

export const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;
const NOTHING: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
/** API requests in one reply: each round of tool calls costs another. */
const MAX_REQUESTS = 4;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_profile",
    description:
      "Read the athlete's profile: training preferences, weekly availability, goals, personal " +
      "bests, race history and injuries. Call it before giving advice or a plan that depends on " +
      "any of these, and again if the athlete says they have changed it. Read only.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  PROPOSE_WORKOUT_TOOL as unknown as Anthropic.Beta.BetaTool,
];

/**
 * Everything is passed explicitly: the SDK would otherwise take the address and
 * credentials from whatever ANTHROPIC_* variables the process happens to have.
 */
export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL: "https://api.anthropic.com",
    logLevel: "warn",
  });
}

type Usage = Anthropic.Beta.BetaUsage;

/** Adds up every attempt, since a fallback model's attempt is billed too. */
function tokensUsed(usage: Usage): Tokens {
  const attempts = usage.iterations?.length ? usage.iterations : [usage];
  return attempts.reduce<Tokens>(
    (sum, attempt) => ({
      input: sum.input + attempt.input_tokens,
      output: sum.output + attempt.output_tokens,
      cacheRead: sum.cacheRead + (attempt.cache_read_input_tokens ?? 0),
      cacheWrite: sum.cacheWrite + (attempt.cache_creation_input_tokens ?? 0),
    }),
    NOTHING,
  );
}

// Most specific first: the connection and abort errors are also APIErrors.
function explain(error: unknown): CoachError {
  if (error instanceof Anthropic.APIConnectionError) {
    return new CoachError("Couldn’t reach Claude. Try again.");
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new CoachError("Claude rejected the API key. Check ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new CoachError("Claude is limiting requests. Wait a minute and try again.");
  }
  if (error instanceof Anthropic.APIError && error.status && error.status < 500) {
    return new CoachError(`Claude refused the request (${error.status}). Check your Anthropic account.`);
  }
  return new CoachError("Claude had a problem. Try again.");
}

type Message = Anthropic.Beta.BetaMessage;
type Params = Anthropic.Beta.BetaMessageParam;

/**
 * The turn as it must be sent back. After a mid-reply fallback, the first
 * model's thinking and tool calls are left out.
 */
function echo(content: Message["content"]): Message["content"] {
  const boundary = content.findLastIndex((block) => block.type === "fallback");
  return content.filter(
    (block, index) =>
      index >= boundary || !["thinking", "redacted_thinking", "tool_use"].includes(block.type),
  );
}

export function claudeReply(client: Anthropic, ledger: Ledger): CoachReply {
  /** One API request: yields its text and returns the finished message. */
  async function* request(
    system: Anthropic.Beta.BetaTextBlockParam[],
    messages: Params[],
    signal: AbortSignal,
  ): AsyncGenerator<string, Message | undefined> {
    const characters = JSON.stringify([system, TOOLS, messages]).length;
    // About three characters a token errs high; assume every input token is a cache write.
    const worstCase = costUsd({ ...NOTHING, cacheWrite: Math.ceil(characters / 3), output: MAX_TOKENS });
    const reservation = await ledger.reserve(MODEL, worstCase);
    if (signal.aborted) {
      await ledger.settle(reservation, NOTHING);
      return undefined;
    }

    try {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          tools: TOOLS,
          // A copy: the list grows after this request is made.
          messages: [...messages],
          output_config: { effort: "low" },
          cache_control: { type: "ephemeral" },
          // If a safety check declines a request, Anthropic's fallback model answers.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      await ledger.settle(reservation, tokensUsed(final.usage));
      return final;
    } catch (error) {
      if (signal.aborted) return undefined;
      const api = error instanceof Anthropic.APIError ? error : undefined;
      const rejected = Boolean(api?.status && api.status < 500);
      // A rejection's message names what is wrong (a field, the account's credit).
      // Other messages are left out, as they might quote what was sent.
      console.error(
        `Coach request failed: ${api?.status ?? "-"} ${api?.type ?? (error as Error).name}`,
        rejected ? api?.message.slice(0, 500) : "",
      );
      // A rejected request is not billed. Anything else stays at its worst case.
      if (rejected) await ledger.settle(reservation, NOTHING);
      throw explain(error);
    }
  }

  async function run(block: Anthropic.Beta.BetaToolUseBlock, tools?: CoachTools): Promise<ToolOutcome> {
    try {
      if (tools && block.name === "get_profile") return { content: await tools.readProfile() };
      if (tools && block.name === "propose_workout") return await tools.proposeWorkout(block.input);
      return { content: "That tool is not available.", is_error: true };
    } catch (error) {
      console.error(`Coach tool ${block.name} failed:`, (error as Error).name);
      return { content: "That did not work just now. Do not try again in this reply.", is_error: true };
    }
  }

  return async function* (history, signal, tools) {
    // Built once: nothing already sent may change between requests.
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `Today is ${localToday()}.` },
    ];
    const messages: Params[] = [...history];
    let wrote = false;

    for (let sent = 1; !signal.aborted; sent++) {
      let separator = wrote ? "\n\n" : "";
      const pieces = request(system, messages, signal);
      let next = await pieces.next();
      while (!next.done) {
        yield separator + next.value;
        separator = "";
        wrote = true;
        next = await pieces.next();
      }
      const final = next.value;
      if (!final) return;

      if (final.stop_reason === "refusal") {
        throw new CoachError("Claude declined to answer that. Try asking another way.");
      }
      if (final.stop_reason === "max_tokens") {
        throw new CoachError("The reply reached its length limit. Ask for the rest.", true);
      }
      if (final.stop_reason !== "tool_use") return;
      if (sent === MAX_REQUESTS) {
        throw new CoachError("The coach kept using its tools without answering. Try again.");
      }

      const content = echo(final.content);
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of content) {
        if (block.type !== "tool_use" || signal.aborted) continue;
        results.push({ type: "tool_result", tool_use_id: block.id, ...(await run(block, tools)) });
      }
      messages.push({ role: "assistant", content }, { role: "user", content: results });
    }
  };
}
