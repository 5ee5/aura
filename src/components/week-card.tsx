"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/dates";
import { estimateMinutes, type StatusChange, type WeekPlan, type Workout, WORKOUT_TYPES } from "@/lib/workout";
import { decideWeek, decideWorkout } from "@/server/workouts/actions";

const button = "h-9 cursor-pointer rounded-lg border border-line-strong px-3 text-sm disabled:opacity-60";
const primary = "h-9 cursor-pointer rounded-lg bg-accent px-3 text-sm font-medium text-background disabled:opacity-60";
const STATUS = { approved: "Approved", declined: "Declined", replaced: "Replaced", cancelled: "Cancelled", proposed: "" } as const;

interface Props {
  week: WeekPlan;
  onChanges: (changes: StatusChange[]) => void;
}

/** A proposed week: each workout approved or declined on its own, or all at once. */
export function WeekCard({ week, onChanges }: Props) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const workouts = week.days.flatMap((day) => day.workouts);
  const waiting = workouts.filter((w) => w.status === "proposed");
  const minutes = Math.round(workouts.filter((w) => w.status === "approved" || w.status === "proposed").reduce((n, w) => n + estimateMinutes(w.steps), 0));

  const run = (action: () => Promise<{ changes?: StatusChange[]; error?: string }>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ error: "Couldn’t save that. Try again.", changes: undefined }));
      setError(result.error ?? "");
      if (result.changes) onChanges(result.changes);
    });

  const row = (workout: Workout) => (
    <li key={workout.id} className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <Link href={`/workouts/${workout.id}`} className="underline-offset-4 hover:underline">
          {workout.title}
        </Link>
        <span className="block text-sm text-muted">
          {WORKOUT_TYPES[workout.type]}, about {Math.round(estimateMinutes(workout.steps))} min
        </span>
      </span>
      {workout.status === "proposed" ? (
        <span className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => run(() => decideWorkout(workout.id, "approved"))} className={primary} aria-label={`Approve ${workout.title}`}>
            Approve
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => decideWorkout(workout.id, "declined"))} className={button} aria-label={`Decline ${workout.title}`}>
            Decline
          </button>
        </span>
      ) : (
        <span className={`text-sm ${workout.status === "approved" ? "text-accent" : "text-muted"}`}>{STATUS[workout.status]}</span>
      )}
    </li>
  );

  return (
    <article aria-label={`Week from ${formatDate(week.weekStart, { day: "numeric", month: "long" })}`} className="mt-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">
        {week.mock ? "Mock week" : "Proposed week"}, about {minutes} min
      </p>
      <h3 className="mt-1 font-display text-xl">Week from {formatDate(week.weekStart, { weekday: "long", day: "numeric", month: "long" })}</h3>
      <p className="mt-1 text-muted">{week.summary}</p>
      <ol className="mt-3 divide-y divide-line">
        {week.days.map((day) => (
          <li key={day.date} className="py-2">
            <p className="text-sm font-medium">
              {formatDate(day.date, { weekday: "long", day: "numeric", month: "short" })}
              {day.note && <span className="font-normal text-muted">: {day.note}</span>}
            </p>
            {day.workouts.length ? <ul className="mt-1 flex flex-col gap-2">{day.workouts.map(row)}</ul> : <p className="text-sm text-muted">No workout</p>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {waiting.length > 1 && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => decideWeek(week.id, "approved"))} className={primary}>
              Approve all {waiting.length}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => decideWeek(week.id, "declined"))} className={button}>
              Decline all
            </button>
          </>
        )}
        {waiting.length === 0 && (
          <Link href={`/calendar?view=week&date=${week.weekStart}`} className="text-sm text-accent underline underline-offset-4">
            See it on the calendar
          </Link>
        )}
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </div>
    </article>
  );
}
