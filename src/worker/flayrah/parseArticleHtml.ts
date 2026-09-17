/**
 * Parse a Flayrah Drupal node HTML page into a FlayrahArticle.
 * Used when the article is no longer in the current RSS window.
 */
import {
  excerptFromDescription,
  firstImageUrl,
  type FlayrahArticle,
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

function nidFromDoc(doc: Document, hint: number): number {
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
  return hint > 0 ? hint : 0;
}

function extractBodyHtml(doc: Document, id: number): string {
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
  const a = doc.querySelector(".submitted a[rel='author'], .submitted a[rel=author]");
  const t = (a?.textContent || "").trim();
  return t || "Unknown";
}

function tagsFromDoc(doc: Document): string[] {
  const fromMeta = allMetaContents(doc, "article:tag");
  if (fromMeta.length) return fromMeta;
  const tags: string[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll(".taxonomy a").forEach((a) => {
    const t = (a.textContent || "").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(t);
  });
  return tags;
}

/** Build a FlayrahArticle from a full HTML page response. */
export function parseFlayrahArticleHtml(
  html: string,
  idHint = 0,
): FlayrahArticle | null {
  if (!html || /cloudflare|just a moment/i.test(html.slice(0, 2000))) {
    // Still try — Cloudflare challenge pages rarely include node markup.
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Discover id from markup only — do not fall back to the request hint.
  const id = nidFromDoc(doc, 0);
  if (!id) return null;
  // Reject wrong-node HTML (soft 404 / redirect body for another article).
  if (idHint > 0 && id !== idHint) return null;

  const title =
    metaContent(doc, "property", "og:title") ||
    (doc.querySelector("h1")?.textContent || "").trim();
  if (!title) return null;

  const link =
    metaContent(doc, "property", "og:url") ||
    `https://www.flayrah.com/node/${id}`;

  const descriptionHtml = extractBodyHtml(doc, id);
  if (!descriptionHtml) return null;

  const publishedAt =
    metaContent(doc, "property", "article:published_time") || "";
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const ogImage = metaContent(doc, "property", "og:image");

  return {
    id,
    title,
    link,
    author: authorFromDoc(doc),
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags: tagsFromDoc(doc),
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl: ogImage || firstImageUrl(descriptionHtml),
    fromArchive: true,
  };
}
