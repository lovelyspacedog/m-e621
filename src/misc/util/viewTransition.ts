/**
 * FEATURES 8.2 / AI_CONTEXT: never start a view transition on first load.
 * First load has no `from` route; starting a transition captures the empty shell.
 */
export function shouldSkipViewTransition(
  from: { name?: string | symbol | null },
  to: { name?: string | symbol | null },
): boolean {
  return !from.name || from.name === to.name;
}
