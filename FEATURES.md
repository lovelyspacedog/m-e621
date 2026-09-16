# m-e621 feature backlog

Personal fork priorities. Prefer “works for me” over general polish. Check items off as they land.

## Parity (finish what we started)

- [x] **SoFurry cleanup** — hide Pools / Suggester / Analyzer / Dashboard; gate comments/notes (no e621 fallthrough); strip `order:` from browse query; client random
- [ ] **Favorite toggles** — Inkbunny + Weasyl: **blocked** (no documented public fav-toggle API). Favorite button hidden for both instead.
- [x] **Itaku comments** — list via `GET …/galleries/images/:id/comments/`; create via `POST …/comment/` (token); UI enabled in Details/Fullscreen
- [x] **Mode-correct filters** — Weasyl / Itaku / SoFurry sort lists (rating filter hidden where tags aren’t mapped)
- [x] **Capability matrix** — `src/misc/util/siteCapabilities.ts` drives button hide, votes/notes UI, e621-family nav; Weasyl/Inkbunny fave hide; SoFurry score/favs sort disable

## Deeper site surfaces

- [x] **Live following feeds** for FA / Inkbunny — `following:me`/`watch:me` → Inkbunny unread API; FA scrapes `/msg/submissions/`; Account “Following” saved searches; Unified keeps the metatag
- [x] **Tailspace tag search + saved searches** — client-side title/artist/tag filter with page scan (`?tags=`); sidebar saved searches route to `TailspacePosts` (posts API has no server tag search; Unified child still out)
- [x] **SoFurry story UX** — fullscreen/details reader with title + full `.txt` body; likes via `POST /api/submission-like/:id` + `isLiked`; `watch:me` → feed; login auto-adds Following/My Likes
- [x] **Inkbunny multi-file / pools** — multi-file viewer already; `pool:N` browse defaults to `orderby=pool_order`; pool chips show API names after enrich

## Local & media tools

- [x] **Firefox Local** via Tauri — pick/list/read FS bridge (`pick_local_folder` / `list_local_media` / `read_local_file`); Local mode enabled in Tauri shell
  - [ ] Tauri writes still missing (remux / on-disk sidecar / Save-into-folder) — Chromium FSA keeps those
- [x] **Bulk remux** — Local toolbar “Remux unplayable” (current tag filter); sequential ffmpeg.wasm; cancel mid-run
- [x] **Fluffle reverse image search** — still-image Fluffle button on post cards / details (no MD5→e621 fallback)
- [x] **Save Locally → open in Local** — snackbar “Open in Local” (or auto via Post settings) reuses save folder as browse root and focuses the file
- [x] Sidecar tags / more formats (audio, archives) if that library use case matters
  - [x] **Save Locally → `.me621-tags.json`** — folder saves merge post tags into the sidecar (+ localforage) for Local search
  - [x] **Local audio** — index `flac/mp3/m4a/ogg/opus/wav` as `type:audio`; card + fullscreen players; toolbar Audio filter
  - [x] **Remote audio UX** — cover + inline `<audio>` on cards; proxy audio like video; FA music feed enrich; Weasyl multimedia; Inkbunny/SoFurry `type:audio`; Audio toolbar on music-capable modes
  - [x] **RTF / DOCX story preview** — fullscreen fetches `.rtf` / `.docx` (mammoth) to plain text; legacy `.doc` still blocked
  - [ ] Archives in the Local index (zip/rar still skipped)

## Unified feed

- [x] **Fairer merge** — sticky per-child leftovers (`unifiedMerge.ts`); sequential pages keep discarded posts; jumps use legacy + reseed
- [x] **Per-site tag translation** — `prepareUnifiedChildTags` strips/remaps metatags per child (`order:`, `favs:me`→`my:faves`, ratings, `species:`→bare, etc.)
- [x] **Origin-aware actions on Unified cards** — `filterButtonsForPost`; fullscreen comments match Details; comment/notes cache keyed by `postFeedKey`

## Self-host / ship

- [x] **Docker image that wraps `serve.py`** — npm build stage + Python runtime with proxies (`Dockerfile`, `docker-compose.yml`)
- [x] Align Dockerfile with **npm** (pnpm removed from image build)
- [x] Tauri: Local FS bridge (read/browse)
  - [x] Rebrand bundle id away from `com.avoonix.me621` → `com.lovelyspacedog.me621`
  - [ ] Updater + Local write bridge (remux/sidecar/save folder)

