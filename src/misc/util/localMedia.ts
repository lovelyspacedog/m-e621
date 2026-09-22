import { AUDIO_EXTS } from "@/misc/util/audioExts";
import {
  ensurePermission,
  supportsDirectoryPicker,
} from "@/misc/util/saveLocal";
import { shuffleInPlace } from "@/misc/util/shuffle";
import {
  isTauriShell,
  supportsLocalBrowse,
  tauriListLocalMedia,
  tauriPickLocalFolder,
  tauriReadLocalFile,
  tauriReadLocalText,
  tauriRemoveLocalFile,
  tauriRootDisplayName,
  tauriWriteLocalFile,
} from "@/misc/util/tauriLocalFs";
import { usePostsStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import type { PostTags } from "@/worker/api";
import localforage from "localforage";

/** Legacy single-folder keys (migrated on first read). */
const LOCAL_DIR_HANDLE_KEY = "local_mode_dir_handle";
const LOCAL_TAURI_ROOT_KEY = "local_mode_tauri_root";
/** Multi-folder Chromium handles. */
const LOCAL_DIR_HANDLES_KEY = "local_mode_dir_handles";
/** Multi-folder Tauri roots. */
const LOCAL_TAURI_ROOTS_KEY = "local_mode_tauri_roots";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

type StoredHandleEntry = {
  label: string;
  handle: FileSystemDirectoryHandle;
};

type StoredTauriRoot = {
  label: string;
  path: string;
};

export type BrowseRoot = {
  folderKey: string;
  label: string;
  handle?: FileSystemDirectoryHandle;
  tauriPath?: string;
};

const browseRootsByKey = new Map<string, BrowseRoot>();
let extraTagsByFolder: Record<string, Record<string, string[]>> = {};
let favoritedByFolder: Record<string, Set<string>> = {};
let posterMetaByFolder: Record<string, Record<string, PosterMeta>> = {};

const normalizeFsPath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const syncLabelsToStore = () => {
  usePostsStore().localDirectoryNames = [...browseRootsByKey.values()].map(
    (root) => root.label,
  );
};

export const listLocalDirectoryNames = (): string[] =>
  [...browseRootsByKey.values()].map((root) => root.label);

const uniqueLabel = (base: string, existing: Iterable<string>) => {
  const taken = new Set(
    [...existing].map((label) => label.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
};

const persistHandleList = async (entries: StoredHandleEntry[]) => {
  if (entries.length) {
    await localforage.setItem(LOCAL_DIR_HANDLES_KEY, entries);
  } else {
    await localforage.removeItem(LOCAL_DIR_HANDLES_KEY);
  }
  await localforage.removeItem(LOCAL_DIR_HANDLE_KEY);
};

const persistTauriRoots = async (entries: StoredTauriRoot[]) => {
  if (entries.length) {
    await localforage.setItem(LOCAL_TAURI_ROOTS_KEY, entries);
  } else {
    await localforage.removeItem(LOCAL_TAURI_ROOTS_KEY);
  }
  await localforage.removeItem(LOCAL_TAURI_ROOT_KEY);
};

const persistBrowseRoots = async () => {
  const handles: StoredHandleEntry[] = [];
  const tauri: StoredTauriRoot[] = [];
  for (const root of browseRootsByKey.values()) {
    if (root.handle) {
      handles.push({ label: root.label, handle: root.handle });
    } else if (root.tauriPath) {
      tauri.push({ label: root.label, path: root.tauriPath });
    }
  }
  await persistHandleList(handles);
  await persistTauriRoots(tauri);
  syncLabelsToStore();
};

/** Load persisted roots into browseRootsByKey (resolves folder keys). */
const ensureBrowseRootsLoaded = async (): Promise<void> => {
  if (browseRootsByKey.size) return;

  try {
    let handles =
      (await localforage.getItem<StoredHandleEntry[]>(LOCAL_DIR_HANDLES_KEY)) ||
      [];
    if (!handles.length) {
      const legacy = await localforage.getItem<FileSystemDirectoryHandle>(
        LOCAL_DIR_HANDLE_KEY,
      );
      if (legacy) {
        handles = [{ label: legacy.name, handle: legacy }];
        await persistHandleList(handles);
      }
    }
    for (const entry of handles) {
      if (!entry?.handle) continue;
      const folderKey = await resolveFolderKey(entry.handle);
      browseRootsByKey.set(folderKey, {
        folderKey,
        label: entry.label || entry.handle.name,
        handle: entry.handle,
      });
    }
  } catch {
    // ignore handle load errors
  }

  try {
    let roots =
      (await localforage.getItem<StoredTauriRoot[]>(LOCAL_TAURI_ROOTS_KEY)) ||
      [];
    if (!roots.length) {
      const legacy = await localforage.getItem<string>(LOCAL_TAURI_ROOT_KEY);
      if (legacy) {
        roots = [{ label: tauriRootDisplayName(legacy), path: legacy }];
        await persistTauriRoots(roots);
      }
    }
    for (const entry of roots) {
      if (!entry?.path) continue;
      const folderKey = `path:${hashLocalPath(entry.path)}`;
      browseRootsByKey.set(folderKey, {
        folderKey,
        label: entry.label || tauriRootDisplayName(entry.path),
        tauriPath: entry.path,
      });
    }
  } catch {
    // ignore tauri load errors
  }

  syncLabelsToStore();
};

export const getTauriLocalRoots = async (): Promise<StoredTauriRoot[]> => {
  await ensureBrowseRootsLoaded();
  return [...browseRootsByKey.values()]
    .filter((root) => root.tauriPath)
    .map((root) => ({ label: root.label, path: root.tauriPath! }));
};

/** First Tauri browse root path (Save Locally target). */
export const getTauriLocalRoot = async (): Promise<string | null> => {
  const roots = await getTauriLocalRoots();
  return roots[0]?.path || null;
};

export const getLocalDirectoryHandles = async (): Promise<
  StoredHandleEntry[]
> => {
  await ensureBrowseRootsLoaded();
  return [...browseRootsByKey.values()]
    .filter((root) => root.handle)
    .map((root) => ({ label: root.label, handle: root.handle! }));
};

/** First Chromium handle (compat). */
export const getLocalDirectoryHandle = async (): Promise<
  FileSystemDirectoryHandle | null
> => {
  const handles = await getLocalDirectoryHandles();
  return handles[0]?.handle || null;
};

const isDuplicateHandle = async (
  handle: FileSystemDirectoryHandle,
): Promise<boolean> => {
  for (const root of browseRootsByKey.values()) {
    if (!root.handle) continue;
    try {
      if (await root.handle.isSameEntry(handle)) return true;
    } catch {
      // ignore
    }
  }
  return false;
};

const isDuplicateTauriPath = (path: string): boolean => {
  const needle = normalizeFsPath(path);
  for (const root of browseRootsByKey.values()) {
    if (root.tauriPath && normalizeFsPath(root.tauriPath) === needle) {
      return true;
    }
  }
  return false;
};

const addHandleRoot = async (
  handle: FileSystemDirectoryHandle,
  opts?: { replaceAll?: boolean },
): Promise<BrowseRoot | null> => {
  await ensureBrowseRootsLoaded();
  if (opts?.replaceAll) {
    browseRootsByKey.clear();
  } else if (await isDuplicateHandle(handle)) {
    return null;
  }
  // Open in Local / replace drops Tauri roots too.
  if (opts?.replaceAll) {
    // already cleared
  } else {
    // Adding a Chromium handle while Tauri roots exist is allowed (rare).
  }
  const folderKey = await resolveFolderKey(handle);
  const label = uniqueLabel(
    handle.name,
    [...browseRootsByKey.values()].map((r) => r.label),
  );
  const root: BrowseRoot = { folderKey, label, handle };
  browseRootsByKey.set(folderKey, root);
  await persistBrowseRoots();
  invalidateLocalMediaIndex();
  return root;
};

const addTauriRoot = async (
  path: string,
  opts?: { replaceAll?: boolean },
): Promise<BrowseRoot | null> => {
  await ensureBrowseRootsLoaded();
  if (opts?.replaceAll) {
    browseRootsByKey.clear();
  } else if (isDuplicateTauriPath(path)) {
    return null;
  }
  const folderKey = `path:${hashLocalPath(path)}`;
  const base = tauriRootDisplayName(path);
  const label = uniqueLabel(
    base,
    [...browseRootsByKey.values()].map((r) => r.label),
  );
  const root: BrowseRoot = { folderKey, label, tauriPath: path };
  browseRootsByKey.set(folderKey, root);
  await persistBrowseRoots();
  invalidateLocalMediaIndex();
  return root;
};

/** Reuse a Tauri path as the sole Local browse root (e.g. after Save Locally). */
export const setLocalDirectoryFromTauriRoot = async (root: string) => {
  await addTauriRoot(root, { replaceAll: true });
};

/** Reuse an existing directory handle as the sole Local browse root. */
export const setLocalDirectoryFromHandle = async (
  handle: FileSystemDirectoryHandle,
) => {
  await addHandleRoot(handle, { replaceAll: true });
};

export const clearLocalDirectoryHandle = async () => {
  await ensureBrowseRootsLoaded();
  const previousKeys = [...browseRootsByKey.keys()];
  const previousLabels = [...browseRootsByKey.values()].map((r) => r.label);
  browseRootsByKey.clear();
  extraTagsByFolder = {};
  favoritedByFolder = {};
  posterMetaByFolder = {};
  await persistBrowseRoots();
  for (const key of previousKeys) {
    await clearLocalResume(key);
  }
  for (const label of previousLabels) {
    await clearLocalResume(label);
  }
  invalidateLocalMediaIndex();
};

export const removeLocalDirectory = async (labelOrKey: string) => {
  await ensureBrowseRootsLoaded();
  const needle = labelOrKey.toLowerCase();
  let removed: BrowseRoot | null = null;
  for (const [key, root] of browseRootsByKey) {
    if (
      key === labelOrKey ||
      root.label.toLowerCase() === needle ||
      root.folderKey.toLowerCase() === needle
    ) {
      removed = root;
      browseRootsByKey.delete(key);
      delete extraTagsByFolder[key];
      delete favoritedByFolder[key];
      delete posterMetaByFolder[key];
      break;
    }
  }
  if (!removed) return;
  await persistBrowseRoots();
  await clearLocalResume(removed.folderKey);
  invalidateLocalMediaIndex();
};

/** Add a folder to the browse list (does not replace). */
export const pickLocalDirectory = async () => {
  if (supportsDirectoryPicker()) {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      throw new Error("Folder picker is not supported in this browser");
    }
    const handle = await picker({ id: "me621-local-browse", mode: "readwrite" });
    const added = await addHandleRoot(handle);
    if (!added) {
      throw new Error("That folder is already in the Local browse list");
    }
    return handle;
  }
  if (isTauriShell()) {
    const root = await tauriPickLocalFolder();
    if (!root) throw new Error("No folder selected");
    const added = await addTauriRoot(root);
    if (!added) {
      throw new Error("That folder is already in the Local browse list");
    }
    return null;
  }
  throw new Error("Folder picker is not supported in this browser");
};

export const addLocalDirectory = pickLocalDirectory;

/** One-shot path focus after switching into Local (not persisted). */
let pendingLocalFocusPath: string | null = null;

export const setPendingLocalFocusPath = (path: string | null) => {
  pendingLocalFocusPath = path ? path.replace(/^\/+/, "") : null;
};

export const takePendingLocalFocusPath = (): string | null => {
  const path = pendingLocalFocusPath;
  pendingLocalFocusPath = null;
  return path;
};

/** Locate which Local page contains `relativePath` for the current tag filter. */
export const findLocalPathTarget = async (
  relativePath: string,
  tags: string[],
  limit: number,
): Promise<{ path: string; page: number; folderKey?: string } | null> => {
  const path = relativePath.replace(/^\/+/, "");
  if (!path) return null;
  const scanned = await scanLocalMedia(false);
  if (scanned.status !== "ok" && scanned.status !== "empty") return null;
  const filtered = filterLocalMedia(scanned.entries, tags);
  const ordered = orderLocalMedia(filtered, tags, false);
  const index = ordered.findIndex((entry) => entry.relativePath === path);
  if (index < 0) return null;
  const entry = ordered[index]!;
  return {
    path,
    page: Math.floor(index / Math.max(1, limit)) + 1,
    folderKey: entry.folderKey,
  };
};

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const INDEX_VIDEO_EXTS = new Set(["webm", "mp4", "mkv", "mov"]);
const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...INDEX_VIDEO_EXTS, ...AUDIO_EXTS]);

