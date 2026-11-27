import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, formatDate, isDate, isoWeekday, monthWeeks, startOfWeek } from "./dates";

describe("dates", () => {
  it("does arithmetic across month, year and clock changes", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-28", 1)).toBe("2027-03-29");
    expect(daysBetween("2026-11-30", "2027-01-04")).toBe(35);
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-01");
  });

  it("starts weeks on Monday", () => {
    expect(isoWeekday("2026-11-29")).toBe(7);
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
    expect(startOfWeek("2026-11-30")).toBe("2026-11-30");
  });

  it("covers a month with whole weeks", () => {
    const weeks = monthWeeks("2027-02-10");
    expect(weeks[0]).toBe("2027-02-01");
    expect(weeks).toHaveLength(4);
    expect(monthWeeks("2026-11-01")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("checks and formats dates without shifting them", () => {
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2028-02-29")).toBe(true);
    expect(formatDate("2026-11-30", { weekday: "long", day: "numeric", month: "long" })).toBe("Monday 30 November");
  });
});
