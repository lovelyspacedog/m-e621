# PawFeed mobile web checklist

- **Source:** code-path review 2026-09-18 (read-only analysis → this checklist)
- **Status key:** `[ ]` open · `[~]` in progress · `[x]` done · `[-]` deferred
- Work top-down. Prefer capability checks over UA sniffing.
- Do not change: localforage names, route guards, COOP/COEP, Rollup `iife`, package manager.

---

## High

- [x] **M1** Drawer stays open after navigation — close on `router.afterEach` when `mobile` (`App.vue`)
- [x] **M12** Settings from sidebar leaves drawer open — same close path as M1 (`App.vue` afterEach)
- [x] **M2** Hamburger vs drawer breakpoint mismatch (960–1279px) — nav-icon gated on `mobile` (`App.vue`)
- [x] **M3** Fullscreen `100vh` + no safe-area — `dvh` + `env(safe-area-inset-*)`; `viewport-fit=cover` (`FullscreenDialog.vue`, `index.html`)
- [x] **M4** Comments rail too wide on phones — full-bleed overlay below `smAndDown`; clamp floor vs viewport (`FullscreenDialog.vue`)

## Medium

- [x] **M5** Compact cards “tap to expand” broken for stills — first tap expands on `(hover: none)` (`Post.vue`, `PostPreview.vue`)
- [x] **M6** Settings mobile→desktop resize stays full-page `/settings*` — convert to overlay (`App.vue`)
- [x] **M7** No in-app history on phone — Posts toolbar search-history icon always shown (`PostsPage.vue`); browser back/forward stay OS on mobile
- [x] **M8** Notes `open-on-hover` poor on touch — click when `(hover: none)` (`NotesOverlay.vue`)
- [x] **M9** Hammer swipe vs pull-to-refresh — `touch-action: none` on zoom surface; `manipulation` on video/audio (`ZoomPanImage.vue`)
- [x] **M10** Local mode copy oversells “Chromium” on mobile — desktop Chromium / Tauri messaging (`LocalFolderPicker.vue`)
- [x] **M11** PWA `display: "standalone"` + banner safe-area top (`vite.config.ts`, `PwaUpdateBanner.vue`)

## Low

- [x] **M13** DText spoilers hover-only — tap / focus / `:focus-within` (`DText.vue`)
- [x] **M14** Offline: snackbar offers Switch to Local or Flayrah (`SiteModeStore.ts`)
- [x] **M15** E2E mobile viewport projects — Pixel 7 / iPhone 13 / iPad Mini + smoke (`playwright.config.ts`, `e2e/vue.spec.ts`)

## Info / preserve (do not regress)

- [x] **M16** View-transition first-load + Landing single-root (blank `v-main` fix) — keep
- [x] **M17** Suggestions / SavedSearchNav `@media (hover: none)` chrome — keep as pattern

---

## Progress log

| When | Item | Note |
| --- | --- | --- |
| 2026-09-18 | checklist | Created from mobile analysis; started High fixes |
| 2026-09-18 | M1–M6, M8–M10, M12, M11~ | Staged locally (390px drawer close verified); no commit yet |
| 2026-09-18 | M7, M11, M13–M15 | Remaining items staged; checklist complete |
| 2026-09-18 | M15 note | Config + smoke added; local `npx playwright test` needs `npx playwright install` (browsers missing in this env) |
