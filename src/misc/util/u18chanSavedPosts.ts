import type { SavedPostEntry } from "@/services/types";

export function u18chanSavedKey(liveBoard: string, topicId: number): string {
  return `u18chan:${liveBoard}:${topicId}`;
}

export function parseU18chanSavedKey(
  key: string,
): { liveBoard: string; topicId: number } | null {
  const m = /^u18chan:([^:]+):(\d+)$/.exec(key);
  if (!m) return null;
  const topicId = Number(m[2]);
  if (!Number.isFinite(topicId)) return null;
  return { liveBoard: m[1], topicId };
}

export function savedEntryFeedKey(entry: SavedPostEntry): string {
  if (entry.originMode === "u18chan") {
    return u18chanSavedKey(entry.u18chanLiveBoard || "fur", entry.id);
  }
  return `${entry.originMode}:${entry.id}`;
}

export type U18chanSavedMeta = {
  indexBoard?: string;
  subject?: string;
  thumbUrl?: string | null;
};
