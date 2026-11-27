import { expect, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };
const today = new Date().toLocaleDateString("sv-SE");
// Days from this week's Monday, as blocks usually start on a Monday.
const plus = (days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test("creates a plan with blocks and shows the current block on the calendar", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL }]);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 412, height: 900 });

  await page.goto("/calendar");
  await page.getByRole("link", { name: "Plans" }).click();
  const form = page.getByRole("region", { name: "New plan" });
  await form.getByLabel("Name").fill("Test marathon plan");
  await form.getByLabel("Start").fill(plus(-14));
  await form.getByLabel("End").fill(plus(70));
  await form.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test marathon plan" })).toBeVisible();

  const blocks = page.getByRole("region", { name: "Blocks" });
  const add = async (name: string, focus: string, start: number, end: number) => {
    const adding = blocks.locator("details").last();
    // The form stays open after adding, so open it only when closed.
    if ((await adding.getAttribute("open")) === null) await adding.locator("summary").click();
    await adding.getByLabel("Name").fill(name);
    await adding.getByLabel("Focus").selectOption(focus);
    await adding.getByLabel("Start").fill(plus(start));
    await adding.getByLabel("End").fill(plus(end));
    await adding.getByLabel("Weekly minutes (optional)").fill("240");
    await adding.getByRole("button", { name: "Add block" }).click();
    return adding;
  };
  await add("Base 1", "base", -14, 13);
  await expect(blocks.getByRole("listitem")).toHaveCount(1);
  const clash = await add("Too early", "build", 7, 20);
  await expect(clash.getByRole("alert")).toContainText("overlaps “Base 1”");
  await clash.getByLabel("Start").fill(plus(14));
  await clash.getByRole("button", { name: "Add block" }).click();
  await expect(blocks.getByRole("listitem")).toHaveCount(2);

  await page.goto("/calendar");
  const band = page.getByRole("list", { name: "Training blocks" });
  await expect(band).toContainText("Base 1");
  await expect(band).toContainText("Test marathon plan");
  await expect(band).toContainText(/week 3 of 4/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  await band.getByRole("link", { name: "Base 1" }).click();
  await page.getByRole("button", { name: "Delete plan" }).click();
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByRole("link", { name: "Test marathon plan" })).toHaveCount(0);
});
