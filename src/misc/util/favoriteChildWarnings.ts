/**
 * Snackbars for partial Federated favorite-child failures.
 * Call only when the overall run succeeded (some posts sampled).
 * Total failure should use the page error state instead.
 */
export const publishPartialChildWarnings = (
  warnings: string[] | undefined,
  addMessage: (message: string) => void,
): void => {
  if (!warnings?.length) return;
  for (const warning of warnings) {
    addMessage(warning);
  }
};
