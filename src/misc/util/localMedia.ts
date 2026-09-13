import {
  ensurePermission,
  getSavedDirectoryHandle,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PostTags } from "@/worker/api";

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
const blobUrls = new Map<number, string>();

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
};

export const revokeLocalBlobUrls = (ids?: number[]) => {
  if (ids) {
    for (const id of ids) {
      const url = blobUrls.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        blobUrls.delete(id);
      }
    }
    return;
  }
  for (const url of blobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrls.clear();
};

export const scanLocalMedia = async (
  force = false,
): Promise<{ entries: LocalMediaEntry[]; status: LocalMediaStatus }> => {
  if (!supportsDirectoryPicker()) {
    return { entries: [], status: "no-picker" };
  }
  const handle = await getSavedDirectoryHandle();
  if (!handle) {
    return { entries: [], status: "no-folder" };
  }
  const allowed = await ensurePermission(handle);
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

const probeDimensions = (
  url: string,
  ext: string,
): Promise<{ width: number; height: number }> => {
  const fallback = { width: 3, height: 4 };
  return new Promise((resolve) => {
    const finish = (width: number, height: number) => {
      resolve({
        width: width || fallback.width,
        height: height || fallback.height,
      });
    };
    if (ext === "webm" || ext === "mp4") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        finish(video.videoWidth, video.videoHeight);
        video.removeAttribute("src");
        video.load();
      };
      video.onerror = () => resolve(fallback);
      video.src = url;
      return;
    }
    const image = new Image();
    image.onload = () => finish(image.naturalWidth, image.naturalHeight);
    image.onerror = () => resolve(fallback);
    image.src = url;
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
  const posts: EnhancedPost[] = [];
  for (const entry of entries) {
    const { id, url } = await blobUrlFor(entry);
    const { width, height } = await probeDimensions(url, entry.ext);
    const created = new Date(entry.lastModified).toISOString();
    posts.push({
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
      preview: { width, height, url },
      sample: { has: true, width, height, url },
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
    });
  }
  return posts;
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
  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit);
  return {
    posts: await localEntriesToPosts(slice, page),
    status: filtered.length ? "ok" : "empty",
  };
};

export const localStatusMessage = (status: LocalMediaStatus) => {
  switch (status) {
    case "no-picker":
      return "This browser cannot open a local folder. Use Chromium to browse Local mode.";
    case "no-folder":
      return "Choose a save folder in Account or Post settings to browse Local files.";
    case "denied":
      return "Allow access to the save folder to browse Local files.";
    case "empty":
      return "No images or videos in the save folder.";
    default:
      return "";
  }
};
