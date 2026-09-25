# Feature ideas — PawDeck

Suggestions from 2026-09-23. Checkboxes track whether each idea has been built.

**Status:** `[ ]` open · `[~]` deferred · `[x]` done

These sit on pieces that already exist: Federated merge, Local sidecars, Saved posts, and the discovery tools. Another site adapter is a lower priority than these.

---

## Daily use

- [x] **Home overview.** Sidebar Home opens `/home`: mode shortcuts (browse, Following, Pools, Saved, News), wake `+N` rows, watched pools/comics (links; live +N still on Pools/Comics), Saved/collections counts, and History Insights / Activity heatmap teasers. Artist Dashboard stays under Tools on e621/e6ai.
- [x] **Collapse duplicates in the Federated feed.** The same upload often appears on e621, Furbooru, and FurAffinity as separate cards. Cross-post Finder already does Fluffle exact-match plus artist/character chips, but only as a separate tool. Fold a lightweight “same post” group into the date-merge: keep the highest-score origin, show the others as chips.
- [x] **Write source tags onto untagged Local files.** Local search depends on `.me621-tags.json`. Save Locally already merges tags on download. Add a bulk “match this still on Fluffle and write the tags” action for the current Local filter. Stills only, same 4 MiB Fluffle limit.
- [x] **Saved-search badges.** Wake-up (`/tools/saved-wake`) already checks whether a saved search has posts newer than the last open. Show a small +N on the sidebar saved-search rows, the same way watched pools show new pages.
- [x] **Named collections on top of Saved.** `/saved` is a mode-independent list with the Posts layout controls. Collections (a post can sit in more than one) cover “read later,” “refs,” and “playlist seeds.” Store them on the existing `savedPosts` tree.
- [x] **Audio queue for the current filter.** FurAffinity, Weasyl, SoFurry, and Local already play music inline, and playback position is remembered. A queue that walks audio hits in the current search, and continues in fullscreen, is the missing half.
- [x] **Push one blacklist through the Federated tag map.** Blacklists are per profile. e621 ↔ e6ai can already merge or replace. Add “apply these lines to every signed-in child,” running them through the existing metatag remap (`favs:me`, `order:`, ignored tokens).

## Larger

- [x] **Host-side sync of settings and Saved.** Durable state lives in IndexedDB (`material-e621`). `serve.py` already keeps Scent Marks on disk under `~/.config/m-e621/`. A single personal snapshot there, using the sanitized backup format, would let the PWA and the Tauri build share Saved, collections, and dismissed tips.
