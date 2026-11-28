import "server-only";
import { z } from "zod";
import { addDays, daysBetween, isDate, isoWeekday, localToday, startOfWeek } from "@/lib/dates";
import { recoverySummary } from "@/lib/recovery";
import { otherTotals, runTotals, type Run } from "@/lib/runs";
import { wellnessBetween } from "@/server/garmin/wellness-store";
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

/** A run as the coach reads it: no names, ids or places. */
const ran = (run: Run) => ({
  kind: run.type === "running" ? undefined : run.type,
  km: run.distanceMetres ? Math.round(run.distanceMetres / 100) / 10 : undefined,
  minutes: Math.round(run.durationSeconds / 60),
  avgHeartRate: run.averageHeartRate ?? undefined,
  trainingLoad: run.trainingLoad === null ? undefined : Math.round(run.trainingLoad),
});

/** The calendar as the coach reads it. */
export async function describeSchedule(input: unknown): Promise<ToolOutcome> {
  const parsed = range.safeParse(input);
  if (!parsed.success) return { content: "Give from and to as YYYY-MM-DD, at most 56 days apart.", is_error: true };
  // Whole weeks, so the totals mean something.
  const from = startOfWeek(parsed.data.from);
  const to = addDays(startOfWeek(parsed.data.to), 6);
  const today = localToday();
  const [{ days, blocks }, profile, plans, wellness] = await Promise.all([
    calendarDays(from, to),
    getProfile(),
    listPlans(getDb()),
    // 28 days before the range too, for the averages.
    wellnessBetween(getDb(), addDays(from < today ? from : today, -28), today),
  ]);
  const wellnessOn = new Map(wellness.map((w) => [w.on, w]));
  const summary = recoverySummary(wellness, today);
  const available = new Map(profile?.week.map((d) => [d.weekday, d.maxMinutes]) ?? []);

  const weeks = [];
  for (let monday = from; monday <= to; monday = addDays(monday, 7)) {
    const week = days.filter((d) => d.date >= monday && d.date <= addDays(monday, 6));
    const workouts = week.flatMap((d) => d.workouts);
    const runs = [...week.flatMap((d) => d.workouts.flatMap((w) => (w.run ? [w.run] : []))), ...week.flatMap((d) => d.extraRuns)];
    const totals = runTotals(runs);
    weeks.push({
      weekOf: monday,
      plannedMinutes: Math.round(workouts.filter((w) => w.outcome !== "skipped").reduce((n, w) => n + w.minutes, 0)),
      hardSessions: workouts.filter((w) => w.hard && w.outcome !== "skipped").length,
      ran: totals.runs
        ? { runs: totals.runs, km: totals.km, minutes: totals.minutes, trainingLoad: totals.runsWithLoad ? totals.load : undefined }
        : undefined,
      otherSports: (() => {
        const sports = otherTotals(week.flatMap((d) => d.others));
        return sports.length ? sports.map((s) => ({ kind: s.type, sessions: s.sessions, minutes: s.minutes })) : undefined;
      })(),
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
          outcomeFrom: w.outcome ? (w.marked ? "athlete" : "garmin run") : undefined,
          ran: w.run ? ran(w.run) : undefined,
        })),
        unplannedRuns: d.extraRuns.length ? d.extraRuns.map(ran) : undefined,
        otherActivities: d.others.length ? d.others.map((a) => ({ ...ran(a), kind: a.type })) : undefined,
        recovery: (() => {
          const w = wellnessOn.get(d.date);
          if (!w) return undefined;
          return {
            sleepHours: w.sleepSeconds === null ? undefined : Math.round(w.sleepSeconds / 360) / 10,
            sleepScore: w.sleepScore ?? undefined,
            hrvMs: w.hrvLastNight ?? undefined,
            hrvStatus: w.hrvStatus ?? undefined,
            restingHeartRate: d.date === today ? undefined : (w.restingHeartRate ?? undefined),
            bodyBatteryHigh: d.date === today ? undefined : (w.bodyBatteryHigh ?? undefined),
          };
        })(),
      })),
    });
  }
  return {
    content: JSON.stringify({
      today,
      recoveryAverages: wellness.length
        ? {
            note:
              "Garmin watch estimates. Each night belongs to the morning it ended; today's daytime numbers are " +
              "left out because the day is not over. Averages skip days without a reading; null means too few days.",
            sleepHours7: summary.sleepHours7.value,
            sleepHours28: summary.sleepHours28.value,
            hrvMs7: summary.hrv7.value,
            hrvMs28: summary.hrv28.value,
            hrvUsualRange:
              summary.lastNight?.hrvBalancedLow != null
                ? `${summary.lastNight.hrvBalancedLow}-${summary.lastNight.hrvBalancedHigh}`
                : undefined,
            restingHeartRate7: summary.restingHeartRate7.value,
            restingHeartRate28: summary.restingHeartRate28.value,
          }
        : undefined,
      note:
        "Only approved workouts are listed; their minutes are estimates. An outcome comes from the athlete's " +
        "mark, or is done because Garmin recorded a run that day (ran). unplannedRuns and ran totals are what " +
        "the watch recorded, as of the last sync. kind is left out for ordinary outdoor runs. otherActivities " +
        "and otherSports are other sports (rides, walks, strength and so on): count them as training stress, " +
        "never as running. trainingLoad is Garmin's and missing on older activities.",
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
