// Kept apart from schedule-summary.ts, which is server-only.
export const GET_SCHEDULE_TOOL = {
  name: "get_schedule",
  description:
    "Read the athlete's calendar between two dates (at most 8 weeks): approved workouts with " +
    "their minutes and whether they were done or skipped, rest days, available minutes, race " +
    "dates, training blocks and weekly totals. Call it before proposing a week or changes, " +
    "and when asked about the plan. Read only.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD" },
      to: { type: "string", description: "YYYY-MM-DD, at most 56 days after from" },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },
} as const;
