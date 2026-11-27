import { expect, type Page, test } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE, SESSION_SECONDS } from "../src/server/auth/session";
import { E2E_ENV, E2E_PASSWORD, E2E_PORT } from "./env";

const keys = { secret: E2E_ENV.SESSION_SECRET, passwordHash: E2E_ENV.AUTH_PASSWORD_HASH };

async function signIn(page: Page, password: string) {
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signs in, stays signed in and signs out", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, E2E_PASSWORD);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const [cookie] = await context.cookies();
  expect(cookie).toMatchObject({ name: SESSION_COOKIE, httpOnly: true, sameSite: "Lax" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("rejects a wrong password, then limits repeated attempts", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": "203.0.113.7" });
  await page.goto("/login");
  const alert = page.locator("form [role=alert]");

  for (let attempt = 0; attempt < 5; attempt++) {
    await signIn(page, "wrong password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expect(alert).toHaveText("Incorrect password.");
  }
  await signIn(page, E2E_PASSWORD);
  await expect(alert).toContainText("Too many attempts");
  await expect(page).toHaveURL(/\/login$/);
});

test("refuses unauthenticated, tampered and expired requests", async ({ request }) => {
  const expired = createSessionToken(keys, Date.now() - (SESSION_SECONDS + 60) * 1000);
  const tampered = `${createSessionToken(keys).slice(0, -2)}AA`;

  for (const token of [undefined, expired, tampered]) {
    const headers = token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined;
    for (const path of ["/", "/?c=1", "/chats", "/workouts", "/workouts/1", "/calendar", "/profile", "/anything", "/page.png"]) {
      const response = await request.get(path, { headers, maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/login");
    }
    const api = await request.get("/api/anything", { headers, maxRedirects: 0 });
    expect(api.status()).toBe(401);
  }
});

test("moves between sections and marks the current one", async ({ page }) => {
  await page.context().addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });

  for (const [name, path] of [["Profile", "/profile"], ["Coach", "/"]] as const) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(E2E_ENV.APP_URL + path);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(nav.locator("[aria-current=page]")).toHaveText(name);
  }
});

test("streams a mock reply that can be stopped", async ({ page, context }) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: createSessionToken(keys), url: E2E_ENV.APP_URL },
  ]);
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Message" });
  const reply = page.locator("[data-from=coach]").last();
  const stop = page.getByRole("button", { name: "Stop" });

  await box.fill("How was my week?");
  await box.press("Enter");
  // Part of the reply is on screen while it is still arriving.
  await expect(reply).toContainText("canned mock reply");
  await expect(reply).not.toContainText("saved.");
  await stop.click();
  await expect(reply).toContainText("stopped");
  await expect(stop).toBeHidden();
  const frozen = await reply.innerText();
  await page.waitForTimeout(500);
  expect(await reply.innerText()).toBe(frozen);

  await box.fill("Again");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(reply).toContainText("saved.", { timeout: 15_000 });
  await expect(stop).toBeHidden();


  // On a phone only the conversation scrolls, and the box clears the tabs.
  // The short height is roughly what is left with a keyboard open.
  // 320 is the narrowest phone the top bar has to fit.
  for (const [width, height] of [[412, 780], [412, 420], [320, 600]] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => {
        const main = document.querySelector("main")!;
        return [
          document.documentElement.scrollHeight - window.innerHeight,
          main.scrollWidth - main.clientWidth,
        ];
      }),
    ).toEqual([0, 0]);
    const input = await box.boundingBox();
    expect(input!.y + input!.height).toBeLessThanOrEqual(height);
    const tabs = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    expect(tabs!.y + tabs!.height).toBeLessThan(input!.y);
    expect(tabs!.x + tabs!.width).toBeLessThanOrEqual(width);
  }
});

test("refuses chat requests from signed-out visitors and other sites", async ({ request }) => {
  const data = { message: "hi" };
  const cookie = `${SESSION_COOKIE}=${createSessionToken(keys)}`;
  const post = (headers: Record<string, string>) => request.post("/api/coach", { data, headers });

  expect((await post({ origin: E2E_ENV.APP_URL })).status()).toBe(401);
  expect((await post({ cookie })).status()).toBe(403);
  expect((await post({ cookie, origin: "https://other.example" })).status()).toBe(403);
  const ok = await post({ cookie, origin: E2E_ENV.APP_URL, "accept-encoding": "gzip" });
  expect(ok.headers()["content-type"]).toContain("text/event-stream");
  expect(ok.headers()["content-encoding"]).toBeUndefined();
  expect(await ok.text()).toContain('data: {"done":true}');
});

test("does not leak the internal address when proxied", async ({ request }) => {
  const response = await request.get("/", {
    headers: { host: "aura.example" },
    maxRedirects: 0,
  });
  expect(response.headers().location).not.toContain(String(E2E_PORT));
});
