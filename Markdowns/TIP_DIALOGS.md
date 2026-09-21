# Tip toasts (“Don’t show this again”)

PawFeed one-time tip toasts share a small persistence scheme so new tips can reuse the same UI and reset path.

This is **not** the older Appearance → Prompts switches (`hideGithubInfo`, `hideMigrationInfo`, `hideInstallPrompt`). Those stay independent booleans. Tip toasts use `appearance.dismissedTips` only.

## Pieces

| Piece | Role |
| --- | --- |
| `appearance.dismissedTips` | `Record<string, boolean>` in persisted settings (`configVersion` ≥ 45). Key = tip id, `true` = dismissed. |
| `useAppearanceStore()` | `isTipDismissed(id)`, `dismissTip(id)`, `resetTips()` (clears the whole map). |
| `useTipQueueStore()` | Transient FIFO so only one tip toast is visible at a time; exposes height for snackbar offset. Not persisted. |
| `src/misc/TipDialog.vue` | Shared bottom-right toast: title, body slot, **Don’t show this again** checkbox, **OK**. Non-blocking (no scrim). Pins to the visual viewport (safe-area + soft-keyboard friendly). On narrow viewports spans the bottom with a full-width **OK** and max-height scroll. |
| Appearance → Prompts → **Reset tooltips** | Calls `resetTips()` so dismissed tips can show again. Searchable via settings index. |

Defaults and migration live in `src/services/defaultSettings.ts` and `src/services/PersistanceService.ts` (v45 + a post-migration guard if `dismissedTips` is missing).

## Runtime flow

```text
Trigger condition becomes true
        │
        ▼
isTipDismissed(tipId)? ──yes──► do nothing
        │ no
        ▼
open TipDialog (v-model = true) → enqueue tipId
        │
        ▼
Already another tip showing? ──yes──► wait in queue (mounted, hidden)
        │ no
        ▼
Show bottom-right toast (head of queue)
        │
        ▼
User taps OK
        │
        ├─ checkbox checked ──► dismissTip(tipId)  (persisted)
        └─ unchecked ─────────► only close; tip can show next trigger
        │
        ▼
dequeue → next queued tip (if any) becomes visible

Transient AppSnackbar messages stack above the active tip toast (bottom offset).
```

`TipDialog` resets the checkbox each time this tip becomes the visible head. Dismissal is written only when the checkbox is checked at OK time.

## Current tips

Ids are centralized in `src/misc/tipIds.ts`. The shipping checklist is [TIP_CHECKLIST.md](./TIP_CHECKLIST.md).

### Federated mode

- **Tip id:** `federated-mode`
- **Host:** `src/App.vue` (singleton — do not mount a second copy in both landing chips and the sidebar switcher)
- **Open when:** `siteMode.isUnified` goes from false → true and the tip is not dismissed
- **Copy:** explains landing chip multi-select, greyed sites, exit via Federated / close, Following via sidebar

### Other shipped tips

See [TIP_CHECKLIST.md](./TIP_CHECKLIST.md) for host, trigger, and copy intent for every high/medium/low tip (`pools-origin-badge`, `federated-following`, `local-mode`, `feed-layout`, `pool-reader`, and the medium/low set).

## Adding a future tip

1. **Pick a stable tip id** (kebab-case string), e.g. `pools-origin-badge`. Never rename casually — dismissal is keyed by this string in user settings. Add it to `TIP_IDS` in `src/misc/tipIds.ts` and to [TIP_CHECKLIST.md](./TIP_CHECKLIST.md).

2. **Mount one `TipDialog`** near the feature (or in `App.vue` if several surfaces can open it):

```vue
<TipDialog
  :tip-id="TIP_IDS.poolsOriginBadge"
  title="Pool origin badges"
  v-model="poolsTipOpen"
>
  <p>Explain the feature here in plain language.</p>
</TipDialog>
```

3. **Open only when not dismissed** (prefer `useTipOpen`):

```ts
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";

const { open: poolsTipOpen, tryOpenOnEdge } = useTipOpen(TIP_IDS.poolsOriginBadge);

// Example: first time the user opens Federated Pools
watch(someCondition, tryOpenOnEdge);
```

Use a false → true (or first-visit) edge so the toast does not reopen on every reactive tick while the condition stays true. If another tip is already showing, this tip waits in the queue until the head is dismissed with **OK**.

4. **Optional:** call `appearance.dismissTip("pools-origin-badge")` yourself if some other UI should permanently silence the tip without the toast (rare).

5. **Docs / discoverability (when shipping):**
   - Mention the tip in `src/Landing/changelog.ts` if users will see it.
   - No new settings row is required per tip — **Reset tooltips** already clears every id.
   - Extend the settings search keywords on the existing “Reset tooltips” entry only if a new tip name should be findable.
   - Check the box in [TIP_CHECKLIST.md](./TIP_CHECKLIST.md).

## Conventions

- Prefer **one toast instance per tip id** in the whole app.
- Keep tip ids in `src/misc/tipIds.ts` (shared const map).
- Prefer `useTipOpen` for open state + dismissal guard.
- Concurrent tips **queue** (FIFO); only the head is visible.
- Transient snackbars stack **above** the active tip toast.
- Do not fold legacy `hide*` prompt flags into `dismissedTips` unless deliberately migrating them.
- **Reset tooltips** clears *all* tip ids; it does not flip Hide GitHub / Migration / Install.

## Files to touch for a new tip (checklist)

- [ ] Tip id in `src/misc/tipIds.ts` + [TIP_CHECKLIST.md](./TIP_CHECKLIST.md)
- [ ] Trigger + `v-model` open state where the feature lives (or `App.vue`) — usually via `useTipOpen`
- [ ] `<TipDialog :tip-id="TIP_IDS.…" title="…">` with body copy
- [ ] Guard with `!appearance.isTipDismissed(…)` (handled by `useTipOpen`)
- [ ] Changelog (and README only if the tip is part of a user-facing feature write-up)
