// For tests only. Relative imports: Playwright loads this too.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";
import { runMigrations } from "./migrate.ts";

/** The throwaway database: aura_test beside the one in .env. Never any other. */
export function testDatabaseUrl(): string {
  let given = process.env.TEST_DATABASE_URL;
  if (!given) {
    // Read, not loaded: the real DATABASE_URL must not enter this process.
    const file = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
    const url = new URL(file.DATABASE_URL ?? "");
    url.pathname = "/aura_test";
    given = url.href;
  }
  if (!new URL(given).pathname.endsWith("_test")) {
    throw new Error("Refusing to wipe a database whose name does not end in _test");
  }
  return given;
}

/** Empties the test database and migrates it from nothing. */
export async function resetTestDatabase(): Promise<void> {
  const connectionString = testDatabaseUrl();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("drop schema if exists drizzle cascade");
    await client.query("drop schema public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
  await runMigrations(connectionString);
}
