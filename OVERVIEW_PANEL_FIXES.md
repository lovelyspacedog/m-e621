# Overview panel fixes

Issues found by comparing Details → Overview screenshots in `~/Pictures/overviews` against adapters, `PostInfoList.vue`, `DetailsDialog.vue`, and `siteCapabilities.ts`.

Same modal shell everywhere; differences come from capability gates plus how complete each adapter fills `post.file`. Below are **correctable** problems (not intentional capability gaps).

## Display / UI bugs (cheap)

1. [x] **Sofurry Score `—` when likes are 0** — `post.score.total || "—"` treated `0` as missing. Now uses `Number.isFinite` so `0` shows.
2. [x] **Weasyl labeled “Score (N up − M down)” but stores views** — Views label + scalar engagement (with FA/IB).
3. [x] **Unknown dims always print `0×0 (0 MP)`** — Shows `—` when width/height are 0; still appends `· ext` when known.
4. [x] **Comments row on sites with no Comments tab** — Row gated on `modeSupportsComments`.
5. [x] **Sofurry “MD5” is the soft ID** — Hash row label is **Soft ID** for Sofurry (value still used for enrich fallback).
6. [x] **Local Sources is a dead link** — Sources row omitted for Local (Path already shown). Non-http sources render as plain text.

## Adapter / enrich gaps (real missing data)

7. [x] **Itaku never enriches on Overview open** — `enrichItakuPost` + `itakuMeta.detailsLoaded`; wired into `enrichRemote` / Details open.
8. [x] **Itaku `uncompressed_filesize` is MiB string, typed/used as bytes** — `itakuFilesizeBytes()` parses MiB → bytes (large values treated as already-bytes).
9. [x] **Itaku width/height hardcoded `0`** — No dims in API wire model. Mitigated by Overview `—` (#3). Client image probe deferred (no new API invent).
10. [x] **FurAffinity File size always `0`** — `fa_proxy` scrapes size from `.submission-content-stats` / info blocks when present; adapter maps `hit.size`. Still `—` when FA HTML has no size token.
11. [x] **FurAffinity dims sometimes stay `0×0` after enrich** — Detail path scrapes `#submissionImg` data-width/height (+ stats `NxN`); enrich merge keeps prior non-zero dims.
12. [x] **Weasyl / Sofurry size & dims never filled** — Sofurry already maps `meta.width/height` when present. Weasyl API media has no dims/size in adapter types. Overview shows `—` (#3) instead of `0×0`. No invented endpoints.
13. [x] **Inkbunny File size never mapped** — Confirmed: typed Inkbunny file/submission objects have no size field. Keep UI `—`; do not invent.

## Consistency polish (optional)

14. [x] **Itaku Score shows `(up − down)` for likes-only** — Itaku (and Sofurry) use scalar Score display.
15. [x] **Overview height noise** — Addressed by #3–#5 (no empty Comments, Soft ID label, dim dash).

## Not bugs (intentional)

- Missing Comments / Favorite / Share / Notes tabs → matches `siteCapabilities`.
- e6ai **Director** vs Artist → intentional.
- Furbooru **SHA-512** → intentional Philomena mapping.
- Local stripped chrome → intentional.

## Suggested priority

1. ~~Items **1–3, 5–6** — Overview honesty with small UI fixes.~~ Done
2. ~~Items **7–8** — Itaku File size actually works.~~ Done
3. ~~FA / Weasyl dim & size scrape or client probe (**10–12**).~~ Done (FA scrape; Weasyl/Sofurry honest dashes)
4. ~~Optional polish (**4, 9, 14–15**).~~ Done
