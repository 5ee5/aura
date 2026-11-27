import { describe, expect, it } from "vitest";
import { MOCK_REPLY, mockReply } from "./mock";

describe("mockReply", () => {
  it("streams the whole reply in pieces", async () => {
    const chunks = await Array.fromAsync(mockReply([{ role: "user", content: "hi" }], new AbortController().signal));
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.join("")).toBe(MOCK_REPLY);
  }, 15_000);

  it("stops producing when aborted", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    for await (const chunk of mockReply([{ role: "user", content: "hi" }], controller.signal)) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toHaveLength(1);
  });
});
