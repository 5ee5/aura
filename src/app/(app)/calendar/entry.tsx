"use client";

import { CalendarClock, Check, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { WorkoutType } from "@/lib/workout";
import { WORKOUT_TYPES } from "@/lib/workout";
import { markWorkout, moveWorkout } from "@/server/calendar/actions";

export interface EntryWorkout {
  id: number;
  title: string;
  type: WorkoutType;
  scheduledOn: string | null;
  outcome: "done" | "skipped" | null;
  minutes: number;
  hard: boolean;
}

const small = "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm disabled:opacity-60";

/** One workout on the calendar, with moving and done/skipped. */
export function CalendarEntry({ workout, today }: { workout: EntryWorkout; today: string }) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(workout.scheduledOn ?? today);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ error: "Couldn’t save that. Try again." }));
      setError(result.error ?? "");
      if (!result.error) setMoving(false);
    });
  const markable = workout.scheduledOn !== null && workout.scheduledOn <= today;

  return (
    <li
      aria-label={workout.title}
      className={`rounded-lg border bg-surface p-3 ${workout.outcome === "skipped" ? "border-line opacity-70" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/workouts/${workout.id}`} className="break-words underline-offset-4 hover:underline">
            {workout.title}
          </Link>
          <p className="text-sm text-muted">
            {WORKOUT_TYPES[workout.type]}, about {Math.round(workout.minutes)} min{workout.hard && ", hard"}
          </p>
        </div>
        {workout.outcome && (
          <p className={`shrink-0 text-sm ${workout.outcome === "done" ? "text-accent" : "text-muted"}`}>
            {workout.outcome === "done" ? "Done" : "Skipped"}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {markable && workout.outcome !== "done" && (
          <button type="button" disabled={pending} onClick={() => run(() => markWorkout(workout.id, "done"))} className={small}>
            <Check aria-hidden className="size-4" />
            Done
          </button>
        )}
        {markable && workout.outcome !== "skipped" && (
          <button type="button" disabled={pending} onClick={() => run(() => markWorkout(workout.id, "skipped"))} className={small}>
            <X aria-hidden className="size-4" />
            Skipped
          </button>
        )}
        {markable && workout.outcome && (
          <button type="button" disabled={pending} onClick={() => run(() => markWorkout(workout.id, null))} className={small}>
            Clear mark
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => setMoving((open) => !open)} aria-expanded={moving} className={small}>
          <CalendarClock aria-hidden className="size-4" />
          {workout.scheduledOn ? "Move" : "Schedule"}
        </button>
      </div>
      {moving && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            New date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-line-strong bg-background px-3 py-2 text-base text-foreground"
            />
          </label>
          <button type="button" disabled={pending || !date} onClick={() => run(() => moveWorkout(workout.id, date))} className={small}>
            Save date
          </button>
          {workout.scheduledOn && (
            <button type="button" disabled={pending} onClick={() => run(() => moveWorkout(workout.id, null))} className={small}>
              Unschedule
            </button>
          )}
        </div>
      )}
      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>
    </li>
  );
}
