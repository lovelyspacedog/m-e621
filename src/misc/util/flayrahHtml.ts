/**
 * Sanitize Flayrah article HTML for in-app rendering.
 * Rewrites flayrah.com images through /api/download.
 */

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

const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON"]);

function isFlayrahHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "flayrah.com" || h === "www.flayrah.com";
}

export function absolutizeFlayrahUrl(raw: string): string | null {
  let src = (raw || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) src = `https:${src}`;
  if (src.startsWith("/")) src = `https://www.flayrah.com${src}`;
  try {
    const u = new URL(src);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function proxyDownloadUrl(absoluteUrl: string): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/download?url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteImgSrc(src: string): string | null {
  const abs = absolutizeFlayrahUrl(src);
  if (!abs) return null;
  try {
    const host = new URL(abs).hostname;
    if (isFlayrahHost(host)) return proxyDownloadUrl(abs);
    // Allow other http(s) images as-is (external embeds in articles).
    return abs;
  } catch {
    return null;
  }
}

function rewriteSrcset(srcset: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const bits = trimmed.split(/\s+/);
      const url = bits[0];
      const rewritten = rewriteImgSrc(url);
      if (!rewritten) return "";
      return [rewritten, ...bits.slice(1)].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function sanitizeElement(el: Element): void {
  const tag = el.tagName.toUpperCase();
  if (DROP_TAGS.has(tag)) {
    el.remove();
    return;
  }

  // Walk children first (copy list — mutations).
  const children = Array.from(el.children);
  for (const child of children) sanitizeElement(child);

  if (!ALLOWED_TAGS.has(tag) && tag !== "BODY" && tag !== "HTML") {
    // Unwrap unknown tags: keep (already sanitized) children.
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
    return;
  }

  // Drop event handlers and dangerous attrs.
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "srcdoc") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (tag === "A" && name === "href") {
      const abs = absolutizeFlayrahUrl(attr.value);
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
        const next = rewriteImgSrc(attr.value);
        if (!next) {
          el.remove();
          return;
        }
        el.setAttribute("src", next);
        el.setAttribute("loading", "lazy");
        continue;
      }
      if (name === "srcset") {
        const next = rewriteSrcset(attr.value);
        if (next) el.setAttribute("srcset", next);
        else el.removeAttribute("srcset");
        continue;
      }
    }
  }
}

/** Return sanitized HTML safe for v-html. */
export function sanitizeFlayrahHtml(html: string): string {
  if (!html) return "";
  const wrapped = `<div id="flayrah-root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("flayrah-root");
  if (!root) return "";
  sanitizeElement(root);
  return root.innerHTML;
}
