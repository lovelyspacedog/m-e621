# FEATURES.md — m-e621 recommendation backlog

Personal, AI-assisted fork of Material e621. Bias: **works for me** over general polish. Stack: Vue 3, Vuetify 3, Pinia, TypeScript, Vite, **npm only**, Node ≥20. License: **AGPL-3.0**.

This backlog is derived from `README.md`, `README-CONTINUED.md`, and `AI_CONTEXT.md` only. It is not a product contract.

**Capability rules (do not violate):**

- Inkbunny and Weasyl have **no public favorite-toggle API**. Keep `modeSupportsFavoriteToggle` false. Do not invent toggles.
- **Tailspace and Local are not Unified children.** Do not add them to `UNIFIED_CHILD_MODES` without an explicit product change.
- Weasyl guests are **SFW-only**.
- Non-e621 modes must not fall through to e621 comments, notes, pools, suggester, analyzer, or dashboard.
- Prefer extending adapters, `src/misc/util/siteCapabilities.ts`, and worker/proxy layers over special-casing templates.
- Do not recommend proprietary-only services or ToS-violating scraping beyond the existing documented proxies.
- Mark unknowns as `TODO` or `Assumption`. Do not invent APIs.

**Effort:** S = hours / one session · M = a few sessions · L = multi-session / architectural
**Impact:** how much it helps *this* fork’s multi-site + Local + proxy workflow.

---

## 1. Unified / multi-site browsing

### 1.1 Per-child Unified fetch failure isolation

- **User problem / motivation:** One site timing out (FurAffinity HTML search delay, Furbooru Cloudflare, Weasyl guest SFW) can stall or empty the merged date feed even when other children succeed.
- **Proposed behavior:** Fetch children independently. Show posts from healthy origins. Surface a per-origin chip/snackbar (“FurAffinity skipped: delay/error”) without wiping leftovers. Keep `unifiedMerge` sticky buffers for successful children only; reset only the failed child’s leftover.
- **Why it fits m-e621 specifically:** Unified already date-merges remote children with leftover buffers (`unifiedMerge.ts`) and origin-aware keys (`postFeedKey` = `originMode:id`). FA search *deliberately waits*. Furbooru can 520/501 without `curl_cffi`. Default children already exclude Weasyl/Itaku; remaining set is heterogeneous.
- **Affected areas/files:** `src/misc/util/unifiedMerge.ts`, Unified tag prep (`unifiedTags.ts` / `prepareUnifiedChildTags`), `src/worker/` adapters, `src/Post/` list manager, snackbar via main store (ephemeral — do not persist).
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Per-site rate limits (FA delay in `fa_proxy.py`); proxy allowlists. `Assumption:` child fetches are already parallel or sequential enough to isolate; confirm before rewriting merge.
- **Agent vs product:** Agent can implement isolation + UI chips. Product decision: whether a failed child should auto-retry next page or stay skipped until the user toggles it.

### 1.2 Unified metatag translation coverage and ignored-token UX

- **User problem / motivation:** Unified already strips/remaps metatags per child (`order:`, `favs:me` → `my:faves` / `stars:me`, etc.) and snackbars ignored tokens. Incomplete maps make a search that “works on e621” silently wrong on Inkbunny/FA/SoFurry.
- **Proposed behavior:** Extend `unifiedTags.ts` with an explicit per-mode translation table (supported / remapped / dropped). Snackbar should name *which* child dropped *which* token. Do not send e621 `order:` / hide-mode blacklist syntax to non-e621 adapters.
- **Why it fits m-e621 specifically:** e621 hide-mode blacklist is folded into the **40-tag API cap** on page 1 only. Other modes do not use that path. Unified children have incompatible query languages.
- **Affected areas/files:** `src/misc/util/unifiedTags.ts`, `src/misc/util/createTagQuery.ts`, `src/misc/util/siteCapabilities.ts`, Posts toolbar, snackbar.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** `TODO:` verify each child’s real search operators from existing adapters — do not invent Inkbunny/FA/Weasyl/Itaku/SoFurry syntax. Site ToS: only use documented/existing search endpoints.
- **Agent vs product:** Agent can add a table driven off current adapter behavior and tests. Product decision: whether dropped tokens should hard-fail the query or continue with a warning.

### 1.3 Origin-aware following feed in Unified

- **User problem / motivation:** Several modes already have following (Inkbunny, FurAffinity, Itaku, SoFurry, Tailspace) plus e621-family watches, but Unified is a tag-search merge. Checking “what did people I follow post?” still means hopping modes.
- **Proposed behavior:** Optional Unified sort/source: “following,” issuing each *capable* child’s following/watch request, then date-merging with the same leftover-buffer rules. Hide the control for modes without follow (`siteCapabilities.ts`). **Tailspace stays out of Unified.**
- **Why it fits m-e621 specifically:** Independent per-site profiles already store auth. Origin-aware actions (`filterButtonsForPost` / `originModeOf`) already exist. Following is a documented community feature, not a new site.
- **Affected areas/files:** `siteCapabilities.ts`, worker adapters, `unifiedMerge.ts`, Posts toolbar, Account/profile auth gates.
- **Effort / risk:** L · **Impact:** high
- **Dependencies / blockers:** Auth required per child. `TODO:` confirm each adapter already exposes a following endpoint vs HTML scrape. FA delay applies. Do not scrape new endpoints. Weasyl guest SFW-only still applies.
- **Agent vs product:** **Needs a product decision first** (new Unified source vs a separate route). After that, agent can gate on capabilities and reuse merge.

### 1.4 Per-origin blacklist and favorites in the Unified card

- **User problem / motivation:** Blacklists, favorites, and history live on *per-site profiles*. A Unified card can show a post that is blacklisted on its origin profile, or favorite using the wrong profile slice.
- **Proposed behavior:** Evaluate blacklist/hidden against `profiles[originMode]`, not only the live Unified slice. Favorite/vote/comment buttons already origin-aware — extend that to blacklist fade/hide and “open in origin mode.” Copy-between-profiles (merge/replace) already exists; keep it.
- **Why it fits m-e621 specifically:** Profile mirrors copy `account` / `blacklist` / `favorites` / `searches` / `history` into `profiles[activeMode]` on save and mode switch. Unified identity is `postFeedKey`, not raw numeric id.
- **Affected areas/files:** `src/services/siteProfiles.ts`, `src/services/state.ts`, `src/Post/` cards, blacklist helpers, `postOrigin.ts`.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Must keep profile mirror sync; never persist only the detached copy. Snackbar stays ephemeral. Inkbunny/Weasyl: still no fav toggle.
- **Agent vs product:** Agent can implement origin-profile blacklist lookup. Product: hide vs fade vs “show anyway” for Unified-only.

