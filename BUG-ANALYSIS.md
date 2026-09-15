# Bug & Logic-Gap Analysis

**Project:** Material e621 (`me621`) — Vue 3 / Pinia / Vite multi-site client  
**Scope:** `src/**`, `serve.py`, `vite.config.ts` proxies  
**Date:** 2026-09-14  
**Method:** Code review across services/persistence, worker/API, post UI/routing, multi-site modes, Tailspace, and local-folder mode. Findings are evidence-backed (file:line); style-only notes omitted.

---

## Progress

| Status | Count | IDs |
|--------|------:|-----|
| ✅ Fixed | all tracked | Critical/High/Medium/Low |

**Session notes (2026-09-14, M9 snackbar):**
- **M9 leftover:** `buildTagQuery` + snackbar on Posts/Pool page 1 when hide-mode + tags exceed e621’s 40-tag cap.
- Prior: M17 mode dispatch; L12 mode-specific sort UX.
- `vue-tsc --noEmit` clean.

---

## Executive summary

The multi-site expansion (e621 / e6ai / Furbooru / Inkbunny / Tailspace / local) introduced several cross-cutting contract mismatches: auth shapes differ per site, API dispatch keys off URL substrings, and several e621-only features remain in the nav for sites that cannot support them.

Highest-impact issues (original priority — now mostly ✅):

1. ✅ **Infinite scroll never re-arms**
2. ✅ **Furbooru never becomes “logged in”**
3. ✅ **Tailspace can hit the e621 posts client**
4. ✅ **Live profiles stay stale**
5. ✅ **`page` query uses `router.push`**

---

## Critical

### C1. Infinite scroll never re-arms — ✅ Fixed

| | |
|---|---|
| **Where** | `src/Post/PostList.vue` |
| **What's wrong** | `watch(props.visiblePosts, …)` captures the array value once. |
| **Fix applied** | `watch(() => props.visiblePosts, …)` so `canTriggerLoad` re-arms when the parent returns a new array. |

### C2. Furbooru auth never reaches API — ✅ Fixed

| | |
|---|---|
| **Where** | `src/services/AccountStore.ts` |
| **What's wrong** | `auth` required both username and apiKey. |
| **Fix applied** | Mode-aware auth: Furbooru → key-only (`login` may be `""`); other modes still need username+key. |

### C3. Tailspace mode still routes into e621-shaped Posts pipeline — ✅ Fixed

| | |
|---|---|
| **Where** | ApiService, SiteModeSwitcher, navigation, SavedSearchNav, Landing, ShortcutService, router |
| **What's wrong** | Tailspace base URL fell through to e621 client; saved searches / mode switch raced Posts reload. |
| **Fix applied** | `assertNotTailspace` on ApiService reads; navigate to TailspacePosts **before** `setMode`; hide saved searches in Tailspace; mode-aware `go_to_posts` / Landing browse; `beforeEach` redirects mismatched routes; PostsPage skips reload when Tailspace. |

### C4. Live `profiles[activeMode]` stays stale — ✅ Fixed

| | |
|---|---|
| **Where** | `PersistanceService.ts`, `migration.ts` |
| **What's wrong** | Sync only on detached snapshot; migration used unsynced `getState()`. |
| **Fix applied** | `syncMirrorsToActiveProfile(this.main.$state)` in `saveState`/`getState`; migration gates on any meaningful state (not history-only). |

---

## High

### H1. `page` query uses `router.push` — ✅ Fixed

| | |
|---|---|
| **Where** | `src/misc/util/utilities.ts` |
| **Fix applied** | `useRouterQueryHelpers` uses serialized `router.replace`. |

### H2. Concurrent `router.push` races — ✅ Fixed

| | |
|---|---|
| **Where** | same helpers |
| **Fix applied** | Promise chain serializes query builds against the latest route after prior navigations settle. |

### H3. `clearPosts` leaves fullscreen/details open — ✅ Fixed

| | |
|---|---|
| **Where** | `postListManager.ts` |
| **Fix applied** | Clears `fullscreenPost`, `detailsPost`, and `ui.fullscreenOpen`. |

### H4. Previous-page load with only duplicates truncates — ✅ Fixed

| | |
|---|---|
| **Where** | `postListManager.ts` |
| **Fix applied** | Guard `firstPageNumber <= 1`; skip trim/unshift when filtered list is empty. |

### H5. Fullscreen “next” at end closes viewer — ✅ Fixed

| | |
|---|---|
| **Where** | `postListManager.ts` |
| **Fix applied** | Failed advance no longer nulls `fullscreenPost`. |

### H6. Details/fullscreen notes & comments race — ✅ Fixed

| | |
|---|---|
| **Where** | `DetailsDialog.vue`; `FullscreenDialog.vue` |
| **Fix applied** | Capture `postId`; ignore results if `props.current?.id !== postId` after await. |

### H7. Furbooru `favoriteImage` ignores HTTP errors — ✅ Fixed

| | |
|---|---|
| **Where** | `furbooru/api.ts` |
| **Fix applied** | Checks `response.ok` like unfavorite. |

