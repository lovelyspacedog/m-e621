import { describe, expect, it } from "vitest";
import {
  absolutizeNewsUrl,
  proxyDownloadUrl,
  sanitizeNewsHtml,
} from "./newsHtml";

describe("absolutizeNewsUrl", () => {
  it("handles protocol-relative and site-relative", () => {
    expect(absolutizeNewsUrl("//www.flayrah.com/x", "flayrah")).toBe(
      "https://www.flayrah.com/x",
    );
    expect(absolutizeNewsUrl("/sites/default/files/a.jpg", "flayrah")).toBe(
      "https://www.flayrah.com/sites/default/files/a.jpg",
    );
  });

  it("rejects javascript urls", () => {
    expect(absolutizeNewsUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("sanitizeNewsHtml", () => {
  it("strips script and event handlers", () => {
    const html = sanitizeNewsHtml(
      `<p onclick="evil()">Hi</p><script>alert(1)</script><img src="https://www.flayrah.com/a.jpg" onerror="x">`,
      "flayrah",
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Hi");
  });

  it("proxies flayrah images through /api/download", () => {
    const html = sanitizeNewsHtml(
      `<img src="//www.flayrah.com/sites/default/files/u/x.png">`,
      "flayrah",
    );
    expect(html).toContain("/api/download?url=");
    expect(html).toContain(
      encodeURIComponent("https://www.flayrah.com/sites/default/files/u/x.png"),
    );
  });

  it("proxies dogpatch images through /api/download", () => {
    const html = sanitizeNewsHtml(
      `<img src="https://dogpatch.press/wp-content/uploads/x.jpg">`,
      "dogpatch",
    );
    expect(html).toContain("/api/download?url=");
  });

  it("rejects javascript links", () => {
    const html = sanitizeNewsHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/href=["']javascript/i);
  });

  it("keeps http links with noopener", () => {
    const html = sanitizeNewsHtml(
      `<a href="https://example.com/story">read</a>`,
    );
    expect(html).toContain('href="https://example.com/story"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });

  it("replaces iframes with an outbound embed link", () => {
    const html = sanitizeNewsHtml(
      `<p>Lead</p><iframe src="https://www.youtube.com/embed/abc"></iframe>`,
      "dogpatch",
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Open embed on Dogpatch Press");
    expect(html).toContain('href="https://www.youtube.com/embed/abc"');
    expect(html).toContain("noopener");
  });

  it("proxies custom feed host images through /api/news/custom/media", () => {
    const html = sanitizeNewsHtml(
      `<img src="https://blog.example.com/pic.jpg">`,
      {
        source: "custom:c_test01",
        articleUrl: "https://blog.example.com/post/1",
        feedUrl: "https://blog.example.com/feed/",
      },
    );
    expect(html).toContain("/api/news/custom/media?");
    expect(html).toContain(encodeURIComponent("https://blog.example.com/pic.jpg"));
    expect(html).toContain("allow=blog.example.com");
  });

  it("leaves off-host https images as direct urls for custom feeds", () => {
    const html = sanitizeNewsHtml(
      `<img src="https://cdn.other.com/x.png">`,
      {
        source: "custom:c_test01",
        articleUrl: "https://blog.example.com/post/1",
        feedUrl: "https://blog.example.com/feed/",
      },
    );
    expect(html).not.toContain("/api/news/custom/media");
    expect(html).toContain('src="https://cdn.other.com/x.png"');
  });
});

describe("proxyDownloadUrl", () => {
  it("encodes the upstream url", () => {
    expect(proxyDownloadUrl("https://www.flayrah.com/a.jpg")).toContain(
      "url=https%3A%2F%2Fwww.flayrah.com%2Fa.jpg",
    );
  });
});
