import { describe, expect, it } from "vitest";
import { describeDownloadProxyFailure } from "./mediaProxy";

describe("describeDownloadProxyFailure", () => {
  it("maps allowlist rejections to blocked", () => {
    expect(
      describeDownloadProxyFailure(400, JSON.stringify({ ok: false, message: "url not allowed" })),
    ).toMatchObject({
      kind: "blocked",
      message: "Media proxy blocked host (not allowlisted)",
    });
    expect(describeDownloadProxyFailure(400, "host not allowed").kind).toBe(
      "blocked",
    );
  });

  it("maps 5xx to network", () => {
    expect(
      describeDownloadProxyFailure(502, JSON.stringify({ ok: false, message: "too many redirects" })),
    ).toMatchObject({
      kind: "network",
      message: "Media proxy network error: too many redirects",
    });
  });
});
