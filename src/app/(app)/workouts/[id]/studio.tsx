"use client";

import { ArrowDown, ArrowUp, Plus, Repeat, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { STEP_KINDS, type StepKind, WORKOUT_TYPE_KEYS, WORKOUT_TYPES } from "@/lib/workout";
import { type Draft, type DraftStep, emptyStep } from "@/lib/workout-editor";
import { saveWorkout } from "@/server/workouts/studio";

const control = "w-full min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2";
const label = "flex min-w-0 flex-col gap-1 text-sm text-muted";
const KIND_LABELS: Record<StepKind, string> = {
  warmup: "Warm-up",
  run: "Run",
  recovery: "Recovery",
  cooldown: "Cool-down",
  repeat: "Repeat",
};
const iconButton =
  "flex size-10 cursor-pointer items-center justify-center rounded-lg border border-line-strong disabled:cursor-default disabled:opacity-40";

type Path = number[];

/** A copy of the list with the step at `path` changed by `change`. */
function edit(steps: DraftStep[], path: Path, change: (list: DraftStep[], index: number) => void): DraftStep[] {
  const [index, ...rest] = path;
  const copy = [...steps];
  if (!rest.length) change(copy, index!);
  else copy[index!] = { ...copy[index!]!, steps: edit(copy[index!]!.steps, rest, change) };
  return copy;
}

function Field(props: { name: string; value: string; onChange: (value: string) => void; hint?: string; inputMode?: "numeric" | "decimal" }) {
  return (
    <label className={`${label} flex-1 basis-28`}>
      {props.name}
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.hint}
        inputMode={props.inputMode}
        className={`${control} text-base text-foreground`}
      />
    </label>
  );
}

interface StepProps {
  step: DraftStep;
  path: Path;
  count: number;
  update: (path: Path, change: Partial<DraftStep>) => void;
  move: (path: Path, by: -1 | 1) => void;
  remove: (path: Path) => void;
  add: (path: Path) => void;
}

function StepEditor({ step, path, count, update, move, remove, add }: StepProps) {
  const index = path.at(-1)!;
  const name = `Step ${path.map((n) => n + 1).join(".")}`;
  const set = (field: keyof DraftStep) => (value: string) => update(path, { [field]: value });
  const kinds = path.length > 1 ? STEP_KINDS.filter((kind) => kind !== "repeat") : STEP_KINDS;

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <fieldset aria-label={name} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className={`${label} flex-1 basis-32`}>
            {name}
            <select
              value={step.kind}
              onChange={(event) => {
                const kind = event.target.value as StepKind;
                update(path, kind === "repeat" ? { ...emptyStep("repeat") } : { kind, repeatCount: "", steps: [] });
              }}
              className={`${control} text-base text-foreground`}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(path, -1)} className={iconButton}>
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button type="button" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => move(path, 1)} className={iconButton}>
              <ArrowDown aria-hidden className="size-4" />
            </button>
            <button type="button" aria-label={`Remove ${name}`} onClick={() => remove(path)} className={`${iconButton} text-danger`}>
              <Trash2 aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        {step.kind === "repeat" ? (
          <>
            <div className="flex flex-wrap gap-3">
              <Field name="Times" value={step.repeatCount} onChange={set("repeatCount")} inputMode="numeric" />
            </div>
            <ol className="flex flex-col gap-2 border-l-2 border-line pl-3">
              {step.steps.map((inner, n) => (
                <StepEditor key={n} step={inner} path={[...path, n]} count={step.steps.length} update={update} move={move} remove={remove} add={add} />
              ))}
            </ol>
            <button type="button" onClick={() => add(path)} className="flex h-10 cursor-pointer items-center gap-2 self-start text-sm text-accent">
              <Plus aria-hidden className="size-4" />
              Add a step to {name}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className={`${label} flex-1 basis-28`}>
                Measured by
                <select
                  value={step.measure}
                  onChange={(event) => update(path, { measure: event.target.value as DraftStep["measure"], amount: "" })}
                  className={`${control} text-base text-foreground`}
                >
                  <option value="time">Time</option>
                  <option value="distance">Distance</option>
                </select>
              </label>
              <Field
                name={step.measure === "time" ? "Minutes" : "Kilometres"}
                value={step.amount}
                onChange={set("amount")}
                hint={step.measure === "time" ? "10, or 1:30" : "0.4"}
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Field name="Fastest pace /km" value={step.paceFastest} onChange={set("paceFastest")} hint="4:30" />
              <Field name="Slowest pace /km" value={step.paceSlowest} onChange={set("paceSlowest")} hint="4:45" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Field name="Lowest HR" value={step.heartRateMin} onChange={set("heartRateMin")} inputMode="numeric" />
              <Field name="Highest HR" value={step.heartRateMax} onChange={set("heartRateMax")} inputMode="numeric" />
            </div>
            {/* In a row, so the field's flex basis is a width, not a height. */}
            <div className="flex flex-wrap gap-3">
              <Field name="Intensity" value={step.intensity} onChange={set("intensity")} hint="easy" />
              <Field name="Notes" value={step.instructions} onChange={set("instructions")} />
            </div>
          </>
        )}
      </fieldset>
    </li>
  );
}

