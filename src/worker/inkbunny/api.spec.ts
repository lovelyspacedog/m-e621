import { describe, expect, it } from "vitest";
import { inkbunnyMetaFromHit, mapSearchTags, type InkbunnySubmission } from "./api";

describe("mapSearchTags pools", () => {
  it("defaults pool browse to pool_order", () => {
    expect(mapSearchTags(["pool:42"])).toEqual({
      text: "",
      poolId: 42,
      orderby: "pool_order",
    });
  });

  it("keeps an explicit order over the pool default", () => {
    expect(mapSearchTags(["pool:42", "order:newest"]).orderby).toBe(
      "create_datetime",
    );
    expect(mapSearchTags(["pool:42", "order:random"]).random).toBe(true);
    expect(mapSearchTags(["pool:42", "order:random"]).orderby).toBeUndefined();
  });

  it("accepts order:pool as pool_order", () => {
    expect(mapSearchTags(["pool:7", "order:pool"]).orderby).toBe("pool_order");
  });
});

describe("inkbunnyMetaFromHit pools", () => {
  it("keeps pool names from show_pools details", () => {
    const meta = inkbunnyMetaFromHit({
      submission_id: 1,
      title: "Page 1",
      pools: [
        { pool_id: 99, name: "Comic Arc" },
        { pool_id: 0, name: "skip" },
      ],
      files: [],
    } as InkbunnySubmission);
    expect(meta.pools).toEqual([{ id: 99, name: "Comic Arc" }]);
  });
});
