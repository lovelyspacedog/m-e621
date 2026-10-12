/** First-party cookie so /api/download can auth FurAffinity images without ?fa= in the URL. */
export const FA_MEDIA_COOKIE = "pawdeck_fa";

export function syncFaMediaCookie(cookies: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const value = (cookies || "").trim();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  if (!value) {
    document.cookie = `${FA_MEDIA_COOKIE}=; Path=/api/download; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${FA_MEDIA_COOKIE}=${encodeURIComponent(value)}; Path=/api/download; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function faCookieFromHeader(header: string | null | undefined): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== FA_MEDIA_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return "";
}
