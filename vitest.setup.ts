/**
 * jsdom has no IndexedDB; localforage rejects async and Vitest treats that as
 * an unhandled error after store imports. Memory stub keeps unit/CI green.
 */
import { vi } from "vitest";

vi.mock("localforage", () => {
  const memory = new Map<string, unknown>();
  const api = {
    config: vi.fn(),
    createInstance: vi.fn(() => api),
    getItem: vi.fn(async (key: string) => (memory.has(key) ? memory.get(key) : null)),
    setItem: vi.fn(async (key: string, value: unknown) => {
      memory.set(key, value);
      return value;
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
    clear: vi.fn(async () => {
      memory.clear();
    }),
    ready: vi.fn(async () => undefined),
    setDriver: vi.fn(async () => undefined),
    INDEXEDDB: "asyncStorage",
    LOCALSTORAGE: "localStorageWrapper",
    WEBSQL: "webSQLStorage",
  };
  return { default: api, ...api };
});
