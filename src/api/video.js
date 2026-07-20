import request from './request'
import { resolveAssetUrl } from '@/lib/avatar'

const MAX_VIDEO_UPLOAD_BYTES = 6 * 1024 * 1024 * 1024
const VIDEO_UPLOAD_RESUME_KEY = 'lume-video-upload-resume-v1'

function normalizeCategory(category) {
  return {
    id: String(category.id),
    slug: String(category.slug),
    nameZh: String(category.name_zh),
    nameEn: String(category.name_en),
  }
}

function normalizeVideo(video) {
  return {
    id: String(video.id),
    userId: String(video.user_id),
    username: String(video.username || ''),
    avatar: resolveAssetUrl(video.avatar),
    title: String(video.title || ''),
    description: String(video.description || ''),
    coverUrl: resolveAssetUrl(video.cover_url),
    duration: Number(video.duration) || 0,
    width: video.width == null ? null : Number(video.width),
    height: video.height == null ? null : Number(video.height),
    fps: video.fps == null ? null : Number(video.fps),
    size: video.size == null ? null : Number(video.size),
    originFileUrl: resolveAssetUrl(video.origin_file_url),
    hlsMasterUrl: resolveAssetUrl(video.hls_master_url),
    status: video.status === 'uploading' || video.status === 'ready' || video.status === 'failed'
      ? video.status
      : 'processing',
    visibility: video.visibility === 'private' ? 'private' : 'public',
    processingProgress: Number(video.processing_progress) || 0,
    processingError: video.processing_error ? String(video.processing_error) : null,
    viewCount: Number(video.view_count) || 0,
    likeCount: Number(video.like_count) || 0,
    commentCount: Number(video.comment_count) || 0,
    favoriteCount: Number(video.favorite_count) || 0,
    liked: Boolean(video.liked),
    favorited: Boolean(video.favorited),
    owned: Boolean(video.owned),
    categories: Array.isArray(video.categories)
      ? video.categories.map(normalizeCategory)
      : [],
    createdAt: String(video.created_at),
    updatedAt: String(video.updated_at),
  }
}

function normalizeComment(comment) {
  return {
    id: String(comment.id),
    videoId: String(comment.video_id),
    userId: String(comment.user_id),
    username: String(comment.username || ''),
    avatar: resolveAssetUrl(comment.avatar),
    parentId: comment.parent_id ? String(comment.parent_id) : null,
    replyToUserId: comment.reply_to_user_id ? String(comment.reply_to_user_id) : null,
    replyToUsername: comment.reply_to_username ? String(comment.reply_to_username) : null,
    content: String(comment.content || ''),
    likeCount: Number(comment.like_count) || 0,
    liked: Boolean(comment.liked),
    createdAt: String(comment.created_at),
    updatedAt: String(comment.updated_at),
  }
}

function normalizeCollection(collection) {
  return {
    id: String(collection.id),
    userId: String(collection.user_id),
    username: String(collection.username || ''),
    avatar: resolveAssetUrl(collection.avatar),
    title: String(collection.title || ''),
    description: String(collection.description || ''),
    visibility: collection.visibility === 'private' ? 'private' : 'public',
    videoCount: Number(collection.video_count) || 0,
    totalViews: Number(collection.total_views) || 0,
    coverUrl: resolveAssetUrl(collection.cover_url),
    createdAt: String(collection.created_at),
    updatedAt: String(collection.updated_at),
  }
}

export function getVideos(params = {}) {
  return request.get('/video', { params }).then(response => {
    const page = response.data
    if (!page || !Array.isArray(page.items)) throw new Error('Invalid video list response')
    return {
      items: page.items.map(normalizeVideo),
      hasMore: Boolean(page.has_more),
      nextBeforeCreatedAt: page.next_before_created_at || null,
      nextBeforeId: page.next_before_id || null,
    }
  })
}

