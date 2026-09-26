/**
 * Weasyl HTML parsers shared by the Vite Weasyl proxy and contract tests.
 * Production mirrors live in serve.py (_parse_weasyl_search_html / comments);
 * keep those Python scrapers in sync with this module when markup changes.
 */

export interface WeasylSearchHit {
  submitid: number;
  title: string;
  owner: string;
  owner_login: string;
  posted_at: string;
  rating: string;
  type: string;
  subtype: string;
  tags: string[];
  media: { thumbnail: Array<{ mediaid: null; url: string }> };
}

export function parseWeasylSearchHtml(html: string): {
  submissions: WeasylSearchHit[];
  nextid: number | null;
} {
  const submissions: WeasylSearchHit[] = [];
  let nextid: number | null = null;

  // Extract nextid from pagination links
  const nextidMatches = Array.from(html.matchAll(/[?&]nextid=(\d+)/g));
  if (nextidMatches.length > 0) {
    const last = nextidMatches[nextidMatches.length - 1];
    const n = parseInt(last[1], 10);
    if (!isNaN(n)) nextid = n;
  }

  // Extract submission figure blocks
  // Weasyl search thumbnails are in <figure class="thumb ..."> blocks
  const figurePattern = /<figure[^>]*\bthumb\b[^>]*>([\s\S]*?)<\/figure>/gi;
  let figMatch: RegExpExecArray | null;
  while ((figMatch = figurePattern.exec(html)) !== null) {
    const block = figMatch[1];

    // Extract submission URL → submitid + owner_login
    const linkMatch = block.match(/href="\/~([^/]+)\/submissions\/(\d+)/);
    if (!linkMatch) continue;
    const ownerLogin = linkMatch[1];
    const submitid = parseInt(linkMatch[2], 10);
    if (isNaN(submitid)) continue;

    // Extract thumbnail URL
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
    const thumbUrl = imgMatch ? imgMatch[1] : "";

    // Extract title from img alt or link text
    const altMatch = block.match(/<img[^>]+alt="([^"]*)"[^>]*>/i);
    let title = altMatch
      ? altMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
      : "";
    if (!title) {
      const linkTextMatch = block.match(/>([^<]{1,120})<\/a>/);
      title = linkTextMatch ? linkTextMatch[1].trim() : "";
    }

    // Extract rating from class like "rating-general"
    const ratingMatch = block.match(/\brating-(\w+)\b/);
    const rating = ratingMatch ? ratingMatch[1] : "general";

    submissions.push({
      submitid,
      title,
      owner: ownerLogin,
      owner_login: ownerLogin,
      posted_at: "",
      rating,
      type: "submission",
      subtype: "visual",
      tags: [],
      media: {
        thumbnail: thumbUrl ? [{ mediaid: null, url: thumbUrl }] : [],
      },
    });
  }

  return { submissions, nextid };
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parseWeasylCommentsHtml(
  html: string,
  postId: number,
): Array<{
  id: number;
  body: string;
  creator_name: string;
  created_at: string;
  is_hidden: boolean;
}> {
  const comments: Array<{
    id: number;
    body: string;
    creator_name: string;
    created_at: string;
    is_hidden: boolean;
  }> = [];
  const re =
    /<div[^>]*\bclass="[^"]*\bcomment\b[^"]*"[^>]*(?:id="cid(\d+)"|data-id="(\d+)")[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const id = Number(match[1] || match[2] || 0);
    if (!id) continue;
    const block = match[3] || "";
    const name =
      /class="[^"]*username[^"]*"[^>]*>([^<]+)</i.exec(block)?.[1]?.trim() ||
      /href="\/~([^"/]+)"/i.exec(block)?.[1] ||
      "";
    const bodyHtml =
      /class="[^"]*formatted-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ||
      "";
    const hidden = /\bhidden-comment\b/i.test(match[0]);
    comments.push({
      id,
      body: stripTags(bodyHtml),
      creator_name: name,
      created_at: new Date().toISOString(),
      is_hidden: hidden,
    });
  }
  // Fallback: data-id only blocks
  if (!comments.length) {
    const re2 =
      /id="cid(\d+)"[\s\S]{0,800}?class="[^"]*username[^"]*"[^>]*>([^<]+)[\s\S]{0,1200}?class="[^"]*formatted-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(html))) {
      comments.push({
        id: Number(m2[1]),
        body: stripTags(m2[3] || ""),
        creator_name: (m2[2] || "").trim(),
        created_at: new Date().toISOString(),
        is_hidden: false,
      });
    }
  }
  void postId;
  return comments;
}
