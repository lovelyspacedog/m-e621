# Bug analysis — Material e621 (me621)

**Date:** 2026-09-13  
**Scope:** Source review of the Vue 3 client, Pinia persistence, API/workers, local-media path, and `serve.py` / Vite proxies. No automated test suite was run.  
**Method:** Findings are limited to defects that can be shown from the current code. Style nits and unproven suspicions are omitted.

---

## Summary

The client is a Vue 3 + Pinia + Comlink-worker frontend for e621 / e6ai, plus a Local folder mode.

| Severity | Open | Fixed |
| --- | ---: | ---: |
| High | 0 | 6 |
| Medium | 0 | 16 |
| Low | 1 | 9 |

---

## ~~High~~ — all fixed ✅

### ~~1. Clicking a post preview does not open fullscreen~~

**Where:** `src/Post/PostPreview.vue:2`  
**Fixed:** Changed `@click.native` → `@click`. Vue 3 removed `.native`; the modifier was being silently treated as a key filter, so `handleClick` was never called. `FixedAspectRatioBox` has `inheritAttrs: true`, so the listener now falls through to its root `div`.

---

### ~~2. Details dialog "Close" does nothing~~

**Where:** `src/Post/DetailsDialog.vue:142`  
**Fixed:** Changed `@click.native` → `@click` on `v-btn`. Same Vue 3 `.native` issue.

---

### ~~3. Refreshing a paged feed loads the *next* page~~

**Where:** `src/Post/postListManager.ts` (`loadNextPage`)  
**Fixed:** On cold start (empty post list) `loadNextPage` now fetches `Math.max(1, getSavedPageNumber())` — the actual saved page — instead of always `getSavedPageNumber() + 1`. Subsequent fetches while the list is non-empty still increment normally. Affects `PostsPage`, `PoolPage`, and `SuggesterResult`.

---

### ~~4. Invalid settings JSON hangs restore forever~~

**Where:** `src/services/PersistanceService.ts` (`loadStateFromFile`)  
**Fixed:** `JSON.parse` and `setState` are now wrapped in `try/catch` that calls `reject(err)`. Added `reader.onerror` to reject on FileReader failure. Previously any throw left the promise permanently unresolved.

---

### ~~5. Artist dashboard tag rankings use the last post, not aggregates~~

**Where:** `src/worker/DashboardService.ts:100–103`  
**Fixed:** Changed `counts.up = post.score.up` / `counts.down = ...` / `counts.favorites = ...` to `+=`. The "top tags by favorites / up / down" sorts now reflect sums across all posts that carry each tag rather than the values of whichever post happened to be processed last.

---

### ~~6. Analyzer cache ignores site URL (e621 vs e6ai)~~

**Where:** `src/worker/AnalyzeService.ts:118`  
**Fixed:** Cache key changed from `[tags, postLimit].join("")` (collision-prone, site-blind) to `JSON.stringify({ tags, postLimit, baseUrl })`. Switching e621 ↔ e6ai or changing the post limit now fetches fresh results.

---

## ~~Medium~~ — all fixed ✅

### ~~7. Search / pool change while a page is loading is dropped~~

**Where:** `src/Post/postListManager.ts`, `src/Post/PostsPage.vue`  
**Fixed:** Added a `generation` ref. `clearPosts()` increments it and resets `loading`. `loadNextPage` / `loadPreviousPage` capture the generation before awaiting and discard the result if it no longer matches, so a search or pool change mid-fetch starts a new load instead of applying the stale page. Removed the `if (!loading.value)` guard from `onSearchClick`. Pool page already calls `clearPosts()` + `loadNextPage()` on `poolId` change, so it picks up the same fix.

---

### ~~8. "Auto load next page" setting is dead~~

**Where:** `src/Post/PostList.vue`  
**Fixed:** Wired a native `IntersectionObserver` (no `vue-intersect`) to the existing `addElement` / `triggerLoad` / `shouldHaveIntersectionObserver` helpers. Sentinel posts are observed; the observer is disconnected on update and unmount, and re-attached when `autoLoad` is toggled.

---

### ~~9. Fullscreen toggle-favorite shortcut leaks and stacks~~

**Where:** `src/Post/FullscreenDialog.vue:370–387`  
**Fixed:** Changed `emitter.off("fullscreenToggleFavorite", addFavorite)` → `emitter.off("fullscreenToggleFavorite", toggleFavorite)` so the correct handler is removed on unmount.

---

### ~~10. Blacklist matching is not e621-compatible~~

