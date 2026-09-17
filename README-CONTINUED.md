# m-e621 — detailed guide

This document expands on the quick overview in the [main README](./README.md).

## Site modes

Each mode has its own profile for authentication, blacklist, starred tags, saved searches, history, and favorites where supported.

- **e621** — the original Material e621 experience, including pools, suggester, analyzer, and artist dashboard.
- **e6ai** — e6ai browsing with mode-aware terminology.
- **Furbooru** — API-key authentication, tags, comments, favorites, and votes.
- **Inkbunny** — multi-file submissions, pools, following feed, and Flash/SWF playback through Ruffle. Favorite toggling is unavailable.
- **FurAffinity** — browsing and search through the bundled `faapi` proxy, following feed, and enriched music posts.
- **Weasyl** — API-key authentication, multimedia audio, and `favs:me`. Guest browsing is SFW-only; favorite toggling is unavailable.
- **Itaku** — galleries, flattened multi-image posts, comments, stars, and following with token authentication.
- **SoFurry** — artwork, music, stories, likes, and following. Stories have a fullscreen text reader.
- **Tailspace** — posts, saved searches, following, account actions, and a dedicated comic reader.
- **Local** — a searchable media library backed by a folder on disk.
- **Unified** — a date-merged feed from the supported remote modes, with origin-aware actions and per-site query translation.

Tailspace and Local are not included in Unified.

## Browsing and media

- Full-width list and thumbnail-grid feeds
- Optional compact cards with controls revealed on hover
- Inline video and audio with remembered mute, volume, and playback speed
- Fullscreen slideshow and timed card auto-next
- Score, favorites, random, and mode-specific media filters in the Posts toolbar
- Collapsible long artist and creator tag lists
- Notes in post details and over fullscreen media where supported
- `o` shortcut to open the current fullscreen post on its source site
- RTF and DOCX story previews; legacy `.doc` remains unsupported
- Fluffle reverse-image search for still images

## Pools and comics

The fork adds dedicated pool routes at `/pools` and `/pools/:id`. Pools can be browsed as a gallery or read in scroll/full-width modes with numbered chunk pagination. Tailspace has a separate reader with similar navigation.

## Saved searches and starred tags

Saved searches and starred tags can be placed into named, collapsible groups. Groups and entries support reordering and drag-and-drop. Favorites and blacklists can also be copied between site profiles using merge or replace.

## Local library

Local mode can:

- Scan a selected folder and search filenames, paths, and tags fuzzily
- Sort by newest, name, size, duration, video, stills, or audio
- Play common image, video, and audio formats
- Track favorites and playback position
- Read tags from `.me621-tags.json`
- Use poster images where available
- Remux individual files or every unplayable result in the current filter

Chromium uses the File System Access API. The Tauri desktop build provides a read/browse bridge for Firefox-style environments. Tauri writes, remux output, sidecar writes, and saving directly into a selected folder still require Chromium's API.

## Saving and remuxing

**Save Locally** downloads a post using configurable filenames, optionally based on species and tags. Folder saves merge post metadata into `.me621-tags.json` and localforage.

After saving, **Open in Local** can reuse the destination as the Local browse root and focus the saved file. Failed network or offline downloads enter an IndexedDB queue and retry at startup or when connectivity returns.

Remuxing uses `@ffmpeg/ffmpeg`. It is available per file and as a cancellable bulk operation for the current Local filter. Remux jobs are not added to the offline queue.

## Self-hosting

Upstream's static image remains suitable for e621-only hosting. This fork includes `serve.py`, which:

- Serves the built `dist/`
- Proxies remote APIs, account actions, comments, and downloads
- Provides same-origin media URLs for Firefox and Zen playback
- Supports optional managed-instance git updates

Configuration belongs in `~/.config/m-e621/env` or a gitignored `deploy.env`. See [`deploy.env.example`](./deploy.env.example).

### Development

Requires Node.js 20 or newer and npm. Yarn and pnpm are blocked by `package.json`.

```bash
npm install
npm run dev
```

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
docker build -t m-e621 .
docker run --rm -p 18621:18621 m-e621
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

## Additional details

- `start`, `sync`, and `deploy.sh` support a reverse-proxied self-host. `sync` uses `flock` on `~/.config/m-e621/sync.lock` (wait up to `M_E621_SYNC_LOCK_TIMEOUT`, default 600s, then one non-blocking retry) so overlapping agent/cron syncs do not stack.
- Parallel agents that cannot safely edit README/changelog write untracked notes under `PENDING_DOCS/` for a later survey (see `PENDING_DOCS/README.md`).
- `public/zen-browser.css` provides Zen Browser and Transparent Zen compatibility.
- The PWA checks for updates every ten minutes and shows an update banner.
- The landing page shows separate fork and upstream commit timelines.

## Project expectations

m-e621 is an active personal, AI-assisted fork. Features may be experimental, incomplete, or optimized for the maintainer's workflow. It is not affiliated with any supported content site. Users are responsible for following each site's rules, age requirements, and API terms.

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

GNU Affero General Public License v3.0. Network use of a modified version requires offering the corresponding source. See [`LICENSE`](./LICENSE).
