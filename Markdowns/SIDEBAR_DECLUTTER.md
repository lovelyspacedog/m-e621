# Sidebar declutter checklist

Goal: first viewport is navigation + a few saved searches; page-local noise stays behind collapse / menus / hover.

## High priority

- [x] **Collapse “Sites in this search” by default** — Collapsible section with summary when closed (`N/M sites`). Keep Defaults / Auth only on the header. Persist open/closed in `localStorage`.
- [x] **Compact site toggles** — Keep switches for now inside the collapsed panel (summary + collapse is the main win). Optional later: chips / 2-col icons.
- [x] **Layout toggles → one menu** — Replace the four always-visible switches (Full-width, Grid, Compact, Auto-next) with a single Layout row that opens a compact menu. Full controls remain in Settings → Posts.
- [x] **Tags on this page: less chrome** — Default fetch limit **12** (was 40; `configVersion` **36** migrates prior default). Show first 12 with **Show more**. Star / ⋮ only on hover (or focus). Counts stay visible.

## Medium priority

- [x] **Collapsible section chrome** — Unified sites + Tags use the same header + chevron pattern; remember open/closed.
- [x] **Progressive disclosure for Unified** — Search / Following always visible; site list only when the sites section is expanded. Following hint as tooltip/`title` on Following, not a permanent row.
- [x] **Sticky primary vs scroll secondary** — Pin logo + Home + Site switcher; saved searches, portal blocks, and trailing nav scroll below.

## Polish

- [x] **Keyboard hint → tooltip** — Move `j/k` / Space hint off the permanent subtitle; put it on the Layout control (keyboard icon tooltip).
- [x] **Blacklist count → chip** — Replace the overline with a small tonal chip.
- [x] **Saved-search chrome on hover** — Drag handles and ⋮ only visible on hover/focus (group headers keep always-visible menus for discoverability of add/rename).

## Out of scope (optional later)

- Chip multi-select or icon grid for Unified sites
- Moving layout prefs entirely out of the sidebar
