/**
 * Parse Flayrah Drupal node HTML or WordPress post HTML into NewsArticle.
 */
import { makeNewsId, type NewsSource } from "./ids";
import { makeCustomNewsId, customNewsSourceKey } from "./customIds";
import {
  excerptFromDescription,
  firstImageUrl,
  type NewsArticle,
} from "./parseRss";
import { getNewsSourceDef, newsSourceBaseOrigin } from "./registry";

function metaContent(doc: Document, attr: string, value: string): string {
  const el =
    doc.querySelector(`meta[${attr}="${value}"]`) ||
    doc.querySelector(`meta[${attr}='${value}']`);
  return (el?.getAttribute("content") || "").trim();
}

function allMetaContents(doc: Document, property: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll(`meta[property="${property}"]`).forEach((el) => {
    const t = (el.getAttribute("content") || "").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out;
}

function flayrahNidFromDoc(doc: Document): number {
  const node = doc.querySelector('[id^="node-"]');
  if (node) {
    const m = node.id.match(/^node-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const og = metaContent(doc, "property", "og:url");
  const m = og.match(/flayrah\.com\/(\d+)(?:\/|$|#|\?)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function extractFlayrahBodyHtml(doc: Document, id: number): string {
  const node =
    doc.getElementById(`node-${id}`) || doc.querySelector('[id^="node-"]');
  if (!node) return "";
  const content = node.querySelector(".content");
  if (!content) return "";
  const clone = content.cloneNode(true) as Element;
  clone.querySelectorAll("form, script, style, .fivestar-widget").forEach((el) => {
    el.remove();
  });
  return clone.innerHTML.trim();
}

function authorFromDoc(doc: Document): string {
  const meta = metaContent(doc, "name", "author");
  if (meta) return meta;
  const a = doc.querySelector(
    ".submitted a[rel='author'], .submitted a[rel=author], .author a, a[rel='author']",
  );
  const t = (a?.textContent || "").trim();
  return t || "Unknown";
}

function tagsFromDoc(doc: Document): string[] {
  const fromMeta = allMetaContents(doc, "article:tag");
  if (fromMeta.length) return fromMeta;
  const tags: string[] = [];
  const seen = new Set<string>();
  doc
    .querySelectorAll(".taxonomy a, .post-categories a, .cat-links a, a[rel='tag']")
    .forEach((a) => {
      const t = (a.textContent || "").trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      tags.push(t);
    });
  return tags;
}

function parseFlayrahHtml(html: string, idHint: number): NewsArticle | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const numericId = flayrahNidFromDoc(doc);
  if (!numericId) return null;
  if (idHint > 0 && numericId !== idHint) return null;

  const title =
    metaContent(doc, "property", "og:title") ||
    (doc.querySelector("h1")?.textContent || "").trim();
  if (!title) return null;

  const link =
    metaContent(doc, "property", "og:url") ||
    `https://www.flayrah.com/node/${numericId}`;

  const descriptionHtml = extractFlayrahBodyHtml(doc, numericId);
  if (!descriptionHtml) return null;

  const publishedAt =
    metaContent(doc, "property", "article:published_time") || "";
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const ogImage = metaContent(doc, "property", "og:image");

  return {
    id: makeNewsId("flayrah", numericId),
    source: "flayrah",
    title,
    link,
    author: authorFromDoc(doc),
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags: tagsFromDoc(doc),
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl:
      ogImage || firstImageUrl(descriptionHtml, "https://www.flayrah.com"),
    fromArchive: true,
  };
}

function wordpressIdFromDoc(doc: Document, idHint: number): number {
  const body = doc.body;
  if (body) {
    for (const cls of Array.from(body.classList)) {
      const m = cls.match(/^postid-(\d+)$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }
  const article = doc.querySelector("article[id^='post-']");
  if (article) {
    const m = article.id.match(/^post-(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const og = metaContent(doc, "property", "og:url");
  const shortlink =
    doc.querySelector('link[rel="shortlink"]')?.getAttribute("href") || "";
  for (const s of [og, shortlink]) {
    const m = s.match(/[?&]p=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return idHint > 0 ? idHint : 0;
}

function extractWordpressBodyHtml(doc: Document): string {
  const selectors = [
    "article .entry-content",
    ".post .entry-content",
    ".entry-content",
    "article .post-content",
    "article",
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const clone = el.cloneNode(true) as Element;
    clone
      .querySelectorAll(
        "script, style, form, .sharedaddy, .jp-relatedposts, nav, .comments, #comments",
      )
      .forEach((n) => n.remove());
    const html = clone.innerHTML.trim();
    if (html.length > 40) return html;
  }
  return "";
}

function parseWordpressHtml(
  html: string,
  source: NewsSource,
  idHint: number,
): NewsArticle | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const numericId = wordpressIdFromDoc(doc, 0);
  if (!numericId) return null;
  if (idHint > 0 && numericId !== idHint) return null;

  const baseOrigin = newsSourceBaseOrigin(source);
  const title =
    metaContent(doc, "property", "og:title") ||
    (doc.querySelector("h1.entry-title, h1")?.textContent || "").trim();
  if (!title) return null;

  const link =
    metaContent(doc, "property", "og:url") || `${baseOrigin}/?p=${numericId}`;

  const descriptionHtml = extractWordpressBodyHtml(doc);
  if (!descriptionHtml) return null;

  const publishedAt =
    metaContent(doc, "property", "article:published_time") ||
    (doc.querySelector("time[datetime]")?.getAttribute("datetime") || "");
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const ogImage = metaContent(doc, "property", "og:image");

  return {
    id: makeNewsId(source, numericId),
    source,
    title,
    link,
    author: authorFromDoc(doc),
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags: tagsFromDoc(doc),
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl: ogImage || firstImageUrl(descriptionHtml, baseOrigin),
    fromArchive: true,
  };
}

function extractGenericBodyHtml(doc: Document): string {
  const selectors = [
    "article .entry-content",
    ".post .entry-content",
    ".entry-content",
    "article .post-content",
    ".post-content",
    "article .content",
    "[itemprop='articleBody']",
    "article",
    "main",
    "#content",
    ".content",
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const clone = el.cloneNode(true) as Element;
    clone
      .querySelectorAll(
        "script, style, form, nav, aside, .sharedaddy, .jp-relatedposts, .comments, #comments, header, footer",
      )
      .forEach((n) => n.remove());
    const html = clone.innerHTML.trim();
    if (html.length > 40) return html;
  }
  return "";
}

/**
 * Generic article-page extract for custom feeds (no numeric id checks).
 * Returns null when no usable body is found — caller falls back to RSS HTML.
 */
export function parseGenericArticleHtml(
  html: string,
  opts: {
    feedId: string;
    itemKey: string;
    linkHint?: string;
    titleHint?: string;
    authorHint?: string;
    rssHtmlFallback?: string;
  },
): NewsArticle | null {
  if (!html && !opts.rssHtmlFallback) return null;
  const doc = html
    ? new DOMParser().parseFromString(html, "text/html")
    : null;

  let descriptionHtml = doc ? extractGenericBodyHtml(doc) : "";
  const usedPageBody = Boolean(descriptionHtml);
  if (!descriptionHtml) {
    descriptionHtml = (opts.rssHtmlFallback || "").trim();
  }
  if (!descriptionHtml) return null;

  const title =
    (doc &&
      (metaContent(doc, "property", "og:title") ||
        (doc.querySelector("h1")?.textContent || "").trim())) ||
    (opts.titleHint || "").trim();
  if (!title) return null;

  const link =
    (doc && metaContent(doc, "property", "og:url")) ||
    (opts.linkHint || "").trim();
  if (!link) return null;

  let baseOrigin = "";
  try {
    baseOrigin = new URL(link).origin;
  } catch {
    baseOrigin = "";
  }

  const author =
    (doc && authorFromDoc(doc)) || (opts.authorHint || "").trim() || "Unknown";
  const publishedAt = doc
    ? metaContent(doc, "property", "article:published_time") ||
      (doc.querySelector("time[datetime]")?.getAttribute("datetime") || "")
    : "";
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const ogImage = doc ? metaContent(doc, "property", "og:image") : "";
  const tags = doc ? tagsFromDoc(doc) : [];

  return {
    id: makeCustomNewsId(opts.feedId, opts.itemKey),
    source: customNewsSourceKey(opts.feedId),
    title,
    link,
    author,
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags,
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl: ogImage || firstImageUrl(descriptionHtml, baseOrigin),
    fromArchive: usedPageBody,
    customFeedId: opts.feedId,
  };
}

/** Build a NewsArticle from a full HTML page response. */
export function parseNewsArticleHtml(
  html: string,
  source: NewsSource,
  idHint = 0,
): NewsArticle | null {
  if (!html) return null;
  const def = getNewsSourceDef(source);
  if (def?.parser === "wordpress") {
    return parseWordpressHtml(html, source, idHint);
  }
  return parseFlayrahHtml(html, idHint);
}

/** @deprecated */
export function parseFlayrahArticleHtml(
  html: string,
  idHint = 0,
): NewsArticle | null {
  return parseNewsArticleHtml(html, "flayrah", idHint);
}
