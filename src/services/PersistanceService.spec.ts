import { describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => null),
    setDriver: vi.fn(async () => undefined),
  },
}));

import { reactive } from "vue";
import {
  stripSettingsCredentials,
  summarizeSettingsImport,
  toPlain,
} from "./PersistanceService";
import { defaultSettings } from "./defaultSettings";
import clone from "clone";

describe("toPlain", () => {
  it("clones nested objects without reactive proxies", () => {
    const state = reactive({
      posts: { videoVolume: 0.5, nested: { a: 1 } },
      list: [1, { x: 2 }],
    });
    const plain = toPlain(state) as typeof state;
    expect(plain).toEqual({
      posts: { videoVolume: 0.5, nested: { a: 1 } },
      list: [1, { x: 2 }],
    });
    plain.posts.videoVolume = 1;
    expect(state.posts.videoVolume).toBe(0.5);
  });
});

describe("stripSettingsCredentials", () => {
  it("clears apiKey from live account and profiles", () => {
    const state = clone(defaultSettings);
    state.account.apiKey = "secret";
    state.account.username = "tony";
    state.profiles.e621.account.apiKey = "e621key";
    state.profiles.e621.account.username = "e621user";
    stripSettingsCredentials(state);
    expect(state.account.apiKey).toBeNull();
    expect(state.account.username).toBe("tony");
    expect(state.profiles.e621.account.apiKey).toBeNull();
    expect(state.profiles.e621.account.username).toBe("e621user");
  });
});

describe("summarizeSettingsImport", () => {
  it("counts credentials and list sizes", () => {
    const state = clone(defaultSettings);
    state.profiles.e621.account.apiKey = "k";
    state.blacklist.tags = [["young"], ["gore"]];
    state.history.entries = [["order:rank"]];
    const summary = summarizeSettingsImport(state);
    expect(summary.credentialSiteCount).toBe(1);
    expect(summary.blacklistEntries).toBe(2);
    expect(summary.historyEntries).toBe(1);
    expect(summary.activeMode).toBe("e621");
  });
});
