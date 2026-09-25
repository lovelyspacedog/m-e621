import { describe, expect, it } from "vitest";
import { parseDetailHtml, parseListingHtml } from "./api";

describe("badpups parsers", () => {
  it("parseListingHtml extracts article cards", () => {
    const html = `
      <article id="post-1" class="category-gay-anal-porn tag-pup">
        <a href="https://badpups.com/anal-training/" title="Anal Training">
          <span class="duration">07:34</span>
          <img data-src="https://vz-4189b02a-6f9.b-cdn.net/49f2a7ac-99cd-465f-ac59-2df68d0612a6/thumbnail.jpg" alt="Anal Training">
        </a>
      </article>
    `;
    const cards = parseListingHtml(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].slug).toBe("anal-training");
    expect(cards[0].guid).toBe("49f2a7ac-99cd-465f-ac59-2df68d0612a6");
    expect(cards[0].durationSec).toBe(7 * 60 + 34);
    expect(cards[0].categories).toContain("gay_anal_porn");
  });

  it("parseDetailHtml reads VideoObject JSON-LD", () => {
    const html = `
      <script type="application/ld+json">{"@type":"VideoObject","name":"Outta Pocket","description":"desc","thumbnailUrl":["https://vz-4189b02a-6f9.b-cdn.net/90e8c714-ee47-4a1f-b384-4ca64f64942e/thumbnail.jpg"],"uploadDate":"2026-09-24T11:57:33+00:00","embedUrl":"https://badpups.com/embed/90e8c714-ee47-4a1f-b384-4ca64f64942e","contentUrl":"https://badpups.com/lite/video/outta-pocket","duration":"PT2M53S"}</script>
      <a href="https://badpups.com/lite/video-tags/pup">pup</a>
    `;
    const detail = parseDetailHtml(html, "outta-pocket");
    expect(detail?.slug).toBe("outta-pocket");
    expect(detail?.guid).toBe("90e8c714-ee47-4a1f-b384-4ca64f64942e");
    expect(detail?.durationSec).toBe(2 * 60 + 53);
    expect(detail?.tags).toContain("pup");
  });
});
