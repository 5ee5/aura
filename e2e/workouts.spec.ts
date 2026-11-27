import { expect, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

test("shows a proposed workout that can be approved or declined", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  await page.setViewportSize({ width: 412, height: 800 });
  const box = page.getByRole("textbox", { name: "Message" });
  const button = page.getByRole("button", { name: "Send" });
  const ask = async () => {
    await page.goto("/?c=new");
    await expect(async () => {
      await box.fill("Plan me a workout");
      await expect(button).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await button.click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 15_000 });
  };
  const card = page.getByRole("article", { name: "Workout: Easy run with strides" });

  await ask();
  await expect(card).toContainText("Repeat 4 times:");
  await expect(card).toContainText("Run: 20 s, fast, relaxed");
  await expect(card).toContainText("Run: 5 km, 5:30–6:00/km, easy");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByRole("status")).toHaveText("Approved. See your workouts");
  await page.reload();
  await expect(card.getByRole("status")).toContainText("Approved");
  await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await ask();
  await card.getByRole("button", { name: "Decline" }).click();
  await expect(card.getByRole("status")).toHaveText("Declined");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Workouts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Workouts" })).toBeVisible();
  // Other tests add workouts too, so count only this one: approved once, declined once.
  await expect(page.getByRole("article", { name: "Workout: Easy run with strides" })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
