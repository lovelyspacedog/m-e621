# PawFeed — detailed guide

This document expands on the quick overview in the [main README](./README.md).

## Site modes

Each mode has its own profile for authentication, blacklist, starred tags, saved searches, history, and favorites where supported.

- **e621** — the original Material e621 experience, including pools (with watch), post suggester, favorite analyzer, and an artist dashboard (heatmap, top posts, tag ranks, recent artists).
- **e6ai** — e6ai browsing with mode-aware terminology (pools with watch like e621; post suggester and artist dashboard available).
- **Furbooru** — API-key authentication, tags, view/post comments, favorites, votes, post suggester (logged-in favorites), and **Pools** (`/pools`) for Philomena galleries (name/creator search; shared reader with `?origin=furbooru` in Federated). Tag-based pool search is e621/e6ai only.
- **Inkbunny** — multi-file submission galleries (Save all / Save page), following feed, Flash/SWF playback through Ruffle, post suggester (logged-in favorites), and **Pools** (`/pools`) with watch, open-by-id, and the shared pool reader (`?origin=inkbunny` in Federated). Free-text pool name search is unavailable (Inkbunny has no pools-list API). Multi-file submission galleries stay in the in-post dialog, not `/pools`. Favorite toggling is unavailable.
- **FurAffinity** — browsing and search through the bundled `faapi` proxy, cookie sign-in (optional captcha helper), following feed, enriched music posts, and post suggester (any user). Profile cookies override host-wide `FA_COOKIE_*` when set.
- **Weasyl** — API-key authentication, multimedia audio, `favs:me`, and post suggester. Guest browsing is SFW-only; favorite toggling is unavailable. On by default in Federated.
- **Itaku** — galleries, flattened multi-image posts, comments, stars, following, and post suggester with token authentication. On by default in Federated.
- **SoFurry** — artwork, music, stories, likes (Remix session), following, and post suggester (any user). Stories have a fullscreen text reader.
- **Flayrah** — furry news magazine via public RSS (full feed plus curated taxonomy feeds), in-app article reader, archive fallback for deep links, read/saved state, magazine or list layout, and attributed links back to flayrah.com. Not a Federated child; no login, comments, or ratings. Work-safe news only. Last-good feed cache remains available offline.
- **Tailspace** — posts, saved searches, following, account actions, and a dedicated comic reader with a local **Watched Comics** list (+N new-page badges). Post Suggester and Favorite Analyzer are not available here.
- **Local** — a searchable media library backed by a folder on disk, including post suggester over local favorites.
- **Federated** — a date-merged feed from supported remote children. On the landing site chips, choose Federated to multi-select which children are included (all eight start selected; Local / Tailspace / Flayrah stay unavailable); selection persists when you leave Federated and come back (Defaults / Auth-only presets still apply on demand). The close icon or Federated label returns to the previous site. Switch **Search** vs **Following** (Inkbunny / FurAffinity / Itaku / SoFurry) in the sidebar, apply **Defaults** or **Auth only** site presets, and use origin-aware actions with per-site query translation. Failed children and incompatible metatags surface as snackbars. Post Suggester and Favorite Analyzer merge per-child favorites. **Pools** name browse merges enabled e621/e6ai/Furbooru children into one origin-badged list; the reader stays in Federated via `/pools/:id?origin=e621|e6ai|furbooru|inkbunny`. Inkbunny pools are not free-text searchable (no list API) but appear in **Watched** when the Inkbunny child is enabled, and open from `pool:` chips or by ID. With **Include Tailspace comics** (Account → Federated feed, on by default), name browse also merges Tailspace comics (origin badge; opens the Tailspace comic reader without leaving Federated), and **Watched Pools & Comics** aggregates e621/e6ai/Furbooru/Inkbunny watched pools plus Tailspace watched comics (eye toggle writes to the same per-source lists). Tag search stays e621/e6ai only.

Tailspace posts, Flayrah, and Local are not included in the Federated Posts feed. Tailspace comics can appear in Federated Pools name browse when that setting is on. When the browser is offline, remote gallery modes are disabled; Local and Flayrah (last-good RSS cache) remain available.

## Browsing and media

