/**
 * u18chan HTML parsers shared by the Vite u18chan proxy and contract tests.
 * Production mirrors live in u18chan_proxy.py; keep scrapers in sync with fixtures.
 */

import { isBlockedU18chanBoard } from "../../misc/util/u18chanBoards";

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

export function mediaProxyUrl(upstream: string): string {
  return `/api/u18chan/media?url=${encodeURIComponent(upstream)}`;
}

export function rewriteMedia(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (u.startsWith("//")) u = `https:${u}`;
  if (!u.startsWith("http")) return null;
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.endsWith("u18chan.com")) return null;
    return mediaProxyUrl(parsed.href);
  } catch {
    return null;
  }
}

export function parseCatalog(html: string): Array<{
  id: number;
  liveBoard: string;
  subject: string;
  thumbUrl: string | null;
  href: string;
}> {
  const threads: Array<{
    id: number;
    liveBoard: string;
    subject: string;
    thumbUrl: string | null;
    href: string;
  }> = [];
  const itemRe =
    /<div class="item">\s*<div class="Subject">(.*?)<\/(?:div|a)>\s*<div class="layoutHeight"><a class="thumbnail_link" href="(https?:\/\/u18chan\.com\/([^/"']+)\/topic\/(\d+))"[^>]*>\s*<img[^>]+src="([^"]+)"/gis;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html))) {
    const liveBoard = m[3].toLowerCase();
    if (isBlockedU18chanBoard(liveBoard)) continue;
    const id = Number(m[4]);
    const subject = stripTags(m[1]) || "No Subject";
    const thumb = rewriteMedia(m[5]);
    threads.push({
      id,
      liveBoard,
      subject,
      thumbUrl: thumb,
      href: m[2],
    });
  }
  return threads;
}

export interface ParsedU18chanPost {
  id: number;
  name: string;
  subject: string;
  timestamp: string;
  comment: string;
  images: Array<{ fullUrl: string; thumbUrl: string }>;
  isOp: boolean;
}

export function parsePostChunk(
  pid: string,
  chunk: string,
  isOp: boolean,
): ParsedU18chanPost {
  const nameM = chunk.match(/class="UserName">(.*?)<\/span>/s);
  const subjM = chunk.match(/class="Subject">(.*?)<\/span>/s);
  const dateM = chunk.match(/<\/span>\s*([\d/]+\s+[\d:]+)/);
  let comment = "";
  const msgM = chunk.match(
    new RegExp(`id="post_${pid}_message_div">(.*?)</span>`, "s"),
  );
  if (msgM) comment = stripTags(msgM[1]);
  if (!comment) {
    const edit = chunk.match(
      new RegExp(
        `EditPost\\(${pid},\\s*'((?:\\\\'|[^'])*)',\\s*'((?:\\\\'|[^'])*)',\\s*'((?:\\\\'|[^'])*)',\\s*'((?:\\\\'|[^'])*)'`,
      ),
    );
    if (edit) {
      comment = decodeEntities(edit[4].replace(/\\'/g, "'"));
    }
  }
  const images: Array<{ fullUrl: string; thumbUrl: string }> = [];
  const imgRe = new RegExp(
    `<a href="(https://u18chan\\.com/uploads/data/[^"]+)"[^>]*>\\s*<img[^>]*id="post_${pid}_image"[^>]*(?:data-original="([^"]*)")?`,
    "gis",
  );
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(chunk))) {
    const full = rewriteMedia(im[1]) || im[1];
    const thumb = rewriteMedia(im[2] || im[1]) || full;
    images.push({ fullUrl: full, thumbUrl: thumb });
  }
  if (!images.length) {
    const lazy = chunk.match(
      new RegExp(
        `<img[^>]*id="post_${pid}_image"[^>]*data-original="([^"]+)"`,
        "i",
      ),
    );
    if (lazy) {
      const thumb = rewriteMedia(lazy[1]) || lazy[1];
      images.push({ fullUrl: thumb, thumbUrl: thumb });
    }
  }
  return {
    id: Number(pid),
    name: nameM ? stripTags(nameM[1]) : "Anonymous",
    subject: subjM ? stripTags(subjM[1]) : "",
    timestamp: dateM ? dateM[1].trim() : "",
    comment,
    images,
    isOp,
  };
}

export function parseThread(
  html: string,
  liveBoard: string,
  topicId: number,
  indexBoard: string,
) {
  const firstReply = html.search(/class="ReplyBox"/i);
  const opZone = firstReply >= 0 ? html.slice(0, firstReply) : html;
  const opIdM =
    opZone.match(/id="post_(\d+)_image"/) ||
    opZone.match(/name="post_(\d+)"/);
  if (!opIdM) throw new Error("could not parse thread OP");
  const posts: ParsedU18chanPost[] = [parsePostChunk(opIdM[1], opZone, true)];
  const parts = html.split(/<td[^>]*class="ReplyBox"[^>]*id="replybox_(\d+)"/i);
  for (let i = 1; i < parts.length; i += 2) {
    const pid = parts[i];
    const chunk = parts[i + 1] || "";
    posts.push(parsePostChunk(pid, chunk.slice(0, 12000), false));
  }
  const subject =
    posts.find((p) => p.subject)?.subject ||
    posts[0]?.subject ||
    `Thread ${topicId}`;
  return {
    id: topicId,
    liveBoard,
    indexBoard,
    subject,
    posts,
  };
}
