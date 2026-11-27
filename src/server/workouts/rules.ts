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

/** Why the proposal breaks a rule, worded for the coach; undefined if it is allowed. */
export function breaksRule(proposal: Proposal, limits: Limits, today: string): string | undefined {
  if (limits.currentInjuries.length && HARD_TYPES.includes(proposal.type)) {
    return (
      `Rejected: the athlete has a current injury (${limits.currentInjuries.join(", ")}), so ` +
      `${WORKOUT_TYPES[proposal.type].toLowerCase()} sessions are not allowed. Suggest an easy ` +
      "or recovery run, cross-training or rest, and ask how the injury feels."
    );
  }
  const date = proposal.scheduledOn;
  if (!date) return undefined;
  if (date < today) return `Rejected: ${date} is in the past. Today is ${today}.`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const max = limits.maxMinutes.get(weekday);
  if (max === 0) return `Rejected: ${DAY_NAMES[weekday]} is the athlete's rest day. Pick another day.`;
  const minutes = Math.round(estimateMinutes(proposal.steps));
  if (max !== undefined && minutes > max) {
    return (
      `Rejected: this takes about ${minutes} minutes, but the athlete has at most ${max} on ` +
      `${DAY_NAMES[weekday]}s. Shorten it or pick another day.`
    );
  }
  return undefined;
}