### H8. Furbooru “clear vote” sent as downvote — ✅ Fixed

| | |
|---|---|
| **Where** | `ApiService.ts`, `furbooru/api.ts`, vite + `serve.py` proxies |
| **Fix applied** | `score === 0` → `clearVoteImage` (DELETE); proxies accept DELETE `/votes`. |

### H9. Analyze / Dashboard pagination hardcodes 320 — ✅ Fixed (partial)

| | |
|---|---|
| **Where** | `AnalyzeService.ts`, `DashboardService.ts`, nav |
| **Fix applied** | Break when `newPosts.length < pageLimit` (not `!== 320`). Nav tools hidden for FB/IB (H13). Suggester `fav:` syntax (M14) still open. |

### H10. Inkbunny blacklist weak + stale after enrich — ✅ Fixed (partial)

| | |
|---|---|
| **Where** | `ApiService.enrichInkbunnyPost`, `postListManager` |
| **Fix applied** | Recomputes `isBlacklisted` after enrich with current blacklist. Feed still has sparse keywords until enrich (inherent IB API limit). |

### H11. Furbooru blacklist case + `artist:` prefix — ✅ Fixed

| | |
|---|---|
| **Where** | `furbooru/api.ts`, `blacklist/index.ts` |
| **Fix applied** | Lowercase tags; keep prefixed forms in `meta`; case-insensitive `termMatches`. |

### H12. Module-level Inkbunny `ridCache` races — ✅ Fixed

| | |
|---|---|
| **Where** | `inkbunny/api.ts` |
| **Fix applied** | `Map` keyed by search fingerprint + sid; delete on RID errors. |

### H13. Pools / Suggester / Analyzer / Dashboard for FB & IB — ✅ Fixed

| | |
|---|---|
| **Where** | `navigation.ts`, `ApiService.getPool`, router guards |
| **Fix applied** | Hide remote nav items for furbooru/inkbunny; `getPool` throws for those sites; router redirects deep links to Posts. |

### H14. External / share post URLs assume `posts/{id}` — ✅ Fixed (partial)

| | |
|---|---|
| **Where** | `src/misc/util/url.ts` |
| **Fix applied** | Mode-aware paths (`images/`, `s/`, `posts/`). LinkShare labels may still say “e621” (L16). |

### H15. Tag actions hardcode e621 wiki/search/Dashboard — ✅ Fixed

| | |
|---|---|
| **Where** | `TagActions.vue` |
| **Fix applied** | Mode-gated wiki/search/Dashboard; Furbooru search URL; Inkbunny pool → `Posts?tags=pool:N`; blacklist remove uses stripped name. |

### H16. Account Settings omits Tailspace — ✅ Fixed

| | |
|---|---|
| **Where** | `AccountSettingsPage.vue` |
| **Fix applied** | Tailspace button; navigate-before-setMode; credentials hidden for Tailspace. |

### H17. `setState` / `applying` can drop persistence — ✅ Fixed

| | |
|---|---|
| **Where** | `PersistanceService.ts` |
| **Fix applied** | `saveState` sets `savePending` while applying; `setState` flushes `saveState()` after `nextTick`. |

### H18. Local resume capped at 5 pages — ✅ Fixed

| | |
|---|---|
| **Where** | `PostsPage.vue` |
| **Fix applied** | Removed hard `min(..., 5)` cap; loads until resume path found. (May be slow for very deep resumes — jump API still nicer later.) |

### H19. Local tags/favorites keyed only by folder name — ✅ Fixed

| | |
|---|---|
| **Where** | `localMedia.ts` |
| **Fix applied** | Persist `.me621-folder-id` UUID; localforage keys use `id:…` (migrate from legacy name); collision-safe `idForPath`. |

---

## Medium

### Persistence / settings

| ID | Status | Where | Issue / notes |
|----|--------|-------|---------------|
| M1 | ✅ | `PersistanceService` / `setState` | Persist after migrate via `setState` → `saveState`. |
| M2 | ✅ | shortcut v5/v7 migrations | Dedupe by action+sequence before push. |
| M3 | ✅ | blacklist v11 | Detects already-nested `string[][]`; defaults if missing. |
| M4 | ✅ | migrations generally | Schema defaults for posts/appearance/blacklist/etc. before steps. |
| M5 | ✅ | `migration.ts` | `hasMigratableState` (credentials/blacklist/searches/favorites/history). |
| M6 | ✅ | `cardAutoNextIntervalMs` | Uses `== null` so `0` is kept. |
| M7 | ✅ | Tailspace `baseUrl` | Normalized like other modes. |

### API / blacklist / workers

