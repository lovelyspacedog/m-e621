/**
 * Opt-in live upstream smoke. Not run in CI.
 *
 *   LIVE=1 npm run test:live-smoke
 *
 * v1 targets only public, cookie-free endpoints:
 *   - e621 posts.json
 *   - Flayrah full RSS
 *   - Weasyl public search HTML
 *
 * Skipped in v1 (CAPTCHA / Cloudflare / age gate / session): FA, u18chan,
 * Furbooru CF, Murrtube, SoFurry.
 */
import { describe, expect, it } from "vitest";
import { parseFlayrahRss } from "./news/parseRss";
import { getNewsSourceDef } from "./news/registry";
import { parseWeasylSearchHtml } from "./weasyl/htmlParse";

const live = process.env.LIVE === "1";
const suite = live ? describe : describe.skip;

const UA =
  "PawDeck-live-smoke/1.0 (+https://github.com/lovelyspacedog/m-e621)";

suite("live smoke (LIVE=1)", () => {
  it(
    "e621 posts.json returns at least one post id",
    async () => {
      const res = await fetch("https://e621.net/posts.json?limit=1", {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
        },
      });
      expect(res.ok, `e621 HTTP ${res.status}`).toBe(true);
      const data = (await res.json()) as { posts?: Array<{ id?: number }> };
      expect(data.posts?.length).toBeGreaterThanOrEqual(1);
      expect(Number(data.posts![0].id)).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    "Flayrah RSS parses to at least one article",
    async () => {
      const url = getNewsSourceDef("flayrah")!.fullRssUrl;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      });
      expect(res.ok, `Flayrah RSS HTTP ${res.status}`).toBe(true);
      const xml = await res.text();
      const articles = parseFlayrahRss(xml);
      expect(articles.length).toBeGreaterThanOrEqual(1);
      expect(articles[0].id).toMatch(/^flayrah:/);
    },
    20_000,
  );

  it(
    "Weasyl search HTML yields at least one submission",
    async () => {
      const res = await fetch("https://www.weasyl.com/search?q=", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PawDeck-live-smoke/1.0",
          Accept: "text/html",
        },
      });
      expect(res.ok, `Weasyl HTTP ${res.status}`).toBe(true);
      const html = await res.text();
      const { submissions } = parseWeasylSearchHtml(html);
      expect(submissions.length).toBeGreaterThanOrEqual(1);
      expect(submissions[0].submitid).toBeGreaterThan(0);
    },
    20_000,
  );
});
