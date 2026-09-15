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
}

export interface IGetPoolArgs extends IBaseArgs {
  id: number;
}

export interface ICommentsListArgs extends IBaseArgs {
  postId: number;
  limit?: number;
  auth?: {
    login: string;
    api_key: string;
  };
}

export interface INotesListArgs extends IBaseArgs {
  postId: number;
  limit?: number;
}

import type { SiteMode } from "@/services/types";

export interface IBaseArgs {
  baseUrl: string;
  /** Prefer over URL hostname for backend dispatch (M17). */
  mode?: SiteMode;
}
