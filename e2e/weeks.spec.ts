import { expect, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

test("shows a proposed week, approves its workouts and puts them on the calendar", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL }]);
  await page.setViewportSize({ width: 412, height: 900 });
  const box = page.getByRole("textbox", { name: "Message" });
  const send = page.getByRole("button", { name: "Send" });
  await page.goto("/?c=new");
  await expect(async () => {
    await box.fill("Plan my week please");
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 15_000 });

  const card = page.getByRole("article", { name: /^Week from / });
  await expect(card).toContainText("Mock week, about 160 min");
  await expect(card).toContainText("Monday");
  await expect(card).toContainText(": Rest");
  await card.getByRole("button", { name: "Decline Long easy run" }).click();
  await expect(card).toContainText("Declined");
  await card.getByRole("button", { name: "Approve all 2" }).click();
  await expect(card.getByText("Approved")).toHaveCount(2);
  await expect(card.getByRole("link", { name: "See it on the calendar" })).toBeVisible();

  await page.reload();
  await expect(card.getByText("Approved")).toHaveCount(2);
  await card.getByRole("link", { name: "See it on the calendar" }).click();
  await expect(page.getByRole("listitem", { name: "Easy 40" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Steady progression" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Long easy run" })).toHaveCount(0);
});
