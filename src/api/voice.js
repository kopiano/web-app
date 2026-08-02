import axios from 'axios'

const voiceRequest = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8100/api/',
  timeout: 180000,
  withCredentials: true,
})

voiceRequest.interceptors.response.use(response => {
  const body = response.data
  if (
    !body
    || typeof body !== 'object'
    || body.code !== 200
    || !Object.prototype.hasOwnProperty.call(body, 'data')
  ) {
    return Promise.reject(new Error('Invalid voice API response format'))
  }
  response.data = body.data
  if (response.data?.audio_url && !/^https?:\/\//i.test(response.data.audio_url)) {
    response.data.audio_url = new URL(response.data.audio_url, voiceRequest.defaults.baseURL).toString()
  }
  return response
})

export function testLlmConnection(llm) {
  return voiceRequest.post('/voice/llm/test', { llm }).then(response => response.data)
}

export function generateLlmReply(input) {
  return voiceRequest.post('/voice/llm/chat', input).then(response => response.data)
}

export async function streamLlmReply(input, onDelta) {
  const baseURL = String(voiceRequest.defaults.baseURL || window.location.origin)
    .replace(/\/?$/, '/')
  const response = await fetch(new URL('voice/llm/chat/stream', baseURL), {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    let body
    try {
      body = await response.json()
    } catch {
      body = null
    }
    const error = new Error(body?.message || body?.detail || 'LLM request failed')
    error.response = { status: response.status, data: body }
    throw error
  }
  if (!response.body) {
    throw new Error('LLM stream is unavailable')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''
  let text = ''
  let completed = false

  const consumeEvent = event => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trimStart()
      if (!data) continue
      if (data.trim() === '[DONE]') {
        completed = true
        return
      }
      let chunk
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      const delta = chunk?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        text += delta
        onDelta?.(delta, text)
      }
    }
  }

  while (!completed) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''
    events.forEach(consumeEvent)
  }
  buffer += decoder.decode()
  if (buffer.trim()) consumeEvent(buffer)

  const normalizedText = text.trim()
  if (!normalizedText) {
    throw new Error('LLM returned an empty response')
  }
  return { text: normalizedText }
}

export function createVoiceTrainingJob({
  nickname,
  versionName,
  audioFiles,
  listFile,
  onUploadProgress,
}) {
  const formData = new FormData()
  formData.append('nickname', nickname)
  formData.append('version_name', versionName)
  formData.append('list_file', listFile, listFile.name)
  audioFiles.forEach(file => formData.append('audio_files', file, file.name))
  const baseURL = String(voiceRequest.defaults.baseURL || window.location.origin)
    .replace(/\/?$/, '/')
  const requestURL = new URL('jobs', baseURL).toString()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', requestURL)
    xhr.withCredentials = true
    xhr.timeout = voiceRequest.defaults.timeout || 180000
    xhr.upload.onprogress = event => {
      onUploadProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : undefined,
      })
    }
    xhr.onerror = () => reject(new Error('Voice upload failed'))
    xhr.ontimeout = () => reject(new Error('Voice upload timed out'))
    xhr.onload = () => {
      let body
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        reject(new Error('Invalid voice API response format'))
        return
      }
      if (
        !body
        || typeof body !== 'object'
        || body.code !== 200
        || !Object.prototype.hasOwnProperty.call(body, 'data')
      ) {
        const error = new Error(body?.message || body?.detail || 'Voice upload failed')
        error.response = { status: xhr.status, data: body }
        reject(error)
        return
      }
      resolve(body.data)
    }
    xhr.send(formData)
  })
}

export function getVoiceTrainingJob(jobId) {
  return voiceRequest.get(`/jobs/${encodeURIComponent(jobId)}`).then(response => response.data)
}

export function acknowledgeVoiceTrainingJob(jobId) {
  return voiceRequest
    .post(`/jobs/${encodeURIComponent(jobId)}/ack`)
    .then(response => response.data)
}

export function voiceTrainingArtifactsUrl(jobId) {
  const baseURL = String(voiceRequest.defaults.baseURL || window.location.origin)
    .replace(/\/?$/, '/')
  return new URL(`jobs/${encodeURIComponent(jobId)}/artifacts`, baseURL).toString()
}

export function generateVoiceReply(input) {
  return voiceRequest.post('/voice/chat', input).then(response => response.data)
}

