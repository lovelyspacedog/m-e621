const AUTH_TAG =
  /^(favs?:me|ordfav(?:_\w+)?|favgroup:|inbox|unread|recommended_for:|subscription:)/i;

/** e621/e6ai reject invalid Basic auth even on public searches — omit auth unless required. */
export const e621PostsRequestNeedsAuth = (
  tags?: string | string[] | null,
): boolean => {
  if (!tags) return false;
  const parts = Array.isArray(tags)
    ? tags
    : String(tags).trim().split(/\s+/).filter(Boolean);
  return parts.some((t) => AUTH_TAG.test(t.trim()));
};