export function Studio({ id, initial, proposed }: { id: number; initial: Draft; proposed: boolean }) {
  const [draft, setDraft] = useState(initial);
  const [waiting, setWaiting] = useState(proposed);
  const [message, setMessage] = useState<{ error?: string; saved?: string }>({});
  const [pending, startTransition] = useTransition();

  const setSteps = (steps: DraftStep[]) => {
    setMessage({});
    setDraft((d) => ({ ...d, steps }));
  };
  const update = (path: Path, change: Partial<DraftStep>) =>
    setSteps(edit(draft.steps, path, (list, i) => (list[i] = { ...list[i]!, ...change })));
  const move = (path: Path, by: -1 | 1) =>
    setSteps(edit(draft.steps, path, (list, i) => list.splice(i + by, 0, ...list.splice(i, 1))));
  const remove = (path: Path) => setSteps(edit(draft.steps, path, (list, i) => void list.splice(i, 1)));
  const add = (path: Path) =>
    setSteps(edit(draft.steps, path, (list, i) => (list[i] = { ...list[i]!, steps: [...list[i]!.steps, emptyStep("run")] })));
  const setField = (field: "title" | "date" | "description" | "type") => (value: string) => {
    setMessage({});
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const save = (approve: boolean) =>
    startTransition(async () => {
      const result = await saveWorkout(id, draft, approve).catch(() => ({
        error: "Couldn’t save. Check your connection and try again.",
        status: undefined,
      }));
      if (result.error) return setMessage({ error: result.error });
      if (result.status === "approved") setWaiting(false);
      setMessage({ saved: result.status === "approved" && approve ? "Saved and approved." : "Saved." });
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(false);
      }}
      className="mt-4 flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3">
        <label className={label}>
          Title
          <input value={draft.title} onChange={(e) => setField("title")(e.target.value)} maxLength={100} className={`${control} text-base text-foreground`} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className={`${label} flex-1 basis-40`}>
            Type
            <select value={draft.type} onChange={(e) => setField("type")(e.target.value)} className={`${control} text-base text-foreground`}>
              {WORKOUT_TYPE_KEYS.map((type) => (
                <option key={type} value={type}>
                  {WORKOUT_TYPES[type]}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} flex-1 basis-40`}>
            Date (optional)
            <input type="date" value={draft.date} onChange={(e) => setField("date")(e.target.value)} className={`${control} text-base text-foreground`} />
          </label>
        </div>
        <label className={label}>
          Description
          <textarea value={draft.description} onChange={(e) => setField("description")(e.target.value)} maxLength={1000} rows={2} className={`${control} text-base text-foreground`} />
        </label>
      </div>

      <section aria-labelledby="steps-heading" className="flex flex-col gap-2">
        <h2 id="steps-heading" className="font-display text-2xl">
          Steps
        </h2>
        <ol className="flex flex-col gap-2">
          {draft.steps.map((step, index) => (
            <StepEditor key={index} step={step} path={[index]} count={draft.steps.length} update={update} move={move} remove={remove} add={add} />
          ))}
        </ol>
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => setSteps([...draft.steps, emptyStep("run")])} className="flex h-10 cursor-pointer items-center gap-2 text-accent">
            <Plus aria-hidden className="size-4" />
            Add step
          </button>
          <button type="button" onClick={() => setSteps([...draft.steps, emptyStep("repeat")])} className="flex h-10 cursor-pointer items-center gap-2 text-accent">
            <Repeat aria-hidden className="size-4" />
            Add repeat
          </button>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-background px-4 py-3">
        <button type="submit" disabled={pending} className={`h-10 cursor-pointer rounded-lg px-4 font-medium disabled:opacity-60 ${waiting ? "border border-line-strong" : "bg-accent text-background"}`}>
          {pending ? "Saving…" : "Save"}
        </button>
        {waiting && (
          <button type="button" disabled={pending} onClick={() => save(true)} className="h-10 cursor-pointer rounded-lg bg-accent px-4 font-medium text-background disabled:opacity-60">
            Save and approve
          </button>
        )}
        <p role="alert" className="text-sm text-danger">
          {message.error}
        </p>
        <p role="status" className="text-sm text-muted">
          {message.saved}
          {message.saved && (
            <>
              {" "}
              <Link href="/workouts" className="underline underline-offset-4">
                See your workouts
              </Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
