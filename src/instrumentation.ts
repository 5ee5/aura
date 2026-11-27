/** Runs once at server start, so a bad configuration stops the server. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/check-env");
  }
}
