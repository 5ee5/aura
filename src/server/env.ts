import { z } from "zod";
import { PASSWORD_HASH_PATTERN } from "./auth/password";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.url({ protocol: /^https?$/ }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  AUTH_PASSWORD_HASH: z
    .string()
    .regex(PASSWORD_HASH_PATTERN, "Not set or malformed. Run: npm run set-password"),
  SESSION_SECRET: z.string().min(32, "At least 32 characters. Run: npm run set-password"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "Not a postgresql:// URL. See the README." }),
  // Without a key the coach is a labelled mock.
  ANTHROPIC_API_KEY: z.preprocess((value) => value || undefined, z.string().optional()),
  /** Garmin Connect Personal API key. Without one, Garmin sync is off. */
  GARMIN_API_KEY: z.preprocess((value) => value || undefined, z.string().optional()),
  /** "1" forces the mock even with a key, so tests can never spend money. */
  COACH_MOCK: z.string().optional(),
  COACH_DAILY_BUDGET_USD: z.preprocess(
    (value) => value || undefined,
    z.coerce.number("Enter dollars, for example 2.").positive().default(2),
  ),
});

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables. Error messages name variables, never their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}
