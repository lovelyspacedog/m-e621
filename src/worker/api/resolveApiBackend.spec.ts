import { describe, expect, it } from "vitest";
import type { SiteMode } from "@/services/types";
import { resolveApiBackend } from "./resolveApiBackend";

const MODE_BACKEND: Array<[SiteMode, string]> = [
  ["e621", "e621"],
  ["e6ai", "e621"],
  ["local", "e621"],
  ["furbooru", "furbooru"],
  ["inkbunny", "inkbunny"],
  ["furaffinity", "furaffinity"],
  ["tailspace", "tailspace"],
  ["u18chan", "u18chan"],
  ["news", "news"],
  ["weasyl", "weasyl"],
  ["itaku", "itaku"],
  ["sofurry", "sofurry"],
  ["murrtube", "murrtube"],
  ["badpups", "badpups"],
];

describe("resolveApiBackend", () => {
  it("maps every explicit SiteMode that has a dedicated backend", () => {
    for (const [mode, backend] of MODE_BACKEND) {
      expect(resolveApiBackend("https://example.invalid/", mode)).toBe(backend);
    }
  });

  it("never falls through dedicated-chrome modes to e621 when mode is set", () => {
    expect(resolveApiBackend("https://e621.net/", "tailspace")).toBe("tailspace");
    expect(resolveApiBackend("https://e621.net/", "u18chan")).toBe("u18chan");
    expect(resolveApiBackend("https://e621.net/", "news")).toBe("news");
  });

  it("falls back to hostname when mode is omitted", () => {
    expect(resolveApiBackend("https://www.furbooru.org/")).toBe("furbooru");
    expect(resolveApiBackend("https://inkbunny.net/")).toBe("inkbunny");
    expect(resolveApiBackend("https://www.furaffinity.net/")).toBe("furaffinity");
    expect(resolveApiBackend("https://tailspace.com/")).toBe("tailspace");
    expect(resolveApiBackend("https://u18chan.com/")).toBe("u18chan");
    expect(resolveApiBackend("https://www.flayrah.com/")).toBe("news");
    expect(resolveApiBackend("https://www.weasyl.com/")).toBe("weasyl");
    expect(resolveApiBackend("https://itaku.ee/")).toBe("itaku");
    expect(resolveApiBackend("https://www.sofurry.com/")).toBe("sofurry");
    expect(resolveApiBackend("https://murrtube.net/")).toBe("murrtube");
    expect(resolveApiBackend("https://badpups.com/")).toBe("badpups");
    expect(resolveApiBackend("https://e621.net/")).toBe("e621");
  });

  it("treats video and unified as URL-fallback (not dedicated backends)", () => {
    expect(resolveApiBackend("https://e621.net/", "video")).toBe("e621");
    expect(resolveApiBackend("https://e621.net/", "unified")).toBe("e621");
    expect(resolveApiBackend("https://www.furbooru.org/", "video")).toBe("furbooru");
  });
});
