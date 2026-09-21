/**
 * Parse Flayrah / Dogpatch Press RSS 2.0 into namespaced NewsArticle records.
 * Uses DOMParser — browser / jsdom only.
 */

import { makeNewsId, type NewsSource } from "./ids";

export interface NewsArticle {
  id: string;
  source: NewsSource;
  title: string;
  link: string;
  author: string;
  publishedAt: string;
  publishedMs: number;
  tags: string[];
  descriptionHtml: string;
  excerpt: string;
  thumbUrl: string | null;
  /** True when loaded via HTML archive fallback (not current RSS). */
  fromArchive?: boolean;
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

function flayrahNidFromGuidOrLink(guid: string, link: string): number {
  const sources = [guid, link];
  for (const s of sources) {
    const m =
      s.match(/flayrah\.com\/(\d+)(?:\/|$|#|\?)/i) ||
      s.match(/\/(\d+)(?:\/|$|#|\?)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function dogpatchIdFromItem(item: Element, guid: string, link: string): number {
  const all = item.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === "post_id" || el.tagName.toLowerCase() === "wp:post_id") {
      const n = parseInt(textContent(el), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  for (const s of [guid, link]) {
    const m = s.match(/[?&]p=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // WP often puts the post id in guid even without ?p=
  const guidNum = guid.match(/dogpatch\.press\/\?p=(\d+)/i);
  if (guidNum) {
    const n = parseInt(guidNum[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
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

export function firstImageUrl(
  html: string,
  baseOrigin = "https://www.flayrah.com",
): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  let src = m[1].trim();
  if (src.startsWith("//")) src = `https:${src}`;
  if (src.startsWith("/")) src = `${baseOrigin}${src}`;
  if (!/^https?:\/\//i.test(src)) return null;
  return src;
}

/** Prefer RSS enclosure image over the first inline <img>. */
export function enclosureImageUrl(
  item: Element,
  baseOrigin = "https://www.flayrah.com",
): string | null {
  const enclosures = item.getElementsByTagName("enclosure");
  for (let i = 0; i < enclosures.length; i++) {
    const el = enclosures[i];
    const type = (el.getAttribute("type") || "").toLowerCase();
    const url = (el.getAttribute("url") || "").trim();
    if (!url) continue;
    if (type && !type.startsWith("image/")) continue;
    let src = url;
    if (src.startsWith("//")) src = `https:${src}`;
    if (src.startsWith("/")) src = `${baseOrigin}${src}`;
    if (!/^https?:\/\//i.test(src)) continue;
    if (!type && !/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(src)) continue;
    return src;
  }
  return null;
}

/** Plain text of description for search (scripts/styles stripped). */
export function bodySearchText(html: string): string {
  return stripTags(html).toLowerCase();
}

/**
 * Prefer content:encoded (full WP/Drupal body) over description (often a short
 * excerpt). Fall back to description when encoded is absent.
 */
function descriptionHtmlFromItem(item: Element): string {
  const all = item.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === "encoded" || el.tagName.toLowerCase() === "content:encoded") {
      const html = textContent(el);
      if (html) return html;
    }
  }
  return childText(item, "description");
}

function parseRssItems(xml: string, source: NewsSource): NewsArticle[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`Failed to parse ${source} RSS`);
  }
  const baseOrigin =
    source === "dogpatch" ? "https://dogpatch.press" : "https://www.flayrah.com";
  const items = doc.getElementsByTagName("item");
  const out: NewsArticle[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = childText(item, "title");
    const link = childText(item, "link");
    const guid = childText(item, "guid") || link;
    const numericId =
      source === "dogpatch"
        ? dogpatchIdFromItem(item, guid, link)
        : flayrahNidFromGuidOrLink(guid, link);
    if (!numericId || !title || !link) continue;
    const descriptionHtml = descriptionHtmlFromItem(item);
    const pubDate = childText(item, "pubDate");
    const publishedMs = pubDate ? Date.parse(pubDate) : NaN;
    out.push({
      id: makeNewsId(source, numericId),
      source,
      title,
      link,
      author: creatorText(item),
      publishedAt: pubDate,
      publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
      tags: categories(item),
      descriptionHtml,
      excerpt: excerptFromDescription(descriptionHtml),
      thumbUrl:
        enclosureImageUrl(item, baseOrigin) ||
        firstImageUrl(descriptionHtml, baseOrigin),
    });
  }
  return out;
}

export function parseFlayrahRss(xml: string): NewsArticle[] {
  return parseRssItems(xml, "flayrah");
}

export function parseDogpatchRss(xml: string): NewsArticle[] {
  return parseRssItems(xml, "dogpatch");
}

export function parseNewsRss(xml: string, source: NewsSource): NewsArticle[] {
  return parseRssItems(xml, source);
}

function plainHaystack(article: NewsArticle): string {
  return [
    article.title,
    article.author,
    article.excerpt,
    article.source,
    bodySearchText(article.descriptionHtml),
    ...article.tags,
  ]
    .join(" ")
    .toLowerCase();
}

function termMatches(article: NewsArticle, term: string): boolean {
  const prefixed = term.match(/^(author|tag|source):(.+)$/i);
  if (prefixed) {
    const kind = prefixed[1].toLowerCase();
    const val = prefixed[2].toLowerCase();
    if (!val) return true;
    if (kind === "author") return article.author.toLowerCase().includes(val);
    if (kind === "tag") {
      return article.tags.some((t) => t.toLowerCase().includes(val));
    }
    const sourceLabel =
      article.source === "dogpatch" ? "dogpatch press" : "flayrah";
    return (
      article.source.toLowerCase().includes(val) || sourceLabel.includes(val)
    );
  }
  return plainHaystack(article).includes(term.toLowerCase());
}

export function articleMatchesQuery(
  article: NewsArticle,
  terms: string[],
): boolean {
  if (!terms.length) return true;
  return terms.every((t) => termMatches(article, t));
}

export function parseNewsQueryTerms(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** @deprecated use parseNewsQueryTerms */
export const parseFlayrahQueryTerms = parseNewsQueryTerms;