## Quick wins / fun

- [x] Cross-mode starred-tag / blacklist sync — one-shot Merge/Replace from another site into the active mode (Account + Favorites/Blacklist pages)
- [x] Keyboard-driven Unified origin jump (“open on source site”) — fullscreen `o` → `fullscreen_open_source`
- [x] Offline save queue — Save Locally queues on offline/network failure; flushes on `online` / startup (remux still not queued)
- [x] Comic-style reader for e621 pools — gallery/scroll/full-width + Tailspace-style numbered chunk pager / range label

---

## Session log

### 2026-09-15 — Parity slice 1

- Added this backlog file.
- SoFurry: nav hide for e621-only tools; comments/notes gated; API no longer falls through to e621 comments; strip `order:` from browse `q`; client random; toolbar score/favs disabled.
- Tag “Search on …” for Weasyl / Itaku / SoFurry.
- Sort filters: Weasyl / Itaku / SoFurry subsets; hide unmapped rating filters.
- Weasyl: hide favorite button; client-side `order:random`.
- Capability helpers in `src/misc/util/siteCapabilities.ts`; wired into `SiteModeStore`, nav, `TagActions`, `PostInfoList`.

### 2026-09-15 — Unified origin-aware slice

- `filterButtonsForPost` (origin mode + FA journal) on Post / Fullscreen / Details cards.
- Fullscreen comments use `postSupportsComments` (Weasyl/Itaku/SoFurry/Inkbunny no longer show composer).
- Comment + notes caches keyed by `postFeedKey` to avoid cross-site id collisions.
- Removed `unified` from `modeSupportsFavoriteToggle` (favorites gated per origin).

### 2026-09-15 — Unified fairer merge

- Sticky per-child leftovers in worker (`unifiedMerge.ts` + `ApiService.getUnifiedPosts`).
- Sequential pages keep discarded posts; tag/children change resets; page jumps use legacy merge then reseed cursors.
- `loadNextPage` dedupes by `postFeedKey` (same as previous page).

### 2026-09-15 — Unified tag translation

- `prepareUnifiedChildTags` (`unifiedTags.ts`) remaps/strips metatags per child before fetch.
- Examples: `favs:me`→`my:faves` (Furbooru), `stars:me` (Itaku), unwrap `species:`/`character:`, drop foreign `order:`/`rating:`/`following:me`.
- Soft snackbar warnings listing ignored tokens (once per page-1 / legacy fetch).

### 2026-09-15 — Docker / npm self-host

- `Dockerfile`: Node 20 `npm ci` + `build-only` → Python 3.12 `serve.py` (faapi/curl_cffi, FA/Furbooru helpers).
- `docker-compose.yml` builds locally on `:18621` (no upstream GHCR static image).
- README Docker section updated; `.dockerignore` expanded.

### 2026-09-15 — Tailspace search + saved searches

- Posts `?tags=` client filter (title/artist/tag AND); scans up to 20 upstream pages for ~24 matches.
- Tag chips in post dialog apply the same filter; saved-search sidebar works in Tailspace → `TailspacePosts`.
- Note: Tailspace `get-browse-posts-paginated` only accepts `page` — no server-side tag API.

### 2026-09-15 — FA / Inkbunny following feeds

- Inkbunny: `following:me` / `watch:me` → `unread_submissions`; Account “Following” saved search.
- FurAffinity: `following:me` scrapes `/msg/submissions/` (vite proxy + `fa_proxy.py`); Account “Following” saved search.
- Unified keeps `following:me` for FA/Inkbunny children.

### 2026-09-15 — SoFurry story + likes

- Stories always hydrate full `.txt` into description; fullscreen shows Soft title + blurb; details uses `<pre>` reader.
- Likes pinned to `POST /api/submission-like/:id` (toggle); `isLiked` / like count mapped on adapt; UI rolls back when write fails.
- Soft `watch:me` routes to following feed; login auto-adds Following + My Likes saved searches.

### 2026-09-15 — Inkbunny pool order + names

- `pool:N` search defaults to `orderby=pool_order` (overridable via `order:*`).
- Details meta keeps pool `{ id, name }`; PostInfo / IB dialog show names beside `pool:N` chips.
- Multi-file viewer left as-is (`InkbunnySubmissionDialog`).

