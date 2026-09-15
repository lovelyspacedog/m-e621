/**
 * Tailspace API client.
 *
 * All Tailspace calls go through our local proxy (/api/tailspace/*)
 * because tailspace.com returns no CORS headers.
 *
 * Protocol (Remix / React Router single-fetch, discovered 2026-09):
 * - Session cookie: `tailspace_session=<value>` (also clears `yiffer-act-as` on logout)
 * - Login: POST /login.data  fields: username, password, redirect
 * - Logout: POST /logout.data
 * - Me / verify: GET /browse-feed.data with Cookie (root.user / isLoggedIn+username)
 * - Feed: GET /api/get-feed-paginated?page=N (auth required)
 * - Like: POST /api/post-toggle-like.data  fields: postId
 * - Stars: POST /api/update-your-stars.data  fields: comicId, stars
 * - Comment (post): POST /api/post-add-comment.data  fields: postId, comment
 * - Comment (comic): POST /api/add-comment.data  fields: comicId, comment
 * - Follow: POST /api/follow-artist.data  fields: creatorUserId, action=follow|unfollow
 *
 * Client sends the session as `X-Tailspace-Session`; the proxy forwards Cookie.
 * Call `setActiveTailspaceSession` from Vue (via useTailspaceSession) — do not
 * import Pinia here; this module is also pulled into the ApiService worker.
 */
import type {
  TailspacePostsResponse,
  TailspaceComicsResponse,
  TailspaceCommentsResponse,
  TailspaceComicDetail,
  TailspaceAuthResult,
  TailspaceLikeResult,
} from "./types";

export * from "./types";

/** CDN base for all Tailspace media. */
export const TAILSPACE_CDN = "https://pics.tailspace.com";

let activeSession: string | null = null;
const sessionClearedListeners = new Set<() => void>();

/** Sync the in-memory session used for `X-Tailspace-Session` on proxy calls. */
export function setActiveTailspaceSession(cookies: string | null | undefined) {
  const v = (cookies || "").trim();
  activeSession = v || null;
}

/** Current session cookie string (`tailspace_session=…`), if any. */
export function currentTailspaceSession(): string | null {
  return activeSession;
}

export function isTailspaceLoggedIn(): boolean {
  return !!activeSession;
}

/** Called when the proxy reports the stored session was rejected by Tailspace. */
export function onTailspaceSessionCleared(cb: () => void): () => void {
  sessionClearedListeners.add(cb);
  return () => sessionClearedListeners.delete(cb);
}

function notifySessionCleared() {
  activeSession = null;
  for (const cb of sessionClearedListeners) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
}

function noteSessionRejected(response: Response) {
  if (response.headers.get("X-Tailspace-Session-Rejected") === "1") {
    notifySessionCleared();
  }
}

/** Resolve the proxy base URL for the current environment. */
function proxyBase(): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/api/tailspace`;
}

function sessionHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (activeSession) headers["X-Tailspace-Session"] = activeSession;
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: sessionHeaders(init?.headers),
  });
  noteSessionRejected(response);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const err = (await response.json()) as { message?: string };
      if (err?.message) message = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Tailspace proxy error: ${message}`);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(`${proxyBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(
  username: string,
  password: string,
): Promise<TailspaceAuthResult> {
  const result = await postJson<TailspaceAuthResult>("/login", {
    username,
    password,
    redirect: "",
  });
  if (result.cookies) setActiveTailspaceSession(result.cookies);
  return result;
}

export async function loginWithCookies(cookies: string): Promise<TailspaceAuthResult> {
  const result = await postJson<TailspaceAuthResult>("/login-cookies", { cookies });
  if (result.cookies) setActiveTailspaceSession(result.cookies);
  return result;
}

export async function me(cookies?: string | null): Promise<TailspaceAuthResult> {
  if (cookies) setActiveTailspaceSession(cookies);
  return postJson<TailspaceAuthResult>("/me", cookies ? { cookies } : {});
}

export async function logoutLocal(cookies?: string | null): Promise<void> {
  try {
    await postJson("/logout", cookies ? { cookies } : {});
  } catch {
    /* local clear still happens in UI */
  }
  setActiveTailspaceSession(null);
}

// ---------------------------------------------------------------------------
// Posts / feed
// ---------------------------------------------------------------------------

export async function getPosts(page: number): Promise<TailspacePostsResponse> {
  const url = `${proxyBase()}/posts?page=${page}`;
  const raw = await fetchJson<TailspacePostsResponse & { data?: TailspacePostsResponse }>(url);
  if (raw && Array.isArray(raw.posts)) return raw;
  if (raw?.data && Array.isArray(raw.data.posts)) return raw.data;
  return { posts: [], hasNextPage: false };
}

/** Following / updates feed (requires login). */
export async function getFeed(page: number): Promise<TailspacePostsResponse> {
  const url = `${proxyBase()}/feed?page=${page}`;
  const raw = await fetchJson<TailspacePostsResponse & { data?: TailspacePostsResponse }>(url);
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
// Mutations
// ---------------------------------------------------------------------------

export function toggleLike(postId: number): Promise<TailspaceLikeResult> {
  return postJson<TailspaceLikeResult>("/like", { postId });
}

export function updateStars(comicId: number, stars: number): Promise<{ ok: boolean; stars: number }> {
  return postJson("/star", { comicId, stars });
}

export function addComment(args: {
  comment: string;
  postId?: number;
  comicId?: number;
}): Promise<{ ok: boolean }> {
  return postJson("/comment", args);
}

export function followArtist(
  creatorUserId: number,
  action: "follow" | "unfollow",
): Promise<{ ok: boolean; following: boolean }> {
  return postJson("/follow", { creatorUserId, action });
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
