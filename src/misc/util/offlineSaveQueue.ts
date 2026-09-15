import localforage from "localforage";
import type { EnhancedPost } from "@/worker/ApiService";
import { useSnackbarStore } from "@/services";

const QUEUE_KEY = "offline_save_queue_v1";

export type QueuedOfflineSave = {
  id: string;
  queuedAt: number;
  post: EnhancedPost;
};

const queueIdFor = (post: EnhancedPost): string => {
  const origin = post.__meta?.originMode || "unknown";
  return `${origin}:${post.id}`;
};

/** Clone post JSON for IDB (drop non-serializable bits). */
const serializePost = (post: EnhancedPost): EnhancedPost =>
  JSON.parse(JSON.stringify(post)) as EnhancedPost;

export const loadOfflineSaveQueue = async (): Promise<QueuedOfflineSave[]> => {
  try {
    const items = await localforage.getItem<QueuedOfflineSave[]>(QUEUE_KEY);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

const persistQueue = async (items: QueuedOfflineSave[]) => {
  await localforage.setItem(QUEUE_KEY, items);
};

export const offlineSaveQueueCount = async (): Promise<number> =>
  (await loadOfflineSaveQueue()).length;

export const enqueueOfflineSave = async (
  post: EnhancedPost,
): Promise<QueuedOfflineSave> => {
  const item: QueuedOfflineSave = {
    id: queueIdFor(post),
    queuedAt: Date.now(),
    post: serializePost(post),
  };
  const items = await loadOfflineSaveQueue();
  const next = items.filter((entry) => entry.id !== item.id);
  next.push(item);
  await persistQueue(next);
  return item;
};

export const isLikelyNetworkSaveError = (err: unknown): boolean => {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    return /failed to fetch|network\s*error|network request failed|\boffline\b/i.test(
      err.message,
    );
  }
  return false;
};

let flushInFlight: Promise<{ saved: number; failed: number; remaining: number }> | null =
  null;

/**
 * Retry queued Save Locally jobs when online.
 * Remux is intentionally out of scope (ffmpeg core needs network on first load).
 */
export const flushOfflineSaveQueue = async (): Promise<{
  saved: number;
  failed: number;
  remaining: number;
}> => {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const remaining = await offlineSaveQueueCount();
      return { saved: 0, failed: 0, remaining };
    }
    const { savePostLocally } = await import("@/misc/util/saveLocal");
    let items = await loadOfflineSaveQueue();
    if (!items.length) return { saved: 0, failed: 0, remaining: 0 };

    let saved = 0;
    let failed = 0;
    const kept: QueuedOfflineSave[] = [];

    for (const item of items) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        kept.push(item);
        continue;
      }
      try {
        await savePostLocally(item.post, {
          quiet: true,
          skipOfflineQueue: true,
        });
        saved += 1;
      } catch (err) {
        if (isLikelyNetworkSaveError(err)) {
          kept.push(item);
        } else {
          failed += 1;
          console.error("Offline save flush failed permanently", item.id, err);
        }
      }
    }

    await persistQueue(kept);
    return { saved, failed, remaining: kept.length };
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
};

let listenersBound = false;

/** Bind once: flush on `online` + soft snackbar when work completes. */
export const installOfflineSaveQueueListeners = () => {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", () => {
    void (async () => {
      const before = await offlineSaveQueueCount();
      if (!before) return;
      const snackbar = useSnackbarStore();
      snackbar.addMessage(`Flushing ${before} queued save${before === 1 ? "" : "s"}…`);
      const result = await flushOfflineSaveQueue();
      if (result.saved || result.failed || result.remaining) {
        const parts = [`${result.saved} saved`];
        if (result.failed) parts.push(`${result.failed} failed`);
        if (result.remaining) parts.push(`${result.remaining} still queued`);
        snackbar.addMessage(parts.join(", "));
      }
    })();
  });
};
