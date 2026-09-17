/**
 * Parse Flayrah RSS 2.0 (rss-full.xml) into article records.
 * Uses DOMParser — browser / jsdom only.
 */

export interface FlayrahArticle {
  id: number;
  title: string;
  link: string;
  author: string;
  publishedAt: string;
  publishedMs: number;
  tags: string[];
  descriptionHtml: string;
  excerpt: string;
  thumbUrl: string | null;
}

function textContent(el: Element | null): string {
  return (el?.textContent || "").trim();
}

function childText(parent: Element, localName: string): string {
  const kids = parent.getElementsByTagName(localName);
  return textContent(kids[0] || null);
}

/** Prefer namespaced dc:creator when present. */
function creatorText(item: Element): string {
  const all = item.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === "creator" || el.tagName.toLowerCase() === "dc:creator") {
      const t = textContent(el);
      if (t) return t;
    }
  }
  return childText(item, "author") || "Unknown";
}

function nidFromGuidOrLink(guid: string, link: string): number {
  const sources = [guid, link];
  for (const s of sources) {
    const m = s.match(/flayrah\.com\/(\d+)(?:\/|$|#|\?)/i) || s.match(/\/(\d+)(?:\/|$|#|\?)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function categories(item: Element): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const cats = item.getElementsByTagName("category");
  for (let i = 0; i < cats.length; i++) {
    const t = textContent(cats[i]);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  return tags;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromDescription(html: string): string {
  const breakIdx = html.search(/<!--\s*break\s*-->/i);
  const head = breakIdx >= 0 ? html.slice(0, breakIdx) : html;
  const pMatch = head.match(/<p[\s>][\s\S]*?<\/p>/i);
  const chunk = pMatch ? pMatch[0] : head;
  const text = stripTags(chunk);
  if (text.length <= 280) return text;
  return `${text.slice(0, 277).trim()}…`;
}

export function firstImageUrl(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  let src = m[1].trim();
  if (src.startsWith("//")) src = `https:${src}`;
  if (src.startsWith("/")) src = `https://www.flayrah.com${src}`;
  if (!/^https?:\/\//i.test(src)) return null;
  return src;
}

export function parseFlayrahRss(xml: string): FlayrahArticle[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Failed to parse Flayrah RSS");
  }
  const items = doc.getElementsByTagName("item");
  const out: FlayrahArticle[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = childText(item, "title");
    const link = childText(item, "link");
    const guid = childText(item, "guid") || link;
    const id = nidFromGuidOrLink(guid, link);
    if (!id || !title || !link) continue;
    const descriptionHtml =
      childText(item, "description") ||
      (() => {
        const encoded = item.getElementsByTagName("encoded");
        for (let j = 0; j < encoded.length; j++) {
          if (encoded[j].localName === "encoded") return textContent(encoded[j]);
        }
        return "";
      })();
    const pubDate = childText(item, "pubDate");
    const publishedMs = pubDate ? Date.parse(pubDate) : NaN;
    out.push({
      id,
      title,
      link,
      author: creatorText(item),
      publishedAt: pubDate,
      publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
      tags: categories(item),
      descriptionHtml,
      excerpt: excerptFromDescription(descriptionHtml),
      thumbUrl: firstImageUrl(descriptionHtml),
    });
  }
  return out;
}

export function articleMatchesQuery(article: FlayrahArticle, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = [
    article.title,
    article.author,
    article.excerpt,
    ...article.tags,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t.toLowerCase()));
}

export function parseFlayrahQueryTerms(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
