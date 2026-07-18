import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { getMessageHistory, getMessageUserInfo } from '@/api/chat'
import type {
  ChatApiMessage,
  SendImageMessageInput,
  SendMessageInput,
} from '@/api/chat'
import { defaultAvatarDataUrl, resolveAssetUrl, resolveAvatarUrl } from '@/lib/avatar'

export interface ChatContact {
  id: string
  name: string
  type: 'group' | 'user'
  avatar: string
  lastMsg: string
  time: string
  lastMessageTime: string | null
  online?: boolean
  isPro: boolean
  members: ChatMember[]
}

export interface ChatMember {
  user_id: string
  avatar?: string | null
  username: string
  online: boolean
}

interface ApiContact {
  user_id?: string | null
  group_id?: string | null
  chat_type: 'private' | 'public'
  avatar?: string | null
  username: string
  online?: boolean | null
  is_pro?: boolean
  content?: string | null
  last_message_time?: string | null
  members?: ChatMember[]
}

export interface ChatMessage {
  id: number | string
  text: string
  from: 'me' | 'them'
  time: string
  status?: 'sending' | 'sent' | 'failed'
  clientMessageId?: string
  sendRequest?: SendMessageInput
  sendImageRequest?: SendImageMessageInput
  imageUrl?: string
  imageName?: string
  createdAt?: string
}

export interface ConversationCache {
  messages: ChatMessage[]
  initialized: boolean
  loading: boolean
  refreshing: boolean
  loadingMore: boolean
  hasMore: boolean
  fetchedAt: number | null
  error: string | null
}

interface ChatState {
  contacts: ChatContact[]
  conversations: Record<string, ConversationCache>
  loading: boolean
  refreshing: boolean
  initialized: boolean
  error: string | null
  lastFetchedAt: number | null
}

const CACHE_KEY = 'chat_contacts'
const REFRESH_THROTTLE_MS = 3000
export const MESSAGE_CACHE_TTL_MS = 5 * 60 * 1000
export const MESSAGE_HISTORY_PAGE_SIZE = 50

function emptyConversationCache(): ConversationCache {
  return {
    messages: [],
    initialized: false,
    loading: false,
    refreshing: false,
    loadingMore: false,
    hasMore: true,
    fetchedAt: null,
    error: null,
  }
}

export function toChatMessage(message: ChatApiMessage, userId: string): ChatMessage | null {
  const imageUrl = message.message_type === 2
    ? resolveAssetUrl(message.file_url)
    : ''
  if (!message.content && !imageUrl) return null
  return {
    id: message.id,
    text: message.content || message.file_name || 'Photo',
    from: message.send_id === userId ? 'me' : 'them',
    time: new Date(message.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: message.status === 'sent' ? 'sent' : undefined,
    clientMessageId: message.client_message_id || undefined,
    imageUrl: imageUrl || undefined,
    imageName: message.file_name || undefined,
    createdAt: message.created_at,
  }
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const merged = [...current]
  incoming.forEach(message => {
    const index = merged.findIndex(item => (
      item.id === message.id
      || Boolean(
        message.clientMessageId
        && item.clientMessageId === message.clientMessageId,
      )
    ))
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...message,
        status: message.status || merged[index].status,
        sendRequest: undefined,
        sendImageRequest: undefined,
      }
    } else {
      merged.push(message)
    }
  })
  return merged.sort((a, b) => {
    const left = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY
    const right = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY
    if (left !== right) return left - right
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id
    return String(a.id).localeCompare(String(b.id))
  })
}

function oldestServerMessageId(messages: ChatMessage[]) {
  const ids = messages
    .map(message => message.id)
    .filter((id): id is number => typeof id === 'number')
  return ids.length > 0 ? Math.min(...ids) : undefined
}

function readCache(): ChatContact[] {
  try {
    const value = sessionStorage.getItem(CACHE_KEY)
    return value ? JSON.parse(value) as ChatContact[] : []
  } catch {
    return []
  }
}

