import {
  ensurePermission,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import { usePostsStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PostTags } from "@/worker/api";
import localforage from "localforage";

const LOCAL_DIR_HANDLE_KEY = "local_mode_dir_handle";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

export const getLocalDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const handle = await localforage.getItem<FileSystemDirectoryHandle>(
      LOCAL_DIR_HANDLE_KEY,
    );
    return handle || null;
  } catch {
    return null;
  }
};

export const clearLocalDirectoryHandle = async () => {
  await localforage.removeItem(LOCAL_DIR_HANDLE_KEY);
  usePostsStore().localDirectoryName = null;
  invalidateLocalMediaIndex();
};

export const pickLocalDirectory = async () => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Folder picker is not supported in this browser");
  }
  const handle = await picker({ id: "me621-local-browse", mode: "read" });
  await localforage.setItem(LOCAL_DIR_HANDLE_KEY, handle);
  usePostsStore().localDirectoryName = handle.name;
  invalidateLocalMediaIndex();
  return handle;
};

const MEDIA_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "webm",
  "mp4",
]);

export interface LocalMediaEntry {
  relativePath: string;
  name: string;
  ext: string;
  size: number;
  lastModified: number;
  tags: string[];
  artistTags: string[];
  generalTags: string[];
  handle: FileSystemFileHandle;
}

export type LocalMediaStatus =
  | "ok"
  | "no-picker"
  | "no-folder"
  | "denied"
  | "empty";

let cachedIndex: LocalMediaEntry[] | null = null;
let cachedRootName: string | null = null;
let cachedOrdered: LocalMediaEntry[] | null = null;
let cachedOrderKey = "";
const blobUrls = new Map<number, string>();
const posterUrls = new Map<number, string>();

export const hashLocalPath = (path: string) => {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 0x7fffffff || 1;
};

const tokenize = (segment: string) =>
  segment
    .replace(/\.[^.]+$/, "")
    .split(/[\s_]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

export const parseLocalTags = (relativePath: string) => {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const artistTags = parts.length > 1 ? tokenize(parts[0]) : [];
  const generalTags = parts
    .slice(parts.length > 1 ? 1 : 0)
    .flatMap((part) => tokenize(part));
  return {
    artistTags,
    generalTags,
    tags: [...new Set([...artistTags, ...generalTags])],
  };
};

type DirectoryWalker = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

const walkDirectory = async (
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: LocalMediaEntry[],
) => {
  for await (const [name, handle] of (dir as DirectoryWalker).entries()) {
    if (handle.kind === "directory") {
      if (name.startsWith(".")) continue;
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
        out,
      );
      continue;
    }
    const fileHandle = handle as FileSystemFileHandle;
    const ext = name.includes(".")
      ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
      : "";
    if (!MEDIA_EXTS.has(ext)) continue;
    const file = await fileHandle.getFile();
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const parsed = parseLocalTags(relativePath);
    out.push({
      relativePath,
      name,
      ext,
      size: file.size,
      lastModified: file.lastModified,
      tags: parsed.tags,
      artistTags: parsed.artistTags,
      generalTags: parsed.generalTags,
      handle: fileHandle,
    });
  }
};

export const invalidateLocalMediaIndex = () => {
  cachedIndex = null;
  cachedRootName = null;
  cachedOrdered = null;
  cachedOrderKey = "";
};

const revokeUrl = (map: Map<number, string>, id: number) => {
  const url = map.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  map.delete(id);
};

export const revokeLocalBlobUrls = (ids?: number[]) => {
  if (ids) {
    for (const id of ids) {
      revokeUrl(blobUrls, id);
      revokeUrl(posterUrls, id);
    }
    return;
  }
  for (const url of blobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  for (const url of posterUrls.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrls.clear();
  posterUrls.clear();
};

export const scanLocalMedia = async (
  force = false,
): Promise<{ entries: LocalMediaEntry[]; status: LocalMediaStatus }> => {
  if (!supportsDirectoryPicker()) {
    return { entries: [], status: "no-picker" };
  }
  const handle = await getLocalDirectoryHandle();
  if (!handle) {
    return { entries: [], status: "no-folder" };
  }
  const allowed = await ensurePermission(handle, "read");
  if (!allowed) {
    return { entries: [], status: "denied" };
  }
  if (cachedIndex && cachedRootName === handle.name && !force) {
    return {
      entries: cachedIndex,
      status: cachedIndex.length ? "ok" : "empty",
    };
  }
  const entries: LocalMediaEntry[] = [];
  await walkDirectory(handle, "", entries);
  entries.sort((a, b) => b.lastModified - a.lastModified);
  cachedIndex = entries;
  cachedRootName = handle.name;
  return { entries, status: entries.length ? "ok" : "empty" };
};

export const filterLocalMedia = (
  index: LocalMediaEntry[],
  tags: string[],
) => {
  const terms = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag && !tag.startsWith("order:"));
  if (!terms.length) return index;
  return index.filter((entry) =>
    terms.every(
      (term) =>
        entry.tags.includes(term) ||
        entry.relativePath.toLowerCase().includes(term),
    ),
  );
};

const shuffleInPlace = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i];
    items[i] = items[j]!;
    items[j] = current!;
  }
  return items;
};

