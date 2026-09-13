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
  tags: string[];
  isArtistVerified: boolean;
  additionalArtistNames: string | null;
}

export interface TailspaceComicsResponse {
  comics: TailspaceComic[];
  numberOfPages: number;
  totalNumComics: number;
}
