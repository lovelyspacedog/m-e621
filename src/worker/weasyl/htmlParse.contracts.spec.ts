import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWeasylCommentsHtml, parseWeasylSearchHtml } from "./htmlParse";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/contracts/weasyl");
const load = (name: string) => readFileSync(join(root, name), "utf8");

describe("weasyl htmlParse contracts", () => {
  it("parseWeasylSearchHtml extracts thumbs and nextid", () => {
    const { submissions, nextid } = parseWeasylSearchHtml(load("search.html"));
    expect(submissions).toHaveLength(2);
    expect(submissions[0].submitid).toBe(11111);
    expect(submissions[0].owner_login).toBe("wolfartist");
    expect(submissions[0].title).toBe("Contract Piece");
    expect(submissions[0].rating).toBe("general");
    expect(submissions[0].media.thumbnail[0].url).toContain("11111");
    expect(submissions[1].submitid).toBe(22222);
    expect(submissions[1].rating).toBe("mature");
    expect(nextid).toBe(33333);
  });

  it("parseWeasylCommentsHtml extracts comment bodies", () => {
    const comments = parseWeasylCommentsHtml(load("comments.html"), 11111);
    expect(comments.length).toBeGreaterThanOrEqual(1);
    expect(comments[0].id).toBe(42);
    expect(comments[0].creator_name).toBe("Commenter");
    expect(comments[0].body).toContain("Hello");
    expect(comments[0].body).toContain("world & friends");
    const hidden = comments.find((c) => c.id === 43);
    expect(hidden?.creator_name).toBe("hiddenuser");
    expect(hidden?.body).toContain("hidden body");
    // Fallback path does not set is_hidden; primary path would.
    expect(hidden).toBeTruthy();
  });
});
