# FEATURES.md — m-e621 recommendation backlog

Personal, AI-assisted fork of Material e621. Bias: **works for me** over general polish. Stack: Vue 3, Vuetify 3, Pinia, TypeScript, Vite, **npm only**, Node ≥20. License: **AGPL-3.0**.

This backlog is derived from `README.md`, `README-CONTINUED.md`, and `AI_CONTEXT.md` only. It is not a product contract.

**Capability rules (do not violate):**

- Inkbunny and Weasyl have **no public favorite-toggle API**. Keep `modeSupportsFavoriteToggle` false. Do not invent toggles.
- **Tailspace and Local are not Unified children.** Do not add them to `UNIFIED_CHILD_MODES` without an explicit product change.
- Weasyl guests are **SFW-only**.
- Non-e621 modes must not fall through to e621 comments, notes, pools, analyzer, or dashboard. Post Suggester is multi-mode (not Tailspace); do not route Tailspace through `/suggester`.
- Prefer extending adapters, `src/misc/util/siteCapabilities.ts`, and worker/proxy layers over special-casing templates.
- Do not recommend proprietary-only services or ToS-violating scraping beyond the existing documented proxies.
- Mark unknowns as `TODO` or `Assumption`. Do not invent APIs.

**Effort:** S = hours / one session · M = a few sessions · L = multi-session / architectural
**Impact:** how much it helps *this* fork’s multi-site + Local + proxy workflow.

---

## 1. Unified / multi-site browsing

### 1.1 Per-child Unified fetch failure isolation — **DONE**

- **Status:** Done. Children already fetched in parallel; failures now clear that child’s leftover buffer, snackbar as `{Child} skipped: …`, and other origins keep contributing.
- **User problem / motivation:** One site timing out (FurAffinity HTML search delay, Furbooru Cloudflare, Weasyl guest SFW) can stall or empty the merged date feed even when other children succeed.
- **Proposed behavior:** Fetch children independently. Show posts from healthy origins. Surface a per-origin chip/snackbar (“FurAffinity skipped: delay/error”) without wiping leftovers. Keep `unifiedMerge` sticky buffers for successful children only; reset only the failed child’s leftover.
- **Why it fits m-e621 specifically:** Unified already date-merges remote children with leftover buffers (`unifiedMerge.ts`) and origin-aware keys (`postFeedKey` = `originMode:id`). FA search *deliberately waits*. Furbooru can 520/501 without `curl_cffi`. Default children already exclude Weasyl/Itaku; remaining set is heterogeneous.
- **Affected areas/files:** `src/worker/ApiService.ts` (`refillUnifiedChild`, legacy path), snackbar via PostsPage warnings.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Failed child stays exhausted until merge key reset (tag/children change). Auto-retry-next-page still a product choice — not implemented.
- **Agent vs product:** Isolation shipped; auto-retry remains product.

### 1.2 Unified metatag translation coverage and ignored-token UX — **DONE**

- **Status:** Done. `prepareUnifiedChildTags` returns `remapped` vs `dropped` (plus deprecated `stripped` union). `formatUnifiedTagWarning` snackbars “dropped …; remapped …”. `ORDER_ALLOWED` exported as the per-mode supported table. Continues with warning (not hard-fail).
- **User problem / motivation:** Unified already strips/remaps metatags per child (`order:`, `favs:me` → `my:faves` / `stars:me`, etc.) and snackbars ignored tokens. Incomplete maps make a search that “works on e621” silently wrong on Inkbunny/FA/SoFurry.
- **Proposed behavior:** Extend `unifiedTags.ts` with an explicit per-mode translation table (supported / remapped / dropped). Snackbar should name *which* child dropped *which* token. Do not send e621 `order:` / hide-mode blacklist syntax to non-e621 adapters.
- **Why it fits m-e621 specifically:** e621 hide-mode blacklist is folded into the **40-tag API cap** on page 1 only. Other modes do not use that path. Unified children have incompatible query languages.
- **Affected areas/files:** `src/misc/util/unifiedTags.ts`, `unifiedTags.spec.ts`, `ApiService.ts`.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** `TODO:` further adapter-verified operators still welcome; do not invent new syntax.
- **Agent vs product:** Shipped with continue-on-warning. Hard-fail remains product.

### 1.3 Origin-aware following feed in Unified — **DONE**

- **Status:** Done. Dedicated Unified source control (`search` | `following`) on Posts sidebar + Account → Unified feed. Persisted as `profiles.unified.unifiedFeedSource` (`configVersion` **34**). Following queries only Inkbunny / FurAffinity / Itaku / SoFurry (via existing `following:me` adapter paths), date-merges with leftover buffers, ignores toolbar tags. Tailspace/Local stay out of Unified. `modeSupportsFollowing` in `siteCapabilities.ts`.
- **User problem / motivation:** Several modes already have following (Inkbunny, FurAffinity, Itaku, SoFurry, Tailspace) plus e621-family watches, but Unified is a tag-search merge. Checking “what did people I follow post?” still means hopping modes.
- **Proposed behavior:** Optional Unified sort/source: “following,” issuing each *capable* child’s following/watch request, then date-merging with the same leftover-buffer rules. Hide the control for modes without follow (`siteCapabilities.ts`). **Tailspace stays out of Unified.**
- **Why it fits m-e621 specifically:** Independent per-site profiles already store auth. Origin-aware actions (`filterButtonsForPost` / `originModeOf`) already exist. Following is a documented community feature, not a new site.
- **Affected areas/files:** `siteCapabilities.ts`, `types.ts`, `defaultSettings.ts`, `PersistanceService.ts`, `SiteModeStore.ts`, `postOrigin.ts`, `ApiService.ts`, `PostsPage.vue`, `AccountSettingsPage.vue`.
- **Effort / risk:** L · **Impact:** high
- **Dependencies / blockers:** Auth required per child for useful feeds. FA delay still applies. No new scrape endpoints.
- **Agent vs product:** Shipped as dedicated source control (maintainer chose this over tag-only).

### 1.4 Per-origin blacklist and favorites in the Unified card — **DONE**

- **Status:** Done (blacklist). Stamp ORs `child.blacklist` + Unified shared tags; list manager recomputes when live *or* any profile blacklist changes; favorites/votes already origin-aware. Fade/hide *mode* still uses the live Unified preference. “Open in origin mode” (switch `SiteMode`) not added — `o` still opens the source site.
- **User problem / motivation:** Blacklists, favorites, and history live on *per-site profiles*. A Unified card can show a post that is blacklisted on its origin profile, or favorite using the wrong profile slice.
- **Proposed behavior:** Evaluate blacklist/hidden against `profiles[originMode]`, not only the live Unified slice. Favorite/vote/comment buttons already origin-aware — extend that to blacklist fade/hide and “open in origin mode.” Copy-between-profiles (merge/replace) already exists; keep it.
- **Why it fits m-e621 specifically:** Profile mirrors copy `account` / `blacklist` / `favorites` / `searches` / `history` into `profiles[activeMode]` on save and mode switch. Unified identity is `postFeedKey`, not raw numeric id.
- **Affected areas/files:** `ApiService.stampUnifiedPosts`, `postListManager.ts`, `postOrigin.originAuthForPost`.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Inkbunny/Weasyl: still no fav toggle.
- **Agent vs product:** Blacklist path shipped. Origin-mode switch UI still product if wanted.

