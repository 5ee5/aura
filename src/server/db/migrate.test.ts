import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { resetTestDatabase, testDatabaseUrl } from "./test-database";

describe("migrations", () => {
  let client: pg.Client;

  beforeAll(async () => {
    await resetTestDatabase();
    // A second run must find nothing to do.
    await runMigrations(testDatabaseUrl());
    client = new pg.Client({ connectionString: testDatabaseUrl() });
    await client.connect();
  });

  afterAll(() => client.end());

  it("creates the athlete tables in a fresh database", async () => {
    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "athletes",
      "availability",
      "change_proposals",
      "coach_conversations",
      "coach_messages",
      "coach_usage",
      "garmin_snapshots",
      "goals",
      "injuries",
      "personal_bests",
      "planned_workouts",
      "race_results",
      "training_blocks",
      "training_plans",
      "week_proposals",
      "workout_steps",
    ]);
  });

  it("rejects impossible values and removes an athlete's rows with them", async () => {
    const { rows } = await client.query("insert into athletes (name) values ('Test') returning id");
    const id = rows[0].id;
    const insert = (sql: string) => client.query(sql, [id]);

    await expect(client.query("insert into athletes (name) values ('Second')")).rejects.toThrow(
      "athletes_only_one",
    );
    await expect(
      insert("insert into availability (athlete_id, weekday, max_minutes) values ($1, 8, 60)"),
    ).rejects.toThrow("availability_weekday_range");
    await expect(
      insert(`insert into injuries (athlete_id, body_area, description, started_on, resolved_on)
              values ($1, 'knee', 'x', '2026-02-01', '2026-01-01')`),
    ).rejects.toThrow("injuries_dates_ordered");
    await expect(
      insert("insert into personal_bests (athlete_id, distance_m, time_s) values ($1, 5000, 1200)"),
    ).rejects.toThrow("source");

    await insert(`insert into personal_bests (athlete_id, distance_m, time_s, source)
                  values ($1, 5000, 1200.5, 'reported')`);
    await insert("delete from athletes where id = $1");
    const left = await client.query("select count(*)::int as n from personal_bests");
    expect(left.rows[0].n).toBe(0);
  });
});
