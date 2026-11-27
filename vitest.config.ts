import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // One file at a time: database tests share aura_test.
  test: { include: ["src/**/*.test.ts"], fileParallelism: false },
});
