/** Random e621 tag wiki first-paragraph snippets for the landing page. */

export interface TagWikiSnippet {
  id: number;
  title: string;
  paragraph: string;
}

const WIKI_ORIGIN = "https://e621.net";
const WIKI_HOME_PATH = "/wiki_pages/204";
const CLIENT = "PawFeed/landing-tag-wiki";
const BATCH = 48;
const MAX_FETCH_TRIES = 4;
const MIN_PARAGRAPH = 40;

export function wikiHomeUrl(): string {
  return `${WIKI_ORIGIN}${WIKI_HOME_PATH}`;
}

export function wikiPageUrl(title: string): string {
  return `${WIKI_ORIGIN}/wiki_pages/${encodeURIComponent(title)}`;
}

export function displayWikiTitle(title: string): string {
  return title.replace(/_/g, " ");
}

function wikiApiUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(`${WIKI_ORIGIN}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("_client", CLIENT);
  return url.toString();
}

/** Strip common DText so the landing snippet reads as plain prose. */
export function stripDtext(raw: string): string {
  let s = raw;
  s = s.replace(/\[\[([^\]|#]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[#([^\]]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]|#]+)\]\]/g, "$1");
  s = s.replace(/"([^"]+)":\[[^\]]*\]/g, "$1");
  s = s.replace(/"([^"]+)":https?:\/\/\S+/gi, "$1");
  s = s.replace(/\[\/?(?:b|i|u|s|sup|sub|spoiler|color|quote|code|section|expand)(?:=[^\]]*)?\]/gi, "");
  s = s.replace(/thumb\s+#\d+/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * First usable prose paragraph from a wiki body (skips headings / thumb grids).
 */
export function firstWikiParagraph(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const blocks = normalized.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^h[1-6]\./i.test(line))
      .filter((line) => !/^thumb\s+#/i.test(line));
    if (!lines.length) continue;
    const text = stripDtext(lines.join(" "));
    if (text.length >= MIN_PARAGRAPH) return text;
  }

  // Single-block pages (no blank lines): take text after skipping leading thumbs/headings.
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^h[1-6]\./i.test(line))
    .filter((line) => !/^thumb\s+#/i.test(line));
  if (!lines.length) return "";
  const text = stripDtext(lines.join(" "));
  return text.length >= MIN_PARAGRAPH ? text : "";
}

function isTagWikiCandidate(page: {
  is_deleted?: boolean;
  category_id?: number | null;
  title?: string;
  body?: string;
}): boolean {
  if (page.is_deleted) return false;
  if (page.category_id == null) return false;
  const title = typeof page.title === "string" ? page.title : "";
  if (!title || title.includes(":")) return false;
  return Boolean((page.body || "").trim());
}

function snippetFromPage(page: {
  id: number;
  title: string;
  body: string;
}): TagWikiSnippet | null {
  const paragraph = firstWikiParagraph(page.body);
  if (!paragraph) return null;
  return { id: page.id, title: page.title, paragraph };
}

async function fetchMaxWikiId(): Promise<number> {
  const url = wikiApiUrl("/wiki_pages.json", {
    limit: 1,
    "search[order]": "id_desc",
    "search[is_deleted]": "false",
  });
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`wiki max-id HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ id?: number }>;
  const id = rows[0]?.id;
  if (!Number.isFinite(id) || (id as number) < 1) throw new Error("wiki max-id missing");
  return id as number;
}

async function fetchWikiBatchBefore(id: number): Promise<TagWikiSnippet[]> {
  const url = wikiApiUrl("/wiki_pages.json", {
    limit: BATCH,
    // b{id} → wiki pages with id < id (works with search[order]=id_desc)
    page: `b${id}`,
    "search[order]": "id_desc",
    "search[is_deleted]": "false",
  });
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`wiki batch HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    id: number;
    title: string;
    body: string;
    is_deleted?: boolean;
    category_id?: number | null;
  }>;
  if (!Array.isArray(rows)) return [];
  const out: TagWikiSnippet[] = [];
  for (const row of rows) {
    if (!isTagWikiCandidate(row)) continue;
    const snip = snippetFromPage(row);
    if (snip) out.push(snip);
  }
  return out;
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

export async function fetchRandomTagWikiSnippet(
  excludeTitle?: string,
): Promise<TagWikiSnippet | null> {
  const maxId = await fetchMaxWikiId();
  const minAnchor = BATCH + 1;
  const span = Math.max(1, maxId - minAnchor);

  for (let attempt = 0; attempt < MAX_FETCH_TRIES; attempt++) {
    const anchor = Math.floor(Math.random() * span) + minAnchor;
    const batch = await fetchWikiBatchBefore(anchor);
    const pool =
      excludeTitle && batch.length > 1
        ? batch.filter((s) => s.title !== excludeTitle)
        : batch;
    const picked = pickRandom(pool);
    if (picked) return picked;
  }

  return null;
}
