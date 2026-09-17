import { describe, expect, it } from "vitest";
import {
  injectMultiFilePageSuffix,
  inkbunnyFileExt,
  inkbunnyFileUrl,
} from "./inkbunnyGallery";

describe("inkbunnyGallery", () => {
  it("picks full url then screen", () => {
    expect(
      inkbunnyFileUrl({
        file_id: 1,
        file_name: "a.jpg",
        mimetype: "image/jpeg",
        submission_file_order: 0,
        file_url_screen: "https://s",
        file_url_full: "https://f",
      }),
    ).toBe("https://f");
  });

  it("ext from filename", () => {
    expect(
      inkbunnyFileExt({
        file_id: 1,
        file_name: "page.PNG",
        mimetype: "",
        submission_file_order: 0,
      }),
    ).toBe("png");
  });

  it("injects padded page suffix", () => {
    expect(injectMultiFilePageSuffix("wolf/art.jpg", 2, 12)).toBe(
      "wolf/art_p02.jpg",
    );
    expect(injectMultiFilePageSuffix("art.jpg", 1, 1)).toBe("art.jpg");
  });
});
