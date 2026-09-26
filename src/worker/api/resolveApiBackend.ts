/**
 * Prefer explicit SiteMode; fall back to hostname only when mode omitted.
 * Site-mode checklist (do NOT invent a plugin framework; refuse drive-by sites):
 * types + SITE_MODE_URLS + empty profile + SiteModeStore + nav/router guards +
 * worker adapter + Vite/serve.py proxy + siteCapabilities flags.
 * Never fall through to the e621 client (comments/notes/pools/analyzer/…).
 * Post Suggester is multi-mode via AnalyzeService; Tailspace/News/u18chan still blocked here.
 * UA / `_client`: `PawDeck/<git>`. See Markdowns/AI_CONTEXT.md.
 */

import type { SiteMode } from "@/services/types";

const isFurbooruUrl = (baseUrl: string) => baseUrl.includes("furbooru.org");
const isInkbunnyUrl = (baseUrl: string) => baseUrl.includes("inkbunny.net");
const isFurAffinityUrl = (baseUrl: string) =>
  /(?:^|\.)furaffinity\.net(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isTailspaceUrl = (baseUrl: string) =>
  /(?:^|\.)tailspace\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isU18chanUrl = (baseUrl: string) =>
  /(?:^|\.)u18chan\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isWeasylUrl = (baseUrl: string) =>
  /(?:^|\.)weasyl\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isItakuUrl = (baseUrl: string) =>
  /(?:^|\.)itaku\.ee(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isSofurryUrl = (baseUrl: string) =>
  /(?:^|\.)sofurry\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isMurrtubeUrl = (baseUrl: string) =>
  /(?:^|\.)murrtube\.net(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isBadpupsUrl = (baseUrl: string) =>
  /(?:^|\.)badpups\.com(?:\/|$)/i.test(baseUrl.replace(/^https?:\/\//i, ""));
const isNewsUrl = (baseUrl: string) =>
  /(?:^|\.)(?:flayrah\.com|dogpatch\.press)(?:\/|$)/i.test(
    baseUrl.replace(/^https?:\/\//i, ""),
  );

export type ApiBackend =
  | "e621"
  | "furbooru"
  | "inkbunny"
  | "tailspace"
  | "u18chan"
  | "furaffinity"
  | "weasyl"
  | "itaku"
  | "sofurry"
  | "murrtube"
  | "badpups"
  | "news";

export const resolveApiBackend = (baseUrl: string, mode?: SiteMode): ApiBackend => {
  if (mode === "furbooru") return "furbooru";
  if (mode === "inkbunny") return "inkbunny";
  if (mode === "furaffinity") return "furaffinity";
  if (mode === "tailspace") return "tailspace";
  if (mode === "u18chan") return "u18chan";
  if (mode === "news") return "news";
  if (mode === "weasyl") return "weasyl";
  if (mode === "itaku") return "itaku";
  if (mode === "sofurry") return "sofurry";
  if (mode === "murrtube") return "murrtube";
  if (mode === "badpups") return "badpups";
  if (mode === "e621" || mode === "e6ai" || mode === "local") return "e621";
  if (isFurbooruUrl(baseUrl)) return "furbooru";
  if (isInkbunnyUrl(baseUrl)) return "inkbunny";
  if (isFurAffinityUrl(baseUrl)) return "furaffinity";
  if (isTailspaceUrl(baseUrl)) return "tailspace";
  if (isU18chanUrl(baseUrl)) return "u18chan";
  if (isNewsUrl(baseUrl)) return "news";
  if (isWeasylUrl(baseUrl)) return "weasyl";
  if (isItakuUrl(baseUrl)) return "itaku";
  if (isSofurryUrl(baseUrl)) return "sofurry";
  if (isMurrtubeUrl(baseUrl)) return "murrtube";
  if (isBadpupsUrl(baseUrl)) return "badpups";
  return "e621";
};