### 2026-09-15 — Open on source shortcut

- New action `fullscreen_open_source` (default `o`) opens the current fullscreen / IB post on its origin site.
- Shared helper `openPostOnSourceSite`; wired in Fullscreen + Inkbunny dialogs.

### 2026-09-15 — Cross-mode star / blacklist sync

- `copyProfileLists` merges or replaces favorites/blacklist between site profiles.
- UI on Account settings (both), Favorites page, and Blacklist settings.

### 2026-09-15 — Save Locally → Open in Local

- Snackbar action after folder saves; optional “Open in Local after save” in Post settings.
- Reuses Save Locally directory handle as Local browse root and focuses the saved path.

### 2026-09-15 — Drop MD5 → e621 lookup

- Removed `md5Lookup.ts` / spark-md5; Fluffle reverse image search remains for stills.
- Details hash row is display-only again (no compute / e621 open).

### 2026-09-15 — Bulk remux unplayable

- `remuxUnplayableLocal` walks Local index (honors tag filter), remuxes sequentially via existing ffmpeg.wasm path.
- Local toolbar “Remux unplayable” / Cancel; snackbar progress; reloads browse when anything succeeded.

### 2026-09-15 — Pool comic pager parity

- PoolReader chunk controls match Tailspace: numbered buttons with ellipsis + `first–last / total` range.

### 2026-09-15 — Save Locally writes sidecar tags

- After a directory-handle save, post tags merge into `.me621-tags.json` (+ localforage folder bucket).
- Serialized writes so bulk Save Locally doesn’t clobber the sidecar; in-memory Local index updates when save folder ≡ browse root.

### 2026-09-15 — Tauri rebrand

- Bundle identifier `com.lovelyspacedog.me621`; Cargo package `me621` (was upstream `com.avoonix.me621` / `app`).
- Local FS bridge + updater still open.

### 2026-09-15 — Offline save queue

- `offlineSaveQueue.ts`: IDB queue on offline / Failed-to-fetch; flush on `online` + App mount.
- Remux intentionally not queued (ffmpeg core still needs network on first load).

### 2026-09-15 — Local audio

- Index flac/mp3/m4a/ogg/opus/wav as `type:audio`; card + fullscreen `<audio>` players; Local toolbar Audio filter.
- Archives still out of scope.

### 2026-09-15 — Remote audio UX

- Shared cover + inline `<audio>` cards; audio proxied like video under COEP.
- FA: music listings keep cover on preview/sample; feed enrich gets real `file_url`; `type:audio` search → music-only.
- Weasyl: multimedia/audio exts keep `file.url` via `/api/download`; client `type:audio` filter.
- Inkbunny: types 10/11 + m4a/opus; `type:audio` → API `type=10,11`.
- SoFurry: music-aware adapt + `type:audio` tag; strip metatag from Soft query.
- Audio toolbar on FA / Inkbunny / Weasyl / SoFurry / Unified (+ Local).

### 2026-09-15 — Tauri Local FS (read)

- Rust commands: `pick_local_folder`, `list_local_media`, `read_local_file` (path-scoped).
- Frontend `tauriLocalFs.ts` + Local scan/blob path when FSA is missing; SiteMode Local enabled in Tauri.
- Remux / on-disk sidecar write still Chromium-only.

### 2026-09-15 — Itaku comments

- Proxied `GET /api/itaku/images/:id/comments` + `POST /api/itaku/images/:id/comment`.
- `itaku.getComments` / `createComment`; `modeSupportsComments` includes Itaku; replies flattened one level.

### 2026-09-15 — RTF story preview

- Fullscreen document loader fetches `.rtf` (and rtf-magic / `content-type: rtf`) via existing proxy path.
- `rtfToText` strips control words / destination groups to plain text for the story `<pre>` reader.
- `.doc` remains blocked with the previous unsupported-format message.

### 2026-09-15 — DOCX story preview

- `docxToText` + mammoth (`extractRawText`) for fullscreen `.docx` / OOXML content-types.
- Document classification includes `docx` (cards + FA scrape `typeFromFile`); legacy `.doc` still blocked.
- Mislabelled binary payloads re-fetched and sniffed via ZIP/`word/` magic before giving up.