export type LocalMediaKind = "image" | "video" | "audio";

export interface LocalMediaEntry {
  relativePath: string;
  name: string;
  ext: string;
  size: number;
  lastModified: number;
  kind: LocalMediaKind;
  playable: boolean;
  duration?: number;
  tags: string[];
  artistTags: string[];
  generalTags: string[];
  extraTags: string[];
  folderKey: string;
  folderLabel: string;
  /** Chromium File System Access handle; absent in Tauri path mode. */
  handle?: FileSystemFileHandle;
  /** Absolute Tauri root path when browsing via desktop shell. */
  tauriRoot?: string;
}

export type LocalMediaStatus =
  | "ok"
  | "no-picker"
  | "no-folder"
  | "denied"
  | "empty";

let cachedIndex: LocalMediaEntry[] | null = null;
let cachedRootsKey: string | null = null;
/** Labels skipped on the last full scan due to permission errors. */
let lastScanDeniedLabels: string[] = [];

export const getLastScanDeniedLabels = (): string[] => [...lastScanDeniedLabels];
let cachedOrdered: LocalMediaEntry[] | null = null;
let cachedOrderKey = "";
const blobUrls = new Map<number, string>();
const posterUrls = new Map<number, string>();
/** pathKey → numeric id; avoids hash collisions sharing blob/poster slots (M29). */
const pathToId = new Map<string, number>();
const idToPath = new Map<number, string>();
const EXTRA_TAGS_KEY = "local_mode_extra_tags";
const SIDECAR_NAME = ".me621-tags.json";
const FOLDER_ID_SIDECAR = ".me621-folder-id";
const POSTER_DIR = ".me621-posters";
const POSTER_META_KEY = "local_mode_poster_meta";
const FAVORITES_KEY = "local_mode_favorites";
const FAVORITES_SIDECAR = ".me621-favorites.json";
/** Portable resume (and future library fields). Favorites stay in `.me621-favorites.json`. */
const LIBRARY_SIDECAR = ".me621-library.json";
const RESUME_KEY = "local_mode_resume";

type ExtraTagsStore = Record<string, Record<string, string[]>>;
type PosterMeta = {
  lastModified: number;
  size: number;
  width: number;
  height: number;
  duration?: number;
};
type PosterMetaStore = Record<string, Record<string, PosterMeta>>;
type FavoritesStore = Record<string, string[]>;
export type LocalResumeState = {
  path: string;
  videoTime?: number;
  savedAt: number;
};
type ResumeStore = Record<string, LocalResumeState>;
type LibrarySidecar = {
  version: 1;
  resume?: LocalResumeState | null;
};

const rootsCacheKey = () =>
  [...browseRootsByKey.keys()].sort().join("\0");

const newFolderId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resolve a stable storage key for this directory (persisted in-folder when possible). */
const resolveFolderKey = async (
  root: FileSystemDirectoryHandle,
): Promise<string> => {
  try {
    const file = await root.getFileHandle(FOLDER_ID_SIDECAR);
    const text = await (await file.getFile()).text();
    const parsed = JSON.parse(text) as { id?: string };
    if (parsed?.id && typeof parsed.id === "string") {
      return `id:${parsed.id}`;
    }
  } catch {
    // missing or unreadable — try to create
  }
  const id = newFolderId();
  try {
    const writableHandle = await root.getFileHandle(FOLDER_ID_SIDECAR, {
      create: true,
    });
    const writable = await writableHandle.createWritable();
    await writable.write(`${JSON.stringify({ id }, null, 2)}\n`);
    await writable.close();
    return `id:${id}`;
  } catch {
    // Read-only folder: fall back to name (legacy behavior).
    return `name:${root.name}`;
  }
};

/** Prefer id-keyed store; migrate from legacy name key when empty. */
const storeBucket = <T>(
  all: Record<string, T> | null | undefined,
  key: string,
  legacyName: string,
): T | undefined => {
  if (!all) return undefined;
  if (all[key] != null) return all[key];
  if (key.startsWith("id:") && all[legacyName] != null) return all[legacyName];
  if (key.startsWith("name:") && all[key.slice(5)] != null) return all[key.slice(5)];
  return undefined;
};

export const hashLocalPath = (path: string, salt = 0) => {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 0x7fffffff || 1;
};

const pathIdKey = (folderKey: string, relativePath: string) =>
  `${folderKey}\0${relativePath}`;

const idForPath = (folderKey: string, path: string) => {
  const key = pathIdKey(folderKey, path);
  const existing = pathToId.get(key);
  if (existing != null) return existing;
  let salt = 0;
  let id = hashLocalPath(key, salt);
  while (idToPath.has(id) && idToPath.get(id) !== key) {
    salt += 1;
    id = hashLocalPath(key, salt);
  }
  pathToId.set(key, id);
  idToPath.set(id, key);
  return id;
};

const tokenize = (segment: string) =>
  segment
    .replace(/\.[^.]+$/, "")
    .split(/[\s_]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

const uniqueTags = (names: string[]) => [...new Set(names.filter(Boolean))];

export const parseLocalTags = (relativePath: string) => {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const inRoot = parts.length === 1;
  const artistTags = inRoot ? [] : tokenize(parts[0] || "");
  const generalTags = uniqueTags([
    ...(inRoot ? ["root"] : []),
    ...parts.slice(inRoot ? 0 : 1).flatMap((part) => tokenize(part)),
  ]);
  return {
    artistTags,
    generalTags,
    tags: uniqueTags([...artistTags, ...generalTags]),
  };
};

type DirectoryWalker = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

/** MPEG-TS mislabeled as .mp4 starts with sync byte 0x47; real MP4 has ftyp. */
const sniffMp4PlayableBytes = (bytes: Uint8Array) => {
  if (!bytes.length) return false;
  if (bytes[0] === 0x47) return false;
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  // No ftyp box — not a reliable MP4 (M29).
  return false;
};

const sniffMp4Playable = async (file: File) => {
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return sniffMp4PlayableBytes(bytes);
  } catch {
    return false;
  }
};

