import { describe, expect, it } from "vitest";
import { isLikelyNetworkSaveError } from "./offlineSaveQueue";

describe("isLikelyNetworkSaveError", () => {
  it("treats TypeError and fetch failures as network", () => {
    expect(isLikelyNetworkSaveError(new TypeError("Failed to fetch"))).toBe(
      true,
    );
    expect(isLikelyNetworkSaveError(new Error("NetworkError when attempting"))).toBe(
      true,
    );
    expect(isLikelyNetworkSaveError(new Error("Download failed (404)"))).toBe(
      false,
    );
  });
});
