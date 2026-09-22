import type { Posts, Tag, TagAlias, Pool, Comment, Note } from "./returnTypes";
import type {
  IPostsListArgs,
  ITagsListArgs,
  ITagAliasesArgs,
  IPoolsArgs,
  IGetPoolArgs,
  ICommentsListArgs,
  INotesListArgs,
} from "./requestTypes";
import { getGitInfo } from "@/misc/util/git";
import type { SiteMode } from "@/services/types";

export * from "./returnTypes";
export * from "./requestTypes";

const version = getGitInfo()[0]?.hash?.substring(0, 7) ?? "0.0.0";
const clientHeader = `PawDeck/${version} (fork of Material e621)`;

const buildUrl = (baseUrl: string, path: string, params: Record<string, unknown> = {}) => {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });
  url.searchParams.append("_client", clientHeader);
  return url.toString();
};

/** Serialize pool id filter for `search[id]` (comma-separated). */
export const serializePoolSearchIds = (ids?: number[] | string) => {
  if (ids == null) return undefined;
  if (Array.isArray(ids)) {
    const joined = ids.filter((id) => Number.isFinite(id) && id > 0).join(",");
    return joined || undefined;
  }
  return String(ids).trim() || undefined;
};

const fetchErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = (await response.clone().json()) as { message?: string; reason?: string };
    if (data?.message) return data.message;
    if (data?.reason) return data.reason;
  } catch {
    // ignore non-JSON bodies
  }
  return `${fallback}: ${response.status} ${response.statusText}`;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchJson = async <T>(url: string, options: RequestInit = {}, retries = 2): Promise<T> => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response.json();
    }
    // Rate limit / Philomena anti-bot (M12).
    if ((response.status === 429 || response.status === 501) && attempt < retries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 5000 * (attempt + 1);
      await sleep(waitMs);
      continue;
    }
    lastError = new Error(await fetchErrorMessage(response, "Fetch error"));
    break;
  }
  throw lastError || new Error("Fetch error");
};

const getAuthHeader = (
  auth?: { login: string; api_key: string },
): Record<string, string> => {
  return auth
    ? {
      Authorization: `Basic ${btoa(`${auth.login}:${auth.api_key}`)}`,
    }
    : {};
};

export const e621 = {
  posts: {
    list(args: IPostsListArgs) {
      let page = undefined;
      if (args.postsAfter) {
        page = `a${args.postsAfter}`;
      }
      if (args.postsBefore) {
        page = `b${args.postsBefore}`;
      }
      if (args.page !== undefined) {
        page = args.page;
      }
      const url = buildUrl(args.baseUrl, "posts.json", {
        tags: args.tags || "",
        limit: args.limit,
        page,
      });
      // Use Authorization header instead of query params so credentials
      // don't appear in browser history, proxies, or Referer headers.
      return fetchJson<Posts>(url, { headers: getAuthHeader(args?.auth) })
    },
  },
  tags: {
    list(args: ITagsListArgs) {
      const url = buildUrl(args.baseUrl, "tags.json", {
        limit: args.limit,
        "search[order]": args.order,
        "search[name_matches]": args.query,
        "search[name]": args.name,
      });
      return fetchJson<Tag[] | { tags: [] }>(url);
    },
  },
  tagAliases: {
    list(args: ITagAliasesArgs) {
      const url = buildUrl(args.baseUrl, "tag_aliases.json", {
        limit: args.limit,
        "search[order]": args.order,
        "search[name_matches]": args.query,
      });
      return fetchJson<TagAlias[]>(url);
    },
  },
  pools: {
    list(args: IPoolsArgs) {
      const order =
        args.order === "count"
          ? "post_count"
          : args.order === "date"
            ? "updated_at"
            : args.order;
      const ids = serializePoolSearchIds(args.ids);
      const url = buildUrl(args.baseUrl, "pools.json", {
        limit: args.limit,
        page: args.page,
        "search[order]": order,
        "search[name_matches]": args.query,
        "search[description_matches]": args.descriptionMatches,
        "search[post_tags_match]": args.postTagsMatch,
        "search[id]": ids,
        "search[is_active]":
          args.isActive === undefined ? undefined : args.isActive ? "true" : "false",
        "search[creator_name]": args.creatorName,
        "search[category]": args.category,
      });
      return fetchJson<Pool[]>(url, { headers: getAuthHeader(args.auth) });
    },
    get(args: IGetPoolArgs) {
      const url = buildUrl(args.baseUrl, `pools/${+args.id}.json`);
      return fetchJson<Pool>(url, { headers: getAuthHeader(args.auth) });
    },
  },
  comments: {
    list(args: ICommentsListArgs) {
      const url = buildUrl(args.baseUrl, "comments.json", {
        "search[post_id]": args.postId,
        "search[order]": "id_asc",
        "group_by": "comment",
        limit: args.limit ?? 100,
      });
      return fetchJson<Comment[]>(url, { headers: getAuthHeader(args.auth) });
    },
  },
  notes: {
    list(args: INotesListArgs) {
      const url = buildUrl(args.baseUrl, "notes.json", {
        "search[post_id]": args.postId,
        limit: args.limit ?? 100,
      });
      return fetchJson<Note[]>(url, { headers: getAuthHeader(args.auth) });
    },
  },
  users: {
    get(args: { baseUrl: string; name: string; auth?: { login: string; api_key: string } }) {
      const url = buildUrl(args.baseUrl, `users/${encodeURIComponent(args.name)}.json`);
      return fetchJson<{ name: string; id: number }>(url, {
        headers: getAuthHeader(args.auth),
      });
    },
  },
  favorites: {
    list(args: { baseUrl: string; auth: { login: string; api_key: string }; limit?: number }) {
      const url = buildUrl(args.baseUrl, "favorites.json", {
        limit: args.limit ?? 1,
      });
      return fetchJson<unknown>(url, { headers: getAuthHeader(args.auth) });
    },
  },
};

