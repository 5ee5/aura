"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import * as store from "./store";
import { blockProblem, blockSchema, firstError, planSchema } from "./validation";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);
const GONE = { error: "That plan no longer exists. Reload the page." };
const fields = (form: FormData) => Object.fromEntries(form);

function saved(): FormState {
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createPlan(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const plan = planSchema.safeParse(fields(form));
  if (!plan.success) return { error: firstError(plan.error) };
  const id = await store.createPlan(getDb(), plan.data);
  revalidatePath("/", "layout");
  redirect(`/plans/${id}`);
}

export async function updatePlan(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const id = idSchema.safeParse(form.get("id"));
  const plan = planSchema.safeParse(fields(form));
  if (!id.success) return GONE;
  if (!plan.success) return { error: firstError(plan.error) };
  const db = getDb();
  const current = await store.getPlan(db, id.data);
  if (!current) return GONE;
  const outside = current.blocks.find((b) => b.startOn < plan.data.startOn || b.endOn > plan.data.endOn);
  if (outside) return { error: `“${outside.name}” would fall outside the plan. Change or delete it first.` };
  await store.updatePlan(db, id.data, plan.data);
  return saved();
}

export async function deletePlan(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const id = idSchema.safeParse(form.get("id"));
  if (!id.success) return GONE;
  await store.deletePlan(getDb(), id.data);
  revalidatePath("/", "layout");
  redirect("/plans");
}

export async function saveBlock(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const planId = idSchema.safeParse(form.get("planId"));
  const blockId = form.has("id") ? idSchema.safeParse(form.get("id")) : undefined;
  if (!planId.success || (blockId && !blockId.success)) return GONE;
  const block = blockSchema.safeParse(fields(form));
  if (!block.success) return { error: firstError(block.error) };
  const db = getDb();
  const plan = await store.getPlan(db, planId.data);
  if (!plan) return GONE;
  const problem = blockProblem(block.data, plan, plan.blocks, blockId?.data);
  if (problem) return { error: problem };
  await store.saveBlock(db, planId.data, block.data, blockId?.data);
  return saved();
}

export async function deleteBlock(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const planId = idSchema.safeParse(form.get("planId"));
  const id = idSchema.safeParse(form.get("id"));
  if (!planId.success || !id.success) return GONE;
  await store.deleteBlock(getDb(), planId.data, id.data);
  return saved();
}
