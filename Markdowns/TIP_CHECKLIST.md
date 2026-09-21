# Tip toast checklist

Track one-time tip toasts (`appearance.dismissedTips` + `TipDialog`). See [TIP_DIALOGS.md](./TIP_DIALOGS.md) for the runtime pattern, conventions, and file checklist.

Stable tip ids live in `src/misc/tipIds.ts`. Open-state helper: `src/misc/useTipOpen.ts`.

**Do not** fold legacy Appearance → Prompts switches (`hideGithubInfo`, `hideMigrationInfo`, `hideInstallPrompt`) into this list.

When a tip ships: check the box, keep the tip id stable, mention it in `src/Landing/changelog.ts`, and extend Reset tooltips search keywords only if the tip name should be findable.

---

## High priority

- [x] `pools-origin-badge` — First open of Federated Pools. Host: `PoolsSearchPage.vue`. Origin icons + e621/e6ai/Furbooru merge (Inkbunny via watch/open-by-id).
- [x] `federated-following` — First switch Search → Following. Host: `PostsPage.vue`. Tag search ignored; needs per-site login.
- [x] `local-mode` — First enter Local mode. Host: `PostsPage.vue`. Folder picker, fuzzy search, Chromium/FSA.
- [x] `feed-layout` — First open of Layout menu. Host: `FeedLayoutMenu.vue`. Grid / compact / infinite scroll / j·k·Space.
- [x] `pool-reader` — First open of a pool reader. Host: `PoolReader.vue`. Gallery vs scroll, Save chunk/all, fullscreen across chunks.

## Medium priority

- [x] `watched-pools` — First Watched Pools visit with a `+N` badge. Host: `PoolsSearchPage.vue`. New-page badges after watching.
- [x] `watched-comics` — First Watched Comics visit with a `+N` badge. Host: `TailspaceComicsPage.vue`. New-page badges after watching.
- [x] `fullscreen-gestures` — First fullscreen open. Host: `FullscreenDialog.vue`. Swipe, pinch zoom, notes, slideshow, comments rail.
- [x] `saved-posts` — First Saved Posts visit. Host: `SavedPostsPage.vue`. Mode-independent list vs site favorites.
- [x] `blacklist-modes` — First Blacklist settings visit. Host: `BlacklistSettingsPage.vue`. Display mode vs server-side hide vs custom lines.
- [x] `tailspace-comics` — First Tailspace comic open. Host: `TailspaceComicReader.vue`. Gallery/scroll + Account login for follow.

## Low priority

- [x] `fluffle-search` — First Fluffle dialog open. Host: `FluffleSearchDialog.vue`. Reverse-image search.
- [x] `remux-local` — First Remux (toolbar or card). Host: `PostsPage.vue` (+ `PostPreview` inject). FFmpeg remux path.
- [x] `post-suggester` — First Post Suggester visit. Host: `SuggesterInput.vue`. Layman taste-profile → hybrid candidates → score/rank; weights / mode exclusions.
- [x] `favorites-analyzer` — First Favorite Analyzer visit. Host: `FavoritesAnalyzer.vue`. Layman sample → tag frequency ranks; own/other/Federated/Local; link to Suggester.
- [x] `flayrah-offline` — First offline News cache alert (tip id kept). Host: `NewsFeedPage.vue`. Last-good RSS cache.
- [x] `news-intro` — First News feed visit. Host: `NewsFeedPage.vue`. Sources, Flayrah sections, Dogpatch content note, attribution.
- [x] `starred-tags` — First Favorites / starred-tag groups page. Host: `FavoritesPage.vue`. Starred groups + cross-site copy.

## Done / out of scope

- [x] `federated-mode` — Enter Federated. Host: `App.vue` (singleton). Landing chips, greyed sites, exit, Following via sidebar.
- [ ] ~~Install / GitHub / Migration~~ — Keep as `hide*` prompt flags; not `dismissedTips`.
- [ ] ~~Second Federated tip on landing chips~~ — Do not remount; singleton stays in `App.vue`.
- [ ] ~~Scent Marks / wiki snippet~~ — Self-explanatory on landing; no tip planned.
