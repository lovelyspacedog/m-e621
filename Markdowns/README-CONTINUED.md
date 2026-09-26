# PawDeck — detailed guide

This document expands on the quick overview in the [main README](./README.md) (pitch, short highlights, capability table). Use that page to decide whether PawDeck fits; use this page for how each mode and host path works.

## Site modes

Each mode has its own profile for authentication, blacklist, starred tags, saved searches, history, and favorites where supported.

- **e621** — the original Material e621 experience, including pools (with watch), post suggester, favorite analyzer, and an artist dashboard (heatmap, top posts, tag ranks, recent artists).
- **e6ai** — e6ai browsing with mode-aware terminology (pools with watch like e621; post suggester and artist dashboard available).
- **Furbooru** — API-key authentication, tags, view/post comments, favorites, votes, post suggester (logged-in favorites), and **Pools** (`/pools`) for Philomena galleries (name/creator search; shared reader with `?origin=furbooru` in Federated). Tag-based pool search is e621/e6ai only.
- **Inkbunny** — multi-file submission galleries (Save all / Save page), following feed, Flash/SWF playback through Ruffle, post suggester (logged-in favorites), and **Pools** (`/pools`) with watch, open-by-id, and the shared pool reader (`?origin=inkbunny` in Federated). Free-text pool name search is unavailable (Inkbunny has no pools-list API). Multi-file submission galleries stay in the in-post dialog, not `/pools`. Favorite toggling is unavailable.
- **FurAffinity** — browsing and search through the bundled `faapi` proxy, cookie sign-in (optional captcha helper), following feed, enriched music posts, post suggester (any user), and comments on submissions **and journals**. Profile cookies override host-wide `FA_COOKIE_*` when set.
- **Weasyl** — API-key authentication, multimedia audio, `favs:me`, and post suggester. Guest browsing is SFW-only; favorite toggling is unavailable. View comments via HTML scrape; posting comments needs optional session cookies (Account settings) alongside the API key. On by default in Federated.
- **Itaku** — galleries, flattened multi-image posts, comments, stars, following, and post suggester with token authentication. On by default in Federated.
- **SoFurry** — artwork, music, stories, likes (Remix session), following, and post suggester (any user). Stories have a fullscreen text reader. Artwork posts support view/post comments in the shared rail (stories and music excluded).
- **Video** (optional) — adult video hub for Murrtube and Badpups. Enable **Video mode** in Post settings (off by default). Appears in the site picker only when Video mode is on and **SFW only** is off; turning SFW on or Video off demotes Video to e621. Not a Federated child; no Saved bookmarks, login, or favorites in v1. Use **Sites in this search** (or landing chips while Video is active) to include Murrtube and/or Badpups; both default on and date-merge. Murrtube uses an age-gated Inertia proxy (`/api/murrtube`); Badpups uses HTML/JSON-LD plus Bunny CDN MP4 via `/api/badpups` and `/api/download`. Feed cards size to each video’s thumbnail aspect ratio (landscape stays landscape). The site chip shows uploader · title when known (truncated). Cards show artist/uploader chips and general/category tags (Murrtube tags arrive as detail pages enrich in the background; Badpups categories come from the listing). Overview favors title, duration, views/likes, uploader, and format over fake MD5/dimensions. Layout → Autoplay video is Video-only and independent of Media → Autoplay video in feed.
- **News** — merged furry news from Flayrah, Dogpatch Press, InFurNation, and Furry Writers’ Guild via public RSS (Flayrah taxonomy feeds when Flayrah is selected; Dogpatch category feeds when Dogpatch is selected; Load older walks WordPress-paged sources — Flayrah’s public RSS is not paged), plus optional **custom https RSS/Atom feeds** you paste in-browser (up to eight; stored in settings; PawDeck’s server fetches the URL and article page under public-HTTPS / SSRF limits; chips on the feed; merged into All sources on page 1 only). In-app article reader with text size / column width and click-to-enlarge images, day-grouped feed, archive fallback for deep links, read/saved state with body snapshots, magazine or list layout, source filter chips, same-story “also on…” clustering on All sources, local watched authors, optional highlight-new since last visit, saved filters that remember source/section/view, mark unread / mark filtered read, `author:` / `tag:` / `source:` filters, keyboard focus that stays on screen, Go to top, and attributed links back to each origin. Each source has a short per-request timeout so a dead outlet fails fast and the merged feed still shows the others. Not a Federated child; no login, comments, or ratings. Flayrah is work-safe oriented; Dogpatch may include adult or investigative topics (SFW only is hidden in News — it does not filter that feed). Last-good feed cache remains available offline. A first-visit tip covers sources and attribution.
- **Tailspace** — posts, saved searches, following, account actions, and a dedicated comic reader with a local **Watched Comics** list (+N new-page badges). Post Suggester and Favorite Analyzer are not available here.
- **u18chan** — dedicated Indices catalogs (Furries, Comics, Gay Furries, Gay Furry Comics, Intersex, Animated, Ponies, Feral; optional Gore via Settings → Include u18chan Gore, off by default). Cub Index is not available. Sidebar **Watched** lists local thread watches with +N when replies arrive since last open (eye toggle on catalog cards and thread header). Open a catalog thread for OP + replies with Tailspace-like compose (guest name / tripcode / deletion password). Threads offer **Thread / Gallery / Scroll**: Gallery and Scroll show the leading image dump (consecutive same-name-as-OP image posts until another poster — u18chan is one file per post, so dumps are reply chains, not multi-image OPs); comics boards (`/c/`, `/gc/`) with more than one dump page default to Gallery. Not a Federated child; no Suggester / Analyzer / Saved posts.
- **Local** — a searchable media library backed by a folder on disk, including post suggester over local favorites.
- **Federated** — a date-merged feed from supported remote children. On the landing site chips, choose Federated to multi-select which children are included (all eight start selected; Local / Tailspace / News / Video / u18chan stay unavailable); selection persists when you leave Federated and come back (Defaults / Auth-only presets still apply on demand). The close icon or Federated label returns to the previous site. Opening the landing page does not restore Federated as the selected mode (it restores the site you used before Federated, or e621); Federated stays selected on landing only when you navigate back from Browse posts. Switch **Search** vs **Following** (Inkbunny / FurAffinity / Itaku / SoFurry) in the sidebar, apply **Defaults** or **Auth only** site presets, and use origin-aware actions with per-site query translation. Cross-site duplicates (same md5, shared source URL, or matching size+dimensions+artist) collapse to the highest-score card with other origins as chips; later pages skip already-seen matches. Failed children and incompatible metatags surface as snackbars. Post Suggester and Favorite Analyzer merge per-child favorites. **Pools** name browse merges enabled e621/e6ai/Furbooru children into one origin-badged list; the reader stays in Federated via `/pools/:id?origin=e621|e6ai|furbooru|inkbunny`. Inkbunny pools are not free-text searchable (no list API) but appear in **Watched** when the Inkbunny child is enabled, and open from `pool:` chips or by ID. On Federated Pools, the sidebar **Sites in Pools** toggles (between Pools and Post Suggester) control e621/e6ai/Furbooru/Inkbunny inclusion plus **Tailspace comics** (on by default): name browse merges Tailspace comics (origin badge and cover thumbs via `/api/download`; opens the Tailspace comic reader without leaving Federated), and **Watched Pools & Comics** aggregates e621/e6ai/Furbooru/Inkbunny watched pools plus Tailspace watched comics (eye toggle writes to the same per-source lists). Tag search stays e621/e6ai only.

