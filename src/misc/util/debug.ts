const STORAGE_KEY = "m-e621-debug-logging";

/** Main-thread gate for prod `debug()` logs. Workers are unchanged (no localStorage). */
export const isDebugLoggingEnabled = (): boolean => {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* private mode */
  }
  return true;
};

export const setDebugLoggingEnabled = (enabled: boolean) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
};

export const debug = (namespace: string) =>
  (...args: unknown[]) => {
    if (!import.meta.env.PROD) return;
    if (!isDebugLoggingEnabled()) return;
    console.log(namespace, ...args);
  };

/** Dev-only logger. Do not invert `debug()` — that dumps noise on hosted PROD. */
export const debugDev = (namespace: string) =>
  (...args: unknown[]) => {
    if (import.meta.env.PROD) return;
    console.log(namespace, ...args);
  };
