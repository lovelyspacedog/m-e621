import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/worker/services", () => ({
  getApiService: vi.fn(async () => ({
    resetUnifiedMerge: vi.fn(),
  })),
}));

import { useSiteModeStore } from "@/services/SiteModeStore";
import { useMainStore } from "@/services/state";
import { createEmptySiteProfile } from "@/services/siteProfiles";
import { defaultUnifiedSites } from "@/services/types";

describe("SiteModeStore Federated inclusion", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("does not reset unifiedSites when entering Federated", () => {
    const main = useMainStore();
    main.activeMode = "unified";
    main.profiles.unified = createEmptySiteProfile("unified");
    main.profiles.unified.unifiedSites = {
      ...defaultUnifiedSites(),
      weasyl: false,
    };
    const site = useSiteModeStore();
    site.setMode("e621");
    site.setMode("unified");
    expect(main.profiles.unified!.unifiedSites!.weasyl).toBe(false);
  });
});
