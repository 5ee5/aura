import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Input, Row, TextArea } from "@/components/form-fields";
import { addDays, daysBetween, formatDate } from "@/lib/dates";
import { BLOCK_FOCUS_KEYS, BLOCK_FOCUSES, type Block, type Plan } from "@/lib/plans";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { deleteBlock, deletePlan, saveBlock, updatePlan } from "@/server/plans/actions";
import { getPlan } from "@/server/plans/store";
import { getProfile } from "@/server/profile/data";
import { GoalSelect } from "../goal-select";

export const metadata: Metadata = { title: "Plan" };

const short = (date: string) => formatDate(date, { day: "numeric", month: "short", year: "numeric" });
const weeks = (block: Pick<Block, "startOn" | "endOn">) => Math.ceil((daysBetween(block.startOn, block.endOn) + 1) / 7);
const control = "w-full min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2 text-base text-foreground";

function BlockFields({ plan, block }: { plan: Plan; block?: Block }) {
  const last = plan.blocks.at(-1);
  const start = block?.startOn ?? (last ? addDays(last.endOn, 1) : plan.startOn);
  return (
    <>
      <input type="hidden" name="planId" value={plan.id} />
      <Row>
        <Input label="Name" name="name" defaultValue={block?.name} maxLength={100} required placeholder="Base 1" />
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          Focus
          <select name="focus" defaultValue={block?.focus ?? "base"} className={control}>
            {BLOCK_FOCUS_KEYS.map((focus) => (
              <option key={focus} value={focus}>
                {BLOCK_FOCUSES[focus]}
              </option>
            ))}
          </select>
        </label>
      </Row>
      <Row>
        <Input label="Start" name="startOn" type="date" defaultValue={start} required />
        <Input label="End" name="endOn" type="date" defaultValue={block?.endOn ?? ""} required />
        <Input label="Weekly minutes (optional)" name="weeklyMinutes" inputMode="numeric" defaultValue={block?.weeklyMinutes ?? ""} />
      </Row>
      <TextArea label="Notes (optional)" name="notes" defaultValue={block?.notes ?? ""} maxLength={2000} />
    </>
  );
}

export default async function PlanPage({ params }: PageProps<"/plans/[id]">) {
  await requireSession();
  const { id } = await params;
  const plan = /^[1-9]\d{0,8}$/.test(id) ? await getPlan(getDb(), Number(id)) : undefined;
  if (!plan) notFound();
  const profile = await getProfile();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/plans" className="text-sm text-muted underline underline-offset-4">
          All plans
        </Link>
        <h1 className="mt-2 font-display text-3xl break-words">{plan.name}</h1>
        <p className="text-muted">
          {short(plan.startOn)} to {short(plan.endOn)}, {weeks(plan)} weeks
        </p>
      </div>

      <section aria-labelledby="blocks-heading">
        <h2 id="blocks-heading" className="font-display text-2xl">
          Blocks
        </h2>
        {plan.blocks.length === 0 && <p className="mt-2 text-muted">No blocks yet. Add one below, or ask the coach.</p>}
        <ol className="mt-2 divide-y divide-line">
          {plan.blocks.map((block) => (
            <li key={block.id}>
              <details>
                <summary className="cursor-pointer py-3 break-words">
                  {block.name}
                  <span className="block text-sm text-muted">
                    {BLOCK_FOCUSES[block.focus]}, {short(block.startOn)} to {short(block.endOn)}, {weeks(block)} weeks
                    {block.weeklyMinutes !== null && `, about ${block.weeklyMinutes} min a week`}
                  </span>
                </summary>
                <div className="flex flex-col gap-2 pb-4">
                  <ActionForm action={saveBlock} submitLabel="Save block">
                    <input type="hidden" name="id" value={block.id} />
                    <BlockFields plan={plan} block={block} />
                  </ActionForm>
                  <ActionForm action={deleteBlock} submitLabel="Delete block" confirm="Delete this block?" quiet>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="id" value={block.id} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ol>
        <details className="mt-2 rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3">Add block</summary>
          <div className="px-4 pb-4">
            <ActionForm action={saveBlock} submitLabel="Add block" resetOnSave>
              <BlockFields plan={plan} />
            </ActionForm>
          </div>
        </details>
      </section>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading" className="mb-3 font-display text-2xl">
          Plan details
        </h2>
        <ActionForm action={updatePlan} submitLabel="Save plan">
          <input type="hidden" name="id" value={plan.id} />
          <Input label="Name" name="name" defaultValue={plan.name} maxLength={100} required />
          <GoalSelect goals={profile?.goals ?? []} value={plan.goalId} />
          <Row>
            <Input label="Start" name="startOn" type="date" defaultValue={plan.startOn} required />
            <Input label="End" name="endOn" type="date" defaultValue={plan.endOn} required />
          </Row>
          <TextArea label="Notes (optional)" name="notes" defaultValue={plan.notes ?? ""} maxLength={2000} />
        </ActionForm>
        <div className="mt-6">
          <ActionForm action={deletePlan} submitLabel="Delete plan" confirm="Delete this plan and its blocks? Workouts stay." quiet>
            <input type="hidden" name="id" value={plan.id} />
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
