export const BLOCK_FOCUSES = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
  recovery: "Recovery",
  race: "Race",
} as const;
export type BlockFocus = keyof typeof BLOCK_FOCUSES;
export const BLOCK_FOCUS_KEYS = Object.keys(BLOCK_FOCUSES) as [BlockFocus, ...BlockFocus[]];

export interface Block {
  id: number;
  planId: number;
  name: string;
  focus: BlockFocus;
  startOn: string;
  endOn: string;
  weeklyMinutes: number | null;
  notes: string | null;
}

export interface Plan {
  id: number;
  name: string;
  goalId: number | null;
  startOn: string;
  endOn: string;
  notes: string | null;
  blocks: Block[];
}

/** A block the coach proposed, waiting for the athlete or decided. */
export interface BlockProposal extends Block {
  planName: string;
  status: "proposed" | "approved" | "declined";
  mock: boolean;
}

export interface Change {
  workoutId: number;
  title: string;
  action: "move" | "cancel";
  from: string | null;
  to: string | null;
}

/** Changes to approved workouts, proposed together. */
export interface ChangeSet {
  id: number;
  summary: string;
  changes: Change[];
  status: "proposed" | "approved" | "declined";
  mock: boolean;
}

export function summarizeBlock(block: BlockProposal): string {
  const status = { proposed: "not decided yet", approved: "approved", declined: "declined" }[block.status];
  return (
    `[Block proposal for plan "${block.planName}": "${block.name}", ${block.focus}, ${block.startOn} to ` +
    `${block.endOn}${block.weeklyMinutes === null ? "" : `, about ${block.weeklyMinutes} min a week`}; ${status}.]`
  );
}

export function describeChange(change: Change): string {
  if (change.action === "cancel") return `Cancel “${change.title}”${change.from ? ` on ${change.from}` : ""}`;
  return `Move “${change.title}” from ${change.from ?? "no date"} to ${change.to ?? "no date"}`;
}

export function summarizeChanges(set: ChangeSet): string {
  const status = { proposed: "not decided yet", approved: "applied", declined: "declined" }[set.status];
  return [`[Proposed changes: ${set.summary}; ${status}.]`, ...set.changes.map((c) => `  #${c.workoutId}: ${describeChange(c)}`)].join("\n");
}
