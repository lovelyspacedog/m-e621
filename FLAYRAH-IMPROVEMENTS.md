# Flayrah site mode — improvement checklist

Read-only RSS news mode (`/#/flayrah`). Stay out of scope: login, comments, ratings, Federated merge, scraping faceted search as a general API.

## High impact

- [x] **Archive deep-link / HTML fallback** — When `/#/flayrah/:id` is not in the current RSS window, fetch/sanitize `/node/:id` via `GET /api/flayrah/article/:id`.
- [x] **Category / taxonomy feeds** — Allowlisted proxy `?feed=` chips: Reviews, Opinion, Media, Conventions, Games, Sci‑fi, Art, WikiFur News (+ All).
- [ ] **Read / unread + saved articles** — Persist read ids and a small local bookmark list (title, link, id, thumb), separate from gallery bookmarks.
- [x] **Refresh + stale indicator** — Force-refetch control; “Updated X min ago” on the feed.

## Medium impact (reading experience)

- [x] **Prev / next in article toolbar** — Walk the current filtered list without bouncing to the feed.
- [x] **Preserve filter when leaving an article** — Restore `?tags=` / `?feed=` on “Back to feed” and article links.
- [x] **Live filter + body search** — Debounced search as you type; matches plain text from `descriptionHtml`.
- [ ] **Magazine layout option** — Card/grid with larger thumbs; keep dense list as a density toggle. Optional safe CSS for `figure` / captions (Flayrah inline styles are stripped today).
- [ ] **Keyboard shortcuts** — `j`/`k` or arrows for next/prev; `/` focuses the filter.

## Discovery & polish

- [x] **Author pages / “more by …”** — One-click filter by author from the byline / feed row.
- [ ] **Tag cloud / popular tags** — Filter strip from categories already on feed items.
- [ ] **Saved searches for Flayrah filters** — Reuse saved-search nav for `tags` queries in Flayrah mode.
- [x] **Share / copy link** — Copy in-app `#/flayrah/:id` from the article toolbar.
- [ ] **Offline last-good feed** — Persist last successful RSS parse (e.g. IndexedDB) so Flayrah is not empty when remote modes are offline.
- [x] **Use `media:` / better thumbs** — Prefer RSS `enclosure` image when present.
- [x] **Align server/client cache** — Proxy `max-age=300` (RSS) / `600` (article); client cache 10 min.

## Explicit non-goals

- [x] ~~Login, comments, ratings~~ — Read-only RSS / attributed redistribution only.
- [x] ~~Federated merge~~ — News is not gallery posts.
- [x] ~~Full faceted-search scrape~~ — Brittle; prefer RSS + optional single-article HTML fallback.

## Suggested remaining order

1. Read state / bookmarks
2. Keyboard shortcuts
3. Magazine layout + figure CSS
4. Tag cloud / saved searches
5. Offline last-good feed
