/**
 * Per-source News RSS budget. Client abort, Vite proxy, and serve.py
 * should stay aligned (serve.py uses the same seconds value).
 */
export const NEWS_RSS_TIMEOUT_MS = 5_000;

export function newsRssAbortSignal(): AbortSignal {
  return AbortSignal.timeout(NEWS_RSS_TIMEOUT_MS);
}
