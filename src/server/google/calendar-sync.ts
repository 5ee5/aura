// Keeps the Aura calendar in Google in line with the approved workouts.
// Pure planning plus a small API client; relative imports only, so it runs in tests.
// Docs: developers.google.com/workspace/calendar/api/v3/reference
import { addDays } from "../../lib/dates";
import { describeStep, estimateMinutes, WORKOUT_TYPES, type Step, type Workout } from "../../lib/workout";
import { GoogleError } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3";
const KEY = "auraWorkoutId";

/** What Aura wants an event to say. Compared field by field with what Google has. */
export interface WantedEvent {
  workoutId: number;
  date: string;
  summary: string;
  description: string;
}

export interface ExistingEvent {
  id: string;
  workoutId: number | undefined;
  date: string | undefined;
  summary: string;
  description: string;
}

function stepLines(steps: Step[], indent = ""): string[] {
  return steps.flatMap((step) => [`${indent}${describeStep(step)}`, ...stepLines(step.steps, `${indent}  `)]);
}

/** The all-day event for one approved, dated workout. */
export function wantedEvent(workout: Workout, appUrl: string, done: boolean): WantedEvent {
  const minutes = Math.round(estimateMinutes(workout.steps));
  return {
    workoutId: workout.id,
    date: workout.scheduledOn!,
    summary: `${done ? "✓ " : ""}${workout.title} (${minutes} min)`,
    description: [
      `${WORKOUT_TYPES[workout.type]}, about ${minutes} min.`,
      workout.description,
      stepLines(workout.steps).join("\n"),
      `Open in Aura: ${new URL(`/workouts/${workout.id}`, appUrl)}`,
      "Kept up to date by Aura; changes made here are overwritten.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export interface Plan {
  create: WantedEvent[];
  update: { eventId: string; wanted: WantedEvent }[];
  remove: string[];
}

/**
 * What to change in Google so the calendar holds exactly the wanted events:
 * one per workout, matched by the workout id stored on the event. Events that
 * are not Aura's, duplicates and events for workouts no longer wanted go.
 */
export function planChanges(wanted: WantedEvent[], existing: ExistingEvent[]): Plan {
  const byWorkout = new Map<number, ExistingEvent>();
  const remove: string[] = [];
  for (const event of existing) {
    if (event.workoutId === undefined || byWorkout.has(event.workoutId)) remove.push(event.id);
    else byWorkout.set(event.workoutId, event);
  }
  const create: WantedEvent[] = [];
  const update: Plan["update"] = [];
  const wantedIds = new Set(wanted.map((w) => w.workoutId));
  for (const w of wanted) {
    const event = byWorkout.get(w.workoutId);
    if (!event) create.push(w);
    else if (event.date !== w.date || event.summary !== w.summary || event.description !== w.description)
      update.push({ eventId: event.id, wanted: w });
  }
  for (const [workoutId, event] of byWorkout) if (!wantedIds.has(workoutId)) remove.push(event.id);
  return { create, update, remove };
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

export class CalendarApi {
  constructor(
    private readonly accessToken: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  /** Undefined for 404 and 410, so a deleted calendar or event can be told apart. */
  private async call(method: string, path: string, body?: object): Promise<Json | undefined> {
    let response: Response;
    try {
      response = await this.doFetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${this.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new GoogleError("unavailable", "Could not reach Google Calendar. Try again later.");
    }
    if (response.status === 404 || response.status === 410) return undefined;
    if (response.status === 401 || response.status === 403)
      throw new GoogleError("reconnect", "Google Calendar refused Aura's access. Connect again on the Profile page.");
    if (!response.ok) throw new GoogleError("unavailable", `Google Calendar did not answer properly (HTTP ${response.status}).`);
    if (response.status === 204) return {};
    return record(await response.json().catch(() => undefined)) ?? {};
  }

  async calendarExists(id: string): Promise<boolean> {
    return (await this.call("GET", `/calendars/${encodeURIComponent(id)}?fields=id`)) !== undefined;
  }

  async createCalendar(timeZone: string): Promise<string> {
    const json = await this.call("POST", "/calendars", {
      summary: "Aura",
      description: "Workouts approved in Aura. Kept up to date by Aura; changes made here are overwritten.",
      timeZone,
    });
    if (typeof json?.id !== "string") throw new GoogleError("unavailable", "Google did not create the Aura calendar.");
    return json.id;
  }

  /** Every event in the calendar from a date on, following pages; a bad page fails. */
  async listEvents(calendarId: string, from: string): Promise<ExistingEvent[]> {
    const events: ExistingEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 40; page++) {
      const params = new URLSearchParams({
        timeMin: `${from}T00:00:00Z`,
        maxResults: "250",
        showDeleted: "false",
        fields: "items(id,summary,description,start,extendedProperties),nextPageToken",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const json = await this.call("GET", `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
      if (!json || !Array.isArray(json.items)) throw new GoogleError("unavailable", "Google sent an unexpected event list. Nothing was changed.");
      for (const item of json.items.map(record)) {
        if (!item || typeof item.id !== "string") continue;
        const id = Number(record(record(item.extendedProperties)?.private)?.[KEY]);
        events.push({
          id: item.id,
          workoutId: Number.isInteger(id) && id > 0 ? id : undefined,
          date: typeof record(item.start)?.date === "string" ? (record(item.start)!.date as string) : undefined,
          summary: typeof item.summary === "string" ? item.summary : "",
          description: typeof item.description === "string" ? item.description : "",
        });
      }
      if (typeof json.nextPageToken !== "string") return events;
      pageToken = json.nextPageToken;
    }
    throw new GoogleError("unavailable", "Too many events in the Aura calendar. Nothing more was changed.");
  }

  private body(w: WantedEvent) {
    return {
      summary: w.summary,
      description: w.description,
      start: { date: w.date },
      end: { date: addDays(w.date, 1) },
      // A workout does not block time, and Aura sends no reminders.
      transparency: "transparent",
      reminders: { useDefault: false, overrides: [] },
      extendedProperties: { private: { [KEY]: String(w.workoutId) } },
    };
  }

  async insert(calendarId: string, w: WantedEvent) {
    await this.call("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, this.body(w));
  }

  async update(calendarId: string, eventId: string, w: WantedEvent) {
    await this.call("PUT", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, this.body(w));
  }

  async remove(calendarId: string, eventId: string) {
    await this.call("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  }
}
