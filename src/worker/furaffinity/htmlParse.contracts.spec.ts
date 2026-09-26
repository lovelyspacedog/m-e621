import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseFigures,
  parseJournals,
  parseSubmission,
} from "./htmlParse";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/contracts/furaffinity");
const load = (name: string) => readFileSync(join(root, name), "utf8");

describe("furaffinity htmlParse contracts", () => {
  it("parseFigures extracts listing cards and next page", () => {
    const { results, hasNext } = parseFigures(load("listing.html"));
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(12345);
    expect(results[0].title).toBe("Test Wolf Art");
    expect(results[0].author.name).toBe("ArtistWolf");
    expect(results[0].rating).toBe("general");
    expect(results[0].type).toBe("image");
    expect(results[0].thumbnail_url).toContain("t.furaffinity.net");
    expect(results[0].width).toBe(800);
    expect(results[1].id).toBe(67890);
    expect(results[1].type).toBe("music");
    expect(results[1].rating).toBe("mature");
    expect(hasNext).toBe(true);
  });

  it("parseSubmission maps title, tags, file, and comments", () => {
    const sub = parseSubmission(load("submission.html"), 12345);
    expect(sub.id).toBe(12345);
    expect(sub.title).toBe("Contract Submission");
    expect(sub.author.name).toBe("artistwolf");
    expect(sub.rating).toBe("general");
    expect(sub.tags).toEqual(["canine", "wolf"]);
    expect(sub.file_url).toContain("contract.jpg");
    expect(sub.views).toBe(1234);
    expect(sub.favorites).toBe(5);
    expect(sub.favorite).toBe(false);
    expect(sub.description).toContain("Hello & welcome");
    expect(sub.comments).toHaveLength(1);
    expect(sub.comments[0].creator_name).toBe("Commenter");
  });

  it("parseJournals extracts journal sections", () => {
    const { results, hasNext } = parseJournals(load("journal.html"));
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(555);
    expect(results[0].title).toBe("Journal Title & More");
    expect(results[0].kind).toBe("journal");
    expect(String(results[0].description)).toContain("Body text");
    expect(results[1].id).toBe(556);
    expect(hasNext).toBe(true);
  });
});
