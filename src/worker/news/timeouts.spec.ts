import { describe, expect, it } from "vitest";
import { NEWS_RSS_TIMEOUT_MS, newsRssAbortSignal } from "./timeouts";

describe("news RSS timeouts", () => {
  it("uses a short per-source budget", () => {
    expect(NEWS_RSS_TIMEOUT_MS).toBe(5_000);
  });

  it("builds an abort signal that fires within the budget", async () => {
    const signal = newsRssAbortSignal();
    expect(signal.aborted).toBe(false);
    await new Promise<void>((resolve, reject) => {
      const fail = setTimeout(
        () => reject(new Error("signal did not abort in time")),
        NEWS_RSS_TIMEOUT_MS + 1500,
      );
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(fail);
          resolve();
        },
        { once: true },
      );
    });
    expect(signal.aborted).toBe(true);
  }, 10_000);
});
