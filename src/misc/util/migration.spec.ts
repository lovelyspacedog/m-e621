import { describe, expect, it } from "vitest";
import type { ISettingsServiceState } from "@/services/types";
import { hasMigratableState } from "./migration";

const state = (patch: Partial<ISettingsServiceState>) =>
  patch as ISettingsServiceState;

describe("hasMigratableState", () => {
  it("treats favorite tags as a library worth migrating", () => {
    expect(
      hasMigratableState(
        state({
          favorites: { groups: [], tags: [{ name: "wolf" } as never] },
        }),
      ),
    ).toBe(true);
    expect(
      hasMigratableState(
        state({
          favorites: { groups: [], tags: [] },
        }),
      ),
    ).toBe(false);
  });

  it("counts watched threads and saved news", () => {
    expect(
      hasMigratableState(
        state({
          watchedU18chan: { entries: [{ topicId: 1 } as never] },
        }),
      ),
    ).toBe(true);
    expect(
      hasMigratableState(
        state({
          news: { saved: [{ id: "a" } as never] } as never,
        }),
      ),
    ).toBe(true);
  });
});
