"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StatusChange } from "@/lib/workout";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { decide } from "./store";

const input = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  decision: z.enum(["approved", "declined"]),
});

export async function decideWorkout(
  id: number,
  decision: "approved" | "declined",
): Promise<{ changes?: StatusChange[]; error?: string }> {
  await requireSession();
  const parsed = input.safeParse({ id, decision });
  if (!parsed.success) return { error: "That workout no longer exists." };
  const changes = await decide(getDb(), parsed.data.id, parsed.data.decision);
  if (!changes) return { error: "That workout no longer exists." };
  revalidatePath("/workouts");
  return { changes };
}
