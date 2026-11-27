// The propose_week tool: check every workout and the week as a whole, then save it.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WeekPlan } from "../../lib/workout";
import type { ToolOutcome } from "../coach/types";
import { checkSchedule, planned } from "./check-schedule";
import { breaksRule, type Limits } from "./rules";
import type { Link } from "./store";
import { getWeek, readWeek, saveWeek } from "./weeks";

export async function proposeWeek(
  db: NodePgDatabase,
  input: unknown,
  limits: () => Promise<Limits>,
  link: Link,
  today: string,
): Promise<{ outcome: ToolOutcome; week?: WeekPlan }> {
  const reject = (reason: string) => ({ outcome: { content: `Rejected by a rule in the app: ${reason}`, is_error: true } });
  const week = readWeek(input);
  if (typeof week === "string") return { outcome: { content: week, is_error: true } };
  const rules = await limits();
  const proposals = week.days.flatMap((day) => (day.proposal ? [day.proposal] : []));
  for (const proposal of proposals) {
    const broken = breaksRule(proposal, rules, today);
    if (broken) return reject(`${proposal.scheduledOn}: ${broken.message}`);
  }
  const clash = await checkSchedule(db, proposals.map((p) => planned(p, p.scheduledOn!)), rules);
  if (clash) return reject(clash);

  const id = await saveWeek(db, week, link);
  const saved = (await getWeek(db, id))!;
  const cards = saved.days.flatMap((day) => day.workouts.map((w) => `#${w.id} on ${day.date}`));
  return {
    week: saved,
    outcome: {
      content:
        `Shown to the athlete as a week card with workouts ${cards.join(", ")}. Each is approved ` +
        "or declined on its own; none is approved yet. Do not repeat the plan; add anything " +
        "they should know. To change one workout, use propose_workout with replaces set to its number.",
    },
  };
}
