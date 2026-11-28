import { describe, expect, it } from "vitest";
import { syncDue } from "./auto-sync-timing";

const at = (hour: number, minute = 0) => new Date(2026, 10, 28, hour, minute);

describe("syncDue", () => {
  it("syncs in the daytime window when never synced", () => {
    expect(syncDue(at(6), undefined)).toBe(true);
    expect(syncDue(at(22, 59), undefined)).toBe(true);
  });

  it("never syncs overnight", () => {
    expect(syncDue(at(23), undefined)).toBe(false);
    expect(syncDue(at(3), undefined)).toBe(false);
    expect(syncDue(at(5, 59), at(0))).toBe(false);
  });

  it("waits two hours after the last attempt, failed or not", () => {
    expect(syncDue(at(10), at(8, 30))).toBe(false);
    expect(syncDue(at(10, 30), at(8, 30))).toBe(true);
    // The timer checks every ten minutes, so a minute early still counts.
    expect(syncDue(at(10, 29), at(8, 30))).toBe(true);
  });
});
