import { describe, expect, it } from "vitest";
import {
  clampDedicatedGridMinPx,
  DEDICATED_GRID_MIN_DEFAULT,
  dedicatedGridCssVars,
  scaleDedicatedGridMin,
} from "./dedicatedGridMin";

describe("dedicatedGridMin", () => {
  it("clamps and steps stored px", () => {
    expect(clampDedicatedGridMinPx(140)).toBe(140);
    expect(clampDedicatedGridMinPx(50)).toBe(96);
    expect(clampDedicatedGridMinPx(999)).toBe(320);
    expect(clampDedicatedGridMinPx(143)).toBe(144);
  });

  it("scales baselines from default stored value", () => {
    expect(scaleDedicatedGridMin(140, DEDICATED_GRID_MIN_DEFAULT)).toBe(140);
    expect(scaleDedicatedGridMin(260, DEDICATED_GRID_MIN_DEFAULT)).toBe(260);
    expect(scaleDedicatedGridMin(140, 200)).toBe(200);
    expect(scaleDedicatedGridMin(260, 200)).toBe(371);
  });

  it("emits CSS vars for responsive baselines", () => {
    const vars = dedicatedGridCssVars([140, 160, 180], 140);
    expect(vars["--dgrid-min"]).toBe("140px");
    expect(vars["--dgrid-min-sm"]).toBe("160px");
    expect(vars["--dgrid-min-lg"]).toBe("180px");
  });
});