| ID | Status | Where | Issue / notes |
|----|--------|-------|---------------|
| M8 | ✅ | hide-mode server tags | Furbooru/Inkbunny get single-term negations in query. |
| M9 | ✅ | `createTagQuery` | Keep `-foo` as negation; skip `~`/meta; snackbar when >40 tags (page 1). |
| M10 | ✅ | `getPool` | Guards FB/IB. |
| M11 | ✅ | fetch error parsing | `fetchErrorMessage` reads JSON `message`/`reason`. |
| M12 | ✅ | 429/501 backoff | Retry with Retry-After / 5s×attempt (e621 `fetchJson` + Furbooru). |
| M13 | ✅ | Furbooru tags/comments auth | Thread `args.auth?.api_key`; callers pass `account.auth`. |
| M14 | ✅ | Suggester fav query | Furbooru `my:faves`; Inkbunny `favs:me`; else `fav:user`. |
| M15 | ✅ | `scorePosts` /0 | Uses `tagCount ? … : 0`. |
| M16 | ✅ | Inkbunny verify | Watchlist + `username:` search; rejects guest SID. |
| M17 | ✅ | Prefer `activeMode` | `mode` on API args; hostname only as fallback. |

### UI / routing / Tailspace / local

| ID | Status | Where | Issue / notes |
|----|--------|-------|---------------|
| M18 | ✅ | blacklist edits | Watch tags → recompute `__meta.isBlacklisted` on loaded posts. |
| M19 | ✅ | FullscreenDialog loading | Cached `img.complete` sync; `@error` clears spinner. |
| M20 | ✅ (partial) | page strip | Now uses `replace` via helpers; still clears page on every tag watch. |
| M21 | ✅ | TagSearch cancel | Request-id generation ignores stale responses. |
| M22 | ✅ | deep `watch(posts)` | Watches post-id fingerprint instead. |
| M23 | ✅ | rapid fullscreen next | Queues one pending advance; flushes after page load. |
| M24 | ✅ | Tailspace page ↔ route | Posts + comics watch `route.query`. |
| M25 | ✅ | comics filters URL | Persist/restore categories/sort/finished. |
| M26 | ✅ | comic reader query | Watches page/chunk query changes. |
| M27 | ✅ | download proxy redirects | Manual redirect + host recheck (serve.py + vite). |
| M28 | ✅ | serve.py username encode | `quote(username, safe="")`. |
| M29 | ✅ | localMedia hash / MP4 | Collision map + `ftyp`-only sniff. |
| M30 | ✅ | `App.vue` shortcuts | `setUpShortcuts()` after persist. |
| M31 | ✅ | router mode guards | `beforeEach` for Tailspace ↔ e621-shaped / FB-IB tools. |
| M32 | ✅ | Landing Tailspace | Browse → `TailspacePosts`. |

---

## Low

| ID | Status | Issue |
|----|--------|-------|
| L1 | ✅ | Empty history entries rejected. |
| L2 | ✅ | `updateShortcut` bounds check. |
| L3 | ✅ | Snackbar is its own Pinia store (not persisted). |
| L4 | ✅ (partial) | TagActions remove uses stripped name. |
| L5 | ✅ | Query `tags` array normalized. |
| L6 | ✅ | Remote favorite bumps `fav_count`. |
| L7 | ✅ | ZoomPanImage desktop mouse drag when zoomed. |
| L8 | ✅ | View-transition unsupported = silent. |
| L9 | ✅ | Blacklist comparisons include `id:` / `favcount:`. |
| L10 | ✅ | Furbooru native rating tags + spoilered meta. |
| L11 | ✅ | Dashboard tag ratio NaN guards. |
| L12 | ✅ | Mode-specific sort/rating UX for Furbooru & Inkbunny. |
| L13 | ✅ | Single ffmpeg progress listener. |
| L14 | ✅ (partial) | Dismiss hides banner but keeps updater. |
| L15 | ✅ | Empty shortcut sequences rejected. |
| L16 | ✅ | LinkShare uses mode-aware URL + label. |

---

## Open TODOs in code (not bugs by themselves)

- `PersistanceService.ts` — `// TODO: test if correct` on settings import  
- `TagSearch.vue` — error handling now present; category TODO remains  
- `PostList` / Posts — various pagination TODOs  
- `FullscreenDialog.vue` — scroll-while-dialog TODO  

---

## Areas reviewed as mostly sound

- Per-mode profiles (account / blacklist / history / searches / favorites) via mirrors + `setMode` sync/apply — design is sound **when sync runs** (now synced on save/getState).  
- Generation guards on in-flight list loads after `clearPosts`.  
- Inkbunny multi-file viewer gating; favorite/vote UI hidden where unsupported.  
- Tailspace dedicated pages/proxy when the user stays on Tailspace routes.  
- e621 favorites/votes proxy host allowlists (SSRF posture for primary host — redirect revalidation still needed, M27).  
- Local mode button filtering and local favorites path.  

---

## Appendix: severity legend

| Severity | Meaning |
|----------|---------|
| **Critical** | Core browsing or auth broken for a supported site/mode; data loss / wipe risk |
| **High** | Wrong data, silent failure of a major feature, or strong UX breakage |
| **Medium** | Incorrect edge behavior, incomplete multi-site parity, or recoverable persistence gaps |
| **Low** | Polish, rare edges, misleading labels, minor races |
