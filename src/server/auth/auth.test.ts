import { describe, expect, it } from "vitest";
import { hashPassword, PASSWORD_HASH_PATTERN, verifyPassword } from "./password";
import { createRateLimiter } from "./rate-limit";
import { createSessionToken, SESSION_SECONDS, verifySessionToken } from "./session";

describe("password", () => {
  it("verifies only the right password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(PASSWORD_HASH_PATTERN);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterz", hash)).toBe(false);
    expect(await verifyPassword("correct horse battery", "junk")).toBe(false);
  });
});

describe("session token", () => {
  const keys = { secret: "s".repeat(43), passwordHash: "hash-one" };
  const now = 1_800_000_000_000;
  const token = createSessionToken(keys, now);

  it("is valid until it expires", () => {
    const end = now + SESSION_SECONDS * 1000;
    expect(verifySessionToken(token, keys, end - 1)).toBe(true);
    expect(verifySessionToken(token, keys, end)).toBe(false);
  });

  it("rejects tampering, other keys and junk", () => {
    const [version, expires, signature] = token.split(".");
    const later = `${version}.${Number(expires) + 1}.${signature}`;
    expect(verifySessionToken(later, keys, now)).toBe(false);
    expect(verifySessionToken(token, { ...keys, secret: "t".repeat(43) }, now)).toBe(false);
    expect(verifySessionToken(token, { ...keys, passwordHash: "hash-two" }, now)).toBe(false);
    expect(verifySessionToken(undefined, keys, now)).toBe(false);
    expect(verifySessionToken("v1.1.x", keys, now)).toBe(false);
  });
});

describe("rate limiter", () => {
  it("limits each key and recovers after the window", () => {
    const limiter = createRateLimiter({ perKey: 2, total: 10, windowMs: 1000 });
    expect([1, 2, 3].map(() => limiter.attempt("a", 0))).toEqual([true, true, false]);
    expect(limiter.attempt("b", 0)).toBe(true);
    expect(limiter.attempt("a", 1000)).toBe(true);
  });

  it("caps attempts across all keys", () => {
    const limiter = createRateLimiter({ perKey: 5, total: 2, windowMs: 1000 });
    expect(["a", "b", "c"].map((key) => limiter.attempt(key, 0))).toEqual([true, true, false]);
  });

  it("forgets a key on clear", () => {
    const limiter = createRateLimiter({ perKey: 1, total: 10, windowMs: 1000 });
    limiter.attempt("a", 0);
    limiter.clear("a");
    expect(limiter.attempt("a", 0)).toBe(true);
  });
});