### 1.5 Unified children defaults and one-click “only sites I am logged into”

- **User problem / motivation:** Default Unified children: Weasyl and Itaku **off**; Tailspace/Local never children. Logged-out Weasyl is SFW-only; unauthenticated FA/SoFurry/Itaku quality varies. Toggling nine checkboxes per session is busywork for a personal client.
- **Proposed behavior:** Preset: “all default children,” “only authenticated children,” “custom.” Authentication = profile has the documented credential *shape* (API key, SID, cookies, token) — passwords are not stored, so “logged in” means “profile has reusable auth material.”
- **Why it fits m-e621 specifically:** Each mode has an independent account. Host-wide `FA_COOKIE_*` vs profile cookies already dual-path.
- **Affected areas/files:** `defaultSettings.ts` (`defaultUnifiedSites`), SiteMode/Unified settings UI, AccountStore, `configVersion` + persistence migration.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Bump `configVersion` (currently **33**) and add `< N` migration. Do not persist passwords.
- **Agent vs product:** Agent-safe if the preset is settings-only. Product: whether host-wide FA cookies count as “authenticated” for Unified.

### 1.6 Reset Unified merge state on every child/tag change (harden)

- **User problem / motivation:** Docs already warn: sequential pages reuse discarded posts; tag/children changes **must** reset leftover buffers; page jumps use legacy merge then reseed. If any UI path forgets the reset, the feed duplicates or skips.
- **Proposed behavior:** Single reset helper called from every tag, children-toggle, mode, and page-jump path. Add unit tests around leftover identity (`postFeedKey`).
- **Why it fits m-e621 specifically:** This is load-bearing Unified behavior, not generic pagination.
- **Affected areas/files:** `unifiedMerge.ts`, Posts page / `usePostListManager`, colocated `*.spec.ts`.
- **Effort / risk:** S · **Impact:** high (correctness)
- **Dependencies / blockers:** None beyond existing merge contract.
- **Agent vs product:** **Agent can implement safely.** Tests are the acceptance bar.

---

## 2. Local library and media management

### 2.1 Tauri write path for remux, sidecars, and Save into folder

- **User problem / motivation:** Chromium uses File System Access API. Tauri desktop is **read/browse only** (`pick_local_folder` / `list_local_media` / `read_local_file`). Remux output, `.me621-tags.json` writes, and saving directly into a selected folder still require Chromium FSA. Firefox-style / Tauri users can browse Local but cannot complete the Local *management* loop.
- **Proposed behavior:** Add explicit Tauri commands for: write remux output next to source, merge-write `.me621-tags.json` (serialized, same as web bulk-save), and copy/download into the picked folder. Keep FSA path for Chromium web. Feature-detect; do not pretend Tauri is full FSA.
- **Why it fits m-e621 specifically:** Local is a first-class site mode, not a download folder. “Open in Local” after save already reuses the destination as browse root.
- **Affected areas/files:** `src-tauri/` (Rust commands), `src/misc/util/localMedia.ts` (and related FS helpers), save/remux UI in `src/Post/`, capability flag for `localWrites`.
- **Effort / risk:** L · **Impact:** high
- **Dependencies / blockers:** Tauri 1 limits; preserve `custom-protocol` feature and bundle id `com.lovelyspacedog.me621`. OS file permissions. Do not bypass user-picked folder. `Assumption:` Tauri 1 can write via `fs` if scoped to the picked path — confirm before coding.
- **Agent vs product:** **Needs a product decision** on scope (write-next-to-source vs arbitrary paths). After scope, agent can implement behind a capability flag.

### 2.2 Fuzzy Local search: include sidecar tags as first-class, not filename-only

- **User problem / motivation:** Local already scans a folder, fuzzy-searches filenames/paths/tags, reads `.me621-tags.json`, sorts by newest/name/size/duration/video/stills/audio, tracks favorites and playback position. Saved remote posts merge metadata into the sidecar. If search still under-weights sidecar tags vs path, “Open in Local” after a tagged save is weaker than remote tag search.
- **Proposed behavior:** Rank sidecar tags (species/tag filename config already exists for Save Locally) equally with path tokens. Optional filter chips from sidecar keys present in the current folder.
- **Why it fits m-e621 specifically:** Folder saves already merge post metadata into `.me621-tags.json` **and** localforage. Bulk save serializes sidecar writes so they do not clobber.
- **Affected areas/files:** `localMedia.ts`, Local posts path in `PostsPage.vue` (Local bypasses `ApiService`), save filename/tag config.
- **Effort / risk:** S–M · **Impact:** medium
- **Dependencies / blockers:** FSA/Tauri read of sidecar. `TODO:` confirm current fuzzy matcher already indexes sidecar keys; extend only if not.
- **Agent vs product:** Agent-safe if it only reuses existing sidecar schema. Product if new tag ontology is invented.

### 2.3 Local favorites / playback position export with the sidecar

- **User problem / motivation:** Favorites and playback position are tracked in Local mode but persistence is the giant localforage tree (`material-e621` DB name — do not rename). Another browser/profile/machine cannot see Local faves without copying IndexedDB.
- **Proposed behavior:** Optionally mirror Local favorites and playback seconds into `.me621-tags.json` (or a sibling `.me621-library.json`) next to media, serialized like tag merges. Import on scan.
- **Why it fits m-e621 specifically:** Local is disk-backed; remote profiles are not. Sidecar is already the portable metadata channel.
- **Affected areas/files:** `localMedia.ts`, persistence slice for Local favorites, Tauri/FSA write capability.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Same write-API split as 2.1. Do not rename localforage stores. `Assumption:` sidecar JSON schema is additive objects keyed by relative path.
- **Agent vs product:** Product: one sidecar vs two files. Agent after schema freeze.

### 2.4 Do not add remux jobs to the offline save queue (document + UX)

