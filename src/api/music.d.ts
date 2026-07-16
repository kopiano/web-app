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
  createdAt: string;
};

export function getMusic(): Promise<MusicTrack[]>;
export function uploadMusic(files: File[]): Promise<MusicTrack[]>;
export function updateMusicFavorite(id: string, favorite: boolean): Promise<boolean>;