Tailspace posts, News, Local, Video (Murrtube / Badpups), and u18chan are not included in the Federated Posts feed. Tailspace comics can appear in Federated Pools name browse when **Sites in Pools → Tailspace comics** is on. When the browser is offline, remote gallery modes are disabled; Local and News (last-good RSS cache) remain available.

## Browsing and media

- Full-width list and thumbnail-grid feeds
- Optional compact cards with controls revealed on hover
- Infinite scroll toggle in Layout (off = previous/next page buttons only)
- Floating **Go to top** on the Posts search feed after you scroll (list and grid); bottom-right so it clears the floating sidebar; respects reduced motion and mobile safe areas
- Inline video and audio with remembered mute, volume, and playback speed (optional separate audio prefs)
- Feed GIF animate and video autoplay settings; off-screen feed videos unload their buffers
- Fullscreen slideshow and timed card auto-next (`prefers-reduced-motion` pauses both)
- Fullscreen comments rail (resizable) with optional info and description in-rail
- Score, favorites, random (Fisher–Yates), and mode-specific media filters in the Posts toolbar — behind a ⋮ menu by default so Tags keeps room; Post settings can expand them to icon-only buttons on wide screens
- On music-capable modes (FurAffinity, Inkbunny, Weasyl, SoFurry, Local, Federated), a **Queue** toolbar action opens the first audio hit in fullscreen and advances only through audio until fullscreen closes
- History back/forward in the header plus a toolbar history menu
- Collapsible long artist and creator tag lists; collapsible sidebar sections for Federated sites and on-page tags
- Notes in post details and over fullscreen media where supported
- `o` shortcut to open the current fullscreen post on its source site
- Story, PDF, RTF, and DOCX fullscreen previews; legacy `.doc` remains unsupported
- Fluffle reverse-image search for still images (with copy-URL on results)
- Compact sidebar site switcher with SFW under Site; light dividers between saved searches, nav links, and on-page tags; origin badge icons in Federated
- **Scent Marks** (`#/scent-marks`) — anonymous public guestbook from the landing page; host operators moderate via a hashed admin password on the VPS (pin and delete)

