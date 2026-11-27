"use client";

export default function AppError() {
  return (
    <div className="max-w-prose">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="mt-3 text-muted">This page couldn’t be loaded or saved. Nothing else is affected.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 h-10 cursor-pointer rounded-lg border border-line-strong px-4"
      >
        Try again
      </button>
    </div>
  );
}
