import { computed, type ComputedRef } from "vue";
import { usePostsStore } from "@/services";

export const DEDICATED_GRID_MIN_DEFAULT = 140;
export const DEDICATED_GRID_MIN_PX_MIN = 96;
export const DEDICATED_GRID_MIN_PX_MAX = 320;
/** Step 4 so the 140px default lands on-grid (140 is not a multiple of 8). */
export const DEDICATED_GRID_MIN_PX_STEP = 4;

export function clampDedicatedGridMinPx(n: number): number {
  if (!Number.isFinite(n)) return DEDICATED_GRID_MIN_DEFAULT;
  const stepped =
    Math.round(n / DEDICATED_GRID_MIN_PX_STEP) * DEDICATED_GRID_MIN_PX_STEP;
  return Math.min(
    DEDICATED_GRID_MIN_PX_MAX,
    Math.max(DEDICATED_GRID_MIN_PX_MIN, stepped),
  );
}

export function scaleDedicatedGridMin(
  baselinePx: number,
  storedPx: number,
): number {
  const stored = clampDedicatedGridMinPx(storedPx);
  return Math.round(baselinePx * (stored / DEDICATED_GRID_MIN_DEFAULT));
}

export type DedicatedGridBaselines = number | readonly [number, number?, number?];

function normalizeBaselines(
  baselines: DedicatedGridBaselines,
): [number, number?, number?] {
  if (typeof baselines === "number") return [baselines];
  return [baselines[0], baselines[1], baselines[2]];
}

export function dedicatedGridCssVars(
  baselines: DedicatedGridBaselines,
  storedPx: number,
): Record<string, string> {
  const [base, sm, lg] = normalizeBaselines(baselines);
  const vars: Record<string, string> = {
    "--dgrid-min": `${scaleDedicatedGridMin(base, storedPx)}px`,
  };
  if (sm != null) {
    vars["--dgrid-min-sm"] = `${scaleDedicatedGridMin(sm, storedPx)}px`;
  }
  if (lg != null) {
    vars["--dgrid-min-lg"] = `${scaleDedicatedGridMin(lg, storedPx)}px`;
  }
  return vars;
}

/** Reactive `:style` for dedicated catalog/magazine grids. */
export function useDedicatedGridStyle(
  baselines: DedicatedGridBaselines,
): ComputedRef<Record<string, string>> {
  const posts = usePostsStore();
  return computed(() =>
    dedicatedGridCssVars(baselines, posts.dedicatedGridMinPx),
  );
}
