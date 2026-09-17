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
    title: "PawFeed, Flayrah, Federated Pools, and hardening",
    items: [
      "Product renamed to PawFeed; public Live URL is pawfeed.tonypup.box.ca (host paths and GitHub stay m-e621)",
      "App logo and favicon refreshed to a basset-hound mark; loading spinner matches the sidebar face",
      "Flayrah site mode: read-only RSS feed and article reader with taxonomy chips, archive, saved/unread, magazine layout, and j/k shortcuts",
      "Federated Pools: merged e621/e6ai browse with origin badges, sequential fetch/retry, and Updated/sort interleave",
      "Federated Pools name browse can include Tailspace comics (Account setting, on by default); opens the Tailspace reader",
      "Site mode renamed from Unified to Federated; sidebar Defaults / Auth-only presets sit as a compact toolbar",
      "Layout menu and Post settings: Infinite scroll toggle (off uses previous/next); Saved posts share the same Layout menu",
      "Pools: watched +N badges, chunk/deep-link resume, fullscreen across chunks, hidden-page placeholders, Save chunk / Save all",
      "Scent Marks: host pin-to-top, unlock-gated moderation, rate-limited admin actions; feed heading is Scent Trail",
      "Landing: tag wiki snippets (Another page), darkened copy panels for Transparent Zen, Scent Marks / Browse no longer blank",
      "Hardened media download and Fluffle redirects (allowlisted hops); Docker ships the Scent Trail blocklist",
      "Federated Post Suggester and Favorite Analyzer use per-child auth; clearer empty-sample errors",
      "Posts Back / ?page= reload; mode redirects keep query params; stars:me remaps on non-Itaku Federated children",
      "Settings: safer backup/restore, per-site account panels, color scheme, data-saver Automatic, synonym search",
      "Local Tauri: MP4 ftyp sniff for mislabeled MPEG-TS; sidecar tag edits use the merge lock",
      "Furbooru rejects HTML error pages before JSON parse; Federated/Local autocomplete no longer hits e621",
    ],
  },
  {
    date: "2026-09-16",
    title: "Unified Following, Local writes, and polish",
    items: [
      "Artist Dashboard: clearer heatmap, top-post previews, honest weekly rate, richer filters, and add-as-saved-search",
      "Post Suggester and Favorite Analyzer on all modes except Tailspace",
      "Unified Search vs Following feed, with Defaults and Auth-only site presets",
      "Watched pools on the e621-family pool browser; Furbooru post comments",
      "Landing: site chips, About strip, Changelog & TOS dialog with fair-use summaries",
      "Scent Marks: anonymous guestbook with host moderation, hate/CSAM/spam blocklist, clearer contrast",
      "Tauri Local writes under the browse root; portable favorites/resume sidecars; Save Locally `%origin%`",
      "Separate audio mute / volume / speed; optional paw cursor; fairer Random (Fisher–Yates)",
      "Offline: remote modes disabled; Local stays available",
      "SoFurry likes / Remix auth and story formatting; Weasyl and Itaku on by default in Unified Search",
      "Self-host `sync` lock serializes overlapping deploys and no longer sticks after restart",
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
