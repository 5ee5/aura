import { setTimeout as sleep } from "node:timers/promises";

/** What a coach is: text arriving in pieces, until done or aborted. */
export type CoachReply = (message: string, signal: AbortSignal) => AsyncIterable<string>;

export const MOCK_REPLY =
  "This is a canned mock reply. No coach is connected yet, and nothing here is " +
  "training advice. It arrives a few words at a time so you can check how streaming " +
  "looks and try the Stop button. Your message reached the server, but it was not " +
  "read, analysed or saved.";

/** Stands in for Claude. Ignores the message. */
export const mockReply: CoachReply = async function* (_message, signal) {
  for (const word of MOCK_REPLY.split(/(?<= )/)) {
    try {
      await sleep(80, undefined, { signal });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
    yield word;
  }
};