## Pools and comics

The fork adds dedicated pool routes at `/pools` and `/pools/:id` for **e621**, **e6ai**, **Furbooru**, **Inkbunny**, and **Federated**. In Federated, name browse fans out to enabled e621/e6ai/Furbooru sites into one merged list with origin badges, sorted so sources interleave (defaults to **Updated**; Sort still applies; Furbooru list rows omit dates/page counts until a gallery is opened — Philomena gallery JSON has no timestamps or `image_count`). Open a pool with `?origin=e621`, `?origin=e6ai`, `?origin=furbooru`, or `?origin=inkbunny` so IDs never collide (missing origin redirects to `/pools`). Furbooru galleries use Philomena `search/galleries` (title/creator; membership via `gallery_id` with the Everything filter so NSFW covers resolve); tag-based pool search stays e621-family only. Inkbunny has no pools-list API: Inkbunny mode `/pools` offers **Open pool by ID**, watches, and entry from submission `pool:` chips (multi-file galleries stay in the in-post dialog). Federated **Watched** includes Inkbunny and Furbooru when those children are enabled. On Federated Pools, sidebar **Sites in Pools** (between Pools and Post Suggester) toggles e621/e6ai/Furbooru/Inkbunny and **Tailspace comics** (default on). Federated **name** browse can merge Tailspace comics when that toggle is on: Tailspace rows use origin badges, ignore e621-only filters (series/collection, creator, active), map the name search box into Tailspace search, and open `/tailspace/comic/...` while staying in Federated (back goes to Pools). Tag search does not include Tailspace, Furbooru, or Inkbunny. Browse by name or post tags (native `post_tags_match` on e621-family), sort, category, active/inactive, and creator filters; optionally also match descriptions. Watch pools (with **new page** badges after updates); pool cards show a static gray image icon plus a shared typewriter “Loading” cycle while cover thumbnails resolve and image-off when missing/failed, loading covers for the near viewport with a small concurrency limit; in Federated with Tailspace comics on, the watched section is titled **Watched Pools & Comics** and also lists Tailspace watched comics (+N page badges), with eye toggles writing to the same local Watched Pools / Watched Comics stores as the source sites. Open a gallery or scroll/full-width reader with numbered chunk pagination. Fullscreen next/previous keeps the dialog open (no close/reopen) and continues across chunk boundaries. Hidden/blacklisted pages keep their sequence with placeholders (and a hidden count). **Save chunk** / **Save all** write pages into Local. Deep-link with `?post=` (post details offers **Open at this page**); returning to a pool without a query resumes the last viewed page. Arrow keys / `[` `]` change chunks when fullscreen is closed. Tailspace has a separate comic reader with similar navigation.

## Post Suggester

- Available on every mode except Tailspace, News, and u18chan
- Builds a taste profile from favorites (any user on e621 / e6ai / FurAffinity / SoFurry — leave the username blank when signed in for your own; logged-in favorites elsewhere; Local `type:favorited`)
- FurAffinity own-favorites need profile cookies or host `FA_COOKIE_*`; looking up another user does not
- Hybrid candidates: recent posts plus searches seeded from top favorite tags
- Results ranked by score; already-favorited posts excluded
- Federated merges per-child favorites from every **enabled** child (even when the Posts feed is on Following) and ranks across origins
- Federated hybrid seed searches stay on the child that contributed each tag (no cross-origin seed pollution)
- When some Federated children fail to load favorites but others succeed, a snackbar names the skipped sites (total failure still shows as an error on the page)

## Favorite Analyzer

