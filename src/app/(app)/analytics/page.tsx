import type { Metadata } from "next";
import Link from "next/link";
import { addDays, formatDate, localToday, startOfWeek } from "@/lib/dates";
import { requireSession } from "@/server/auth/dal";
import { consistency, weeklySummary } from "@/server/analytics/summary";
import { activityLabel } from "@/lib/runs";
import { plannedAndRun } from "@/server/calendar/data";

export const metadata: Metadata = { title: "Analytics" };

const WEEKS = 8;
const percent = (share: number | null) => (share === null ? "–" : `${Math.round(share * 100)}%`);
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;

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
  const { workouts, runs, others, matches } = await plannedAndRun(mondays[0]!, addDays(thisWeek, 6));
  const weeks = weeklySummary(workouts, mondays, today, matches, runs, others);
  const recent = weeks.slice(-4);
  const ranKm = Math.round(recent.reduce((n, w) => n + w.ran.km, 0) * 10) / 10;
  const ranRuns = recent.reduce((n, w) => n + w.ran.runs, 0);
  const ranMinutes = recent.reduce((n, w) => n + w.ran.minutes, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Analytics</h1>
        <Link href="/calendar" className="text-accent underline underline-offset-4">
          Calendar
        </Link>
      </div>
      <p className="mt-2 text-muted">
        Done and planned come from the workouts you approved: done when you marked it, or when Garmin
        recorded a run that day. Planned minutes are estimates from each workout’s steps. Ran is what
        Garmin recorded, planned or not, as of the last sync; Other is every other sport.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Done, last 4 weeks</dt>
          <dd className="mt-1 font-display text-4xl">{percent(consistency(recent))}</dd>
          <dd className="text-sm text-muted">of workouts whose day has come</dd>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Ran, last 4 weeks</dt>
          <dd className="mt-1 font-display text-4xl">{ranKm} km</dd>
          <dd className="text-sm text-muted">
            {ranRuns} runs, {hours(ranMinutes)}
          </dd>
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
            <th scope="col" className="py-2 pr-2 text-right font-normal">Ran</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">Other</th>
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
              <td className="py-2 pr-2 text-right">
                {week.ran.runs ? `${week.ran.km} km` : "–"}
                {week.ran.runs > 0 && (
                  <span className="block text-muted">
                    {week.ran.runs} {week.ran.runs === 1 ? "run" : "runs"}, {hours(week.ran.minutes)}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right">
                {week.other.length ? hours(week.other.reduce((n, s) => n + s.minutes, 0)) : "–"}
                {week.other.map((sport) => (
                  <span key={sport.type} className="block text-muted">
                    {activityLabel(sport.type)} {hours(sport.minutes)}
                  </span>
                ))}
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
