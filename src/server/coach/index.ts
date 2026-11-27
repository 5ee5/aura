import "server-only";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { getProfile } from "@/server/profile/data";
import { claudeReply, createClaudeClient } from "./claude";
import { mockReply } from "./mock";
import { describeProfile } from "./profile-summary";
import type { CoachReply } from "./types";
import { databaseLedger } from "./usage";

/** Claude when there is a key; otherwise the labelled mock. */
export function getCoach(): { mock: boolean; reply: CoachReply } {
  const env = getEnv();
  if (env.COACH_MOCK === "1" || !env.ANTHROPIC_API_KEY) return { mock: true, reply: mockReply };
  const ledger = databaseLedger(getDb(), env.COACH_DAILY_BUDGET_USD);
  const readProfile = async () => describeProfile(await getProfile());
  const client = createClaudeClient(env.ANTHROPIC_API_KEY);
  return { mock: false, reply: claudeReply(client, ledger, readProfile) };
}
