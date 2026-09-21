/**
 * Parse Flayrah Drupal node HTML or Dogpatch WordPress post HTML into NewsArticle.
 */
import { makeNewsId, type NewsSource } from "./ids";
import {
  excerptFromDescription,
  firstImageUrl,
  type NewsArticle,
} from "./parseRss";

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

function dogpatchIdFromDoc(doc: Document, idHint: number): number {
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

function extractDogpatchBodyHtml(doc: Document): string {
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

function parseDogpatchHtml(html: string, idHint: number): NewsArticle | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const numericId = dogpatchIdFromDoc(doc, 0);
  if (!numericId) return null;
  if (idHint > 0 && numericId !== idHint) return null;

  const title =
    metaContent(doc, "property", "og:title") ||
    (doc.querySelector("h1.entry-title, h1")?.textContent || "").trim();
  if (!title) return null;

  const link =
    metaContent(doc, "property", "og:url") ||
    `https://dogpatch.press/?p=${numericId}`;

  const descriptionHtml = extractDogpatchBodyHtml(doc);
  if (!descriptionHtml) return null;

  const publishedAt =
    metaContent(doc, "property", "article:published_time") ||
    (doc.querySelector("time[datetime]")?.getAttribute("datetime") || "");
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const ogImage = metaContent(doc, "property", "og:image");

  return {
    id: makeNewsId("dogpatch", numericId),
    source: "dogpatch",
    title,
    link,
    author: authorFromDoc(doc),
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags: tagsFromDoc(doc),
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl:
      ogImage || firstImageUrl(descriptionHtml, "https://dogpatch.press"),
    fromArchive: true,
  };
}

/** Build a NewsArticle from a full HTML page response. */
export function parseNewsArticleHtml(
  html: string,
  source: NewsSource,
  idHint = 0,
): NewsArticle | null {
  if (!html) return null;
  if (source === "dogpatch") return parseDogpatchHtml(html, idHint);
  return parseFlayrahHtml(html, idHint);
}

/** @deprecated */
export function parseFlayrahArticleHtml(
  html: string,
  idHint = 0,
): NewsArticle | null {
  return parseNewsArticleHtml(html, "flayrah", idHint);
}
