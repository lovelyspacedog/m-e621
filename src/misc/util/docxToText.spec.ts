import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { docxToText, isDocx } from "./docxToText";

async function buildMinimalDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</w:t></w:r></w:p>`,
    )
    .join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}</w:body></w:document>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("isDocx", () => {
  it("rejects empty / non-zip buffers", () => {
    expect(isDocx(new ArrayBuffer(0))).toBe(false);
    expect(isDocx(new TextEncoder().encode("plain text").buffer as ArrayBuffer)).toBe(
      false,
    );
  });

  it("detects a minimal docx zip", async () => {
    const buf = await buildMinimalDocx(["hello"]);
    expect(isDocx(buf)).toBe(true);
  });
});

describe("docxToText", () => {
  it("extracts paragraphs as plain text", async () => {
    const buf = await buildMinimalDocx([
      "The Temple will not leave Cass alone.",
      "Second paragraph.",
    ]);
    expect(await docxToText(buf)).toBe(
      "The Temple will not leave Cass alone.\n\nSecond paragraph.",
    );
  });
});
