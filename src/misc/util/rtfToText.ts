/**
 * Minimal RTF → plain text for in-app story/document preview.
 * Enough for typical FurAffinity / Inkbunny writing exports; not a full RTF renderer.
 */

const SKIP_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "xe",
  "tc",
  "tcn",
  "header",
  "footer",
  "headerf",
  "footerf",
  "ftnsep",
  "ftnsepc",
  "aftnsep",
  "aftnsepc",
]);

/** True when the payload looks like Rich Text Format. */
export function isRtf(input: string): boolean {
  return /^\s*\{\\rtf\d/i.test(input);
}

/**
 * Convert RTF markup to readable plain text.
 * Passes non-RTF input through unchanged (BOM stripped).
 */
export function rtfToText(input: string): string {
  const src = input.replace(/^\uFEFF/, "");
  if (!isRtf(src)) return src;

  let i = 0;
  let out = "";
  /** Group nesting depth (0 = outside root). */
  let depth = 0;
  /**
   * When > 0, suppress output until `depth` falls below this value.
   * 0 means not skipping.
   */
  let skipBelowDepth = 0;

  const peek = (n = 0) => src[i + n] || "";
  const take = () => src[i++] || "";
  const skipping = () => skipBelowDepth > 0 && depth >= skipBelowDepth;

  const beginSkip = () => {
    // Skip the group we just entered (`depth` already incremented).
    if (skipBelowDepth === 0 || depth < skipBelowDepth) {
      skipBelowDepth = depth;
    }
  };

  const readControlWord = (): { word: string; param: number | null } => {
    let word = "";
    while (/[a-zA-Z]/.test(peek())) word += take();
    let param: number | null = null;
    if (peek() === "-") {
      let digits = take();
      while (/\d/.test(peek())) digits += take();
      param = Number.parseInt(digits, 10);
    } else if (/\d/.test(peek())) {
      let digits = "";
      while (/\d/.test(peek())) digits += take();
      param = Number.parseInt(digits, 10);
    }
    if (peek() === " ") take();
    return { word: word.toLowerCase(), param };
  };

  const appendChar = (ch: string) => {
    if (!skipping()) out += ch;
  };

  /** Look ahead from current `i` for a destination name after `{`. */
  const destinationAfterOpen = (): { skip: boolean } => {
    // `{` already consumed. Forms: {\fonttbl...} or {\*\generator...}
    if (peek() !== "\\") return { skip: false };
    let j = i + 1;
    if (src[j] === "*") {
      // All {\*\...} groups are ignorable destinations.
      return { skip: true };
    }
    let dest = "";
    while (j < src.length && /[a-zA-Z]/.test(src[j])) dest += src[j++];
    return { skip: SKIP_DESTINATIONS.has(dest.toLowerCase()) };
  };

  while (i < src.length) {
    const ch = take();

    if (ch === "{") {
      depth++;
      if (destinationAfterOpen().skip) beginSkip();
      continue;
    }

    if (ch === "}") {
      if (depth > 0) depth--;
      if (skipBelowDepth > 0 && depth < skipBelowDepth) {
        skipBelowDepth = 0;
      }
      continue;
    }

    if (ch === "\\") {
      const next = peek();
      if (next === "\\" || next === "{" || next === "}") {
        appendChar(take());
        continue;
      }
      if (next === "'") {
        take();
        const hex = (take() + take()).toLowerCase();
        if (/^[0-9a-f]{2}$/.test(hex)) {
          appendChar(String.fromCharCode(Number.parseInt(hex, 16)));
        }
        continue;
      }
      if (next === "~") {
        take();
        appendChar("\u00a0");
        continue;
      }
      if (next === "-" || next === "_" || next === ":") {
        take();
        if (next === "_") appendChar("-");
        continue;
      }
      if (!/[a-zA-Z]/.test(next)) {
        if (next) take();
        continue;
      }

      const { word, param } = readControlWord();

      if (skipping()) {
        if (word === "bin" && param && param > 0) {
          i = Math.min(src.length, i + param);
        }
        continue;
      }

      switch (word) {
        case "par":
        case "line":
        case "page":
        case "column":
          appendChar("\n");
          break;
        case "tab":
          appendChar("\t");
          break;
        case "emdash":
          appendChar("\u2014");
          break;
        case "endash":
          appendChar("\u2013");
          break;
        case "lquote":
          appendChar("\u2018");
          break;
        case "rquote":
          appendChar("\u2019");
          break;
        case "ldblquote":
          appendChar("\u201c");
          break;
        case "rdblquote":
          appendChar("\u201d");
          break;
        case "bullet":
          appendChar("\u2022");
          break;
        case "u": {
          if (param != null) {
            let code = param;
            if (code < 0) code += 65536;
            appendChar(String.fromCharCode(code));
            const fb = peek();
            if (fb && fb !== "\\" && fb !== "{" && fb !== "}") take();
          }
          break;
        }
        case "bin":
          if (param && param > 0) i = Math.min(src.length, i + param);
          break;
        default:
          break;
      }
      continue;
    }

    if (ch === "\r" || ch === "\n") continue;
    appendChar(ch);
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
