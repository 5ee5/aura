"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { forgetGoogleAccount, googleClient, refreshTokenFor } from "./account";
import { revoke } from "./oauth";

/** Revokes Aura's access at Google, then forgets the token whatever Google said. */
export async function disconnectGoogle(): Promise<FormState> {
  await requireSession();
  const client = googleClient();
  const token = client ? await refreshTokenFor(client) : undefined;
  const revoked = token ? await revoke(token) : false;
  await forgetGoogleAccount();
  revalidatePath("/", "layout");
  return revoked
    ? { ok: true, message: "Disconnected, and access removed at Google." }
    : { ok: true, message: "Disconnected. Also remove Aura under Third-party access in your Google account." };
}