- Full-width list and thumbnail-grid feeds
- Optional compact cards with controls revealed on hover
- Infinite scroll toggle in Layout (off = previous/next page buttons only)
- Inline video and audio with remembered mute, volume, and playback speed (optional separate audio prefs)
- Feed GIF animate and video autoplay settings; off-screen feed videos unload their buffers
- Fullscreen slideshow and timed card auto-next (`prefers-reduced-motion` pauses both)
- Fullscreen comments rail (resizable) with optional info and description in-rail
- Score, favorites, random (Fisher–Yates), and mode-specific media filters in the Posts toolbar
- History back/forward in the header plus a toolbar history menu
- Collapsible long artist and creator tag lists; collapsible sidebar sections for Federated sites and on-page tags
- Notes in post details and over fullscreen media where supported
- `o` shortcut to open the current fullscreen post on its source site
- Story, PDF, RTF, and DOCX fullscreen previews; legacy `.doc` remains unsupported
- Fluffle reverse-image search for still images (with copy-URL on results)
- Compact sidebar site switcher; origin badge icons in Federated
- **Scent Marks** (`#/scent-marks`) — anonymous public guestbook from the landing page; host operators moderate via a hashed admin password on the VPS (pin and delete)

## Pools and comics

The fork adds dedicated pool routes at `/pools` and `/pools/:id` for **e621**, **e6ai**, **Furbooru**, **Inkbunny**, and **Federated**. In Federated, name browse fans out to enabled e621/e6ai/Furbooru sites into one merged list with origin badges, sorted so sources interleave (defaults to **Updated**; Sort still applies; Furbooru list rows may lack dates until opened). Open a pool with `?origin=e621`, `?origin=e6ai`, `?origin=furbooru`, or `?origin=inkbunny` so IDs never collide (missing origin redirects to `/pools`). Furbooru galleries use Philomena `search/galleries` (title/creator; membership via `gallery_id`); tag-based pool search stays e621-family only. Inkbunny has no pools-list API: Inkbunny mode `/pools` offers **Open pool by ID**, watches, and entry from submission `pool:` chips (multi-file galleries stay in the in-post dialog). Federated **Watched** includes Inkbunny and Furbooru when those children are enabled. Federated **name** browse can also merge Tailspace comics when **Include Tailspace comics** is on (Account → Federated feed; default on): Tailspace rows use origin badges, ignore e621-only filters (series/collection, creator, active), map the name search box into Tailspace search, and open `/tailspace/comic/...` while staying in Federated (back goes to Pools). Tag search does not include Tailspace, Furbooru, or Inkbunny. Browse by name or post tags (native `post_tags_match` on e621-family), sort, category, active/inactive, and creator filters; optionally also match descriptions. Watch pools (with **new page** badges after updates); in Federated with Include Tailspace comics on, the watched section is titled **Watched Pools & Comics** and also lists Tailspace watched comics (+N page badges), with eye toggles writing to the same local Watched Pools / Watched Comics stores as the source sites. Open a gallery or scroll/full-width reader with numbered chunk pagination. Fullscreen next/previous keeps the dialog open (no close/reopen) and continues across chunk boundaries. Hidden/blacklisted pages keep their sequence with placeholders (and a hidden count). **Save chunk** / **Save all** write pages into Local. Deep-link with `?post=` (post details offers **Open at this page**); returning to a pool without a query resumes the last viewed page. Arrow keys / `[` `]` change chunks when fullscreen is closed. Tailspace has a separate comic reader with similar navigation.

## Post Suggester

- Available on every mode except Tailspace and Flayrah
- Builds a taste profile from favorites (any user on e621 / e6ai / FurAffinity / SoFurry; logged-in favorites elsewhere; Local `type:favorited`)
- Hybrid candidates: recent posts plus searches seeded from top favorite tags
- Results ranked by score; already-favorited posts excluded
- Federated merges per-child favorites and ranks across origins

## Favorite Analyzer

- Same mode surface as Post Suggester (everything except Tailspace and Flayrah)
- Ranks tags by frequency in a sample of favorites (320 / 960 / 1920)
- Other users’ public favorites on e621 / e6ai / FurAffinity / SoFurry; own favorites when signed in elsewhere; Local library favorites; Federated per-child merge
- Optional blacklist filter, category chips, copy top tags, JSON export, and a link into Post Suggester
- Uses mode-native favorite queries — never falls through to the e621 API on other sites

## Saved searches, starred tags, and bookmarks

