import { describe, expect, it } from "vitest";
import { normalizeE6aiApiBaseUrl } from "./e6aiBaseUrl";

describe("normalizeE6aiApiBaseUrl", () => {
  it("maps legacy e6ai.net to e926.net", () => {
    expect(normalizeE6aiApiBaseUrl("https://e6ai.net/")).toBe(
      "https://e926.net/",
    );
    expect(normalizeE6aiApiBaseUrl("https://www.e6ai.net")).toBe(
      "https://e926.net/",
    );
  });

  it("keeps e926 URLs", () => {
    expect(normalizeE6aiApiBaseUrl("https://e926.net/")).toBe(
      "https://e926.net/",
    );
  });
});