### 1.5 Unified children defaults and one-click “only sites I am logged into” — **DONE**

- **Status:** Done. `applyUnifiedSitesPreset('default' | 'authenticated')` on Posts sidebar + Account Unified settings. Auth = `profileHasAuthMaterial` (profile only; host `FA_COOKIE_*` does **not** count). No configVersion bump (presets are apply-actions, not persisted enum).
- **User problem / motivation:** Default Unified children: Weasyl and Itaku **off**; Tailspace/Local never children. Logged-out Weasyl is SFW-only; unauthenticated FA/SoFurry/Itaku quality varies. Toggling nine checkboxes per session is busywork for a personal client.
- **Proposed behavior:** Preset: “all default children,” “only authenticated children,” “custom.” Authentication = profile has the documented credential *shape* (API key, SID, cookies, token) — passwords are not stored, so “logged in” means “profile has reusable auth material.”
- **Why it fits m-e621 specifically:** Each mode has an independent account. Host-wide `FA_COOKIE_*` vs profile cookies already dual-path.
- **Affected areas/files:** `SiteModeStore.ts`, `PostsPage.vue`, `AccountSettingsPage.vue`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** None.
- **Agent vs product:** Shipped with profile-only auth (host FA cookies excluded by design).

### 1.6 Reset Unified merge state on every child/tag change (harden) — **DONE**

- **Status:** Done. `resetUnifiedMergeState` + `ApiService.resetUnifiedMerge()`; called from `clearPosts` (Unified), `setUnifiedChild`, `setUnifiedFeedSource`, and `setMode` when entering/leaving Unified. Specs cover leftover `postFeedKey` identity, seed-after-legacy, and reset.
- **User problem / motivation:** Docs already warn: sequential pages reuse discarded posts; tag/children changes **must** reset leftover buffers; page jumps use legacy merge then reseed. If any UI path forgets the reset, the feed duplicates or skips.
- **Proposed behavior:** Single reset helper called from every tag, children-toggle, mode, and page-jump path. Add unit tests around leftover identity (`postFeedKey`).
- **Why it fits m-e621 specifically:** This is load-bearing Unified behavior, not generic pagination.
- **Affected areas/files:** `unifiedMerge.ts`, `ApiService.ts`, `postListManager.ts`, `SiteModeStore.ts`, `unifiedMerge.spec.ts`.
- **Effort / risk:** S · **Impact:** high (correctness)
- **Dependencies / blockers:** None beyond existing merge contract.
- **Agent vs product:** Shipped.

---

## 2. Local library and media management

### 2.1 Tauri write path for remux, sidecars, and Save into folder — **DONE**

- **Status:** Done. Rust: `write_local_file`, `remove_local_file`, `read_local_text` under picked root (`resolve_for_write`). TS: `supportsLocalWrites`, remux via Tauri, sidecar read/write on scan/persist, Save Locally into current Tauri browse root + Open in Local. Scope = **write under picked browse root** (not arbitrary paths).
- **User problem / motivation:** Chromium uses File System Access API. Tauri desktop is **read/browse only** (`pick_local_folder` / `list_local_media` / `read_local_file`). Remux output, `.me621-tags.json` writes, and saving directly into a selected folder still require Chromium FSA. Firefox-style / Tauri users can browse Local but cannot complete the Local *management* loop.
- **Proposed behavior:** Add explicit Tauri commands for: write remux output next to source, merge-write `.me621-tags.json` (serialized, same as web bulk-save), and copy/download into the picked folder. Keep FSA path for Chromium web. Feature-detect; do not pretend Tauri is full FSA.
- **Why it fits m-e621 specifically:** Local is a first-class site mode, not a download folder. “Open in Local” after save already reuses the destination as browse root.
- **Affected areas/files:** `src-tauri/src/main.rs`, `tauriLocalFs.ts`, `localMedia.ts`, `saveLocal.ts`.
- **Effort / risk:** L · **Impact:** high
- **Dependencies / blockers:** Separate save-folder picker vs browse root still optional polish.
- **Agent vs product:** Shipped with browse-root write scope.

### 2.2 Fuzzy Local search: include sidecar tags as first-class, not filename-only — **DONE**

- **Status:** Done. `fuzzyTagsMatch` + `filterLocalMedia` rank sidecar/general tags equal to path tokens (exact + same fuzzy rules). Unit tests in `localMediaFilter.spec.ts`.
- **User problem / motivation:** Local already scans a folder, fuzzy-searches filenames/paths/tags, reads `.me621-tags.json`, sorts by newest/name/size/duration/video/stills/audio, tracks favorites and playback position. Saved remote posts merge metadata into the sidecar. If search still under-weights sidecar tags vs path, “Open in Local” after a tagged save is weaker than remote tag search.
- **Proposed behavior:** Rank sidecar tags (species/tag filename config already exists for Save Locally) equally with path tokens. Optional filter chips from sidecar keys present in the current folder.
- **Why it fits m-e621 specifically:** Folder saves already merge post metadata into `.me621-tags.json` **and** localforage. Bulk save serializes sidecar writes so they do not clobber.
- **Affected areas/files:** `localMedia.ts`, Local posts path in `PostsPage.vue` (Local bypasses `ApiService`), save filename/tag config.
- **Effort / risk:** S–M · **Impact:** medium
- **Dependencies / blockers:** FSA/Tauri read of sidecar. Optional filter chips still product.
- **Agent vs product:** Fuzzy rank shipped. Filter chips still product.

### 2.3 Local favorites / playback position export with the sidecar — **DONE**

- **Status:** Done. Schema freeze: favorites stay `.me621-favorites.json` (now Tauri+FSA); resume in sibling `.me621-library.json` `{version:1,resume}` — import on scan/`getLocalResume` (newer `savedAt` wins), write on save/clear. localforage names unchanged.
- **User problem / motivation:** Favorites and playback position are tracked in Local mode but persistence is the giant localforage tree (`material-e621` DB name — do not rename). Another browser/profile/machine cannot see Local faves without copying IndexedDB.
- **Proposed behavior:** Optionally mirror Local favorites and playback seconds into `.me621-tags.json` (or a sibling `.me621-library.json`) next to media, serialized like tag merges. Import on scan.
- **Why it fits m-e621 specifically:** Local is disk-backed; remote profiles are not. Sidecar is already the portable metadata channel.
- **Affected areas/files:** `localMedia.ts`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Same write-API split as 2.1.
- **Agent vs product:** Two-file freeze shipped (favorites + library). Merging into one file still product.

### 2.4 Do not add remux jobs to the offline save queue (document + UX) — **DONE**

