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

export function getMusic(): Promise<MusicTrack[]>;
export function uploadMusic(
  files: File[],
  options?: { allowSimilar?: boolean },
): Promise<MusicTrack[]>;
export function getMusicTrack(id: string): Promise<MusicTrack>;
export function deleteMusicTrack(id: string): Promise<void>;
export function updateMusicFavorite(id: string, favorite: boolean): Promise<boolean>;
export function musicWebSocketUrl(): string;
export function normalizeMusicEvent(payload: unknown): MusicTrack | null;
