import { expect, type Page, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };
const today = new Date().toLocaleDateString("sv-SE");

async function approveMockWorkout(page: Page) {
  const box = page.getByRole("textbox", { name: "Message" });
  const send = page.getByRole("button", { name: "Send" });
  await page.goto("/?c=new");
  await expect(async () => {
    await box.fill("Plan me a workout");
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 15_000 });
  await page.getByRole("button", { name: "Approve" }).last().click();
  await expect(page.getByRole("main").getByText("Approved", { exact: false }).last()).toBeVisible();
}

test("schedules an approved workout, marks it done and shows it by week and month", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL }]);
  await page.setViewportSize({ width: 412, height: 900 });
  await approveMockWorkout(page);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  const waiting = page.getByRole("region", { name: "Not scheduled" });
  const entry = waiting.getByRole("listitem", { name: "Easy run with strides" }).first();
  await entry.getByRole("button", { name: "Schedule" }).click();
  await entry.getByLabel("New date").fill(today);
  await entry.getByRole("button", { name: "Save date" }).click();

  const day = page.getByRole("listitem", { name: /\(today\)/ });
  const planned = day.getByRole("listitem", { name: "Easy run with strides" }).first();
  await expect(planned).toContainText("about");
  await planned.getByRole("button", { name: "Done" }).click();
  await expect(planned).toContainText("Done");
  await page.reload();
  await expect(day.getByRole("listitem", { name: "Easy run with strides" }).first()).toContainText("Done");

  // A past date is refused, and the workout stays put.
  await planned.getByRole("button", { name: "Move" }).click();
  await planned.getByLabel("New date").fill("2020-01-06");
  await planned.getByRole("button", { name: "Save date" }).click();
  await expect(planned.getByRole("alert")).toContainText("in the past");

  await page.getByRole("link", { name: "Month" }).click();
  await expect(page.getByRole("link", { name: /Easy run with strides/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/view=month&date=/);
});