Saved searches and starred tags can be placed into named, collapsible groups. Groups and entries support reordering and drag-and-drop. Favorites, blacklists, and compatible saved searches (e621 ↔ e6ai) can be copied between site profiles using merge or replace.

**Saved** (`/saved`) is a mode-independent bookmark list for federated posts. Bookmark from any supported remote origin and reopen from the nav. The same sidebar **Layout** menu as Posts (full-width, grid, compact cards, auto-next, infinite scroll) applies here.

## Local library

Local mode can:

- Scan a selected folder and search filenames, paths, and tags fuzzily
- Sort by newest, name, size, duration, video, stills, or audio
- Play common image, video, and audio formats
- Track favorites and playback position (portable sidecars `.me621-favorites.json` and `.me621-library.json`)
- Read tags from `.me621-tags.json`
- Use poster images where available
- Remux individual files or every unplayable result in the current filter

Chromium uses the File System Access API for browse and write. The Tauri desktop build can browse and **write under the picked Local browse root** (Save Locally into that folder, remux output, and sidecars). Picking an arbitrary save folder outside that root still needs Chromium's File System Access API.

## Saving and remuxing

**Save Locally** downloads a post using configurable filename tokens (`%artist%`, `%tags 1-5%`, `%ext%`, `%id%`, `%origin%`) with collision suffixes like `name (1).ext`. Folder saves merge post metadata into `.me621-tags.json` and localforage.

After saving, **Open in Local** can reuse the destination as the Local browse root and focus the saved file. Failed network or offline downloads enter an IndexedDB queue and retry at startup or when connectivity returns.

Remuxing uses `@ffmpeg/ffmpeg`. It is available per file and as a cancellable bulk operation for the current Local filter. Remux jobs are not added to the offline queue.

## Self-hosting

Upstream's static image remains suitable for e621-only hosting. This fork includes `serve.py`, which:

- Serves the built `dist/`
- Proxies remote APIs, account actions, comments, and downloads
- Provides same-origin media URLs for Firefox and Zen playback
- Supports optional managed-instance git updates
- Hosts **Scent Marks** (`GET`/`POST` `/api/scent-marks`, `POST /api/scent-marks/auth`, admin `POST /api/scent-marks/:id/pin`, admin `DELETE /api/scent-marks/:id`) with JSON at `~/.config/m-e621/scent_marks.json`; pinned marks sort to the top of the trail
- New scent marks are checked client-side and in `serve.py` against a shared blocklist (`src/Landing/scentMarksBlocklist.json`) for hate, clear illegal/CSAM terms, and spam links — NSFW language is allowed; rejected posts report `Blocked: …` with the matched terms

Admin delete requires a PBKDF2 password hash at `~/.config/m-e621/scent_marks_admin.hash` (mode `600`). Unlock in the UI calls `/api/scent-marks/auth` so a wrong or stale hash fails before delete. Create once on the host (replace `YOUR_PASSWORD`):

```bash
python3 -c "import hashlib,base64,secrets; salt=secrets.token_bytes(16); pw=b'YOUR_PASSWORD'; it=390000; h=hashlib.pbkdf2_hmac('sha256',pw,salt,it); print(f'pbkdf2_sha256\${it}\${base64.b64encode(salt).decode()}\${base64.b64encode(h).decode()}')" > ~/.config/m-e621/scent_marks_admin.hash
chmod 600 ~/.config/m-e621/scent_marks_admin.hash
```

`serve.py` only checks that hash file. If you change the password (or keep a separate reminder file), regenerate the hash — a mismatched hash returns `unauthorized`.
Configuration belongs in `~/.config/m-e621/env` or a gitignored `deploy.env`. See [`deploy.env.example`](../deploy.env.example).

### Development

Requires Node.js 20 or newer and npm. Yarn and pnpm are blocked by `package.json`.

```bash
npm install
npm run dev
```

**Scent Marks** are not fully available under Vite alone — `npm run dev` returns HTTP 501 for `/api/scent-marks*` with a clear message. Use `npm run build` + `python serve.py` (or the Expedition deploy) for the real trail, blocklist, and admin unlock.

Useful commands:

```bash
npm run build
npm run type-check
npm run lint
npm run test:unit
npm run test:e2e
```

The development server includes the required API proxies. Production multi-site hosting needs `serve.py` or this repository's Docker image.

### Run `serve.py`

