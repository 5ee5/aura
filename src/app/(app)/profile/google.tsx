import { ActionForm } from "@/components/action-form";
import { disconnectGoogle } from "@/server/google/actions";
import { grantedScopes } from "@/server/google/oauth";

const RESULTS: Record<string, string> = {
  connected: "Connected.",
  denied: "You said no on Google's screen, so nothing was connected.",
  "no-access": "Aura needs to manage its own calendar. Connect again and leave that box ticked.",
  expired: "That took too long or came from another tab. Try connecting again.",
  failed: "Connecting failed. Try again.",
  "not-set-up": "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env and restart Aura.",
};

interface Props {
  setUp: boolean;
  account: { scopes: string; connectedAt: Date; syncedAt: Date | null } | undefined;
  result: string | undefined;
}

export function GoogleSection({ setUp, account, result }: Props) {
  return (
    <section aria-labelledby="google-heading">
      <h2 id="google-heading" className="font-display text-2xl">
        Google Calendar
      </h2>
      {result && RESULTS[result] && (
        <p role="status" className="mt-2 text-sm">
          {RESULTS[result]}
        </p>
      )}
      {!setUp && (
        <p className="mt-2 text-muted">
          Not set up. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to .env (see the README) and
          restart Aura.
        </p>
      )}
      {setUp && !account && (
        <>
          <p className="mt-2 text-muted">
            Not connected. Aura will create its own calendar, called Aura, and keep your approved workouts in it. It cannot
            see or change your other calendars.
          </p>
          <a
            href="/api/google/connect"
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-accent px-4 font-medium text-background"
          >
            Connect Google Calendar
          </a>
        </>
      )}
      {account && (
        <>
          <p className="mt-2 text-sm text-muted">
            Connected {account.connectedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.{" "}
            {account.syncedAt
              ? `Workouts written to the Aura calendar ${account.syncedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`
              : "Workouts not written yet."}
            {!grantedScopes(account.scopes).ownCalendar && " Connect again to give Aura access to its own calendar."}
          </p>
          <div className="mt-3">
            <ActionForm action={disconnectGoogle} submitLabel="Disconnect Google" confirm="Disconnect Google Calendar?" quiet>
              {null}
            </ActionForm>
          </div>
        </>
      )}
    </section>
  );
}
