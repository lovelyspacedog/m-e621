/** Persist sidebar section open/closed across reloads. */
const STORAGE_KEY = "m-e621-sidebar-sections";

type SectionMap = Record<string, boolean>;

function readAll(): SectionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SectionMap;
  } catch {
    return {};
  }
}

function writeAll(map: SectionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function readSidebarSectionOpen(id: string, defaultOpen: boolean): boolean {
  const map = readAll();
  if (Object.prototype.hasOwnProperty.call(map, id)) {
    return !!map[id];
  }
  return defaultOpen;
}

export function writeSidebarSectionOpen(id: string, open: boolean) {
  const map = readAll();
  map[id] = open;
  writeAll(map);
}