- **User problem / motivation:** Failed network/offline **downloads** enter an IndexedDB queue and retry at startup or when connectivity returns. **Remux jobs are not queued** because ffmpeg.wasm may need network on first core load (`public/ffmpeg/` under `BASE_URL`, Workbox max **4 MiB**, COOP/COEP for SharedArrayBuffer). Users may assume bulk remux survives a refresh like Save Locally.
- **Proposed behavior:** Disable/hide “retry remux when online.” Explain in the remux dialog that cores must already be cached. Optionally precache ffmpeg assets in the PWA **only if** they fit the 4 MiB Workbox cap — `Assumption:` they do not; do not raise the cap casually (ruffle is already excluded from precache).
- **Why it fits m-e621 specifically:** Remux is a Local-library feature using `@ffmpeg/ffmpeg`, not a generic download.
- **Affected areas/files:** Local remux UI, offline queue module, PWA `vite-plugin-pwa` / Workbox config, `public/ffmpeg/`.
- **Effort / risk:** S · **Impact:** medium (prevents false expectations)
- **Dependencies / blockers:** COOP `same-origin` + COEP `credentialless` must stay for SAB **and** Firefox/Zen `/api/download` playback.
- **Agent vs product:** **Agent can implement the UX copy/disable safely.** Precache size is a product/PWA decision.

### 2.5 Poster / duration scan cache for large folders

- **User problem / motivation:** Local plays common image/video/audio, uses posters where available, sorts by duration. A big library re-stat / decode on every scan is painful on Tauri and FSA.
- **Proposed behavior:** Persist a per-folder index (path, mtime, size, duration, poster blob URL or hash) in localforage **without** renaming the DB. Invalidate on mtime/size change.
- **Why it fits m-e621 specifically:** Local does not go through `ApiService`; scan cost is entirely client-side.
- **Affected areas/files:** `localMedia.ts`, `PersistanceService.ts` (schedule `$subscribe` correctly — never `JSON.stringify` reactive proxies inline), `configVersion` if a new settings flag is added.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** IndexedDB quota. Do not freeze the tab via persistence watcher.
- **Agent vs product:** Agent-safe as an opt-in cache. Product if the index becomes a user-visible “library DB.”

---

## 3. Media playback, remuxing, and saving

### 3.1 Remembered playback settings per origin / per media kind

- **User problem / motivation:** Inline video/audio already remember mute, volume, and playback speed — globally. FurAffinity enriched music posts, Weasyl multimedia audio, SoFurry music, and e621 videos may want different defaults (music vs silent loops).
- **Proposed behavior:** Optional overrides: `playbackPrefs[originMode]` and/or `image | video | audio | swf`. Fall back to global. SWF stays Ruffle; do not apply HTML5 speed to Ruffle unless Ruffle actually supports it (`TODO`).
- **Why it fits m-e621 specifically:** Nine sites + Local share one player chrome. Inkbunny Flash/SWF is a real path.
- **Affected areas/files:** Post cards / fullscreen, `defaultSettings.ts` + migration, Ruffle mount.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** `configVersion` bump. Ruffle API unknown — mark speed-on-SWF as `TODO`.
- **Agent vs product:** Agent-safe for HTML5 media. Product/TODO for SWF.

### 3.2 Save Locally filename templates using existing species/tag config

- **User problem / motivation:** Save Locally already supports configurable filenames, optionally based on species and tags, then **Open in Local**. Unified saves must key metadata by `originMode:id`, not numeric id.
- **Proposed behavior:** Template tokens from fields adapters already map onto the e621-like post (`returnTypes.ts`) plus `__meta.originMode`. Sanitize for filesystem. Collision: suffix, do not overwrite silently.
- **Why it fits m-e621 specifically:** Canonical post shape is e621-like; foreign APIs stash extras on `EnhancedPost.__meta`. Folder saves merge into sidecar + localforage.
- **Affected areas/files:** `src/Post/` save flow, `/api/download` proxy, filename util, sidecar merge.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Proxy host allowlists and redirect re-validation on `/api/download`. Offline queue already exists for failed downloads.
- **Agent vs product:** Agent-safe if tokens are documented from existing post fields only. Product if new remote metadata fetches are required.

### 3.3 Fluffle reverse-image: stay stills-only, fail closed on size

- **User problem / motivation:** Fluffle exact-search-by-file is stills only, max **4 MiB**, UA `m-e621/1.0 (by lovelyspacedog on GitHub)`. Video/SWF/story posts offering a dead button is noise. Unified must send the origin still, not a proxied page.
- **Proposed behavior:** Gate the action with `siteCapabilities` / post file type. If over 4 MiB, snackbar and do not POST. Re-validate redirect hops (already required). Do not add other reverse-image vendors unless they are similarly public and ToS-safe (`TODO` if considering any).
- **Why it fits m-e621 specifically:** Multi-site stills share one button; Fluffle is the documented external API.
- **Affected areas/files:** Post actions, Fluffle proxy in Vite/`serve.py`, allowlists.
- **Effort / risk:** S · **Impact:** low–medium
- **Dependencies / blockers:** Fluffle ToS/API; AGPL does not allow bundling a proprietary closed search SDK. 4 MiB also matches Workbox max cache — coincidence, not a reason to raise either.
- **Agent vs product:** **Agent can implement gating safely.** New search backends need a product decision.

### 3.4 Story documents: RTF/DOCX done; do not fake `.doc`

- **User problem / motivation:** SoFurry (and similar) stories have fullscreen text. RTF and DOCX work (`mammoth` for DOCX). Legacy `.doc` is **unsupported**. Users may still tap `.doc` and get a blank reader.
- **Proposed behavior:** Capability-hide or snackbar “legacy .doc not supported — open at source (`o`).” Do not add OLE `.doc` parsers of unclear license.
- **Why it fits m-e621 specifically:** Documented story reader gap, not a generic viewer wishlist.
- **Affected areas/files:** Story/fullscreen preview, `siteCapabilities.ts`, SoFurry adapter.
- **Effort / risk:** S · **Impact:** low
- **Dependencies / blockers:** AGPL: avoid proprietary converters. Opening at source already exists (`o` shortcut).
- **Agent vs product:** **Agent-safe.** Implementing real `.doc` needs a product + license decision — default is **do not**.

### 3.5 Same-origin media proxy playback (Firefox / Zen) reliability

