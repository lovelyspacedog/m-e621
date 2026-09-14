/** Tailspace post media item */
export interface TailspaceMedia {
  id: number;
  token: string;
  fileType: string; // "jpg", "png", "gif", "mp4", "webm"
  isAnimated: boolean;
  fileName: string;
  mediaKind: "image" | "video";
  widthPx: number | null;
  heightPx: number | null;
  thumbHash: string | null;
  sortOrder: number;
  processingMedia: boolean;
  originalToken: string | null;
  originalFileType: string | null;
}

export interface TailspaceCreator {
  userId: number;
  username: string;
  displayName: string;
  profilePictureToken: string | null;
}

export interface TailspaceTag {
  id: number;
  name: string;
}

/** A single post (image/video artwork) on Tailspace */
export interface TailspacePost {
  id: number;
  postType: string;
  title: string;
  description: string | null;
  allowComments: boolean;
  releasedAt: string; // ISO date
  creator: TailspaceCreator;
  tags: TailspaceTag[];
  media: TailspaceMedia[];
  poll: unknown | null;
  likeCount: number;
  yourLike: boolean;
  commentCount: number;
  viewCount: number;
  comicUpdate: unknown | null;
}

export interface TailspacePostsResponse {
  posts: TailspacePost[];
  hasNextPage: boolean;
}

/** A comment on a Tailspace post */
export interface TailspaceComment {
  id: number;
  userId: number;
  username: string;
  profilePictureToken: string | null;
  comment: string;
  replyToCommentId: number | null;
  /** Unix ms timestamp, or null if unknown */
  timestamp: number | null;
  isHidden: boolean;
}

export interface TailspaceCommentsResponse {
  comments: TailspaceComment[];
}

/** A single comic series on Tailspace */
export interface TailspaceComic {
  id: number;
  name: string;
  category: string; // "Mix" | "Male" | "Female" | "Intersex"
  artistName: string; // slug
  displayName: string | null;
  thumbnailVersion: number;
  numberOfPages: number;
  state: "wip" | "complete" | "finished" | "cancelled";
  sumStars: number;
  numTimesStarred: number;
  avgStars: number;
  avgStarsPercent: number;
  commentCount: number;
  updated: number; // unix ms timestamp
  published: number; // unix ms timestamp
  tags: TailspaceTag[] | string[];
  isArtistVerified: boolean;
  additionalArtistNames: string | null;
}

export interface TailspaceComicsResponse {
  comics: TailspaceComic[];
  numberOfPages: number;
  totalNumComics: number;
}

/** One page inside a Tailspace comic */
export interface TailspaceComicPage {
  token: string;
  pageNumber: number;
  fileType: string;
  isAnimated: boolean;
  widthPx: number | null;
  heightPx: number | null;
  description: string | null;
  thumbHash: string | null;
}

export interface TailspaceComicNeighbor {
  id: number;
  name: string;
}

/** Full comic detail including ordered pages (from /c/{name}.data) */
export interface TailspaceComicDetail {
  id: number;
  name: string;
  category: string | null;
  state: string | null;
  numberOfPages: number;
  description: string | null;
  avgStars: number | null;
  commentCount: number;
  thumbnailVersion: number;
  artistName: string;
  artistDisplayName: string;
  pages: TailspaceComicPage[];
  comments: TailspaceComment[];
  previousComic: TailspaceComicNeighbor | null;
  nextComic: TailspaceComicNeighbor | null;
}
