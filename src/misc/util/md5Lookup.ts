import SparkMD5 from "spark-md5";
import type { EnhancedPost } from "@/worker/ApiService";
import { openUrlInNewTab } from "@/misc/util/url";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import { SITE_MODE_URLS } from "@/services/types";

const MD5_HEX = /^[a-f0-9]{32}$/i;
const md5Cache = new Map<string, string>();

export const isE621Md5Hex = (value?: string | null): value is string =>
  !!value && MD5_HEX.test(value.trim());

/** Cache key for Local posts (path) or remote (id+mode). */
const cacheKeyFor = (post: EnhancedPost): string => {
  const local = post.__meta?.localPath;
  if (local) return `local:${local}`;
  const origin = post.__meta?.originMode || "unknown";
  return `${origin}:${post.id}`;
};

export const md5HexFromBuffer = (data: ArrayBuffer): string => {
  const spark = new SparkMD5.ArrayBuffer();
  spark.append(data);
  return spark.end();
};

/** Fetch bytes for hashing (blob: Local URLs, or proxied https file). */
export const fetchPostBytesForMd5 = async (
  post: EnhancedPost,
): Promise<ArrayBuffer> => {
  const url = post.file?.url || "";
  if (!url) throw new Error("No file URL to hash");
  if (url.startsWith("blob:") || url.startsWith("http") || url.startsWith("/")) {
    const fetchUrl =
      url.startsWith("blob:") || url.startsWith("/")
        ? url
        : proxyDownloadUrl(url) || url;
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    return response.arrayBuffer();
  }
  throw new Error("Unsupported file URL for hashing");
};

/**
 * Return a 32-hex MD5 suitable for e621 `md5:` search.
 * Reuses `file.md5` when valid; otherwise hashes the file and caches.
 * Does not overwrite Furbooru SHA-512 (or other non-MD5) display values.
 */
export const ensurePostMd5 = async (post: EnhancedPost): Promise<string> => {
  if (isE621Md5Hex(post.file?.md5)) {
    return post.file.md5.toLowerCase();
  }
  const key = cacheKeyFor(post);
  const cached = md5Cache.get(key);
  if (cached) {
    if (!post.file.md5) post.file.md5 = cached;
    return cached;
  }
  const data = await fetchPostBytesForMd5(post);
  const hash = md5HexFromBuffer(data);
  md5Cache.set(key, hash);
  // Only write when empty/missing — keep SHA-512 / Soft id in the md5 slot.
  if (!post.file.md5) post.file.md5 = hash;
  return hash;
};

export const e621Md5SearchUrl = (md5: string, baseUrl?: string): string => {
  const base = (baseUrl || SITE_MODE_URLS.e621).replace(/\/?$/, "/");
  return `${base}posts?tags=${encodeURIComponent(`md5:${md5.toLowerCase()}`)}`;
};

/** Resolve MD5 (compute if needed) and open e621 reverse lookup. */
export const findPostOnE621ByMd5 = async (
  post: EnhancedPost,
  baseUrl?: string,
): Promise<string> => {
  const md5 = await ensurePostMd5(post);
  const url = e621Md5SearchUrl(md5, baseUrl);
  openUrlInNewTab(url);
  return md5;
};

export const postCanMd5Lookup = (post: EnhancedPost | null | undefined): boolean => {
  if (!post?.file) return false;
  if (isE621Md5Hex(post.file.md5)) return true;
  const url = post.file.url || "";
  return (
    url.startsWith("blob:") ||
    url.startsWith("/") ||
    /^https?:\/\//i.test(url)
  );
};