- **User problem / motivation:** `serve.py` / Vite provide same-origin media URLs for Firefox and Zen via `/api/download`. `public/zen-browser.css` exists. Dropping COOP/COEP breaks ffmpeg SAB **and** this playback path.
- **Proposed behavior:** Treat `/api/download` failures as first-class: retry once, then snackbar “proxy blocked host” vs “network.” Never widen host allowlists to “fix” one site without reviewing redirect hops.
- **Why it fits m-e621 specifically:** Multi-site media is the reason the Python proxy exists; upstream static hosting is e621-only.
- **Affected areas/files:** `serve.py`, `vite.config.ts`, `mediaProxy.ts`, Zen CSS (only if playback UI needs a hint).
- **Effort / risk:** M · **Impact:** high for non-Chromium
- **Dependencies / blockers:** Host allowlists are security-sensitive. Docker bind `0.0.0.0:18621`.
- **Agent vs product:** Agent can improve error surfaces. Allowlist additions = product + security review.

---

## 4. Comics, pools, and stories

### 4.1 Keep pool reader e621-family-only; do not fall through

- **User problem / motivation:** Fork adds `/pools` and `/pools/:id` (gallery, scroll/full-width, numbered chunk pagination). Inkbunny has pools; Itaku flattens multi-image posts; Tailspace has a **separate** reader and routes (`/tailspace/...`). Router guards already exist. Accidental fall-through would show e621 pool UI on SoFurry/Itaku.
- **Proposed behavior:** Capability matrix: `modeSupportsPools` (e621/e6ai, and Inkbunny **only** if the Inkbunny adapter already has a real pool API — `TODO`). Tailspace stays on `src/Tailspace/`. Itaku multi-image stays flattened posts, not `/pools`.
- **Why it fits m-e621 specifically:** Docs call out dedicated Tailspace comic reader and “do not fall through.”
- **Affected areas/files:** `src/Pool/`, `src/Tailspace/`, `src/router/index.ts`, `siteCapabilities.ts`, Inkbunny adapter.
- **Effort / risk:** S (guards/tests) / L (Inkbunny pools UI if API exists) · **Impact:** medium
- **Dependencies / blockers:** `TODO:` Inkbunny pool list/detail endpoints as already used by the adapter — do not scrape new ones. Hash router: `/#/pools`.
- **Agent vs product:** Hardening guards is **agent-safe**. New Inkbunny pool chrome needs confirmation the API is already wired.

### 4.2 Shared reader chrome without merging Tailspace into Unified

- **User problem / motivation:** e621 pools and Tailspace comics both have scroll/full-width navigation. Duplicated reader behavior drifts (keyboard, numbered chunks, fullscreen notes).
- **Proposed behavior:** Extract shared reader primitives (page index, scroll vs page, chunk pagination) used by `src/Pool/` and `src/Tailspace/`. **Do not** put Tailspace into Unified. **Do not** route Tailspace comics through `/pools/:id`.
- **Why it fits m-e621 specifically:** Two comic surfaces, one personal client, Tailspace is explicitly not a Unified child.
- **Affected areas/files:** `src/Pool/`, `src/Tailspace/`, maybe `src/misc/` composable. Router guards stay.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Mode ↔ route guards must remain. View-transition first-load skip (`!from.name`) still applies if reader routes navigate.
- **Agent vs product:** Agent-safe refactor if behavior is snapshotted by unit tests first. Product if anyone wants Tailspace-in-Unified (default: **no**).

### 4.3 Inkbunny multi-file submissions as a gallery, not fake pools

- **User problem / motivation:** Inkbunny multi-file submissions are a documented site feature. Flattening like Itaku vs a mini-gallery changes how Save Locally and fullscreen next/prev work.
- **Proposed behavior:** If the adapter already exposes file lists on `__meta`, add in-post file tabs/strip gated by capabilities. Do not call them pools unless Inkbunny’s own pools API is used.
- **Why it fits m-e621 specifically:** Adapters map onto e621-like posts and stash extras on `__meta`. Itaku already flattens; Inkbunny may need the opposite.
- **Affected areas/files:** Inkbunny worker adapter, `src/Post/` fullscreen, `siteCapabilities.ts`, save-all-files.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** `TODO:` confirm file-list fields already on the mapped post. ToS/API as currently proxied only.
- **Agent vs product:** Product: flatten vs gallery. Agent after that, using existing blobs only.

### 4.4 SoFurry fullscreen story + comments sidebar coexistence

- **User problem / motivation:** Screenshots/docs show fullscreen comments sidebar **and** fullscreen story mode. Story HTML/RTF/DOCX plus comments must not use e621 notes overlay.
- **Proposed behavior:** Story route/chrome owns text; comments use origin-aware caches keyed by `postFeedKey`. Notes overlay stays e621-family (`siteCapabilities`).
- **Why it fits m-e621 specifically:** SoFurry must not fall through to e621 comments/notes.
- **Affected areas/files:** SoFurry adapter, comments components in `src/Post/`, story preview, `siteCapabilities.ts`.
- **Effort / risk:** S–M · **Impact:** medium
- **Dependencies / blockers:** Comment APIs as already proxied. `TODO:` if SoFurry comments are incomplete, do not fake e621 comment POST.
- **Agent vs product:** Agent-safe gating. New write APIs need evidence in the adapter.

---

## 5. Auth, accounts, and per-site profiles

### 5.1 Auth material health on Account settings (no password storage)

- **User problem / motivation:** Many modes; passwords are **not** stored. FA profile cookies vs host-wide `FA_COOKIE_A`/`B` (do not log out the minting browser session). Itaku token, Weasyl/Furbooru API keys, Inkbunny SID + `userId`, SoFurry session cookies, Tailspace password-or-cookie. Silent expiry looks like “site broken.”
- **Proposed behavior:** Per-mode “auth present / missing / last probe failed” on Accounts. Probe using **existing** adapter whoami/session calls only. Never write passwords into `profiles`.
- **Why it fits m-e621 specifically:** Independent accounts are a headline feature. Dual FA auth paths are easy to misconfigure when self-hosting.
- **Affected areas/files:** `src/Settings/` accounts, AccountStore, worker adapters, `serve.py` FA/Tailspace/SoFurry/Itaku proxies.
- **Effort / risk:** M · **Impact:** high
- **Dependencies / blockers:** Do not commit cookies. `TODO:` which adapters already have a session check. Furbooru needs `curl_cffi` + cached `_philomena_key`.
- **Agent vs product:** Agent-safe probes via existing endpoints. Product if any new “login as” flow is invented.

