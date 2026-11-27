import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Input, Row, TextArea } from "@/components/form-fields";
import { formatDate, localToday } from "@/lib/dates";
import { BLOCK_FOCUSES } from "@/lib/plans";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { createPlan } from "@/server/plans/actions";
import { listPlans } from "@/server/plans/store";
import { getProfile } from "@/server/profile/data";
import { GoalSelect } from "./goal-select";

export const metadata: Metadata = { title: "Plans" };

const short = (date: string) => formatDate(date, { day: "numeric", month: "short", year: "numeric" });

export default async function PlansPage() {
  await requireSession();
  const [plans, profile] = await Promise.all([listPlans(getDb()), getProfile()]);
  const today = localToday();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl">Plans</h1>
          <Link href="/calendar" className="text-accent underline underline-offset-4">
            Calendar
          </Link>
        </div>
        <p className="mt-2 text-muted">A plan leads to a goal and is split into blocks, such as base, build and taper.</p>
      </div>

      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="sr-only">
          Your plans
        </h2>
        {plans.length === 0 && <p className="text-muted">No plans yet.</p>}
        <ul className="divide-y divide-line">
          {plans.map((plan) => {
            const now = plan.blocks.find((b) => b.startOn <= today && today <= b.endOn);
            return (
              <li key={plan.id} className="py-3">
                <Link href={`/plans/${plan.id}`} className="font-display text-xl underline-offset-4 hover:underline">
                  {plan.name}
                </Link>
                <p className="text-sm text-muted">
                  {short(plan.startOn)} to {short(plan.endOn)}, {plan.blocks.length}{" "}
                  {plan.blocks.length === 1 ? "block" : "blocks"}
                  {now && `, now in ${now.name} (${BLOCK_FOCUSES[now.focus].toLowerCase()})`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="new-plan-heading" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="new-plan-heading" className="mb-3 font-display text-2xl">
          New plan
        </h2>
        <ActionForm action={createPlan} submitLabel="Create plan">
          <Input label="Name" name="name" maxLength={100} required placeholder="Riga Marathon 2027" />
          <GoalSelect goals={profile?.goals ?? []} />
          <Row>
            <Input label="Start" name="startOn" type="date" required defaultValue={today} />
            <Input label="End" name="endOn" type="date" required />
          </Row>
          <TextArea label="Notes (optional)" name="notes" maxLength={2000} />
        </ActionForm>
      </section>
    </div>
  );
}
