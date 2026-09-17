# PENDING_DOCS

Untracked survey notes for doc/changelog updates that parallel agents could not apply because `README.md`, `README-CONTINUED.md`, and/or `src/Landing/changelog.ts` were foreign-dirty.

## Convention

- Agents write `PENDING_DOCS/YYYYMMDD-HHMMSS-<slug>.md` (normal prose).
- Files under this directory are **gitignored** (except this README). Do not commit them.
- A later pass surveys these notes and applies the deferred README / changelog bullets.

## Note contents

Each file should include: task summary, commit SHA (if known), code paths changed, the exact doc/changelog bullets to add, and which hotspot files were blocked.
