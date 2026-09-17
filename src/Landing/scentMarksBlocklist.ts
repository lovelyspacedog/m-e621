import blocklist from "./scentMarksBlocklist.json";

export type ScentBlockPattern = { id: string; regex: string };

type BlocklistFile = {
  words?: string[];
  patterns?: ScentBlockPattern[];
};

const data = blocklist as BlocklistFile;

const WORDS: string[] = (data.words ?? [])
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

const PATTERNS: { id: string; re: RegExp }[] = (data.patterns ?? [])
  .filter((p) => p?.id && p?.regex)
  .map((p) => ({
    id: p.id,
    re: new RegExp(p.regex, "i"),
  }));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryPattern(term: string): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`,
    "i",
  );
}

/** Return blocked word labels / pattern ids in first-seen order (deduped). */
export function findBlockedScentTerms(
  text: string,
  name?: string | null,
): string[] {
  const haystacks = [text, name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean);
  if (!haystacks.length) return [];

  const hits: string[] = [];
  const seen = new Set<string>();

  const push = (label: string) => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    hits.push(label);
  };

  for (const hay of haystacks) {
    for (const word of WORDS) {
      if (wordBoundaryPattern(word).test(hay)) push(word);
    }
    for (const { id, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(hay)) push(id);
    }
  }

  return hits;
}

export function formatScentBlockedMessage(blocked: string[]): string {
  return `Blocked: ${blocked.join(", ")}`;
}
