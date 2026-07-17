import request from './request'
import { resolveAssetUrl } from '@/lib/avatar'

function normalizeMusicCoverUrl(coverUrl) {
  const resolved = resolveAssetUrl(coverUrl)
  if (!resolved) return ''

  try {
    const pathname = new URL(resolved, window.location.origin).pathname.toLowerCase()
    if (/\.(?:aac|flac|m4a|mp3|ogg|opus|wav|wma)$/.test(pathname)) return ''
  } catch {
    return ''
  }

  return resolved
}

function normalizeMusic(track, detailsLoaded = false) {
  const processingStatus = ['processing', 'ready', 'failed'].includes(track.processing_status)
    ? track.processing_status
    : 'ready'
  const duration = Number(track.duration_ms)

  return {
    id: track.id,
    title: track.title || 'Untitled',
    artist: track.artist || 'Unknown Artist',
    album: track.album || 'Unknown Album',
    duration: Number.isFinite(duration) ? Math.max(0, duration / 1000) : 0,
    bitrate: Number(track.bitrate) || 0,
    sampleRate: Number(track.sample_rate) || 0,
    cover: normalizeMusicCoverUrl(track.cover_url),
    audioUrl: resolveAssetUrl(track.audio_url),
    originalUrl: resolveAssetUrl(track.original_url),
    format: track.format || '',
    originalFormat: track.original_format || '',
    size: Number(track.size) || 0,
    originalSize: Number(track.original_size) || 0,
    isFavorite: Boolean(track.is_favorite),
    processingStatus,
    processingError: track.processing_error || '',
    createdAt: track.created_at || '',
    detailsLoaded,
  }
}

function normalizeMusicListItem(track) {
  return {
    ...normalizeMusic(track),
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    audioUrl: '',
    originalUrl: '',
    format: '',
    originalFormat: '',
    size: 0,
    originalSize: 0,
    detailsLoaded: false,
  }
}

export function getMusic() {
  return request.get('/music/list').then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid music response')
    return response.data
      .map(normalizeMusicListItem)
      .filter(track => track.processingStatus !== 'failed')
  })
}

export class MusicDuplicateError extends Error {
  constructor(message, kind, matches = []) {
    super(message)
    this.name = 'MusicDuplicateError'
    this.kind = kind
    this.matches = matches
  }
}

export function uploadMusic(files, options = {}) {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file, file.name))
  if (options.allowSimilar) formData.append('allow_similar', 'true')

  return request.post('/music/upload', formData, { timeout: 0 })
    .then(response => {
      if (!Array.isArray(response.data)) throw new Error('Invalid music upload response')
      return response.data.map(normalizeMusicListItem)
    })
    .catch(error => {
      const message = error?.response?.data?.message
      const conflict = error?.response?.data?.data
      if (
        error?.response?.status === 409
        && (conflict?.kind === 'exact' || conflict?.kind === 'similar')
      ) {
        const matches = Array.isArray(conflict.matches)
          ? conflict.matches.map(match => ({
            id: match.id || '',
            title: match.title || 'Untitled',
            artist: match.artist || 'Unknown Artist',
            album: match.album || 'Unknown Album',
            duration: Math.max(0, Number(match.duration_ms) / 1000) || 0,
          }))
          : []
        throw new MusicDuplicateError(
          typeof message === 'string' && message.trim() ? message : 'Duplicate music detected.',
          conflict.kind,
          matches,
        )
      }
      throw new Error(
        typeof message === 'string' && message.trim()
          ? message
          : 'Music upload failed. Please try again.',
      )
    })
}

export function getMusicTrack(id) {
  return request.get(`/music/${encodeURIComponent(id)}`).then(response => {
    if (!response.data || response.data.id !== id) {
      throw new Error('Invalid music response')
    }
    return normalizeMusic(response.data, true)
  })
}

export function deleteMusicTrack(id) {
  return request.delete(`/music/${encodeURIComponent(id)}`).then(() => undefined)
}

export function musicWebSocketUrl() {
  const apiUrl = new URL(import.meta.env.VITE_API_URL || 'http://localhost:8100/api')
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/music/ws`
  apiUrl.search = ''
  return apiUrl.toString()
}

export function normalizeMusicEvent(payload) {
  if (
    !payload ||
    payload.event !== 'music.processing' ||
    !payload.music ||
    payload.id !== payload.music.id
  ) {
    return null
  }
  return normalizeMusicListItem(payload.music)
}

export function updateMusicFavorite(id, favorite) {
  return request.put(`/music/${encodeURIComponent(id)}/favorite`, { favorite }).then(response => {
    if (!response.data || response.data.id !== id) {
      throw new Error('Invalid music favorite response')
    }
    return Boolean(response.data.is_favorite)
  })
}
