/**
 * FurAffinity HTML parsers shared by the Vite FA proxy and contract tests.
 * Production uses fa_proxy.py + faapi; keep scrape shapes in sync with fixtures.
 */

export const FA_ROOT = "https://www.furaffinity.net";

export const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export const absUrl = (url?: string) => {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${FA_ROOT}${url}`;
  return url;
};

export const stripTags = (html: string) =>
  decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );

export const tidyText = (value: string) => value.replace(/\s+/g, " ").trim();

/** FurAffinity popup_date uses unix seconds in data-time. */
export const parseFaTimestamp = (html: string): string => {
  const unix =
    /class="[^"]*popup_date[^"]*"[^>]*data-time="(\d+)"/.exec(html)?.[1] ||
    /data-time="(\d+)"[^>]*class="[^"]*popup_date/.exec(html)?.[1];
  if (unix) {
    const ms = Number(unix) * 1000;
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  }
  const title =
    /class="[^"]*popup_date[^"]*"[^>]*title="([^"]+)"/.exec(html)?.[1] ||
    /title="([^"]+)"[^>]*class="[^"]*popup_date/.exec(html)?.[1];
  if (title) {
    const parsed = new Date(title.replace(/(\d+)(st|nd|rd|th)/, "$1"));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
};

export type FaFigureHit = {
  id: number;
  title: string;
  author: { name: string };
  rating: string;
  type: string;
  thumbnail_url: string;
  kind: "submission";
  date?: string;
  width?: number;
  height?: number;
};

export const parseFigures = (html: string) => {
  const results: FaFigureHit[] = [];
  const re = /<figure\b([^>]*)>([\s\S]*?)<\/figure>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    const inner = match[2];
    const idM = /id=["']sid-(\d+)["']/.exec(attrs);
    if (!idM) continue;
    const classM = /class=["']([^"']*)["']/.exec(attrs);
    const classes = (classM?.[1] || "").split(/\s+/);
    const rating = (classes.find((c) => c.startsWith("r-")) || "r-general").slice(2);
    const type = (classes.find((c) => c.startsWith("t-")) || "t-image").slice(2);
    const titleM =
      /href=["']\/view\/\d+[^"']*["'][^>]*title=["']([^"']*)["']/.exec(inner) ||
      /title=["']([^"']*)["'][^>]*href=["']\/view\//.exec(inner);
    const authorM = /href=["']\/user\/[^"']+["'][^>]*title=["']([^"']*)["']/.exec(inner);
    const imgM = /<img\b([^>]*)>/i.exec(inner);
    const imgAttrs = imgM?.[1] || "";
    const src = /src=["']([^"']+)["']/.exec(imgAttrs)?.[1] || "";
    const thumbUrl = absUrl(src);
    const width = Number(/data-width=["']([^"']+)["']/.exec(imgAttrs)?.[1] || 0);
    const height = Number(/data-height=["']([^"']+)["']/.exec(imgAttrs)?.[1] || 0);
    const unix =
      /@\d+-(\d{9,})\./.exec(decodeURIComponent(thumbUrl))?.[1] ||
      /@\d+-(\d{9,})\./.exec(src)?.[1];
    const date =
      unix && Number.isFinite(Number(unix))
        ? new Date(Number(unix) * 1000).toISOString()
        : "";
    results.push({
      id: Number(idM[1]),
      title: decodeHtml(titleM?.[1] || ""),
      author: { name: decodeHtml(authorM?.[1] || "") },
      rating,
      type,
      thumbnail_url: thumbUrl,
      kind: "submission",
      ...(date ? { date } : {}),
      ...(width > 0 ? { width: Math.round(width) } : {}),
      ...(height > 0 ? { height: Math.round(height) } : {}),
    });
  }
  const hasNext = />\s*Next\s*</i.test(html) || /name=["']next_page["']/i.test(html);
  return { results, hasNext };
};

export const parseLoggedIn = (html: string) => {
  const m =
    /class=["'][^"']*loggedin_user_avatar[^"']*["'][^>]*alt=["']([^"']+)["']/.exec(html) ||
    /alt=["']([^"']+)["'][^>]*class=["'][^"']*loggedin_user_avatar/.exec(html);
  return m?.[1] || null;
};

export const parseSubmission = (html: string, id: number) => {
  const title =
    /<div class="submission-title">[\s\S]*?<h2>([^<]+)<\/h2>/.exec(html)?.[1] ||
    /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1] ||
    "";
  const author =
    /href="\/user\/([^"/]+)\/?"[^>]*class="[^"]*c-usernameBlock/.exec(html)?.[1] ||
    /href="\/user\/([^"/]+)\/?"/.exec(html)?.[1] ||
    "";
  const rating =
    /class="[^"]*c-contentRating--(\w+)/.exec(html)?.[1] ||
    />(General|Mature|Adult)</.exec(html)?.[1] ||
    "general";
  const tags = [...html.matchAll(/data-tag-name="([^"]+)"/g)].map((m) => m[1]);
  const download =
    [...html.matchAll(/href="([^"]+)"[^>]*>\s*Download/gi)][0]?.[1] || "";
  const submissionImg =
    /id="submissionImg"[^>]*src="([^"]+)"/.exec(html)?.[1] || "";
  const thumb =
    /id="submissionImg"[^>]*(?:data-preview-src|src)="([^"]+)"/.exec(html)?.[1] ||
    "";
  // Prefer an explicit Download link. Falling back to the preview image makes
  // stories/PDFs look like image posts and hides the real attachment.
  const file = download || submissionImg;
  const category =
    /Classified:\s*<\/strong>\s*<span[^>]*>\s*<a[^>]*>\s*([^<]+)/i.exec(html)?.[1] ||
    /">([^<]*(?:Story|Poetry|Music|Flash)[^<]*)<\/a>\s*<\/span>\s*<\/div>/i.exec(html)?.[1] ||
    "";
  const typeFromCategory = (() => {
    const c = category.toLowerCase();
    if (c.includes("story")) return "story";
    if (c.includes("poetry")) return "poetry";
    if (c.includes("music")) return "music";
    if (c.includes("flash")) return "flash";
    return "";
  })();
  const typeFromFile = (() => {
    const path = (absUrl(download || file) || "").split("?")[0].toLowerCase();
    if (
      path.endsWith(".pdf") ||
      path.endsWith(".txt") ||
      path.endsWith(".doc") ||
      path.endsWith(".docx") ||
      path.endsWith(".rtf")
    ) {
      return "story";
    }
    if (/\.(mp3|wav|flac|ogg)$/.test(path)) return "music";
    if (path.endsWith(".swf")) return "flash";
    return "";
  })();
  const fav =
    /href="(\/fav\/[^"]+)"/.exec(html)?.[1] ||
    /href="(\/unfav\/[^"]+)"/.exec(html)?.[1] ||
    "";
  const views = Number(/Views[\s\S]{0,80}?>(\d[\d,]*)/.exec(html)?.[1]?.replace(/,/g, "") || 0);
  const commentsN = Number(/Comments[\s\S]{0,80}?>(\d[\d,]*)/.exec(html)?.[1]?.replace(/,/g, "") || 0);
  const favs = Number(/Favorites[\s\S]{0,80}?>(\d[\d,]*)/.exec(html)?.[1]?.replace(/,/g, "") || 0);
  const descHtml =
    /class="[^"]*submission-description-text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] || "";
  const comments: Array<Record<string, unknown>> = [];
  const cre =
    /id="cid:(\d+)"[\s\S]*?class="[^"]*comment_username[^"]*"[^>]*>([^<]+)[\s\S]*?class="[^"]*comment_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = cre.exec(html))) {
    comments.push({
      id: Number(cm[1]),
      created_at: parseFaTimestamp(cm[0]),
      post_id: id,
      creator_id: 0,
      body: stripTags(cm[3] || ""),
      score: 0,
      updated_at: parseFaTimestamp(cm[0]),
      updater_id: 0,
      do_not_bump_post: false,
      is_hidden: false,
      is_sticky: false,
      creator_name: decodeHtml(cm[2] || ""),
      updater_name: decodeHtml(cm[2] || ""),
    });
  }
  return {
    id,
    title: tidyText(decodeHtml(title)),
    author: { name: decodeHtml(author) },
    rating: rating.toLowerCase(),
    type: typeFromCategory || typeFromFile || "image",
    thumbnail_url: absUrl(thumb),
    kind: "submission" as const,
    date: parseFaTimestamp(html),
    tags,
    description: stripTags(descHtml),
    file_url: absUrl(file),
    views,
    comment_count: commentsN,
    favorites: favs,
    favorite: fav.startsWith("/unfav/"),
    favorite_toggle_link: absUrl(fav),
    comments,
    details: true,
  };
};

export const parseJournals = (html: string) => {
  const results: Array<Record<string, unknown>> = [];
  const re = /<section[^>]*id=["']jid:(\d+)["'][^>]*>([\s\S]*?)<\/section>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const inner = match[2];
    const title = /<h2>([^<]+)<\/h2>/.exec(inner)?.[1] || "";
    const content = /class="journal-body"[^>]*>([\s\S]*?)<\/div>/.exec(inner)?.[1] || "";
    results.push({
      id: Number(match[1]),
      title: decodeHtml(title),
      author: { name: "" },
      rating: "general",
      type: "text",
      thumbnail_url: "",
      kind: "journal",
      description: stripTags(content),
      details: true,
    });
  }
  const hasNext = />\s*Next\s*</i.test(html);
  return { results, hasNext };
};
