import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./e2e/env";

// Tests the production build with throwaway credentials, never the real ones.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  use: { baseURL: `http://localhost:${E2E_PORT}` },
  projects: [{ name: "desktop", use: devices["Desktop Chrome"] }],
  webServer: {
    command: `next start -H 127.0.0.1 -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    env: E2E_ENV,
    reuseExistingServer: false,
  },
});
