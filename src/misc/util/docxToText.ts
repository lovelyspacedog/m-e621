/**
 * DOCX → plain text for in-app story/document preview (mammoth).
 * Legacy binary `.doc` is not supported — use Download / open externally.
 */

/** True when the buffer looks like a ZIP-based OOXML Word package. */
export function isDocx(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return false;
  // Local file header: PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return false;
  }
  const sample = new TextDecoder("latin1").decode(
    bytes.subarray(0, Math.min(bytes.length, 8192)),
  );
  return /word\//i.test(sample) || /\[Content_Types\]\.xml/i.test(sample);
}

/**
 * Extract readable plain text from a .docx ArrayBuffer.
 * Lazy-loads mammoth so the main bundle stays smaller.
 *
 * Pass both `arrayBuffer` (browser unzip) and `buffer` (Node unzip) —
 * mammoth picks the one its environment supports.
 */
export async function docxToText(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    arrayBuffer: buffer,
    buffer: new Uint8Array(buffer),
  } as Parameters<typeof mammoth.extractRawText>[0]);
  return (result.value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
