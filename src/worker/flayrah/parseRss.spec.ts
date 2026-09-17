import { describe, expect, it } from "vitest";
import {
  excerptFromDescription,
  firstImageUrl,
  parseFlayrahRss,
  articleMatchesQuery,
} from "./parseRss";

const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
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

describe("parseFlayrahRss", () => {
  it("parses nid, tags, author, and break excerpt", () => {
    const articles = parseFlayrahRss(FIXTURE);
    expect(articles).toHaveLength(2);
    expect(articles[0].id).toBe(9638);
    expect(articles[0].author).toBe("EberraWolf");
    expect(articles[0].tags).toEqual(["furmeets", "New York"]);
    expect(articles[0].excerpt).toContain("First para");
    expect(articles[0].excerpt).not.toContain("More body");
    expect(articles[0].thumbUrl).toContain("hero.jpg");
    expect(articles[1].id).toBe(9637);
    expect(articles[1].author).toBe("earthfurst");
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
    const articles = parseFlayrahRss(FIXTURE);
    expect(articleMatchesQuery(articles[0], ["nyc"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["maryland"])).toBe(false);
    expect(articleMatchesQuery(articles[0], ["eberrawolf"])).toBe(true);
    expect(articleMatchesQuery(articles[0], ["livestream"])).toBe(true);
  });
});
