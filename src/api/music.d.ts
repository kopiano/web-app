export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  bitrate: number;
  sampleRate: number;
  cover: string;
  audioUrl: string;
  originalUrl: string;
  format: string;
  originalFormat: string;
  size: number;
  originalSize: number;
  isFavorite: boolean;
  processingStatus: 'processing' | 'ready' | 'failed';
  processingError: string;
  createdAt: string;
  detailsLoaded: boolean;
};

export type MusicDuplicateMatch = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
};

export class MusicDuplicateError extends Error {
  kind: 'exact' | 'similar';
  matches: MusicDuplicateMatch[];
}

export type MusicPage = {
  items: MusicTrack[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalDuration: number;
};

export type MusicUserLibrary = {
  collection: 'uploads' | 'favorites';
  userId: string;
  username: string;
  avatar: string;
  playlistName: string;
  trackCount: number;
  totalDuration: number;
};

export function getMusic(options?: {
  page?: number;
  pageSize?: number;
  favorite?: boolean;
}): Promise<MusicPage>;
export function getMyMusic(options?: {
  page?: number;
  pageSize?: number;
  collection?: 'uploads' | 'favorites' | 'library';
  userId?: string;
}): Promise<MusicPage>;
export function getMusicLibrary(): Promise<MusicUserLibrary[]>;
export function uploadMusic(
  files: File[],
  options?: { allowSimilar?: boolean },
): Promise<MusicTrack[]>;
export function getMusicTrack(id: string): Promise<MusicTrack>;
export function deleteMusicTrack(id: string): Promise<void>;
export function updateMusicFavorite(id: string, favorite: boolean): Promise<boolean>;
export function musicWebSocketUrl(): string;
export function normalizeMusicEvent(payload: unknown): MusicTrack | null;
