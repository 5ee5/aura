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
        className="rounded-md border border-line-strong bg-background px-3 py-2"
      />
      <p role="alert" className="min-h-5 text-sm text-danger">
        {state.error}
      </p>
      <button type="submit" disabled={pending} className="cursor-pointer rounded-md bg-accent px-3 py-2 font-medium text-background disabled:cursor-default disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