- **Status:** Done (UX). Single/bulk remux blocked offline with snackbar that remux is **not** in the offline save queue; toolbar title notes ffmpeg may need network on first use. No PWA precache change.
- **User problem / motivation:** Failed network/offline **downloads** enter an IndexedDB queue and retry at startup or when connectivity returns. **Remux jobs are not queued** because ffmpeg.wasm may need network on first core load (`public/ffmpeg/` under `BASE_URL`, Workbox max **4 MiB**, COOP/COEP for SharedArrayBuffer). Users may assume bulk remux survives a refresh like Save Locally.
- **Proposed behavior:** Disable/hide “retry remux when online.” Explain in the remux dialog that cores must already be cached. Optionally precache ffmpeg assets in the PWA **only if** they fit the 4 MiB Workbox cap — `Assumption:` they do not; do not raise the cap casually (ruffle is already excluded from precache).
- **Why it fits m-e621 specifically:** Remux is a Local-library feature using `@ffmpeg/ffmpeg`, not a generic download.
- **Affected areas/files:** `PostPreview.vue`, `PostsPage.vue`.
- **Effort / risk:** S · **Impact:** medium (prevents false expectations)
- **Dependencies / blockers:** COOP/COEP unchanged. Precache still product.
- **Agent vs product:** UX shipped. Precache size still product.

### 2.5 Poster / duration scan cache for large folders — **DONE**

- **Status:** Done (already present). `POSTER_META_KEY` localforage + `.me621-posters/` with mtime/size invalidation; duration hydrated from meta; remux drops stale poster meta. No new settings flag / configVersion.
- **User problem / motivation:** Local plays common image/video/audio, uses posters where available, sorts by duration. A big library re-stat / decode on every scan is painful on Tauri and FSA.
- **Proposed behavior:** Persist a per-folder index (path, mtime, size, duration, poster blob URL or hash) in localforage **without** renaming the DB. Invalidate on mtime/size change.
- **Why it fits m-e621 specifically:** Local does not go through `ApiService`; scan cost is entirely client-side.
- **Affected areas/files:** `localMedia.ts` (`readCachedPoster` / `writeCachedPoster` / `persistPosterMeta`).
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** IndexedDB quota. Do not freeze the tab via persistence watcher.
- **Agent vs product:** Cache shipped. User-visible “library DB” still product.

---

## 3. Media playback, remuxing, and saving

### 3.1 Remembered playback settings per origin / per media kind — **DONE**

- **Status:** Done (HTML5). `posts.playbackPrefs` (`byKind` / `byOrigin`) + resolve/writeback helpers; audio override switch in Post settings; feed + fullscreen video/audio wired. `configVersion` **35**. SWF/Ruffle speed still TODO.
- **User problem / motivation:** Inline video/audio already remember mute, volume, and playback speed — globally. FurAffinity enriched music posts, Weasyl multimedia audio, SoFurry music, and e621 videos may want different defaults (music vs silent loops).
- **Proposed behavior:** Optional overrides: `playbackPrefs[originMode]` and/or `image | video | audio | swf`. Fall back to global. SWF stays Ruffle; do not apply HTML5 speed to Ruffle unless Ruffle actually supports it (`TODO`).
- **Why it fits m-e621 specifically:** Nine sites + Local share one player chrome. Inkbunny Flash/SWF is a real path.
- **Affected areas/files:** `playbackPrefs.ts`, `PostPreview.vue`, `FullscreenDialog.vue`, `PostSettingsPage.vue`, settings migration.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Ruffle API unknown — speed-on-SWF still TODO. Origin UI not exposed (schema + resolve ready).
- **Agent vs product:** HTML5 shipped. SWF still product/TODO.

### 3.2 Save Locally filename templates using existing species/tag config — **DONE**

- **Status:** Done. Tokens `%artist%` `%tags 1-5%` `%ext%` `%id%` `%origin%`; sanitize; collision → `name (1).ext` (FSA+Tauri). Sidecar stays path-keyed (filesystem); offline queue already uses `originMode:id`.
- **User problem / motivation:** Save Locally already supports configurable filenames, optionally based on species and tags, then **Open in Local**. Unified saves must key metadata by `originMode:id`, not numeric id.
- **Proposed behavior:** Template tokens from fields adapters already map onto the e621-like post (`returnTypes.ts`) plus `__meta.originMode`. Sanitize for filesystem. Collision: suffix, do not overwrite silently.
- **Why it fits m-e621 specifically:** Canonical post shape is e621-like; foreign APIs stash extras on `EnhancedPost.__meta`. Folder saves merge into sidecar + localforage.
- **Affected areas/files:** `saveLocal.ts`, Post settings hint.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Proxy host allowlists unchanged.
- **Agent vs product:** Shipped from existing post fields only.

### 3.3 Fluffle reverse-image: stay stills-only, fail closed on size — **DONE**

- **Status:** Done. `postSupportsFluffle` (still + URL + known size ≤ 4 MiB); button hidden via `filterButtonsForPost`; `searchFluffle` fails closed on video/oversize before POST.
- **User problem / motivation:** Fluffle exact-search-by-file is stills only, max **4 MiB**, UA `m-e621/1.0 (by lovelyspacedog on GitHub)`. Video/SWF/story posts offering a dead button is noise. Unified must send the origin still, not a proxied page.
- **Proposed behavior:** Gate the action with `siteCapabilities` / post file type. If over 4 MiB, snackbar and do not POST. Re-validate redirect hops (already required). Do not add other reverse-image vendors unless they are similarly public and ToS-safe (`TODO` if considering any).
- **Why it fits m-e621 specifically:** Multi-site stills share one button; Fluffle is the documented external API.
- **Affected areas/files:** `fluffleSearch.ts`, `SiteModeStore.filterButtonsForPost`, specs.
- **Effort / risk:** S · **Impact:** low–medium
- **Dependencies / blockers:** Unknown `file.size` still allowed until proxy rejects.
- **Agent vs product:** Gating shipped. New search backends still product.

### 3.4 Story documents: RTF/DOCX done; do not fake `.doc` — **DONE**

- **Status:** Done. `isUnsupportedLegacyDoc` / `postSupportsInAppDocumentPreview`; fullscreen error mentions `o` / Download; feed badge “DOC (unsupported)”. No OLE parser added.
- **User problem / motivation:** SoFurry (and similar) stories have fullscreen text. RTF and DOCX work (`mammoth` for DOCX). Legacy `.doc` is **unsupported**. Users may still tap `.doc` and get a blank reader.
- **Proposed behavior:** Capability-hide or snackbar “legacy .doc not supported — open at source (`o`).” Do not add OLE `.doc` parsers of unclear license.
- **Why it fits m-e621 specifically:** Documented story reader gap, not a generic viewer wishlist.
- **Affected areas/files:** `documentPost.ts`, `FullscreenDialog.vue`, `PostPreview.vue`, `documentPost.spec.ts`.
- **Effort / risk:** S · **Impact:** low
- **Dependencies / blockers:** AGPL: avoid proprietary converters.
- **Agent vs product:** Shipped (do not implement real `.doc`).

### 3.5 Same-origin media proxy playback (Firefox / Zen) reliability — **DONE**

