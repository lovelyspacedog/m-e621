/** OS color-scheme preference (defaults to dark when matchMedia unavailable). */
export const systemPrefersDark = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};
