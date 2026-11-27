// Takes the database as an argument so tests can use their own.
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { coachUsage } from "../db/schema";
import { CoachError } from "./types";

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Dollars per million tokens for Claude Sonnet 5.5.
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

export function costUsd(tokens: Tokens): number {
  const total =
    tokens.input * PRICE.input +
    tokens.output * PRICE.output +
    tokens.cacheRead * PRICE.cacheRead +
    tokens.cacheWrite * PRICE.cacheWrite;
  return total / 1_000_000;
}

export interface Ledger {
  /** Sets money aside before a request; throws CoachError if the day's limit is reached. */
  reserve(model: string, worstCaseUsd: number): Promise<number>;
  /** Replaces the reservation with what was used. */
  settle(id: number, tokens: Tokens): Promise<void>;
}

/**
 * A rolling 24-hour limit. A request that is never settled (stopped, or the app
 * restarted) stays counted at its worst case.
 */
export function databaseLedger(db: NodePgDatabase, dailyLimitUsd: number): Ledger {
  return {
    reserve(model, worstCaseUsd) {
      return db.transaction(async (tx) => {
        // Two requests at once must not both fit into the last of the budget.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('coach_usage'))`);
        const [row] = await tx
          .select({ spent: sql<string>`coalesce(sum(${coachUsage.costUsd}), 0)` })
          .from(coachUsage)
          .where(sql`${coachUsage.createdAt} > now() - interval '24 hours'`);
        if (Number(row?.spent) + worstCaseUsd > dailyLimitUsd) {
          throw new CoachError(`The daily limit of $${dailyLimitUsd} is reached. Try again later.`);
        }
        const [saved] = await tx
          .insert(coachUsage)
          .values({ model, costUsd: worstCaseUsd })
          .returning({ id: coachUsage.id });
        return saved!.id;
      });
    },
    async settle(id, tokens) {
      await db
        .update(coachUsage)
        .set({
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheReadTokens: tokens.cacheRead,
          cacheWriteTokens: tokens.cacheWrite,
          costUsd: costUsd(tokens),
        })
        .where(eq(coachUsage.id, id));
    },
  };
}
