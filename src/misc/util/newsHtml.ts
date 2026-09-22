/**
 * Sanitize news article HTML for in-app rendering.
 * Built-in outlets: rewrite allowlisted images through /api/download.
 * Custom feeds: rewrite feed/article-host images through /api/news/custom/media.
 */

import type { NewsSource } from "@/worker/news/ids";
import { isNewsSource, newsSourceLabel } from "@/worker/news/ids";
import {
  newsExactMediaHostSet,
  newsSourceBaseOrigin,
} from "@/worker/news/registry";
import { parseCustomNewsSourceKey } from "@/worker/news/customIds";

const ALLOWED_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CENTER",
  "CITE",
  "CODE",
  "DIV",
  "EM",
  "FIGCAPTION",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "IMG",
  "LI",
  "OL",
  "P",
  "PRE",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
]);

const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "FORM",
  "INPUT",
  "BUTTON",
]);

const EXACT_MEDIA_HOSTS = newsExactMediaHostSet();

export interface SanitizeNewsHtmlOpts {
  /** Built-in outlet or custom:feedId source key. */
  source?: string;
  /** Absolute article page URL (custom feeds). */
  articleUrl?: string;
  /** Custom feed RSS URL — media host allowlist. */
  feedUrl?: string;
  /** Display label for embed placeholders. */
  sourceLabel?: string;
}

function isProxiedMediaHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    EXACT_MEDIA_HOSTS.has(h) ||
    h.endsWith(".wp.com") ||
    h.endsWith(".wordpress.com")
  );
}

function baseOriginForSource(source?: string, articleUrl?: string): string {
  if (articleUrl) {
    try {
      return new URL(articleUrl).origin;
    } catch {
      /* fall through */
    }
  }
  if (source && isNewsSource(source)) return newsSourceBaseOrigin(source);
  if (source && parseCustomNewsSourceKey(source)) {
    return "https://example.invalid";
  }
  return "https://www.flayrah.com";
}

function allowedCustomMediaHosts(
  articleUrl?: string,
  feedUrl?: string,
): string[] {
  const hosts: string[] = [];
  for (const raw of [articleUrl, feedUrl]) {
    if (!raw) continue;
    try {
      hosts.push(new URL(raw).hostname.toLowerCase());
    } catch {
      /* skip */
    }
  }
  return [...new Set(hosts)];
}

export function absolutizeNewsUrl(
  raw: string,
  source?: string,
  articleUrl?: string,
): string | null {
  let src = (raw || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) src = `https:${src}`;
  if (src.startsWith("/")) {
    src = `${baseOriginForSource(source, articleUrl)}${src}`;
  }
  try {
    const u = new URL(src);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** @deprecated */
export const absolutizeFlayrahUrl = (raw: string) =>
  absolutizeNewsUrl(raw, "flayrah");

export function proxyDownloadUrl(absoluteUrl: string): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/download?url=${encodeURIComponent(absoluteUrl)}`;
}

export function proxyCustomMediaUrl(
  absoluteUrl: string,
  allowedHosts: string[],
): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  const qs = new URLSearchParams();
  qs.set("url", absoluteUrl);
  for (const h of allowedHosts) qs.append("allow", h);
  return `${origin}/api/news/custom/media?${qs.toString()}`;
}

function rewriteImgSrc(
  src: string,
  opts: SanitizeNewsHtmlOpts,
): string | null {
  const abs = absolutizeNewsUrl(src, opts.source, opts.articleUrl);
  if (!abs) return null;
  try {
    const host = new URL(abs).hostname;
    const customHosts = allowedCustomMediaHosts(opts.articleUrl, opts.feedUrl);
    if (customHosts.length && customHosts.includes(host.toLowerCase())) {
      return proxyCustomMediaUrl(abs, customHosts);
    }
    if (isProxiedMediaHost(host)) return proxyDownloadUrl(abs);
    return abs;
  } catch {
    return null;
  }
}

function rewriteSrcset(srcset: string, opts: SanitizeNewsHtmlOpts): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const bits = trimmed.split(/\s+/);
      const url = bits[0];
      const rewritten = rewriteImgSrc(url, opts);
      if (!rewritten) return "";
      return [rewritten, ...bits.slice(1)].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function sourceEmbedLabel(opts: SanitizeNewsHtmlOpts): string {
  if (opts.sourceLabel) return opts.sourceLabel;
  if (opts.source && isNewsSource(opts.source)) {
    return newsSourceLabel(opts.source as NewsSource);
  }
  return "the original site";
}

/** Replace dropped media embeds with an attributed outbound link. */
function embedPlaceholder(el: Element, opts: SanitizeNewsHtmlOpts): HTMLElement {
  const raw =
    el.getAttribute("src") ||
    el.querySelector("source")?.getAttribute("src") ||
    "";
  const abs = raw
    ? absolutizeNewsUrl(raw, opts.source, opts.articleUrl)
    : null;
  const label = sourceEmbedLabel(opts);
  const p = el.ownerDocument.createElement("p");
  p.setAttribute("class", "news-embed-placeholder");
  if (abs) {
    const a = el.ownerDocument.createElement("a");
    a.setAttribute("href", abs);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.textContent = `Open embed on ${label}`;
    p.appendChild(a);
  } else {
    p.textContent = `Embed removed — open the article on ${label}.`;
  }
  return p;
}

function sanitizeElement(el: Element, opts: SanitizeNewsHtmlOpts): void {
  const tag = el.tagName.toUpperCase();
  if (
    tag === "IFRAME" ||
    tag === "VIDEO" ||
    tag === "EMBED" ||
    tag === "OBJECT"
  ) {
    el.replaceWith(embedPlaceholder(el, opts));
    return;
  }
  if (DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }

  const children = Array.from(el.children);
  for (const child of children) sanitizeElement(child, opts);

  if (!ALLOWED_TAGS.has(tag) && tag !== "BODY" && tag !== "HTML") {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
    return;
  }

  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "srcdoc") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (tag === "A" && (name === "href" || name === "xlink:href")) {
      const abs = absolutizeNewsUrl(attr.value, opts.source, opts.articleUrl);
      el.removeAttribute(attr.name);
      if (!abs) continue;
      el.setAttribute("href", abs);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      continue;
    }
    if (tag === "IMG") {
      if (name === "src") {
        const next = rewriteImgSrc(attr.value, opts);
        if (!next) {
          el.remove();
          return;
        }
        el.setAttribute("src", next);
        el.setAttribute("loading", "lazy");
        continue;
      }
      if (name === "srcset") {
        const next = rewriteSrcset(attr.value, opts);
        if (next) el.setAttribute("srcset", next);
        else el.removeAttribute("srcset");
        continue;
      }
    }
  }
}

/** Return sanitized HTML safe for v-html. */
export function sanitizeNewsHtml(
  html: string,
  sourceOrOpts?: string | SanitizeNewsHtmlOpts,
): string {
  if (!html) return "";
  const opts: SanitizeNewsHtmlOpts =
    typeof sourceOrOpts === "string" || sourceOrOpts == null
      ? { source: sourceOrOpts }
      : sourceOrOpts;
  const wrapped = `<div id="news-root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("news-root");
  if (!root) return "";
  sanitizeElement(root, opts);
  return root.innerHTML;
}

/** @deprecated */
export const sanitizeFlayrahHtml = (html: string) =>
  sanitizeNewsHtml(html, "flayrah");
