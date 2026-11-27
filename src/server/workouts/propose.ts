// The propose_workout tool: check the proposal, then save it for the athlete to decide.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StatusChange, Workout } from "../../lib/workout";
import type { ToolOutcome } from "../coach/types";
import { readProposal } from "./proposal";
import { breaksRule, type Limits } from "./rules";
import { canReplace, getWorkout, type Link, saveProposal } from "./store";

export async function proposeWorkout(
  db: NodePgDatabase,
  input: unknown,
  limits: () => Promise<Limits>,
  link: Link,
  today: string,
): Promise<{ outcome: ToolOutcome; workout?: Workout; changes?: StatusChange[] }> {
  const proposal = readProposal(input);
  if (typeof proposal === "string") return { outcome: { content: proposal, is_error: true } };
  const problem = breaksRule(proposal, await limits(), today);
  if (problem) return { outcome: { content: problem, is_error: true } };
  if (proposal.replacesId !== null && !(await canReplace(db, proposal.replacesId, link.conversationId))) {
    const content = `There is no current workout #${proposal.replacesId} in this chat. Propose it as new, with replaces null.`;
    return { outcome: { content, is_error: true } };
  }
  const { id, changes } = await saveProposal(db, proposal, link);
  const replaced = proposal.replacesId === null ? "" : ` It replaces #${proposal.replacesId} if approved.`;
  return {
    workout: await getWorkout(db, id),
    changes,
    outcome: {
      content:
        `Shown to the athlete as workout card #${id}, with Approve and Decline.${replaced} ` +
        "It is not approved yet. Do not repeat its steps; add anything they should know.",
    },
  };
}
