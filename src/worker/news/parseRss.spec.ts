import { describe, expect, it } from "vitest";
import {
  excerptFromDescription,
  firstImageUrl,
  parseFlayrahRss,
  parseDogpatchRss,
  articleMatchesQuery,
} from "./parseRss";

const FLAYRAH_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>flayrah</title>
    <item>
      <title>NYC furries baited</title>
      <link>https://www.flayrah.com/9638/nyc-furries-baited-go-247-livestream</link>
      <description><![CDATA[<p><img src="https://www.flayrah.com/sites/default/files/u/x.png" alt="x" />First para.</p><!--break--><p>More body about livestream bait.</p>]]></description>
      <enclosure url="https://www.flayrah.com/sites/default/files/u/hero.jpg" length="100" type="image/jpeg" />
      <category>furmeets</category>
      <category>New York</category>
      <pubDate>Thu, 17 Sep 2026 01:47:22 +0000</pubDate>
      <dc:creator>EberraWolf</dc:creator>
      <guid>https://www.flayrah.com/9638</guid>
    </item>
    <item>
      <title>Fursuits banned</title>
      <link>https://www.flayrah.com/9637/fursuits-banned</link>
      <description><![CDATA[<p>Maryland ban story.</p>]]></description>
      <category>fursuiting</category>
      <pubDate>Tue, 15 Sep 2026 20:56:00 +0000</pubDate>
      <dc:creator>earthfurst</dc:creator>
      <guid>https://www.flayrah.com/9637</guid>
    </item>
  </channel>
</rss>`;

const DOGPATCH_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>Dogpatch Press</title>
    <item>
      <title>Test Dogpatch story</title>
      <link>https://dogpatch.press/2026/09/20/test-story/</link>
      <guid isPermaLink="false">https://dogpatch.press/?p=12345</guid>
      <pubDate>Sat, 20 Sep 2026 12:00:00 +0000</pubDate>
      <dc:creator>Patch</dc:creator>
      <category>News</category>
      <description><![CDATA[<p>Dogpatch excerpt about conventions.</p>]]></description>
      <content:encoded><![CDATA[<p>Dogpatch excerpt about conventions.</p><p>Full body that only appears in content encoded.</p>]]></content:encoded>
      <wp:post_id>12345</wp:post_id>
    </item>
  </channel>
</rss>`;

describe("parseFlayrahRss", () => {
  it("parses namespaced id, tags, author, and break excerpt", () => {
    const articles = parseFlayrahRss(FLAYRAH_FIXTURE);
    expect(articles).toHaveLength(2);
    expect(articles[0].id).toBe("flayrah:9638");
    expect(articles[0].source).toBe("flayrah");
    expect(articles[0].author).toBe("EberraWolf");
    expect(articles[0].tags).toEqual(["furmeets", "New York"]);
    expect(articles[0].excerpt).toContain("First para");
    expect(articles[0].excerpt).not.toContain("More body");
    expect(articles[0].thumbUrl).toContain("hero.jpg");
    expect(articles[1].id).toBe("flayrah:9637");
    expect(articles[1].author).toBe("earthfurst");
  });
});

describe("parseDogpatchRss", () => {
  it("parses wp post id into dogpatch:id", () => {
    const articles = parseDogpatchRss(DOGPATCH_FIXTURE);
    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe("dogpatch:12345");
    expect(articles[0].source).toBe("dogpatch");
    expect(articles[0].author).toBe("Patch");
    expect(articles[0].tags).toEqual(["News"]);
  });

  it("prefers content:encoded over short description", () => {
    const articles = parseDogpatchRss(DOGPATCH_FIXTURE);
    expect(articles[0].descriptionHtml).toContain("Full body that only appears");
    expect(articles[0].descriptionHtml).toContain("Dogpatch excerpt");
  });
});

describe("excerptFromDescription", () => {
  it("uses text before break", () => {
    expect(excerptFromDescription("<p>A</p><!--break--><p>B</p>")).toBe("A");
  });
});

describe("firstImageUrl", () => {
  it("absolutizes protocol-relative urls", () => {
    expect(firstImageUrl('<img src="//www.flayrah.com/a.jpg">')).toBe(
      "https://www.flayrah.com/a.jpg",
    );
  });
});

describe("articleMatchesQuery", () => {
  it("matches title author tags and body", () => {
    const articles = parseFlayrahRss(FLAYRAH_FIXTURE);
    expect(articleMatchesQuery(articles[0], ["nyc"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["maryland"])).toBe(false);
    expect(articleMatchesQuery(articles[0], ["eberrawolf"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["livestream"])).toBe(true);
  });

  it("supports author tag and source prefixes", () => {
    const articles = parseFlayrahRss(FLAYRAH_FIXTURE);
    expect(articleMatchesQuery(articles[0], ["author:Eberra"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["author:earth"])).toBe(false);
    expect(articleMatchesQuery(articles[0], ["tag:furmeets"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["source:flayrah"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["source:dogpatch"])).toBe(false);
  });
});
