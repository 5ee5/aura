// Run by plain node as well as tests: no "@/" imports.
import { execFile } from "node:child_process";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const NAME = /^aura-\d{4}-\d{2}-\d{2}T\d{6}Z\.dump$/;

/** Connection settings for pg_dump and friends, keeping the password off the command line. */
export function pgEnvironment(connectionString: string): NodeJS.ProcessEnv {
  const url = new URL(connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
}

/**
 * Writes a dump into an existing private folder and keeps the newest `keep`.
 * Older dumps are removed only once the new one has been written and read back.
 */
export async function backUp(connectionString: string, folder: string, keep: number, now = new Date()) {
  // Not created here: a missing folder usually means a missing disk.
  const info = await stat(folder);
  if (!info.isDirectory() || info.mode & 0o077) {
    throw new Error(`${folder} must be a folder only its owner can open (chmod 700)`);
  }

  const stamp = now.toISOString().replace(/:|\.\d{3}/g, "");
  const file = join(folder, `aura-${stamp}.dump`);
  const partial = `${file}.partial`;
  const env = pgEnvironment(connectionString);
  const previousMask = process.umask(0o077);
  try {
    await run("pg_dump", ["--format=custom", `--file=${partial}`], { env });
    await run("pg_restore", ["--list", partial], { env });
    await rename(partial, file);
  } finally {
    process.umask(previousMask);
    await rm(partial, { force: true });
  }

  const old = (await readdir(folder)).filter((name) => NAME.test(name)).sort();
  for (const name of old.slice(0, Math.max(0, old.length - keep))) await rm(join(folder, name));
  return file;
}