```bash
npm install
npm run build
export M_E621_ROOT="$(pwd)/dist"
export M_E621_DIR="$(pwd)"
export M_E621_HOST="127.0.0.1"
export M_E621_PORT="18621"
python3 serve.py
```

Open `http://127.0.0.1:18621`.

FurAffinity support requires the Python dependencies:

```bash
uv venv .venv
uv pip install -r requirements.txt
```

`serve.py` finds `.venv` automatically. Optional host-wide FurAffinity authentication uses `FA_COOKIE_A` and `FA_COOKIE_B`. Profile authentication is also available in Account settings. Do not log out of the browser session that supplied the cookies.

Tailspace accepts a password or `tailspace_session` cookie. Itaku accepts an `Authorization: Token …` value. SoFurry accepts email/password or pasted session cookies. Passwords are not stored.

FurAffinity search scrapes its HTML search endpoint and deliberately waits between requests.

Vite sets DNS `ipv4first` for Furbooru Cloudflare IPv6 520s from some hosts. **`serve.py` / Docker do not apply that Node setting** — if Furbooru 520s under Docker, prefer IPv4 at the host resolver or ensure `curl_cffi` is installed in the image (it is, via `requirements.txt`).

### Docker

```bash
docker compose up --build
# http://127.0.0.1:18621
```

Or:

```bash
docker build -t pawfeed .
docker run --rm -p 18621:18621 pawfeed
```

CI also publishes this fork’s image (with `serve.py`, not upstream static) to **GHCR** on push to `main`/`master` as `ghcr.io/<owner>/<repo>:latest` (and sha tags). Prefer compose for local work; pull from GHCR when you want a prebuilt personal registry image.

The container defaults to `M_E621_HOST=0.0.0.0`, `M_E621_PORT=18621`, `M_E621_ROOT=/app/dist`, and `M_E621_CONFIG=/data/config`.

### Tauri desktop

```bash
npm install
cargo install tauri-cli
cd src-tauri
cargo tauri dev
# or: cargo tauri build
```

The bundle identifier is `com.lovelyspacedog.me621`.

### Rename the public hostname

