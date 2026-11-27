// Brings the database in DATABASE_URL (environment or .env) up to date.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../src/server/db/migrate.ts";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See the README.");
  process.exit(1);
}

await runMigrations(url);
console.log("Database is up to date.");