- Same mode surface as Post Suggester (everything except Tailspace and News)
- Ranks tags by frequency in a sample of favorites (320 / 960 / 1920); pages through adapter-sized batches so samples are not stuck on the first page
- Other users’ public favorites on e621 / e6ai / FurAffinity / SoFurry; own favorites when signed in elsewhere; Local library favorites; Federated per-child merge of every enabled child (Following does not shrink that set)
- Optional blacklist filter, category chips, copy top tags, JSON export, and a link into Post Suggester
- Uses mode-native favorite queries — never falls through to the e621 API on other sites

## Discovery tools

Sibling tools to Suggester / Analyzer (same mode surface; Tailspace and News excluded). Sidebar **Tools** expands to avoid crowding:

- **Artist Radar** (`/tools/radar`) — ranks artists from a favorites sample, checks for posts newer than your last “Mark seen,” Federated/Local aware
- **Taste Diff** (`/tools/taste-diff`) — compare two favorites profiles (you vs another user where public favs exist, or this site vs Local)
- **History Insights** (`/tools/history`) — tag frequency across browse-history searches
- **Blacklist Coach** (`/tools/blacklist-coach`) — suggests single-tag blacklist lines from favorites that already match, with collateral preview; optional one-click add
- **Saved-search Wake-up** (`/tools/saved-wake`) — check gallery saved searches for newer posts since last open from this tool; hits also show as +N on sidebar saved-search rows (background refresh when stale; open clears the badge)
- **Cross-post Finder** (`/tools/cross-post`) — Fluffle exact reverse-image on stills (≤4 MiB) plus artist/character heuristic search chips
- **Similar Artists** (`/tools/similar-artists`) — co-occurrence from a favorites sample; open Posts or Suggester
- **Pool / Series Suggester** (`/tools/pools`) — seed e621-family / Furbooru pool searches from favorite artists/characters (Inkbunny list API absent)
- **Taste Pack** (`/tools/taste-pack`) — export/import JSON of counts + weights; star top tags or open Suggester
- **Activity heatmap** (`/tools/activity`) — calendar of favorited posts by upload date (Dashboard-style grid)

**Home** (`/home`) is the sidebar Home target (all modes). It shows mode shortcuts (browse posts, Following where supported, Pools, Saved, News), saved-search wake `+N` rows for the active profile, watched pools/comics as links (live +N badges stay on the Pools / Comics pages), Saved/collections counts, and teasers to History Insights and Activity heatmap. Artist Dashboard remains under Tools on e621/e6ai only. Browse posts stays a separate sidebar link.

## Saved searches, starred tags, and bookmarks

Saved searches and starred tags can be placed into named, collapsible groups. Groups and entries support reordering and drag-and-drop. Favorites, blacklists, and compatible saved searches (e621 ↔ e6ai) can be copied between site profiles using merge or replace. Gallery saved-search rows in the sidebar show a +N badge when Wake-up (or a background stale refresh) finds posts newer than last open; opening the search clears the badge. Blacklist Settings can also **push** the active profile’s lines into every signed-in Federated child, remapping each line through the Federated metatag map before merging.

**Saved** (`/saved`) is a mode-independent bookmark list for federated posts. Bookmark from any supported remote origin and reopen from the nav. Named **collections** (sidebar on Saved) group bookmarks — a post can sit in more than one; Edit posts picks membership. The same sidebar **Layout** menu as Posts (full-width, grid, compact cards, auto-next, infinite scroll) applies here.

## Local library

Local mode can:

- Scan one or more selected folders as a combined library and search filenames, paths, and tags fuzzily
- Limit the grid to one folder with a `folder:Name` tag (exact folder label)
- Sort by newest, name, size, duration, video, stills, or audio
- Play common image, video, and audio formats
- Track favorites (heart toggle on Local posts) and playback position (portable sidecars `.me621-favorites.json` and `.me621-library.json` per folder)
- Read tags from `.me621-tags.json`
- Use poster images where available
- Remux individual files or every unplayable result in the current filter
- **Fluffle tag** on the Posts toolbar matches untagged stills on the current Local page (≤4 MiB) and writes tags into `.me621-tags.json` — full e621/e6ai tags when Fluffle finds an exact hit there, otherwise `artist:` names from Fluffle authors

