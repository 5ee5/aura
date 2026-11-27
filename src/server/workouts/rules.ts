// Safety limits checked in code, whatever the coach was told.
import { HARD_TYPES, WORKOUT_TYPES, estimateMinutes } from "../../lib/workout";
import type { Proposal } from "./proposal";

export interface Limits {
  /** Body areas of injuries with no end date. */
  currentInjuries: string[];
  /** ISO weekday (1 is Monday) to most minutes; absent means not set. */
  maxMinutes: Map<number, number>;
}

interface ProfileLike {
  week: { weekday: number; maxMinutes: number }[];
  injuries: { bodyArea: string; resolvedOn: string | null }[];
}

export function limitsFrom(profile: ProfileLike | undefined): Limits {
  return {
    currentInjuries: profile?.injuries.filter((i) => !i.resolvedOn).map((i) => i.bodyArea) ?? [],
    maxMinutes: new Map(profile?.week.map((day) => [day.weekday, day.maxMinutes]) ?? []),
  };
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface Broken {
  rule: "injury" | "past" | "rest" | "too_long";
  /** Plain enough to show the athlete. */
  message: string;
}

/**
 * Which rule the workout breaks, if any. keepDate is a date it already had,
 * which may stay even once it is in the past.
 */
export function breaksRule(
  proposal: Proposal,
  limits: Limits,
  today: string,
  keepDate?: string | null,
): Broken | undefined {
  if (limits.currentInjuries.length && HARD_TYPES.includes(proposal.type)) {
    const message =
      `Hard sessions aren’t allowed while an injury is current (${limits.currentInjuries.join(", ")}), ` +
      `and ${WORKOUT_TYPES[proposal.type].toLowerCase()} counts as hard.`;
    return { rule: "injury", message };
  }
  const date = proposal.scheduledOn;
  if (!date) return undefined;
  if (date < today && date !== keepDate) return { rule: "past", message: `${date} is in the past.` };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const max = limits.maxMinutes.get(weekday);
  if (max === 0) return { rule: "rest", message: `${DAY_NAMES[weekday]} is a rest day in your profile.` };
  const minutes = Math.round(estimateMinutes(proposal.steps));
  if (max !== undefined && minutes > max) {
    const message = `This takes about ${minutes} minutes, more than the ${max} you have on ${DAY_NAMES[weekday]}s.`;
    return { rule: "too_long", message };
  }
  return undefined;
}
