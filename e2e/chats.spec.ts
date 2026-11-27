import { expect, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/server/auth/session";
import { E2E_ENV } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

test("saves chats, reopens them and deletes them", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 412, height: 800 });

  const box = page.getByRole("textbox", { name: "Message" });
  const log = page.getByRole("region", { name: "Conversation" });
  const reply = log.locator("[data-from=coach]");
  const stop = page.getByRole("button", { name: "Stop" });
  const send = async (text: string) => {
    await box.fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  };

  // A finished reply. The address changes mid-stream without interrupting it.
  await page.goto("/?c=new");
  await send("First chat about hills");
  await expect(page).toHaveURL(/\?c=\d+$/);
  await expect(stop).toBeVisible();
  await expect(reply).toContainText("saved.", { timeout: 15_000 });
  const first = page.url();
  await page.reload();
  await expect(log).toContainText("First chat about hills");
  await expect(reply).toContainText("saved.");

  // Leaving and coming back keeps it, by the menu and by the back button.
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Profile" }).click();
  await nav.getByRole("link", { name: "Coach" }).click();
  await expect(log).toContainText("First chat about hills");

  // A second chat, stopped partway; the part is kept.
  await page.getByRole("link", { name: "New chat" }).click();
  await expect(log).not.toContainText("hills");
  await send("Second chat about tapering");
  await expect(reply).toContainText("canned mock reply");
  await stop.click();
  await expect(async () => {
    await page.reload();
    await expect(reply).toContainText("stopped");
    await expect(reply).toContainText("canned mock reply");
    await expect(reply).not.toContainText("saved.");
  }).toPass();

  // New chat again after the address was changed in place, then back.
  await page.getByRole("link", { name: "New chat" }).click();
  await send("Third chat");
  await expect(reply).toContainText("saved.", { timeout: 15_000 });
  await nav.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await page.goBack();
  await expect(log).toContainText("Third chat");

  await page.getByRole("link", { name: "Chats" }).click();
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items.filter({ hasText: "about tapering" })).toBeVisible();
  await items.filter({ hasText: "about hills" }).getByRole("link").click();
  await expect(page).toHaveURL(first);
  await expect(log).toContainText("First chat about hills");
  await expect(log).not.toContainText("tapering");

  await page.getByRole("link", { name: "Chats" }).click();
  await items.filter({ hasText: "about hills" }).getByRole("button", { name: "Delete" }).click();
  await expect(items.filter({ hasText: "about hills" })).toHaveCount(0);
  await page.reload();
  await expect(items.filter({ hasText: "about hills" })).toHaveCount(0);
  await page.goto("/chats");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  for (const gone of [first, "/?c=abc", "/?c=999999999"]) {
    await page.goto(gone);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});