**Where:** `src/worker/blacklist/index.ts`  
**Fixed:** Matching now injects synthetic tags `id:`, `userid:`, `user:` (when `uploader_name` is present), and `status:active|pending|flagged|deleted`. `score:` / `width:` / `height:` terms with `>`, `>=`, `<`, `<=`, or `=` are evaluated numerically against the live post instead of looking for a literal string in the tag list.

---

### ~~11. Hide-mode blacklist is not applied to the API query~~

**Where:** `src/misc/util/createTagQuery.ts`  
**Fixed:** For `BlacklistMode.hide`, single-term blacklist lines are inverted into e621 search tags (`tag` → `-tag`, `-tag` → `tag`, `~tag` → `-tag`) and appended, then sliced to the 40-tag API cap. Multi-term lines stay client-side.

---

### ~~12. Concurrent `saveState()` can persist a stale snapshot~~

**Where:** `src/services/PersistanceService.ts:62–77`  
**Fixed:** Added `saveInFlight` / `savePending` flags. When a second `saveState()` arrives while one is in flight, it sets `savePending = true` and returns. The in-flight save calls `saveState()` once more in its `finally` block, always using the latest state snapshot.

---

### ~~13. `profileFromMirrors` can copy the active site into the e621 profile~~

**Where:** `src/services/PersistanceService.ts:380–385`  
**Fixed:** The migration branch that rebuilt a missing `profiles.e621.account` was replaced with `{ ...createEmptySiteProfile("e621"), ...newState.profiles.e621 }`. Preserves any partial e621-specific fields without copying active-mode mirrors (which may be e6ai credentials).

---

### ~~14. Worker singletons can be created twice~~

**Where:** `src/worker/services.ts`  
**Fixed:** Each `get*Service()` function now stores the `Promise` (not the resolved instance) using `??=`. Concurrent callers await the same Promise and get the same worker back; no second worker is ever spawned.

---

### ~~15. Suggester / analyzer races; analyzer runs `fav:undefined`~~

**Where:** `src/Suggester/SuggesterResult.vue`; `src/Analyzer/FavoritesAnalyzerResult.vue`  
**Fixed:** Added a module-level `generation` counter to both files. Each `analyze()` call captures the current generation; the response is discarded if a newer call has started. `watchEffect` in `FavoritesAnalyzerResult` now guards `if (!username) return` before calling `analyze`, preventing `fav:undefined` requests.

---

### ~~16. API keys are put in the `posts.json` query string~~

**Where:** `src/worker/api/index.ts:59–66`  
**Fixed:** Removed `...auth` spread from `buildUrl` params in `posts.list`. Auth is now passed as `{ headers: getAuthHeader(args.auth) }` to `fetchJson`, keeping credentials out of URLs, browser history, and `Referer` headers. All other API calls already used this pattern.

---

### ~~17. Account "verify credentials" is a false positive~~

**Where:** `src/Settings/AccountSettingsPage.vue`, `src/worker/ApiService.ts`  
**Fixed:** `verifyCredentials` now calls `ApiService.verifyAccount`, which GETs `/users/:name.json` (name must match) and then `/favorites.json?limit=1` with Basic auth. Favorites is authenticated-only, so a wrong key no longer reports as valid.

---

### ~~18. Dev-server favorites proxy is hardcoded to e621.net~~

**Where:** `vite.config.ts`  
**Fixed:** Replaced the static `server.proxy` entry with a new `e621FavoritesProxy()` plugin that mirrors the existing votes/comments proxy design. Reads `X-Site-Base` header, validates the hostname against the same `e621.net / e6ai.net / e926.net` allow-list, and requires `Authorization: Basic`. The old proxy config entry has been removed.

---

### ~~19. Shortcut editor missing actions; `splice(-1)` deletes the wrong row~~

**Where:** `KeyboardShortcutEditor.vue`, `ShortcutStore.ts`, `HistoryStore.ts`  
**Fixed:**
- Added `fullscreen_add_favorite`, `fullscreen_remove_favorite`, `fullscreen_toggle_favorite` to the `actions` array in the editor.
- `deleteShortcut` and `deleteEntry` now guard `if (index < 0 || index >= list.length) return` before splicing.
- `maxLength` setter in `HistoryStore` clamps to `Math.max(0, ...)` and immediately trims the entries array to the new limit.

---

### ~~20. Site-mode switch on an empty Posts URL does not reload~~

**Where:** `src/App/SiteModeSwitcher.vue`, `src/Post/PostsPage.vue`  
**Fixed:** Added a `modeChangeCount` ref (incremented by `setMode`) to `SiteModeStore`. `PostsPage` watches it and calls `onSearchClick()` on every change. Because `onSearchClick` is already debounced and guarded by `loading`, the normal `watch(query)` path and this new watch coalesce safely when both fire (e.g. when the user was on `/posts?tags=cat` and switches mode).