Chromium uses the File System Access API for browse and write. The Tauri desktop build can browse and **write under the picked Local browse roots** (Save Locally into the first browse folder when no Chromium save folder is set, remux output, and sidecars). Picking an arbitrary save folder outside those roots still needs Chromium's File System Access API. **Open in Local** after a single or bulk save replaces the browse list with that save folder and focuses the file (Chromium directory handle or Tauri browse root).

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
npm run test:contracts
LIVE=1 npm run test:live-smoke   # optional; hits public e621 / Flayrah / Weasyl
npm run test:e2e
```

`test:contracts` checks HTML/RSS parser fixtures (FA, Weasyl, u18chan, news, badpups) and API backend routing without network. Live smoke is never part of CI.
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
docker build -t pawdeck .
docker run --rm -p 18621:18621 pawdeck
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

The product name is **PawDeck**. The intended Live URL is [pawdeck.tonypup.box.ca](https://pawdeck.tonypup.box.ca) (Expedition custom app `pawdeck`). Until that Expedition app exists and `M_E621_DOMAIN` is flipped, the running instance may still resolve at `pawfeed.tonypup.box.ca`. Env vars (`M_E621_*`), `~/.config/m-e621/`, the checkout path, Local sidecars (`.me621-*.json`), and the GitHub repo `lovelyspacedog/m-e621` stay unchanged so existing deploys keep working.

To serve the same app under a different subdomain:

1. Pick the new Expedition custom-app name. That label is the DNS host under `tonypup.box.ca` (example: `pawdeck` → `pawdeck.tonypup.box.ca`).
2. Create a reverse-proxied custom app with that name on the same local port (`M_E621_PORT`, default `18621`). Point it at the existing `serve.py` — do not clone a second checkout.
3. On the VPS, set `M_E621_DOMAIN` in `~/.config/m-e621/env` (or gitignored `deploy.env`) to the new host **without** `https://`. Example: `M_E621_DOMAIN=pawdeck.tonypup.box.ca`.
4. Rebuild so Vite picks up the host: `M_E621_FORCE_BUILD=1 ./sync`. That rewrites `.env.local` (`VITE_CANONICAL_URL`, `VITE_APP_DOMAIN`) and regenerates `sitemap.xml`.
5. Confirm `https://<new-host>` loads and that Settings → Info shows the current commit.
6. Update the Live links in `Markdowns/README.md` and this file, add a changelog bullet, and change the verification URL in the Cursor skill (`~/.cursor/skills/m-e621/SKILL.md`).
7. Optional: keep the old custom app on the same port, or turn the old host into a redirect. For a settings-migration interstitial on the old origin, build it with `VITE_MIGRATE_FROM_DOMAIN` / `VITE_MIGRATE_TO_DOMAIN`.
8. Installed PWAs are origin-scoped. Users who added the old host as an app must install again from the new origin.
9. Remove the old custom app only after bookmarks and the old URL have moved.

TLS for `*.tonypup.box.ca` is handled by the Expedition reverse proxy. `serve.py` still binds `127.0.0.1:18621`.

## Settings and appearance

- Settings hub search finds pages and rows across groups (including synonyms like “hotkey” → shortcuts, plus playback, route transitions, git pull, and sanitized backup).
- On desktop, Settings open as an overlay over the current page (`?settings=` sync); on mobile they stay full-page `/settings*` routes.
- Appearance includes themes, System/Dark/Light color scheme, navigation density, fullscreen and route transitions (route animations respect reduced motion), an optional paw cursor, and a Prompts subgroup for dismissable banners plus **Reset tooltips** for one-time tip toasts (Federated mode/Following, Local, Layout, pools, watched comics, fullscreen, Saved posts, blacklist, Tailspace comics, Fluffle, remux, Suggester, Analyzer, News offline, News intro, starred tags — see `Markdowns/TIP_CHECKLIST.md`). On mobile, the sidebar drawer is 300px (desktop stays 400px), shows a close button next to the logo, and closes after navigation; the menu button uses the same mobile breakpoint as the drawer. Fullscreen uses dynamic viewport height with safe-area padding; comments go full-bleed on narrow screens.
- **SFW only** (Post settings, app-bar shield, and Site block in the sidebar) forces safe rating on adapters that support it, overrides conflicting rating search tags, and hides non-safe posts in list feeds. On e621, e6ai, Furbooru, FurAffinity, and Federated, adding `rating:safe` or `rating:s` to the search turns SFW on (removing that tag does not turn it off; excludes like `-rating:safe` do not turn it on). Turning SFW only off removes the injected safe markers from the search bar (`rating:safe` / Furbooru `safe` + rating negations / FurAffinity `rating:general`) and reloads. Federated no longer snackbars when SFW’s injected safe rating is dropped on children that lack rating search (e.g. SoFurry). Direct post URLs still open. Off by default; global across site modes (not per-profile). While SFW only is on, Video mode is removed from the picker and an active Video mode demotes to e621.
- **Video mode** (Post settings) adds a Video hub that merges Murrtube and Badpups (site filters). Off by default; persisted in settings backups / host sync with the rest of `misc`.
- Post settings also cover feed layout (list/grid, full-width, compact cards), always-collapse toolbar actions (⋮ vs icon row), infinite scroll, slideshow / card auto-next, data saver, media autoplay, and local save path templates.
- Account settings use per-site panels with credentials material and last verify/login probe status; Federated feed source and site presets are also editable there.
- Info → Debug can silence main-thread production console diagnostics (workers unchanged).
- Blacklist and History settings show which site profile you are editing.
- Posts settings can set per-site mute/volume/speed overrides (HTML5; SWF unchanged) and insert Save Locally path tokens from chips.
- Data saver controls feed preview quality (fullscreen still uses full-resolution). Automatic mode prefers `connection.type` when present, otherwise Chromium’s `effectiveType` / Save-Data, and falls back to medium when the Network Information API is unavailable.
- Starred-tag / saved-search merge between sites keeps groups by name when possible (Replace still copies the full tree).
- Backup can download a full JSON or a sanitized copy without API keys/cookies; restore and reset ask for confirmation with a preview. Library clear and per-section reset live on Backup and Restore. **Host sync** pushes or pulls that sanitized snapshot through `serve.py` (`~/.config/m-e621/settings_sync.json`) so Saved, collections, and tips can move between browsers on the same machine (loopback, or `M_E621_SETTINGS_SYNC_TOKEN` when not).

