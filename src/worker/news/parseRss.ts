/**
 * Parse News RSS 2.0 / Atom into namespaced NewsArticle records.
 * Uses DOMParser — browser / jsdom only.
 */

import { makeNewsId, isNewsSource, type NewsSource } from "./ids";
import {
  getNewsSourceDef,
  newsSourceBaseOrigin,
  newsSourceLabel,
} from "./registry";

/**
 * Built-in outlet id, or `custom:<feedId>` for user-added feeds.
 * Prefer `isNewsSource` / `parseCustomNewsSourceKey` over casting.
 */
export type NewsArticleSource = NewsSource | string;

export interface NewsArticle {
  id: string;
  source: NewsArticleSource;
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
  /** Present when `source` is `custom:<feedId>`. */
  customFeedId?: string;
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

/** WordPress post id from wp:post_id, ?p=, or guid. */
function wordpressIdFromItem(item: Element, guid: string, link: string): number {
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

/** media:content (preferred) or media:thumbnail hero image. */
export function mediaImageUrl(
  item: Element,
  baseOrigin = "https://www.flayrah.com",
): string | null {
  const ranked: { src: string; rank: number }[] = [];
  const all = item.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const name = el.localName;
    if (name !== "content" && name !== "thumbnail") continue;
    const tag = el.tagName.toLowerCase();
    const ns = (el.namespaceURI || "").toLowerCase();
    const isMedia =
      tag.startsWith("media:") || ns.includes("yahoo.com/mrss") || ns.includes("mrss");
    if (!isMedia) continue;
    const url = (el.getAttribute("url") || "").trim();
    if (!url) continue;
    const medium = (el.getAttribute("medium") || "").toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (medium && medium !== "image") continue;
    if (type && !type.startsWith("image/")) continue;
    let src = url;
    if (src.startsWith("//")) src = `https:${src}`;
    if (src.startsWith("/")) src = `${baseOrigin}${src}`;
    if (!/^https?:\/\//i.test(src)) continue;
    ranked.push({ src, rank: name === "content" ? 2 : 1 });
  }
  ranked.sort((a, b) => b.rank - a.rank);
  return ranked[0]?.src ?? null;
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

function numericIdForSource(
  source: NewsSource,
  item: Element,
  guid: string,
  link: string,
): number {
  const def = getNewsSourceDef(source);
  if (def?.parser === "wordpress") {
    return wordpressIdFromItem(item, guid, link);
  }
  return flayrahNidFromGuidOrLink(guid, link);
}

function parseRssItems(xml: string, source: NewsSource, doc: Document): NewsArticle[] {
  const baseOrigin = newsSourceBaseOrigin(source);
  const items = doc.getElementsByTagName("item");
  const out: NewsArticle[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = childText(item, "title");
    const link = childText(item, "link");
    const guid = childText(item, "guid") || link;
    const numericId = numericIdForSource(source, item, guid, link);
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
        mediaImageUrl(item, baseOrigin) ||
        firstImageUrl(descriptionHtml, baseOrigin),
    });
  }
  return out;
}

function atomLinkHref(entry: Element): string {
  const links = entry.getElementsByTagName("link");
  let alternate = "";
  for (let i = 0; i < links.length; i++) {
    const el = links[i];
    const rel = (el.getAttribute("rel") || "alternate").toLowerCase();
    const href = (el.getAttribute("href") || "").trim();
    if (!href) continue;
    if (rel === "alternate") return href;
    if (!alternate) alternate = href;
  }
  return alternate || childText(entry, "id");
}

function atomContentHtml(entry: Element): string {
  const all = entry.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === "content") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "html" || type === "xhtml" || type.includes("html")) {
        const html = el.innerHTML?.trim() || textContent(el);
        if (html) return html;
      }
      const t = textContent(el);
      if (t) return t;
    }
  }
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === "summary") {
      const t = textContent(el);
      if (t) return t;
    }
  }
  return "";
}

function atomAuthor(entry: Element): string {
  const authors = entry.getElementsByTagName("author");
  if (authors[0]) {
    const name = childText(authors[0], "name");
    if (name) return name;
    const t = textContent(authors[0]);
    if (t) return t;
  }
  return creatorText(entry);
}

function atomCategories(entry: Element): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const cats = entry.getElementsByTagName("category");
  for (let i = 0; i < cats.length; i++) {
    const el = cats[i];
    const t =
      (el.getAttribute("term") || "").trim() || textContent(el);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  return tags;
}

function atomNumericId(
  source: NewsSource,
  entry: Element,
  link: string,
  idText: string,
): number {
  const def = getNewsSourceDef(source);
  if (def?.parser === "wordpress") {
    return wordpressIdFromItem(entry, idText, link);
  }
  return flayrahNidFromGuidOrLink(idText, link);
}

function parseAtomEntries(source: NewsSource, doc: Document): NewsArticle[] {
  const baseOrigin = newsSourceBaseOrigin(source);
  const entries = doc.getElementsByTagName("entry");
  const out: NewsArticle[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const title = childText(entry, "title");
    const link = atomLinkHref(entry);
    const idText = childText(entry, "id") || link;
    const numericId = atomNumericId(source, entry, link, idText);
    if (!numericId || !title || !link) continue;
    const descriptionHtml = atomContentHtml(entry);
    const publishedAt =
      childText(entry, "published") || childText(entry, "updated");
    const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
    out.push({
      id: makeNewsId(source, numericId),
      source,
      title,
      link,
      author: atomAuthor(entry),
      publishedAt,
      publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
      tags: atomCategories(entry),
      descriptionHtml,
      excerpt: excerptFromDescription(descriptionHtml),
      thumbUrl:
        mediaImageUrl(entry, baseOrigin) ||
        firstImageUrl(descriptionHtml, baseOrigin),
    });
  }
  return out;
}

function isAtomFeed(doc: Document): boolean {
  const root = doc.documentElement;
  if (!root) return false;
  const name = root.localName || root.tagName;
  return name.toLowerCase() === "feed";
}

export function parseFlayrahRss(xml: string): NewsArticle[] {
  return parseNewsRss(xml, "flayrah");
}

export function parseDogpatchRss(xml: string): NewsArticle[] {
  return parseNewsRss(xml, "dogpatch");
}

export function parseNewsRss(xml: string, source: NewsSource): NewsArticle[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`Failed to parse ${source} feed`);
  }
  if (isAtomFeed(doc)) return parseAtomEntries(source, doc);
  return parseRssItems(xml, source, doc);
}

function articleSourceLabel(source: NewsArticleSource): string {
  if (isNewsSource(source)) return newsSourceLabel(source);
  return source;
}

function plainHaystack(article: NewsArticle): string {
  return [
    article.title,
    article.author,
    article.excerpt,
    article.source,
    articleSourceLabel(article.source),
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
    const sourceLabel = articleSourceLabel(article.source).toLowerCase();
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
