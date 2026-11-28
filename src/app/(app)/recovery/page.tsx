import type { Metadata } from "next";
import Link from "next/link";
import { addDays, formatDate, localToday } from "@/lib/dates";
import { hrvWord, recoverySummary, sleepTime, type Average, type WellnessDay } from "@/lib/recovery";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { wellnessBetween } from "@/server/garmin/wellness-store";

export const metadata: Metadata = { title: "Recovery" };

const TABLE_DAYS = 14;
const dash = "–";
const avg = (a: Average, unit = "") => (a.value === null ? dash : `${a.value}${unit}`);
const hours = (a: Average) => (a.value === null ? dash : sleepTime(a.value * 3600));
const short = (date: string) => formatDate(date, { weekday: "short", day: "numeric", month: "short" });

function Tile({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-4xl">{value}</dd>
      <dd className="text-sm text-muted">{detail}</dd>
    </div>
  );
}

function hrvDetail(day: WellnessDay | undefined) {
  if (!day || day.hrvLastNight === null) return "no reading";
  const band = day.hrvBalancedLow !== null && day.hrvBalancedHigh !== null ? `your usual ${day.hrvBalancedLow}–${day.hrvBalancedHigh}` : null;
  return [day.hrvStatus && hrvWord(day.hrvStatus), band].filter(Boolean).join(", ");
}

export default async function RecoveryPage() {
  await requireSession();
  const today = localToday();
  const days = await wellnessBetween(getDb(), addDays(today, -40), today);
  const summary = recoverySummary(days, today);
  const night = summary.lastNight;
  const recent = [...days].reverse().slice(0, TABLE_DAYS);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Recovery</h1>
        <Link href="/calendar" className="text-accent underline underline-offset-4">
          Calendar
        </Link>
      </div>
      <p className="mt-2 text-muted">
        Sleep, HRV, resting heart rate and Body Battery as your Garmin watch estimated them. Each night belongs to the morning it
        ended. No single number says whether you are ready to train; look at them together, and at how you feel.
      </p>

      {days.length === 0 ? (
        <p className="mt-6 text-muted">
          {getEnv().GARMIN_API_KEY ? "Nothing synced yet. It arrives with the next Garmin sync." : "Connect Garmin to see recovery data."}
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <Tile
              label={night ? `Sleep, ${short(night.on)}` : "Sleep"}
              value={night?.sleepSeconds ? sleepTime(night.sleepSeconds) : dash}
              detail={`${night?.sleepScore !== null && night?.sleepScore !== undefined ? `score ${night.sleepScore}, ` : ""}7-day ${hours(summary.sleepHours7)}`}
            />
            <Tile label="HRV last night" value={night?.hrvLastNight ? `${night.hrvLastNight} ms` : dash} detail={hrvDetail(night)} />
            <Tile
              label="Resting heart rate, 7 days"
              value={avg(summary.restingHeartRate7)}
              detail={`28-day ${avg(summary.restingHeartRate28, " bpm")}`}
            />
            <Tile label="HRV, 7 days" value={avg(summary.hrv7, " ms")} detail={`28-day ${avg(summary.hrv28, " ms")}`} />
          </dl>

          <table className="mt-6 w-full border-collapse text-sm">
            <caption className="mb-2 text-left font-display text-xl">Last {TABLE_DAYS} days</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 pr-2 font-normal">Day</th>
                <th scope="col" className="py-2 pr-2 text-right font-normal">Sleep</th>
                <th scope="col" className="py-2 pr-2 text-right font-normal">HRV</th>
                <th scope="col" className="py-2 pr-2 text-right font-normal">Resting HR</th>
                <th scope="col" className="py-2 pr-2 text-right font-normal">Stress</th>
                <th scope="col" className="py-2 text-right font-normal">Body Battery</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.on} className="border-b border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-normal">
                    {short(d.on)}
                    {d.on === today && <span className="block text-muted">today so far</span>}
                  </th>
                  <td className="py-2 pr-2 text-right">
                    {d.sleepSeconds === null ? dash : sleepTime(d.sleepSeconds)}
                    {d.sleepScore !== null && <span className="block text-muted">score {d.sleepScore}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {d.hrvLastNight ?? dash}
                    {d.hrvStatus && <span className="block text-muted">{hrvWord(d.hrvStatus)}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right">{d.restingHeartRate ?? dash}</td>
                  <td className="py-2 pr-2 text-right">{d.stressAverage ?? dash}</td>
                  <td className="py-2 text-right">{d.bodyBatteryHigh ?? dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-muted">
            HRV in milliseconds; stress and Body Battery on Garmin’s 0–100 scales (Body Battery: the day’s high).
          </p>
        </>
      )}
    </div>
  );
}