const cachedContacts = readCache()

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function formatLatestMessageTime(value: string | null) {
  if (!value) return 'No messages'

  const date = new Date(value)
  const now = new Date()
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'just now'

  const isSameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  if (isSameDay) {
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    date.getFullYear() === yesterday.getFullYear()
    && date.getMonth() === yesterday.getMonth()
    && date.getDate() === yesterday.getDate()
  ) {
    return 'yesterday'
  }

  const dateText = `${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
  return date.getFullYear() === now.getFullYear()
    ? dateText
    : `${dateText}-${date.getFullYear()}`
}

function conversationId(contact: ApiContact) {
  const contactId = contact.chat_type === 'public' ? contact.group_id : contact.user_id
  return contactId ? `${contact.chat_type === 'public' ? 'group' : 'user'}:${contactId}` : null
}

function fallbackAvatar(contact: ApiContact) {
  return defaultAvatarDataUrl(contact.username)
}

function formatContact(contact: ApiContact): ChatContact | null {
  const id = conversationId(contact)
  if (!id || !contact.username.trim()) return null

  return {
    id,
    name: contact.username,
    type: contact.chat_type === 'public' ? 'group' : 'user',
    avatar: resolveAvatarUrl(contact.avatar) || fallbackAvatar(contact),
    lastMsg: contact.content || '',
    time: formatLatestMessageTime(contact.last_message_time || null),
    lastMessageTime: contact.last_message_time || null,
    online: contact.online ?? undefined,
    isPro: Boolean(contact.is_pro),
    members: contact.members || [],
  }
}

function mergeContacts(current: ChatContact[], incoming: ChatContact[]) {
  const merged = new Map(current.map(contact => [contact.id, contact]))
  incoming.forEach(contact => merged.set(contact.id, { ...merged.get(contact.id), ...contact }))
  return Array.from(merged.values()).sort((a, b) => {
    if (!a.lastMessageTime) return 1
    if (!b.lastMessageTime) return -1
    return b.lastMessageTime.localeCompare(a.lastMessageTime)
  })
}

const initialState: ChatState = {
  contacts: cachedContacts,
  conversations: {},
  loading: false,
  refreshing: false,
  initialized: cachedContacts.length > 0,
  error: null,
  lastFetchedAt: null,
}

interface FetchConversationHistoryInput {
  conversationId: string
  chatType: 'private' | 'public'
  contactId: string
  userId: string
  mode?: 'initial' | 'refresh' | 'older'
}

export const fetchConversationHistory = createAsyncThunk<
  ChatMessage[],
  FetchConversationHistoryInput,
  { state: { chat: ChatState } }
>(
  'chat/fetchConversationHistory',
  async ({ chatType, contactId, userId, conversationId: _conversationId, mode = 'initial' }, { getState }) => {
    const cache = getState().chat.conversations[_conversationId]
    const beforeId = mode === 'older'
      ? oldestServerMessageId(cache?.messages || [])
      : undefined
    const history = await getMessageHistory({
      chat_type: chatType,
      contact_id: contactId,
      limit: MESSAGE_HISTORY_PAGE_SIZE,
      before_id: beforeId,
    })
    return history
      .map(message => toChatMessage(message, userId))
      .filter((message): message is ChatMessage => message !== null)
  },
  {
    condition: ({ conversationId, mode = 'initial' }, { getState }) => {
      const cache = getState().chat.conversations[conversationId]
      if (!cache) return mode !== 'older'
      if (mode === 'older') {
        return cache.initialized
          && cache.hasMore
          && !cache.loadingMore
          && oldestServerMessageId(cache.messages) !== undefined
      }
      if (cache.loading || cache.refreshing) return false
      if (mode === 'refresh') return true
      return !cache.initialized
        || !cache.fetchedAt
        || Date.now() - cache.fetchedAt >= MESSAGE_CACHE_TTL_MS
    },
  },
)

export const refreshContacts = createAsyncThunk<
  ChatContact[],
  { silent?: boolean } | undefined,
  { state: { chat: ChatState } }
>(
  'chat/refreshContacts',
  async () => {
    const apiContacts = await getMessageUserInfo()
    return apiContacts
      .map(formatContact)
      .filter((contact): contact is ChatContact => contact !== null)
  },
  {
    condition: ({ silent = false } = {}, { getState }) => {
      const state = getState()
      if (state.chat.refreshing) return false
      if (silent && state.chat.lastFetchedAt && Date.now() - state.chat.lastFetchedAt < REFRESH_THROTTLE_MS) {
        return false
      }
      return true
    },
  },
)

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearContacts: state => {
      state.contacts = []
      state.conversations = {}
      state.loading = false
      state.refreshing = false
      state.initialized = false
      state.error = null
      state.lastFetchedAt = null
      sessionStorage.removeItem(CACHE_KEY)
    },
    hydrateContacts: (state, action: PayloadAction<ChatContact[]>) => {
      state.contacts = action.payload
      state.initialized = action.payload.length > 0
    },
    updateContactPreview: (
      state,
      action: PayloadAction<{ id: string; content: string; lastMessageTime: string }>,
    ) => {
      const contact = state.contacts.find(item => item.id === action.payload.id)
      if (!contact) return

      contact.lastMsg = action.payload.content
      contact.lastMessageTime = action.payload.lastMessageTime
      contact.time = formatLatestMessageTime(action.payload.lastMessageTime)
      state.contacts.sort((a, b) => {
        if (!a.lastMessageTime) return 1
        if (!b.lastMessageTime) return -1
        return b.lastMessageTime.localeCompare(a.lastMessageTime)
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(state.contacts))
    },
    appendConversationMessage: (
      state,
      action: PayloadAction<{ conversationId: string; message: ChatMessage }>,
    ) => {
      const cache = state.conversations[action.payload.conversationId]
        ||= emptyConversationCache()
      cache.messages = mergeMessages(cache.messages, [action.payload.message])
    },
    replaceConversationMessage: (
      state,
      action: PayloadAction<{
        conversationId: string
        temporaryId: number | string
        message: ChatMessage
      }>,
    ) => {
      const cache = state.conversations[action.payload.conversationId]
        ||= emptyConversationCache()
      cache.messages = cache.messages.map(message => (
        message.id === action.payload.temporaryId
        || Boolean(
          action.payload.message.clientMessageId
          && message.clientMessageId === action.payload.message.clientMessageId,
        )
          ? action.payload.message
          : message
      ))
    },
    patchConversationMessage: (
      state,
      action: PayloadAction<{
        conversationId: string
        messageId: number | string
        changes: Partial<ChatMessage>
      }>,
    ) => {
      const cache = state.conversations[action.payload.conversationId]
      if (!cache) return
      const message = cache.messages.find(item => item.id === action.payload.messageId)
      if (message) Object.assign(message, action.payload.changes)
    },
  },
  extraReducers: builder => {
    builder
      .addCase(refreshContacts.pending, (state, action) => {
        const silent = action.meta.arg?.silent ?? false
        state.loading = !silent && state.contacts.length === 0
        state.refreshing = true
        state.error = null
      })
      .addCase(refreshContacts.fulfilled, (state, action) => {
        state.contacts = mergeContacts([], action.payload)
        state.loading = false
        state.refreshing = false
        state.initialized = true
        state.lastFetchedAt = Date.now()
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(state.contacts))
      })
      .addCase(refreshContacts.rejected, (state, action) => {
        state.loading = false
        state.refreshing = false
        state.error = action.error.message || 'Unable to load contacts'
      })
      .addCase(fetchConversationHistory.pending, (state, action) => {
        const { conversationId, mode = 'initial' } = action.meta.arg
        const cache = state.conversations[conversationId] ||= emptyConversationCache()
        cache.error = null
        if (mode === 'older') {
          cache.loadingMore = true
        } else if (mode === 'refresh' || cache.initialized) {
          cache.refreshing = true
        } else {
          cache.loading = true
        }
      })
      .addCase(fetchConversationHistory.fulfilled, (state, action) => {
        const { conversationId, mode = 'initial' } = action.meta.arg
        const cache = state.conversations[conversationId] ||= emptyConversationCache()
        cache.messages = mergeMessages(cache.messages, action.payload)
        cache.initialized = true
        cache.loading = false
        cache.refreshing = false
        cache.loadingMore = false
        cache.error = null
        if (mode !== 'older') cache.fetchedAt = Date.now()
        if (mode === 'older') {
          if (action.payload.length < MESSAGE_HISTORY_PAGE_SIZE) cache.hasMore = false
        } else {
          cache.hasMore = action.payload.length === MESSAGE_HISTORY_PAGE_SIZE
        }
      })
      .addCase(fetchConversationHistory.rejected, (state, action) => {
        const { conversationId } = action.meta.arg
        const cache = state.conversations[conversationId] ||= emptyConversationCache()
        cache.loading = false
        cache.refreshing = false
        cache.loadingMore = false
        if (!action.meta.condition) {
          cache.error = action.error.message || 'Unable to load message history'
          cache.initialized = true
        }
      })
  },
})

export const {
  appendConversationMessage,
  clearContacts,
  hydrateContacts,
  patchConversationMessage,
  replaceConversationMessage,
  updateContactPreview,
} = chatSlice.actions
export default chatSlice.reducer
