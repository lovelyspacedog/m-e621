/**
 * Parse arbitrary RSS 2.0 / Atom into custom News articles (no numeric post id).
 */

import {
  customItemKey,
  customNewsSourceKey,
  makeCustomNewsId,
} from "./customIds";
import {
  excerptFromDescription,
  firstImageUrl,
  mediaImageUrl,
  enclosureImageUrl,
  type NewsArticle,
} from "./parseRss";

function textContent(el: Element | null): string {
  return (el?.textContent || "").trim();
}

function childText(parent: Element, localName: string): string {
  const kids = parent.getElementsByTagName(localName);
  return textContent(kids[0] || null);
}

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
    const t = (el.getAttribute("term") || "").trim() || textContent(el);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  return tags;
}

function isAtomFeed(doc: Document): boolean {
  const root = doc.documentElement;
  if (!root) return false;
  const name = root.localName || root.tagName;
  return name.toLowerCase() === "feed";
}

function baseOriginFromUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Channel / feed title for the add-feed default label. */
export function customFeedTitleFromXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return "";
  if (isAtomFeed(doc)) {
    const feed = doc.documentElement;
    return feed ? childText(feed, "title") : "";
  }
  const channel = doc.getElementsByTagName("channel")[0];
  return channel ? childText(channel, "title") : "";
}

function pushArticle(
  out: NewsArticle[],
  opts: {
    feedId: string;
    title: string;
    link: string;
    guid: string;
    author: string;
    publishedAt: string;
    tags: string[];
    descriptionHtml: string;
    baseOrigin: string;
    itemEl: Element;
  },
): void {
  const { feedId, title, link, guid, author, publishedAt, tags, descriptionHtml, baseOrigin, itemEl } =
    opts;
  if (!title || !link) return;
  const key = customItemKey(guid || link);
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  out.push({
    id: makeCustomNewsId(feedId, key),
    source: customNewsSourceKey(feedId),
    title,
    link,
    author: author || "Unknown",
    publishedAt,
    publishedMs: Number.isFinite(publishedMs) ? publishedMs : 0,
    tags,
    descriptionHtml,
    excerpt: excerptFromDescription(descriptionHtml),
    thumbUrl:
      enclosureImageUrl(itemEl, baseOrigin) ||
      mediaImageUrl(itemEl, baseOrigin) ||
      firstImageUrl(descriptionHtml, baseOrigin),
    customFeedId: feedId,
  });
}

/**
 * Parse a custom feed. `feedId` is the local stable id (`c_…`).
 * `feedUrl` sets the base origin for relative image URLs.
 */
export function parseCustomNewsRss(
  xml: string,
  feedId: string,
  feedUrl: string,
): NewsArticle[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Failed to parse custom feed");
  }
  const baseOrigin = baseOriginFromUrl(feedUrl);
  const out: NewsArticle[] = [];

  if (isAtomFeed(doc)) {
    const entries = doc.getElementsByTagName("entry");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const title = childText(entry, "title");
      const link = atomLinkHref(entry);
      const idText = childText(entry, "id") || link;
      const descriptionHtml = atomContentHtml(entry);
      const publishedAt =
        childText(entry, "published") || childText(entry, "updated");
      pushArticle(out, {
        feedId,
        title,
        link,
        guid: idText,
        author: atomAuthor(entry),
        publishedAt,
        tags: atomCategories(entry),
        descriptionHtml,
        baseOrigin,
        itemEl: entry,
      });
    }
    return out;
  }

  const items = doc.getElementsByTagName("item");
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = childText(item, "title");
    const link = childText(item, "link");
    const guid = childText(item, "guid") || link;
    const descriptionHtml = descriptionHtmlFromItem(item);
    const pubDate = childText(item, "pubDate");
    pushArticle(out, {
      feedId,
      title,
      link,
      guid,
      author: creatorText(item),
      publishedAt: pubDate,
      tags: categories(item),
      descriptionHtml,
      baseOrigin,
      itemEl: item,
    });
  }
  return out;
}
