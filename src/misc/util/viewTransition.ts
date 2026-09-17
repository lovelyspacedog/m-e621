/**
 * FEATURES 8.2 / AI_CONTEXT: never start a view transition on first load.
 * First load has no `from` route; starting a transition captures the empty shell.
 *
 * Also skip when leaving the landing page: Landing owns named transitions
 * (`applogo`, `tagsearch`) and minimal chrome. Combined with router-view
 * `mode="out-in"`, Chromium can capture the empty gap and leave `v-main`
 * permanently blank (Scent Marks / Browse posts from the hero).
 */
export function shouldSkipViewTransition(
  from: { name?: string | symbol | null },
  to: { name?: string | symbol | null },
): boolean {
  if (!from.name || from.name === to.name) return true;
  if (from.name === "LandingPage") return true;
  return false;
}