### 5.2 Profile copy already supports favorites/blacklists — extend to saved searches / starred tag groups

- **User problem / motivation:** Saved searches and starred tags sit in named collapsible groups with drag-and-drop reorder. Favorites and blacklists can already be copied between site profiles (merge or replace). Cross-mode copy of groups is the missing personal-workflow piece — with **per-mode query translation**, not blind paste of e621 `order:` into FA.
- **Proposed behavior:** Copy groups with the same merge/replace UX. Run tokens through `unifiedTags`-style maps when the destination is not the same query language. Snackbar dropped tokens.
- **Why it fits m-e621 specifically:** Per-site starred tags/saved searches are part of each mode’s profile. Unified already has translation.
- **Affected areas/files:** Settings copy UI, `siteProfiles.ts`, `unifiedTags.ts`, `defaultSettings.ts` if needed.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Wrong-language paste is worse than no copy. `TODO:` translation coverage (see 1.2).
- **Agent vs product:** Product: refuse copy across incompatible languages vs best-effort remap. Agent after that.

### 5.3 Harden profile mirror sync (live slices ↔ `profiles[activeMode]`)

- **User problem / motivation:** Live `account` / `blacklist` / `favorites` / `searches` / `history` must be copied into `profiles[activeMode]` on save and mode switch. Persisting only the detached copy loses data. Easy for an agent to get wrong when adding a field.
- **Proposed behavior:** Single `syncActiveProfileFromLive()` used by every writer. Unit tests for mode switch. Adding a settings field still requires `configVersion` + `ISettingsServiceState` + `< N` migration.
- **Why it fits m-e621 specifically:** This is the fork’s multi-profile architecture; upstream was single-site.
- **Affected areas/files:** `src/services/siteProfiles.ts`, `state.ts`, `PersistanceService.ts`, `defaultSettings.ts`.
- **Effort / risk:** S · **Impact:** high (data loss prevention)
- **Dependencies / blockers:** Never stringify Pinia proxies in `$subscribe`. Do not rename localforage `material-e621` / `material_e621`.
- **Agent vs product:** **Agent can implement safely** with tests. No product decision.

### 5.4 Host-wide vs profile FA cookies: explicit precedence

- **User problem / motivation:** `serve.py` uses optional host-wide `FA_COOKIE_*`; Account settings can also store profile cookies. Unclear precedence causes “works in Docker, fails in Vite” or the reverse. Logging out the minting browser session kills cookies.
- **Proposed behavior:** Settings copy: profile cookies override host-wide when set; otherwise host-wide. Show which source the last FA request used (without dumping cookie values).
- **Why it fits m-e621 specifically:** FA browsing goes through bundled `faapi` proxy; HTML search is delayed on purpose.
- **Affected areas/files:** `fa_proxy.py`, `serve.py`, Vite FA proxy, Account settings.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Do not log cookie contents. Do not commit `FA_COOKIE_*`.
- **Agent vs product:** Agent-safe if it only documents/displays precedence already in code. Changing precedence is a product decision — `Assumption:` profile should win.

---

## 6. PWA, desktop, and offline behavior

### 6.1 PWA update banner + `controllerchange` Reload (keep)

- **User problem / motivation:** `registerType: 'prompt'`, poll every **ten minutes**, update banner in `App.vue`. Reload needs the `controllerchange` workaround in `misc/serviceWorker/register.ts`. Hash router start URL `/#/posts`. `/api/` denylisted from navigate fallback. `ruffle/**` excluded from precache. Workbox max **4 MiB**.
- **Proposed behavior:** Do not “simplify” SW registration. Optional: show git short hash from `getAppName()` / `VITE_GIT_COMMIT_INFO` on the banner so a personal host knows *which* build arrived.
- **Why it fits m-e621 specifically:** Self-host + `sync`/`deploy.sh` mean the PWA is how the maintainer receives updates. Landing page already shows fork vs upstream commit timelines.
- **Affected areas/files:** `src/misc/serviceWorker/register.ts`, `App.vue`, `vite.config.ts` PWA, `src/misc/util/git.ts`.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Rollup output **iife** is load-bearing for workers/PWA — do not change casually.
- **Agent vs product:** Hash on banner is agent-safe. Changing `registerType` or cache size needs a product decision.

### 6.2 Offline save queue vs API browse (honest offline)

- **User problem / motivation:** Offline queue is for **failed downloads**, retry on startup/connectivity. Browsing remote sites offline cannot work (proxies denylisted). Local folder + already-saved media can.
- **Proposed behavior:** If `navigator.onLine` is false, mode switcher: disable remote modes, keep Local (and already-cached PWA shell). Do not claim Unified is offline-capable.
- **Why it fits m-e621 specifically:** Local is a site mode; Unified is remote-only by design.
- **Affected areas/files:** `src/App/` mode switcher, router guards, offline queue, SW denylist.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Hash router. PWA shell may load while `/api/` fails — that is correct.
- **Agent vs product:** Agent-safe UX gating. Product if anyone wants a full offline Unified cache (likely a bad idea; 4 MiB cap).

### 6.3 Tauri 1 desktop: keep as Local/Firefox bridge, not a second product

- **User problem / motivation:** Tauri bundle id `com.lovelyspacedog.me621`, Vite **8080** in `tauri.conf.json`. `#![windows_subsystem = "windows"]` and `custom-protocol` must stay. Version numbers (`package.json` 0.0.0, Tauri 0.1.0) are not releases.
- **Proposed behavior:** Desktop checklist: Local pick/list/read works; writes still flagged (see 2.1); proxies still hit the same origin as web (Tauri custom protocol vs Vite). No store release engineering.
- **Why it fits m-e621 specifically:** Documented as the Firefox-style Local bridge, not a rewrite of the SPA.
- **Affected areas/files:** `src-tauri/`, `tauri.conf.json`.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** Tauri 1; do not remove `custom-protocol`. AGPL source offer still applies if a build is distributed.
- **Agent vs product:** Agent can fix Local commands. App-store / auto-update = product (probably skip).

### 6.4 Domain migration UI remains optional

