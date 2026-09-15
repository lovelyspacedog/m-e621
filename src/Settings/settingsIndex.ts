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
  { label: "Unified feed sites", keywords: ["unified", "child", "federation"], section: "account", hash: "unified" },
  { label: "Copy starred tags / blacklist", keywords: ["sync", "copy", "starred", "favorites"], section: "account", hash: "sync" },
  { label: "Favorites proxy", keywords: ["proxy", "favorites api", "vercel"], section: "account", hash: "proxy" },
  { label: "e621 / e6ai API key", keywords: ["e621", "e6ai", "api key", "username"], section: "account", hash: "accounts" },
  { label: "FurAffinity cookies", keywords: ["furaffinity", "cookie", "fa_cookie"], section: "account", hash: "accounts" },
  { label: "Inkbunny login", keywords: ["inkbunny", "password", "sid"], section: "account", hash: "accounts" },

  // Posts
  { label: "Post buttons", keywords: ["buttons", "fullscreen", "details"], section: "posts", hash: "buttons" },
  { label: "Go fullscreen", keywords: ["fullscreen"], section: "posts", hash: "buttons" },
  { label: "Grid layout", keywords: ["grid", "layout", "feed", "compact"], section: "posts", hash: "layout" },
  { label: "Full-width feed", keywords: ["full-width", "full width", "layout"], section: "posts", hash: "layout" },
  { label: "Compact cards", keywords: ["compact", "hover", "tags"], section: "posts", hash: "layout" },
  { label: "Autoplay video", keywords: ["autoplay", "video", "mute", "silent"], section: "posts", hash: "media" },
  { label: "Animate GIFs", keywords: ["gif", "animate"], section: "posts", hash: "media" },
  { label: "Video volume", keywords: ["volume", "playback", "speed", "muted"], section: "posts", hash: "media" },
  { label: "Slideshow interval", keywords: ["slideshow", "interval"], section: "posts", hash: "slideshow" },
  { label: "Card auto-next", keywords: ["auto-next", "autonext", "card"], section: "posts", hash: "slideshow" },
  { label: "Data saver", keywords: ["data saver", "quality", "preview"], section: "posts", hash: "loading" },
  { label: "Lazy load", keywords: ["lazy", "load", "images"], section: "posts", hash: "loading" },
  { label: "Posts per page", keywords: ["limit", "fetch", "page size"], section: "posts", hash: "loading" },
  { label: "Save locally", keywords: ["save", "download", "folder", "path template"], section: "posts", hash: "local" },
  { label: "Local browse folder", keywords: ["local", "browse", "folder"], section: "posts", hash: "local" },

  // Appearance
  { label: "Themes", keywords: ["theme", "color", "browse themes"], section: "appearance", hash: "colors" },
  { label: "Primary / accent colors", keywords: ["primary", "secondary", "accent", "background", "sidebar", "toolbar"], section: "appearance", hash: "colors" },
  { label: "Dark mode", keywords: ["dark", "light"], section: "appearance", hash: "colors" },
  { label: "Fullscreen transitions", keywords: ["transition", "animation"], section: "appearance", hash: "chrome" },
  { label: "Navigation type", keywords: ["sidebar", "toolbar", "floating", "navigation"], section: "appearance", hash: "chrome" },
  { label: "Logo style", keywords: ["logo"], section: "appearance", hash: "chrome" },
  { label: "Rating stripe", keywords: ["rating", "stripe"], section: "appearance", hash: "chrome" },

  // Blacklist
  { label: "Blacklist mode", keywords: ["hide", "blur", "blackout", "blacklist"], section: "blacklist", hash: "mode" },
  { label: "Custom blacklist", keywords: ["tags", "blacklist", "custom"], section: "blacklist", hash: "custom" },
  { label: "Import e621 blacklist", keywords: ["import", "paste", "e621"], section: "blacklist", hash: "import" },

  // History
  { label: "Saved searches", keywords: ["saved", "search"], section: "history", hash: "saved" },
  { label: "Max history length", keywords: ["history", "max", "length"], section: "history", hash: "history" },

  // Other
  { label: "Keyboard shortcuts", keywords: ["shortcut", "hotkey", "keyboard"], section: "shortcuts" },
  { label: "Backup settings", keywords: ["backup", "download", "export", "json"], section: "restore", hash: "backup" },
  { label: "Restore settings", keywords: ["restore", "upload", "import", "reset"], section: "restore", hash: "restore" },
  { label: "Version / Force Update", keywords: ["version", "commit", "update", "storage"], section: "info" },
];

export function matchSettingsQuery(query: string): {
  sections: string[];
  controls: SettingsIndexEntry[];
} {
  const q = query.trim().toLowerCase();
  if (!q) return { sections: SETTINGS_SECTIONS.map((s) => s.section), controls: [] };

  const sectionHits = SETTINGS_SECTIONS.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.section.toLowerCase().includes(q),
  ).map((s) => s.section);

  const controls = SETTINGS_INDEX.filter((entry) => {
    const hay = [entry.label, ...entry.keywords].join(" ").toLowerCase();
    return hay.includes(q);
  });

  const fromControls = [...new Set(controls.map((c) => c.section))];
  const sections = [...new Set([...sectionHits, ...fromControls])];

  return { sections, controls };
}

export function settingsHref(entry: Pick<SettingsIndexEntry, "section" | "hash">): string {
  const base = `/settings/${entry.section}`;
  return entry.hash ? `${base}#${entry.hash}` : base;
}
