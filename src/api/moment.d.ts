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
  created_at: string;
  updated_at: string;
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

export function getMoments(): Promise<MomentApiItem[]>;
export function getMoment(id: string): Promise<MomentApiItem>;
export function createMoment(input: CreateMomentInput): Promise<MomentApiItem>;
export function deleteMoment(id: string): Promise<void>;
