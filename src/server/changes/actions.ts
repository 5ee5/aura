"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localToday } from "@/lib/dates";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/profile/data";
import { limitsFrom } from "@/server/workouts/rules";
import { decideBlock } from "./blocks";
import { decideChanges } from "./changes";

const input = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  decision: z.enum(["approved", "declined"]),
});

export async function decideBlockProposal(id: number, decision: "approved" | "declined") {
  await requireSession();
  const parsed = input.safeParse({ id, decision });
  if (!parsed.success) return { error: "That block no longer exists." };
  const result = await decideBlock(getDb(), parsed.data.id, parsed.data.decision);
  revalidatePath("/", "layout");
  return result;
}

export async function decideChangeSet(id: number, decision: "approved" | "declined") {
  await requireSession();
  const parsed = input.safeParse({ id, decision });
  if (!parsed.success) return { error: "Those changes no longer exist." };
  const limits = limitsFrom(await getProfile());
  const result = await decideChanges(getDb(), parsed.data.id, parsed.data.decision, limits, localToday());
  revalidatePath("/", "layout");
  return result;
}
