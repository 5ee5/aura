"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { deleteConversation } from "./conversations";

export async function removeConversation(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const id = z.coerce.number().int().positive().safeParse(form.get("id"));
  if (!id.success) return { error: "That chat no longer exists." };
  await deleteConversation(getDb(), id.data);
  revalidatePath("/chats");
  return { ok: true };
}
