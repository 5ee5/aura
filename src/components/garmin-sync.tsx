import { ActionForm } from "@/components/action-form";
import { syncFromGarmin } from "@/server/garmin/actions";

interface Props {
  lastSync: Date | undefined;
  auto: boolean;
  /** The last attempt's error, if it failed. */
  error?: string;
}

const when = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** Last sync time and a sync button; shown only when a Garmin key is set. */
export function GarminSync({ lastSync, auto, error }: Props) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 rounded-lg border border-line px-3 py-2 text-sm">
      <div className="text-muted">
        <p>
          {lastSync ? `Garmin synced ${when(lastSync)}.` : "Garmin not synced yet."}{" "}
          {auto ? "Syncs every 2 hours from 06:00 to 23:00." : "Sync is manual here."}
        </p>
        {error && <p className="text-danger">Last sync failed: {error}</p>}
      </div>
      <ActionForm action={syncFromGarmin} submitLabel="Sync now">
        {null}
      </ActionForm>
    </div>
  );
}
