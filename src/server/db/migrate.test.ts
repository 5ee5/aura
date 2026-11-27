import { existsSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";

// Wipes its database, so it only ever uses one whose name ends in "_test".
function testDatabaseUrl(): string {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "");
  if (!process.env.TEST_DATABASE_URL) url.pathname = "/aura_test";
  if (!url.pathname.endsWith("_test")) throw new Error("Refusing to wipe a non-test database");
  return url.href;
}

describe("migrations", () => {
  let client: pg.Client;

  beforeAll(async () => {
    const connectionString = testDatabaseUrl();
    client = new pg.Client({ connectionString });
    await client.connect();
    await client.query("drop schema if exists drizzle cascade");
    await client.query("drop schema public cascade");
    await client.query("create schema public");
    await runMigrations(connectionString);
    // A second run must find nothing to do.
    await runMigrations(connectionString);
  });

  afterAll(() => client.end());

  it("creates the athlete tables in a fresh database", async () => {
    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "athletes",
      "availability",
      "goals",
      "injuries",
      "personal_bests",
      "race_results",
    ]);
  });

  it("rejects impossible values and removes an athlete's rows with them", async () => {
    const { rows } = await client.query("insert into athletes (name) values ('Test') returning id");
    const id = rows[0].id;
    const insert = (sql: string) => client.query(sql, [id]);

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
