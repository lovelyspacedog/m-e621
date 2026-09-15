/**
 * Detect story / PDF / journal-style posts that should not auto-advance
 * in slideshow or feed card auto-next (readers need to scroll manually).
 */

const DOCUMENT_EXTS = new Set(["txt", "pdf", "html", "doc", "rtf"]);

type DocumentLikePost = {
  file?: { ext?: string; url?: string | null } | null;
  __meta?: {
    kind?: string | null;
    furaffinity?: { kind?: string; faType?: string } | null;
  } | null;
};

function urlExt(url?: string | null): string {
  if (!url) return "";
  try {
    const path = new URL(url, "https://local.invalid").pathname.toLowerCase();
    const ext = path.split(".").pop() || "";
    return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
  } catch {
    return "";
  }
}

/** True for txt/pdf/html/doc/rtf, FA journals, story/poetry types, and __meta.kind documents. */
export function isDocumentPost(post: DocumentLikePost | null | undefined): boolean {
  if (!post) return false;
  const ext = post.file?.ext || "";
  const fromUrl = urlExt(post.file?.url);
  const faType = post.__meta?.furaffinity?.faType || "";
  const kind = (post.__meta?.kind || "").toLowerCase();
  return (
    DOCUMENT_EXTS.has(ext) ||
    DOCUMENT_EXTS.has(fromUrl) ||
    kind === "story" ||
    kind === "journal" ||
    kind === "document" ||
    post.__meta?.furaffinity?.kind === "journal" ||
    /^(text|story|poetry)$/i.test(faType)
  );
}
