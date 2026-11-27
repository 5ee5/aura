import { scryptSync } from "node:crypto";
import { testDatabaseUrl } from "../src/server/db/test-database";

export const E2E_PORT = 3302;
export const E2E_PASSWORD = "e2e-only-password";

// Fixed salt and secret: test processes must agree on them. Not real credentials.
const salt = Buffer.alloc(16, 1);
const key = scryptSync(E2E_PASSWORD, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export const E2E_ENV = {
  APP_URL: `http://localhost:${E2E_PORT}`,
  AUTH_PASSWORD_HASH: `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`,
  SESSION_SECRET: "e2e-session-secret-".padEnd(43, "x"),
  // Always set, so the test server can never fall back to the one in .env.
  DATABASE_URL: testDatabaseUrl(),
};
