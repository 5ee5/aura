const control = "w-full min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2 text-base text-foreground";

interface Goal {
  id: number;
  description: string;
  raceName: string | null;
  raceDate: string | null;
}

/** Which goal a plan leads to, if any. */
export function GoalSelect({ goals, value }: { goals: Goal[]; value?: number | null }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
      Goal (optional)
      <select name="goalId" defaultValue={value ?? ""} className={control}>
        <option value="">None</option>
        {goals.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.raceName ? `${goal.raceName}${goal.raceDate ? `, ${goal.raceDate}` : ""}` : goal.description}
          </option>
        ))}
      </select>
    </label>
  );
}