const resolvePlayableExt = (ext: string) => {
  if (IMAGE_EXTS.has(ext) || AUDIO_EXTS.has(ext) || ext === "webm" || ext === "mp4") {
    return true;
  }
  return false;
};

const resolvePlayable = async (file: File, ext: string) => {
  if (IMAGE_EXTS.has(ext)) return true;
  if (AUDIO_EXTS.has(ext)) return true;
  if (ext === "webm") return true;
  if (ext === "mp4") return sniffMp4Playable(file);
  return false;
};

const kindTagFor = (kind: LocalMediaKind) => {
  if (kind === "image") return "type:still";
  if (kind === "audio") return "type:audio";
  return "type:video";
};

const kindTagsFor = (kind: LocalMediaKind, playable: boolean) =>
  uniqueTags([kindTagFor(kind), playable ? "" : "type:unplayable"]);

const folderMetaTag = (label: string) => `folder:${label}`;

const isFavorited = (folderKey: string, relativePath: string) =>
  favoritedByFolder[folderKey]?.has(relativePath) ?? false;

const tagsForEntry = (entry: LocalMediaEntry) =>
  uniqueTags([
    ...entry.artistTags,
    ...entry.generalTags,
    ...kindTagsFor(entry.kind, entry.playable),
    folderMetaTag(entry.folderLabel),
    ...(isFavorited(entry.folderKey, entry.relativePath)
      ? ["type:favorited"]
      : []),
  ]);

const fuzzyableTags = (tags: string[]) =>
  tags.filter((tag) => !tag.toLowerCase().startsWith("folder:"));