---

### ~~21. DText is not parsed~~

**Where:** `src/Parser/DText.vue`  
**Fixed:** Rewrote the parser for Vue 3 `h()`. BBCode (`[b]`, `[i]`, `[u]`, `[s]`, `[o]`, `[sup]`, `[sub]`, `[color]`, `[spoiler]`, `[code]`, `[quote]`, `[section]`, `[table]`), `h1.`–`h6.` headers, `*` lists, `@username`, and `"text":url` / relative e621 links now render instead of raw markup.

---

### ~~22. Heatmap `max` is `-Infinity` when artist has no recent uploads~~

**Where:** `src/worker/DashboardService.ts`  
**Fixed:** The `max` field is now computed as `values.length ? Math.max(...values) : 0`. When no posts fall in the last 366 days the heatmap renders all cells at opacity 0 (blank) without corrupting the ratio calculation via `-Infinity`.

---

## Low — 9 fixed, 1 open

### ~~23. Dashboard and analyzer fetches can exceed their post caps~~

**Where:** `DashboardService.ts`, `AnalyzeService.ts`  
**Fixed:** Both `getPosts` loops now `return posts.slice(0, CAP)` after the while loop. Analyzer also caches the sliced array so the cache never stores an overshot result.

---

### ~~24. `videoPlaybackRate === 0` is treated as missing~~

**Where:** `src/services/PersistanceService.ts`  
**Fixed:** Changed `if (!newState.posts.videoPlaybackRate)` to `if (newState.posts.videoPlaybackRate == null)` so an intentional `0` is preserved across loads.

---

### ~~25. File restore does not clear `snackbar`~~

**Where:** `src/services/PersistanceService.ts` (`loadStateFromFile`)  
**Fixed:** `settings.snackbar = null` is now set before `setState`, matching what `loadState()` already does for localStorage restores.

---

### ~~26. `NetworkInformation.onchange` assigned the *return value* of `handleChange()`~~

**Where:** `src/misc/util/dataSaver.ts`  
**Fixed:** Changed `onchange = handleChange()` to `onchange = handleChange`. The separate initial `handleChange()` call is unchanged.

---

### ~~27. Hammer.js and fullscreen listener never cleaned up~~

**Where:** `ZoomPanImage.vue`, `FullscreenDialog.vue`  
**Fixed:** `ZoomPanImage` now calls `hammer.destroy()` in `onBeforeUnmount`. The module-level `fullscreenchange` listener in `FullscreenDialog` is guarded by a `fsListenerRegistered` flag so HMR reloads do not stack duplicate handlers.

---

### ~~28. Landing "remove tag" can delete the last chip~~

**Where:** `src/Landing/LandingPage.vue`  
**Fixed:** `removeTag` now bounds-checks `indexOf` before splicing (`if (i >= 0)`).

---

### ~~29. External post URL uses the legacy path~~

**Where:** `src/misc/util/url.ts`  
**Fixed:** `getE6PostUrl` now builds `posts/${id}` instead of the legacy `post/show/${id}`.

---

### 30. Local file IDs are a 31-bit hash — skipped

**Where:** `src/misc/util/localMedia.ts:120–126`  
**Status:** Left as-is. Widening the hash range would change IDs for ~50% of existing paths and break saved local favorites / resume positions. Collision risk remains theoretical for small folders.

---

### ~~31. Optimistic vote highlight is not rolled back on failure~~

**Where:** `src/Post/PostInfoList.vue`  
**Fixed:** `castVote` saves the previous highlight and score total, then restores the highlight after 5 s if the post's `score.total` did not change (proxy for a failed request).

---

### ~~32. README vs `package.json` engines conflict~~

**Where:** `README.md`  
**Fixed:** Development instructions now use `npm` / `npx` instead of `pnpm` / `pnpx`, matching `package.json`'s `"pnpm": "not allowed"` engine restriction.

---


## Reviewed, not reported as bugs

- DText is parsed in `DText.vue` (Vue 3 `h()`); no `v-html`.  
- `createTagQuery` not sending the blacklist for blur/blackout is intentional (client-side CSS filter). Hide mode now does send `-tag` for single-term lines.  
- Sliding window of ~2 pages in `postListManager` is deliberate.  
- `serve.py` favorite/vote/comment host allow-list and pull-token compare look sound.  
- Pinia stores other than those named above had no proven logic errors in this pass.
