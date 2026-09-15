import { describe, expect, it } from "vitest";
import { adaptPartial, isOwnFavoritesListing, mapSearchTags } from "./api";
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

describe("isOwnFavoritesListing", () => {
  it("treats favs:me as the logged-in user's favorites", () => {
    expect(isOwnFavoritesListing("me")).toBe(true);
    expect(isOwnFavoritesListing(mapSearchTags(["favs:me"]).favsUser)).toBe(true);
    expect(isOwnFavoritesListing(mapSearchTags(["fav:me"]).favsUser)).toBe(true);
  });

  it("treats favs:<own username> as own favorites", () => {
    expect(isOwnFavoritesListing("Hunter-husky", "hunter-husky")).toBe(true);
  });

  it("does not treat someone else's favorites folder as own", () => {
    expect(isOwnFavoritesListing("other-user", "hunter-husky")).toBe(false);
    expect(isOwnFavoritesListing(undefined, "hunter-husky")).toBe(false);
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
});