const orderLocalMedia = (
  entries: LocalMediaEntry[],
  tags: string[],
  reshuffle: boolean,
) => {
  const order =
    tags.find((tag) => tag.toLowerCase().startsWith("order:"))?.toLowerCase() ||
    "";
  const key = `${cachedRootName}|${entries.length}|${order}|${tags
    .filter((tag) => !tag.toLowerCase().startsWith("order:"))
    .join("\0")}`;
  if (!reshuffle && cachedOrdered && cachedOrderKey === key) {
    return cachedOrdered;
  }
  const next = [...entries];
  if (order === "order:random") {
    shuffleInPlace(next);
  }
  cachedOrdered = next;
  cachedOrderKey = key;
  return next;
};

const probeImageDimensions = (
  url: string,
): Promise<{ width: number; height: number }> => {
  const fallback = { width: 3, height: 4 };
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || fallback.width,
        height: image.naturalHeight || fallback.height,
      });
    image.onerror = () => resolve(fallback);
    image.src = url;
  });
};

const captureVideoFrame = (
  url: string,
): Promise<{ poster: string | null; width: number; height: number }> => {
  const fallback = { poster: null, width: 3, height: 4 };
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let settled = false;
    const finish = (result: { poster: string | null; width: number; height: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve({
        poster: result.poster,
        width: result.width || fallback.width,
        height: result.height || fallback.height,
      });
    };
    const timer = setTimeout(() => finish(fallback), 2500);
    video.onerror = () => finish(fallback);
    const seekToFrame = () => {
      const duration = video.duration;
      const target =
        duration && Number.isFinite(duration) && duration > 0
          ? Math.min(1, Math.max(0.05, duration * 0.08))
          : 0.1;
      try {
        video.currentTime = target;
      } catch {
        finish({
          poster: null,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    video.onloadeddata = seekToFrame;
    video.onseeked = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width || 1;
        canvas.height = height || 1;
        const ctx = canvas.getContext("2d");
        if (!ctx || !width || !height) {
          finish({ poster: null, width, height });
          return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish({ poster: null, width, height });
              return;
            }
            finish({
              poster: URL.createObjectURL(blob),
              width,
              height,
            });
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        finish({ poster: null, width, height });
      }
    };
    video.src = url;
  });
};

const emptyFlags = () => ({
  pending: false,
  flagged: false,
  note_locked: false,
  status_locked: false,
  rating_locked: false,
  deleted: false,
});

const toPostTags = (entry: LocalMediaEntry): PostTags => ({
  general: entry.generalTags,
  species: [],
  character: [],
  copyright: [],
  artist: entry.artistTags,
  invalid: [],
  lore: [],
  meta: [],
});

const blobUrlFor = async (entry: LocalMediaEntry) => {
  const id = hashLocalPath(entry.relativePath);
  const existing = blobUrls.get(id);
  if (existing) return { id, url: existing };
  const file = await entry.handle.getFile();
  const url = URL.createObjectURL(file);
  blobUrls.set(id, url);
  return { id, url };
};

export const localEntriesToPosts = async (
  entries: LocalMediaEntry[],
  page: number,
): Promise<EnhancedPost[]> => {
  return Promise.all(
    entries.map(async (entry) => {
      const { id, url } = await blobUrlFor(entry);
      const isVideo = entry.ext === "webm" || entry.ext === "mp4";
      let width = 3;
      let height = 4;
      let previewUrl = url;
      if (isVideo) {
        const frame = await captureVideoFrame(url);
        width = frame.width;
        height = frame.height;
        if (frame.poster) {
          posterUrls.set(id, frame.poster);
          previewUrl = frame.poster;
        }
      } else {
        const size = await probeImageDimensions(url);
        width = size.width;
        height = size.height;
      }
      const created = new Date(entry.lastModified).toISOString();
      return {
        id,
        created_at: created,
        updated_at: created,
        file: {
          width,
          height,
          ext: entry.ext,
          size: entry.size,
          md5: "",
          url,
        },
        preview: { width, height, url: previewUrl },
        sample: { has: true, width, height, url: previewUrl },
        score: { up: 0, down: 0, total: 0 },
        tags: toPostTags(entry),
        locked_tags: [],
        change_seq: 0,
        flags: emptyFlags(),
        rating: "e",
        fav_count: 0,
        sources: [entry.relativePath],
        pools: [],
        relationships: {
          has_children: false,
          has_active_children: false,
          children: [],
        },
        uploader_id: 0,
        description: entry.name,
        comment_count: 0,
        is_favorited: false,
        has_notes: false,
        __meta: {
          isBlacklisted: false,
          pageNumber: page,
          localPath: entry.relativePath,
        },
      };
    }),
  );
};

export const getLocalPostsPage = async (
  page: number,
  limit: number,
  tags: string[],
  force = false,
): Promise<{ posts: EnhancedPost[]; status: LocalMediaStatus }> => {
  if (page < 1) {
    return { posts: [], status: "ok" };
  }
  const scanned = await scanLocalMedia(force);
  if (scanned.status !== "ok" && scanned.status !== "empty") {
    return { posts: [], status: scanned.status };
  }
  const filtered = filterLocalMedia(scanned.entries, tags);
  const ordered = orderLocalMedia(filtered, tags, force);
  const start = (page - 1) * limit;
  const slice = ordered.slice(start, start + limit);
  return {
    posts: await localEntriesToPosts(slice, page),
    status: ordered.length ? "ok" : "empty",
  };
};

export const localStatusMessage = (status: LocalMediaStatus) => {
  switch (status) {
    case "no-picker":
      return "This browser cannot open a local folder. Use Chromium to browse Local mode.";
    case "no-folder":
      return "Choose a Local browse folder in Account or Post settings.";
    case "denied":
      return "Allow access to the save folder to browse Local files.";
    case "empty":
      return "No images or videos in the save folder.";
    default:
      return "";
  }
};