export function getCharacters() {
  return voiceRequest.get('/characters').then(response => response.data)
}

export function getCharacter(characterId) {
  return voiceRequest
    .get(`/characters/${encodeURIComponent(characterId)}`)
    .then(response => response.data)
}

export function getCharacterModels(characterId) {
  return voiceRequest
    .get(`/admin/characters/${encodeURIComponent(characterId)}/models`)
    .then(response => response.data)
}

export function switchCharacterModel(characterId, modelId) {
  return voiceRequest
    .put(`/admin/characters/${encodeURIComponent(characterId)}/model`, {
      model_id: modelId,
    })
    .then(response => response.data)
}

export function getCharacterBinding(contactUserId) {
  return voiceRequest
    .get(`/character-bindings/${encodeURIComponent(contactUserId)}`)
    .then(response => response.data)
}

export function saveCharacterBinding(contactUserId, characterId) {
  return voiceRequest
    .put(`/character-bindings/${encodeURIComponent(contactUserId)}`, {
      character_id: characterId || null,
    })
    .then(response => response.data)
}

export function createCharacterSession(characterId) {
  return voiceRequest.post('/chat/session', {
    character_id: characterId,
  }).then(response => response.data)
}

export function sendCharacterMessage(input) {
  return voiceRequest.post('/chat/message', input).then(response => response.data)
}

export function generateCharacterTts(input) {
  return voiceRequest.post('/tts', input).then(response => response.data)
}

export function characterTtsStreamUrl(input) {
  const baseURL = String(voiceRequest.defaults.baseURL || window.location.origin)
    .replace(/\/?$/, '/')
  const url = new URL('tts/stream', baseURL)
  Object.entries(input || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}

export function characterTtsWebSocketUrl() {
  const baseURL = String(voiceRequest.defaults.baseURL || window.location.origin)
    .replace(/\/?$/, '/')
  const url = new URL('tts/ws', baseURL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function streamCharacterTts(input, callbacks = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(characterTtsWebSocketUrl())
    const audioSegments = []
    let pendingSegment = null
    let settled = false
    let idleTimer = 0

    const clearIdleTimer = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = 0
    }
    const armIdleTimer = () => {
      clearIdleTimer()
      idleTimer = window.setTimeout(() => {
        finishWithError(new Error('Character voice stream timed out'))
      }, 180000)
    }
    const finishWithError = error => {
      if (settled) return
      settled = true
      clearIdleTimer()
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
      reject(error)
    }

    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      armIdleTimer()
      socket.send(JSON.stringify(input))
    }
    socket.onmessage = event => {
      armIdleTimer()
      if (typeof event.data === 'string') {
        let message
        try {
          message = JSON.parse(event.data)
        } catch {
          finishWithError(new Error('Invalid character voice stream event'))
          return
        }
        if (message?.type === 'start') {
          callbacks.onStart?.(message)
        } else if (message?.type === 'segment') {
          pendingSegment = message
        } else if (message?.type === 'error') {
          finishWithError(new Error(message.message || 'Character voice generation failed'))
        } else if (message?.type === 'done') {
          if (settled) return
          settled = true
          clearIdleTimer()
          callbacks.onDone?.(message)
          resolve({
            audio_segments: [...audioSegments],
            elapsed_ms: message.elapsed_ms,
          })
          socket.close(1000)
        }
        return
      }

      const metadata = pendingSegment || {
        index: audioSegments.length,
        mime_type: 'audio/wav',
      }
      pendingSegment = null
      const audio = new Blob([event.data], {
        type: metadata.mime_type || 'audio/wav',
      })
      const audioUrl = URL.createObjectURL(audio)
      audioSegments.push(audioUrl)
      callbacks.onSegment?.({
        ...metadata,
        audio_url: audioUrl,
      })
    }
    socket.onerror = () => {
      finishWithError(new Error('Character voice WebSocket is unavailable'))
    }
    socket.onclose = event => {
      clearIdleTimer()
      if (!settled) {
        finishWithError(new Error(
          event.reason || 'Character voice stream closed before completion',
        ))
      }
    }
  })
}

export function createCharacter(input) {
  return voiceRequest.post('/admin/characters', input).then(response => response.data)
}

export function deleteCharacter(characterId) {
  return voiceRequest.delete(`/admin/characters/${encodeURIComponent(characterId)}`)
    .then(response => response.data)
}
