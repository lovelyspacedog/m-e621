import localforage from "localforage";
import { downloadjs } from "@/Settings/download";
import { usePostsStore, useSnackbarStore, useSiteModeStore, useUrlStore } from "@/services";
import { audioMimeFromExt } from "@/misc/util/audioExts";
import { getCreatorTags } from "@/misc/util/siteLabels";
import {
  flattenPostTagsForSidecar,
  mergeSidecarTagsForPath,
  setLocalDirectoryFromHandle,
  setPendingLocalFocusPath,
} from "@/misc/util/localMedia";
import { proxyDownloadUrl } from "@/misc/util/mediaProxy";
import type { EnhancedPost } from "@/worker/ApiService";
import { getApiService } from "@/worker/services";
import type { SiteMode } from "@/services/types";

const DIR_HANDLE_KEY = "save_local_dir_handle";
const TAG_COUNT_CACHE = new Map<string, number>();

const OTHER_TAG_CATEGORIES = [
  "general",
  "character",
  "lore",
  "meta",
] as const;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

export const supportsDirectoryPicker = () =>
  typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";

export const getSavedDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const handle = await localforage.getItem<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
    return handle || null;
  } catch {
    return null;
  }
};

export const clearSavedDirectoryHandle = async () => {
  await localforage.removeItem(DIR_HANDLE_KEY);
  usePostsStore().saveLocalDirectoryName = null;
};

export const pickSaveDirectory = async () => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Folder picker is not supported in this browser");
  }
  const handle = await picker({ id: "me621-save-local", mode: "readwrite" });
  await localforage.setItem(DIR_HANDLE_KEY, handle);
  usePostsStore().saveLocalDirectoryName = handle.name;
  return handle;
};