- **User problem / motivation:** `VITE_MIGRATE_TO_DOMAIN` / `FROM` mounts `Migration/MigrationPage.vue` instead of `App.vue`. Useful for a personal canonical host (`VITE_CANONICAL_URL`, `M_E621_DOMAIN`).
- **Proposed behavior:** Keep as env-gated. Do not build a generic multi-tenant migrator. If used, migrate localforage **in place** (same DB names).
- **Why it fits m-e621 specifically:** Self-host helpers (`start`, `sync`, `deploy.sh`) already assume one managed instance.
- **Affected areas/files:** `src/main.ts`, `Migration/`, deploy env example (no secrets).
- **Effort / risk:** S · **Impact:** low unless moving domains
- **Dependencies / blockers:** Renaming localforage wipes settings.
- **Agent vs product:** Only touch when actually migrating hosts. Product: whether to run it.

---

## 7. Self-hosting, proxies, and deployment

### 7.1 `serve.py` + Docker as the real multi-site host (not upstream static)

- **User problem / motivation:** Upstream static image is e621-only. This fork needs `serve.py` (dist + proxies + same-origin media + optional managed git pull). Docker defaults: `0.0.0.0:18621`, `M_E621_ROOT=/app/dist`, `M_E621_CONFIG=/data/config`. `.github/workflows/docker.yml` still publishes to GHCR on push — local docs say `docker compose up --build`.
- **Proposed behavior:** README-aligned Docker is source of truth. `TODO:` decide whether GHCR workflow should be disabled/updated (stale vs useful personal registry). `sync` uses `build-only` (skips `vue-tsc`) — keep that for remote RAM, but type-check locally.
- **Why it fits m-e621 specifically:** Nine sites + FA Python deps (`uv` + `requirements.txt`, auto `.venv`) cannot be a static nginx folder.
- **Affected areas/files:** `Dockerfile`, `docker-compose.yml`, `serve.py`, `.github/workflows/docker.yml`, `sync` / `start` / `deploy.sh`.
- **Effort / risk:** S–M · **Impact:** high for the maintainer’s instance
- **Dependencies / blockers:** AGPL network-use source offer for a public host. `EXPEDITION_HOST` / `EXPEDITION_SECRET` mode 600/400. Never commit `deploy.env`.
- **Agent vs product:** Compose/docs alignment is agent-safe. Turning off GHCR publish is a **product decision**.

### 7.2 Proxy allowlists and Furbooru Cloudflare path

- **User problem / motivation:** Host allowlists on `/api/download` and Fluffle are security-sensitive. Furbooru needs `curl_cffi` + cached `_philomena_key` (`.furbooru_philomena_key`, gitignored). Node `fetch` gets HTTP 501 “I'm not a robot.” Vite sets DNS `ipv4first` because Furbooru Cloudflare IPv6 520s from some hosts.
- **Proposed behavior:** Keep Python helper in **both** Vite and `serve.py`. Fail with a snackbar that names Furbooru/Cloudflare rather than a generic 502. Do not switch Furbooru to raw `fetch`.
- **Why it fits m-e621 specifically:** Philomena + CF is a documented fork quirk, not generic proxy work.
- **Affected areas/files:** `furbooru_cf.py`, `vite-*-proxy.ts`, `serve.py`, `vite.config.ts`.
- **Effort / risk:** S · **Impact:** high for Furbooru mode
- **Dependencies / blockers:** ToS/bot rules — stay on the existing CF-aware path. Gitignore the philomena key.
- **Agent vs product:** Agent-safe error UX. New CF bypass techniques = **do not** (ToS/legal).

### 7.3 FA search delay remains mandatory

- **User problem / motivation:** FurAffinity search scrapes HTML and **deliberately waits** between requests. Speeding this up for Unified page size is how you get blocked.
- **Proposed behavior:** Unified FA child should request smaller pages or accept slower merge (see 1.1 isolation). Expose delay as a server constant, not a user “go faster” slider.
- **Why it fits m-e621 specifically:** FA is a Unified child (default on) going through `fa_proxy.py`.
- **Affected areas/files:** `fa_proxy.py`, Unified child page size, FA adapter.
- **Effort / risk:** S · **Impact:** high (account health)
- **Dependencies / blockers:** Site rules. No new scrape surfaces.
- **Agent vs product:** **Do not** let an agent remove the delay. Product: lower Unified FA weight vs keep default-on.

### 7.4 Managed-instance git pull (`VITE_ENABLE_GIT_PULL`)

- **User problem / motivation:** Settings → Info “pull” on managed hosts; `sync` writes `.env.local`. Branch default `master`. Useful for a single-operator box; dangerous if the instance is exposed.
- **Proposed behavior:** Keep env-gated. Require the existing managed-host assumption. Show commit hash after pull. AGPL: pulled source is the offer.
- **Why it fits m-e621 specifically:** Personal `deploy.sh` SSH workflow, not a SaaS.
- **Affected areas/files:** Settings Info, `sync`, `serve.py` optional updates, `.env.local` (untracked).
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** Auth of the pull endpoint — `TODO:` confirm it is not open to the world. Do not add unauthenticated write.
- **Agent vs product:** Hardening auth is agent-safe if a token already exists in `M_E621_CONFIG`. Exposing pull on a public host is a product “don’t.”

### 7.5 `tsconfig.node.json` include list for Vite proxies

- **User problem / motivation:** `tsconfig.node.json` includes `vite-furaffinity-proxy.ts` but not the other `vite-*-proxy.ts` files (imported from `vite.config.ts`). Type-check holes hide proxy bugs that only show in prod `serve.py` drift.
- **Proposed behavior:** Include every `vite-*-proxy.ts`. Prefer shared allowlist constants between Vite proxies and `serve.py` where practical (Python vs TS — `Assumption:` duplication exists; document rather than invent a codegen).
- **Why it fits m-e621 specifically:** Dev proxies are required for multi-site; prod is a different process.
- **Affected areas/files:** `tsconfig.node.json`, `vite-*-proxy.ts`, `vite.config.ts`, `serve.py`.
- **Effort / risk:** S · **Impact:** medium (DX + security reviewability)
- **Dependencies / blockers:** None.
- **Agent vs product:** **Agent can implement safely.**

---

## 8. Performance, accessibility, and reliability

### 8.1 Persistence watcher must stay scheduled `toPlain`

