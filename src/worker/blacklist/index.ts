import type { Post } from "../api";
import { debug } from "@/misc/util/debug";

const log = debug("app:blacklist");

const COMPARISON_RE = /^(score|width|height|id|favcount):([<>]=?|=)?(-?\d+)$/;

export const evaluateComparison = (term: string, post: Post): boolean | null => {
  const match = COMPARISON_RE.exec(term);
  if (!match) return null;
  const field = match[1];
  const op = match[2] || "=";
  const threshold = Number(match[3]);
  const live =
    field === "score"
      ? post.score.total
      : field === "width"
        ? post.file.width
        : field === "height"
          ? post.file.height
          : field === "id"
            ? post.id
            : post.fav_count;
  switch (op) {
    case ">":
      return live > threshold;
    case ">=":
      return live >= threshold;
    case "<":
      return live < threshold;
    case "<=":
      return live <= threshold;
    default:
      return live === threshold;
  }
};

const syntheticTags = (post: Post): string[] => {
  const tags = [
    `id:${post.id}`,
    `userid:${post.uploader_id}`,
  ];
  const uploaderName = post.uploader_name;
  if (uploaderName) {
    tags.push(`user:${uploaderName.toLowerCase()}`);
  }
  if (post.flags.deleted) tags.push("status:deleted");
  else if (post.flags.flagged) tags.push("status:flagged");
  else if (post.flags.pending) tags.push("status:pending");
  else tags.push("status:active");
  return tags;
};

const termMatches = (term: string, postTags: string[], post: Post): boolean => {
  const comparison = evaluateComparison(term, post);
  if (comparison !== null) return comparison;
  return postTags.includes(term.toLowerCase());
};

export const isPostBlacklisted = (post: Post, blacklist?: string[][]) => {
  if (!blacklist) {
    log("no blacklist");
    return false;
  }
  const postTags = [
    ...(Object.values(post.tags).flat() as string[]),
    ...syntheticTags(post),
  ].map((t) => t.toLowerCase());
  log(postTags);
  switch (post.rating) {
    case "e":
      postTags.push("rating:e", "rating:explicit");
      break;
    case "q":
      postTags.push("rating:q", "rating:questionable");
      break;
    case "s":
      postTags.push("rating:s", "rating:safe");
      break;
  }
  for (const blacklistLine of blacklist) {
    if (matchesBlacklistLine(post, postTags, blacklistLine)) {
      return true;
    }
  }
  return false;
};

const matchesBlacklistLine = (post: Post, postTags: string[], blacklistLine: string[]) => {
  if (!blacklistLine.length) return false;

  const require = blacklistLine.filter(t => !t.startsWith("~") && !t.startsWith("-"));
  const optional = blacklistLine.filter(t => t.startsWith("~")).map(t => t.replace(/^~/, ""));
  const exclude = blacklistLine.filter(t => t.startsWith("-")).map(t => t.replace(/^-/, ""));

  // https://github.com/e621ng/e621ng/blob/8112e57329ee225a193b5aa0503aaf95b29c103f/app/javascript/src/javascripts/blacklists.js#L281
  const requireOk = require.every((t) => termMatches(t, postTags, post));
  const optionalOk =
    !optional.length || optional.some((t) => termMatches(t, postTags, post));
  const excludeOk = !exclude.some((t) => termMatches(t, postTags, post));
  return requireOk && optionalOk && excludeOk;
};
