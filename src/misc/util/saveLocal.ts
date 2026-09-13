import localforage from "localforage";
import { downloadjs } from "@/Settings/download";
import { usePostsStore, useSnackbarStore, useUrlStore } from "@/services";
import { getCreatorTags } from "@/misc/util/siteLabels";
import type { EnhancedPost } from "@/worker/ApiService";
import { getApiService } from "@/worker/services";

const DIR_HANDLE_KEY = "save_local_dir_handle";
const TAG_COUNT_CACHE = new Map<string, number>();

const TAG_POOL_CATEGORIES = [
  "general",
  "species",
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

const localRankedTags = (post: EnhancedPost, count: number): string[] => {
  const ranked: string[] = [];
  for (const cat of TAG_POOL_CATEGORIES) {
    for (const name of post.tags[cat] || []) {
      if (!ranked.includes(name)) ranked.push(name);
      if (ranked.length >= count) return ranked;
    }
  }
  return ranked;
};

const lookupTagCounts = async (
  names: string[],
  baseUrl: string,
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
  count: number,
): Promise<string[]> => {
  const fallback = localRankedTags(post, count);
  const urlStore = useUrlStore();
  const candidates = TAG_POOL_CATEGORIES.flatMap(
    (cat) => post.tags[cat] || [],
  ).slice(0, 40);
  if (!candidates.length) return [];

  const counts = await withTimeout(
    lookupTagCounts(candidates, urlStore.e621Url),
    2500,
  );
  if (!counts) return fallback;

  return candidates
    .map((name) => ({ name, post_count: counts.get(name) ?? 0 }))
    .sort((a, b) => b.post_count - a.post_count || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((t) => t.name);
};

export const buildSaveRelativePath = async (
  post: EnhancedPost,
  template: string,
): Promise<string> => {
  const artists = getCreatorTags(post.tags).map((a) => sanitizeSegment(a));
  const artistStr = artists.length ? artists.join(" ") : "_unknown_artist";
  const topTags = await resolveTopTags(post, 5);
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

const ensurePermission = async (
  handle: FileSystemDirectoryHandle,
): Promise<boolean> => {
  const mode = { mode: "readwrite" as const };
  const anyHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
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
  // CDN has no CORS for this origin — go through same-host /api/download.
  const response = await fetch(
    `/api/download?url=${encodeURIComponent(post.file.url)}`,
  );
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
        : "application/octet-stream");
  return { data, mimeType };
};

export const savePostLocally = async (post: EnhancedPost) => {
  const posts = usePostsStore();
  const snackbar = useSnackbarStore();
  const template = posts.saveLocalPathTemplate || "%artist%/%tags 1-5%.%ext%";

  const relativePath = await buildSaveRelativePath(post, template);
  const { data, mimeType } = await fetchPostBytes(post);

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
    snackbar.addMessage(`Saved to ${dirHandle.name}/${relativePath}`);
    return;
  }

  // Firefox/Zen (or no folder chosen): flatten path for Downloads.
  const flatName = relativePath.replace(/\//g, " - ");
  downloadjs(data, flatName, mimeType);
  snackbar.addMessage(
    supportsDirectoryPicker()
      ? `Downloaded ${flatName} (choose a save folder in Post settings for subfolders)`
      : `Downloaded ${flatName}`,
  );
};