- **User problem / motivation:** `PersistanceService` writes the whole tree to localforage. `JSON.stringify` on reactive proxies inside `$subscribe` retriggers the deep watcher and **freezes the tab**. Snackbar must be stripped before save.
- **Proposed behavior:** No feature work that saves from `$subscribe` inline. Add a regression unit test that the subscriber uses timeout + plain clone. Agents adding fields must not “helpfully” stringify.
- **Why it fits m-e621 specifically:** One giant `useMainStore` (`configVersion` 33) plus profile mirrors is heavier than upstream e621-only state.
- **Affected areas/files:** `PersistanceService.ts`, `state.ts`.
- **Effort / risk:** S · **Impact:** high
- **Dependencies / blockers:** Do not rename the persistence filename or localforage stores.
- **Agent vs product:** **Agent-safe** (test only / comments). Treat as a landmine, not a rewrite.

### 8.2 View transitions: keep first-load skip

- **User problem / motivation:** `router.beforeResolve` must not start a view transition on first load (`!from.name`). Doing so captures an empty shell and Posts looks stuck. Hash router + mode guards make this easy to regress.
- **Proposed behavior:** Guard stays. Test or a commented invariant next to the router hook. Do not add more transitions on Tailspace/pool reader until this is locked.
- **Why it fits m-e621 specifically:** Mode switch + Posts is the main surface.
- **Affected areas/files:** `src/router/index.ts`.
- **Effort / risk:** S · **Impact:** high (first-run UX)
- **Dependencies / blockers:** None.
- **Agent vs product:** **Agent-safe.** Do not “enable transitions everywhere.”

### 8.3 e621 40-tag cap vs Unified blacklist

- **User problem / motivation:** e621 hide-mode blacklist is folded into the 40-tag API cap on **page 1 only**. Unified must not apply that folding to Furbooru/Inkbunny/etc. Client-side origin blacklist (1.4) is the Unified path.
- **Proposed behavior:** Keep `createTagQuery.ts` e621-only. Document in `siteCapabilities` that tag-cap folding is e621-family. If Unified includes e621, fold only the e621 child query, not the shared string.
- **Why it fits m-e621 specifically:** Unified query translation already splits per child.
- **Affected areas/files:** `createTagQuery.ts`, `PostsPage.vue`, `unifiedTags.ts`.
- **Effort / risk:** S–M · **Impact:** high if currently wrong
- **Dependencies / blockers:** `TODO:` verify Unified e621 child already gets a private folded query.
- **Agent vs product:** Agent can fix if tests show leakage. Product: hide vs API-exclude on e621 child.

### 8.4 `debug()` logs only in production — do not “fix” blindly

- **User problem / motivation:** `src/misc/util/debug.ts` only logs when `import.meta.env.PROD`. Inverting it looks like a one-line fix and may dump profile-adjacent noise to a hosted instance.
- **Proposed behavior:** If needed, add `debugDev()` for local, leave prod as-is, or gate on an explicit settings flag. Do not treat `debug()` as a debug-package enable API.
- **Why it fits m-e621 specifically:** Documented gotcha for AI agents.
- **Affected areas/files:** `src/misc/util/debug.ts`.
- **Effort / risk:** S · **Impact:** low (footgun removal)
- **Dependencies / blockers:** Avoid logging cookies/API keys.
- **Agent vs product:** Product before changing prod log volume. Agent may add a *new* named helper.

### 8.5 Keyboard and reduced-motion: fork-specific surfaces only

- **User problem / motivation:** `o` already opens the fullscreen post on its source. Vuetify defaults: `transition: 'no'`, `ripple: false`. Generic “add dark mode / improve a11y” is out of scope (Vuetify MD3 already themed).
- **Proposed behavior:** Ensure `o`, slideshow, card auto-next, pool/Tailspace reader keys, and comments sidebar do not trap focus. Honor `prefers-reduced-motion` for slideshow/auto-next **only** (auto-next is documented). Skip a global a11y rewrite.
- **Why it fits m-e621 specifically:** These are the immersive media features the fork advertises.
- **Affected areas/files:** `src/Post/` fullscreen, `src/Pool/`, `src/Tailspace/`, slideshow/auto-next.
- **Effort / risk:** S–M · **Impact:** medium for the maintainer’s daily reader
- **Dependencies / blockers:** None legal. Do not strip NSFW capability to “fix” content policy.
- **Agent vs product:** Agent-safe for focus/`o`/reduced-motion on existing controls. Broader a11y audit is not this backlog’s job.

### 8.6 FA enrich in `usePostListManager` must stay cancellable

- **User problem / motivation:** Architecture: list manager does pagination, fullscreen, blacklist, **FA enrich**. Combined with FA delay, enrich can pile up in Unified.
- **Proposed behavior:** Cancel in-flight enrich on tag/children/mode change (same reset as 1.6). Capability-skip enrich for non-FA origins.
- **Why it fits m-e621 specifically:** FA music enrichment is a documented FurAffinity feature.
- **Affected areas/files:** `usePostListManager`, FA adapter, Unified merge reset.
- **Effort / risk:** M · **Impact:** medium
- **Dependencies / blockers:** FA rate delay. `TODO:` what enrich currently fetches.
- **Agent vs product:** Agent-safe cancellation. Do not add extra FA round-trips.

---

## 9. Developer experience and AI-agent friendliness

### 9.1 Playwright / CI match npm + Node ≥20

- **User problem / motivation:** `e2e/vue.spec.ts` is leftover Vue scaffold (`h1` “You did it!”). `.github/workflows/playwright.yml` still uses **Node 16 + pnpm**, which `package.json` engines **forbid**. `Assumption:` Playwright CI is not a reliable gate; prefer local `npm run test:unit`.
- **Proposed behavior:** Delete or replace the scaffold spec with a hash-route smoke (`/#/` landing or `/#/posts`) **or** disable the workflow. Do not introduce pnpm. Playwright CI should use npm and Node 20 if kept.
- **Why it fits m-e621 specifically:** Engine block is load-bearing. Docker workflow still publishes GHCR (separate issue, 7.1).
- **Affected areas/files:** `e2e/`, `.github/workflows/playwright.yml`, `package.json` scripts (`test:e2e` uses preview **4173**).
- **Effort / risk:** S · **Impact:** medium (stop lying CI)
- **Dependencies / blockers:** npm only. Do not switch package managers.
- **Agent vs product:** **Needs a product decision:** kill e2e vs maintain one smoke. Agent can implement either once chosen. Until then, do not treat Playwright as a merge gate.

