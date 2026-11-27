import { defineConfig } from "drizzle-kit";

// No credentials on purpose: drizzle-kit only writes SQL, scripts/migrate.ts applies it.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
