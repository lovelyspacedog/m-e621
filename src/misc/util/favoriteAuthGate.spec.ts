import { describe, expect, it } from "vitest";
import {
  canLoadOwnFavorites,
  canSubmitFaOwnFavorites,
  favoriteToolSubmitGate,
  hasFaProfileCookies,
} from "./favoriteAuthGate";

describe("FA own-favs cookie matrix", () => {
  it("profile cookies only", () => {
    expect(hasFaProfileCookies("a=1;b=2")).toBe(true);
    expect(
      canSubmitFaOwnFavorites({
        profileApiKey: "a=1;b=2",
        hostCookiesAvailable: false,
      }),
    ).toBe(true);
  });

  it("host cookies only", () => {
    expect(
      canSubmitFaOwnFavorites({
        profileApiKey: null,
        hostCookiesAvailable: true,
      }),
    ).toBe(true);
  });

  it("neither — own favs blocked", () => {
    expect(
      canSubmitFaOwnFavorites({
        profileApiKey: "",
        hostCookiesAvailable: false,
      }),
    ).toBe(false);
  });

  it("other-user username path unaffected without cookies", () => {
    expect(
      favoriteToolSubmitGate({
        mode: "furaffinity",
        username: "someone",
        apiKey: null,
        hostFaCookiesAvailable: false,
      }),
    ).toEqual({ ok: true });
  });
});

describe("empty username → favs:me gate", () => {
  it("signed-in empty username is ok", () => {
    expect(
      favoriteToolSubmitGate({
        mode: "e621",
        username: "",
        apiKey: "key",
      }),
    ).toEqual({ ok: true });
  });

  it("signed-out empty username is blocked with message", () => {
    const gate = favoriteToolSubmitGate({
      mode: "e621",
      username: "  ",
      apiKey: null,
    });
    expect(gate.ok).toBe(false);
    expect(gate.message).toMatch(/sign in/i);
  });

  it("non-empty username keeps existing other-user path", () => {
    expect(
      favoriteToolSubmitGate({
        mode: "sofurry",
        username: "soft",
        apiKey: null,
      }),
    ).toEqual({ ok: true });
  });

  it("FA empty username needs host or profile cookies", () => {
    expect(
      favoriteToolSubmitGate({
        mode: "furaffinity",
        username: "",
        apiKey: null,
        hostFaCookiesAvailable: false,
      }).ok,
    ).toBe(false);
    expect(
      favoriteToolSubmitGate({
        mode: "furaffinity",
        username: "",
        apiKey: null,
        hostFaCookiesAvailable: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe("canLoadOwnFavorites", () => {
  it("is true for local and unified without keys", () => {
    expect(canLoadOwnFavorites({ mode: "local" })).toBe(true);
    expect(canLoadOwnFavorites({ mode: "unified" })).toBe(true);
  });
});
