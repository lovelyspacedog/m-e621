/**
 * u18chan Indices (catalog boards). Cub is intentionally omitted — never wire
 * `/icub/` or `/cub/`. Gore is gated by Settings → Include u18chan Gore.
 */

export type U18chanIndexBoard =
  | "ifur"
  | "ic"
  | "igfur"
  | "igc"
  | "ii"
  | "ia"
  | "ip"
  | "if"
  | "igore";

export interface U18chanIndexDef {
  /** Index catalog slug, e.g. `ifur`. */
  index: U18chanIndexBoard;
  /** Live board threads open under, e.g. `fur`. */
  live: string;
  label: string;
  /** When true, only shown if `u18chanIncludeGore` is on. */
  gore?: boolean;
  icon: string;
}

/** Allowed Indices — Cub never appears here. */
export const U18CHAN_INDICES: U18chanIndexDef[] = [
  { index: "ifur", live: "fur", label: "Furries Index", icon: "mdi-paw" },
  {
    index: "ic",
    live: "c",
    label: "Furry Comics Index",
    icon: "mdi-book-open-page-variant",
  },
  {
    index: "igfur",
    live: "gfur",
    label: "Gay Furries Index",
    icon: "mdi-gender-male",
  },
  {
    index: "igc",
    live: "gc",
    label: "Gay Furry Comics Index",
    icon: "mdi-book-open-variant",
  },
  {
    index: "ii",
    live: "i",
    label: "Intersex Index",
    icon: "mdi-gender-male-female",
  },
  { index: "ia", live: "a", label: "Animated Index", icon: "mdi-movie-open" },
  { index: "ip", live: "p", label: "Ponies Index", icon: "mdi-horse" },
  { index: "if", live: "f", label: "Feral Index", icon: "mdi-dog-side" },
  {
    index: "igore",
    live: "gore",
    label: "Gore Index",
    icon: "mdi-water",
    gore: true,
  },
];

const BLOCKED_BOARDS = new Set(["icub", "cub"]);

export const isBlockedU18chanBoard = (board: string): boolean =>
  BLOCKED_BOARDS.has(board.toLowerCase());

export const u18chanIndexBySlug = (
  slug: string,
): U18chanIndexDef | undefined =>
  U18CHAN_INDICES.find((b) => b.index === slug);

export const isAllowedU18chanIndex = (
  slug: string,
  includeGore: boolean,
): boolean => {
  if (isBlockedU18chanBoard(slug)) return false;
  const def = u18chanIndexBySlug(slug);
  if (!def) return false;
  if (def.gore && !includeGore) return false;
  return true;
};

export const visibleU18chanIndices = (
  includeGore: boolean,
): U18chanIndexDef[] =>
  U18CHAN_INDICES.filter((b) => !b.gore || includeGore);

export const DEFAULT_U18CHAN_INDEX: U18chanIndexBoard = "ifur";

export const U18CHAN_BASE = "https://u18chan.com";
