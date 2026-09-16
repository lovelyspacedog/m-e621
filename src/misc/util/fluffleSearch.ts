import type { EnhancedPost } from "@/worker/ApiService";
import { unwrapProxyDownloadUrl } from "@/misc/util/mediaProxy";

export type FluffleMatch = "exact" | "probable" | "unlikely";

export interface FluffleAuthor {
  id: string;
  name: string;
}

export interface FluffleThumbnail {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  url: string;
}

export interface FluffleResult {
  id: string;
  distance: number;
  match: FluffleMatch;
  platform: string;
  url: string;
  isSfw: boolean;
  thumbnail: FluffleThumbnail | null;
  authors: FluffleAuthor[];
}

export interface FluffleSearchResponse {
  id: string;
  results: FluffleResult[];
}

const FLUFFLE_STILL_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function isFluffleStillPost(post: EnhancedPost | null | undefined): boolean {
  if (!post) return false;
  const ext = (post.file?.ext || "").toLowerCase();
  return FLUFFLE_STILL_EXTS.has(ext);
}

/** Prefer sample → preview → file for smaller payloads. */
export function fluffleImageUrl(post: EnhancedPost): string | null {
  if (!isFluffleStillPost(post)) return null;
  const sample = post.sample?.url || "";
  const preview = post.preview?.url || "";
  const file = post.file?.url || "";
  for (const url of [sample, preview, file]) {
    // Accept absolute CDN URLs, or unwrap /api/download?url=… (FA / IB / Weasyl).
    const resolved = unwrapProxyDownloadUrl(url);
    if (resolved) return resolved;
  }
  return null;
}

export async function searchFluffle(
  post: EnhancedPost,
  limit = 8,
): Promise<FluffleResult[]> {
  const url = fluffleImageUrl(post);
  if (!url) {
    throw new Error("No searchable still image on this post");
  }
  const response = await fetch("/api/fluffle/exact-search", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, limit }),
  });
  if (response.status === 429) {
    throw new Error("Fluffle is busy — try again in a moment");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Fluffle search failed (${response.status})`);
  }
  if (!response.ok) {
    const err = payload as {
      message?: string;
      errors?: Array<{ message?: string }>;
      ok?: boolean;
    };
    const fromErrors = err.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(fromErrors || err.message || `Fluffle search failed (${response.status})`);
  }
  const data = payload as FluffleSearchResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  return results.filter((r) => r && r.match !== "unlikely");
}
