import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getEnv } from "@/server/env";

// Kept on globalThis so that reloading in development does not open more pools.
const store = globalThis as { auraDb?: NodePgDatabase };

/** Connects on first use, so building the app needs no database. */
export function getDb(): NodePgDatabase {
  if (!store.auraDb) {
    const pool = new pg.Pool({ connectionString: getEnv().DATABASE_URL, max: 5 });
    // Without a listener, a dropped idle connection would end the process.
    pool.on("error", (error) => console.error("Database connection lost:", error.message));
    store.auraDb = drizzle(pool);
  }
  return store.auraDb;
}
