/**
 * Sanitize news article HTML for in-app rendering.
 * Rewrites Flayrah / Dogpatch images through /api/download.
 */

import type { NewsSource } from "@/worker/news/ids";

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

function isProxiedMediaHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "flayrah.com" ||
    h === "www.flayrah.com" ||
    h === "dogpatch.press" ||
    h === "www.dogpatch.press" ||
    h.endsWith(".wp.com") ||
    h.endsWith(".wordpress.com")
  );
}

function baseOriginForSource(source?: NewsSource): string {
  return source === "dogpatch"
    ? "https://dogpatch.press"
    : "https://www.flayrah.com";
}

export function absolutizeNewsUrl(
  raw: string,
  source?: NewsSource,
): string | null {
  let src = (raw || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) src = `https:${src}`;
  if (src.startsWith("/")) src = `${baseOriginForSource(source)}${src}`;
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

function rewriteImgSrc(src: string, source?: NewsSource): string | null {
  const abs = absolutizeNewsUrl(src, source);
  if (!abs) return null;
  try {
    const host = new URL(abs).hostname;
    if (isProxiedMediaHost(host)) return proxyDownloadUrl(abs);
    return abs;
  } catch {
    return null;
  }
}

function rewriteSrcset(srcset: string, source?: NewsSource): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const bits = trimmed.split(/\s+/);
      const url = bits[0];
      const rewritten = rewriteImgSrc(url, source);
      if (!rewritten) return "";
      return [rewritten, ...bits.slice(1)].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function sourceEmbedLabel(source?: NewsSource): string {
  if (source === "dogpatch") return "Dogpatch Press";
  if (source === "flayrah") return "Flayrah";
  return "the original site";
}

/** Replace dropped media embeds with an attributed outbound link. */
function embedPlaceholder(el: Element, source?: NewsSource): HTMLElement {
  const raw =
    el.getAttribute("src") ||
    el.querySelector("source")?.getAttribute("src") ||
    "";
  const abs = raw ? absolutizeNewsUrl(raw, source) : null;
  const label = sourceEmbedLabel(source);
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

function sanitizeElement(el: Element, source?: NewsSource): void {
  const tag = el.tagName.toUpperCase();
  if (
    tag === "IFRAME" ||
    tag === "VIDEO" ||
    tag === "EMBED" ||
    tag === "OBJECT"
  ) {
    el.replaceWith(embedPlaceholder(el, source));
    return;
  }
  if (DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }

  const children = Array.from(el.children);
  for (const child of children) sanitizeElement(child, source);

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
    if (tag === "A" && name === "href") {
      const abs = absolutizeNewsUrl(attr.value, source);
      if (!abs) {
        el.removeAttribute("href");
        continue;
      }
      el.setAttribute("href", abs);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      continue;
    }
    if (tag === "IMG") {
      if (name === "src") {
        const next = rewriteImgSrc(attr.value, source);
        if (!next) {
          el.remove();
          return;
        }
        el.setAttribute("src", next);
        el.setAttribute("loading", "lazy");
        continue;
      }
      if (name === "srcset") {
        const next = rewriteSrcset(attr.value, source);
        if (next) el.setAttribute("srcset", next);
        else el.removeAttribute("srcset");
        continue;
      }
    }
  }
}

/** Return sanitized HTML safe for v-html. */
export function sanitizeNewsHtml(html: string, source?: NewsSource): string {
  if (!html) return "";
  const wrapped = `<div id="news-root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("news-root");
  if (!root) return "";
  sanitizeElement(root, source);
  return root.innerHTML;
}

/** @deprecated */
export const sanitizeFlayrahHtml = (html: string) =>
  sanitizeNewsHtml(html, "flayrah");