The product name is **PawFeed**. The public URL is [pawfeed.tonypup.box.ca](https://pawfeed.tonypup.box.ca) (Expedition custom app `pawfeed`). Env vars (`M_E621_*`), `~/.config/m-e621/`, the checkout path, Local sidecars (`.me621-*.json`), and the GitHub repo `lovelyspacedog/m-e621` stay unchanged so existing deploys keep working.

To serve the same app under a different subdomain:

1. Pick the new Expedition custom-app name. That label is the DNS host under `tonypup.box.ca` (example: `pawfeed` → `pawfeed.tonypup.box.ca`).
2. Create a reverse-proxied custom app with that name on the same local port (`M_E621_PORT`, default `18621`). Point it at the existing `serve.py` — do not clone a second checkout.
3. On the VPS, set `M_E621_DOMAIN` in `~/.config/m-e621/env` (or gitignored `deploy.env`) to the new host **without** `https://`. Example: `M_E621_DOMAIN=pawfeed.tonypup.box.ca`.
4. Rebuild so Vite picks up the host: `M_E621_FORCE_BUILD=1 ./sync`. That rewrites `.env.local` (`VITE_CANONICAL_URL`, `VITE_APP_DOMAIN`) and regenerates `sitemap.xml`.
5. Confirm `https://<new-host>` loads and that Settings → Info shows the current commit.
6. Update the Live links in `Markdowns/README.md` and this file, add a changelog bullet, and change the verification URL in the Cursor skill (`~/.cursor/skills/m-e621/SKILL.md`).
7. Optional: keep the old custom app on the same port, or turn the old host into a redirect. For a settings-migration interstitial on the old origin, build it with `VITE_MIGRATE_FROM_DOMAIN` / `VITE_MIGRATE_TO_DOMAIN`.
8. Installed PWAs are origin-scoped. Users who added the old host as an app must install again from the new origin.
9. Remove the old custom app only after bookmarks and the old URL have moved.

TLS for `*.tonypup.box.ca` is handled by the Expedition reverse proxy. `serve.py` still binds `127.0.0.1:18621`.

## Settings and appearance

- Settings hub search finds pages and rows across groups (including synonyms like “hotkey” → shortcuts, plus playback, route transitions, git pull, and sanitized backup).
- Appearance includes themes, System/Dark/Light color scheme, navigation density, fullscreen and route transitions (route animations respect reduced motion), an optional paw cursor, and a Prompts subgroup for dismissable banners plus **Reset tooltips** for one-time tip dialogs (Federated mode/Following, Local, Layout, pools, watched comics, fullscreen, Saved posts, blacklist, Tailspace comics, Fluffle, remux, Suggester, Analyzer, Flayrah offline, starred tags — see `Markdowns/TIP_CHECKLIST.md`).
- Account settings use per-site panels with credentials material and last verify/login probe status; Federated feed source and site presets are also editable there.
- Info → Debug can silence main-thread production console diagnostics (workers unchanged).
- Blacklist and History settings show which site profile you are editing.
- Posts settings can set per-site mute/volume/speed overrides (HTML5; SWF unchanged) and insert Save Locally path tokens from chips.
- Data saver controls feed preview quality (fullscreen still uses full-resolution). Automatic mode prefers `connection.type` when present, otherwise Chromium’s `effectiveType` / Save-Data, and falls back to medium when the Network Information API is unavailable.
- Starred-tag / saved-search merge between sites keeps groups by name when possible (Replace still copies the full tree).
- Backup can download a full JSON or a sanitized copy without API keys/cookies; restore and reset ask for confirmation with a preview. Library clear and per-section reset live on Backup and Restore.

## Additional details

- `start`, `sync`, and `deploy.sh` support a reverse-proxied self-host. `sync` uses `flock` on `~/.config/m-e621/sync.lock` (wait up to `M_E621_SYNC_LOCK_TIMEOUT`, default 600s, then one non-blocking retry) so overlapping agent/cron syncs do not stack. The lock is dropped before `start`, and `serve.py` does not inherit that flock FD.
- Parallel agents that cannot safely edit README/changelog write untracked notes under `PENDING_DOCS/` for a later survey (see [`PENDING_DOCS/README.md`](../PENDING_DOCS/README.md)).
- `public/zen-browser.css` provides Zen Browser and Transparent Zen compatibility (including stronger landing hero chip / action button contrast when theme secondary is forced transparent/black, and darkened landing text panels for What it does / Tag Wiki / About).
- The PWA checks for updates every ten minutes and shows an update banner with the git short hash when available.
- The landing page uses site-mode chips, a primary Browse posts action, outlined Scent Marks / Changelog & TOS actions, a capability summary (What it does — Federated Search/Following, chip multi-select, layouts, pools/comics, Suggester/Analyzer/Fluffle, community actions), a random [e621 tag wiki](https://e621.net/wiki_pages/204) first-paragraph snippet under that section each visit (click the tag to search e621 in-app; Another page loads a new tag definition in place), honest About/limits copy (site list, Federated Search/Following + chip selection, AGPL), dual Tony Pup / Avoonix Latest updates commit columns (Show more opens an in-app modal; more on GitHub stays), a Changelog & TOS dialog (Changelog / TOS tabs), and an AGPL/age footer. What it does, Tag Wiki, and About wrap their copy in darkened text panels so they stay readable under Transparent Zen. The TOS tab lists fair-use summaries for supported sites (Tailspace omitted; no public TOS) plus Fluffle, each with a link to the official document. The hero tagline and About copy mention Flayrah news always, and a local folder only when Local browse is available (Chromium File System Access or the Tauri app).
- The app title can show a short commit hash so a self-host knows which build is running.

## Project expectations

PawFeed is an active personal, AI-assisted fork. Features may be experimental, incomplete, or optimized for the maintainer's workflow. It is not affiliated with any supported content site. Users are responsible for following each site's rules, age requirements, and API terms.

A public instance is operable at [pawfeed.tonypup.box.ca](https://pawfeed.tonypup.box.ca). To serve it under a different subdomain, see [Rename the public hostname](#rename-the-public-hostname).

For a stable, e621-only client, use [upstream Material e621](https://github.com/avoonix/material-e621).

## Stack

- Vue 3, Vue Router, Pinia, and Vuetify 3
- Vite and PWA support
- Comlink workers
- `@ffmpeg/ffmpeg` for remuxing
- `@ruffle-rs/ruffle` for Flash/SWF
- `mammoth` for DOCX extraction
- Python's standard HTTP server plus site-specific proxy dependencies

## License

GNU Affero General Public License v3.0. Network use of a modified version requires offering the corresponding source. See [`LICENSE`](../LICENSE).