- **Status:** Done (error surfaces). `describeDownloadProxyFailure` + `fetchViaDownloadProxy` (one 5xx retry) used by Save Locally; Vite `/api/download` errors aligned to JSON `{ok,message}` like `serve.py`. Allowlists unchanged. COOP/COEP untouched. Playback overlay still generic — save/snackbar path is the primary fix.
- **User problem / motivation:** `serve.py` / Vite provide same-origin media URLs for Firefox and Zen via `/api/download`. `public/zen-browser.css` exists. Dropping COOP/COEP breaks ffmpeg SAB **and** this playback path.
- **Proposed behavior:** Treat `/api/download` failures as first-class: retry once, then snackbar “proxy blocked host” vs “network.” Never widen host allowlists to “fix” one site without reviewing redirect hops.
- **Why it fits m-e621 specifically:** Multi-site media is the reason the Python proxy exists; upstream static hosting is e621-only.
- **Affected areas/files:** `mediaProxy.ts`, `mediaProxy.spec.ts`, `saveLocal.ts`, `vite.config.ts`.
- **Effort / risk:** M · **Impact:** high for non-Chromium
- **Dependencies / blockers:** Host allowlists are security-sensitive. Docker bind `0.0.0.0:18621`.
- **Agent vs product:** Error UX shipped. Allowlist additions still product + security review.

---

## 4. Comics, pools, and stories

### 4.1 Keep pool reader e621-family-only; do not fall through — **DONE**

- **Status:** Done (guards). `modeSupportsPools` (= e621/e6ai); router redirects non-pool modes from `/pools`; nav gated. Inkbunny submission pools stay on `__meta` — no IB `/pools` UI. Spec in `siteCapabilities.spec.ts`.
- **User problem / motivation:** Fork adds `/pools` and `/pools/:id` (gallery, scroll/full-width, numbered chunk pagination). Inkbunny has pools; Itaku flattens multi-image posts; Tailspace has a **separate** reader and routes (`/tailspace/...`). Router guards already exist. Accidental fall-through would show e621 pool UI on SoFurry/Itaku.
- **Proposed behavior:** Capability matrix: `modeSupportsPools` (e621/e6ai, and Inkbunny **only** if the Inkbunny adapter already has a real pool API — `TODO`). Tailspace stays on `src/Tailspace/`. Itaku multi-image stays flattened posts, not `/pools`.
- **Why it fits m-e621 specifically:** Docs call out dedicated Tailspace comic reader and “do not fall through.”
- **Affected areas/files:** `siteCapabilities.ts`, `router/index.ts`, `navigation.ts`.
- **Effort / risk:** S (guards/tests) / L (Inkbunny pools UI if API exists) · **Impact:** medium
- **Dependencies / blockers:** Inkbunny pool chrome still product + API confirmation.
- **Agent vs product:** Guards shipped. New Inkbunny pool chrome still product.

### 4.2 Shared reader chrome without merging Tailspace into Unified — **DONE** (slice)

- **Status:** Done (shared primitives). `comicReader.ts`: chunk sizes 24/10, `buildChunkButtons`, view-mode/full-width localStorage helpers. Wired into Pool + Tailspace. Routes stay separate — Tailspace never `/pools`. Full keyboard/`pageIndex` merge still out of scope (Tailspace-only).
- **User problem / motivation:** e621 pools and Tailspace comics both have scroll/full-width navigation. Duplicated reader behavior drifts (keyboard, numbered chunks, fullscreen notes).
- **Proposed behavior:** Extract shared reader primitives (page index, scroll vs page, chunk pagination) used by `src/Pool/` and `src/Tailspace/`. **Do not** put Tailspace into Unified. **Do not** route Tailspace comics through `/pools/:id`.
- **Why it fits m-e621 specifically:** Two comic surfaces, one personal client, Tailspace is explicitly not a Unified child.
- **Affected areas/files:** `comicReader.ts`, `PoolReader.vue`, `PoolPage.vue`, `TailspaceComicReader.vue`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Mode ↔ route guards remain.
- **Agent vs product:** Chunk/prefs slice shipped. Deeper chrome merge optional.

### 4.3 Inkbunny multi-file submissions as a gallery, not fake pools — **DONE**

- **Status:** Done. Gallery stays in `InkbunnySubmissionDialog` (strip + page chevrons; not `/pools`). `shouldUseInkbunnyViewer` also keys off `files.length`. Save Locally expands multi-file to `_pNN` pages (`saveInkbunnyGalleryLocally`); dialog **Save all** / **Save page**. Capability helper `postSupportsInkbunnyGallery`.
- **User problem / motivation:** Inkbunny multi-file submissions are a documented site feature. Flattening like Itaku vs a mini-gallery changes how Save Locally and fullscreen next/prev work.
- **Proposed behavior:** If the adapter already exposes file lists on `__meta`, add in-post file tabs/strip gated by capabilities. Do not call them pools unless Inkbunny’s own pools API is used.
- **Why it fits m-e621 specifically:** Adapters map onto e621-like posts and stash extras on `__meta`. Itaku already flattens; Inkbunny may need the opposite.
- **Affected areas/files:** `inkbunnyGallery.ts`, `saveLocal.ts`, `InkbunnySubmissionDialog.vue`, `inkbunny/api.ts`, `siteCapabilities.ts`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Feed-card strip still pagecount badge only (opens existing gallery dialog).
- **Agent vs product:** Gallery + save-all shipped. Flatten-all-to-feed still out of scope.

### 4.4 SoFurry fullscreen story + comments sidebar coexistence — **DONE** (fail-closed)

- **Status:** Done (fail-closed). Story chrome owns text (fullscreen/details). `modeSupportsComments` / `modeSupportsNotes` omit SoFurry; `getComments` → `[]`; no fake e621 POST. Comments sidebar stays hidden until a real SoFurry comment API exists in the adapter.
- **User problem / motivation:** Screenshots/docs show fullscreen comments sidebar **and** fullscreen story mode. Story HTML/RTF/DOCX plus comments must not use e621 notes overlay.
- **Proposed behavior:** Story route/chrome owns text; comments use origin-aware caches keyed by `postFeedKey`. Notes overlay stays e621-family (`siteCapabilities`).
- **Why it fits m-e621 specifically:** SoFurry must not fall through to e621 comments/notes.
- **Affected areas/files:** `siteCapabilities.ts`, `FullscreenDialog.vue`, SoFurry adapter.
- **Effort / risk:** S–M · **Impact:** medium
- **Dependencies / blockers:** Enabling SoFurry comments needs adapter evidence (product).
- **Agent vs product:** Gating shipped. New write APIs still product.

---

## 5. Auth, accounts, and per-site profiles

### 5.1 Auth material health on Account settings (no password storage) — **DONE** (display-only)

