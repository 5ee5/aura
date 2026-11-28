import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/lib/dates";
import { formatDuration, formatKilometres } from "@/lib/units";
import { GARMIN_BEST_DISTANCES } from "@/server/garmin/extract";
import { syncFromGarmin } from "@/server/garmin/actions";
import type { getProfile } from "@/server/profile/data";

type Garmin = NonNullable<Awaited<ReturnType<typeof getProfile>>>["garmin"];

const DISTANCE_NAMES: Record<(typeof GARMIN_BEST_DISTANCES)[number], string> = {
  1000: "1 km",
  1609: "Mile",
  5000: "5 km",
  10000: "10 km",
  21098: "Half marathon",
  42195: "Marathon",
};

const day = (date: string) => formatDate(date, { day: "numeric", month: "short", year: "numeric" });

/** Read-only: everything here is replaced on each sync. */
export function GarminSection({ garmin, connected }: { garmin: Garmin | undefined; connected: boolean }) {
  const snapshot = garmin?.snapshot;
  const zones = snapshot?.heartRateZones;
  const facts = snapshot
    ? [
        ["Max heart rate", snapshot.maxHeartRate && `${snapshot.maxHeartRate} bpm`],
        ["Resting heart rate", snapshot.restingHeartRate && `${snapshot.restingHeartRate} bpm`],
        ["Threshold heart rate", snapshot.lactateThresholdHeartRate && `${snapshot.lactateThresholdHeartRate} bpm`],
        ["VO2 max", snapshot.vo2Max && `${snapshot.vo2Max}${snapshot.vo2MaxOn ? `, ${day(snapshot.vo2MaxOn)}` : ""}`],
      ].filter((fact): fact is [string, string] => Boolean(fact[1]))
    : [];

  return (
    <section aria-labelledby="garmin-heading">
      <h2 id="garmin-heading" className="font-display text-2xl">
        From Garmin
      </h2>
      {!connected && (
        <p className="mt-2 text-muted">
          Not connected. Add <code>GARMIN_API_KEY</code> to .env and restart Aura.
        </p>
      )}
      {connected && !snapshot && <p className="mt-2 text-muted">Not synced yet.</p>}
      {snapshot && (
        <p className="mt-2 text-sm text-muted">
          Read from your watch, {snapshot.syncedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          , from {snapshot.runsRead} outdoor runs.
        </p>
      )}

      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {zones && (
        <>
          <h3 className="mt-4 text-sm text-muted">Heart-rate zones</h3>
          <ol className="mt-1 flex flex-wrap gap-2">
            {zones.map((floor, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-1 text-sm">
                Z{i + 1} {floor}
                {i < 4 ? `–${zones[i + 1]! - 1}` : "+"}
              </li>
            ))}
          </ol>
        </>
      )}

      {garmin && garmin.bests.length > 0 && (
        <>
          <h3 className="mt-4 text-sm text-muted">Fastest efforts inside outdoor runs</h3>
          <ul className="mt-1 divide-y divide-line">
            {garmin.bests.map((best) => (
              <li key={best.id} className="flex justify-between gap-4 py-2">
                <span>
                  {DISTANCE_NAMES[best.distanceMetres as keyof typeof DISTANCE_NAMES] ??
                    `${formatKilometres(best.distanceMetres)} km`}
                </span>
                <span>
                  {formatDuration(best.timeSeconds)}
                  {best.achievedOn && <span className="ml-3 text-sm text-muted">{day(best.achievedOn)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {connected && (
        <div className="mt-4">
          <ActionForm action={syncFromGarmin} submitLabel={snapshot ? "Sync again" : "Sync from Garmin"}>
            {null}
          </ActionForm>
        </div>
      )}
    </section>
  );
}
