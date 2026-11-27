"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/dates";
import { BLOCK_FOCUSES, type BlockProposal, type ChangeSet, describeChange } from "@/lib/plans";
import { decideBlockProposal, decideChangeSet } from "@/server/changes/actions";

const primary = "h-10 cursor-pointer rounded-lg bg-accent px-4 font-medium text-background disabled:opacity-60";
const secondary = "h-10 cursor-pointer rounded-lg border border-line-strong px-4 disabled:opacity-60";
const short = (date: string) => formatDate(date, { weekday: "short", day: "numeric", month: "short" });
type Status = "proposed" | "approved" | "declined";

function Decision(props: {
  status: Status;
  approved: React.ReactNode;
  decide: (decision: "approved" | "declined") => Promise<{ status?: Status; error?: string }>;
}) {
  const [status, setStatus] = useState(props.status);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const choose = (decision: "approved" | "declined") =>
    startTransition(async () => {
      const result = await props.decide(decision).catch(() => ({ error: "Couldn’t save that. Try again.", status: undefined }));
      setError(result.error ?? "");
      if (result.status) setStatus(result.status);
    });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {status === "proposed" ? (
        <>
          <button type="button" disabled={pending} onClick={() => choose("approved")} className={primary}>
            Approve
          </button>
          <button type="button" disabled={pending} onClick={() => choose("declined")} className={secondary}>
            Decline
          </button>
        </>
      ) : (
        <p role="status" className={status === "approved" ? "text-accent" : "text-muted"}>
          {status === "approved" ? props.approved : "Declined"}
        </p>
      )}
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    </div>
  );
}

export function BlockCard({ block }: { block: BlockProposal }) {
  return (
    <article aria-label={`Block: ${block.name}`} className="mt-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">
        {block.mock ? "Mock block" : "Proposed block"} for {block.planName}
      </p>
      <h3 className="mt-1 font-display text-xl">{block.name}</h3>
      <p className="text-muted">
        {BLOCK_FOCUSES[block.focus]}, {short(block.startOn)} to {short(block.endOn)}
        {block.weeklyMinutes !== null && `, about ${block.weeklyMinutes} min a week`}
      </p>
      {block.notes && <p className="mt-2 whitespace-pre-wrap">{block.notes}</p>}
      <Decision
        status={block.status}
        decide={(decision) => decideBlockProposal(block.id, decision)}
        approved={
          <>
            Added to the plan.{" "}
            <Link href={`/plans/${block.planId}`} className="underline underline-offset-4">
              See the plan
            </Link>
          </>
        }
      />
    </article>
  );
}

export function ChangesCard({ set }: { set: ChangeSet }) {
  return (
    <article aria-label="Proposed changes" className="mt-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">{set.mock ? "Mock changes" : "Proposed changes"} to your calendar</p>
      <p className="mt-1">{set.summary}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        {set.changes.map((change) => (
          <li key={change.workoutId}>
            {describeChange({
              ...change,
              from: change.from && short(change.from),
              to: change.to && short(change.to),
            })}
          </li>
        ))}
      </ul>
      <Decision
        status={set.status}
        decide={(decision) => decideChangeSet(set.id, decision)}
        approved={
          <>
            Done.{" "}
            <Link href="/calendar" className="underline underline-offset-4">
              See the calendar
            </Link>
          </>
        }
      />
    </article>
  );
}
