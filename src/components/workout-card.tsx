"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { describeStep, type StatusChange, type Step, type Workout, WORKOUT_TYPES } from "@/lib/workout";
import { decideWorkout } from "@/server/workouts/actions";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, index) => (
        <li key={index}>
          {describeStep(step)}
          {step.instructions && <span className="block text-sm text-muted">{step.instructions}</span>}
          {step.steps.length > 0 && (
            <div className="mt-1 border-l-2 border-line pl-3">
              <Steps steps={step.steps} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

const STATUS_TEXT = {
  proposed: "Waiting for your decision",
  approved: "Approved",
  declined: "Declined",
  replaced: "Replaced by a newer version",
} as const;

/** A workout, with Approve and Decline while it is still a proposal. */
interface Props {
  workout: Workout;
  inList?: boolean;
  /** Told about every card the decision changed, this one included. */
  onChanges?: (changes: StatusChange[]) => void;
}

export function WorkoutCard({ workout, inList = false, onChanges }: Props) {
  const [status, setStatus] = useState(workout.status);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const choose = (decision: "approved" | "declined") =>
    startTransition(async () => {
      const result = await decideWorkout(workout.id, decision).catch(() => ({
        error: "Couldn’t save that. Try again.",
        changes: undefined,
      }));
      setError(result.error ?? "");
      const own = result.changes?.find((change) => change.id === workout.id);
      if (own) setStatus(own.status);
      if (result.changes) onChanges?.(result.changes);
    });

  return (
    <article
      aria-label={`Workout: ${workout.title}`}
      className="mt-3 rounded-lg border border-line bg-surface p-4"
    >
      <p className="text-sm text-muted">
        {workout.mock ? "Mock workout" : WORKOUT_TYPES[workout.type]}
        {", "}
        {workout.scheduledOn ? day.format(new Date(`${workout.scheduledOn}T00:00:00Z`)) : "any day"}
      </p>
      <h3 className="mt-1 font-display text-xl">{workout.title}</h3>
      {workout.replacesId !== null && <p className="text-sm text-muted">A revised version</p>}
      <p className="mt-1 text-muted">{workout.description}</p>
      <div className="mt-3">
        <Steps steps={workout.steps} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {(status === "proposed" || status === "approved") && (
          <Link
            href={`/workouts/${workout.id}`}
            aria-label={`Edit ${workout.title}`}
            className="flex h-10 items-center rounded-lg border border-line-strong px-4"
          >
            Edit
          </Link>
        )}
        {status === "proposed" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose("approved")}
              className="h-10 cursor-pointer rounded-lg bg-accent px-4 font-medium text-background disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose("declined")}
              className="h-10 cursor-pointer rounded-lg border border-line-strong px-4 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        ) : (
          <p role="status" className={status === "approved" ? "text-accent" : "text-muted"}>
            {STATUS_TEXT[status]}
            {status === "approved" && !inList && (
              <>
                {". "}
                <Link href="/workouts" className="underline underline-offset-4">
                  See your workouts
                </Link>
              </>
            )}
          </p>
        )}
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </div>
    </article>
  );
}
