import { describe, expect, it } from "vitest";
import {
  authChipState,
  clearAuthProbe,
  emptyAuth,
  formatAuthProbeHint,
  markAuthProbe,
} from "@/Settings/accountAuth";

describe("accountAuth", () => {
  it("marks probe timestamp and chip state", () => {
    const probe = emptyAuth();
    expect(authChipState(false, probe).label).toBe("No credentials");
    markAuthProbe(probe, true, "ok");
    expect(probe.checkedAt).toBeTypeOf("number");
    expect(authChipState(true, probe).label).toBe("Verified");
    markAuthProbe(probe, false, "bad");
    expect(authChipState(true, probe).label).toBe("Check failed");
    expect(formatAuthProbeHint(probe, true)).toMatch(/Last check failed/);
    clearAuthProbe(probe);
    expect(probe.checkedAt).toBeNull();
    expect(authChipState(true, probe).label).toBe("Auth saved");
  });
});
