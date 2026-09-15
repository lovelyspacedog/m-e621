import { describe, expect, it } from "vitest";
import {
  e621Md5SearchUrl,
  isE621Md5Hex,
  md5HexFromBuffer,
  postCanMd5Lookup,
} from "./md5Lookup";
import type { EnhancedPost } from "@/worker/ApiService";

describe("isE621Md5Hex", () => {
  it("accepts 32-hex only", () => {
    expect(isE621Md5Hex("d41d8cd98f00b204e9800998ecf8427e")).toBe(true);
    expect(isE621Md5Hex("D41D8CD98F00B204E9800998ECF8427E")).toBe(true);
    expect(isE621Md5Hex("abc")).toBe(false);
    expect(
      isE621Md5Hex(
        "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff",
      ),
    ).toBe(false);
  });
});

describe("md5HexFromBuffer", () => {
  it("hashes empty buffer to the classic empty MD5", () => {
    expect(md5HexFromBuffer(new ArrayBuffer(0))).toBe(
      "d41d8cd98f00b204e9800998ecf8427e",
    );
  });
});

describe("e621Md5SearchUrl", () => {
  it("builds a posts?tags=md5: URL", () => {
    expect(e621Md5SearchUrl("aabbccddeeff00112233445566778899")).toContain(
      "tags=md5%3Aaabbccddeeff00112233445566778899",
    );
  });
});

describe("postCanMd5Lookup", () => {
  it("allows known md5 or fetchable file urls", () => {
    const withMd5 = {
      file: { md5: "d41d8cd98f00b204e9800998ecf8427e", url: "" },
    } as EnhancedPost;
    const local = {
      file: { md5: "", url: "blob:http://localhost/x" },
    } as EnhancedPost;
    const bare = { file: { md5: "nope", url: "" } } as EnhancedPost;
    expect(postCanMd5Lookup(withMd5)).toBe(true);
    expect(postCanMd5Lookup(local)).toBe(true);
    expect(postCanMd5Lookup(bare)).toBe(false);
  });
});
