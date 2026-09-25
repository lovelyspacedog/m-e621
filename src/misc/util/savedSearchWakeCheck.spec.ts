import { describe, expect, it, vi } from "vitest";
import { checkSavedSearchWake } from "./savedSearchWakeCheck";

describe("checkSavedSearchWake", () => {
  it("uses local fetch in local mode", async () => {
    const fetchLocal = vi.fn(async () => ({
      posts: [
        { id: 2, created_at: "2026-02-01T00:00:00Z", __meta: { originMode: "local" } },
        { id: 1, created_at: "2026-01-01T00:00:00Z", __meta: { originMode: "local" } },
      ],
    }));
    const r = await checkSavedSearchWake({
      mode: "local",
      cursor: {
        lastOpenedAt: 1,
        newestKey: "local:1",
        createdMs: Date.parse("2026-01-01T00:00:00Z"),
      },
      fetchLocal,
    });
    expect(fetchLocal).toHaveBeenCalled();
    expect(r.newer).toBe(1);
    expect(r.newestKey).toBe("local:2");
  });

  it("uses remote fetch otherwise", async () => {
    const fetchRemote = vi.fn(async () => ({
      posts: [{ id: 9, __meta: { originMode: "e621" } }],
    }));
    const r = await checkSavedSearchWake({
      mode: "e621",
      cursor: undefined,
      fetchRemote,
    });
    expect(fetchRemote).toHaveBeenCalled();
    expect(r.newer).toBe(1);
  });
});
