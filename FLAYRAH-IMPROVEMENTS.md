# Flayrah site mode — improvement checklist

Read-only RSS news mode (`/#/flayrah`). Stay out of scope: login, comments, ratings, Federated merge, scraping faceted search as a general API.

## High impact

- [x] **Archive deep-link / HTML fallback** — When `/#/flayrah/:id` is not in the current RSS window, fetch/sanitize `/node/:id` via `GET /api/flayrah/article/:id`.
- [x] **Category / taxonomy feeds** — Allowlisted proxy `?feed=` chips: Reviews, Opinion, Media, Conventions, Games, Sci‑fi, Art, WikiFur News (+ All).
- [x] **Read / unread + saved articles** — Persist read ids and local saved articles (`flayrahNews` in settings); All / Unread / Saved view chips.
- [x] **Refresh + stale indicator** — Force-refetch control; “Updated X min ago” on the feed.

## Medium impact (reading experience)

- [x] **Prev / next in article toolbar** — Walk the current filtered list without bouncing to the feed.
- [x] **Preserve filter when leaving an article** — Restore `?tags=` / `?feed=` / `?view=` on “Back to feed” and article links.
- [x] **Live filter + body search** — Debounced search as you type; matches plain text from `descriptionHtml`.
- [x] **Magazine layout option** — List / magazine toggle (persisted); figure float + caption CSS in the reader.
- [x] **Keyboard shortcuts** — Feed: `j`/`k` / arrows move focus, Enter/`o` opens; `/` focuses filter. Article: `j`/`k` / arrows prev/next, `s` toggles save.

## Discovery & polish

- [x] **Author pages / “more by …”** — One-click filter by author from the byline / feed row.
- [x] **Tag cloud / popular tags** — Top tags from the current feed as a filter strip.
- [x] **Saved searches for Flayrah filters** — Sidebar labeled “Saved filters”; preserves `feed` / `view` when applying.
- [x] **Share / copy link** — Copy in-app `#/flayrah/:id` from the article toolbar.
- [x] **Offline last-good feed** — IndexedDB cache of last successful RSS parse; Flayrah stays selectable offline.
- [x] **Use `media:` / better thumbs** — Prefer RSS `enclosure` image when present.
- [x] **Align server/client cache** — Proxy `max-age=300` (RSS) / `600` (article); client cache 10 min.

## Explicit non-goals

- [x] ~~Login, comments, ratings~~ — Read-only RSS / attributed redistribution only.
- [x] ~~Federated merge~~ — News is not gallery posts.
- [x] ~~Full faceted-search scrape~~ — Brittle; prefer RSS + optional single-article HTML fallback.

## Done

All checklist items from the original plan are implemented.
