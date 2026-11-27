import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addMonths, daysBetween, formatDate, isDate, localToday, monthWeeks, startOfWeek } from "@/lib/dates";
import { BLOCK_FOCUSES } from "@/lib/plans";
import { requireSession } from "@/server/auth/dal";
import { calendarDays, type Day } from "@/server/calendar/data";
import { CalendarEntry } from "./entry";

export const metadata: Metadata = { title: "Calendar" };

const link = "flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:text-foreground";
const tab = "flex h-9 items-center rounded-lg px-3 text-sm aria-[current=page]:bg-surface aria-[current=page]:text-foreground text-muted";

function Badges({ day }: { day: Day }) {
  return (
    <>
      {day.rest && <span className="text-sm text-muted">Rest day</span>}
      {day.races.map((race) => (
        <span key={race} className="flex items-center gap-1 text-sm text-accent">
          <Flag aria-hidden className="size-4" />
          {race}
        </span>
      ))}
    </>
  );
}

function WeekView({ days, today }: { days: Day[]; today: string }) {
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {days.map((day) => {
        const label = formatDate(day.date, { weekday: "long", day: "numeric", month: "long" });
        return (
          <li key={day.date} aria-label={day.date === today ? `${label} (today)` : label}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-1">
              <h2 className={`font-display text-lg ${day.date === today ? "text-accent" : ""}`}>
                {label}
              </h2>
              <Badges day={day} />
            </div>
            {day.workouts.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2">
                {day.workouts.map((workout) => (
                  <CalendarEntry key={workout.id} workout={workout} today={today} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">Nothing planned.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MonthView({ days, month, today }: { days: Day[]; month: string; today: string }) {
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <table className="mt-4 w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">{formatDate(month, { month: "long", year: "numeric" })}</caption>
      <thead>
        <tr>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
            <th key={name} scope="col" className="pb-1 text-left font-normal text-muted">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]!.date}>
            {week.map((day) => {
              const outside = day.date.slice(0, 7) !== month.slice(0, 7);
              return (
                <td key={day.date} className={`h-20 border border-line p-1 align-top ${day.rest ? "bg-surface" : ""} ${outside ? "opacity-40" : ""}`}>
                  <Link
                    href={`/calendar?view=week&date=${day.date}`}
                    aria-label={`${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}: ${
                      day.workouts.length ? day.workouts.map((w) => w.title).join(", ") : "nothing planned"
                    }${day.races.length ? `, race: ${day.races.join(", ")}` : ""}`}
                    className="block h-full"
                  >
                    <span className={day.date === today ? "rounded bg-accent px-1 text-background" : ""}>
                      {Number(day.date.slice(8))}
                    </span>
                    {day.races.length > 0 && <Flag aria-hidden className="mt-1 size-4 text-accent" />}
                    <span aria-hidden className="mt-1 hidden flex-col gap-0.5 md:flex">
                      {day.workouts.map((w) => (
                        <span key={w.id} className={`truncate ${w.outcome === "skipped" ? "text-muted line-through" : ""}`}>
                          {w.outcome === "done" && "✓ "}
                          {w.title}
                        </span>
                      ))}
                    </span>
                    <span aria-hidden className="mt-1 flex flex-wrap gap-1 md:hidden">
                      {day.workouts.map((w) => (
                        <span key={w.id} className={`size-2 rounded-full ${w.outcome === "skipped" ? "bg-line-strong" : "bg-accent"}`} />
                      ))}
                    </span>
                  </Link>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  await requireSession();
  const params = await searchParams;
  const today = localToday();
  const view = params.view === "month" ? "month" : "week";
  const anchor = typeof params.date === "string" && isDate(params.date) ? params.date : today;

  const weeks = view === "month" ? monthWeeks(anchor) : [startOfWeek(anchor)];
  const from = weeks[0]!;
  const to = addDays(weeks.at(-1)!, 6);
  const { days, unscheduled, blocks } = await calendarDays(from, to);
  const previous = view === "month" ? addMonths(anchor, -1) : addDays(from, -7);
  const next = view === "month" ? addMonths(anchor, 1) : addDays(from, 7);
  const title =
    view === "month"
      ? formatDate(anchor, { month: "long", year: "numeric" })
      : `${formatDate(from, { day: "numeric", month: "short" })} – ${formatDate(to, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Calendar</h1>
        <div className="flex flex-wrap gap-1">
          <Link href={`/calendar?view=week&date=${anchor}`} aria-current={view === "week" ? "page" : undefined} className={tab}>
            Week
          </Link>
          <Link href={`/calendar?view=month&date=${anchor}`} aria-current={view === "month" ? "page" : undefined} className={tab}>
            Month
          </Link>
          <Link href="/workouts" className={tab}>
            List
          </Link>
          <Link href="/plans" className={tab}>
            Plans
          </Link>
          <Link href="/analytics" className={tab}>
            Analytics
          </Link>
        </div>
      </div>
      <nav aria-label="Dates" className="mt-3 flex items-center justify-between gap-2">
        <Link href={`/calendar?view=${view}&date=${previous}`} className={link}>
          <ChevronLeft aria-hidden className="size-5" />
          <span className="sr-only">Previous {view}</span>
        </Link>
        <p aria-live="polite" className="text-center font-medium">
          {title}
        </p>
        <div className="flex items-center">
          <Link href={`/calendar?view=${view}`} className={link}>
            Today
          </Link>
          <Link href={`/calendar?view=${view}&date=${next}`} className={link}>
            <ChevronRight aria-hidden className="size-5" />
            <span className="sr-only">Next {view}</span>
          </Link>
        </div>
      </nav>

      {blocks.length > 0 && (
        <ul aria-label="Training blocks" className="mt-3 flex flex-col gap-1">
          {blocks.map((block) => {
            const total = Math.ceil((daysBetween(block.startOn, block.endOn) + 1) / 7);
            const week = Math.min(total, Math.max(1, Math.floor(daysBetween(block.startOn, from) / 7) + 1));
            return (
              <li key={block.id} className="rounded-lg border-l-4 border-accent bg-surface px-3 py-2 text-sm">
                <Link href={`/plans/${block.planId}`} className="font-medium underline-offset-4 hover:underline">
                  {block.name}
                </Link>
                <span className="text-muted">
                  {" "}
                  {BLOCK_FOCUSES[block.focus].toLowerCase()}, {block.planName}
                  {view === "week" && block.startOn <= from ? `, week ${week} of ${total}` : ""}
                  {block.weeklyMinutes !== null && `, about ${block.weeklyMinutes} min a week`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {view === "week" ? <WeekView days={days} today={today} /> : <MonthView days={days} month={anchor} today={today} />}

      {unscheduled.length > 0 && (
        <section aria-labelledby="unscheduled-heading" className="mt-8">
          <h2 id="unscheduled-heading" className="font-display text-xl">
            Not scheduled
          </h2>
          <p className="text-sm text-muted">Approved workouts without a date. Schedule them onto a day.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {unscheduled.map((workout) => (
              <CalendarEntry key={workout.id} workout={workout} today={today} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
