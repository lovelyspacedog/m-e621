import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/worker/services", () => ({
  getApiService: vi.fn(async () => ({
    resetUnifiedMerge: vi.fn(),
    resetVideoMerge: vi.fn(),
  })),
}));

import { useSiteModeStore } from "@/services/SiteModeStore";
import { useMainStore } from "@/services/state";
import { useSnackbarStore } from "@/services/SnackbarStore";
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

describe("SiteModeStore Federated previous mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("persists previousModeBeforeUnified when entering Federated", () => {
    const main = useMainStore();
    main.activeMode = "furaffinity";
    main.previousModeBeforeUnified = null;
    const site = useSiteModeStore();
    site.setMode("unified");
    expect(main.previousModeBeforeUnified).toBe("furaffinity");
    expect(main.activeMode).toBe("unified");
  });

  it("demoteUnifiedOnLanding restores previous mode silently", () => {
    const main = useMainStore();
    const snackbar = useSnackbarStore();
    main.activeMode = "inkbunny";
    main.previousModeBeforeUnified = null;
    const site = useSiteModeStore();
    site.setMode("unified");
    snackbar.clearMessage();
    site.demoteUnifiedOnLanding({ fromBrowsePosts: false });
    expect(main.activeMode).toBe("inkbunny");
    expect(main.previousModeBeforeUnified).toBeNull();
    expect(snackbar.message).toBeNull();
  });

  it("demoteUnifiedOnLanding no-ops when coming from Browse posts", () => {
    const main = useMainStore();
    main.activeMode = "e621";
    const site = useSiteModeStore();
    site.setMode("unified");
    site.demoteUnifiedOnLanding({ fromBrowsePosts: true });
    expect(main.activeMode).toBe("unified");
    expect(main.previousModeBeforeUnified).toBe("e621");
  });

  it("demoteUnifiedOnLanding falls back to e621 when previous is missing", () => {
    const main = useMainStore();
    main.activeMode = "unified";
    main.previousModeBeforeUnified = null;
    if (!main.profiles.unified) {
      main.profiles.unified = createEmptySiteProfile("unified");
    }
    const site = useSiteModeStore();
    site.demoteUnifiedOnLanding({ fromBrowsePosts: false });
    expect(main.activeMode).toBe("e621");
  });
});
