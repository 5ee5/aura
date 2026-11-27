import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";
import { CoachError, type CoachReply } from "./types";
import { costUsd, type Ledger, type Tokens } from "./usage";

export const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;
const NOTHING: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

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

export function claudeReply(client: Anthropic, ledger: Ledger): CoachReply {
  return async function* (messages, signal) {
    const today = new Date().toISOString().slice(0, 10);
    const characters = SYSTEM_PROMPT.length + messages.reduce((n, m) => n + m.content.length, 0);
    // About three characters a token errs high; assume every input token is a cache write.
    const worstCase = costUsd({ ...NOTHING, cacheWrite: Math.ceil(characters / 3), output: MAX_TOKENS });
    const reservation = await ledger.reserve(MODEL, worstCase);
    if (signal.aborted) return ledger.settle(reservation, NOTHING);

    try {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "text", text: `Today is ${today}.` },
          ],
          messages,
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
      if (final.stop_reason === "refusal") {
        throw new CoachError("Claude declined to answer that. Try asking another way.");
      }
      if (final.stop_reason === "max_tokens") {
        throw new CoachError("The reply reached its length limit. Ask for the rest.", true);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof CoachError) throw error;
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
  };
}
