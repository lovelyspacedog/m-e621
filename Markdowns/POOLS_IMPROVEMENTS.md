# Pools module improvements

Checklist for improving e621/e6ai pools (`src/Pool/`, `WatchedPoolsStore`, shared `comicReader.ts`). Keep Tailspace on its own routes — do not merge into `/pools`.

## Highest impact

- [x] **Watch deltas** — Persist `lastSeenPostCount` / `lastSeenUpdatedAt` on watch; mark seen when opening a pool; show new-page badges / sort by activity on `/pools`.
- [x] **Cross-chunk fullscreen next/prev** — Wire `PoolPage` `loadPosts` so fullscreen advance fetches the next/previous chunk instead of stopping at chunk edges.
- [x] **Resume / deep-link** — Support `?post=` (and/or remember last post per pool) so opening a pool lands on that page in gallery, scroll, or fullscreen.
- [x] **Keyboard parity** — Chunk ←/→ (and optional gallery/scroll toggle); align with Tailspace reader keys without merging routes. Optional focus-trap audit.

## Browse & search

- [x] **Tags-mode API** — Prefer native pools filter (e.g. e621 `search[post_tags_match]`) instead of posts→`getPool` N+1; restore sort/category when possible.
- [x] **Name search pagination** — Avoid approximate `hasMore` from dual name+description fetches; single primary query or honest “also search descriptions” toggle.
- [x] **Batch hydration / covers** — Batch watched-pool and cover fetches; fall through later `post_ids` when first cover is missing, deleted, or blacklisted.
- [x] **Browse filters** — Hide inactive; filter by creator; show updated time in grid/list.

## Reader polish

- [x] **Blacklist gaps** — Explicit hidden-page placeholder, soft-blur, or “N hidden” chip so sequence numbers stay honest in hide mode.
- [x] **Bulk save** — Pool-level Save all / download chunk (mirrors Inkbunny gallery Save all/page) into Local.
- [x] **Shared reader chrome (optional)** — Next `comicReader` slice: shared page-index + keyboard (not Tailspace→`/pools`).

## Out of scope (for now)

- [x] ~~Inkbunny `/pools` UI~~ — shipped (open-by-id / watch / chips; no free-text name index).
- [x] ~~Furbooru galleries in Federated Pools~~ — shipped (`POOL_LIST_ORIGINS`; `?origin=furbooru`; standalone Furbooru `/pools`).
- [ ] ~~Merge Tailspace into Pools~~ — rejected; keep routes separate.
- [ ] Inkbunny free-text pool name scrape — still rejected (no official list API).

## Suggested ship order

1. Watch deltas  
2. Cross-chunk fullscreen  
3. Resume deep-link  
4. Tags API / hydration  
5. Keyboard + remaining polish  

## Progress

| Slice | Status | Notes |
| ----- | ------ | ----- |
| Checklist doc | Done | This file |
| Watch deltas | Done | lastSeen + badges + sort |
| Cross-chunk fullscreen | Done | PoolPage loadPosts |
| Resume / deep-link | Done | `?post=` + localStorage resume |
| Keyboard chunks | Done | ←/→ and `[`/`]` |
| Browse/search API | Done | post_tags_match, Desc toggle, batch ids, filters |
| Reader polish | Done | gaps/blur, save chunk/all, shared key helpers |
| Out of scope | — | Tailspace merge / IB name scrape |
