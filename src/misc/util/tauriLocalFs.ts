/** Tauri Local FS bridge — pick/list/read/write for desktop shell. */

export type TauriLocalFileEntry = {
  relativePath: string;
  name: string;
  ext: string;
  size: number;
  lastModified: number;
  kind: "image" | "video" | "audio";
};

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const getInvoke = (): TauriInvoke | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    __TAURI__?: { invoke?: TauriInvoke };
    __TAURI_IPC__?: unknown;
  };
  if (typeof w.__TAURI__?.invoke === "function") {
    return w.__TAURI__.invoke.bind(w.__TAURI__);
  }
  return null;
};

export const isTauriShell = (): boolean => getInvoke() !== null;

/** Local mode works with Chromium FSA or the Tauri desktop shell. */
export const supportsLocalBrowse = (): boolean => {
  if (typeof window === "undefined") return false;
  if (
    typeof (window as Window & { showDirectoryPicker?: unknown })
      .showDirectoryPicker === "function"
  ) {
    return true;
  }
  return isTauriShell();
};

/**
 * Writes (remux, sidecar, save-into-folder): Chromium FSA, or Tauri once a
 * browse root is picked (caller must supply the root path).
 */
export const supportsLocalWrites = (): boolean => {
  if (typeof window === "undefined") return false;
  if (
    typeof (window as Window & { showDirectoryPicker?: unknown })
      .showDirectoryPicker === "function"
  ) {
    return true;
  }
  return isTauriShell();
};

export const tauriPickLocalFolder = async (): Promise<string | null> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  return invoke<string | null>("pick_local_folder");
};

export const tauriListLocalMedia = async (
  root: string,
): Promise<TauriLocalFileEntry[]> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  const rows = await invoke<
    Array<{
      relativePath: string;
      name: string;
      ext: string;
      size: number;
      lastModified: number;
      kind: string;
    }>
  >("list_local_media", { root });
  return (rows || [])
    .filter(
      (row) =>
        row.kind === "image" || row.kind === "video" || row.kind === "audio",
    )
    .map((row) => ({
      relativePath: row.relativePath,
      name: row.name,
      ext: row.ext,
      size: Number(row.size) || 0,
      lastModified: Number(row.lastModified) || 0,
      kind: row.kind as "image" | "video" | "audio",
    }));
};

export const tauriReadLocalFile = async (
  root: string,
  relativePath: string,
): Promise<Uint8Array> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  const bytes = await invoke<number[]>("read_local_file", {
    root,
    relativePath,
  });
  return Uint8Array.from(bytes || []);
};

export const tauriWriteLocalFile = async (
  root: string,
  relativePath: string,
  data: ArrayBuffer | Uint8Array,
): Promise<void> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  const bytes =
    data instanceof Uint8Array ? Array.from(data) : Array.from(new Uint8Array(data));
  await invoke<void>("write_local_file", { root, relativePath, bytes });
};

export const tauriRemoveLocalFile = async (
  root: string,
  relativePath: string,
): Promise<void> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  await invoke<void>("remove_local_file", { root, relativePath });
};

export const tauriReadLocalText = async (
  root: string,
  relativePath: string,
): Promise<string> => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Not running inside Tauri");
  return invoke<string>("read_local_text", { root, relativePath });
};

export const tauriRootDisplayName = (root: string): string => {
  const cleaned = root.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned || "Local";
};