### 9.2 Colocated `*.spec.ts` vs unused `__tests__` ESLint block

- **User problem / motivation:** Tests live next to code as `foo.spec.ts`. ESLint Vitest block only targets unused `src/**/__tests__/*`.
- **Proposed behavior:** Point ESLint Vitest config at `src/**/*.spec.ts`. Add specs for `unifiedMerge`, `postFeedKey`, profile mirrors, `siteCapabilities` (especially fav-toggle false for Inkbunny/Weasyl).
- **Why it fits m-e621 specifically:** Capability matrix and Unified merge are the fork’s regression magnets.
- **Affected areas/files:** `eslint.config.ts`, colocated specs under `src/misc/util/`, `src/services/`.
- **Effort / risk:** S · **Impact:** high for agent safety
- **Dependencies / blockers:** Vitest + jsdom already in stack.
- **Agent vs product:** **Agent can implement safely.**

### 9.3 Site-mode checklist as comments, not a new framework

- **User problem / motivation:** Adding a mode requires: types + `SITE_MODE_URLS` + empty profile + `SiteModeStore` + nav/router guards + worker adapter + Vite/`serve.py` proxy + capability flags. Do not fall through to the e621 client. User-Agent / `_client`: `m-e621/<git>`.
- **Proposed behavior:** Keep this list in `AI_CONTEXT.md` (already). Optionally a `src/worker/api/` README comment. Do not add a plugin system. **No new sites in this backlog unless the maintainer names one** — nine + Local + Unified is enough.
- **Why it fits m-e621 specifically:** Fall-through to e621 is the documented failure mode (SoFurry comments/notes/pools/suggester/analyzer/dashboard).
- **Affected areas/files:** `AI_CONTEXT.md` only unless a comment in `resolveApiBackend` helps.
- **Effort / risk:** S · **Impact:** medium
- **Dependencies / blockers:** ToS/API for any hypothetical tenth site. AGPL for new deps.
- **Agent vs product:** **Product decision required** before any new `SiteMode`. Agents should refuse drive-by sites.

### 9.4 IIFE rollup, hash router, localforage names: “do not clean up”

- **User problem / motivation:** Agents “modernize” to ESM workers, HTML5 history, or rename `material-e621` IndexedDB / `PersistanceService` and wipe user data or break PWA.
- **Proposed behavior:** Explicitly out of scope. If workers must change, prove PWA + Comlink still load. History must stay hash (`/#/posts`).
- **Why it fits m-e621 specifically:** Documented load-bearing quirks.
- **Affected areas/files:** `vite.config.ts`, `src/router/index.ts`, `PersistanceService.ts`.
- **Effort / risk:** L if attempted · **Impact:** negative if done naively
- **Dependencies / blockers:** PWA, Tauri custom-protocol, existing user IndexedDB.
- **Agent vs product:** **Do not implement** without an explicit maintainer order.

### 9.5 Settings field recipe (configVersion 33)

- **User problem / motivation:** New flags (Unified presets, Local write capability, playback per-origin) require `configVersion` bump, `ISettingsServiceState`, and `< N` migration. Skipping migration drops or corrupts profiles.
- **Proposed behavior:** Any backlog item that adds persisted state includes a migration in the same change. Snackbar remains ephemeral.
- **Why it fits m-e621 specifically:** Single persisted tree + profile mirrors.
- **Affected areas/files:** `defaultSettings.ts`, settings types, `PersistanceService.ts`.
- **Effort / risk:** S per field · **Impact:** high (data)
- **Dependencies / blockers:** None.
- **Agent vs product:** **Agent-safe** if the recipe is followed; reviewers should reject settings without migrations.

---

## Top 5 quick wins

Low effort, clear value for *this* repo. Prefer these when an agent has a short session.

1. **Unified merge reset helper + tests** (1.6) — leftover buffers already exist; missing resets duplicate/skip posts. Agent-safe.
2. **Profile mirror sync helper + tests** (5.3) — prevents silent data loss on mode switch. Agent-safe.
3. **Capability-gate Fluffle and `.doc`** (3.3, 3.4) — hide dead actions; no new APIs. Agent-safe.
4. **`tsconfig.node.json` + ESLint Vitest globs** (7.5, 9.2) — make proxies and `*.spec.ts` visible to tools agents actually run. Agent-safe.
5. **Auth-present indicators on Accounts** (5.1, display-only first) — show whether each profile has API key / SID / cookies / token without probing. Agent-safe if no new network calls; probing is M.

Honorable mention: Playwright scaffold/CI either deleted or npm+Node 20 (9.1) — **product choice**, then S.

---

## Top 5 high-impact bets

Larger effort, strategic for the fork’s actual product (multi-site + Local + `serve.py`).

1. **Per-child Unified fetch isolation + metatag translation table** (1.1, 1.2) — makes Unified honest across FA delay, Furbooru CF, and incompatible query languages.
2. **Origin-profile blacklist/favorites on Unified cards** (1.4) — Unified is unusable as a daily driver if it ignores the profiles the rest of the app is built on.
3. **Tauri write path for Local remux / sidecar / save** (2.1) — closes the documented Chromium-vs-desktop gap; Local stops being browse-only on Tauri.
4. **`serve.py`/Docker/proxy error surfaces without widening allowlists** (3.5, 7.1, 7.2) — Firefox/Zen playback and Furbooru/FA are why the Python server exists; this is the production app.
5. **Origin-aware following merge in Unified** (1.3) — only after 1.1/1.2; **product decision required**. Highest “one feed for my accounts” payoff. Still **no Tailspace/Local in Unified**, and **no Inkbunny/Weasyl fav toggles**.

---

## Explicitly out of scope (unless the maintainer overrides)

- Putting **Tailspace** or **Local** in Unified.
- Inkbunny/Weasyl **favorite toggles**.
- Legacy **`.doc`** parsing via proprietary converters.
- Removing FA search **delay**.
- New reverse-image vendors, new site modes, yarn/pnpm, renaming localforage, dropping COOP/COEP, loosening proxy allowlists, or stripping NSFW capability.
- Generic dark mode / “improve UX” / app-store release process.
- Treating Playwright CI or `package.json` `0.0.0` as a product version.
