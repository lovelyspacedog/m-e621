# News mode improvements

Checklist for improving News (`src/News/`, `src/worker/news/`, `vite-news-proxy.ts`, `serve.py` `/api/news/*`). Merged Flayrah + Dogpatch Press + InFurNation + Furry Writers’ Guild RSS; keep read-only attributed redistribution.

Predecessor: [FLAYRAH-IMPROVEMENTS.md](./FLAYRAH-IMPROVEMENTS.md) (all items done; mode renamed to News).

## Explicit non-goals

- [x] ~~Login, comments, ratings~~ — Read-only RSS / attributed redistribution only.
- [x] ~~Federated merge as posts~~ — News is not gallery posts; do not fold into Federated Posts.
- [x] ~~Full faceted-search scrape~~ — Brittle; prefer RSS + optional single-article HTML fallback.
- [ ] Reddit / Mastodon hashtags / FA·IB journals / convention-site scrapes — rejected (fights RSS + proxy allowlist).

## Highest priority (correctness + durability)

Ship these first: News looks feature-complete, but Dogpatch reading, saved items, and filters do not fully survive real RSS windows.

- [x] **Prefer `content:encoded` over `description`** — `descriptionHtmlFromItem` returns RSS `<description>` first; Dogpatch WP feeds put full body in `content:encoded`. Prefer encoded when present so in-app Dogpatch articles are not truncated until archive HTML loads. (`src/worker/news/parseRss.ts`)
- [x] **Persist `?source=` on saved filters** — `SavedSearchNav` keeps `tags` / `feed` / `view` but drops `source`. “Dogpatch unread” reopens as All sources. Same gap on custom nav items. Rename add-button copy from “saved search” while in News. (`src/App/SavedSearchNav.vue`, `src/App/navigation.ts`)
- [x] **Taxonomy chips honesty** — Chips still show on All sources but only change the Flayrah request; Dogpatch stays full feed. Hide chips unless source is Flayrah, or label them “Flayrah sections.” (`NewsFeedPage.vue`)
- [x] **SFW vs Dogpatch** — Global SFW only still appears in the News sidebar and does nothing; docs say Dogpatch can be adult/investigative. Hide the toggle in News, or honor it (default Flayrah / hide Dogpatch). (`NavigationList.vue`, News mode)
- [x] **Saved articles as a real library** — `NewsSavedArticle` only stores title/author/link/thumb; Saved view stubs with “open to read full text” when the item ages out of the RSS window. Persist sanitized HTML (or excerpt + tags) on save; always try archive fetch for saved deep-links. (`NewsStore.ts`, `NewsFeedPage.vue`, `api.ts`)
- [x] **Offline article cache eviction** — Cap is 40; evict by last-opened, not `publishedMs`, so saved/recent reads survive. (`offlineCache.ts`)
- [x] **Unread is write-only** — `markUnread` exists and is unused; opening marks read with no undo. Add mark unread (`u`) on feed/article, mark-all-read for the current filtered list, and an unread badge on the News nav item. (`NewsStore.ts`, `NewsFeedPage.vue`, `NewsArticlePage.vue`, `navigation.ts`)

## Medium priority (reader polish)

### Feed

- [x] **Keyboard focus scroll** — `j`/`k` focus does not `scrollIntoView`; focused row can leave the viewport.
- [x] **Magazine layout parity** — Cards omit author-click, per-row tags, and a source chip (list layout has all three).
- [x] **Relative dates** — Recent feed rows show “2h ago” (older than a week stay calendar dates).
- [x] **Day headings** — Group the feed by calendar day.
- [x] **Go to top** — Posts has a floating control; News feed/article do not.
- [x] **Structured filter prefixes** — Cheap win on existing search: `author:`, `tag:`, `source:` (keep AND-of-tokens for plain terms).
- [x] **Copy-link keeps query** — Shared article URLs should keep `source` / `feed` / `view` / `tags` context.

### Article

- [x] **Embed placeholders** — Sanitizer drops `iframe`/`video`; Dogpatch embeds become holes. Replace with “Open embed on {source}” instead of disappearing. (`newsHtml.ts`)
- [x] **Figure CSS by source** — Float-right suits Flayrah magazine; WordPress figures often want full width. Scope float to Flayrah or only when the figure is small. (`NewsArticlePage.vue`)
- [x] **Reader chrome** — Small type-scale / width control (higher value than a third layout).
- [x] **Image lightbox** — Click proxied in-article images (`/api/download`) to enlarge.
- [x] **News intro tip** — First-visit tip for sources, attribution, Dogpatch content warning. Only `flayrah-offline` ships today. (`tipIds.ts`, `TIP_CHECKLIST.md`)

