import { describe, expect, it } from "vitest";
import {
  getNetworkInfo,
  resolveAutoQuality,
  resolveDataSaverQuality,
  type INetworkInfo,
} from "./dataSaver";
import { DataSaverType } from "@/services/types";

const base = (overrides: Partial<INetworkInfo> = {}): INetworkInfo => ({
  type: "unknown",
  typeSupported: false,
  saveData: false,
  effectiveType: "",
  effectiveTypeSupported: false,
  ...overrides,
});

describe("resolveAutoQuality", () => {
  it("maps bluetooth/cellular to low", () => {
    expect(
      resolveAutoQuality(base({ typeSupported: true, type: "cellular" })),
    ).toBe("low");
    expect(
      resolveAutoQuality(base({ typeSupported: true, type: "bluetooth" })),
    ).toBe("low");
  });

  it("maps ethernet/wifi to high, or medium with saveData", () => {
    expect(
      resolveAutoQuality(base({ typeSupported: true, type: "wifi" })),
    ).toBe("high");
    expect(
      resolveAutoQuality(
        base({ typeSupported: true, type: "ethernet", saveData: true }),
      ),
    ).toBe("medium");
  });

  it("uses effectiveType when connection.type is unavailable", () => {
    expect(
      resolveAutoQuality(
        base({ effectiveTypeSupported: true, effectiveType: "slow-2g" }),
      ),
    ).toBe("low");
    expect(
      resolveAutoQuality(
        base({ effectiveTypeSupported: true, effectiveType: "2g" }),
      ),
    ).toBe("low");
    expect(
      resolveAutoQuality(
        base({ effectiveTypeSupported: true, effectiveType: "3g" }),
      ),
    ).toBe("medium");
    expect(
      resolveAutoQuality(
        base({ effectiveTypeSupported: true, effectiveType: "4g" }),
      ),
    ).toBe("high");
  });

  it("respects saveData with effectiveType", () => {
    expect(
      resolveAutoQuality(
        base({
          effectiveTypeSupported: true,
          effectiveType: "3g",
          saveData: true,
        }),
      ),
    ).toBe("low");
    expect(
      resolveAutoQuality(
        base({
          effectiveTypeSupported: true,
          effectiveType: "4g",
          saveData: true,
        }),
      ),
    ).toBe("medium");
  });

  it("maps connection.type none to low", () => {
    expect(
      resolveAutoQuality(base({ typeSupported: true, type: "none" })),
    ).toBe("low");
  });

  it("falls back to medium (or low with saveData) when unsupported", () => {
    expect(resolveAutoQuality(base())).toBe("medium");
    expect(resolveAutoQuality(base({ saveData: true }))).toBe("low");
  });

  it("prefers connection.type over effectiveType for cellular", () => {
    expect(
      resolveAutoQuality(
        base({
          typeSupported: true,
          type: "cellular",
          effectiveTypeSupported: true,
          effectiveType: "4g",
        }),
      ),
    ).toBe("low");
  });
});

describe("resolveDataSaverQuality", () => {
  it("honors fixed modes", () => {
    const info = base({ effectiveTypeSupported: true, effectiveType: "4g" });
    expect(resolveDataSaverQuality(DataSaverType.lowest, info)).toBe("low");
    expect(resolveDataSaverQuality(DataSaverType.medium, info)).toBe("medium");
    expect(resolveDataSaverQuality(DataSaverType.highest, info)).toBe("high");
    expect(resolveDataSaverQuality(DataSaverType.auto, info)).toBe("high");
  });
});

describe("getNetworkInfo", () => {
  it("reads saveData and effectiveType from a partial connection", () => {
    expect(
      getNetworkInfo({ saveData: true, effectiveType: "4g" }),
    ).toEqual({
      saveData: true,
      typeSupported: false,
      type: "unknown",
      effectiveType: "4g",
      effectiveTypeSupported: true,
    });
  });

  it("ignores invalid enum strings", () => {
    expect(
      getNetworkInfo({ type: "cable", effectiveType: "5g" } as any),
    ).toEqual({
      saveData: false,
      typeSupported: false,
      type: "unknown",
      effectiveType: "",
      effectiveTypeSupported: false,
    });
  });
});
