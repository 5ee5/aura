// What people type (kilometres, h:mm:ss) against what is stored (metres, seconds).

/** "10", "21.0975" or "21,1" kilometres to whole metres; null if unreadable. */
export function parseKilometres(text: string): number | null {
  const match = /^\d{1,4}([.,]\d{1,4})?$/.exec(text.trim());
  if (!match) return null;
  const metres = Math.round(Number(match[0].replace(",", ".")) * 1000);
  return metres > 0 && metres <= 1_000_000 ? metres : null;
}

export function formatKilometres(metres: number): string {
  return String(metres / 1000);
}

/** "19:45", "1:32:05" or "75:00.5" to seconds; null if unreadable. */
export function parseDuration(text: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,4}):([0-5]\d)([.,]\d{1,2})?$/.exec(text.trim());
  if (!match) return null;
  const [, hours, minutes = "0", seconds = "0", fraction = ""] = match;
  if (hours !== undefined && Number(minutes) > 59) return null;
  const total =
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction.replace(",", ".") || 0);
  return total > 0 && total < 10_000_000 ? Math.round(total * 100) / 100 : null;
}

export function formatDuration(total: number): string {
  const hundredths = Math.round(total * 100);
  const hours = Math.floor(hundredths / 360_000);
  const minutes = Math.floor(hundredths / 6_000) % 60;
  const seconds = Math.floor(hundredths / 100) % 60;
  const fraction = hundredths % 100;
  const two = (n: number) => String(n).padStart(2, "0");
  const clock = hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
  return fraction ? `${clock}.${two(fraction)}` : clock;
}