const walkDirectory = async (
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: LocalMediaEntry[],
  root: BrowseRoot,
) => {
  const extrasForFolder = extraTagsByFolder[root.folderKey] || {};
  for await (const [name, handle] of (dir as DirectoryWalker).entries()) {
    if (handle.kind === "directory") {
      if (name.startsWith(".")) continue;
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
        out,
        root,
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
    const kind: LocalMediaKind = IMAGE_EXTS.has(ext)
      ? "image"
      : AUDIO_EXTS.has(ext)
        ? "audio"
        : "video";
    const playable = await resolvePlayable(file, ext);
    const parsed = parseLocalTags(relativePath);
    const extraTags = extrasForFolder[relativePath] || [];
    const generalTags = uniqueTags([...parsed.generalTags, ...extraTags]);
    const typeTags = kindTagsFor(kind, playable);
    const entry: LocalMediaEntry = {
      relativePath,
      name,
      ext,
      size: file.size,
      lastModified: file.lastModified,
      kind,
      playable,
      artistTags: parsed.artistTags,
      generalTags,
      extraTags,
      folderKey: root.folderKey,
      folderLabel: root.label,
      handle: fileHandle,
      tags: [],
    };
    entry.tags = uniqueTags([
      ...parsed.artistTags,
      ...generalTags,
      ...typeTags,
      folderMetaTag(root.label),
      ...(isFavorited(root.folderKey, relativePath) ? ["type:favorited"] : []),
    ]);
    out.push(entry);
  }
};

export const invalidateLocalMediaIndex = () => {
  cachedIndex = null;
  cachedRootsKey = null;
  cachedOrdered = null;
  cachedOrderKey = "";
  pathToId.clear();
  idToPath.clear();
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

const readSidecar = async (
  root: FileSystemDirectoryHandle,
): Promise<Record<string, string[]> | null> => {
  try {
    const fileHandle = await root.getFileHandle(SIDECAR_NAME);
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: Record<string, string[]> = {};
    for (const [path, tags] of Object.entries(parsed)) {
      if (!Array.isArray(tags)) continue;
      out[path] = uniqueTags(
        tags.filter((tag): tag is string => typeof tag === "string"),
      );
    }
    return out;
  } catch {
    return null;
  }
};

const writeSidecarToRoot = async (
  root: FileSystemDirectoryHandle,
  tagsByPath: Record<string, string[]>,
) => {
  try {
    const writableHandle = await root.getFileHandle(SIDECAR_NAME, {
      create: true,
    });
    const writable = await writableHandle.createWritable();
    await writable.write(`${JSON.stringify(tagsByPath, null, 2)}\n`);
    await writable.close();
  } catch {
    // Folder may be read-only; localforage still has the tags.
  }
};

const writeSidecarForBrowseRoot = async (browse: BrowseRoot) => {
  const tagsByPath = extraTagsByFolder[browse.folderKey] || {};
  if (browse.tauriPath && isTauriShell()) {
    try {
      const body = `${JSON.stringify(tagsByPath, null, 2)}\n`;
      await tauriWriteLocalFile(
        browse.tauriPath,
        SIDECAR_NAME,
        new TextEncoder().encode(body),
      );
    } catch {
      // Folder may be read-only; localforage still has the tags.
    }
    return;
  }
  if (browse.handle) {
    await writeSidecarToRoot(browse.handle, tagsByPath);
  }
};

/** Serialize sidecar/localforage merges (bulk Save Locally can overlap). */
let sidecarMergeChain: Promise<void> = Promise.resolve();

const withSidecarMergeLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const prev = sidecarMergeChain;
  let release!: () => void;
  sidecarMergeChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
};

/**
 * Merge searchable tags into `.me621-tags.json` (+ localforage) for a path
 * under an arbitrary folder handle (e.g. Save Locally directory).
 * Safe when the save folder is not the current Local browse root.
 */
export const mergeSidecarTagsForPath = async (
  root: FileSystemDirectoryHandle,
  relativePath: string,
  tags: string[],
): Promise<string[]> => {
  const cleaned = uniqueTags(
    tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(
        (tag) =>
          tag &&
          !tag.startsWith("order:") &&
          !tag.startsWith("type:"),
      ),
  );
  if (!cleaned.length || !relativePath) return [];

  return withSidecarMergeLock(async () => {
    const key = await resolveFolderKey(root);
    const all =
      (await localforage.getItem<ExtraTagsStore>(EXTRA_TAGS_KEY)) || {};
    const bucket: Record<string, string[]> = {
      ...storeBucket(all, key, root.name),
    };
    const disk = await readSidecar(root);
    if (disk) {
      for (const [path, pathTags] of Object.entries(disk)) {
        bucket[path] = uniqueTags([...(bucket[path] || []), ...pathTags]);
      }
    }
    bucket[relativePath] = uniqueTags([
      ...(bucket[relativePath] || []),
      ...cleaned,
    ]);
    all[key] = bucket;
    await localforage.setItem(EXTRA_TAGS_KEY, all);
    await writeSidecarToRoot(root, bucket);

    extraTagsByFolder[key] = bucket;
    for (const entry of cachedIndex || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    for (const entry of cachedOrdered || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    return bucket[relativePath] || [];
  });
};

/** Merge tags into `.me621-tags.json` under a Tauri Local browse root. */
export const mergeSidecarTagsForTauriRoot = async (
  root: string,
  relativePath: string,
  tags: string[],
): Promise<string[]> => {
  const cleaned = uniqueTags(
    tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(
        (tag) =>
          tag &&
          !tag.startsWith("order:") &&
          !tag.startsWith("type:"),
      ),
  );
  if (!cleaned.length || !relativePath) return [];

  return withSidecarMergeLock(async () => {
    const key = `path:${hashLocalPath(root)}`;
    const displayName = tauriRootDisplayName(root);
    const all =
      (await localforage.getItem<ExtraTagsStore>(EXTRA_TAGS_KEY)) || {};
    const bucket: Record<string, string[]> = {
      ...storeBucket(all, key, displayName),
    };
    try {
      const text = await tauriReadLocalText(root, SIDECAR_NAME);
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [path, pathTags] of Object.entries(parsed)) {
          if (!Array.isArray(pathTags)) continue;
          bucket[path] = uniqueTags([
            ...(bucket[path] || []),
            ...pathTags.filter((t): t is string => typeof t === "string"),
          ]);
        }
      }
    } catch {
      /* no sidecar yet */
    }
    bucket[relativePath] = uniqueTags([
      ...(bucket[relativePath] || []),
      ...cleaned,
    ]);
    all[key] = bucket;
    await localforage.setItem(EXTRA_TAGS_KEY, all);
    try {
      const body = `${JSON.stringify(bucket, null, 2)}\n`;
      await tauriWriteLocalFile(root, SIDECAR_NAME, new TextEncoder().encode(body));
    } catch {
      /* localforage still has tags */
    }
    extraTagsByFolder[key] = bucket;
    for (const entry of cachedIndex || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    for (const entry of cachedOrdered || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    return bucket[relativePath] || [];
  });
};

/** Flatten e621-shaped post tags for Local sidecar search. */
export const flattenPostTagsForSidecar = (
  post: { tags?: object | null } | null | undefined,
): string[] => {
  if (!post?.tags || typeof post.tags !== "object") return [];
  const out: string[] = [];
  for (const list of Object.values(post.tags as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const tag of list) {
      if (typeof tag === "string" && tag.trim()) out.push(tag);
    }
  }
  return uniqueTags(out.map((t) => t.trim().toLowerCase()));
};

/** Write in-memory extra tags to localforage + sidecar (caller must hold merge lock). */
const persistExtraTagsUnlocked = async (folderKey: string) => {
  if (!folderKey) return;
  const all =
    (await localforage.getItem<ExtraTagsStore>(EXTRA_TAGS_KEY)) || {};
  all[folderKey] = extraTagsByFolder[folderKey] || {};
  await localforage.setItem(EXTRA_TAGS_KEY, all);
  const browse = browseRootsByKey.get(folderKey);
  if (browse) await writeSidecarForBrowseRoot(browse);
};

/** Serialize sidecar persist when called outside an existing merge lock. */
const persistExtraTags = async (folderKey: string) =>
  withSidecarMergeLock(() => persistExtraTagsUnlocked(folderKey));

const loadExtraTagsForRoot = async (root: BrowseRoot) => {
  const key = root.folderKey;
  const legacyName = root.label;
  try {
    const all =
      (await localforage.getItem<ExtraTagsStore>(EXTRA_TAGS_KEY)) || {};
    extraTagsByFolder[key] = { ...storeBucket(all, key, legacyName) };
  } catch {
    extraTagsByFolder[key] = {};
  }
  if (root.handle) {
    const sidecar = await readSidecar(root.handle);
    if (sidecar) {
      for (const [path, tags] of Object.entries(sidecar)) {
        extraTagsByFolder[key]![path] = uniqueTags([
          ...(extraTagsByFolder[key]![path] || []),
          ...tags,
        ]);
      }
    }
    return;
  }
  if (root.tauriPath && isTauriShell()) {
    try {
      const text = await tauriReadLocalText(root.tauriPath, SIDECAR_NAME);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      for (const [path, tags] of Object.entries(parsed)) {
        if (!Array.isArray(tags)) continue;
        extraTagsByFolder[key]![path] = uniqueTags([
          ...(extraTagsByFolder[key]![path] || []),
          ...tags.filter((tag): tag is string => typeof tag === "string"),
        ]);
      }
    } catch {
      // No sidecar yet or unreadable.
    }
  }
};

const persistPosterMeta = async (folderKey: string) => {
  if (!folderKey) return;
  const all =
    (await localforage.getItem<PosterMetaStore>(POSTER_META_KEY)) || {};
  all[folderKey] = posterMetaByFolder[folderKey] || {};
  await localforage.setItem(POSTER_META_KEY, all);
};

const loadPosterMeta = async (key: string, legacyName: string) => {
  try {
    const all =
      (await localforage.getItem<PosterMetaStore>(POSTER_META_KEY)) || {};
    posterMetaByFolder[key] = { ...storeBucket(all, key, legacyName) };
  } catch {
    posterMetaByFolder[key] = {};
  }
};

const getPosterDir = async (browse: BrowseRoot, create: boolean) => {
  if (!browse.handle) return null;
  try {
    return await browse.handle.getDirectoryHandle(POSTER_DIR, { create });
  } catch {
    return null;
  }
};

const posterFileName = (id: number) => `${id}.jpg`;

const readCachedPoster = async (
  entry: LocalMediaEntry,
  id: number,
): Promise<{
  url: string;
  width: number;
  height: number;
  duration?: number;
} | null> => {
  const meta = posterMetaByFolder[entry.folderKey]?.[entry.relativePath];
  if (
    !meta ||
    meta.lastModified !== entry.lastModified ||
    meta.size !== entry.size
  ) {
    return null;
  }
  const browse = browseRootsByKey.get(entry.folderKey);
  if (!browse) return null;
  const dir = await getPosterDir(browse, false);
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(posterFileName(id));
    const file = await fileHandle.getFile();
    if (!file.size) return null;
    return {
      url: URL.createObjectURL(file),
      width: meta.width || 3,
      height: meta.height || 4,
      duration: meta.duration,
    };
  } catch {
    return null;
  }
};

const writeCachedPoster = async (
  entry: LocalMediaEntry,
  id: number,
  posterUrl: string,
  width: number,
  height: number,
  duration?: number,
) => {
  try {
    const response = await fetch(posterUrl);
    const blob = await response.blob();
    const browse = browseRootsByKey.get(entry.folderKey);
    if (!browse) return;
    const dir = await getPosterDir(browse, true);
    if (!dir) return;
    const fileHandle = await dir.getFileHandle(posterFileName(id), {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    if (!posterMetaByFolder[entry.folderKey]) {
      posterMetaByFolder[entry.folderKey] = {};
    }
    posterMetaByFolder[entry.folderKey]![entry.relativePath] = {
      lastModified: entry.lastModified,
      size: entry.size,
      width,
      height,
      duration: duration && duration > 0 ? duration : undefined,
    };
    await persistPosterMeta(entry.folderKey);
  } catch {
    // Folder may be read-only; session still has the in-memory poster.
  }
};

const readFavoritesSidecar = async (
  root: FileSystemDirectoryHandle,
): Promise<string[] | null> => {
  try {
    const fileHandle = await root.getFileHandle(FAVORITES_SIDECAR);
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) return null;
    return uniqueTags(
      parsed.filter((path): path is string => typeof path === "string"),
    );
  } catch {
    return null;
  }
};

const readFavoritesSidecarText = (text: string): string[] | null => {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return uniqueTags(
      parsed.filter((path): path is string => typeof path === "string"),
    );
  } catch {
    return null;
  }
};

const writeFavoritesSidecarForRoot = async (browse: BrowseRoot) => {
  const favs = favoritedByFolder[browse.folderKey] || new Set();
  const body = `${JSON.stringify([...favs].sort(), null, 2)}\n`;
  if (browse.tauriPath && isTauriShell()) {
    try {
      await tauriWriteLocalFile(
        browse.tauriPath,
        FAVORITES_SIDECAR,
        new TextEncoder().encode(body),
      );
    } catch {
      // Folder may be read-only; localforage still has favorites.
    }
    return;
  }
  if (!browse.handle) return;
  try {
    const writableHandle = await browse.handle.getFileHandle(FAVORITES_SIDECAR, {
      create: true,
    });
    const writable = await writableHandle.createWritable();
    await writable.write(body);
    await writable.close();
  } catch {
    // Folder may be read-only; localforage still has favorites.
  }
};

const parseLibrarySidecar = (raw: unknown): LibrarySidecar | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { version?: unknown; resume?: unknown };
  if (obj.version !== 1) return null;
  const resumeRaw = obj.resume;
  if (resumeRaw == null) return { version: 1, resume: null };
  if (typeof resumeRaw !== "object") return { version: 1 };
  const r = resumeRaw as {
    path?: unknown;
    videoTime?: unknown;
    savedAt?: unknown;
  };
  if (typeof r.path !== "string" || !r.path) return { version: 1, resume: null };
  const resume: LocalResumeState = {
    path: r.path,
    savedAt: typeof r.savedAt === "number" && Number.isFinite(r.savedAt) ? r.savedAt : 0,
  };
  if (
    typeof r.videoTime === "number" &&
    Number.isFinite(r.videoTime) &&
    r.videoTime > 0
  ) {
    resume.videoTime = r.videoTime;
  }
  return { version: 1, resume };
};

const readLibrarySidecarForRoot = async (
  browse: BrowseRoot,
): Promise<LibrarySidecar | null> => {
  if (browse.tauriPath && isTauriShell()) {
    try {
      const text = await tauriReadLocalText(browse.tauriPath, LIBRARY_SIDECAR);
      return parseLibrarySidecar(JSON.parse(text));
    } catch {
      return null;
    }
  }
  if (!browse.handle) return null;
  try {
    const fileHandle = await browse.handle.getFileHandle(LIBRARY_SIDECAR);
    const file = await fileHandle.getFile();
    return parseLibrarySidecar(JSON.parse(await file.text()));
  } catch {
    return null;
  }
};

const writeLibrarySidecarForRoot = async (
  browse: BrowseRoot,
  resume: LocalResumeState | null,
) => {
  const payload: LibrarySidecar = { version: 1, resume };
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (browse.tauriPath && isTauriShell()) {
    try {
      await tauriWriteLocalFile(
        browse.tauriPath,
        LIBRARY_SIDECAR,
        new TextEncoder().encode(body),
      );
    } catch {
      // read-only folder
    }
    return;
  }
  if (!browse.handle) return;
  try {
    const writableHandle = await browse.handle.getFileHandle(LIBRARY_SIDECAR, {
      create: true,
    });
    const writable = await writableHandle.createWritable();
    await writable.write(body);
    await writable.close();
  } catch {
    // read-only folder
  }
};

const persistFavorites = async (folderKey: string) => {
  if (!folderKey) return;
  return withSidecarMergeLock(async () => {
    const all = (await localforage.getItem<FavoritesStore>(FAVORITES_KEY)) || {};
    all[folderKey] = [...(favoritedByFolder[folderKey] || new Set())];
    await localforage.setItem(FAVORITES_KEY, all);
    const browse = browseRootsByKey.get(folderKey);
    if (browse) await writeFavoritesSidecarForRoot(browse);
  });
};

const loadFavoritesForRoot = async (root: BrowseRoot) => {
  const key = root.folderKey;
  const legacyName = root.label;
  favoritedByFolder[key] = new Set();
  try {
    const all = (await localforage.getItem<FavoritesStore>(FAVORITES_KEY)) || {};
    for (const path of storeBucket(all, key, legacyName) || []) {
      favoritedByFolder[key]!.add(path);
    }
  } catch {
    favoritedByFolder[key] = new Set();
  }
  if (root.handle) {
    const sidecar = await readFavoritesSidecar(root.handle);
    if (sidecar) {
      for (const path of sidecar) favoritedByFolder[key]!.add(path);
    }
    return;
  }
  if (root.tauriPath && isTauriShell()) {
    try {
      const text = await tauriReadLocalText(root.tauriPath, FAVORITES_SIDECAR);
      const sidecar = readFavoritesSidecarText(text);
      if (sidecar) {
        for (const path of sidecar) favoritedByFolder[key]!.add(path);
      }
    } catch {
      // no favorites sidecar yet
    }
  }
};

/** Prefer newer of IDB resume vs `.me621-library.json`; write winner back to IDB. */
const mergeResumeFromLibrarySidecar = async (
  browse: BrowseRoot,
) => {
  const library = await readLibrarySidecarForRoot(browse);
  const disk = library?.resume ?? null;
  if (!disk?.path) return;
  try {
    const all = (await localforage.getItem<ResumeStore>(RESUME_KEY)) || {};
    const existing = all[browse.folderKey];
    if (!existing || (disk.savedAt || 0) >= (existing.savedAt || 0)) {
      all[browse.folderKey] = disk;
      await localforage.setItem(RESUME_KEY, all);
    }
  } catch {
    // ignore
  }
};

const resolveFolderKeyArg = (
  folderKey?: string | null,
  relativePath?: string,
): string | null => {
  if (folderKey && browseRootsByKey.has(folderKey)) return folderKey;
  if (folderKey) {
    const byLabel = [...browseRootsByKey.values()].find(
      (r) => r.label.toLowerCase() === folderKey.toLowerCase(),
    );
    if (byLabel) return byLabel.folderKey;
    if (
      folderKey.startsWith("id:") ||
      folderKey.startsWith("name:") ||
      folderKey.startsWith("path:")
    ) {
      return folderKey;
    }
  }
  if (relativePath && cachedIndex) {
    const matches = cachedIndex.filter((e) => e.relativePath === relativePath);
    if (matches.length === 1) return matches[0]!.folderKey;
  }
  return null;
};

export const setLocalFavorite = async (
  relativePath: string,
  favorited: boolean,
  folderKey?: string,
) => {
  if (!relativePath) return;
  const key = resolveFolderKeyArg(folderKey, relativePath);
  if (!key) {
    throw new Error("folderKey is required when the path is ambiguous");
  }
  if (!favoritedByFolder[key]) favoritedByFolder[key] = new Set();
  if (favorited) {
    favoritedByFolder[key]!.add(relativePath);
  } else {
    favoritedByFolder[key]!.delete(relativePath);
  }
  for (const entry of cachedIndex || []) {
    if (entry.folderKey === key && entry.relativePath === relativePath) {
      entry.tags = tagsForEntry(entry);
    }
  }
  for (const entry of cachedOrdered || []) {
    if (entry.folderKey === key && entry.relativePath === relativePath) {
      entry.tags = tagsForEntry(entry);
    }
  }
  await persistFavorites(key);
};

export const isLocalFavorited = (relativePath: string, folderKey?: string) => {
  const key = resolveFolderKeyArg(folderKey, relativePath);
  if (!key) return false;
  return favoritedByFolder[key]?.has(relativePath) ?? false;
};

const normalizeResumeKey = (folderOverride?: string | null): string | null => {
  if (!folderOverride) return null;
  if (
    folderOverride.startsWith("id:") ||
    folderOverride.startsWith("name:") ||
    folderOverride.startsWith("path:")
  ) {
    return folderOverride;
  }
  const byKey = browseRootsByKey.get(folderOverride);
  if (byKey) return byKey.folderKey;
  const byLabel = [...browseRootsByKey.values()].find(
    (r) => r.label.toLowerCase() === folderOverride.toLowerCase(),
  );
  if (byLabel) return byLabel.folderKey;
  return `name:${folderOverride}`;
};

export const saveLocalResume = async (
  path: string,
  videoTime?: number,
  folderOverride?: string | null,
) => {
  await ensureBrowseRootsLoaded();
  const key =
    normalizeResumeKey(folderOverride) ||
    [...browseRootsByKey.keys()][0] ||
    null;
  if (!key || !path) return;
  const state: LocalResumeState = {
    path,
    videoTime:
      typeof videoTime === "number" && Number.isFinite(videoTime) && videoTime > 0
        ? videoTime
        : undefined,
    savedAt: Date.now(),
  };
  await withSidecarMergeLock(async () => {
    const all = (await localforage.getItem<ResumeStore>(RESUME_KEY)) || {};
    all[key] = state;
    await localforage.setItem(RESUME_KEY, all);
    const browse = browseRootsByKey.get(key);
    if (browse) await writeLibrarySidecarForRoot(browse, state);
  });
};

const resumeForKey = async (
  key: string,
  legacyName: string,
): Promise<LocalResumeState | null> => {
  const browse = browseRootsByKey.get(key);
  if (browse) await mergeResumeFromLibrarySidecar(browse);
  try {
    const all = (await localforage.getItem<ResumeStore>(RESUME_KEY)) || {};
    return (
      storeBucket(all, key, legacyName) ||
      (legacyName ? all[legacyName] : null) ||
      null
    );
  } catch {
    return null;
  }
};

export const getLocalResume = async (
  folderOverride?: string | null,
): Promise<LocalResumeState | null> => {
  await ensureBrowseRootsLoaded();
  const overrideKey = normalizeResumeKey(folderOverride);
  if (overrideKey) {
    const browse = browseRootsByKey.get(overrideKey);
    const legacy =
      browse?.label ||
      (overrideKey.startsWith("name:") ? overrideKey.slice(5) : "");
    return resumeForKey(overrideKey, legacy);
  }
  let best: LocalResumeState | null = null;
  for (const root of browseRootsByKey.values()) {
    const state = await resumeForKey(root.folderKey, root.label);
    if (!state?.path) continue;
    if (!best || (state.savedAt || 0) > (best.savedAt || 0)) {
      best = state;
    }
  }
  return best;
};

export const clearLocalResume = async (folderOverride?: string | null) => {
  await ensureBrowseRootsLoaded();
  const raw =
    normalizeResumeKey(folderOverride) ||
    [...browseRootsByKey.keys()][0] ||
    null;
  if (!raw) return;
  try {
    const all = (await localforage.getItem<ResumeStore>(RESUME_KEY)) || {};
    const keys = new Set<string>([raw]);
    if (!raw.startsWith("id:") && !raw.startsWith("name:") && !raw.startsWith("path:")) {
      keys.add(`name:${raw}`);
    }
    let changed = false;
    for (const k of keys) {
      if (k in all) {
        delete all[k];
        changed = true;
      }
    }
    if (changed) await localforage.setItem(RESUME_KEY, all);
  } catch {
    // ignore
  }
  const browse = browseRootsByKey.get(raw);
  if (browse) await writeLibrarySidecarForRoot(browse, null);
};

const extractPositiveFolderLabels = (tags: string[]): string[] => {
  const labels: string[] = [];
  for (const raw of tags) {
    const term = raw.trim().toLowerCase();
    if (!term || term.startsWith("-") || term.startsWith("order:")) continue;
    if (term.startsWith("folder:")) {
      const label = term.slice("folder:".length).trim();
      if (label) labels.push(label);
    }
  }
  return labels;
};

export const findLocalResumeTarget = async (
  tags: string[],
  limit: number,
): Promise<{
  path: string;
  folderKey?: string;
  videoTime?: number;
  page: number;
} | null> => {
  await ensureBrowseRootsLoaded();
  const folderLabels = extractPositiveFolderLabels(tags);
  let resume: LocalResumeState | null = null;
  let resumeFolderKey: string | undefined;
  if (folderLabels.length === 1) {
    const label = folderLabels[0]!;
    const root = [...browseRootsByKey.values()].find(
      (r) => r.label.toLowerCase() === label,
    );
    if (root) {
      resume = await getLocalResume(root.folderKey);
      resumeFolderKey = root.folderKey;
    } else {
      resume = await getLocalResume(`name:${label}`);
    }
  } else {
    // Newest among current folders; track which folder owned it.
    let bestSavedAt = -1;
    for (const root of browseRootsByKey.values()) {
      const state = await getLocalResume(root.folderKey);
      if (!state?.path) continue;
      if ((state.savedAt || 0) > bestSavedAt) {
        bestSavedAt = state.savedAt || 0;
        resume = state;
        resumeFolderKey = root.folderKey;
      }
    }
  }
  if (!resume?.path) return null;
  const scanned = await scanLocalMedia(false);
  if (scanned.status !== "ok" && scanned.status !== "empty") return null;
  const filtered = filterLocalMedia(scanned.entries, tags);
  const ordered = orderLocalMedia(filtered, tags, false);
  const index = ordered.findIndex(
    (entry) =>
      entry.relativePath === resume!.path &&
      (!resumeFolderKey || entry.folderKey === resumeFolderKey),
  );
  if (index < 0) return null;
  const hit = ordered[index]!;
  return {
    path: resume.path,
    folderKey: hit.folderKey,
    videoTime: resume.videoTime,
    page: Math.floor(index / Math.max(1, limit)) + 1,
  };
};

const mergeExtraIntoEntry = (entry: LocalMediaEntry) => {
  const extras = extraTagsByFolder[entry.folderKey]?.[entry.relativePath] || [];
  const parsed = parseLocalTags(entry.relativePath);
  entry.extraTags = extras;
  entry.artistTags = parsed.artistTags;
  entry.generalTags = uniqueTags([...parsed.generalTags, ...extras]);
  entry.tags = tagsForEntry(entry);
};

export const addLocalTags = async (
  relativePath: string,
  raw: string,
  folderKey?: string,
) => {
  const key = resolveFolderKeyArg(folderKey, relativePath);
  if (!key) throw new Error("folderKey is required when the path is ambiguous");
  const added = uniqueTags(
    raw
      .split(/\s+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag && !tag.startsWith("order:")),
  );
  if (!added.length) return [] as string[];
  return withSidecarMergeLock(async () => {
    if (!extraTagsByFolder[key]) extraTagsByFolder[key] = {};
    extraTagsByFolder[key]![relativePath] = uniqueTags([
      ...(extraTagsByFolder[key]![relativePath] || []),
      ...added,
    ]);
    for (const entry of cachedIndex || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    for (const entry of cachedOrdered || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    await persistExtraTagsUnlocked(key);
    return extraTagsByFolder[key]![relativePath] || [];
  });
};

export const removeLocalTag = async (
  relativePath: string,
  tag: string,
  folderKey?: string,
) => {
  const key = resolveFolderKeyArg(folderKey, relativePath);
  if (!key) throw new Error("folderKey is required when the path is ambiguous");
  return withSidecarMergeLock(async () => {
    if (!extraTagsByFolder[key]) extraTagsByFolder[key] = {};
    const current = extraTagsByFolder[key]![relativePath] || [];
    extraTagsByFolder[key]![relativePath] = current.filter((name) => name !== tag);
    if (!extraTagsByFolder[key]![relativePath]!.length) {
      delete extraTagsByFolder[key]![relativePath];
    }
    for (const entry of cachedIndex || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    for (const entry of cachedOrdered || []) {
      if (entry.folderKey === key && entry.relativePath === relativePath) {
        mergeExtraIntoEntry(entry);
      }
    }
    await persistExtraTagsUnlocked(key);
    return extraTagsByFolder[key]![relativePath] || [];
  });
};

const scanOneRoot = async (
  root: BrowseRoot,
): Promise<{ entries: LocalMediaEntry[]; denied: boolean }> => {
  await loadExtraTagsForRoot(root);
  await loadPosterMeta(root.folderKey, root.label);
  await loadFavoritesForRoot(root);
  await mergeResumeFromLibrarySidecar(root);

  if (root.tauriPath && isTauriShell()) {
    const listed = await tauriListLocalMedia(root.tauriPath);
    const extras = extraTagsByFolder[root.folderKey] || {};
    const entries: LocalMediaEntry[] = listed.map((row) => {
      const playable =
        typeof row.playable === "boolean"
          ? row.playable
          : resolvePlayableExt(row.ext);
      const parsed = parseLocalTags(row.relativePath);
      const extraTags = extras[row.relativePath] || [];
      const generalTags = uniqueTags([...parsed.generalTags, ...extraTags]);
      const kind = row.kind;
      const entry: LocalMediaEntry = {
        relativePath: row.relativePath,
        name: row.name,
        ext: row.ext,
        size: row.size,
        lastModified: row.lastModified,
        kind,
        playable,
        artistTags: parsed.artistTags,
        generalTags,
        extraTags,
        folderKey: root.folderKey,
        folderLabel: root.label,
        tauriRoot: root.tauriPath,
        tags: [],
      };
      entry.tags = uniqueTags([
        ...parsed.artistTags,
        ...generalTags,
        ...kindTagsFor(kind, playable),
        folderMetaTag(root.label),
        ...(isFavorited(root.folderKey, row.relativePath)
          ? ["type:favorited"]
          : []),
      ]);
      return entry;
    });
    const posters = posterMetaByFolder[root.folderKey] || {};
    for (const entry of entries) {
      const meta = posters[entry.relativePath];
      if (
        meta?.duration &&
        meta.lastModified === entry.lastModified &&
        meta.size === entry.size
      ) {
        entry.duration = meta.duration;
      }
    }
    return { entries, denied: false };
  }

  if (!root.handle) return { entries: [], denied: false };
  const allowed = await ensurePermission(root.handle, "read");
  if (!allowed) return { entries: [], denied: true };
  const entries: LocalMediaEntry[] = [];
  await walkDirectory(root.handle, "", entries, root);
  const posters = posterMetaByFolder[root.folderKey] || {};
  for (const entry of entries) {
    const meta = posters[entry.relativePath];
    if (
      meta?.duration &&
      meta.lastModified === entry.lastModified &&
      meta.size === entry.size
    ) {
      entry.duration = meta.duration;
    }
  }
  return { entries, denied: false };
};

export const scanLocalMedia = async (
  force = false,
): Promise<{ entries: LocalMediaEntry[]; status: LocalMediaStatus }> => {
  if (!supportsLocalBrowse()) {
    return { entries: [], status: "no-picker" };
  }

  await ensureBrowseRootsLoaded();
  if (!browseRootsByKey.size) {
    return { entries: [], status: "no-folder" };
  }

  const cacheKey = rootsCacheKey();
  if (cachedIndex && cachedRootsKey === cacheKey && !force) {
    return {
      entries: cachedIndex,
      status: cachedIndex.length ? "ok" : "empty",
    };
  }

  const allEntries: LocalMediaEntry[] = [];
  let deniedCount = 0;
  let reachableCount = 0;
  const deniedLabels: string[] = [];
  for (const root of browseRootsByKey.values()) {
    try {
      const { entries, denied } = await scanOneRoot(root);
      if (denied) {
        deniedCount += 1;
        deniedLabels.push(root.label);
        continue;
      }
      reachableCount += 1;
      allEntries.push(...entries);
    } catch {
      deniedCount += 1;
      deniedLabels.push(root.label);
    }
  }
  lastScanDeniedLabels = deniedLabels;

  if (reachableCount === 0 && deniedCount > 0) {
    return { entries: [], status: "denied" };
  }

  allEntries.sort((a, b) => b.lastModified - a.lastModified);
  cachedIndex = allEntries;
  cachedRootsKey = cacheKey;
  return { entries: allEntries, status: allEntries.length ? "ok" : "empty" };
};

const normalizeLoose = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const filenameTokens = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const editDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const next = Array.from<number>({ length: b.length + 1 });
  for (let i = 0; i < a.length; i++) {
    next[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      next[j + 1] = Math.min(
        (prev[j + 1] ?? 0) + 1,
        (next[j] ?? 0) + 1,
        (prev[j] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = next[j] ?? 0;
  }
  return prev[b.length] ?? b.length;
};

export const fuzzyFilenameMatch = (relativePath: string, term: string) => {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const path = relativePath.replace(/\\/g, "/").toLowerCase();
  const filename = path.split("/").pop() || path;
  if (path.includes(needle) || filename.includes(needle)) return true;
  const compactPath = normalizeLoose(path);
  const compactName = normalizeLoose(filename);
  const compactTerm = normalizeLoose(needle);
  if (compactTerm && (compactPath.includes(compactTerm) || compactName.includes(compactTerm))) {
    return true;
  }
  const tokens = filenameTokens(filename);
  if (tokens.some((token) => token.startsWith(compactTerm) || token.includes(compactTerm))) {
    return true;
  }
  if (compactTerm.length >= 4) {
    return tokens.some(
      (token) =>
        Math.abs(token.length - compactTerm.length) <= 2 &&
        editDistance(token, compactTerm) <= 1,
    );
  }
  return false;
};

/** Sidecar/general tags ranked same as path tokens (exact or fuzzyFilenameMatch). */
export const fuzzyTagsMatch = (tags: string[], term: string) => {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return fuzzyableTags(tags).some(
    (tag) => tag.toLowerCase() === needle || fuzzyFilenameMatch(tag, needle),
  );
};

const parseFolderTerm = (
  term: string,
): { exclude: boolean; label: string } | null => {
  const raw = term.trim().toLowerCase();
  if (!raw) return null;
  const exclude = raw.startsWith("-");
  const body = exclude ? raw.slice(1) : raw;
  if (!body.startsWith("folder:")) return null;
  const label = body.slice("folder:".length).trim();
  if (!label) return null;
  return { exclude, label };
};

const entryMatchesFolderLabel = (entry: LocalMediaEntry, label: string) =>
  entry.folderLabel.toLowerCase() === label.toLowerCase();

export const filterLocalMedia = (
  index: LocalMediaEntry[],
  tags: string[],
) => {
  const terms = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag && !tag.startsWith("order:"));
  if (!terms.length) return index;
  return index.filter((entry) =>
    terms.every((term) => {
      const folderTerm = parseFolderTerm(term);
      if (folderTerm) {
        const hit = entryMatchesFolderLabel(entry, folderTerm.label);
        return folderTerm.exclude ? !hit : hit;
      }
      if (term.startsWith("-")) {
        const positive = term.slice(1);
        if (!positive) return true;
        return !(
          fuzzyTagsMatch(entry.tags, positive) ||
          fuzzyFilenameMatch(entry.relativePath, positive) ||
          fuzzyFilenameMatch(entry.name, positive)
        );
      }
      return (
        fuzzyTagsMatch(entry.tags, term) ||
        fuzzyFilenameMatch(entry.relativePath, term) ||
        fuzzyFilenameMatch(entry.name, term)
      );
    }),
  );
};

const compareName = (a: LocalMediaEntry, b: LocalMediaEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

const orderLocalMedia = (
  entries: LocalMediaEntry[],
  tags: string[],
  reshuffle: boolean,
) => {
  const order =
    tags.find((tag) => tag.toLowerCase().startsWith("order:"))?.toLowerCase() ||
    "order:newest";
  const key = `${cachedRootsKey}|${entries.length}|${order}|${tags
    .filter((tag) => !tag.toLowerCase().startsWith("order:"))
    .join("\0")}`;
  if (!reshuffle && cachedOrdered && cachedOrderKey === key) {
    return cachedOrdered;
  }
  const next = [...entries];
  switch (order) {
    case "order:random":
      shuffleInPlace(next);
      break;
    case "order:id":
    case "order:oldest":
      next.sort((a, b) => a.lastModified - b.lastModified || compareName(a, b));
      break;
    case "order:name":
      next.sort(compareName);
      break;
    case "order:name_desc":
      next.sort((a, b) => compareName(b, a));
      break;
    case "order:filesize":
      next.sort((a, b) => b.size - a.size || compareName(a, b));
      break;
    case "order:filesize_asc":
      next.sort((a, b) => a.size - b.size || compareName(a, b));
      break;
    case "order:duration":
      next.sort(
        (a, b) =>
          (b.duration || 0) - (a.duration || 0) || compareName(a, b),
      );
      break;
    case "order:duration_asc":
      next.sort(
        (a, b) =>
          (a.duration || 0) - (b.duration || 0) || compareName(a, b),
      );
      break;
    case "order:newest":
    default:
      next.sort((a, b) => b.lastModified - a.lastModified || compareName(a, b));
      break;
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
): Promise<{
  poster: string | null;
  width: number;
  height: number;
  duration: number;
}> => {
  const fallback = { poster: null, width: 3, height: 4, duration: 0 };
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let settled = false;
    const finish = (result: {
      poster: string | null;
      width: number;
      height: number;
      duration?: number;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration =
        result.duration && Number.isFinite(result.duration)
          ? result.duration
          : Number.isFinite(video.duration)
            ? video.duration
            : 0;
      video.removeAttribute("src");
      video.load();
      resolve({
        poster: result.poster,
        width: result.width || fallback.width,
        height: result.height || fallback.height,
        duration: duration > 0 ? duration : 0,
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
          duration,
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
          finish({ poster: null, width, height, duration: video.duration });
          return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish({ poster: null, width, height, duration: video.duration });
              return;
            }
            finish({
              poster: URL.createObjectURL(blob),
              width,
              height,
              duration: video.duration,
            });
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        finish({
          poster: null,
          width,
          height,
          duration: video.duration,
        });
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
  meta: uniqueTags([
    ...kindTagsFor(entry.kind, entry.playable),
    folderMetaTag(entry.folderLabel),
    ...(isFavorited(entry.folderKey, entry.relativePath)
      ? ["type:favorited"]
      : []),
  ]),
});

const blobUrlFor = async (entry: LocalMediaEntry) => {
  const id = idForPath(entry.folderKey, entry.relativePath);
  const existing = blobUrls.get(id);
  if (existing) return { id, url: existing };
  if (entry.handle) {
    const file = await entry.handle.getFile();
    const url = URL.createObjectURL(file);
    blobUrls.set(id, url);
    return { id, url };
  }
  const root = entry.tauriRoot || (await getTauriLocalRoot());
  if (!root) throw new Error("No Local browse folder");
  const bytes = await tauriReadLocalFile(root, entry.relativePath);
  const mime =
    entry.kind === "audio"
      ? `audio/${entry.ext === "mp3" ? "mpeg" : entry.ext}`
      : entry.kind === "video"
        ? `video/${entry.ext}`
        : `image/${entry.ext === "jpg" ? "jpeg" : entry.ext}`;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  blobUrls.set(id, url);
  return { id, url };
};

const resolveVideoPreview = async (
  entry: LocalMediaEntry,
  id: number,
  fileUrl: string,
) => {
  const cached = await readCachedPoster(entry, id);
  if (cached) {
    posterUrls.set(id, cached.url);
    if (cached.duration && cached.duration > 0) {
      entry.duration = cached.duration;
    }
    return {
      width: cached.width,
      height: cached.height,
      previewUrl: cached.url,
      duration: cached.duration || 0,
    };
  }
  const frame = await captureVideoFrame(fileUrl);
  if (frame.duration > 0) {
    entry.duration = frame.duration;
  }
  if (frame.poster) {
    posterUrls.set(id, frame.poster);
    await writeCachedPoster(
      entry,
      id,
      frame.poster,
      frame.width,
      frame.height,
      frame.duration,
    );
    return {
      width: frame.width,
      height: frame.height,
      previewUrl: frame.poster,
      duration: frame.duration,
    };
  }
  return {
    width: frame.width,
    height: frame.height,
    previewUrl: "",
    duration: frame.duration,
  };
};

export const localEntriesToPosts = async (
  entries: LocalMediaEntry[],
  page: number,
): Promise<EnhancedPost[]> => {
  return Promise.all(
    entries.map(async (entry) => {
      const { id, url } = await blobUrlFor(entry);
      let width = 3;
      let height = 4;
      let previewUrl = url;
      if (entry.kind === "audio") {
        width = 1;
        height = 1;
        previewUrl = "";
      } else if (entry.kind === "video") {
        if (entry.playable) {
          const preview = await resolveVideoPreview(entry, id, url);
          width = preview.width;
          height = preview.height;
          previewUrl = preview.previewUrl || "";
        } else {
          width = 16;
          height = 9;
          previewUrl = "";
        }
      } else {
        const size = await probeImageDimensions(url);
        width = size.width;
        height = size.height;
      }
      const created = new Date(entry.lastModified).toISOString();
      const favorited = isFavorited(entry.folderKey, entry.relativePath);
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
          url: entry.playable ? url : "",
        },
        preview: { width, height, url: previewUrl },
        sample: { has: !!previewUrl, width, height, url: previewUrl },
        score: { up: 0, down: 0, total: 0 },
        tags: toPostTags(entry),
        locked_tags: [],
        change_seq: 0,
        flags: emptyFlags(),
        rating: "e",
        fav_count: favorited ? 1 : 0,
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
        is_favorited: favorited,
        has_notes: false,
        __meta: {
          isBlacklisted: false,
          pageNumber: page,
          originMode: "local",
          localPath: entry.relativePath,
          localFolderKey: entry.folderKey,
          localFolderLabel: entry.folderLabel,
          localExtraTags: [...entry.extraTags],
          localPlayable: entry.playable,
          localKind: entry.kind,
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

type DirWalker = FileSystemDirectoryHandle & {
  getDirectoryHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FileSystemDirectoryHandle>;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FileSystemFileHandle>;
  removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
};

const resolveParentAndName = async (
  root: FileSystemDirectoryHandle,
  relativePath: string,
  createDirs: boolean,
) => {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) throw new Error("Invalid path");
  let dir = root as DirWalker;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = (await dir.getDirectoryHandle(parts[i]!, {
      create: createDirs,
    })) as DirWalker;
  }
  return { dir, name: parts[parts.length - 1]! };
};

const migratePathKeys = async (
  folderKey: string,
  fromPath: string,
  toPath: string,
) => {
  if (fromPath === toPath) return;
  const extras = extraTagsByFolder[folderKey] || {};
  if (extras[fromPath]) {
    extras[toPath] = uniqueTags([
      ...(extras[toPath] || []),
      ...extras[fromPath],
    ]);
    delete extras[fromPath];
    extraTagsByFolder[folderKey] = extras;
    await persistExtraTags(folderKey);
  }
  const favs = favoritedByFolder[folderKey];
  if (favs?.has(fromPath)) {
    favs.delete(fromPath);
    favs.add(toPath);
    await persistFavorites(folderKey);
  }
  const posters = posterMetaByFolder[folderKey];
  if (posters?.[fromPath]) {
    posters[toPath] = posters[fromPath]!;
    delete posters[fromPath];
    await persistPosterMeta(folderKey);
  }
};

export const remuxLocalPath = async (
  relativePath: string,
  onProgress?: (ratio: number) => void,
  opts?: { folderKey?: string; skipInvalidate?: boolean },
): Promise<{ newPath: string }> => {
  const { remuxBlobToMp4 } = await import("@/misc/util/localRemux");
  await ensureBrowseRootsLoaded();
  const folderKey =
    resolveFolderKeyArg(opts?.folderKey, relativePath) ||
    [...browseRootsByKey.keys()][0] ||
    null;
  if (!folderKey) throw new Error("No Local browse folder");
  const browse = browseRootsByKey.get(folderKey);
  if (!browse) throw new Error("No Local browse folder");

  if (browse.tauriPath && isTauriShell()) {
    const tauriRoot = browse.tauriPath;
    const bytes = await tauriReadLocalFile(tauriRoot, relativePath);
    const name = relativePath.split("/").pop() || relativePath;
    const remuxed = await remuxBlobToMp4(
      new Blob([new Uint8Array(bytes)]),
      name,
      onProgress,
    );
    const lower = name.toLowerCase();
    const keepSameName = lower.endsWith(".mp4");
    const newName = keepSameName
      ? name
      : `${name.replace(/\.[^.]+$/, "")}.mp4`;
    const prefix = relativePath.includes("/")
      ? relativePath.slice(0, relativePath.lastIndexOf("/") + 1)
      : "";
    const newPath = `${prefix}${newName}`;
    const outBuf = new Uint8Array(await remuxed.arrayBuffer());
    await tauriWriteLocalFile(tauriRoot, newPath, outBuf);
    if (!keepSameName) {
      try {
        await tauriRemoveLocalFile(tauriRoot, relativePath);
      } catch {
        // keep original if delete fails
      }
      await migratePathKeys(folderKey, relativePath, newPath);
    } else {
      if (posterMetaByFolder[folderKey]) {
        delete posterMetaByFolder[folderKey]![relativePath];
        await persistPosterMeta(folderKey);
      }
    }
    if (!opts?.skipInvalidate) {
      invalidateLocalMediaIndex();
      revokeLocalBlobUrls();
    }
    return { newPath };
  }

  const root = browse.handle;
  if (!root) throw new Error("No Local browse folder");
  const allowed = await ensurePermission(root, "readwrite");
  if (!allowed) throw new Error("Write access to the browse folder was denied");

  const { dir, name } = await resolveParentAndName(root, relativePath, false);
  const fileHandle = await dir.getFileHandle(name);
  const file = await fileHandle.getFile();
  const remuxed = await remuxBlobToMp4(file, name, onProgress);

  const lower = name.toLowerCase();
  const keepSameName = lower.endsWith(".mp4");
  const newName = keepSameName
    ? name
    : `${name.replace(/\.[^.]+$/, "")}.mp4`;
  const prefix = relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/") + 1)
    : "";
  const newPath = `${prefix}${newName}`;

  const outHandle = await dir.getFileHandle(newName, { create: true });
  const writable = await outHandle.createWritable();
  await writable.write(remuxed);
  await writable.close();

  if (!keepSameName) {
    try {
      await dir.removeEntry(name);
    } catch {
      // keep original if delete fails
    }
    await migratePathKeys(folderKey, relativePath, newPath);
  } else {
    // Drop stale poster meta so the next load re-probes the real MP4.
    if (posterMetaByFolder[folderKey]) {
      delete posterMetaByFolder[folderKey]![relativePath];
      await persistPosterMeta(folderKey);
    }
  }

  if (!opts?.skipInvalidate) {
    invalidateLocalMediaIndex();
    revokeLocalBlobUrls();
  }
  return { newPath };
};

export type BulkRemuxProgress = {
  index: number;
  total: number;
  path: string;
  fileProgress: number;
  done: number;
  failed: number;
};

export type BulkRemuxResult = {
  done: number;
  failed: number;
  aborted: boolean;
  errors: { path: string; message: string }[];
};

/**
 * Sequentially remux unplayable Local videos (ffmpeg.wasm is a singleton).
 * Honors current Local tag filter when `tags` is passed.
 */
export const remuxUnplayableLocal = async (opts?: {
  tags?: string[];
  signal?: AbortSignal;
  onProgress?: (progress: BulkRemuxProgress) => void;
}): Promise<BulkRemuxResult> => {
  const scanned = await scanLocalMedia(false);
  if (scanned.status !== "ok" && scanned.status !== "empty") {
    throw new Error(localStatusMessage(scanned.status) || "Local folder unavailable");
  }
  const filtered = opts?.tags
    ? filterLocalMedia(scanned.entries, opts.tags)
    : scanned.entries;
  const targets = filtered.filter(
    (entry) => entry.kind === "video" && !entry.playable,
  );
  const result: BulkRemuxResult = {
    done: 0,
    failed: 0,
    aborted: false,
    errors: [],
  };
  if (!targets.length) return result;

  for (let i = 0; i < targets.length; i++) {
    if (opts?.signal?.aborted) {
      result.aborted = true;
      break;
    }
    const entry = targets[i]!;
    opts?.onProgress?.({
      index: i,
      total: targets.length,
      path: entry.relativePath,
      fileProgress: 0,
      done: result.done,
      failed: result.failed,
    });
    try {
      await remuxLocalPath(
        entry.relativePath,
        (fileProgress) => {
          opts?.onProgress?.({
            index: i,
            total: targets.length,
            path: entry.relativePath,
            fileProgress,
            done: result.done,
            failed: result.failed,
          });
        },
        { folderKey: entry.folderKey, skipInvalidate: true },
      );
      result.done += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        path: entry.relativePath,
        message: err instanceof Error ? err.message : "Remux failed",
      });
    }
  }

  invalidateLocalMediaIndex();
  revokeLocalBlobUrls();
  return result;
};

export type LocalSidecarExport = {
  version: 1;
  folder: string;
  tags: Record<string, string[]>;
  favorites: string[];
};

const resolveExportRoot = (folderKey?: string): BrowseRoot => {
  if (folderKey) {
    const key = resolveFolderKeyArg(folderKey);
    const root = key ? browseRootsByKey.get(key) : undefined;
    if (root) return root;
    throw new Error("Local browse folder not found");
  }
  const first = [...browseRootsByKey.values()][0];
  if (!first) throw new Error("No Local browse folder");
  return first;
};

export const exportLocalSidecars = async (
  folderKey?: string,
): Promise<LocalSidecarExport> => {
  await ensureBrowseRootsLoaded();
  const browse = resolveExportRoot(folderKey);
  await scanLocalMedia(false);
  return {
    version: 1,
    folder: browse.label,
    tags: { ...(extraTagsByFolder[browse.folderKey] || {}) },
    favorites: [...(favoritedByFolder[browse.folderKey] || new Set())].sort(),
  };
};

export const importLocalSidecars = async (
  payload: LocalSidecarExport,
  folderKey?: string,
) => {
  if (!payload || payload.version !== 1) {
    throw new Error("Unsupported Local sidecar file");
  }
  await ensureBrowseRootsLoaded();
  const browse = resolveExportRoot(folderKey);
  await scanLocalMedia(false);
  const key = browse.folderKey;
  if (!extraTagsByFolder[key]) extraTagsByFolder[key] = {};
  if (!favoritedByFolder[key]) favoritedByFolder[key] = new Set();
  for (const [path, tags] of Object.entries(payload.tags || {})) {
    if (!Array.isArray(tags)) continue;
    extraTagsByFolder[key]![path] = uniqueTags([
      ...(extraTagsByFolder[key]![path] || []),
      ...tags.filter((tag): tag is string => typeof tag === "string"),
    ]);
  }
  for (const path of payload.favorites || []) {
    if (typeof path === "string" && path) favoritedByFolder[key]!.add(path);
  }
  for (const entry of cachedIndex || []) {
    if (entry.folderKey === key) mergeExtraIntoEntry(entry);
  }
  for (const entry of cachedOrdered || []) {
    if (entry.folderKey === key) mergeExtraIntoEntry(entry);
  }
  await persistExtraTags(key);
  await persistFavorites(key);
  invalidateLocalMediaIndex();
};

export const localStatusMessage = (status: LocalMediaStatus) => {
  switch (status) {
    case "no-picker":
      return "This browser cannot open a local folder. Use Chromium, or the Tauri desktop app.";
    case "no-folder":
      return "Choose a Local browse folder in Account or Post settings.";
    case "denied":
      return "Allow access to the Local browse folder(s) to browse files.";
    case "empty":
      return "No images, videos, or audio in the browse folder(s).";
    default:
      return "";
  }
};
