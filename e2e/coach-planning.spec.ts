import { expect, type Page, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };
const plus = (days: number) => {
  const date = new Date(`${new Date().toLocaleDateString("sv-SE")}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  const send = page.getByRole("button", { name: "Send" });
  await page.goto("/?c=new");
  await expect(async () => {
    await box.fill(text);
    await expect(send).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await send.click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 15_000 });
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL }]);
  await page.setViewportSize({ width: 412, height: 900 });
});

test("adds a block the coach proposed to a plan once approved", async ({ page }) => {
  test.setTimeout(60_000);
  // A plan far ahead, so it ends last and the mock coach picks it.
  await page.goto("/plans");
  const form = page.getByRole("region", { name: "New plan" });
  await form.getByLabel("Name").fill("Coach block plan");
  await form.getByLabel("Start").fill(plus(400));
  await form.getByLabel("End").fill(plus(500));
  await form.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Coach block plan" })).toBeVisible();

  await ask(page, "Plan a base block");
  const card = page.getByRole("article", { name: "Block: Mock base block" });
  await expect(card).toContainText("Mock block for Coach block plan");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByRole("status")).toContainText("Added to the plan.");
  await card.getByRole("link", { name: "See the plan" }).click();
  await expect(page.getByRole("region", { name: "Blocks" })).toContainText("Mock base block");
});

test("moves a planned workout when the athlete approves the change", async ({ page }) => {
  test.setTimeout(60_000);
  await ask(page, "Plan me a workout");
  const card = page.getByRole("article", { name: /^Workout: / }).last();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByRole("status")).toContainText("Approved");
  await page.goto("/calendar");
  const entry = page.getByRole("region", { name: "Not scheduled" }).getByRole("listitem").first();
  const title = await entry.getAttribute("aria-label");
  // A month ahead, so the weeks other tests plan are not affected.
  await entry.getByRole("button", { name: "Schedule" }).click();
  await entry.getByLabel("New date").fill(plus(30));
  await entry.getByRole("button", { name: "Save date" }).click();
  await expect(page.getByRole("region", { name: "Not scheduled" }).getByRole("listitem", { name: title! })).toHaveCount(0);

  await ask(page, "Please move my next run");
  const changes = page.getByRole("article", { name: "Proposed changes" });
  await expect(changes).toContainText("Move “");
  await changes.getByRole("button", { name: "Approve" }).click();
  await expect(changes.getByRole("status")).toContainText("Done.");
});