- **Status:** Done (display-only). `profileHasAuthMaterial(mode, account)` + Account chips **Auth saved** / **No credentials**; captions note missing profile auth (FA notes host `FA_COOKIE_*` not shown). No new network probes. Verify buttons unchanged.
- **User problem / motivation:** Many modes; passwords are **not** stored. FA profile cookies vs host-wide `FA_COOKIE_A`/`B` (do not log out the minting browser session). Itaku token, Weasyl/Furbooru API keys, Inkbunny SID + `userId`, SoFurry session cookies, Tailspace password-or-cookie. Silent expiry looks like “site broken.”
- **Proposed behavior:** Per-mode “auth present / missing / last probe failed” on Accounts. Probe using **existing** adapter whoami/session calls only. Never write passwords into `profiles`.
- **Why it fits m-e621 specifically:** Independent accounts are a headline feature. Dual FA auth paths are easy to misconfigure when self-hosting.
- **Affected areas/files:** `siteProfiles.ts` (`profileHasAuthMaterial`), `AccountSettingsPage.vue`, `siteProfiles.spec.ts`.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Optional future: probe via existing verify endpoints for “last probe failed.”
- **Agent vs product:** Display-only shipped. Probing is optional follow-up.

### 5.2 Profile copy already supports favorites/blacklists — extend to saved searches / starred tag groups — **DONE**

- **Status:** Done (refuse-across-language). `ProfileListKind` includes `searches`; `queryLanguageFamily` / `canCopySavedSearches` (e621↔e6ai only among remotes); History settings UI. Favorites still merge tags into Ungrouped (group-structure copy still product).
- **User problem / motivation:** Saved searches and starred tags sit in named collapsible groups with drag-and-drop reorder. Favorites and blacklists can already be copied between site profiles (merge or replace). Cross-mode copy of groups is the missing personal-workflow piece — with **per-mode query translation**, not blind paste of e621 `order:` into FA.
- **Proposed behavior:** Copy groups with the same merge/replace UX. Run tokens through `unifiedTags`-style maps when the destination is not the same query language. Snackbar dropped tokens.
- **Why it fits m-e621 specifically:** Per-site starred tags/saved searches are part of each mode’s profile. Unified already has translation.
- **Affected areas/files:** `ProfileListSync.vue`, `profileListSync.ts`, `HistorySettingsPage.vue`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Cross-language remap still product (1.2). Shipped path refuses incompatible paste.
- **Agent vs product:** Refuse + same-language merge shipped. Best-effort remap / favorite group structure still product.

### 5.3 Harden profile mirror sync (live slices ↔ `profiles[activeMode]`) — **DONE**

- **Status:** Done. `syncActiveProfileFromLive` alias of `syncMirrorsToActiveProfile`; round-trip unit tests in `siteProfiles.spec.ts`.
- **User problem / motivation:** Live `account` / `blacklist` / `favorites` / `searches` / `history` must be copied into `profiles[activeMode]` on save and mode switch. Persisting only the detached copy loses data. Easy for an agent to get wrong when adding a field.
- **Proposed behavior:** Single `syncActiveProfileFromLive()` used by every writer. Unit tests for mode switch. Adding a settings field still requires `configVersion` + `ISettingsServiceState` + `< N` migration.
- **Why it fits m-e621 specifically:** This is the fork’s multi-profile architecture; upstream was single-site.
- **Affected areas/files:** `siteProfiles.ts`, `siteProfiles.spec.ts`.
- **Effort / risk:** S · **Impact:** high (data loss prevention)
- **Dependencies / blockers:** Never stringify Pinia proxies in `$subscribe`. Do not rename localforage stores.
- **Agent vs product:** Shipped.

### 5.4 Host-wide vs profile FA cookies: explicit precedence — **DONE**

- **Status:** Done. Code already preferred profile → env → guest; now documented in Account cookie help, `resolve_cookies_with_source` in `fa_proxy.py` + Vite FA proxy, `me` returns `cookieSource`, login snackbar shows which source was used (no cookie values logged).
- **User problem / motivation:** `serve.py` uses optional host-wide `FA_COOKIE_*`; Account settings can also store profile cookies. Unclear precedence causes “works in Docker, fails in Vite” or the reverse. Logging out the minting browser session kills cookies.
- **Proposed behavior:** Settings copy: profile cookies override host-wide when set; otherwise host-wide. Show which source the last FA request used (without dumping cookie values).
- **Why it fits m-e621 specifically:** FA browsing goes through bundled `faapi` proxy; HTML search is delayed on purpose.
- **Affected areas/files:** `fa_proxy.py`, `vite-furaffinity-proxy.ts`, `furaffinity/api.ts`, `AccountSettingsPage.vue`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Do not commit `FA_COOKIE_*`.
- **Agent vs product:** Shipped with profile-wins precedence (confirmed).

---

## 6. PWA, desktop, and offline behavior

### 6.1 PWA update banner + `controllerchange` Reload (keep) — **DONE**

- **Status:** Done (keep + hash). Banner shows git short hash from `getAppName()` when available. `registerType: 'prompt'` / Workbox cap / iife untouched.
- **User problem / motivation:** `registerType: 'prompt'`, poll every **ten minutes**, update banner in `App.vue`. Reload needs the `controllerchange` workaround in `misc/serviceWorker/register.ts`. Hash router start URL `/#/posts`. `/api/` denylisted from navigate fallback. `ruffle/**` excluded from precache. Workbox max **4 MiB**.
- **Proposed behavior:** Do not “simplify” SW registration. Optional: show git short hash from `getAppName()` / `VITE_GIT_COMMIT_INFO` on the banner so a personal host knows *which* build arrived.
- **Why it fits m-e621 specifically:** Self-host + `sync`/`deploy.sh` mean the PWA is how the maintainer receives updates. Landing page already shows fork vs upstream commit timelines.
- **Affected areas/files:** `PwaUpdateBanner.vue`, `register.ts`, `vite.config.ts` PWA.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Rollup output **iife** is load-bearing for workers/PWA — do not change casually.
- **Agent vs product:** Hash on banner shipped. Changing `registerType` or cache size still product.

### 6.2 Offline save queue vs API browse (honest offline) — **DONE**

- **Status:** Done. `isOnline` / `isModeOnlineCapable` in `SiteModeStore`; remote modes disabled in mode switcher when offline; `setMode` snackbars “only Local”; Unified not claimed offline-capable.
- **User problem / motivation:** Offline queue is for **failed downloads**, retry on startup/connectivity. Browsing remote sites offline cannot work (proxies denylisted). Local folder + already-saved media can.
- **Proposed behavior:** If `navigator.onLine` is false, mode switcher: disable remote modes, keep Local (and already-cached PWA shell). Do not claim Unified is offline-capable.
- **Why it fits m-e621 specifically:** Local is a site mode; Unified is remote-only by design.
- **Affected areas/files:** `SiteModeStore.ts`, `SiteModeSwitcher.vue`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** None.
- **Agent vs product:** Shipped. Full offline Unified cache still out of scope.

### 6.3 Tauri 1 desktop: keep as Local/Firefox bridge, not a second product — **DONE** (keep)

