import { expect, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

test("summarises eight weeks of planned and done time", async ({ page, context }) => {
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL }]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/calendar");
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  const table = page.getByRole("table", { name: "Week by week" });
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(table.getByRole("rowheader").first()).toContainText("this week");
  await expect(page.getByText("Done, last 4 weeks", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
