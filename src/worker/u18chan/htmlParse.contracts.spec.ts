import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedU18chanMediaUrl, parseCatalog, parseThread } from "./htmlParse";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/contracts/u18chan");
const load = (name: string) => readFileSync(join(root, name), "utf8");

describe("u18chan htmlParse contracts", () => {
  it("parseCatalog extracts threads and rewrites thumbs", () => {
    const threads = parseCatalog(load("catalog.html"));
    expect(threads).toHaveLength(2);
    expect(threads[0].id).toBe(1001);
    expect(threads[0].liveBoard).toBe("fur");
    expect(threads[0].subject).toBe("First Thread");
    expect(threads[0].href).toContain("/fur/topic/1001");
    expect(threads[0].thumbUrl).toContain("/api/u18chan/media?url=");
    expect(threads[1].id).toBe(1002);
    expect(threads[1].subject).toBe("Second & Co");
  });

  it("parseThread extracts OP and replies", () => {
    const thread = parseThread(load("thread.html"), "fur", 1001, "ifur");
    expect(thread.id).toBe(1001);
    expect(thread.liveBoard).toBe("fur");
    expect(thread.indexBoard).toBe("ifur");
    expect(thread.subject).toBe("Thread Subject");
    expect(thread.posts.length).toBeGreaterThanOrEqual(2);
    expect(thread.posts[0].isOp).toBe(true);
    expect(thread.posts[0].name).toBe("OPName");
    expect(thread.posts[0].comment).toContain("OP body");
    expect(thread.posts[0].images.length).toBeGreaterThanOrEqual(1);
    expect(thread.posts[1].isOp).toBe(false);
    expect(thread.posts[1].name).toBe("Replier");
    expect(thread.posts[1].comment).toContain("Reply body");
  });

  it("allows only https u18chan hosts and blocks encoded cub paths", () => {
    expect(isAllowedU18chanMediaUrl("https://u18chan.com/fur/src/1.jpg")).toBe(true);
    expect(isAllowedU18chanMediaUrl("https://uploads.u18chan.com/a.jpg")).toBe(true);
    expect(isAllowedU18chanMediaUrl("https://evilu18chan.com/a.jpg")).toBe(false);
    expect(isAllowedU18chanMediaUrl("http://u18chan.com/a.jpg")).toBe(false);
    expect(isAllowedU18chanMediaUrl("https://u18chan.com/cub/src/1.jpg")).toBe(false);
    expect(isAllowedU18chanMediaUrl("https://u18chan.com/fur%2fcub%2fsrc/1.jpg")).toBe(false);
  });
});
