// Prompts for the login password and stores its hash in .env.
// The password is never echoed, logged or passed as an argument.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "../src/server/auth/password.ts";

if (!process.stdin.isTTY) {
  console.error("Run this in your own terminal: it needs to prompt for the password.");
  process.exit(1);
}

let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: true });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    muted = false;
    prompt.question(question, (answer) => {
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const password = await ask("New password: ");
const repeat = await ask("Repeat it: ");
prompt.close();

if (!password || password !== repeat) {
  console.error(password !== repeat ? "The passwords do not match." : "The password is empty.");
  process.exit(1);
}

const path = new URL("../.env", import.meta.url);
let text = existsSync(path) ? readFileSync(path, "utf8") : "";

function set(name: string, value: string): void {
  const line = `${name}=${value}`;
  const existing = new RegExp(`^${name}=.*$`, "m");
  text = existing.test(text) ? text.replace(existing, line) : `${text.trimEnd()}\n${line}\n`;
}

set("AUTH_PASSWORD_HASH", await hashPassword(password));
if (!/^SESSION_SECRET=.{32,}$/m.test(text)) {
  set("SESSION_SECRET", randomBytes(32).toString("base64url"));
}
writeFileSync(path, text, { mode: 0o600 });
chmodSync(path, 0o600);
console.log("Saved to .env. Restart the app to apply it: pm2 restart aura");
