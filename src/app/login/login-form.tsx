"use client";

import { useActionState } from "react";
import { login } from "@/server/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-sm">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className="rounded-md border px-3 py-2"
      />
      <p role="alert" className="min-h-5 text-sm text-red-500">
        {state.error}
      </p>
      <button type="submit" disabled={pending} className="rounded-md border px-3 py-2 font-medium">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
