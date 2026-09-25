/** Static index for Settings hub search → section route + optional in-page anchor */

export type SettingsIndexEntry = {
  label: string;
  keywords: string[];
  /** Route path under /settings/ */
  section: string;
  /** Anchor without settings- prefix */
  hash?: string;
};

export const SETTINGS_SECTIONS = [
  {
    section: "account",
    title: "API & Account",
    icon: "mdi-account",
    color: "yellow-darken-3",
  },
  {
    section: "posts",
    title: "Posts",
    icon: "mdi-format-list-text",
    color: "brown-darken-3",
  },
  {
    section: "appearance",
    title: "Appearance",
    icon: "mdi-palette",
    color: "pink-darken-1",
  },
  {
    section: "blacklist",
    title: "Blacklist",
    icon: "mdi-playlist-remove",
    color: "red-darken-1",
  },
  {
    section: "history",
    title: "History & Saved Searches",
    icon: "mdi-format-list-bulleted",
    color: "green-darken-1",
  },
  {
    section: "shortcuts",
    title: "Keyboard Shortcuts",
    icon: "mdi-keyboard",
    color: "black",
  },
  {
    section: "restore",
    title: "Backup and Restore",
    icon: "mdi-backup-restore",
    color: "blue-darken-1",
  },
  {
    section: "info",
    title: "Info",
    icon: "mdi-information",
    color: "teal-darken-2",
  },
] as const;