## Additional details

- `start`, `sync`, and `deploy.sh` support a reverse-proxied self-host. `sync` uses `flock` on `~/.config/m-e621/sync.lock` (wait up to `M_E621_SYNC_LOCK_TIMEOUT`, default 600s, then one non-blocking retry) so overlapping agent/cron syncs do not stack. The lock is dropped before `start`, and `serve.py` does not inherit that flock FD.
- Parallel agents that cannot safely edit README/changelog write untracked notes under `PENDING_DOCS/` for a later survey (see [`PENDING_DOCS/README.md`](../PENDING_DOCS/README.md)).
- `public/zen-browser.css` provides Zen Browser and Transparent Zen compatibility (including stronger landing hero chip / action button contrast when theme secondary is forced transparent/black, and darkened landing text panels for the tagline / What it does / Tag Wiki / About).
- The PWA installs as `standalone` (status bar visible; safer with notch/safe-area than `fullscreen`), checks for updates every ten minutes, and shows an update banner with the git short hash when available.
- The landing page uses site-mode chips, a primary Browse posts action, outlined Scent Marks / Info actions plus a gear for Settings (hero and footer), a static site-summary tagline under the PawDeck title (News always; local folder only when Local browse is available), a capability summary (What it does — Federated Search/Following, chip multi-select, layouts, pools/comics, Suggester/Analyzer/Fluffle, community actions), a random [e621 tag wiki](https://e621.net/wiki_pages/204) first-paragraph snippet under that section each visit (artist-tag wiki pages skipped; click the tag to search e621 in-app; Another page loads a new tag definition in place), honest About/limits copy (site list, Federated Search/Following + chip selection, AGPL), dual Tony Pup / Avoonix Latest updates commit columns (Show more opens an in-app modal; more on GitHub stays), an Info dialog (About / Changelog / TOS tabs), and an AGPL/age footer. What it does, Tag Wiki, and About wrap their copy in darkened text panels so they stay readable under Transparent Zen. The TOS tab lists fair-use summaries for supported sites (Tailspace omitted; no public TOS) plus Fluffle, each with a link to the official document. About copy mentions News (Flayrah and other RSS outlets) always, and a local folder only when Local browse is available (Chromium File System Access or the Tauri app).
- On the landing page, the short commit hash sits as small uppercase monospace text to the right of the PawDeck title (links to GitHub); other screens still show it in the app bar title so a self-host knows which build is running.

## Project expectations

PawDeck is an active personal, AI-assisted fork. Features may be experimental, incomplete, or optimized for the maintainer's workflow. It is not affiliated with any supported content site. Users are responsible for following each site's rules, age requirements, and API terms.

A public instance is operable at [pawdeck.tonypup.box.ca](https://pawdeck.tonypup.box.ca). To serve it under a different subdomain, see [Rename the public hostname](#rename-the-public-hostname).

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