- **Status:** Done (keep). Tauri remains Local bridge; `custom-protocol` / windows_subsystem untouched. Writes already via 2.1. No store release work.
- **User problem / motivation:** Tauri bundle id `com.lovelyspacedog.me621`, Vite **8080** in `tauri.conf.json`. `#![windows_subsystem = "windows"]` and `custom-protocol` must stay. Version numbers (`package.json` 0.0.0, Tauri 0.1.0) are not releases.
- **Proposed behavior:** Desktop checklist: Local pick/list/read works; writes still flagged (see 2.1); proxies still hit the same origin as web (Tauri custom protocol vs Vite). No store release engineering.
- **Why it fits m-e621 specifically:** Documented as the Firefox-style Local bridge, not a rewrite of the SPA.
- **Affected areas/files:** `src-tauri/`, `tauri.conf.json`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Tauri 1; do not remove `custom-protocol`. AGPL source offer still applies if a build is distributed.
- **Agent vs product:** Keep shipped. App-store / auto-update = product (skip).

### 6.4 Domain migration UI remains optional — **DONE** (keep)

- **Status:** Done (keep). Env-gated migration UI left as-is; no multi-tenant migrator.
- **User problem / motivation:** `VITE_MIGRATE_TO_DOMAIN` / `FROM` mounts `Migration/MigrationPage.vue` instead of `App.vue`. Useful for a personal canonical host (`VITE_CANONICAL_URL`, `M_E621_DOMAIN`).
- **Proposed behavior:** Keep as env-gated. Do not build a generic multi-tenant migrator. If used, migrate localforage **in place** (same DB names).
- **Why it fits m-e621 specifically:** Self-host helpers (`start`, `sync`, `deploy.sh`) already assume one managed instance.
- **Affected areas/files:** `src/main.ts`, `Migration/`, deploy env example (no secrets).
- **Effort / risk:** S · **Impact:** low unless moving domains
- **Dependencies / blockers:** Renaming localforage wipes settings.
- **Agent vs product:** Only touch when actually migrating hosts. Product: whether to run it.

---

## 7. Self-hosting, proxies, and deployment

### 7.1 `serve.py` + Docker as the real multi-site host (not upstream static) — **DONE**

- **Status:** Done. Compose/Dockerfile = local source of truth; Vite `ipv4first` gap documented. **Product: keep GHCR** — `.github/workflows/docker.yml` stays publishing `ghcr.io/<repo>` on push (`latest` + sha). Not the upstream static image; fork Dockerfile runs `serve.py`.
- **User problem / motivation:** Upstream static image is e621-only. This fork needs `serve.py` (dist + proxies + same-origin media + optional managed git pull). Docker defaults: `0.0.0.0:18621`, `M_E621_ROOT=/app/dist`, `M_E621_CONFIG=/data/config`. `.github/workflows/docker.yml` still publishes to GHCR on push — local docs say `docker compose up --build`.
- **Proposed behavior:** README-aligned Docker is source of truth. `TODO:` decide whether GHCR workflow should be disabled/updated (stale vs useful personal registry). `sync` uses `build-only` (skips `vue-tsc`) — keep that for remote RAM, but type-check locally.
- **Why it fits m-e621 specifically:** Nine sites + FA Python deps (`uv` + `requirements.txt`, auto `.venv`) cannot be a static nginx folder.
- **Affected areas/files:** `README-CONTINUED.md`, `Dockerfile`, `docker-compose`, `.github/workflows/docker.yml`.
- **Effort / risk:** S–M · **Impact:** high for the maintainer’s instance
- **Dependencies / blockers:** AGPL network-use source offer for a public host. Never commit `deploy.env`.
- **Agent vs product:** Keep-GHCR decision recorded. Workflow left enabled.

### 7.2 Proxy allowlists and Furbooru Cloudflare path — **DONE**

- **Status:** Done (messaging). Furbooru `fetchJson` prefers proxy JSON `message`, names Cloudflare / curl_cffi. Allowlists not widened. Vite download errors JSON-aligned (see 3.5).
- **User problem / motivation:** Host allowlists on `/api/download` and Fluffle are security-sensitive. Furbooru needs `curl_cffi` + cached `_philomena_key` (`.furbooru_philomena_key`, gitignored). Node `fetch` gets HTTP 501 “I'm not a robot.” Vite sets DNS `ipv4first` because Furbooru Cloudflare IPv6 520s from some hosts.
- **Proposed behavior:** Keep Python helper in **both** Vite and `serve.py`. Fail with a snackbar that names Furbooru/Cloudflare rather than a generic 502. Do not switch Furbooru to raw `fetch`.
- **Why it fits m-e621 specifically:** Philomena + CF is a documented fork quirk, not generic proxy work.
- **Affected areas/files:** `src/worker/furbooru/api.ts`, `vite.config.ts`, `README-CONTINUED.md`.
- **Effort / risk:** S · **Impact:** high for Furbooru mode
- **Dependencies / blockers:** ToS/bot rules — stay on the existing CF-aware path. Gitignore the philomena key.
- **Agent vs product:** Error UX shipped. New CF bypass techniques = **do not**.

### 7.3 FA search delay remains mandatory — **DONE** (keep)

- **Status:** Done (keep). `fa_proxy.py` `handle_delay()` still called on search/browse paths. No user “go faster” slider. Do not remove.
- **User problem / motivation:** FurAffinity search scrapes HTML and **deliberately waits** between requests. Speeding this up for Unified page size is how you get blocked.
- **Proposed behavior:** Unified FA child should request smaller pages or accept slower merge (see 1.1 isolation). Expose delay as a server constant, not a user “go faster” slider.
- **Why it fits m-e621 specifically:** FA is a Unified child (default on) going through `fa_proxy.py`.
- **Affected areas/files:** `fa_proxy.py`, Unified child page size, FA adapter.
- **Effort / risk:** S · **Impact:** high (account health)
- **Dependencies / blockers:** Site rules. No new scrape surfaces.
- **Agent vs product:** Delay kept. Product: lower Unified FA weight vs keep default-on.

### 7.4 Managed-instance git pull (`VITE_ENABLE_GIT_PULL`) — **DONE**

- **Status:** Done (harden). `M_E621_GIT_PULL` / token-file gate; POST 403 when disabled; GET `/api/git` public = no `head`/`log_tail`; authed status strips `log_tail`; InfoPage sends token on poll; `sync` writes `M_E621_GIT_PULL=true` to config env.
- **User problem / motivation:** Settings → Info “pull” on managed hosts; `sync` writes `.env.local`. Branch default `master`. Useful for a single-operator box; dangerous if the instance is exposed.
- **Proposed behavior:** Keep env-gated. Require the existing managed-host assumption. Show commit hash after pull. AGPL: pulled source is the offer.
- **Why it fits m-e621 specifically:** Personal `deploy.sh` SSH workflow, not a SaaS.
- **Affected areas/files:** `serve.py`, `sync`, `InfoPage.vue`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Public managed host still product “don’t.”
- **Agent vs product:** Auth harden shipped.

### 7.5 `tsconfig.node.json` include list for Vite proxies — **DONE**

- **Status:** Done. `tsconfig.node.json` includes `vite-*-proxy.ts`.
- **User problem / motivation:** `tsconfig.node.json` includes `vite-furaffinity-proxy.ts` but not the other `vite-*-proxy.ts` files (imported from `vite.config.ts`). Type-check holes hide proxy bugs that only show in prod `serve.py` drift.
- **Proposed behavior:** Include every `vite-*-proxy.ts`. Prefer shared allowlist constants between Vite proxies and `serve.py` where practical (Python vs TS — `Assumption:` duplication exists; document rather than invent a codegen).
- **Why it fits m-e621 specifically:** Dev proxies are required for multi-site; prod is a different process.
- **Affected areas/files:** `tsconfig.node.json`.
- **Effort / risk:** S · **Impact:** medium (DX + security reviewability)
- **Dependencies / blockers:** Shared allowlist codegen still optional.
- **Agent vs product:** Include list shipped.

