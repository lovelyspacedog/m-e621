# Baxter logo checklist

Mascot name: **Baxter** (basset-hound hex mark for PawFeed).

Preview files (design reference):

- `Markdowns/baxter-preview/baxter-face.svg` — face mark
- `Markdowns/baxter-preview/baxter-text.svg` — PawFeed wordmark on hex
- `Markdowns/baxter-preview/baxter-face.png` / `baxter-text.png` — raster for review

Shipped in `src/App/AppLogo.vue` and `public/favicon.svg` (PWA assets regenerated from the SVG).

---

## Scope

- [x] **1 — Stronger basset read** — Longer, thinner floppy ears; soft crease where each ear meets the hex so he reads hound (not rabbit/bear) at sidebar size.
- [x] **2 — Clearer tail** — Visible dark-blue stem + magenta tip tucked below the left ear so the left-side mark reads as a tail, not a stray ear nub.
- [x] **6 — PawFeed wordmark** — Replace `text` logo `e621` + Roboto with **PawFeed** and Fredoka SemiBold (`src/assets/fonts/Fredoka-SemiBold.ttf`, OFL).
- [x] **8 — Motion** — Rarer double-blink on the face mark; clearer head tilt on the loader pulse (ear/tail wiggles kept).
- [x] **10 — Name: Baxter** — `aria-label` and comments name Baxter; no forehead lettermark.

## Out of scope (for this pass)

- Catchlights / eye redesign (#3)
- Brow–mouth expression retune (#4)
- Favicon-only simplification pass (#9) — follow-up after face ships

## Approval gate

- [x] User signs off on preview face + wordmark
- [x] Implement in `AppLogo.vue` (+ specs); item **8** as CSS (double-blink + loader tilt)
- [x] Changelog note; commit / push / deploy per PawFeed skill

## Notes

- Heritage hex fill stays e621 blue `rgb(0, 84, 159)`; accent stays magenta `rgb(232, 49, 253)` / inner ear `rgb(255, 205, 241)`.
- Product name in UI remains `APP_NAME` (`PawFeed`); repo/host paths stay `m-e621`.
