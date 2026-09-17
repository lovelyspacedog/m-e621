import { describe, expect, it } from "vitest";
import {
  isDocumentPost,
  isUnsupportedLegacyDoc,
  postSupportsInAppDocumentPreview,
} from "./documentPost";

describe("legacy .doc preview", () => {
  it("detects documents but blocks in-app preview for .doc", () => {
    const doc = { file: { ext: "doc", url: "https://x/a.doc" } };
    const docx = { file: { ext: "docx", url: "https://x/a.docx" } };
    expect(isDocumentPost(doc)).toBe(true);
    expect(isUnsupportedLegacyDoc(doc)).toBe(true);
    expect(postSupportsInAppDocumentPreview(doc)).toBe(false);
    expect(postSupportsInAppDocumentPreview(docx)).toBe(true);
  });
});
