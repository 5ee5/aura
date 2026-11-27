/** Today as YYYY-MM-DD in the server's own time zone (the athlete's), not UTC. */
export function localToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}
