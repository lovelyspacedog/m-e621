# Discovery tools backlog

Checklist for sibling tools to **Post Suggester** and **Favorite Analyzer** (`src/Suggester/`, `src/Analyzer/`, `modeSupportsSuggester` / `modeSupportsFavoriteAnalyzer`). Personal discovery / insights surfaces — not new site modes.

Related: [FEATURES.md](./FEATURES.md) (general fork backlog), [NEWS-IMPROVEMENTS.md](./NEWS-IMPROVEMENTS.md) (News registry / watch authors / new-since-last-visit), Artist Dashboard (`src/ArtistDashboard/`, e621-family only).

## Explicit non-goals

- [ ] Do not put these tools on **Tailspace** or **News** chrome (same gate as Suggester / Analyzer).
- [ ] Do not invent Inkbunny / Weasyl favorite toggles.
- [ ] Do not fall through to the e621 client on foreign modes — mode-native favorite / history / query paths only.
- [ ] Do not add new reverse-image vendors beyond Fluffle (stills-only, ≤4 MiB, fail closed).
- [ ] Do not clone Artist Dashboard for every site; keep e621-family heatmap there.
- [ ] Do not invent new site modes or ToS-violating scrapes for these tools.

## Already shipped (do not reinvent)

- [x] **Post Suggester** — Taste profile from favorites → hybrid candidates → score/rank.
- [x] **Favorite Analyzer** — Tag frequency ranks from favorite samples; link into Suggester; JSON export.
- [x] **Artist Dashboard** — Artist heatmap / top posts / tag ranks (e621-family).
- [x] **Fluffle** — Exact reverse-image on stills.
- [x] **Saved searches / starred tags** — Groups, reorder, profile copy (language-gated).
- [x] **Federated Following** — Date-merged following feed (capable children).
- [x] **Watched pools / comics** — New-page badges (pools + Tailspace comics).

## Highest priority (same tool family)

Reuse favorite / query plumbing; Federated-aware; stay out of Tailspace/News.

- [x] **Artist Radar** — Rank artists by frequency in favorites, then “new since last check” per origin (Federated-aware). Watchlist digest rather than one-shot suggest. Persist last-seen cursors per artist/origin.
- [x] **Taste Diff** — Side-by-side top tags: you vs another user’s public favorites (or vs Local faves). Analyzer already samples; this compares two samples.
- [x] **History Insights** — Analyzer-style frequency UI over browse history (“what you look at” vs “what you save”). Gate on history being enabled per profile.
- [x] **Blacklist Coach** — From skips / faded posts / history, suggest tags to add to the blacklist; preview how many recent posts would disappear; optional apply to live profile blacklist.
- [x] **Saved-search Wake-up** — Per saved search: last hit count / “N new since last open,” one-click open. High value across multi-site profiles.
- [x] **Tools sidebar group** — Collapse Suggester / Analyzer / discovery tools / Dashboard under a Tools expander so the nav stays uncrowded.

## Medium priority (adjacent discovery)

- [ ] **Cross-post Finder** — Given a post (or Local file), find likely copies on other enabled sites via Fluffle + tag/artist heuristics. Stills-only; fail closed like current Fluffle gating; origin-aware results.
- [ ] **Pool / Series Suggester** — From favorite tags/artists, surface e621-family pools / Furbooru galleries / Inkbunny pools you have not opened. Capability-gated (`modeSupportsPools`); no fake pools on SoFurry/Itaku/Tailspace.
- [ ] **Similar Artists** — Co-occurrence on tags you favor (“if you like X’s tag mix, try Y”). Feed results into Suggester seed weights without new APIs.

## Lower priority (polish / portable taste)

- [ ] **Taste Pack export/import** — Portable JSON of top tags + weights. Analyzer already exports; round-trip into Suggester weights and/or starred tags.
- [ ] **Activity heatmap** — Personal version of Artist Dashboard: when *you* favorited/viewed, not when an artist posted. e621-family + Local first.

## Nearby but different surface (News)

Track in [NEWS-IMPROVEMENTS.md](./NEWS-IMPROVEMENTS.md); do not duplicate as Suggester/Analyzer siblings:

- [ ] News **source registry** then InFurNation / Furry Writers’ Guild.
- [ ] News **watch authors** (local author list → filter chip).
- [ ] News **new-since-last-visit** (optional notifications; last-seen cursor).
- [ ] News **same-story clustering** (fuzzy title + date across outlets).

## Suggested ship order

1. Artist Radar **or** Saved-search Wake-up (daily-driver value; small new UX surface)
2. Taste Diff (extends Analyzer sample path)
3. History Insights / Blacklist Coach (need honest history + fade/skip signals)
4. Similar Artists → Pool / Series Suggester (reuse Radar / Analyzer ranks)
5. Cross-post Finder (Fluffle + heuristics; careful allowlists)
6. Taste Pack + Activity heatmap (polish)

## Progress

| Slice | Status | Notes |
| ----- | ------ | ----- |
| Checklist doc | Done | This file |
| Artist Radar | Done | `/tools/radar` |
| Taste Diff | Done | `/tools/taste-diff` |
| History Insights | Done | `/tools/history` |
| Blacklist Coach | Done | `/tools/blacklist-coach` |
| Saved-search Wake-up | Done | `/tools/saved-wake` |
| Tools sidebar group | Done | `NavigationList` `v-list-group` |
| Cross-post Finder | Pending | |
| Pool / Series Suggester | Pending | |
| Similar Artists | Pending | |
| Taste Pack | Pending | |
| Activity heatmap | Pending | |
| Non-goals | Held | Tailspace/News chrome, fav toggles, new sites, extra reverse-image vendors |
