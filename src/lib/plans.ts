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
