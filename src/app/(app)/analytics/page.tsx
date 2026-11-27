import type { Metadata } from "next";
import Link from "next/link";
import { addDays, formatDate, localToday, startOfWeek } from "@/lib/dates";
import { requireSession } from "@/server/auth/dal";
import { consistency, weeklySummary } from "@/server/analytics/summary";
import { getDb } from "@/server/db/client";
import { approvedBetween } from "@/server/workouts/store";

export const metadata: Metadata = { title: "Analytics" };

const WEEKS = 8;
const percent = (share: number | null) => (share === null ? "–" : `${Math.round(share * 100)}%`);

/** Done time against planned time, as a bar inside its cell; the numbers stay in the text. */
function DoneBar({ done, planned }: { done: number; planned: number }) {
  const share = planned ? Math.min(1, done / planned) : 0;
  return (
    <span aria-hidden className="mt-1 block h-1.5 w-full rounded-full bg-line">
      <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
    </span>
  );
}

export default async function AnalyticsPage() {
  await requireSession();
  const today = localToday();
  const thisWeek = startOfWeek(today);
  const mondays = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, (i - WEEKS + 1) * 7));
  const workouts = await approvedBetween(getDb(), mondays[0]!, addDays(thisWeek, 6));
  const weeks = weeklySummary(workouts, mondays, today);
  const recent = weeks.slice(-4);
  const doneRecent = recent.reduce((n, w) => n + w.doneMinutes, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Analytics</h1>
        <Link href="/calendar" className="text-accent underline underline-offset-4">
          Calendar
        </Link>
      </div>
      <p className="mt-2 text-muted">
        From the workouts you approved and marked done or skipped. Minutes are estimates from each
        workout’s steps. Pace, heart rate and training load need Garmin data, which isn’t connected yet.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Done, last 4 weeks</dt>
          <dd className="mt-1 font-display text-4xl">{percent(consistency(recent))}</dd>
          <dd className="text-sm text-muted">of workouts whose day has come</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Time done, last 4 weeks</dt>
          <dd className="mt-1 font-display text-4xl">
            {Math.floor(doneRecent / 60)}h {String(doneRecent % 60).padStart(2, "0")}
          </dd>
          <dd className="text-sm text-muted">estimated</dd>
        </div>
      </dl>

      <table className="mt-6 w-full border-collapse text-sm">
        <caption className="mb-2 text-left font-display text-xl">Week by week</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="py-2 pr-2 font-normal">Week of</th>
            <th scope="col" className="py-2 pr-2 font-normal">Done / planned</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Done</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Skipped</th>
            <th scope="col" className="py-2 text-right font-normal">Hard</th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].reverse().map((week) => (
            <tr key={week.weekOf} className="border-b border-line">
              <th scope="row" className="py-2 pr-2 text-left font-normal">
                <Link href={`/calendar?view=week&date=${week.weekOf}`} className="underline-offset-4 hover:underline">
                  {formatDate(week.weekOf, { day: "numeric", month: "short" })}
                </Link>
                {week.weekOf === thisWeek && <span className="block text-muted">this week</span>}
              </th>
              <td className="py-2 pr-2">
                {week.doneMinutes} / {week.plannedMinutes} min
                <DoneBar done={week.doneMinutes} planned={week.plannedMinutes} />
              </td>
              <td className="py-2 pr-2 text-right">{week.done}</td>
              <td className="py-2 pr-2 text-right">
                {week.skipped}
                {week.unmarked > 0 && <span className="block text-muted">{week.unmarked} not marked</span>}
              </td>
              <td className="py-2 text-right">{percent(week.hardShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">Hard: the share of planned time in tempo, threshold, VO2max, hill and race-specific sessions.</p>
    </div>
  );
}