export interface IPostFavoriteArgs {
  postId: number;
  auth: {
    login: string;
    api_key: string;
  };
  proxyUrl: string;
  baseUrl: string;
  mode?: SiteMode;
  /** Soft hashid when numeric id alone can't reverse-map. */
  softId?: string | null;
}

export interface IPostVoteArgs extends IPostFavoriteArgs {
  score: 1 | -1 | 0;
}

export interface IPostCommentArgs extends IPostFavoriteArgs {
  body: string;
}

const resolveApiProxyUrl = (proxyUrl: string) => {
  let url = proxyUrl || "/api/";
  if (url.includes("material-e621-proxy.vercel.app")) {
    url = "/api/";
  }
  if (!/^https?:\/\//i.test(url)) {
    url = new URL(url, `${self.location.origin}/`).toString();
  }
  return url.endsWith("/") ? url : `${url}/`;
};

export const custom = {
  posts: {
    async favorite(args: IPostFavoriteArgs) {
      const response = await fetch(`${resolveApiProxyUrl(args.proxyUrl)}favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Base": args.baseUrl,
          ...getAuthHeader(args.auth),
        },
        body: JSON.stringify({ post_id: args.postId }),
      });
      if (!response.ok) {
        throw new Error(await fetchErrorMessage(response, "Error favoriting post"));
      }
      return response.json();
    },
    async unfavorite(args: IPostFavoriteArgs) {
      const response = await fetch(
        `${resolveApiProxyUrl(args.proxyUrl)}favorites/${args.postId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Site-Base": args.baseUrl,
            ...getAuthHeader(args.auth),
          },
        },
      );
      if (!response.ok) {
        throw new Error(await fetchErrorMessage(response, "Error unfavoriting post"));
      }
      return response.ok;
    },
    async vote(args: IPostVoteArgs) {
      const response = await fetch(`${resolveApiProxyUrl(args.proxyUrl)}votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Base": args.baseUrl,
          ...getAuthHeader(args.auth),
        },
        body: JSON.stringify({ post_id: args.postId, score: args.score }),
      });
      if (!response.ok) {
        throw new Error(await fetchErrorMessage(response, "Error voting on post"));
      }
      return response.json() as Promise<{
        score: number;
        up: number;
        down: number;
        our_score?: number;
      }>;
    },
    async createComment(args: IPostCommentArgs) {
      const response = await fetch(`${resolveApiProxyUrl(args.proxyUrl)}comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Base": args.baseUrl,
          ...getAuthHeader(args.auth),
        },
        body: JSON.stringify({ post_id: args.postId, body: args.body }),
      });
      if (!response.ok) {
        throw new Error(await fetchErrorMessage(response, "Error posting comment"));
      }
      return response.json() as Promise<Comment>;
    },
  },
};
