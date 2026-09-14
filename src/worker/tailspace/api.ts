/**
 * Tailspace API client.
 *
 * All Tailspace calls go through our local proxy (/api/tailspace/*)
 * because tailspace.com returns no CORS headers.
 */
import type {
  TailspacePostsResponse,
  TailspaceComicsResponse,
  TailspaceCommentsResponse,
  TailspaceComicDetail,
} from "./types";

export * from "./types";

/** CDN base for all Tailspace media. */
export const TAILSPACE_CDN = "https://pics.tailspace.com";

/** Resolve the proxy base URL for the current environment. */
function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/tailspace`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Tailspace proxy error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function getPosts(page: number): Promise<TailspacePostsResponse> {
  const url = `${proxyBase()}/posts?page=${page}`;
  const raw = await fetchJson<TailspacePostsResponse & { data?: TailspacePostsResponse }>(url);
  // Defensive: accept either flat {posts,hasNextPage} or wrapped {data:{...}}
  if (raw && Array.isArray(raw.posts)) return raw;
  if (raw?.data && Array.isArray(raw.data.posts)) return raw.data;
  return { posts: [], hasNextPage: false };
}

export function getPostComments(
  username: string,
  postId: number,
): Promise<TailspaceCommentsResponse> {
  const q = new URLSearchParams({
    username,
    postId: String(postId),
  });
  return fetchJson<TailspaceCommentsResponse>(`${proxyBase()}/comments?${q}`);
}

// ---------------------------------------------------------------------------
// Comics
// ---------------------------------------------------------------------------

export interface ComicsParams {
  page?: number;
  search?: string;
  /** Category filter(s). "All" means no filter. */
  categories?: string[];
  sort?: string;
  tagIDs?: number[];
  excludeTagIDs?: number[];
  finishedOnly?: boolean;
}

export function getComics(params: ComicsParams = {}): Promise<TailspaceComicsResponse> {
  const q = new URLSearchParams();
  if (params.page && params.page > 1) q.set("page", String(params.page));
  if (params.search) q.set("search", params.search);
  if (params.categories && params.categories.length > 0 && !params.categories.includes("All")) {
    for (const c of params.categories) q.append("c", c);
  }
  // Tailspace expects lowercase hyphenated sort keys (e.g. "alphabetical").
  if (params.sort && params.sort !== "Updated") {
    q.set("sort", params.sort.toLowerCase().replace(/\s+/g, "-"));
  }
  for (const id of params.tagIDs ?? []) q.append("tag", String(id));
  for (const id of params.excludeTagIDs ?? []) q.append("excludeTag", String(id));
  if (params.finishedOnly) q.set("finishedOnly", "true");

  const qs = q.toString();
  const url = `${proxyBase()}/comics${qs ? `?${qs}` : ""}`;
  return fetchJson<TailspaceComicsResponse>(url);
}

export function getComic(name: string): Promise<TailspaceComicDetail> {
  const q = new URLSearchParams({ name });
  return fetchJson<TailspaceComicDetail>(`${proxyBase()}/comic?${q}`);
}

// ---------------------------------------------------------------------------
// Media URL helpers
// ---------------------------------------------------------------------------

/** Thumbnail for a post media item (mini JPEG). */
export function postMediaThumb(token: string): string {
  return `${TAILSPACE_CDN}/post-media/${token}-mini.jpg`;
}

/** Full-size URL for a post media item. */
export function postMediaFull(token: string, fileType: string): string {
  return `${TAILSPACE_CDN}/post-media/${token}.${fileType}`;
}

/** Profile photo for a Tailspace user. */
export function profilePhoto(token: string): string {
  return `${TAILSPACE_CDN}/profile-photos/${token}.jpg`;
}

/** Thumbnail for a comic series. */
export function comicThumb(id: number, version: number, size: "1x" | "2x" = "2x"): string {
  return `${TAILSPACE_CDN}/comics/${id}/thumbnail-${size}.webp?v=${version ?? 0}`;
}

/** Full-size comic page image. */
export function comicPageFull(comicId: number, token: string, fileType = "jpg"): string {
  return `${TAILSPACE_CDN}/comics/${comicId}/${token}.${fileType || "jpg"}`;
}

/** Mini comic page thumbnail. */
export function comicPageThumb(comicId: number, token: string): string {
  return `${TAILSPACE_CDN}/comics/${comicId}/${token}-mini.jpg`;
}

/** External URL to a comic on Tailspace (`/c/{name}`). */
export function comicUrl(comicName: string): string {
  return `https://tailspace.com/c/${encodeURIComponent(comicName)}`;
}

/** External URL to a post on Tailspace. */
export function postUrl(creatorUsername: string, postId: number): string {
  return `https://tailspace.com/artist/${creatorUsername}/post/${postId}`;
}