const sanitizeSegment = (raw: string, maxLen = 120) => {
  const cleaned = raw
    .replace(/[<>:"|?*\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, maxLen)
    .trim();
  return cleaned || "_";
};

const unique = (names: string[]) => [...new Set(names.filter(Boolean))];

const sortByCount = (names: string[], counts: Map<string, number> | null) =>
  [...names].sort(
    (a, b) =>
      (counts?.get(b) ?? 0) - (counts?.get(a) ?? 0) || a.localeCompare(b),
  );

const lookupTagCounts = async (
  names: string[],
  baseUrl: string,
  mode?: SiteMode,
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  const missing: string[] = [];
  for (const name of names) {
    if (TAG_COUNT_CACHE.has(name)) {
      counts.set(name, TAG_COUNT_CACHE.get(name)!);
    } else {
      missing.push(name);
    }
  }
  if (!missing.length) return counts;

  try {
    const service = await getApiService();
    const tags = await service.getTags({
      baseUrl,
      mode,
      limit: Math.min(100, missing.length),
      order: "count",
      name: missing.join(","),
    });
    for (const tag of tags) {
      TAG_COUNT_CACHE.set(tag.name, tag.post_count ?? 0);
      counts.set(tag.name, tag.post_count ?? 0);
    }
  } catch {
    // Fall through; caller uses local order for uncached names.
  }
  for (const name of missing) {
    if (!counts.has(name)) counts.set(name, 0);
  }
  return counts;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

export const resolveTopTags = async (
  post: EnhancedPost,
): Promise<string[]> => {
  const species = unique(post.tags.species || []);
  const others = unique(
    OTHER_TAG_CATEGORIES.flatMap((cat) => post.tags[cat] || []),
  );
  const candidates = unique([...species, ...others]).slice(0, 50);
  if (!candidates.length) return [];

  const urlStore = useUrlStore();
  const counts = await withTimeout(
    lookupTagCounts(candidates, urlStore.e621Url, useSiteModeStore().activeMode),
    2500,
  );

  const topSpecies = sortByCount(species, counts).slice(0, 2);
  const used = new Set(topSpecies);
  const topOthers = sortByCount(
    others.filter((name) => !used.has(name)),
    counts,
  ).slice(0, 3);
  return [...topSpecies, ...topOthers];
};

export const buildSaveRelativePath = async (
  post: EnhancedPost,
  template: string,
): Promise<string> => {
  const artists = getCreatorTags(post.tags).map((a) => sanitizeSegment(a));
  const artistStr = artists.length ? artists.join(" ") : "_unknown_artist";
  const topTags = await resolveTopTags(post);
  const tagsStr = topTags.length
    ? topTags.map((t) => sanitizeSegment(t)).join(" ")
    : "_untagged";
  const ext = sanitizeSegment(post.file.ext || "bin", 16);
  const id = String(post.id);

  let path = template;
  path = path.replace(/%artist%/gi, artistStr);
  path = path.replace(/%tags\s*1-5%/gi, tagsStr);
  path = path.replace(/%ext%/gi, ext);
  path = path.replace(/%id%/gi, id);

  // Normalize separators and sanitize each segment (keep / for directories).
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => sanitizeSegment(p))
    .filter(Boolean);

  if (!parts.length) {
    parts.push(`${id}.${ext}`);
  } else {
    // Ensure last segment has an extension if template forgot %ext%
    const last = parts[parts.length - 1];
    if (!last.includes(".")) {
      parts[parts.length - 1] = `${last}.${ext}`;
    }
  }

  return parts.join("/");
};

export const ensurePermission = async (
  handle: FileSystemDirectoryHandle,
  access: "read" | "readwrite" = "readwrite",
): Promise<boolean> => {
  const mode = { mode: access };
  const anyHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  if (anyHandle.queryPermission) {
    let state = await anyHandle.queryPermission(mode);
    if (state === "granted") return true;
    if (anyHandle.requestPermission) {
      state = await anyHandle.requestPermission(mode);
      return state === "granted";
    }
    return false;
  }
  return true;
};

const writeToDirectory = async (
  root: FileSystemDirectoryHandle,
  relativePath: string,
  data: ArrayBuffer,
  mimeType: string,
) => {
  const parts = relativePath.split("/");
  const fileName = parts.pop()!;
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([data], { type: mimeType }));
  await writable.close();
};

const fetchPostBytes = async (post: EnhancedPost): Promise<{ data: ArrayBuffer; mimeType: string }> => {
  if (!post.file?.url) {
    throw new Error("Post file URL is unavailable");
  }
  const url = post.file.url;
  // Already same-origin / blob / proxied — fetch as-is (avoid nested /api/download).
  const fetchUrl =
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/api/") ||
    url.startsWith("/api/download")
      ? url
      : proxyDownloadUrl(url) || url;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const data = await response.arrayBuffer();
  const mimeType =
    response.headers.get("content-type") ||
    (post.file.ext === "webm"
      ? "video/webm"
      : post.file.ext === "gif"
        ? "image/gif"
        : audioMimeFromExt(post.file.ext) || "application/octet-stream");
  return { data, mimeType };
};

export const savePostLocally = async (
  post: EnhancedPost,
  opts?: { quiet?: boolean; skipOfflineQueue?: boolean },
) => {
  const posts = usePostsStore();
  const snackbar = useSnackbarStore();
  const template = posts.saveLocalPathTemplate || "%artist%/%tags 1-5%.%ext%";

  const queueIfNeeded = async (err?: unknown) => {
    if (opts?.skipOfflineQueue) {
      if (err) throw err;
      throw new Error("Offline");
    }
    const { enqueueOfflineSave } = await import("@/misc/util/offlineSaveQueue");
    await enqueueOfflineSave(post);
    if (!opts?.quiet) {
      snackbar.addMessage("Offline — save queued; will retry when back online");
    }
    return {
      relativePath: "",
      dirHandle: null as FileSystemDirectoryHandle | null,
      queued: true as const,
    };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine && !opts?.skipOfflineQueue) {
    return queueIfNeeded();
  }

  const relativePath = await buildSaveRelativePath(post, template);

  let data: ArrayBuffer;
  let mimeType: string;
  try {
    ({ data, mimeType } = await fetchPostBytes(post));
  } catch (err) {
    const { isLikelyNetworkSaveError } = await import(
      "@/misc/util/offlineSaveQueue"
    );
    if (
      !opts?.skipOfflineQueue &&
      (isLikelyNetworkSaveError(err) ||
        (typeof navigator !== "undefined" && !navigator.onLine))
    ) {
      return queueIfNeeded(err);
    }
    throw err;
  }

  let dirHandle = await getSavedDirectoryHandle();
  if (dirHandle && supportsDirectoryPicker()) {
    const ok = await ensurePermission(dirHandle);
    if (!ok) {
      dirHandle = null;
    }
  } else {
    dirHandle = null;
  }

  if (dirHandle) {
    await writeToDirectory(dirHandle, relativePath, data, mimeType);
    try {
      await mergeSidecarTagsForPath(
        dirHandle,
        relativePath,
        flattenPostTagsForSidecar(post),
      );
    } catch (err) {
      // File is saved; sidecar is best-effort.
      console.warn("Failed to write Local sidecar tags", err);
    }
    if (!opts?.quiet) {
      offerOpenInLocal(snackbar, posts, dirHandle, relativePath);
    }
    return { relativePath, dirHandle };
  }

  // Firefox/Zen (or no folder chosen): flatten path for Downloads.
  const flatName = relativePath.replace(/\//g, " - ");
  downloadjs(data, flatName, mimeType);
  if (!opts?.quiet) {
    snackbar.addMessage(
      supportsDirectoryPicker()
        ? `Downloaded ${flatName} (choose a save folder in Post settings for subfolders)`
        : `Downloaded ${flatName}`,
    );
  }
  return { relativePath, dirHandle: null as FileSystemDirectoryHandle | null };
};

/** Switch Local browse root to the Save Locally folder and focus a path. */
export const openSavedPathInLocal = async (
  dirHandle: FileSystemDirectoryHandle,
  relativePath?: string | null,
) => {
  const siteMode = useSiteModeStore();
  if (!siteMode.supportsLocalMode) {
    useSnackbarStore().addMessage(
      "Local mode needs the File System Access API (Chromium).",
    );
    return;
  }
  await setLocalDirectoryFromHandle(dirHandle);
  setPendingLocalFocusPath(relativePath || null);
  if (siteMode.isLocal) {
    siteMode.bumpModeChange();
  } else {
    siteMode.setMode("local");
  }
};

const offerOpenInLocal = (
  snackbar: ReturnType<typeof useSnackbarStore>,
  posts: ReturnType<typeof usePostsStore>,
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
) => {
  const openAction = {
    label: "Open in Local",
    onClick: () => openSavedPathInLocal(dirHandle, relativePath),
  };
  const message = `Saved to ${dirHandle.name}/${relativePath}`;
  if (posts.openInLocalAfterSave) {
    snackbar.addMessage(message);
    void openSavedPathInLocal(dirHandle, relativePath);
    return;
  }
  snackbar.addMessage(message, openAction);
};

export const savePostsLocally = async (
  posts: EnhancedPost[],
  opts?: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    quietFinal?: boolean;
  },
) => {
  const snackbar = useSnackbarStore();
  const eligible = posts.filter(
    (p) => !!p.file.url && !p.__meta.isBlacklisted,
  );
  if (!eligible.length) {
    if (!opts?.quietFinal) {
      snackbar.addMessage("Nothing to save");
    }
    return { saved: 0, failed: 0, skipped: posts.length };
  }
  const concurrency = Math.max(1, opts?.concurrency ?? 2);
  let done = 0;
  let failed = 0;
  let index = 0;
  const lastSavedBox: Array<{
    relativePath: string;
    dirHandle: FileSystemDirectoryHandle;
  }> = [];

  const worker = async () => {
    while (index < eligible.length) {
      if (opts?.signal?.aborted) return;
      const current = eligible[index++];
      try {
        const result = await savePostLocally(current, { quiet: true });
        if (result.dirHandle && result.relativePath) {
          lastSavedBox[0] = {
            relativePath: result.relativePath,
            dirHandle: result.dirHandle,
          };
        }
      } catch (error) {
        failed += 1;
        console.error(error);
      } finally {
        done += 1;
        opts?.onProgress?.(done, eligible.length);
        if (!opts?.quietFinal) {
          snackbar.addMessage(`Saving locally ${done}/${eligible.length}`);
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, eligible.length) }, () =>
      worker(),
    ),
  );

  if (opts?.signal?.aborted) {
    return { saved: done - failed, failed, skipped: 0, cancelled: true as const };
  }

  if (!opts?.quietFinal) {
    const postsStore = usePostsStore();
    const summary = failed
      ? `Saved ${eligible.length - failed}/${eligible.length} locally (${failed} failed)`
      : `Saved ${eligible.length} posts locally`;
    const saved = lastSavedBox[0];
    if (saved) {
      if (postsStore.openInLocalAfterSave) {
        snackbar.addMessage(summary);
        void openSavedPathInLocal(saved.dirHandle, saved.relativePath);
      } else {
        snackbar.addMessage(summary, {
          label: "Open in Local",
          onClick: () =>
            openSavedPathInLocal(saved.dirHandle, saved.relativePath),
        });
      }
    } else {
      snackbar.addMessage(summary);
    }
  }

  return {
    saved: eligible.length - failed,
    failed,
    skipped: posts.length - eligible.length,
  };
};

export const saveSearchLocally = async (
  fetchPage: (page: number) => Promise<EnhancedPost[]>,
  opts?: {
    concurrency?: number;
    signal?: AbortSignal;
    onPage?: (info: {
      page: number;
      savedTotal: number;
      failedTotal: number;
    }) => void;
  },
) => {
  const snackbar = useSnackbarStore();
  let page = 1;
  let savedTotal = 0;
  let failedTotal = 0;
  let cancelled = false;

  while (true) {
    if (opts?.signal?.aborted) {
      cancelled = true;
      break;
    }
    const pagePosts = await fetchPage(page);
    if (!pagePosts.length) break;

    const result = await savePostsLocally(pagePosts, {
      concurrency: opts?.concurrency ?? 2,
      signal: opts?.signal,
      quietFinal: true,
      onProgress: (done, total) => {
        snackbar.addMessage(
          `Saving search · page ${page} · ${done}/${total} · ${savedTotal + done} total`,
        );
      },
    });

    savedTotal += result.saved;
    failedTotal += result.failed;
    opts?.onPage?.({ page, savedTotal, failedTotal });

    if ("cancelled" in result && result.cancelled) {
      cancelled = true;
      break;
    }
    page += 1;
  }

  if (cancelled) {
    snackbar.addMessage(
      `Save search cancelled · ${savedTotal} saved` +
        (failedTotal ? ` · ${failedTotal} failed` : ""),
    );
    return { savedTotal, failedTotal, cancelled: true as const };
  }

  if (!savedTotal && !failedTotal) {
    snackbar.addMessage("Nothing to save");
  } else {
    snackbar.addMessage(
      failedTotal
        ? `Saved ${savedTotal} from search (${failedTotal} failed)`
        : `Saved ${savedTotal} posts from search`,
    );
  }
  return { savedTotal, failedTotal, cancelled: false as const };
};
