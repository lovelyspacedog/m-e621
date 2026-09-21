import { describe, expect, it, vi } from "vitest";
import { publishPartialChildWarnings } from "./favoriteChildWarnings";

describe("publishPartialChildWarnings", () => {
  it("emits each warning when some children failed", () => {
    const addMessage = vi.fn();
    publishPartialChildWarnings(
      ["Inkbunny skipped: network", "Weasyl skipped: 500"],
      addMessage,
    );
    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(addMessage).toHaveBeenNthCalledWith(1, "Inkbunny skipped: network");
    expect(addMessage).toHaveBeenNthCalledWith(2, "Weasyl skipped: 500");
  });

  it("emits nothing when warnings are missing or empty (total-fail / no-fail)", () => {
    const addMessage = vi.fn();
    publishPartialChildWarnings(undefined, addMessage);
    publishPartialChildWarnings([], addMessage);
    expect(addMessage).not.toHaveBeenCalled();
  });
});
