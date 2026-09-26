/**
 * Client for /api/u18chan/* (Vite + serve.py HTML scrape proxy).
 */
import type {
  U18chanCatalogThread,
  U18chanPostPayload,
  U18chanThread,
} from "./types";

const jsonHeaders = { Accept: "application/json" };

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* ignore */
  }
  return `u18chan proxy HTTP ${res.status}`;
}

export async function getCatalog(
  indexBoard: string,
): Promise<U18chanCatalogThread[]> {
  const url = `/api/u18chan/catalog?board=${encodeURIComponent(indexBoard)}`;
  const res = await fetch(url, { headers: jsonHeaders });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { threads?: U18chanCatalogThread[] };
  return data.threads || [];
}

export async function getThread(
  liveBoard: string,
  topicId: number,
  indexBoard?: string,
): Promise<U18chanThread> {
  const q = new URLSearchParams({
    board: liveBoard,
    id: String(topicId),
  });
  if (indexBoard) q.set("index", indexBoard);
  const res = await fetch(`/api/u18chan/thread?${q}`, { headers: jsonHeaders });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as U18chanThread;
}

export async function createPost(
  payload: U18chanPostPayload,
): Promise<{ ok: boolean; redirect?: string; error?: string }> {
  const res = await fetch("/api/u18chan/post", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    redirect?: string;
    error?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `u18chan post HTTP ${res.status}`);
  }
  return { ok: true, redirect: data.redirect };
}

/** Rewrite upstream media through the local proxy. */
export function u18chanMediaUrl(upstream: string | null | undefined): string {
  if (!upstream) return "";
  if (upstream.startsWith("/api/u18chan/media")) return upstream;
  return `/api/u18chan/media?url=${encodeURIComponent(upstream)}`;
}
