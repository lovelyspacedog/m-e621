<div align="center">
  <img src="./public/favicon.svg" width="88" alt="m-e621 logo">
  <h1>m-e621</h1>
  <p>A multi-site imageboard browser and local media library.</p>
  <p>
    <a href="./README-CONTINUED.md">Documentation</a>
    ·
    <a href="https://github.com/lovelyspacedog/m-e621">Repository</a>
    ·
    <a href="https://material-e621.avoonix.com">Upstream</a>
  </p>
</div>

---

m-e621 expands [Material e621](https://github.com/avoonix/material-e621) with additional sites, a Unified feed, local media management, and richer browsing tools. It is built with Vue 3 and Vuetify.

> [!NOTE]
> This is an experimental, AI-assisted personal project. For a stable e621-only client, use upstream Material e621.

## Highlights

- **Multi-site browsing** — nine remote sites, independent profiles, and one optional Unified feed.
- **Local media library** — folder browsing, fuzzy search, tags, favorites, audio/video, and playback resume.
- **Save Locally** — smart filenames, sidecar metadata, Open in Local, and automatic offline retries.
- **FFmpeg remuxing** — repair one file or bulk-remux unplayable filtered results.
- **Flexible feeds** — full-width lists, thumbnail grids, compact cards, and remembered media controls.
- **Slideshow and auto-next** — hands-free navigation in fullscreen or the feed.
- **Pool and comic readers** — gallery, scrolling, full-width, and chunked reading modes.
- **Organized searches and tags** — collapsible, reorderable groups for saved searches and starred tags.
- **Media tools** — Fluffle reverse-image search, fullscreen notes, and RTF/DOCX previews.

## Preview

> Content shown in screenshots may be NSFW.

[![m-e621 posts view](./screenshots/m-e621-posts.png)](./screenshots/m-e621-posts.png)

<details>
  <summary>More screenshots</summary>

[Landing](./screenshots/m-e621-landing.png) ·
[Fullscreen](./screenshots/m-e621-fullscreen.png) ·
[Site modes](./screenshots/m-e621-site-modes.png) ·
[Settings](./screenshots/m-e621-settings.png) ·
[Starred tags](./screenshots/m-e621-starred.png) ·
[Suggester](./screenshots/m-e621-suggester.png) ·
[Artist dashboard](./screenshots/m-e621-dashboard.png) ·
[Pools](./screenshots/m-e621-pools.png)

</details>

## Get started

Requires **Node.js 20+** and **npm**.

```bash
npm install
npm run dev
```

### Self-host

Build and run the included Python proxy:

```bash
npm run build
M_E621_ROOT="$PWD/dist" M_E621_DIR="$PWD" python3 serve.py
```

Or use Docker:

```bash
docker compose up --build
```

For authentication, site support, Local mode, remuxing, Docker, Tauri, deployment, and limitations, read the **[complete guide](./README-CONTINUED.md)**.

## Project status

Active personal fork. Features may be incomplete or change without notice. This project is not affiliated with its supported sites or upstream maintainers. Follow each site's rules, age requirements, and API terms.

## License

[AGPL-3.0](./LICENSE). Network use of a modified version requires offering the corresponding source.
