export interface U18chanImage {
  fullUrl: string;
  thumbUrl: string;
}

export interface U18chanCatalogThread {
  id: number;
  /** Live board the topic lives on (e.g. fur), not the index slug. */
  liveBoard: string;
  subject: string;
  thumbUrl: string | null;
  href: string;
}

export interface U18chanPost {
  id: number;
  name: string;
  subject: string;
  timestamp: string;
  comment: string;
  images: U18chanImage[];
  isOp: boolean;
}

export interface U18chanThread {
  id: number;
  liveBoard: string;
  indexBoard: string;
  subject: string;
  posts: U18chanPost[];
}

export interface U18chanPostPayload {
  liveBoard: string;
  /** 0 / omit for new thread; topic id for reply. */
  topicId?: number;
  name?: string;
  email?: string;
  subject?: string;
  comment: string;
  password?: string;
  spoiler?: boolean;
  /** Base64 data URL or raw base64 + filename for file1. */
  fileName?: string;
  fileBase64?: string;
  fileMime?: string;
}
