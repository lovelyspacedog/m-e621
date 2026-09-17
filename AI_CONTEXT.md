# AI_CONTEXT — PawFeed

Onboarding for other AI agents. Prefer this file plus `README.md` / `README-CONTINUED.md`. `FEATURES.md` is a personal backlog, not a product contract.

## Purpose

**PawFeed** (`package.json` name `pawfeed`, GitHub `lovelyspacedog/m-e621`) is a personal, AI-assisted fork of [Material e621](https://github.com/avoonix/material-e621). It is a Vue 3 SPA that browses multiple furry imageboards and a local media folder from one UI. User-facing branding lives in `src/misc/util/brand.ts` (`APP_NAME`). Host paths, env vars (`M_E621_*`), and Local sidecars stay `m-e621`. Public instance: **https://pawfeed.tonypup.box.ca**.

Supported **site modes** (`SiteMode` in `src/services/types.ts`): `e621`, `e6ai`, `furbooru`, `inkbunny`, `furaffinity`, `weasyl`, `itaku`, `sofurry`, `flayrah`, `tailspace`, `local`, `unified`.

- **Unified** date-merges remote gallery children. **Tailspace, Flayrah, and Local are not Unified children.**
- Flayrah uses dedicated news routes (`/#/flayrah`) backed by RSS — never `getPosts` / e621 fall-through (same dedicated-chrome pattern as Tailspace).
- Each mode has an independent **site profile** (auth, blacklist, starred tags, saved searches, history).
- License: **AGPL-3.0**. Network use of a modified version must offer corresponding source.
- Not affiliated with the sites or upstream. Follow each site’s rules and API terms.

Repos: origin `lovelyspacedog/m-e621`; upstream remote `avoonix/material-e621`. Default branch: `master`.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | Vue 3.5, Vue Router 4 (**hash history**), Pinia 3, Vuetify 3 (MD3 blueprint), Portal Vue, `@unhead/vue` |
| Build | Vite 6, `vite-plugin-vue`, `vite-plugin-vuetify`, `vite-plugin-pwa`, Vue DevTools plugin |
| Language | TypeScript ~5.8 (`vue-tsc` for type-check) |
| Package manager | **npm only**. `package.json` `engines` blocks yarn/pnpm. Node **≥20** |
| Lockfile | `package-lock.json` |
| Workers | Comlink + module workers (`src/worker/services.ts`) |
| Persistence | localforage → IndexedDB (name still `"material-e621"`) |
| Media | `@ffmpeg/ffmpeg` (wasm remux), `@ruffle-rs/ruffle` (SWF), `mammoth` (DOCX) |
| Python proxy | `serve.py` + `faapi`, `curl_cffi` (`requirements.txt`) |
| Desktop | Tauri 1 (`src-tauri/`, Rust 2021, bundle id `com.lovelyspacedog.me621`) |
| Tests | Vitest + jsdom (colocated `*.spec.ts`); Playwright (`e2e/`) |
| Lint/format | ESLint 9 flat (`eslint.config.ts`) + oxlint + Prettier |

Path alias: `@/` → `src/`.

## Directory structure

```
src/main.ts                 # Vue bootstrap, Pinia, router, SW register
src/App.vue                 # Shell: drawer, toolbar, snackbar, PWA banner
src/router/index.ts         # Hash routes + mode guards
src/services/               # Pinia stores, persistence, defaults
src/worker/                 # API workers + per-site adapters
src/Post/                   # Feed, cards, fullscreen, comments, save
src/Pool/                   # e621-family pools + comic reader
src/Tailspace/              # Tailspace-only pages/reader
src/Settings/               # Settings routes
src/App/                    # Nav, logo, mode switcher
src/misc/util/              # Capabilities, proxies, local FS, unified merge
src/misc/plugins/           # Vuetify + Unhead
vite.config.ts              # Dev proxies, PWA, sitemap, git define
vite-*-proxy.ts             # Dev-only site proxies (FA, Tailspace, Weasyl, Itaku, SoFurry, Flayrah)
serve.py                    # Production static server + same-origin proxies
fa_proxy.py / furbooru_cf.py
src-tauri/                  # Desktop shell + Local FS commands
start / sync / deploy.sh    # Self-host + SSH deploy
```

Other notable files:

- `FEATURES.md` — fork backlog / session log.
- `deploy.env.example` — env template. Real values: `~/.config/m-e621/env` or gitignored `deploy.env`.
- `public/zen-browser.css` — Zen / Transparent Zen.
- `public/ffmpeg/` — ffmpeg.wasm assets used under `BASE_URL`.
- `BUG-ANALYSIS.md` — gitignored internal notes; do not recreate unless asked.

## Architecture and data flow

```
UI (Vue pages)
  → Pinia facades (AccountStore, SiteModeStore, …)
  → useMainStore()  // single persisted state tree
  → getApiService() Comlink worker
       ApiService.resolveApiBackend(mode|hostname)
         → e621 / furbooru / inkbunny / furaffinity / weasyl / itaku / sofurry / tailspace adapters
         → same-origin /api/* proxies (Vite in dev, serve.py in prod)
       Unified: prepareUnifiedChildTags + unifiedMerge leftover buffers
  → EnhancedPost[] (__meta.originMode, site-specific blobs)
  → usePostListManager (pagination, fullscreen, blacklist, FA enrich)
```

**Entry points**

- Web: `index.html` → `src/main.ts`. If `VITE_MIGRATE_TO_DOMAIN` is set, mounts `Migration/MigrationPage.vue` instead of `App.vue`.
- Production: `python3 serve.py` serves `dist/` (default port **18621**).
- Desktop: `src-tauri/src/main.rs` (Tauri 1). Dev: Vite on **8080** (`tauri.conf.json`).

**State**

- `useMainStore` (`src/services/state.ts`) is a clone of `defaultSettings` (`configVersion` **41**).
- Domain stores are mostly getters/setters over slices of that tree.
- **Profile mirrors:** live `account` / `blacklist` / `favorites` / `searches` / `history` on main state are copied into `profiles[activeMode]` on save and mode switch (`siteProfiles.ts`). Always sync both; do not persist only the detached copy.
- `PersistanceService` (filename spelling is upstream) writes the whole tree to localforage. **Never `JSON.stringify` reactive proxies inside `$subscribe`** — that retriggers the deep watcher and freezes the tab. Snackbar is stripped before save.

**Posts**

- Canonical post shape is e621-like (`src/worker/api/returnTypes.ts`). Adapters map foreign APIs onto it and stash extras on `EnhancedPost.__meta`.
- Identity in Unified / caches: `postFeedKey` = `` `${originMode}:${id}` `` (`postOrigin.ts`). Comment/notes caches must use this, not raw numeric id.
- UI capability gates: `src/misc/util/siteCapabilities.ts` (votes, faves, comments, notes, hidden buttons). Origin-aware actions: `filterButtonsForPost` / `originModeOf`.
- Local mode does **not** go through `ApiService`; `PostsPage.vue` calls `getLocalPostsPage` (`localMedia.ts`). Chromium File System Access API, or Tauri `pick_local_folder` / `list_local_media` / `read_local_file`.
- Tailspace browsing uses dedicated routes (`/tailspace/...`), not the e621-shaped Posts/Pools/Analyzer/Dashboard pages (Post Suggester is multi-mode but still blocked for Tailspace). Router guards enforce this.

**Proxies**

Dev (`vite.config.ts`) and prod (`serve.py`) both expose same-origin APIs, including `/api/download` (media), e621 votes/favorites/comments, Furbooru, Inkbunny, Fluffle, plus per-site files. Host allowlists are security-sensitive; re-validate redirect hops.

COOP `same-origin` + COEP `credentialless` exist so ffmpeg.wasm can use SharedArrayBuffer **and** so Firefox/Zen can play media via `/api/download` (`mediaProxy.ts`). Do not drop those headers without a replacement plan.

## Commands

```bash
npm install                 # also runs postinstall → generate-pwa-assets
npm run dev                 # Vite; proxies included. Default port 5173
npm run build               # type-check + vite build
npm run build-only          # vite build only (Docker / sync use this)
npm run preview             # vite preview (Playwright CI uses 4173)
npm run type-check
npm run lint                # oxlint then eslint, both --fix
npm run format              # prettier --write src/
npm run test:unit           # vitest
npm run test:e2e            # playwright
```

Self-host:

```bash
npm run build
M_E621_ROOT="$PWD/dist" M_E621_DIR="$PWD" python3 serve.py
# or: docker compose up --build   → http://127.0.0.1:18621
```

FurAffinity / Furbooru Python deps:

```bash
uv venv .venv && uv pip install -r requirements.txt
# serve.py and Vite Furbooru helper prefer .venv/bin/python
```

Tauri:

```bash
cargo install tauri-cli
cd src-tauri && cargo tauri dev    # or: cargo tauri build
```

Deploy helpers: `./deploy.sh` (SSH via `EXPEDITION_HOST` + `EXPEDITION_SECRET`), remote `./sync` (ff-only pull, `npm ci`, `build-only`, restart), `./start` (pidfile under `~/.config/m-e621/`).

## Conventions

- Vue SFCs: `<script setup lang="ts">` is the current style.
- Prettier: `printWidth` 180, double quotes, semicolons, trailing commas, always arrow parens (`.prettierrc.json`).
- ESLint: `@typescript-eslint/consistent-type-imports` is **error**.
- Tests live next to code as `foo.spec.ts`. The ESLint Vitest block only targets `src/**/__tests__/*`, which is unused.
- Commits on this fork follow Conventional Commits (`feat(scope):`, `fix(scope):`, `docs:`).
- Product bias (`FEATURES.md`): “works for me” over general polish. Prefer extending `siteCapabilities.ts` and adapters over special-casing every button in templates.
- Adding a settings field: bump `configVersion` in `defaultSettings.ts` **and** `ISettingsServiceState`, add a `< N` migration in `PersistanceService`.
- Adding a site mode: types + `SITE_MODE_URLS` + empty profile + `SiteModeStore` + nav/router guards + worker adapter + Vite/`serve.py` proxy + capability flags. Do not fall through to the e621 client.
- User-Agent / `_client` query: `PawFeed/<git>` (`src/worker/api/index.ts`). Fluffle UA: `PawFeed/1.0 (by lovelyspacedog on GitHub)`.

## Configuration and external services

Tracked `.env` (safe public Vite values only):

- `VITE_CANONICAL_URL`, `VITE_APP_DOMAIN`, `VITE_GOOGLE_SITE_VERIFICATION_META`

Injected at Vite config time: `VITE_GIT_COMMIT_INFO`, `VITE_GIT_BRANCH` (needs `git`; landing page also reads `upstream/master` or `upstream/main`).

Optional:

- `VITE_ENABLE_GIT_PULL=true` — Settings → Info “pull” on managed hosts (`sync` writes `.env.local`).
- `VITE_MIGRATE_TO_DOMAIN` / `VITE_MIGRATE_FROM_DOMAIN` — domain-migration UI.

Runtime (`serve.py`, Docker, `start`/`sync`):

| Variable | Role | Default |
| --- | --- | --- |
| `M_E621_ROOT` | `dist/` to serve | `~/m-e621/dist` |
| `M_E621_DIR` | app checkout | parent of ROOT |
| `M_E621_CONFIG` | pid/log/token/env | `~/.config/m-e621` |
| `M_E621_HOST` / `M_E621_PORT` | bind | `127.0.0.1` / `18621` (Docker: `0.0.0.0`) |
| `M_E621_DOMAIN` | canonical / `.env.local` | `localhost` |
| `M_E621_BRANCH` | git pull/sync | `master` |
| `M_E621_REPO` | clone URL | origin GitHub |
| `FA_COOKIE_A` / `FA_COOKIE_B` | host-wide FA session | unset |
| `EXPEDITION_HOST` / `EXPEDITION_SECRET` | `deploy.sh` SSH | required for deploy |
| `M_E621_FORCE_BUILD` / `M_E621_FORCE_RESTART` / `M_E621_NO_RESTART` | sync/start | `0` |

Load order: process env wins; then `~/.config/m-e621/env`, then `deploy.env` (`load-m-e621-env.sh` / `serve.py`). **Do not commit real cookies or `deploy.env`.** Secret file for sshpass must be mode 600/400.

**Auth (passwords are not stored in profiles):**

- e621 / e6ai: username + API key (HTTP Basic via proxy).
- Furbooru / Weasyl: API key.
- Itaku: `Authorization: Token …`.
- Inkbunny: SID login; `userId` kept on the profile.
- FurAffinity: `a=…;b=…` cookies on the profile, or host-wide `FA_COOKIE_*`. Do not log out the browser session that minted the cookies.
- SoFurry: email/password or pasted cookies (session only).
- Tailspace: password or `tailspace_session` cookie.

**External APIs / hosts:** e621.net, e6ai.net, furbooru.org (Philomena; Cloudflare bot challenge via `furbooru_cf.py`), inkbunny.net, furaffinity.net, weasyl.com, itaku.ee, sofurry.com, flayrah.com (`rss-full.xml`), tailspace.com, [Fluffle](https://api.fluffle.xyz/exact-search-by-file) reverse-image (stills only; max 4 MiB).

PWA: `registerType: 'prompt'`, update poll every 10 minutes, Workbox max cache **4 MiB**, `ruffle/**` excluded from precache, `/api/` denylisted from navigate fallback. Start URL `/#/posts`.

## Quirks and gotchas

- **Hash router.** Real paths are `/#/posts`, `/#/settings`, etc. Landing is `/#/`.
- **Rollup output format is `iife`** (`vite.config.ts` `build.rollupOptions`). Changing this can break workers/PWA; treat as load-bearing until proven otherwise.
- **localforage DB name is still `material-e621` / store `material_e621`.** Renaming wipes user settings. Filename `PersistanceService.ts` is misspelled on purpose relative to “persistence”.
- **DNS `ipv4first`** in Vite: Furbooru’s Cloudflare IPv6 path 520s from some hosts.
- **Furbooru** needs `curl_cffi` + cached `_philomena_key` (`.furbooru_philomena_key`, gitignored). Node `fetch` gets HTTP 501 “I'm not a robot”.
- **FA search** scrapes HTML and **deliberately delays** between requests (`fa_proxy.py`).
- **Weasyl guests are SFW-only.** Inkbunny and Weasyl have **no public fav-toggle API** — keep the favorite button hidden (`modeSupportsFavoriteToggle`).
- **SoFurry / Flayrah / other non-e621 modes must not fall through to e621 comments, notes, pools, or dashboard.** Post Suggester and Favorite Analyzer are allowed outside Tailspace and Flayrah via `modeSupportsSuggester` / `modeSupportsFavoriteAnalyzer` (`isDedicatedChromeMode`), using mode-native favorite queries — never the e621 client.
- **Flayrah** is read-only RSS news chrome (`/#/flayrah`); proxy is `GET /api/flayrah/rss` only.
- **Unified merge** keeps sticky per-child leftovers (`unifiedMerge.ts`). Sequential pages reuse discarded posts; tag/children changes must reset state. Page jumps use legacy merge then reseed.
- **Unified tag translation** (`unifiedTags.ts`) strips/remaps metatags per child (`order:`, `favs:me` → `my:faves` / `stars:me`, etc.) and may snackbar ignored tokens.
- **e621 hide-mode blacklist** is folded into the **40-tag API cap** on page 1 only (`createTagQuery.ts` / `PostsPage.vue`). Other modes do not use that path.
- **View transitions / router-view:** `router.beforeResolve` must not start a transition on first load (`!from.name`). Doing so captures an empty shell and Posts looks stuck. Skip VT when leaving `LandingPage`. `LandingPage` must keep a **single root** element — multi-root fragments never finish `<Transition mode="out-in">` leave and blank `v-main` (Scent Marks / Browse posts).
- **`debug()` in `src/misc/util/debug.ts` only logs in production** (`if (!import.meta.env.PROD) return`). Do not treat it as a debug-package enable/disable API.
- **Local writes** (remux, `.me621-tags.json` sidecar, save-into-folder) still need Chromium FSA. Tauri is read/browse only. Remux is **not** added to the offline save queue (ffmpeg core may need network on first load).
- **Sidecar:** folder saves merge tags into `.me621-tags.json` with serialized writes so bulk save does not clobber.
- **Story preview:** RTF + DOCX yes; legacy `.doc` remains blocked.
- **Vuetify defaults:** global `transition: 'no'`, `ripple: false`; `VBtn` variant `text`.
- **PWA Reload** needs the `controllerchange` workaround in `misc/serviceWorker/register.ts`.
- **`.github/workflows/docker.yml`** publishes the fork Docker image (`serve.py` runtime) to GHCR on push to main/master (`latest` + sha). Local docs still prefer `docker compose up --build`; GHCR is the optional personal registry (FEATURES 7.1 — **keep**).
- **e2e:** hash-route Playwright smoke; CI uses npm + Node 20. Prefer local `npm run test:unit` as the merge gate.
- **`tsconfig.node.json` `include`** covers `vite-*-proxy.ts`.
- Default Unified children (`defaultUnifiedSites`): all remote children on (including Weasyl and Itaku); Tailspace/Local are never children.
- `getAppName()` appends a short git hash when `VITE_GIT_COMMIT_INFO` parsed successfully.
- Fork vs upstream commit URLs use author matching `tony pup` / `lovelyspacedog` (`src/misc/util/git.ts`).
- Docker/sync skip `vue-tsc` (`build-only`).
- `package.json` `version` is `0.0.0`; Tauri package is `0.1.0`. Not used as a release number.

## Do not change / must preserve

- **AGPL-3.0** notices and source-offer obligation for hosted copies.
- **localforage** database/store names (user data).
- **`custom-protocol` Tauri feature** — comment in `Cargo.toml` says DO NOT REMOVE.
- **`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`** in `src-tauri/src/main.rs`.
- Bundle id **`com.lovelyspacedog.me621`** (already rebranded away from `com.avoonix.me621`).
- Proxy **host allowlists** and redirect re-validation on `/api/download` and Fluffle.
- **COOP/COEP** headers in Vite and `serve.py`.
- **Mode ↔ route guards** in `router/index.ts`.
- **`postFeedKey` / origin-aware caches and buttons** on Unified.
- **Capability matrix** as the source of truth for hiding e621-only tools.
- **Profile mirror sync** before persistence; snackbar must stay ephemeral.
- Persistence **`$subscribe` scheduling** (timeout + `toPlain`); do not stringify Pinia proxies inline.
- **View-transition first-load skip.**
- Do not add **Inkbunny/Weasyl favorite toggles** without a real public API.
- Do not put Tailspace or Local into `UNIFIED_CHILD_MODES` without an explicit product change.
- Do not commit `FA_COOKIE_*`, API keys, `deploy.env`, or `~/.config/m-e621/*`.
- Do not switch the package manager to yarn/pnpm.
- Do not “fix” screenshot/content policy by stripping NSFW capability; this is an adult imageboard client. Keep existing age/ToS language in the README.
- Prefer not to drive-by rename `PersistanceService` or reshape the giant `main` store.

When unsure, mark follow-ups as `TODO` in the PR/commit rather than inventing APIs. Upstream Material e621 remains the reference for e621-only behavior; this fork’s extras live in workers, proxies, and `siteCapabilities.ts`.
