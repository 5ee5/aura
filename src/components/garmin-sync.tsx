import { ActionForm } from "@/components/action-form";
import { syncFromGarmin } from "@/server/garmin/actions";

/** Last sync time and a sync button; shown only when a Garmin key is set. */
export function GarminSync({ lastSync }: { lastSync: Date | undefined }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 rounded-lg border border-line px-3 py-2 text-sm">
      <p className="text-muted">
        {lastSync
          ? `Garmin synced ${lastSync.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`
          : "Garmin not synced yet."}{" "}
        Sync is manual for now.
      </p>
      <ActionForm action={syncFromGarmin} submitLabel="Sync now">
        {null}
      </ActionForm>
    </div>
  );
}
