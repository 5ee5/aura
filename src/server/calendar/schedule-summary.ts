import "server-only";
import { z } from "zod";
import { addDays, daysBetween, isDate, isoWeekday, localToday, startOfWeek } from "@/lib/dates";
import { WORKOUT_TYPES } from "@/lib/workout";
import { getProfile } from "@/server/profile/data";
export { GET_SCHEDULE_TOOL } from "./schedule-tool";
import type { ToolOutcome } from "@/server/coach/types";
import { getDb } from "@/server/db/client";
import { listPlans } from "@/server/plans/store";
import { calendarDays } from "./data";

const range = z
  .object({ from: z.string().refine(isDate), to: z.string().refine(isDate) })
  .refine((r) => r.to >= r.from && daysBetween(r.from, r.to) <= 56);

const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The calendar as the coach reads it. */
export async function describeSchedule(input: unknown): Promise<ToolOutcome> {
  const parsed = range.safeParse(input);
  if (!parsed.success) return { content: "Give from and to as YYYY-MM-DD, at most 56 days apart.", is_error: true };
  // Whole weeks, so the totals mean something.
  const from = startOfWeek(parsed.data.from);
  const to = addDays(startOfWeek(parsed.data.to), 6);
  const [{ days, blocks }, profile, plans] = await Promise.all([calendarDays(from, to), getProfile(), listPlans(getDb())]);
  const available = new Map(profile?.week.map((d) => [d.weekday, d.maxMinutes]) ?? []);

  const weeks = [];
  for (let monday = from; monday <= to; monday = addDays(monday, 7)) {
    const week = days.filter((d) => d.date >= monday && d.date <= addDays(monday, 6));
    const workouts = week.flatMap((d) => d.workouts);
    weeks.push({
      weekOf: monday,
      plannedMinutes: Math.round(workouts.filter((w) => w.outcome !== "skipped").reduce((n, w) => n + w.minutes, 0)),
      hardSessions: workouts.filter((w) => w.hard && w.outcome !== "skipped").length,
      days: week.map((d) => ({
        date: d.date,
        day: DAY[isoWeekday(d.date)],
        maxMinutes: available.get(isoWeekday(d.date)),
        rest: d.rest || undefined,
        races: d.races.length ? d.races : undefined,
        workouts: d.workouts.map((w) => ({
          id: w.id,
          title: w.title,
          type: WORKOUT_TYPES[w.type],
          minutes: Math.round(w.minutes),
          hard: w.hard || undefined,
          outcome: w.outcome ?? undefined,
        })),
      })),
    });
  }
  return {
    content: JSON.stringify({
      today: localToday(),
      note: "Only approved workouts are listed. Minutes are estimates. Outcomes were marked by the athlete.",
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        from: p.startOn,
        to: p.endOn,
        blocks: p.blocks.map((b) => ({ name: b.name, focus: b.focus, from: b.startOn, to: b.endOn })),
      })),
      blocks: blocks.map((b) => ({
        name: b.name,
        plan: b.planName,
        focus: b.focus,
        from: b.startOn,
        to: b.endOn,
        weeklyMinutesTarget: b.weeklyMinutes ?? undefined,
      })),
      weeks,
    }),
  };
}