export const SETTINGS_INDEX: SettingsIndexEntry[] = [
  // Account
  { label: "API & Account", keywords: ["account", "login", "credentials", "api key"], section: "account", hash: "accounts" },
  { label: "Federated feed sites", keywords: ["unified", "federated", "child", "federation"], section: "account", hash: "unified" },
  { label: "Federated Following", keywords: ["following", "watch", "feed source", "federated", "unified"], section: "account", hash: "unified" },
  { label: "Copy starred tags / blacklist", keywords: ["sync", "copy", "starred", "favorites"], section: "account", hash: "sync" },
  { label: "Favorites proxy", keywords: ["proxy", "favorites api", "vercel"], section: "account", hash: "proxy" },
  { label: "e621 / e6ai API key", keywords: ["e621", "e6ai", "api key", "username", "credentials", "auth"], section: "account", hash: "accounts" },
  { label: "FurAffinity cookies", keywords: ["furaffinity", "cookie", "fa_cookie", "auth"], section: "account", hash: "accounts" },
  { label: "Inkbunny login", keywords: ["inkbunny", "password", "sid", "auth"], section: "account", hash: "accounts" },

  // Posts
  { label: "Post buttons", keywords: ["buttons", "fullscreen", "details"], section: "posts", hash: "buttons" },
  { label: "Go fullscreen", keywords: ["fullscreen"], section: "posts", hash: "buttons" },
  { label: "SFW only", keywords: ["sfw", "safe", "nsfw", "rating", "work safe"], section: "posts", hash: "layout" },
  { label: "Grid layout", keywords: ["grid", "layout", "feed", "compact"], section: "posts", hash: "layout" },
  { label: "Full-width feed", keywords: ["full-width", "full width", "layout"], section: "posts", hash: "layout" },
  { label: "Compact cards", keywords: ["compact", "hover", "tags"], section: "posts", hash: "layout" },
  { label: "Infinite scroll", keywords: ["infinite", "scroll", "autoload", "auto load", "next page", "pagination"], section: "posts", hash: "layout" },
  { label: "Autoplay video", keywords: ["autoplay", "video", "mute", "silent"], section: "posts", hash: "media" },
  { label: "Animate GIFs", keywords: ["gif", "animate"], section: "posts", hash: "media" },
  { label: "Video volume", keywords: ["volume", "playback", "speed", "muted"], section: "posts", hash: "media" },
  { label: "Separate audio prefs", keywords: ["audio", "music", "volume"], section: "posts", hash: "media" },
  { label: "Per-site playback overrides", keywords: ["origin", "playback", "furaffinity", "per site"], section: "posts", hash: "media" },
  { label: "Slideshow interval", keywords: ["slideshow", "interval"], section: "posts", hash: "slideshow" },
  { label: "Card auto-next", keywords: ["auto-next", "autonext", "card"], section: "posts", hash: "slideshow" },
  { label: "Data saver", keywords: ["data saver", "quality", "preview"], section: "posts", hash: "loading" },
  { label: "Lazy load", keywords: ["lazy", "load", "images"], section: "posts", hash: "loading" },
  { label: "Posts per page", keywords: ["limit", "fetch", "page size"], section: "posts", hash: "loading" },
  { label: "Sidebar suggestion limit", keywords: ["suggestions", "sidebar", "tags", "limit"], section: "posts", hash: "loading" },
  { label: "Save locally", keywords: ["save", "download", "folder", "path template"], section: "posts", hash: "local" },
  { label: "Open in Local after save", keywords: ["open in local", "after save"], section: "posts", hash: "local" },
  { label: "Local browse folders", keywords: ["local", "browse", "folder", "folders"], section: "posts", hash: "local" },

  // Appearance
  { label: "Themes", keywords: ["theme", "color", "browse themes"], section: "appearance", hash: "colors" },
  { label: "Primary / accent colors", keywords: ["primary", "secondary", "accent", "background", "sidebar", "toolbar"], section: "appearance", hash: "colors" },
  { label: "Dark mode", keywords: ["dark", "light"], section: "appearance", hash: "colors" },
  { label: "Fullscreen transitions", keywords: ["transition", "animation", "fullscreen"], section: "appearance", hash: "chrome" },
  { label: "Route transitions", keywords: ["route", "page transition", "navigation animation"], section: "appearance", hash: "chrome" },
  { label: "Navigation type", keywords: ["sidebar", "toolbar", "floating", "navigation"], section: "appearance", hash: "chrome" },
  { label: "Logo style", keywords: ["logo"], section: "appearance", hash: "chrome" },
  { label: "Rating stripe", keywords: ["rating", "stripe"], section: "appearance", hash: "chrome" },
  { label: "Paw cursor", keywords: ["paw", "cursor", "pointer"], section: "appearance", hash: "chrome" },
  { label: "Hide install prompt", keywords: ["install", "pwa", "prompt"], section: "appearance", hash: "chrome" },

  // Blacklist
  { label: "Blacklist mode", keywords: ["hide", "blur", "blackout", "blacklist"], section: "blacklist", hash: "mode" },
  { label: "Copy blacklist between sites", keywords: ["sync", "copy", "blacklist"], section: "blacklist", hash: "sync" },
  { label: "Push blacklist to Federated children", keywords: ["sync", "push", "federated", "blacklist", "remap"], section: "blacklist", hash: "sync" },
  { label: "Custom blacklist", keywords: ["tags", "blacklist", "custom"], section: "blacklist", hash: "custom" },
  { label: "Import e621 blacklist", keywords: ["import", "paste", "e621"], section: "blacklist", hash: "import" },

  // History
  { label: "Saved searches", keywords: ["saved", "search"], section: "history", hash: "saved" },
  { label: "Max history length", keywords: ["history", "max", "length"], section: "history", hash: "history" },

  // Other
  { label: "Keyboard shortcuts", keywords: ["shortcut", "hotkey", "keyboard", "keybind"], section: "shortcuts" },
  { label: "Backup settings", keywords: ["backup", "download", "export", "json"], section: "restore", hash: "backup" },
  { label: "Sanitized backup", keywords: ["sanitized", "no credentials", "strip keys"], section: "restore", hash: "backup" },
  { label: "Host settings sync", keywords: ["host", "sync", "push", "pull", "tauri", "server"], section: "restore", hash: "host-sync" },
  { label: "Restore settings", keywords: ["restore", "upload", "import", "reset"], section: "restore", hash: "restore" },
  { label: "Saved posts library", keywords: ["bookmarks", "saved posts", "clear library"], section: "restore", hash: "library" },
  { label: "Watched pools library", keywords: ["watched", "pools", "clear library"], section: "restore", hash: "library" },
  { label: "Watched comics library", keywords: ["watched", "comics", "tailspace", "clear library"], section: "restore", hash: "library" },
  { label: "Reset section", keywords: ["partial reset", "reset posts", "reset appearance"], section: "restore", hash: "partial" },
  { label: "Color scheme", keywords: ["system", "dark", "light", "os theme"], section: "appearance", hash: "colors" },
  { label: "Prompts", keywords: ["install", "github", "migration", "hide prompt"], section: "appearance", hash: "prompts" },
  { label: "Reset tooltips", keywords: ["tooltip", "tips", "reset", "federated", "following", "local", "layout", "pools", "watched comics", "fullscreen", "saved posts", "blacklist", "tailspace", "fluffle", "remux", "suggester", "analyzer", "radar", "taste diff", "history insights", "blacklist coach", "wake-up", "cross-post", "similar artists", "taste pack", "heatmap", "discovery", "news", "flayrah", "dogpatch", "starred", "don't show", "dialog"], section: "appearance", hash: "prompts" },
  { label: "Version / Force Update", keywords: ["version", "commit", "update", "storage"], section: "info" },
  { label: "Pull from Git", keywords: ["git", "pull", "sync", "deploy"], section: "info" },
  { label: "Storage persistence", keywords: ["storage", "quota", "persist", "indexeddb"], section: "info" },
  { label: "Debug logging", keywords: ["debug", "verbose", "console", "logging"], section: "info" },
];

