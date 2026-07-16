import request from './request'
import { resolveAssetUrl } from '@/lib/avatar'

function normalizeMusic(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: Math.max(0, Number(track.duration_ms) / 1000),
    bitrate: Number(track.bitrate) || 0,
    sampleRate: Number(track.sample_rate) || 0,
    cover: resolveAssetUrl(track.cover_url),
    audioUrl: resolveAssetUrl(track.audio_url),
    originalUrl: resolveAssetUrl(track.original_url),
    format: track.format,
    originalFormat: track.original_format,
    size: Number(track.size) || 0,
    originalSize: Number(track.original_size) || 0,
    isFavorite: Boolean(track.is_favorite),
    createdAt: track.created_at,
  }
}

export function getMusic() {
  return request.get('/music').then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid music response')
    return response.data.map(normalizeMusic)
  })
}

export function uploadMusic(files) {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file, file.name))

  return request.post('/music', formData, { timeout: 0 }).then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid music upload response')
    return response.data.map(normalizeMusic)
  })
}

export function updateMusicFavorite(id, favorite) {
  return request.put(`/music/${encodeURIComponent(id)}/favorite`, { favorite }).then(response => {
    if (!response.data || response.data.id !== id) {
      throw new Error('Invalid music favorite response')
    }
    return Boolean(response.data.is_favorite)
  })
}
