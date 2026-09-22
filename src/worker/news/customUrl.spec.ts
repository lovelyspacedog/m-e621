import { describe, expect, it } from "vitest";
import {
  customItemKey,
  isCustomFeedId,
  makeCustomFeedId,
  makeCustomNewsId,
  parseCustomNewsId,
  customNewsSourceKey,
  parseCustomNewsSourceKey,
} from "./customIds";
import {
  isBlockedHostname,
  isBlockedIpLiteral,
  mediaHostAllowed,
  validatePublicHttpsUrl,
  CUSTOM_NEWS_FEED_CAP,
} from "./customUrl";
import {
  customFeedTitleFromXml,
  parseCustomNewsRss,
} from "./parseCustomRss";
import { parseGenericArticleHtml } from "./parseArticleHtml";

describe("customUrl policy", () => {
  it("accepts public https urls", () => {
    const r = validatePublicHttpsUrl("https://example.com/feed/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe("example.com");
  });

  it("rejects http, credentials, and private hosts", () => {
    expect(validatePublicHttpsUrl("http://example.com/feed").ok).toBe(false);
    expect(
      validatePublicHttpsUrl("https://user:pass@example.com/feed").ok,
    ).toBe(false);
    expect(validatePublicHttpsUrl("https://127.0.0.1/feed").ok).toBe(false);
    expect(validatePublicHttpsUrl("https://192.168.1.1/feed").ok).toBe(false);
    expect(validatePublicHttpsUrl("https://localhost/feed").ok).toBe(false);
    expect(validatePublicHttpsUrl("https://foo.local/feed").ok).toBe(false);
  });

  it("blocks private IP literals", () => {
    expect(isBlockedIpLiteral("10.0.0.1")).toBe(true);
    expect(isBlockedIpLiteral("8.8.8.8")).toBe(false);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
  });

  it("checks media host allowlist", () => {
    expect(mediaHostAllowed("cdn.example.com", ["example.com"])).toBe(false);
    expect(mediaHostAllowed("example.com", ["example.com"])).toBe(true);
  });

  it("exports feed cap of 8", () => {
    expect(CUSTOM_NEWS_FEED_CAP).toBe(8);
  });
});

describe("customIds", () => {
  it("makes and parses custom article ids", () => {
    const feedId = makeCustomFeedId();
    expect(isCustomFeedId(feedId)).toBe(true);
    const key = customItemKey("https://example.com/post/1");
    expect(key).toMatch(/^[a-f0-9]{16}$/);
    const id = makeCustomNewsId(feedId, key);
    expect(parseCustomNewsId(id)).toEqual({ feedId, itemKey: key });
    expect(customNewsSourceKey(feedId)).toBe(`custom:${feedId}`);
    expect(parseCustomNewsSourceKey(`custom:${feedId}`)).toBe(feedId);
  });

  it("is stable for the same guid", () => {
    expect(customItemKey("abc")).toBe(customItemKey("abc"));
    expect(customItemKey("abc")).not.toBe(customItemKey("abd"));
  });
});

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Demo Feed</title>
<item>
  <title>Hello World</title>
  <link>https://example.com/posts/hello</link>
  <guid>https://example.com/posts/hello</guid>
  <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
  <description><![CDATA[<p>Short blurb</p>]]></description>
  <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Ada</dc:creator>
</item>
</channel></rss>`;

const SAMPLE_ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Demo</title>
  <entry>
    <title>Atom Post</title>
    <id>urn:example:1</id>
    <link href="https://example.com/atom/1" rel="alternate"/>
    <updated>2024-02-01T00:00:00Z</updated>
    <author><name>Bob</name></author>
    <content type="html">&lt;p&gt;Atom body&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("parseCustomNewsRss", () => {
  it("parses RSS without numeric ids", () => {
    expect(customFeedTitleFromXml(SAMPLE_RSS)).toBe("Demo Feed");
    const items = parseCustomNewsRss(SAMPLE_RSS, "c_aabbcc", "https://example.com/feed/");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Hello World");
    expect(items[0].id).toMatch(/^custom:c_aabbcc:[a-f0-9]{16}$/);
    expect(items[0].source).toBe("custom:c_aabbcc");
    expect(items[0].author).toBe("Ada");
    expect(items[0].customFeedId).toBe("c_aabbcc");
  });

  it("parses Atom entries", () => {
    const items = parseCustomNewsRss(SAMPLE_ATOM, "c_atom01", "https://example.com/atom");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Atom Post");
    expect(items[0].link).toBe("https://example.com/atom/1");
    expect(items[0].author).toBe("Bob");
  });
});

describe("parseGenericArticleHtml", () => {
  it("extracts article body and falls back to RSS html", () => {
    const html = `<html><head>
      <meta property="og:title" content="Page Title"/>
      <meta property="og:url" content="https://example.com/posts/hello"/>
    </head><body>
      <article><div class="entry-content"><p>Full page body here with enough text.</p></div></article>
    </body></html>`;
    const a = parseGenericArticleHtml(html, {
      feedId: "c_aabbcc",
      itemKey: "0123456789abcdef",
      linkHint: "https://example.com/posts/hello",
    });
    expect(a?.title).toBe("Page Title");
    expect(a?.descriptionHtml).toContain("Full page body");
    expect(a?.fromArchive).toBe(true);

    const fallback = parseGenericArticleHtml("", {
      feedId: "c_aabbcc",
      itemKey: "0123456789abcdef",
      linkHint: "https://example.com/posts/hello",
      titleHint: "RSS Title",
      rssHtmlFallback: "<p>From RSS</p>",
    });
    expect(fallback?.descriptionHtml).toContain("From RSS");
    expect(fallback?.fromArchive).toBe(false);
  });
});
