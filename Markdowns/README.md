<div align="center">
  <img src="../public/favicon.svg" width="88" alt="PawDeck logo">
  <h1>PawDeck</h1>
  <p>A multi-site imageboard browser and local media library.</p>
  <p>
    <a href="https://pawdeck.tonypup.box.ca">Live</a>
    ·
    <a href="./README-CONTINUED.md">Documentation</a>
    ·
    <a href="https://github.com/lovelyspacedog/m-e621">Repository</a>
    ·
    <a href="https://material-e621.avoonix.com">Upstream</a>
  </p>
</div>

---

PawDeck is an AGPL fork of [Material e621](https://github.com/avoonix/material-e621) (Vue 3 + Vuetify). It adds more sites, a Federated merge feed, a local disk library, and discovery tools — built as a personal power-user client, not an official app for any supported site.

> [!NOTE]
> Experimental and AI-assisted. Features may change without notice. For a **stable e621-only** client, use [upstream Material e621](https://github.com/avoonix/material-e621).

**Who it’s for** — people who already bounce between several of these sites (or keep a big local folder) and want one UI for search, following, pools/comics, Saved bookmarks, and taste tools.

**Who should skip it** — anyone who only needs e621, wants a finished product with a support desk, or cannot self-host the Python proxy for non-e621 sites.

Try the public instance: **[pawdeck.tonypup.box.ca](https://pawdeck.tonypup.box.ca)**. Hostname moves are documented in the [complete guide](./README-CONTINUED.md#rename-the-public-hostname).

## Preview

> Content shown in screenshots may be NSFW.

[![PawDeck landing page](../screenshots/landing-page.png)](../screenshots/landing-page.png)

[![Grid layout in Federated mode](../screenshots/grid-and-unified-mode.png)](../screenshots/grid-and-unified-mode.png)

<details>
  <summary>More screenshots</summary>

[![e621 site home](../screenshots/e621-site-home.png)](../screenshots/e621-site-home.png)

[![Per-site account login settings](../screenshots/accounts-login.png)](../screenshots/accounts-login.png)

[![Fullscreen comments sidebar](../screenshots/comments-bar.png)](../screenshots/comments-bar.png)

[![Universal saved-post bookmarks](../screenshots/universal-saved-posts-bookmarks.png)](../screenshots/universal-saved-posts-bookmarks.png)

[![Fullscreen story mode](../screenshots/story-mode.png)](../screenshots/story-mode.png)

[![Tailspace comics page](../screenshots/tailspace-comics-page.png)](../screenshots/tailspace-comics-page.png)

[![Tailspace comic scroll reader](../screenshots/tailspace-comic-scroll.png)](../screenshots/tailspace-comic-scroll.png)

</details>

## Highlights

- **Many sites, one UI** — e621, e6ai, Furbooru, Inkbunny, FurAffinity, Weasyl, Itaku, SoFurry, Tailspace, plus News, optional Video (Murrtube / Badpups), and u18chan Indices. → [Site modes](./README-CONTINUED.md#site-modes)
- **Federated feed** — date-merge enabled children; duplicate collapse with alternate-origin chips; Federated pools / comics where supported. → [Site modes](./README-CONTINUED.md#site-modes)
- **Local library** — browse folders on disk (Chromium File System Access or Tauri), fuzzy search, favorites, remux, Fluffle tagging for untagged stills. → [Local library](./README-CONTINUED.md#local-library)
- **Per-site accounts** — auth, blacklist, favorites, history, and prefs stay independent per mode.
- **Saved + Home** — mode-independent bookmarks with named collections; sidebar Home for wake hits, watches, and shortcuts.
- **Tools** — Post Suggester, Favorite Analyzer, and discovery utilities (Radar, Taste Diff, Wake-up, Cross-post Finder, and more). → [Discovery tools](./README-CONTINUED.md#discovery-tools)
- **Readers** — pools / Tailspace comics, u18chan Gallery & Scroll, fullscreen stories / PDF / RTF / DOCX, comments rail, slideshows.
- **Settings that scale** — searchable hub, sanitized backups, host push/pull snapshot, SFW-only, blacklist push into Federated children.

## Site capabilities

Federated Posts children are the eight gallery sites below. Local, News, Video, Tailspace posts, and u18chan are separate modes (Tailspace comics can still join Federated **Pools** when enabled). Details and caveats: [Site modes](./README-CONTINUED.md#site-modes).

| Site | Search | Following | Fav toggle | Comments | Pools | Federated |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| e621 / e6ai | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Furbooru | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Inkbunny | ✓ | ✓ | | | ✓¹ | ✓ |
| FurAffinity | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Weasyl | ✓ | | | ✓² | | ✓ |
| Itaku | ✓ | ✓ | ✓ | ✓ | | ✓ |
| SoFurry | ✓ | ✓ | ✓ | ✓³ | | ✓ |
| Tailspace | ✓ | ✓ | | | comics | pools only⁴ |
| Local | ✓ | | ✓ | | | |
| News / Video / u18chan | ✓ | | | | | |

¹ Inkbunny pools: open-by-id / watch / chips — no free-text list API.  
² Weasyl: view via scrape; posting needs session cookies with the API key.  
³ SoFurry: artwork comments (stories/music excluded).  
⁴ Tailspace posts are not Federated Posts children; comics can appear under Federated Pools → Sites in Pools.

## Get started

Requires **Node.js 20+** and **npm**.

```bash
npm install
npm run dev
```

### Self-host

```bash
npm run build
M_E621_ROOT="$PWD/dist" M_E621_DIR="$PWD" python3 serve.py
```

Or:

```bash
docker compose up --build
```

Auth, proxies, Local / remux, Docker, Tauri, and deployment: **[complete guide](./README-CONTINUED.md)**.

## Project status

Active personal fork. Not affiliated with supported sites or upstream maintainers. Follow each site’s rules, age requirements, and API terms.

## License

[AGPL-3.0](../LICENSE). Network use of a modified version requires offering the corresponding source.
