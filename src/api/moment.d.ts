export interface MomentMedia {
  type: 'image' | 'video';
  url: string;
  poster_url?: string;
  width?: number;
  height?: number;
}

export interface MomentApiItem {
  id: string;
  user_id: string;
  username: string;
  avatar?: string | null;
  content?: string | null;
  media: MomentMedia[];
  processing_status: 'processing' | 'ready' | 'failed';
  processing_progress: number;
  processing_error?: string | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  comments: MomentApiComment[];
  created_at: string;
  updated_at: string;
}

export interface MomentApiComment {
  id: string;
  moment_id: string;
  user_id: string;
  username: string;
  avatar?: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MomentLikeState {
  moment_id: string;
  liked: boolean;
  like_count: number;
}

export interface CreateMomentInput {
  content: string;
  mediaType?: 'image' | 'video';
  media?: File;
  onUploadProgress?: (progress: MomentUploadProgress) => void;
}

export interface MomentUploadProgress {
  percent: number;
  loaded: number;
  total: number;
  bytesPerSecond: number;
  remainingSeconds: number;
}

export interface MomentPageCursor {
  createdAt: string;
  id: string;
}

export function getMoments(cursor?: MomentPageCursor): Promise<MomentApiItem[]>;
export function getMoment(id: string): Promise<MomentApiItem>;
export function createMoment(input: CreateMomentInput): Promise<MomentApiItem>;
export function deleteMoment(id: string): Promise<void>;
export function likeMoment(id: string): Promise<MomentLikeState>;
export function unlikeMoment(id: string): Promise<MomentLikeState>;
export function createMomentComment(id: string, content: string): Promise<MomentApiComment>;