---

## 8. Performance, accessibility, and reliability

### 8.1 Persistence watcher must stay scheduled `toPlain` — **DONE**

- **Status:** Done (invariant). `scheduleSave` timeout + exported `toPlain` + unit test; snackbar stripped before save. Comment landmine kept.
- **User problem / motivation:** `PersistanceService` writes the whole tree to localforage. `JSON.stringify` on reactive proxies inside `$subscribe` retriggers the deep watcher and **freezes the tab**. Snackbar must be stripped before save.
- **Proposed behavior:** No feature work that saves from `$subscribe` inline. Add a regression unit test that the subscriber uses timeout + plain clone. Agents adding fields must not “helpfully” stringify.
- **Why it fits m-e621 specifically:** One giant `useMainStore` plus profile mirrors is heavier than upstream e621-only state.
- **Affected areas/files:** `PersistanceService.ts`, `PersistanceService.spec.ts`.
- **Effort / risk:** S · **Impact:** high
- **Dependencies / blockers:** Do not rename the persistence filename or localforage stores.
- **Agent vs product:** Shipped as landmine + test.

### 8.2 View transitions: keep first-load skip — **DONE**

- **Status:** Done. `shouldSkipViewTransition` extracted + unit tests; `router.beforeResolve` uses it (skip first load / same-name).
- **User problem / motivation:** `router.beforeResolve` must not start a view transition on first load (`!from.name`). Doing so captures an empty shell and Posts looks stuck. Hash router + mode guards make this easy to regress.
- **Proposed behavior:** Guard stays. Test or a commented invariant next to the router hook. Do not add more transitions on Tailspace/pool reader until this is locked.
- **Why it fits m-e621 specifically:** Mode switch + Posts is the main surface.
- **Affected areas/files:** `viewTransition.ts`, `router/index.ts`, `viewTransition.spec.ts`.
- **Effort / risk:** S · **Impact:** high (first-run UX)
- **Dependencies / blockers:** None.
- **Agent vs product:** Shipped.

### 8.3 e621 40-tag cap vs Unified blacklist — **DONE** (verified)

- **Status:** Done (verified + documented). PostsPage already skips `buildTagQuery` when Unified; `createTagQuery` is only used on e621-family backends in `ApiService`. Comments added so agents do not fold Unified’s shared string. e621 child still gets per-child `createTagQuery` with that child’s blacklist only.
- **User problem / motivation:** e621 hide-mode blacklist is folded into the 40-tag API cap on **page 1 only**. Unified must not apply that folding to Furbooru/Inkbunny/etc. Client-side origin blacklist (1.4) is the Unified path.
- **Proposed behavior:** Keep `createTagQuery.ts` e621-only. Document in `siteCapabilities` that tag-cap folding is e621-family. If Unified includes e621, fold only the e621 child query, not the shared string.
- **Why it fits m-e621 specifically:** Unified query translation already splits per child.
- **Affected areas/files:** `createTagQuery.ts`, `PostsPage.vue`.
- **Effort / risk:** S · **Impact:** high if currently wrong
- **Dependencies / blockers:** None found (no leakage).
- **Agent vs product:** Verified correct; docs/comments shipped.

### 8.4 `debug()` logs only in production — do not “fix” blindly — **DONE**

- **Status:** Done. `debug()` stays PROD-only; added `debugDev()` for local. Do not invert `debug()`.
- **User problem / motivation:** `src/misc/util/debug.ts` only logs when `import.meta.env.PROD`. Inverting it looks like a one-line fix and may dump profile-adjacent noise to a hosted instance.
- **Proposed behavior:** If needed, add `debugDev()` for local, leave prod as-is, or gate on an explicit settings flag. Do not treat `debug()` as a debug-package enable API.
- **Why it fits m-e621 specifically:** Documented gotcha for AI agents.
- **Affected areas/files:** `src/misc/util/debug.ts`.
- **Effort / risk:** S · **Impact:** low (footgun removal)
- **Dependencies / blockers:** Avoid logging cookies/API keys.
- **Agent vs product:** Shipped. Product before changing prod log volume; agents may use `debugDev()`.

### 8.5 Keyboard and reduced-motion: fork-specific surfaces only — **DONE**

- **Status:** Done (reduced-motion). `prefersReducedMotion()` gates fullscreen slideshow auto-advance and feed card auto-next. Manual next/prev / `o` unchanged. No global a11y rewrite.
- **User problem / motivation:** `o` already opens the fullscreen post on its source. Vuetify defaults: `transition: 'no'`, `ripple: false`. Generic “add dark mode / improve a11y” is out of scope (Vuetify MD3 already themed).
- **Proposed behavior:** Ensure `o`, slideshow, card auto-next, pool/Tailspace reader keys, and comments sidebar do not trap focus. Honor `prefers-reduced-motion` for slideshow/auto-next **only** (auto-next is documented). Skip a global a11y rewrite.
- **Why it fits m-e621 specifically:** These are the immersive media features the fork advertises.
- **Affected areas/files:** `reducedMotion.ts`, `FullscreenDialog.vue`, `PostList.vue`.
- **Effort / risk:** S–M · **Impact:** medium for the maintainer’s daily reader
- **Dependencies / blockers:** Focus-trap audit on pool/Tailspace still optional polish.
- **Agent vs product:** Reduced-motion shipped. Broader a11y audit not this backlog’s job.

### 8.6 FA enrich in `usePostListManager` must stay cancellable — **DONE**

- **Status:** Done. Enrich applies only when `generation` still matches (tag/children/mode/`clearPosts`/`replacePosts` bump + clear queue). No extra FA round-trips; soft-cancel (no AbortSignal on worker yet).
- **User problem / motivation:** Architecture: list manager does pagination, fullscreen, blacklist, **FA enrich**. Combined with FA delay, enrich can pile up in Unified.
- **Proposed behavior:** Cancel in-flight enrich on tag/children/mode change (same reset as 1.6). Capability-skip enrich for non-FA origins.
- **Why it fits m-e621 specifically:** FA music enrichment is a documented FurAffinity feature.
- **Affected areas/files:** `postListManager.ts` (`applyEnrichedPost`).
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** FA rate delay. Worker AbortSignal still optional.
- **Agent vs product:** Generation-gated apply shipped.

---

## 9. Developer experience and AI-agent friendliness

### 9.1 Playwright / CI match npm + Node ≥20 — **DONE**

