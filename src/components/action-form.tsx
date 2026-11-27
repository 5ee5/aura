"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

export interface FormState {
  ok?: boolean;
  error?: string;
}

interface Props {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  /** Clear the fields after saving, for forms that add things. */
  resetOnSave?: boolean;
  /** Ask this before submitting. */
  confirm?: string;
  quiet?: boolean;
  children: React.ReactNode;
}

export function ActionForm({ action, submitLabel, resetOnSave, confirm, quiet, children }: Props) {
  const [state, dispatch, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSave) form.current?.reset();
  }, [state, resetOnSave]);

  return (
    <form
      ref={form}
      action={dispatch}
      // Submitting through onSubmit stops React clearing what was typed when a save fails.
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className="flex flex-col gap-3"
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={
            quiet
              ? "h-10 cursor-pointer text-sm text-danger underline underline-offset-4 disabled:opacity-60"
              : "h-10 cursor-pointer rounded-lg bg-accent px-4 font-medium text-background disabled:opacity-60"
          }
        >
          {pending ? "Working…" : submitLabel}
        </button>
        <p role="alert" className="text-sm text-danger">
          {!pending && state.error}
        </p>
        <p role="status" className="text-sm text-muted">
          {!pending && state.ok && "Saved"}
        </p>
      </div>
    </form>
  );
}
