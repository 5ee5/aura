/** Runs once at server start, so a bad configuration stops the server. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/check-env");
    // Not while building: only a running server syncs.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { startAutoSync } = await import("@/server/garmin/auto-sync");
      startAutoSync();
    }
  }
}