- **Status:** Done (smoke). Workflow: Node 20 + `npm ci` + `build-only` + chromium smoke. Scaffold replaced with `/#/` + `/#/posts` hash-route checks. Prefer `npm run test:unit` as merge gate; Playwright is smoke only.
- **User problem / motivation:** `e2e/vue.spec.ts` is leftover Vue scaffold (`h1` “You did it!”). `.github/workflows/playwright.yml` still uses **Node 16 + pnpm**, which `package.json` engines **forbid**. `Assumption:` Playwright CI is not a reliable gate; prefer local `npm run test:unit`.
- **Proposed behavior:** Delete or replace the scaffold spec with a hash-route smoke (`/#/` landing or `/#/posts`) **or** disable the workflow. Do not introduce pnpm. Playwright CI should use npm and Node 20 if kept.
- **Why it fits m-e621 specifically:** Engine block is load-bearing. Docker/GHCR publish kept (7.1).
- **Affected areas/files:** `e2e/vue.spec.ts`, `.github/workflows/playwright.yml`.
- **Effort / risk:** S · **Impact:** medium (stop lying CI)
- **Dependencies / blockers:** npm only.
- **Agent vs product:** Smoke path chosen and shipped. Killing e2e entirely still optional product.

### 9.2 Colocated `*.spec.ts` vs unused `__tests__` ESLint block — **DONE**

- **Status:** Done. ESLint Vitest block targets `src/**/*.spec.ts`. Specs added/extended for merge reset, Fluffle, `.doc`, profile mirrors, auth material.
- **User problem / motivation:** Tests live next to code as `foo.spec.ts`. ESLint Vitest block only targets unused `src/**/__tests__/*`.
- **Proposed behavior:** Point ESLint Vitest config at `src/**/*.spec.ts`. Add specs for `unifiedMerge`, `postFeedKey`, profile mirrors, `siteCapabilities` (especially fav-toggle false for Inkbunny/Weasyl).
- **Why it fits m-e621 specifically:** Capability matrix and Unified merge are the fork’s regression magnets.
- **Affected areas/files:** `eslint.config.ts`, colocated specs.
- **Effort / risk:** S · **Impact:** high for agent safety
- **Dependencies / blockers:** Vitest + jsdom already in stack.
- **Agent vs product:** Shipped.

### 9.3 Site-mode checklist as comments, not a new framework — **DONE**

- **Status:** Done (docs). Checklist in `AI_CONTEXT.md` + comment on `resolveApiBackend`. No plugin system. No new sites.
- **User problem / motivation:** Adding a mode requires: types + `SITE_MODE_URLS` + empty profile + `SiteModeStore` + nav/router guards + worker adapter + Vite/`serve.py` proxy + capability flags. Do not fall through to the e621 client. User-Agent / `_client`: `m-e621/<git>`.
- **Proposed behavior:** Keep this list in `AI_CONTEXT.md` (already). Optionally a `src/worker/api/` README comment. Do not add a plugin system. **No new sites in this backlog unless the maintainer names one** — nine + Local + Unified is enough.
- **Why it fits m-e621 specifically:** Fall-through to e621 is the documented failure mode (SoFurry comments/notes/pools/analyzer/dashboard; Tailspace must not use `/suggester`).
- **Affected areas/files:** `AI_CONTEXT.md`, `ApiService.ts` `resolveApiBackend`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** ToS/API for any hypothetical tenth site. AGPL for new deps.
- **Agent vs product:** **Product decision required** before any new `SiteMode`. Agents should refuse drive-by sites.

### 9.4 IIFE rollup, hash router, localforage names: “do not clean up” — **DONE** (keep)

- **Status:** Done (explicit non-change). Documented out of scope; no modernization attempted.
- **User problem / motivation:** Agents “modernize” to ESM workers, HTML5 history, or rename `material-e621` IndexedDB / `PersistanceService` and wipe user data or break PWA.
- **Proposed behavior:** Explicitly out of scope. If workers must change, prove PWA + Comlink still load. History must stay hash (`/#/posts`).
- **Why it fits m-e621 specifically:** Documented load-bearing quirks.
- **Affected areas/files:** `vite.config.ts`, `src/router/index.ts`, `PersistanceService.ts`.
- **Effort / risk:** L if attempted · **Impact:** negative if done naively
- **Dependencies / blockers:** PWA, Tauri custom-protocol, existing user IndexedDB.
- **Agent vs product:** **Do not implement** without an explicit maintainer order.

### 9.5 Settings field recipe (configVersion 35) — **DONE** (recipe)

- **Status:** Done (recipe). Followed for `playbackPrefs` @ 35; documented in AI_CONTEXT/FEATURES.
- **User problem / motivation:** New flags (Unified presets, Local write capability, playback per-origin) require `configVersion` bump, `ISettingsServiceState`, and `< N` migration. Skipping migration drops or corrupts profiles. Unified Following source shipped at **34**; `playbackPrefs` at **35**.
- **Proposed behavior:** Any backlog item that adds persisted state includes a migration in the same change. Snackbar remains ephemeral.
- **Why it fits m-e621 specifically:** Single persisted tree + profile mirrors.
- **Affected areas/files:** `defaultSettings.ts`, settings types, `PersistanceService.ts`.
- **Effort / risk:** S per field · **Impact:** high (data)
- **Dependencies / blockers:** None.
- **Agent vs product:** **Agent-safe** if the recipe is followed; reviewers should reject settings without migrations.

---

## Top 5 quick wins

Low effort, clear value for *this* repo. Prefer these when an agent has a short session.

1. **DONE** — Unified merge reset helper + tests (1.6)
2. **DONE** — Profile mirror sync helper + tests (5.3)
3. **DONE** — Capability-gate Fluffle and `.doc` (3.3, 3.4)
4. **DONE** — `tsconfig.node.json` + ESLint Vitest globs (7.5, 9.2)
5. **DONE** (display-only) — Auth-present indicators on Accounts (5.1); probing still optional

Honorable mention: Playwright smoke now npm+Node 20 (9.1) — unit tests still preferred merge gate.

**Next agent-safe backlog (not yet done):** (none — FEATURES agent-safe + product decisions closed).

---

## Top 5 high-impact bets

Larger effort, strategic for the fork’s actual product (multi-site + Local + `serve.py`).

1. **DONE** — Per-child Unified fetch isolation + metatag translation table (1.1, 1.2)
2. **DONE** — Origin-profile blacklist/favorites on Unified cards (1.4)
3. **DONE** — Tauri write path for Local remux / sidecar / save (2.1)
4. **DONE** — `serve.py`/Docker as multi-site host; GHCR publish **kept** (3.5, 7.1, 7.2)
5. **DONE** — Origin-aware following merge in Unified (1.3) — dedicated Search/Following source control; Tailspace/Local still excluded; no Inkbunny/Weasyl fav toggles.

---

## Explicitly out of scope (unless the maintainer overrides)

- Putting **Tailspace** or **Local** in Unified.
- Inkbunny/Weasyl **favorite toggles**.
- Legacy **`.doc`** parsing via proprietary converters.
- Removing FA search **delay**.
- New reverse-image vendors, new site modes, yarn/pnpm, renaming localforage, dropping COOP/COEP, loosening proxy allowlists, or stripping NSFW capability.
- Generic dark mode / “improve UX” / app-store release process.
- Treating Playwright CI or `package.json` `0.0.0` as a product version.
