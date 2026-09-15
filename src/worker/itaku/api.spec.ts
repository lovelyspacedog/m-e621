import { describe, expect, it } from "vitest";
import {
  adaptComment,
  flattenItakuComments,
  type ItakuComment,
} from "./api";

describe("adaptComment", () => {
  it("maps wire fields to Comment", () => {
    const c = adaptComment(
      {
        id: 42,
        content: "hello",
        date_added: "2024-01-01T00:00:00Z",
        owner: 7,
        owner_displayname: "Ada",
        owner_username: "ada",
        num_likes: 3,
      },
      99,
    );
    expect(c).toMatchObject({
      id: 42,
      post_id: 99,
      body: "hello",
      creator_id: 7,
      creator_name: "Ada",
      score: 3,
    });
  });
});

describe("flattenItakuComments", () => {
  it("includes one level of children after each parent", () => {
    const tree: ItakuComment[] = [
      {
        id: 1,
        content: "parent",
        children: [
          { id: 2, content: "child a" },
          { id: 3, content: "child b" },
        ],
      },
      { id: 4, content: "other", children: [] },
    ];
    expect(flattenItakuComments(tree, 10).map((c) => c.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