/** Synonyms expand the query so e.g. “hotkey” finds Keyboard Shortcuts. */
const SETTINGS_SYNONYMS: Record<string, string[]> = {
  hotkey: ["shortcut", "keyboard"],
  keybind: ["shortcut", "keyboard"],
  theme: ["appearance", "color", "dark"],
  login: ["account", "credentials", "api"],
  password: ["account", "credentials", "inkbunny", "tailspace"],
  download: ["backup", "save", "export"],
  import: ["restore", "upload", "blacklist"],
  mute: ["volume", "playback", "audio"],
  gif: ["animate", "media"],
  folder: ["local", "save"],
  bookmark: ["saved posts", "library"],
  pool: ["watched", "library"],
  comic: ["watched", "tailspace", "library"],
};

const tokenMatchesHay = (hay: string, token: string) => {
  if (hay.includes(token)) return true;
  return (SETTINGS_SYNONYMS[token] || []).some((syn) => hay.includes(syn));
};

export function matchSettingsQuery(query: string): {
  sections: string[];
  controls: SettingsIndexEntry[];
} {
  const raw = query.trim().toLowerCase();
  if (!raw) return { sections: SETTINGS_SECTIONS.map((s) => s.section), controls: [] };

  const tokens = raw.split(/\s+/).filter(Boolean);

  const entryMatches = (entry: SettingsIndexEntry) => {
    const hay = [entry.label, ...entry.keywords].join(" ").toLowerCase();
    return tokens.every((token) => tokenMatchesHay(hay, token));
  };

  const sectionHits = SETTINGS_SECTIONS.filter((s) => {
    const hay = `${s.title} ${s.section}`.toLowerCase();
    return tokens.every((token) => tokenMatchesHay(hay, token));
  }).map((s) => s.section);

  const controls = SETTINGS_INDEX.filter(entryMatches);
  const fromControls = [...new Set(controls.map((c) => c.section))];
  const sections = [...new Set([...sectionHits, ...fromControls])];

  return { sections, controls };
}

export function settingsHref(entry: Pick<SettingsIndexEntry, "section" | "hash">): string {
  const base = `/settings/${entry.section}`;
  return entry.hash ? `${base}#${entry.hash}` : base;
}
