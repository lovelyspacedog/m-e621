import { describe, expect, it } from "vitest";
import { parseFlayrahArticleHtml } from "./parseArticleHtml";

const FIXTURE = `<!DOCTYPE html><html><head>
<meta name="author" content="EberraWolf" />
<meta property="og:title" content="NYC furries baited" />
<meta property="og:url" content="https://www.flayrah.com/9638/nyc-furries-baited-go-247-livestream" />
<meta property="og:image" content="https://www.flayrah.com/sites/default/files/u/x.png" />
<meta property="article:published_time" content="2026-09-17T01:47:22+00:00" />
<meta property="article:tag" content="furmeets" />
<meta property="article:tag" content="New York" />
</head><body>
<h1>NYC furries baited</h1>
<div id="node-9638" class="node clear-block">
<span class="submitted">Posted by <a href="/u/eberrawolf" rel="author">EberraWolf</a></span>
<div class="content">
<form class="fivestar-widget"><input type="submit" value="Rate" /></form>
<p>First paragraph of the story.</p>
<p>Second paragraph.</p>
</div>
</div>
</body></html>`;

describe("parseFlayrahArticleHtml", () => {
  it("extracts meta, tags, and body without forms", () => {
    const article = parseFlayrahArticleHtml(FIXTURE, 9638);
    expect(article).not.toBeNull();
    expect(article!.id).toBe(9638);
    expect(article!.title).toBe("NYC furries baited");
    expect(article!.author).toBe("EberraWolf");
    expect(article!.tags).toEqual(["furmeets", "New York"]);
    expect(article!.descriptionHtml).toContain("First paragraph");
    expect(article!.descriptionHtml).not.toContain("fivestar");
    expect(article!.thumbUrl).toContain("sites/default/files");
    expect(article!.fromArchive).toBe(true);
    expect(article!.publishedMs).toBeGreaterThan(0);
  });

  it("returns null without a node body", () => {
    expect(parseFlayrahArticleHtml("<html><body><p>nope</p></body></html>")).toBeNull();
  });
});
