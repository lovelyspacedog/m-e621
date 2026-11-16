import JSZip from "jszip";
import { downloadjs } from "@/Settings/download";
import { fetchViaDownloadProxy, proxyDownloadUrl } from "@/misc/util/mediaProxy";

export type ComicCbzEntry = {
  /** Absolute or same-origin-proxied URL */
  url: string;
  /** In-archive name, e.g. `001.jpg` */
  archiveName: string;
};

export type ComicCbzProgress = {
  done: number;
  total: number;
  failed: number;
};

export type DownloadComicCbzOptions = {
  filename: string;
  concurrency?: number;
  confirmOver?: number;
  onProgress?: (p: ComicCbzProgress) => void;
};

export const CBZ_MIME = "application/vnd.comicbook+zip";

const sanitizeSegment = (raw: string, maxLen = 120) => {
  const cleaned = raw
    .replace(/[<>:"|?*\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, maxLen)
    .trim();
  return cleaned || "comic";
};

export const buildComicCbzFilename = (...titleParts: (string | null | undefined)[]) => {
  const parts = titleParts
    .map((p) => sanitizeSegment((p || "").trim()))
    .filter((p) => p && p !== "comic");
  const base = parts.length ? parts.join(" - ") : "comic";
  return `${base}.cbz`;
};

const extFromMime = (mime: string): string => {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  return "bin";
};

const extFromUrl = (url: string): string | null => {
  try {
    const path = new URL(url, "https://local.invalid").pathname;
    const base = path.split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot > 0) {
      const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (ext) return ext;
    }
  } catch {
    /* ignore */
  }
  return null;
};

/** Zero-padded archive member name for ordered pages. */
export const comicCbzArchiveName = (
  pageIndex: number,
  url: string,
  hintExt?: string | null,
) => {
  const pad = String(Math.max(1, pageIndex)).padStart(3, "0");
  const ext =
    (hintExt || "").replace(/^\./, "").toLowerCase() ||
    extFromUrl(url) ||
    "jpg";
  return `${pad}.${ext}`;
};

export const entriesFromUrls = (
  urls: string[],
  opts?: { extHints?: (string | null | undefined)[] },
): ComicCbzEntry[] =>
  urls.map((url, i) => ({
    url,
    archiveName: comicCbzArchiveName(i + 1, url, opts?.extHints?.[i]),
  }));

async function fetchPageBlob(proxiedUrl: string): Promise<{ blob: Blob; archiveName?: string }> {
  const res = await fetchViaDownloadProxy(proxiedUrl);
  const blob = await res.blob();
  return { blob };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function downloadComicCbz(
  entries: ComicCbzEntry[],
  opts: DownloadComicCbzOptions,
): Promise<{ ok: number; failed: number }> {
  const total = entries.length;
  if (!total) throw new Error("Nothing to download");
  const confirmOver = opts.confirmOver ?? 50;
  if (total > confirmOver) {
    const ok = window.confirm(
      `Download ${total} pages as one CBZ file? This may take a while and uses memory while zipping.`,
    );
    if (!ok) return { ok: 0, failed: 0 };
  }

  const concurrency = Math.max(1, opts.concurrency ?? 2);
  let done = 0;
  let failed = 0;
  const report = () => opts.onProgress?.({ done, total, failed });

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await mapWithConcurrency(entries, concurrency, async (entry) => {
    const proxied = proxyDownloadUrl(entry.url) || entry.url;
    try {
      const { blob } = await fetchPageBlob(proxied);
      let name = entry.archiveName;
      if (!name.includes(".")) {
        name = `${name}.${extFromMime(blob.type) || extFromUrl(entry.url) || "bin"}`;
      }
      let finalName = name;
      let n = 2;
      while (usedNames.has(finalName)) {
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        finalName = `${stem}_${n}${ext}`;
        n += 1;
      }
      usedNames.add(finalName);
      zip.file(finalName, blob);
      done += 1;
    } catch {
      failed += 1;
    }
    report();
  });

  if (done === 0) {
    throw new Error("All pages failed to download");
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const filename = opts.filename.endsWith(".cbz") ? opts.filename : `${opts.filename}.cbz`;
  downloadjs(blob, filename, CBZ_MIME);
  return { ok: done, failed };
}