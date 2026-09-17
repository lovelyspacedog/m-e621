import { describe, expect, it } from "vitest";
import type { EnhancedPost } from "@/worker/ApiService";
import { fluffleImageUrl, FLUFFLE_MAX_BYTES, isFluffleStillPost, postSupportsFluffle } from "./fluffleSearch";

const still = (urls: {
  sample?: string;
  preview?: string;
  file?: string;
  ext?: string;
  size?: number;
}): EnhancedPost =>
  ({
    id: 1,
    file: {
      url: urls.file || "",
      ext: urls.ext ?? "jpg",
      width: 100,
      height: 100,
      size: urls.size ?? 1,
      md5: "",
    },
    preview: { url: urls.preview || "", width: 100, height: 100 },
    sample: {
      has: !!urls.sample,
      url: urls.sample || "",
      width: 100,
      height: 100,
    },
  }) as EnhancedPost;

describe("isFluffleStillPost", () => {
  it("allows common still extensions", () => {
    expect(isFluffleStillPost(still({ ext: "png" }))).toBe(true);
    expect(isFluffleStillPost(still({ ext: "webm" }))).toBe(false);
  });
});

describe("postSupportsFluffle", () => {
  it("rejects video and oversized stills", () => {
    expect(
      postSupportsFluffle(
        still({
          ext: "webm",
          file: "https://cdn.example/x.webm",
        }),
      ),
    ).toBe(false);
    expect(
      postSupportsFluffle(
        still({
          ext: "jpg",
          file: "https://cdn.example/x.jpg",
          size: FLUFFLE_MAX_BYTES + 1,
        }),
      ),
    ).toBe(false);
    expect(
      postSupportsFluffle(
        still({
          ext: "jpg",
          file: "https://cdn.example/x.jpg",
          size: 1000,
        }),
      ),
    ).toBe(true);
  });
});

describe("fluffleImageUrl", () => {
  it("returns absolute https sample/preview/file URLs", () => {
    expect(
      fluffleImageUrl(
        still({
          sample: "https://cdn.example/sample.jpg",
          preview: "https://cdn.example/preview.jpg",
        }),
      ),
    ).toBe("https://cdn.example/sample.jpg");
  });

  it("unwraps /api/download?url=… (FurAffinity-style)", () => {
    const upstream = "https://t.furaffinity.net/66380546@600-1773941122.jpg";
    const proxied = `/api/download?url=${encodeURIComponent(upstream)}&fa=a%3Dx`;
    expect(fluffleImageUrl(still({ sample: proxied }))).toBe(upstream);
  });

  it("returns null for blob: / missing URLs", () => {
    expect(fluffleImageUrl(still({ preview: "blob:http://localhost/x" }))).toBe(
      null,
    );
    expect(fluffleImageUrl(still({}))).toBe(null);
  });
});
