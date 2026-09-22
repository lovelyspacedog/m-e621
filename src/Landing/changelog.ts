/** Curated PawDeck release notes derived from the fork commit history (Tony Pup). */

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
    date: "2026-09-21",
    title: "Docs cleanup, discovery tools, and News polish",
    items: [
      "Public product name is PawDeck (intended Live: pawdeck.tonypup.box.ca); host paths and GitHub stay m-e621 — until the Expedition cutover, the running instance may still be at pawfeed.tonypup.box.ca",
      "In-app changelog abridged into fewer plain-language bullets; outdated planning Markdowns removed from the docs folder; TOS summaries refreshed against current official pages",
      "Sidebar Tools group: Post Suggester, Favorite Analyzer, discovery tools, and (on e621/e6ai) Artist Dashboard — nav stays uncrowded",
      "Discovery tools: Artist Radar, Taste Diff, History Insights, Blacklist Coach, Saved-search Wake-up, Cross-post Finder, Similar Artists, Pool/Series Suggester, Taste Pack, and Activity heatmap",
      "Posts search shows a floating Go to top after you scroll (bottom-right, clear of the sidebar and mobile safe areas)",
      "News prefers full article bodies over short RSS excerpts; saved filters remember source/section/view; Flayrah section chips only when filtering to Flayrah; SFW only stays hidden in News",
      "News reader polish: day-grouped feed, j/k focus, text size and column width, click-to-enlarge images, author/tag/source filters, more outlets (InFurNation, Furry Writers’ Guild), same-story “also on…”, watched authors, and optional new-since-last-visit highlight",
      "News All-sources merge uses a short per-outlet RSS timeout so a dead source (for example InFurNation) fails within about five seconds instead of holding the whole feed",
      "Landing splash pool includes a gag clarifying this is not pawdeck.store",
    ],
  },
  {
    date: "2026-09-20",
    title: "News mode and clearer tips",
    items: [
      "Flayrah site mode became News: one merged feed from Flayrah, Dogpatch Press, and later outlets, with source chips and routes under /news (old /flayrah links still redirect)",
      "One-time tips are bottom-right toasts (Don’t show again + OK), including clearer first-visit help for Post Suggester and Favorite Analyzer",
      "SFW only turns on when you type rating:safe / rating:s on supported sites; Federated Suggester/Analyzer sample every enabled child and warn if some sites fail",
      "Phone tip toasts use a full-width bottom bar with safe-area padding",
    ],
  },
  {
    date: "2026-09-18",
    title: "Mobile, Federated Pools, and landing",
    items: [
      "Mobile drawer closes after navigation, matches the phone breakpoint, and is narrower with a close button; fullscreen uses safe-area padding",
      "Compact cards on touch: first tap expands controls, second opens the post; Settings is full-page on phone and an overlay on desktop",
      "Federated Pools sidebar Sites in Pools toggles which children (and Tailspace comics) appear; pool cover thumbnails load more reliably",
      "Global SFW only (toolbar / sidebar / Post settings) forces safe rating and hides non-safe posts in list feeds",
      "Baxter logo refresh (longer ears, clearer tail, PawFeed wordmark); landing Info dialog (About / Changelog / TOS) plus Settings gear on the hero",
      "Landing no longer reopens on Federated after a prior Federated session; hero splash under PawFeed types once and stays until you ask for another",
    ],
  },
  {
    date: "2026-09-17",
    title: "PawFeed brand, Federated Pools, and hardening",
    items: [
      "Public product name is PawFeed (Live: pawfeed.tonypup.box.ca); host paths and GitHub stay m-e621",
      "Site mode Unified renamed to Federated in the UI; Landing chips multi-select which children join Search",
      "Federated Pools merges e621/e6ai (plus Furbooru / Inkbunny / optional Tailspace comics) with origin badges and watched +N badges",
      "Many one-time tips (Appearance → Reset tooltips): Federated, Local, Layout, pools, fullscreen, Saved posts, blacklist, Fluffle, remux, Suggester, Analyzer, and more",
      "Safer Settings backup/restore, searchable settings hub, media-download and Fluffle redirect hardening",
    ],
  },
  {
    date: "2026-09-13",
    title: "Earlier September: sites, Local, and federation",
    items: [
      "Added or expanded site modes for SoFurry, Itaku, Weasyl, FurAffinity, Furbooru, Inkbunny, and Tailspace (posts + comics)",
      "Local library: browse a folder, fuzzy tags, favorites, remux, and portable sidecars (browser or Tauri)",
      "Federated (then called Unified) date-merge feed with child-site toggles, shared Score / Favs / Random, and landing mode chips",
      "Fluffle reverse-image search; story / PDF / RTF / DOCX fullscreen; music on remote modes; pools readers with watch",
      "Mode-independent Saved posts; fullscreen comments rail; offline keeps Local available",
      "Scent Marks guestbook on the landing page; public rebrand and self-host sync lock for overlapping deploys",
    ],
  },
];

export const changelogIntro =
  "PawDeck is a personal multi-site fork of Material e621. Highlights below cover the fork’s shipped work; older upstream commits are on GitHub.";
