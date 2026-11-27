import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = parseEnv({ APP_URL: "http://localhost:3300" });
    expect(env).toEqual({
      APP_URL: "http://localhost:3300",
      LOG_LEVEL: "info",
      NODE_ENV: "development",
    });
  });

  it("rejects a missing APP_URL", () => {
    expect(() => parseEnv({})).toThrow(/APP_URL/);
  });

  it("rejects a non-web APP_URL without echoing its value", () => {
    const parse = () => parseEnv({ APP_URL: "ftp://user:hunter2@host" });
    expect(parse).toThrow(/APP_URL/);
    expect(parse).not.toThrow(/hunter2/);
  });
});
