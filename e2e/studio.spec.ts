import { expect, type Page, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

async function proposeMockWorkout(page: Page) {
  const box = page.getByRole("textbox", { name: "Message" });
  const button = page.getByRole("button", { name: "Send" });
  await page.goto("/?c=new");
  await expect(async () => {
    await box.fill("Plan me a workout");
    await expect(button).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await button.click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 15_000 });
}

test("edits a workout's steps and approves it", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  await page.setViewportSize({ width: 412, height: 900 });
  await proposeMockWorkout(page);
  await page.getByRole("link", { name: "Edit Easy run with strides" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit workout" })).toBeVisible();

  const step = (name: string) => page.getByRole("group", { name, exact: true });
  await page.getByLabel("Title").fill("Easy run, edited");
  await step("Step 2").getByLabel("Kilometres").fill("6");
  // Move the cool-down above the repeat, and drop the warm-up.
  await page.getByRole("button", { name: "Move Step 4 up" }).click();
  await expect(step("Step 3").getByRole("combobox", { name: "Step 3", exact: true })).toHaveValue("cooldown");
  await page.getByRole("button", { name: "Remove Step 1" }).click();
  await expect(step("Step 1").getByRole("combobox", { name: "Step 1", exact: true })).toHaveValue("run");

  // A mistake is explained and nothing is lost.
  await step("Step 1").getByLabel("Fastest pace /km").fill("fast");
  await page.getByRole("button", { name: "Save and approve" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Step 1: pace “fast”");
  await expect(page.getByLabel("Title")).toHaveValue("Easy run, edited");
  await step("Step 1").getByLabel("Fastest pace /km").fill("5:20");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await step("Step 4").getByLabel("Minutes").fill("3");
  await page.getByRole("button", { name: "Save and approve" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Saved and approved.");
  await expect(page.getByRole("button", { name: "Save and approve" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Easy run, edited");
  await expect(step("Step 1").getByLabel("Kilometres")).toHaveValue("6");
  await expect(step("Step 4").getByLabel("Minutes")).toHaveValue("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  await page.getByRole("link", { name: "All workouts" }).click();
  const card = page.getByRole("article", { name: "Workout: Easy run, edited" });
  await expect(card).toContainText("Run: 6 km, 5:20–6:00/km, easy");
  await expect(card).toContainText("Run: 3 min");
  await expect(card.getByText("Cool-down: 5 min")).toBeVisible();

  // The chat's card shows the edited version too.
  await page.goBack();
  await page.goBack();
  await expect(card).toContainText("Run: 6 km");
});

test("refuses to open a workout that does not exist", async ({ page, context }) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  for (const path of ["/workouts/999999", "/workouts/abc"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});
