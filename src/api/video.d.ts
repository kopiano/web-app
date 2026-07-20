export type VideoVisibility = 'public' | 'private';
export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface VideoCategory {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
}

export interface VideoApiItem {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  size: number | null;
  originFileUrl: string;
  hlsMasterUrl: string;
  status: VideoStatus;
  visibility: VideoVisibility;
  processingProgress: number;
  processingError: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  liked: boolean;
  favorited: boolean;
  owned: boolean;
  categories: VideoCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoPage {
  items: VideoApiItem[];
  hasMore: boolean;
  nextBeforeCreatedAt: string | null;
  nextBeforeId: string | null;
}

export interface VideoApiComment {
  id: string;
  videoId: string;
  userId: string;
  username: string;
  avatar: string;
  parentId: string | null;
  replyToUserId: string | null;
  replyToUsername: string | null;
  content: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoApiCollection {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  title: string;
  description: string;
  visibility: VideoVisibility;
  includeFavorites: boolean;
  categorySlug: string | null;
  videoCount: number;
  totalViews: number;
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
}

export function getVideos(params?: Record<string, unknown>): Promise<VideoPage>;
export function getVideo(id: string): Promise<VideoApiItem>;
export function getVideoCategories(input?: { scope?: 'public' | 'accessible' }): Promise<VideoCategory[]>;
export function getVideoCollections(input?: { mine?: boolean }): Promise<VideoApiCollection[]>;
export function uploadVideo(
  file: File,
  onUploadProgress?: (percent: number) => void,
  signal?: AbortSignal,
  onUploadCreated?: (video: VideoApiItem) => void,
): Promise<VideoApiItem>;
export function updateVideo(id: string, input: {
  title?: string;
  description?: string;
  visibility?: VideoVisibility;
  categories?: string[];
  cover?: File | null;
  publish?: boolean;
}): Promise<VideoApiItem>;
export function deleteVideo(id: string): Promise<void>;
export function updateVideoLike(id: string, active: boolean): Promise<{ active: boolean; count: number }>;
export function updateVideoFavorite(id: string, active: boolean): Promise<{ active: boolean; count: number }>;
export function getVideoComments(id: string): Promise<VideoApiComment[]>;
export function createVideoComment(id: string, input: {
  content: string;
  parentId?: string | null;
  replyToUserId?: string | null;
}): Promise<VideoApiComment>;
export function updateVideoCommentLike(id: string, active: boolean): Promise<{ liked: boolean; likeCount: number }>;
export function viewVideo(id: string): Promise<{ counted: boolean; viewCount: number }>;
export function createVideoCollection(input: Record<string, unknown>): Promise<VideoApiCollection>;
export function updateVideoCollection(id: string, input: Record<string, unknown>): Promise<VideoApiCollection>;
export function deleteVideoCollection(id: string): Promise<void>;
