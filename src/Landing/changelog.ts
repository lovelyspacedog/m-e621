/** Curated m-e621 release notes derived from the fork commit history (Tony Pup). */

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
    date: "2026-09-16",
    title: "Pools, replies, and sidebar polish",
    items: [
      "Watched pools on the e621-family pool browser",
      "Furbooru post comment replies",
      "Collapsible sidebar disclosure for Unified and search clutter",
      "Unified site presets show which sites are active",
      "Optional paw cursor under Appearance",
      "SoFurry likes / Remix auth and story formatting fixes",
      "Honest overview metadata across site modes",
      "Fairer Random order (Fisher–Yates)",
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
  "m-e621 is a personal multi-site fork of Material e621. Highlights below cover the fork’s shipped work; older upstream commits are on GitHub.";
