import { describe, expect, it } from "vitest";
import { BlacklistMode } from "@/services/types";
import { isFullyHiddenPage } from "./postListManager";

describe("isFullyHiddenPage", () => {
  const hidden = { __meta: { isBlacklisted: true } };
  const shown = { __meta: { isBlacklisted: false } };

  it("skips a hide-mode page only when every new post is blacklisted", () => {
    expect(isFullyHiddenPage(BlacklistMode.hide, [hidden, hidden])).toBe(true);
    expect(isFullyHiddenPage(BlacklistMode.hide, [hidden, shown])).toBe(false);
    expect(isFullyHiddenPage(BlacklistMode.hide, [])).toBe(false);
  });

  it("does not skip blur-mode pages", () => {
    expect(isFullyHiddenPage(BlacklistMode.blur, [hidden, hidden])).toBe(false);
  });
});