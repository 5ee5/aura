import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3300",
  AUTH_PASSWORD_HASH: `scrypt:${"a".repeat(22)}:${"b".repeat(43)}`,
  SESSION_SECRET: "s".repeat(43),
};

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      LOG_LEVEL: "info",
      NODE_ENV: "development",
    });
  });

  it.each(["APP_URL", "AUTH_PASSWORD_HASH", "SESSION_SECRET"] as const)(
    "rejects a missing %s",
    (name) => {
      expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(name);
    },
  );

  it("rejects a bad value without echoing it", () => {
    const parse = () => parseEnv({ ...valid, SESSION_SECRET: "hunter2" });
    expect(parse).toThrow(/SESSION_SECRET/);
    expect(parse).not.toThrow(/hunter2/);
  });
});
