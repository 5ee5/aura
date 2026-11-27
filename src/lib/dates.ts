// Calendar dates as YYYY-MM-DD strings. Arithmetic is done in UTC so that no
// time zone or daylight-saving change can shift a day.

/** Today as YYYY-MM-DD in the server's own time zone (the athlete's), not UTC. */
export function localToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}

const parse = (date: string) => new Date(`${date}T00:00:00Z`);

export function isDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && parse(text).toISOString().slice(0, 10) === text;
}

export function addDays(date: string, days: number): string {
  const day = parse(date);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: string): number {
  return parse(date).getUTCDay() || 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Whole days from a to b. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

export function addMonths(date: string, months: number): string {
  const day = parse(`${date.slice(0, 8)}01`);
  day.setUTCMonth(day.getUTCMonth() + months);
  return day.toISOString().slice(0, 10);
}

/** The Mondays of every week that touches the month of `date`. */
export function monthWeeks(date: string): string[] {
  const first = `${date.slice(0, 8)}01`;
  const next = addMonths(first, 1);
  const weeks: string[] = [];
  for (let monday = startOfWeek(first); monday < next; monday = addDays(monday, 7)) weeks.push(monday);
  return weeks;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Formats a date in English, as written, with no time zone shift. */
export function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })));
  return formatter.format(parse(date));
}
