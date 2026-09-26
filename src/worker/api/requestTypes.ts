export interface IPostsListArgs extends IBaseArgs {
  limit: number;
  tags?: string;
  page?: number;
  postsBefore?: number; // posts before this id
  postsAfter?: number; // posts after this id
  auth?: {
    login: string;
    api_key: string;
  };
}

export interface ITagsListArgs extends IBaseArgs {
  limit: number;
  order: "count" | "date";
  query?: string;
  /** Exact tag name (e621 search[name]) */
  name?: string;
  auth?: {
    login: string;
    api_key: string;
  };
}

export interface ITagAliasesArgs extends IBaseArgs {
  limit: number;
  order: "count" | "date";
  query?: string;
}

export interface IPoolsArgs extends IBaseArgs {
  limit: number;
  order: "count" | "date" | "name" | "created_at" | "updated_at" | "post_count";
  query?: string;
  page?: number;
  /** e621 pool category filter; omit or leave unset for all */
  category?: "series" | "collection";
  /** e621 search[description_matches] */
  descriptionMatches?: string;
  /** e621 search[post_tags_match] — pools whose posts match these tags */
  postTagsMatch?: string;
  /** e621 search[id] — one or more pool ids (comma-separated) */
  ids?: number[] | string;
  /** e621 search[is_active] */
  isActive?: boolean;
  /** e621 search[creator_name] */
  creatorName?: string;
  auth?: {
    login: string;
    api_key: string;
  };
}

export interface IGetPoolArgs extends IBaseArgs {
  id: number;
  auth?: {
    login: string;
    api_key: string;
  };
}

export interface ICommentsListArgs extends IBaseArgs {
  postId: number;
  limit?: number;
  auth?: {
    login: string;
    api_key: string;
  };
  /** Soft hashid when numeric id alone can't reverse-map. */
  softId?: string | null;
  /** FurAffinity view vs journal. */
  kind?: "submission" | "journal";
  /** Weasyl session cookies for HTML scrape (optional for read). */
  cookies?: string | null;
  /** Weasyl owner login for canonical submission URL. */
  ownerLogin?: string | null;
}

export interface INotesListArgs extends IBaseArgs {
  postId: number;
  limit?: number;
  auth?: {
    login: string;
    api_key: string;
  };
}

import type { SiteMode } from "@/services/types";

export interface IBaseArgs {
  baseUrl: string;
  /** Prefer over URL hostname for backend dispatch (M17). */
  mode?: SiteMode;
}
