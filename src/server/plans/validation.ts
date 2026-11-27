// Run in tests too: relative imports only.
import { z } from "zod";
import { daysBetween, isDate } from "../../lib/dates";
import { BLOCK_FOCUS_KEYS, type Block } from "../../lib/plans";

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const day = (label: string) => z.string().refine(isDate, `${label}: pick a date.`);
const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label}: required.`).max(max, `${label}: at most ${max} characters.`);
const notes = z.preprocess(blank, z.string().trim().max(2000, "Notes: at most 2000 characters.").nullable().default(null));

export const planSchema = z
  .object({
    name: text("Name", 100),
    goalId: z.preprocess(blank, z.coerce.number().int().positive().nullable().default(null)),
    startOn: day("Start"),
    endOn: day("End"),
    notes,
  })
  .refine((plan) => plan.endOn >= plan.startOn, { message: "End: cannot be before the start." })
  .refine((plan) => daysBetween(plan.startOn, plan.endOn) <= 731, { message: "A plan can be at most two years long." });

export const blockSchema = z
  .object({
    name: text("Name", 100),
    focus: z.enum(BLOCK_FOCUS_KEYS, "Focus: pick one."),
    startOn: day("Start"),
    endOn: day("End"),
    weeklyMinutes: z.preprocess(
      blank,
      z.coerce
        .number("Weekly minutes: enter a whole number.")
        .int("Weekly minutes: enter a whole number.")
        .min(0)
        .max(3000, "Weekly minutes: at most 3000.")
        .nullable()
        .default(null),
    ),
    notes,
  })
  .refine((block) => block.endOn >= block.startOn, { message: "End: cannot be before the start." });

export type PlanInput = z.infer<typeof planSchema>;
export type BlockInput = z.infer<typeof blockSchema>;

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form.";
}

type Span = Pick<Block, "id" | "name" | "startOn" | "endOn">;

/** Why a block does not fit its plan, or undefined if it does. */
export function blockProblem(
  block: Pick<Block, "startOn" | "endOn">,
  plan: { startOn: string; endOn: string },
  others: Span[],
  selfId?: number,
): string | undefined {
  if (block.startOn < plan.startOn || block.endOn > plan.endOn) {
    return `The block must fall within the plan, ${plan.startOn} to ${plan.endOn}.`;
  }
  const clash = others.find((o) => o.id !== selfId && o.startOn <= block.endOn && block.startOn <= o.endOn);
  return clash && `It overlaps “${clash.name}” (${clash.startOn} to ${clash.endOn}).`;
}
