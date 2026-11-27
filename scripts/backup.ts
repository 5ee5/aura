// Dumps the database into BACKUP_DIR. Run daily by ops/aura-backup.timer.
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backUp } from "../src/server/db/backup.ts";

const KEEP = 30;

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the README.`);
  return value;
}

try {
  // With BACKUP_MOUNT set, never fall back to the system disk when that drive is absent.
  const mount = process.env.BACKUP_MOUNT;
  if (mount && statSync(mount).dev === statSync(dirname(mount)).dev) {
    throw new Error(`Nothing is mounted at ${mount}`);
  }
  console.log(`Saved ${await backUp(need("DATABASE_URL"), need("BACKUP_DIR"), KEEP)}`);
} catch (error) {
  console.error("Backup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
