/** Curated PawFeed release notes derived from the fork commit history (Tony Pup). */

export interface ChangelogSection {
  /** ISO date for sorting / stable keys */
  date: string;
  /** Short section heading */
  title: string;
  items: string[];
}

/**
 * Newest first. Sourced from all Tony Pup commits since the Sep 2026 fork
 * push (e621/e6ai profiles through Unified, Local, and the multi-site stack).
 * Upstream Material e621 history lives on GitHub / the About page.
 */
export const changelogSections: ChangelogSection[] = [
  {
    date: "2026-09-17",
    title: "Public instance noted",
    items: [
      "Flayrah site mode: read-only RSS news feed and article reader (not Federated)",
      "Flayrah: taxonomy feed chips, archive deep-links, refresh, prev/next, live body search, copy link",
      "Flayrah: read/unread and saved articles, magazine layout, j/k shortcuts, tag cloud, offline last-good feed",
      "Public instance Live URL is pawfeed.tonypup.box.ca (docs and README updated)",
      "Product renamed to PawFeed (landing, PWA, desktop title, and docs); host paths and GitHub repo stay m-e621",
      "README documents how to rename the public Expedition subdomain",
      "Scent Marks: host moderators can pin posts so they stay at the top of the Scent Trail",
      "App logo and favicon refreshed to a basset-hound mark with forehead m, long ears, and the same ear/tail/blink animations",
      "Logo head uses darker e621 blue so it stays visible on the primary landing hero; droopy brows and eyes match the mark",
      "Logo head restored to a pointy-top hexagon (rounded forehead reverted)",
      "Logo blink no longer paints over the ears (ears drawn above eyelids)",
      "Logo forehead letter m removed",
      "Loading spinner shows the same eyes and face as the sidebar mark",
      "Landing Furry Dictionary slang entry sits under What it does (random each visit; from the-furry-dictionary.avoonix.com)",
      "Furry Dictionary snippet Another entry button loads a new random slang definition without leaving the landing page",
      "Landing Scent Marks / Browse posts no longer open a blank page (single-root landing + skip view transition when leaving Home)",
      "Scent Marks feed heading renamed from Wall to Scent Trail",
      "Site mode renamed from Unified to Federated (same date-merge feed; settings key unchanged)",
      "README notes that the public instance at m-e621.tonypup.box.ca is operable",
      "Scent Marks moderation Unlock checks the admin password against the host before showing delete controls",
      "Watched pools show +N new-page badges; opening a pool marks it seen",
      "Pool fullscreen next/previous continues across gallery/scroll chunks",
      "Pool deep-link `?post=` and resume last page; Open at this page from post details",
      "Pool reader: arrow keys / [ ] change chunks when not in fullscreen",
      "Pools browse: native post-tag search, status/creator filters, optional description match, faster watched/cover loading",
      "Pool reader: hidden-page placeholders, Save chunk / Save all to Local",
      "Landing Latest updates again shows Tony Pup and Avoonix commit columns (Changelog & TOS stays in the dialog)",
      "Latest updates Show more opens a modal with the full in-app commit list for that column (GitHub link kept)",
      "Settings: safer backup/restore (confirm + preview, sanitized export), active-site banner on blacklist/history, per-site playback overrides, route transitions, shortcut reset and conflict warnings",
      "Account settings split into per-site panels (credentials and verify/login stay the same)",
      "Settings: System/Dark/Light color scheme, Prompts subgroup, library clear and partial section reset, Save Locally path-token chips, synonym settings search, and starred-tag merge that keeps groups",
      "Account settings split into a dedicated panels module with Verified / Check failed chips after probe; Info can silence main-thread debug console logs",
      "Data saver Automatic uses effectiveType / Save-Data when connection.type is missing; settings select no longer truncates to “A..”",
    ],
  },
  {
    date: "2026-09-16",
    title: "Unified Following, Local writes, and polish",
    items: [
      "Artist Dashboard: clearer heatmap, top-post previews, honest weekly rate, richer tags/table filters, recent artists, and add-as-saved-search",
      "Post Suggester on all modes except Tailspace, with hybrid tag-seed ranking",
      "Favorite Analyzer on all modes except Tailspace, with ranked tags, export, and Suggester link",
      "Unified Search vs Following feed, with Defaults and Auth-only site presets",
      "Watched pools on the e621-family pool browser",
      "Post comments on Furbooru (composer enabled)",
      "Landing page: site chips, honest About copy, capability strip, and changelog excerpt instead of dual git timelines",
      "Landing tagline omits Local when this browser cannot browse a folder",
      "Landing Changelog dialog beside Browse posts",
      "Landing Changelog & TOS dialog: Changelog and TOS tabs with fair-use site summaries and links to originals",
      "Scent Marks: anonymous public guestbook from the landing page (host-moderated)",
      "Scent Marks composer and fields use higher-contrast surface styling",
      "Scent Marks Post button includes a dog emoji",
      "Scent Marks block hate, illegal/CSAM terms, and spam links (NSFW language allowed); the error names what was blocked",
      "Landing hero site chips and Scent Marks / Changelog & TOS buttons use stronger outlines and tinted fills so they stay readable on solid primary and Transparent Zen",
      "Collapsible sidebar disclosure for Unified and search clutter",
      "Unified site presets show which sites are active",
      "Tauri Local writes under the picked browse root (save, remux, sidecars)",
      "Portable Local favorites and resume sidecars",
      "Save Locally path templates including `%origin%`",
      "Separate audio mute / volume / speed preferences",
      "Offline: remote modes disabled; Local stays available",
      "Optional paw cursor under Appearance",
      "SoFurry likes / Remix auth and story formatting fixes",
      "Honest overview metadata across site modes",
      "Fairer Random order (Fisher–Yates)",
      "Self-host `sync` serializes with a lock so overlapping deploys wait or exit cleanly",
      "Weasyl and Itaku enabled by default in Unified Search",
      "Self-host sync no longer leaves the lock held by serve.py after restart",
    ],
  },
  {
    date: "2026-09-15",
    title: "More sites, stories, Fluffle, and reading UX",
    items: [
      "SoFurry and Itaku site modes (comments on Itaku)",
      "Weasyl as a site mode and optional Unified child",
      "FurAffinity mode with cookie sign-in and captcha login helper",
      "Fluffle reverse image search with copy-URL on results",
      "Fullscreen comments rail with resizable dual prefs; info + description in-rail",
      "Story / PDF / RTF / DOCX fullscreen preview; story titles on cards",
      "Music playback on remote site modes; music card badges",
      "Pools: thumbnails, sort, ordered reading, tag search, gallery/scroll reader",
      "Feed GIF/video animate + autoplay settings; unload off-screen video buffers",
      "Mode-independent saved posts; bookmark from any federated site",
      "History navigation; denser settings groups with hub search",
      "Tailspace login and interactive features",
      "Compact sidebar site switcher; origin badge icons",
      "Furbooru Cloudflare / Philomena challenge workarounds and media hydration",
    ],
  },
  {
    date: "2026-09-14",
    title: "Unified federation and public rebrand",
    items: [
      "Unified site mode: date-merge federated posts from child sites",
      "Toggle Unified child sites from the posts sidebar",
      "Shared Score / Favs / Random controls and search groups",
      "Landing site picker / mode chips",
      "Clearer site icons and comic full-width scroll",
      "Public rebrand as m-e621 (AGPL fork of Material e621)",
      "e621 media proxy for Firefox / Zen video playback",
    ],
  },
  {
    date: "2026-09-13",
    title: "Local library, Tailspace, Inkbunny, Furbooru, and foundations",
    items: [
      "Per-mode e621 / e6ai profiles",
      "Local site mode: browse save folder, posters, remux, favorites, fuzzy tags, Random",
      "Tailspace posts and comics with in-app page reader and scroll mode",
      "Furbooru site mode with API key auth",
      "Inkbunny hybrid site mode",
      "Ruffle Flash / SWF playback",
      "Zen Browser / Transparent Zen compatibility",
      "Save Locally, full-width feed, starred tag folders, slideshow, card auto-next",
      "Inline feed video; Score and Favs on the search bar",
      "Sidebar saved-search management",
      "Same-origin download and favorites proxies; self-hosted sync / git-pull control",
      "Large bugfix pass and landing “Tony / Avoonix” update columns",
    ],
  },
];

export const changelogIntro =
  "PawFeed is a personal multi-site fork of Material e621. Highlights below cover the fork’s shipped work; older upstream commits are on GitHub.";
