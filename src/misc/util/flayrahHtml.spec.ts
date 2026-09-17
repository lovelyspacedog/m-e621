import { describe, expect, it } from "vitest";
import {
  absolutizeFlayrahUrl,
  proxyDownloadUrl,
  sanitizeFlayrahHtml,
} from "./flayrahHtml";

describe("absolutizeFlayrahUrl", () => {
  it("handles protocol-relative and site-relative", () => {
    expect(absolutizeFlayrahUrl("//www.flayrah.com/x")).toBe(
      "https://www.flayrah.com/x",
    );
    expect(absolutizeFlayrahUrl("/sites/default/files/a.jpg")).toBe(
      "https://www.flayrah.com/sites/default/files/a.jpg",
    );
  });

  it("rejects javascript urls", () => {
    expect(absolutizeFlayrahUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("sanitizeFlayrahHtml", () => {
  it("strips script and event handlers", () => {
    const html = sanitizeFlayrahHtml(
      `<p onclick="evil()">Hi</p><script>alert(1)</script><img src="https://www.flayrah.com/a.jpg" onerror="x">`,
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Hi");
  });

  it("proxies flayrah images through /api/download", () => {
    const html = sanitizeFlayrahHtml(
      `<img src="//www.flayrah.com/sites/default/files/u/x.png">`,
    );
    expect(html).toContain("/api/download?url=");
    expect(html).toContain(encodeURIComponent("https://www.flayrah.com/sites/default/files/u/x.png"));
  });

  it("rejects javascript links", () => {
    const html = sanitizeFlayrahHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/href=["']javascript/i);
  });

  it("keeps http links with noopener", () => {
    const html = sanitizeFlayrahHtml(
      `<a href="https://example.com/story">read</a>`,
    );
    expect(html).toContain('href="https://example.com/story"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });
});

describe("proxyDownloadUrl", () => {
  it("encodes the upstream url", () => {
    expect(proxyDownloadUrl("https://www.flayrah.com/a.jpg")).toContain(
      "url=https%3A%2F%2Fwww.flayrah.com%2Fa.jpg",
    );
  });
});