export function getVideo(id) {
  return request.get(`/video/${encodeURIComponent(id)}`).then(response => normalizeVideo(response.data))
}

export function getVideoCategories(params) {
  return request.get('/video/categories', { params }).then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid video categories response')
    return response.data.map(normalizeCategory)
  })
}

export function getVideoCollections({ mine = false } = {}) {
  return request.get('/video/collections', { params: mine ? { mine: true } : undefined }).then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid video collections response')
    return response.data.map(normalizeCollection)
  })
}

function uploadFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`
}

function readUploadResume(file) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIDEO_UPLOAD_RESUME_KEY) || '')
    if (
      saved
      && saved.fingerprint === uploadFingerprint(file)
      && typeof saved.uploadId === 'string'
      && typeof saved.videoId === 'string'
    ) {
      return saved
    }
  } catch {
    // A corrupt resume value simply starts a fresh upload.
  }
  return null
}

function writeUploadResume(file, session) {
  try {
    window.localStorage.setItem(VIDEO_UPLOAD_RESUME_KEY, JSON.stringify({
      fingerprint: uploadFingerprint(file),
      uploadId: session.uploadId,
      videoId: session.video.id,
    }))
  } catch {
    // Resuming remains available for the current page when storage is unavailable.
  }
}

function clearUploadResume(file) {
  try {
    const saved = readUploadResume(file)
    if (saved) window.localStorage.removeItem(VIDEO_UPLOAD_RESUME_KEY)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

function normalizeUploadSession(session) {
  return {
    uploadId: String(session.upload_id),
    video: normalizeVideo(session.video),
    chunkSize: Number(session.chunk_size) || 8 * 1024 * 1024,
    uploadedBytes: Number(session.uploaded_bytes) || 0,
    totalBytes: Number(session.total_bytes) || 0,
    complete: Boolean(session.complete),
  }
}

function isAbortError(error, signal) {
  return Boolean(signal?.aborted)
    || error?.name === 'AbortError'
    || error?.code === 'ERR_CANCELED'
}

export async function uploadVideo(file, onUploadProgress, signal, onUploadCreated) {
  if (file.size <= 0 || file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error('Video files must be between 1 byte and 6 GB.')
  }

  let session = null
  const saved = readUploadResume(file)
  if (saved) {
    try {
      const response = await request.get(`/video/uploads/${encodeURIComponent(saved.uploadId)}`, { signal })
      const candidate = normalizeUploadSession(response.data)
      if (candidate.totalBytes === file.size && candidate.video.id === saved.videoId) {
        session = candidate
      } else {
        clearUploadResume(file)
      }
    } catch (error) {
      if (isAbortError(error, signal)) throw error
      clearUploadResume(file)
    }
  }
  if (!session) {
    const response = await request.post('/video/uploads', {
      file_name: file.name,
      content_type: file.type || null,
      total_bytes: file.size,
    }, { signal })
    session = normalizeUploadSession(response.data)
  }

  writeUploadResume(file, session)
  onUploadCreated?.(session.video)
  let uploadedBytes = session.uploadedBytes
  onUploadProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)))

  while (uploadedBytes < file.size) {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError')
    const nextOffset = Math.min(file.size, uploadedBytes + session.chunkSize)
    const chunk = file.slice(uploadedBytes, nextOffset)
    let retries = 0

    while (true) {
      try {
        const response = await request.put(
          `/video/uploads/${encodeURIComponent(session.uploadId)}/chunk`,
          chunk,
          {
            timeout: 0,
            signal,
            headers: {
              'Content-Type': 'application/offset+octet-stream',
              'Upload-Offset': String(uploadedBytes),
            },
          },
        )
        session = normalizeUploadSession(response.data)
        uploadedBytes = session.uploadedBytes
        writeUploadResume(file, session)
        onUploadProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)))
        break
      } catch (error) {
        if (isAbortError(error, signal)) throw error
        if (retries >= 2) throw error
        retries += 1
        const response = await request.get(
          `/video/uploads/${encodeURIComponent(session.uploadId)}`,
          { signal },
        )
        session = normalizeUploadSession(response.data)
        if (session.totalBytes !== file.size || session.complete) break
        uploadedBytes = session.uploadedBytes
        writeUploadResume(file, session)
        onUploadProgress?.(Math.min(100, Math.round((uploadedBytes / file.size) * 100)))
      }
    }
  }

  const response = await request.post(
    `/video/uploads/${encodeURIComponent(session.uploadId)}/complete`,
    undefined,
    { timeout: 0, signal },
  )
  clearUploadResume(file)
  onUploadProgress?.(100)
  return normalizeVideo(response.data)
}

export function updateVideo(id, input) {
  const formData = new FormData()
  if (typeof input.title === 'string') formData.append('title', input.title.trim())
  if (typeof input.description === 'string') formData.append('description', input.description.trim())
  if (input.visibility) formData.append('visibility', input.visibility)
  if (Array.isArray(input.categories)) formData.append('categories', JSON.stringify(input.categories))
  if (input.publish) formData.append('publish', 'true')
  if (input.cover) formData.append('cover', input.cover, input.cover.name)
  return request.patch(`/video/${encodeURIComponent(id)}`, formData).then(response => normalizeVideo(response.data))
}

export function deleteVideo(id) {
  return request.delete(`/video/${encodeURIComponent(id)}`).then(() => undefined)
}

export function updateVideoLike(id, active) {
  return request[active ? 'post' : 'delete'](`/video/${encodeURIComponent(id)}/like`).then(response => ({
    active: Boolean(response.data.active),
    count: Number(response.data.count) || 0,
  }))
}

export function updateVideoFavorite(id, active) {
  return request[active ? 'post' : 'delete'](`/video/${encodeURIComponent(id)}/favorite`).then(response => ({
    active: Boolean(response.data.active),
    count: Number(response.data.count) || 0,
  }))
}

export function getVideoComments(id) {
  return request.get(`/video/${encodeURIComponent(id)}/comments`).then(response => {
    if (!Array.isArray(response.data)) throw new Error('Invalid video comments response')
    return response.data.map(normalizeComment)
  })
}

export function createVideoComment(id, input) {
  return request.post(`/video/${encodeURIComponent(id)}/comments`, {
    content: input.content,
    parent_id: input.parentId || null,
    reply_to_user_id: input.replyToUserId || null,
  }).then(response => normalizeComment(response.data))
}

export function updateVideoCommentLike(id, active) {
  return request[active ? 'post' : 'delete'](`/video/comments/${encodeURIComponent(id)}/like`).then(response => ({
    liked: Boolean(response.data.liked),
    likeCount: Number(response.data.like_count) || 0,
  }))
}

export function viewVideo(id) {
  return request.post(`/video/${encodeURIComponent(id)}/view`).then(response => ({
    counted: Boolean(response.data.counted),
    viewCount: Number(response.data.view_count) || 0,
  }))
}

export function createVideoCollection(input) {
  return request.post('/video/collections', input).then(response => normalizeCollection(response.data))
}

export function updateVideoCollection(id, input) {
  return request.patch(`/video/collections/${encodeURIComponent(id)}`, input)
    .then(response => normalizeCollection(response.data))
}

export function deleteVideoCollection(id) {
  return request.delete(`/video/collections/${encodeURIComponent(id)}`).then(() => undefined)
}

export function addVideoToCollection(collectionId, videoId, position) {
  return request.post(`/video/collections/${encodeURIComponent(collectionId)}/items`, {
    video_id: videoId,
    position,
  }).then(response => normalizeCollection(response.data))
}

export function removeVideoFromCollection(collectionId, videoId) {
  return request.delete(
    `/video/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(videoId)}`,
  ).then(response => normalizeCollection(response.data))
}
