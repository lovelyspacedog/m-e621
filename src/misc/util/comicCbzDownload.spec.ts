import { describe, expect, it } from "vitest";
import {
  buildComicCbzFilename,
  comicCbzArchiveName,
  entriesFromUrls,
} from "./comicCbzDownload";

describe("comicCbzDownload helpers", () => {
  it("sanitizes CBZ filename", () => {
    expect(buildComicCbzFilename("Artist Name", "Comic: Title")).toBe(
      "Artist Name - Comic Title.cbz",
    );
    expect(buildComicCbzFilename("", undefined)).toBe("comic.cbz");
  });

  it("pads archive names with extension hints", () => {
    expect(comicCbzArchiveName(1, "https://cdn.example/p1.webp")).toBe("001.webp");
    expect(comicCbzArchiveName(12, "https://x/y", "png")).toBe("012.png");
  });

  it("builds entries in order", () => {
    const e = entriesFromUrls(["https://a/1.jpg", "https://a/2.png"]);
    expect(e[0].archiveName).toBe("001.jpg");
    expect(e[1].archiveName).toBe("002.png");
  });
});