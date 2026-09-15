import { describe, expect, it } from "vitest";
import {
  adaptPartial,
  faThumbAtSize,
  faUnavailableMeta,
  isFaNotFoundError,
  isOwnFavoritesListing,
  mapSearchTags,
  unavailableSubmissionPost,
} from "./api";
import type { FaPartial } from "./api";

const listingHit = (overrides: Partial<FaPartial> = {}): FaPartial => ({
  id: 123,
  title: "test",
  author: { name: "artist" },
  rating: "general",
  type: "image",
  thumbnail_url: "https://t.furaffinity.net/123@200-1.jpg",
  ...overrides,
});

describe("isFaNotFoundError", () => {
  it("detects faapi NotFound messages", () => {
    expect(isFaNotFoundError(new Error("NotFound: "))).toBe(true);
    expect(isFaNotFoundError("NotFound: submission")).toBe(true);
  });

  it("detects FA database-missing copy", () => {
    expect(isFaNotFoundError(new Error("The submission you are trying to find is not in our database."))).toBe(
      true,
    );
  });

  it("ignores unrelated errors", () => {
    expect(isFaNotFoundError(new Error("timeout"))).toBe(false);
    expect(isFaNotFoundError(null)).toBe(false);
  });
});

describe("faUnavailableMeta", () => {
  it("marks details loaded and unavailable", () => {
    expect(faUnavailableMeta({ title: "x", kind: "submission", detailsLoaded: false, faType: "image" })).toEqual({
      title: "x",
      kind: "submission",
      detailsLoaded: true,
      faType: "image",
      unavailable: true,
    });
  });
});

describe("unavailableSubmissionPost", () => {
  it("builds an id-only stub with no media urls", () => {
    const post = unavailableSubmissionPost(66378247);
    expect(post.id).toBe(66378247);
    expect(post.file.url).toBeNull();
    expect(post.preview.url).toBe("");
    expect(post.sample.has).toBe(false);
    expect(post.sources[0]).toContain("66378247");
  });
});

describe("isOwnFavoritesListing", () => {
  it("treats favs:me as the logged-in user's favorites", () => {
    expect(isOwnFavoritesListing("me")).toBe(true);
    expect(isOwnFavoritesListing(mapSearchTags(["favs:me"]).favsUser)).toBe(true);
    expect(isOwnFavoritesListing(mapSearchTags(["fav:me"]).favsUser)).toBe(true);
  });

  it("maps following:me to the watchstream flag", () => {
    expect(mapSearchTags(["following:me"]).following).toBe(true);
    expect(mapSearchTags(["watch:me"]).following).toBe(true);
  });

  it("treats favs:<own username> as own favorites", () => {
    expect(isOwnFavoritesListing("Hunter-husky", "hunter-husky")).toBe(true);
  });

  it("does not treat someone else's favorites folder as own", () => {
    expect(isOwnFavoritesListing("other-user", "hunter-husky")).toBe(false);
    expect(isOwnFavoritesListing(undefined, "hunter-husky")).toBe(false);
  });
});

describe("faThumbAtSize", () => {
  it("upsizes FA CDN thumbs to the requested size", () => {
    expect(faThumbAtSize("https://t.furaffinity.net/123@200-1.jpg", 600)).toBe(
      "https://t.furaffinity.net/123@600-1.jpg",
    );
  });

  it("does not downsize an already-larger thumb", () => {
    expect(faThumbAtSize("https://t.furaffinity.net/123@600-1.jpg", 400)).toBe(
      "https://t.furaffinity.net/123@600-1.jpg",
    );
  });
});

describe("adaptPartial favorite state", () => {
  it("leaves listing figures unfavorited when FA omitted the flag", () => {
    expect(adaptPartial(listingHit()).is_favorited).toBe(false);
  });

  it("marks own-favorites listings as already favorited", () => {
    const ownFavs = isOwnFavoritesListing(mapSearchTags(["favs:me"]).favsUser);
    expect(adaptPartial(listingHit(), null, ownFavs ? { favorited: true } : undefined).is_favorited).toBe(
      true,
    );
  });

  it("keeps the submission-page favorite flag when not overridden", () => {
    expect(adaptPartial(listingHit({ favorite: true })).is_favorited).toBe(true);
  });

  it("uses an upsized CDN thumb for sample/file when listing has no file_url", () => {
    const post = adaptPartial(listingHit());
    expect(decodeURIComponent(post.preview.url)).toContain("@200-");
    expect(decodeURIComponent(post.sample.url)).toContain("@600-");
    expect(decodeURIComponent(post.file.url || "")).toContain("@600-");
  });

  it("keeps the real file_url when enrichment provided one", () => {
    const post = adaptPartial(
      listingHit({
        file_url: "https://d.furaffinity.net/art/artist/1/1.artist_test.png",
      }),
    );
    expect(decodeURIComponent(post.file.url || "")).toContain("d.furaffinity.net");
    expect(decodeURIComponent(post.sample.url)).toContain("d.furaffinity.net");
  });
});
