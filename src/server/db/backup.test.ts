import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backUp, pgEnvironment } from "./backup";
import { resetTestDatabase, testDatabaseUrl } from "./test-database";

describe("backUp", () => {
  const folder = mkdtempSync(join(tmpdir(), "aura-backup-"));
  const url = testDatabaseUrl();
  const day = (n: number) => new Date(Date.UTC(2026, 0, n, 3, 30));

  async function query(sql: string) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return await client.query(sql);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await resetTestDatabase();
    await query("insert into athletes (name) values ('Kept')");
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it("writes a private dump that restores the data", async () => {
    const file = await backUp(url, folder, 5, day(1));
    expect(file.endsWith("aura-2026-01-01T033000Z.dump")).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);

    await query("delete from athletes");
    const env = pgEnvironment(url);
    execFileSync("pg_restore", ["--clean", "--if-exists", `--dbname=${env.PGDATABASE}`, file], { env });
    expect((await query("select name from athletes")).rows).toEqual([{ name: "Kept" }]);
  });

  it("keeps the newest dumps and leaves other files alone", async () => {
    writeFileSync(join(folder, "notes.txt"), "mine");
    for (const n of [2, 3, 4]) await backUp(url, folder, 2, day(n));
    expect(readdirSync(folder).sort()).toEqual([
      "aura-2026-01-03T033000Z.dump",
      "aura-2026-01-04T033000Z.dump",
      "notes.txt",
    ]);
  });

  it("removes nothing when a dump fails", async () => {
    const before = readdirSync(folder).sort();
    const broken = new URL(url);
    broken.password = "wrong";
    await expect(backUp(broken.href, folder, 1, day(5))).rejects.toThrow();
    expect(readdirSync(folder).sort()).toEqual(before);
  });

  it("refuses a folder others can open", async () => {
    chmodSync(folder, 0o755);
    await expect(backUp(url, folder, 2, day(6))).rejects.toThrow("chmod 700");
    chmodSync(folder, 0o700);
  });
});
