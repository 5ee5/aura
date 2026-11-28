import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { WEEKDAYS, WORKOUT_TYPES } from "@/lib/profile-options";
import { formatDuration, formatKilometres } from "@/lib/units";
import { logout } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/dal";
import { saveAbout, saveGoal, saveInjury, saveRace, saveWeek } from "@/server/profile/actions";
import { getProfile } from "@/server/profile/data";
import { getEnv } from "@/server/env";
import { Entries } from "./entries";
import { GarminSection } from "./garmin";
import { GoogleSection } from "./google";
import { getGoogleAccount, googleClient } from "@/server/google/account";
import { Input, Row, Select, TextArea } from "@/components/form-fields";

export const metadata: Metadata = { title: "Profile" };

const km = (metres: number | null | undefined) => (metres ? formatKilometres(metres) : "");
const time = (seconds: number | null | undefined) => (seconds ? formatDuration(seconds) : "");
const joined = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(", ");

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  await requireSession();
  const [profile, google, params] = await Promise.all([getProfile(), getGoogleAccount(), searchParams]);
  const athlete = profile?.athlete;
  const garminConnected = Boolean(getEnv().GARMIN_API_KEY);

  return (
    <div className="flex min-h-full max-w-2xl flex-col gap-10">
      <h1 className="font-display text-3xl">Profile</h1>

      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="mb-3 font-display text-2xl">
          About you
        </h2>
        {!athlete && <p className="mb-3 text-muted">Save your name to start your profile.</p>}
        <ActionForm action={saveAbout} submitLabel="Save about you">
          <Input label="Name" name="name" defaultValue={athlete?.name} maxLength={100} required />
          <TextArea
            label="Training preferences"
            name="trainingPreferences"
            defaultValue={athlete?.trainingPreferences ?? ""}
            maxLength={4000}
          />
          <fieldset>
            <legend className="text-sm text-muted">Preferred workouts</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {WORKOUT_TYPES.map((type) => (
                <label key={type} className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    name="preferredWorkoutTypes"
                    value={type}
                    defaultChecked={athlete?.preferredWorkoutTypes.includes(type)}
                    className="size-4 accent-accent"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </section>

      {profile && (
        <>
          <section aria-labelledby="week-heading">
            <h2 id="week-heading" className="font-display text-2xl">
              Weekly availability
            </h2>
            <p className="mt-1 mb-3 text-sm text-muted">
              Most minutes you can train each day. 0 is a rest day; blank means not set.
            </p>
            <ActionForm action={saveWeek} submitLabel="Save availability">
              {WEEKDAYS.map((label, index) => {
                const day = profile.week.find((d) => d.weekday === index + 1);
                return (
                  <div key={label} className="grid grid-cols-[6.5rem_5rem_minmax(0,1fr)] items-center gap-2">
                    <span>{label}</span>
                    <input
                      name={`minutes_${index + 1}`}
                      defaultValue={day?.maxMinutes ?? ""}
                      inputMode="numeric"
                      aria-label={`${label} minutes`}
                      placeholder="min"
                      className="min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2"
                    />
                    <input
                      name={`notes_${index + 1}`}
                      defaultValue={day?.notes ?? ""}
                      maxLength={200}
                      aria-label={`${label} notes`}
                      placeholder="Notes"
                      className="min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2"
                    />
                  </div>
                );
              })}
            </ActionForm>
          </section>

          <Entries
            title="Goals"
            noun="goal"
            kind="goal"
            items={profile.goals}
            empty="No goals yet."
            save={saveGoal}
            summary={(g) => (
              <>
                {g.description}
                <span className="block text-sm text-muted">
                  {joined(
                    g.status,
                    g.raceName,
                    g.raceDate,
                    g.distanceMetres ? `${km(g.distanceMetres)} km` : null,
                    g.targetSeconds ? `target ${time(g.targetSeconds)}` : null,
                  )}
                </span>
              </>
            )}
            fields={(g) => (
              <>
                <TextArea label="Description" name="description" defaultValue={g?.description} maxLength={500} required />
                <Row>
                  <Input label="Race name (optional)" name="raceName" defaultValue={g?.raceName ?? ""} maxLength={200} />
                  <Input label="Race date (optional)" name="raceDate" type="date" defaultValue={g?.raceDate ?? ""} />
                </Row>
                <Row>
                  <Input label="Distance, km (optional)" name="distanceMetres" inputMode="decimal" defaultValue={km(g?.distanceMetres)} />
                  <Input label="Target time (optional)" name="targetSeconds" placeholder="h:mm:ss" defaultValue={time(g?.targetSeconds)} />
                  <Select label="Status" name="status" options={["active", "achieved", "abandoned"]} defaultValue={g?.status} />
                </Row>
              </>
            )}
          />

          <GarminSection garmin={profile.garmin} connected={garminConnected} />

          <GoogleSection
            setUp={Boolean(googleClient())}
            account={google}
            result={typeof params.google === "string" ? params.google : undefined}
          />

          <Entries
            title="Race history"
            noun="race"
            kind="race"
            items={profile.races}
            empty="No races yet."
            save={saveRace}
            summary={(r) => (
              <>
                {r.name}
                <span className="block text-sm text-muted">
                  {joined(
                    r.raceDate,
                    `${km(r.distanceMetres)} km ${r.surface}`,
                    r.elevationGainMetres !== null && `${r.elevationGainMetres} m climb`,
                    r.timeSeconds ? time(r.timeSeconds) : "did not finish",
                  )}
                </span>
              </>
            )}
            fields={(r) => (
              <>
                <Row>
                  <Input label="Race name" name="name" defaultValue={r?.name} maxLength={200} required />
                  <Input label="Date" name="raceDate" type="date" defaultValue={r?.raceDate} required />
                </Row>
                <Row>
                  <Input label="Distance, km" name="distanceMetres" inputMode="decimal" defaultValue={km(r?.distanceMetres)} required />
                  <Input label="Elevation gain, m (optional)" name="elevationGainMetres" inputMode="numeric" defaultValue={r?.elevationGainMetres ?? ""} />
                  <Select label="Surface" name="surface" options={["road", "trail", "track"]} defaultValue={r?.surface} />
                  <Input label="Time (blank if not finished)" name="timeSeconds" placeholder="h:mm:ss" defaultValue={time(r?.timeSeconds)} />
                </Row>
                <TextArea label="Notes (optional)" name="notes" defaultValue={r?.notes ?? ""} maxLength={4000} />
              </>
            )}
          />

          <Entries
            title="Injuries"
            noun="injury"
            kind="injury"
            items={profile.injuries}
            empty="No injuries recorded."
            save={saveInjury}
            summary={(i) => (
              <>
                {i.bodyArea}
                <span className="block text-sm text-muted">
                  {i.resolvedOn ? `${i.startedOn} to ${i.resolvedOn}` : `current, since ${i.startedOn}`}
                </span>
              </>
            )}
            fields={(i) => (
              <>
                <Input label="Body area" name="bodyArea" defaultValue={i?.bodyArea} maxLength={100} required />
                <TextArea label="What happened" name="description" defaultValue={i?.description} maxLength={2000} required />
                <Row>
                  <Input label="Started" name="startedOn" type="date" defaultValue={i?.startedOn} required />
                  <Input label="Resolved (blank if current)" name="resolvedOn" type="date" defaultValue={i?.resolvedOn ?? ""} />
                </Row>
              </>
            )}
          />
        </>
      )}

      <form action={logout} className="mt-auto">
        <button
          type="submit"
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-line-strong md:w-auto md:px-5"
        >
          <LogOut aria-hidden className="size-5" />
          Sign out
        </button>
      </form>
    </div>
  );
}
