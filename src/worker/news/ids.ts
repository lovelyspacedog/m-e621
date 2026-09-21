/** Namespaced news article ids — re-exports registry helpers. */

export type { NewsSource } from "./registry";
export {
  NEWS_SOURCES,
  isNewsSource,
  makeNewsId,
  parseNewsId,
  migrateLegacyNewsId,
  newsSourceLabel,
  newsSourceHomeUrl,
} from "./registry";
