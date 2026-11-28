import { ActionForm } from "@/components/action-form";
import { syncEverything } from "@/server/garmin/actions";

export interface SourceStatus {
  name: string;
  /** "synced" or "updated". */
  verb: string;
  lastSync: Date | undefined | null;
  /** When it happens by itself, as a sentence; undefined when only the button does it. */
  every?: string;
  error?: string;
}

const when = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** When each connected source last synced, and one button for both. */
export function SyncBar({ sources }: { sources: SourceStatus[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 rounded-lg border border-line px-3 py-2 text-sm">
      <div className="text-muted">
        {sources.map((s) => (
          <p key={s.name}>
            {s.lastSync ? `${s.name} ${s.verb} ${when(s.lastSync)}.` : `${s.name} not ${s.verb} yet.`}
            {s.every && ` ${s.every}`}
            {s.error && <span className="block text-danger">{s.name}: {s.error}</span>}
          </p>
        ))}
      </div>
      <ActionForm action={syncEverything} submitLabel="Sync now">
        {null}
      </ActionForm>
    </div>
  );
}
