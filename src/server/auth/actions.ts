"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getEnv } from "@/server/env";
import { requireSession } from "./dal";
import { verifyPassword } from "./password";
import { createRateLimiter } from "./rate-limit";
import { createSessionToken, SESSION_COOKIE, SESSION_SECONDS } from "./session";

const limiter = createRateLimiter({ perKey: 5, total: 50, windowMs: 15 * 60 * 1000 });
const passwordSchema = z.string().min(1).max(1024);

export interface LoginState {
  error?: string;
}

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  // Set by Cloudflare. The app listens on localhost, so outsiders cannot bypass it.
  const client = (await headers()).get("cf-connecting-ip") ?? "local";
  if (!limiter.attempt(client)) {
    console.warn(`Login refused, too many attempts (client ${JSON.stringify(client)})`);
    return { error: "Too many attempts. Try again in 15 minutes." };
  }

  const env = getEnv();
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success || !(await verifyPassword(password.data, env.AUTH_PASSWORD_HASH))) {
    console.warn(`Login failed (client ${JSON.stringify(client)})`);
    return { error: "Incorrect password." };
  }

  limiter.clear(client);
  const keys = { secret: env.SESSION_SECRET, passwordHash: env.AUTH_PASSWORD_HASH };
  (await cookies()).set(SESSION_COOKIE, createSessionToken(keys), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https:"),
    maxAge: SESSION_SECONDS,
    path: "/",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  await requireSession();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
