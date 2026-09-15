import { describe, expect, it } from "vitest";
import { isRtf, rtfToText } from "./rtfToText";

describe("isRtf", () => {
  it("detects rtf magic", () => {
    expect(isRtf("{\\rtf1\\ansi hello}")).toBe(true);
    expect(isRtf("  {\\rtf1\\ansi}")).toBe(true);
    expect(isRtf("plain text")).toBe(false);
    expect(isRtf("{not rtf}")).toBe(false);
  });
});

describe("rtfToText", () => {
  it("passes non-rtf through", () => {
    expect(rtfToText("hello world")).toBe("hello world");
    expect(rtfToText("\uFEFFhello")).toBe("hello");
  });

  it("extracts plain paragraphs", () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}\\f0\\fs24 " +
      "The Temple will not leave Cass alone.\\par " +
      "Second paragraph.}";
    expect(rtfToText(rtf)).toBe(
      "The Temple will not leave Cass alone.\nSecond paragraph.",
    );
  });

  it("handles hex escapes and unicode", () => {
    // \'e9 = é in latin-1; \u8212? = em dash
    const rtf = "{\\rtf1\\ansi caf\\'e9 \\u8212? void}";
    expect(rtfToText(rtf)).toBe("café — void");
  });

  it("skips font/color tables and pict groups", () => {
    const rtf =
      "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}" +
      "{\\*\\generator Fake;}Visible{\\pict\\pngblip binaryjunk} text}";
    expect(rtfToText(rtf)).toBe("Visible text");
  });

  it("maps common symbol controls", () => {
    const rtf =
      "{\\rtf1\\ansi A\\tab B\\line C\\emdash D\\lquote E\\rquote}";
    expect(rtfToText(rtf)).toBe("A\tB\nC—D‘E’");
  });
});
