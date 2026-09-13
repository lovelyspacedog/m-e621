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

export * from "./returnTypes";
export * from "./requestTypes";

const version = getGitInfo()[0]?.hash?.substring(0, 7) ?? "0.0.0";
const clientHeader = `Material e621/${version} (by Avoonix on e621)`;

const buildUrl = (baseUrl: string, path: string, params: Record<string, any> = {}) => {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });
  url.searchParams.append("_client", clientHeader);
  return url.toString();
};

const fetchJson = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const getAuthHeader = (auth?: { login: string; api_key: string }): { Authorization: string } | {} => {
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
      const auth = args?.auth || {};
      const url = buildUrl(args.baseUrl, "posts.json", {
        tags: args.tags || "",
        limit: args.limit,
        page,
        ...auth,
      });
      return fetchJson<Posts>(url)
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
      const url = buildUrl(args.baseUrl, "pools.json", {
        limit: args.limit,
        page: args.page,
        "search[order]": order,
        "search[name_matches]": args.query,
      });
      return fetchJson<Pool[]>(url);
    },
    get(args: IGetPoolArgs) {
      const url = buildUrl(args.baseUrl, `pools/${+args.id}.json`);
      return fetchJson<Pool>(url);
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
      return fetchJson<Comment[]>(url);
    },
  },
  notes: {
    list(args: INotesListArgs) {
      const url = buildUrl(args.baseUrl, "notes.json", {
        "search[post_id]": args.postId,
        limit: args.limit ?? 100,
      });
      return fetchJson<Note[]>(url);
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
        throw new Error(`Error favoriting post: ${response.statusText}`);
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
        throw new Error(`Error unfavoriting post: ${response.statusText}`);
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
        throw new Error(`Error voting on post: ${response.statusText}`);
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
        throw new Error(`Error posting comment: ${response.statusText}`);
      }
      return response.json() as Promise<Comment>;
    },
  },
};