### History / deeper feed

- [x] **Load older (paged RSS)** — WP `?paged=2` on `/feed/`; Flayrah taxonomies are also windowed. Allowlisted paged fetch with attribution before chasing a third source. Dogpatch / InFurNation / FWG pages ship; Flayrah’s public RSS ignores `page` so Load older skips Flayrah.

## Same sources, more feed

- [x] **Dogpatch category feeds** — Mirror Flayrah taxonomies via allowlisted `https://dogpatch.press/category/{slug}/feed/` (News, Reviews, Opinion, Interviews, etc.). Keep allowlists in sync across `feeds.ts`, `vite-news-proxy.ts`, and `serve.py`.
- [x] **Parse `media:content` / `media:thumbnail`** — WP often puts the hero there; do not rely on `<enclosure>` alone.
- [x] **Atom support** — Parse Atom `<feed>` / `<entry>` so a source is not blocked on RSS 2.0 only.

## Architecture (before a third outlet)

Every source was hardcoded as `flayrah | dogpatch` in ids, proxy regexes, parsers, sanitizer hosts, TOS, and download allowlists.

- [x] **Source registry** — Shared config: id, label, home URL, RSS allowlist, article URL template, HTML parser, media hosts, TOS entry. (`src/worker/news/registry.ts`; Vite uses `resolveNewsRssUrl` / `newsArticleUpstreamUrl`; `serve.py` NEWS_* tables kept in sync.)
- [x] **Optional same-story clustering** — Fuzzy match title + date in the merged feed with “also on Flayrah/Dogpatch”; only after source chips and unread are solid.
- [x] **Watch authors (local)** — Local author list → filter chip; not accounts.
- [x] **New-since-last-visit** — Optional notifications (off by default); last-seen cursor in `NewsState`.

### Candidate sources (after registry)

| Candidate | Why | Status |
| --- | --- | --- |
| **InFurNation** (`infurnation.com`) | Furry fandom news/guide; WordPress public RSS | Shipped (`infurnation:N`) |
| **Furry Writers’ Guild** (`furrywritersguild.com`) | Guild newsletters and anthro fiction community updates | Shipped (`fwg:N`) |

Optional later: more Flayrah taxonomy terms only if `/taxonomy/term/N/0/feed` still exists.

## Tests

- [x] Prefer `content:encoded` when present (Dogpatch fixture).
- [x] Saved-filter `source` round-trip.
- [x] Dogpatch category allowlist rejects unknown slugs (400).
- [x] Embed/iframe placeholder after sanitize.
- [x] Atom entry parse (`fwg` fixture).
- [x] Unread mark / mark-all-read persistence.

## Suggested ship order

1. ~~Correctness: `content:encoded`, saved-filter `source`, taxonomy chips honesty, SFW vs Dogpatch~~ — shipped
2. ~~Durability: saved body snapshots, unread undo + badge, archive-first for saved, last-opened eviction~~ — shipped
3. ~~Reader polish: scroll-into-view, magazine parity, go-to-top, embed placeholders, News intro tip~~ — shipped (day headings, type scale, lightbox included)
4. ~~Same sources, more feed: Dogpatch categories + paged RSS + media: tags~~ — shipped
5. ~~Source registry + InFurNation + Furry Writers’ Guild + Atom~~ — shipped
6. ~~Clustering, watch authors, new-since, remaining tests~~ — shipped

## Progress

| Slice | Status | Notes |
| ----- | ------ | ----- |
| Checklist doc | Done | This file |
| Correctness | Done | encoded, source query, chips, SFW |
| Durability | Done | saved bodies, unread, cache eviction |
| Reader polish | Done | day headings, type/width chrome, lightbox |
| Deeper feed | Done | Dogpatch categories, paged WP RSS, media: thumbs, Atom |
| Registry / new sources | Done | registry + InFurNation + FWG |
| Clustering / watch / new-since | Done | also-on chips, watched authors, highlight new |
| Non-goals | Held | no Federated-as-posts, no scrape |
