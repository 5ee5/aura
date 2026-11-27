import { expect, type Page, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("saves every part of the profile and keeps it after a reload", async ({ page, context }) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 412, height: 800 });
  await page.goto("/profile");

  const about = section(page, "About you");
  await about.getByLabel("Name").fill("Test Runner");
  await about.getByLabel("Tempo").check();
  await about.getByRole("button", { name: "Save about you" }).click();
  await expect(about.getByRole("status")).toHaveText("Saved");

  const week = section(page, "Weekly availability");
  await week.getByLabel("Monday minutes").fill("0");
  await week.getByLabel("Tuesday minutes").fill("60");
  await week.getByLabel("Tuesday notes").fill("track");
  await week.getByRole("button", { name: "Save availability" }).click();
  await expect(week.getByRole("status")).toHaveText("Saved");

  const goals = section(page, "Goals");
  await goals.getByText("Add goal", { exact: true }).first().click();
  await goals.getByLabel("Description").fill("Sub 3 marathon");
  await goals.getByLabel("Distance, km (optional)").fill("42.195");
  await goals.getByLabel("Target time (optional)").fill("2:59:00");
  await goals.getByRole("button", { name: "Add goal" }).click();
  await expect(goals.getByRole("listitem")).toContainText("42.195 km, target 2:59:00");
  await expect(goals.getByLabel("Description").last()).toHaveValue("");

  // A bad value says why, keeps what was typed and saves nothing.
  const bests = section(page, "Personal bests");
  await bests.getByText("Add best", { exact: true }).first().click();
  await bests.getByLabel("Distance, km").fill("5");
  await bests.getByLabel("Time").fill("fast");
  await bests.getByRole("button", { name: "Add best" }).click();
  await expect(bests.getByRole("alert")).toContainText("Time: Enter a time");
  await expect(bests.getByLabel("Distance, km")).toHaveValue("5");
  await expect(bests.getByRole("listitem")).toHaveCount(0);
  await bests.getByLabel("Time").fill("19:45");
  await bests.getByRole("button", { name: "Add best" }).click();
  await expect(bests.getByRole("listitem")).toContainText("5 km in 19:45");

  await bests.getByLabel("Distance, km").last().fill("5");
  await bests.getByLabel("Time").last().fill("20:00");
  await bests.getByRole("button", { name: "Add best" }).click();
  await expect(bests.getByRole("alert").last()).toContainText("already have a best");

  const races = section(page, "Race history");
  await races.getByText("Add race", { exact: true }).first().click();
  await races.getByLabel("Race name").fill("Riga 10K");
  await races.getByLabel("Date").fill("2026-05-17");
  await races.getByLabel("Distance, km").fill("10");
  await races.getByRole("button", { name: "Add race" }).click();
  await expect(races.getByRole("listitem")).toContainText("2026-05-17, 10 km road, did not finish");

  const injuries = section(page, "Injuries");
  await injuries.getByText("Add injury", { exact: true }).first().click();
  await injuries.getByLabel("Body area").fill("Left calf");
  await injuries.getByLabel("What happened").fill("Tight after hills");
  await injuries.getByLabel("Started").fill("2026-11-01");
  await injuries.getByRole("button", { name: "Add injury" }).click();
  await expect(injuries.getByRole("listitem")).toContainText("current, since 2026-11-01");

  await page.reload();
  await expect(about.getByLabel("Name")).toHaveValue("Test Runner");
  await expect(about.getByLabel("Tempo")).toBeChecked();
  await expect(week.getByLabel("Monday minutes")).toHaveValue("0");
  await expect(week.getByLabel("Tuesday notes")).toHaveValue("track");
  await expect(goals.getByRole("listitem")).toContainText("Sub 3 marathon");
  await expect(races.getByRole("listitem")).toContainText("Riga 10K");
  await expect(injuries.getByRole("listitem")).toContainText("Left calf");

  // Edit, then delete.
  const best = bests.getByRole("listitem");
  await best.locator("summary").click();
  await best.getByLabel("Time").fill("19:30");
  await best.getByRole("button", { name: "Save best" }).click();
  await expect(best.locator("summary")).toContainText("19:30");
  await best.getByRole("button", { name: "Delete best" }).click();
  await expect(bests.getByRole("listitem")).toHaveCount(0);
  await page.reload();
  await expect(bests).toContainText("No personal bests yet.");

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
