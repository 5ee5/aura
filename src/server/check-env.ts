import { parseEnv } from "./env";

// Next.js keeps serving errors if instrumentation throws, so exit instead.
try {
  parseEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
