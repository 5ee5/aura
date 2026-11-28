// When the timer syncs. Pure, so it can be tested; relative imports only.

/** Hours apart, at the earliest. */
export const SYNC_EVERY_HOURS = 2;
/** Local hours when the timer may sync: 06:00 to 22:59. */
export const SYNC_FROM_HOUR = 6;
export const SYNC_UNTIL_HOUR = 23;

/**
 * Due when the local hour is inside the window and the last attempt, failed or
 * not, was at least SYNC_EVERY_HOURS ago. A failure waits for the next slot.
 */
export function syncDue(now: Date, lastAttempt: Date | undefined): boolean {
  const hour = now.getHours();
  if (hour < SYNC_FROM_HOUR || hour >= SYNC_UNTIL_HOUR) return false;
  return !lastAttempt || now.getTime() - lastAttempt.getTime() >= SYNC_EVERY_HOURS * 3600_000 - 60_000;
}
