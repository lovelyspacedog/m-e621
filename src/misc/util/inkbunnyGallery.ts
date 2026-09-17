import type { EnhancedPost } from "@/worker/ApiService";
import type { InkbunnyFile } from "@/worker/inkbunny/api";

/** Best download URL for an Inkbunny submission file (already proxied when from adapter). */
export const inkbunnyFileUrl = (file: InkbunnyFile): string =>
  file.file_url_full ||
  file.file_url_screen ||
  file.file_url_preview ||
  "";

export const inkbunnyFileExt = (file: InkbunnyFile): string => {
  const name = file.file_name || "";
  const fromName = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const mime = (file.mimetype || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "bin";
};

/** Files with a downloadable URL from `__meta.inkbunny.files` (gallery, not pools). */
export const postInkbunnyGalleryFiles = (post: EnhancedPost): InkbunnyFile[] => {
  const files = post.__meta?.inkbunny?.files || [];
  return files.filter((f) => Boolean(inkbunnyFileUrl(f)));
};

export const postHasInkbunnyGallery = (post: EnhancedPost): boolean =>
  postInkbunnyGalleryFiles(post).length > 1 ||
  (post.__meta?.inkbunny?.pagecount ?? 1) > 1;

/**
 * `artist/foo.jpg` + page 2 of 12 → `artist/foo_p02.jpg`.
 * Single-file posts unchanged.
 */
export const injectMultiFilePageSuffix = (
  relativePath: string,
  page: number,
  total: number,
): string => {
  if (total <= 1 || page < 1) return relativePath;
  const parts = relativePath.replace(/\\/g, "/").split("/");
  const last = parts.pop() || "file";
  const dot = last.lastIndexOf(".");
  const base = dot > 0 ? last.slice(0, dot) : last;
  const ext = dot > 0 ? last.slice(dot) : "";
  const width = Math.max(2, String(total).length);
  const pad = String(page).padStart(width, "0");
  parts.push(`${base}_p${pad}${ext}`);
  return parts.join("/");
};
