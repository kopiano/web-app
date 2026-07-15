import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { getMessageUserInfo } from '@/api/chat'
import { resolveAvatarUrl } from '@/lib/avatar'

export interface ChatContact {
  id: string
  name: string
  type: 'group' | 'user'
  avatar: string
  lastMsg: string
  time: string
  lastMessageTime: string | null
  online?: boolean
  members: ChatMember[]
}

export interface ChatMember {
  user_id: string
  avatar?: string | null
  username: string
  status: boolean
}

interface ApiContact {
  user_id?: string | null
  group_id?: string | null
  chat_type: 'private' | 'public'
  avatar?: string | null
  username: string
  status?: boolean | null
  content?: string | null
  last_message_time?: string | null
  members?: ChatMember[]
}

interface ChatState {
  contacts: ChatContact[]
  loading: boolean
  refreshing: boolean
  initialized: boolean
  error: string | null
  lastFetchedAt: number | null
}

const CACHE_KEY = 'chat_contacts'
const REFRESH_THROTTLE_MS = 3000

function readCache(): ChatContact[] {
  try {
    const value = sessionStorage.getItem(CACHE_KEY)
    return value ? JSON.parse(value) as ChatContact[] : []
  } catch {
    return []
  }
}

const cachedContacts = readCache()

function conversationId(contact: ApiContact) {
  const contactId = contact.chat_type === 'public' ? contact.group_id : contact.user_id
  return contactId ? `${contact.chat_type === 'public' ? 'group' : 'user'}:${contactId}` : null
}

function fallbackAvatar(contact: ApiContact) {
  const seed = contact.user_id || contact.group_id || contact.username
  return `https://picsum.photos/seed/contact-${encodeURIComponent(seed)}/100/100`
}

function formatContact(contact: ApiContact): ChatContact | null {
  const id = conversationId(contact)
  if (!id || !contact.username.trim()) return null

  return {
    id,
    name: contact.username,
    type: contact.chat_type === 'public' ? 'group' : 'user',
    avatar: resolveAvatarUrl(contact.avatar) || fallbackAvatar(contact),
    lastMsg: contact.content || 'No messages yet',
    time: contact.last_message_time
      ? new Date(contact.last_message_time).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'No messages',
    lastMessageTime: contact.last_message_time || null,
    online: contact.status ?? undefined,
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
  loading: false,
  refreshing: false,
  initialized: cachedContacts.length > 0,
  error: null,
  lastFetchedAt: null,
}

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
      contact.time = new Date(action.payload.lastMessageTime).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      state.contacts.sort((a, b) => {
        if (!a.lastMessageTime) return 1
        if (!b.lastMessageTime) return -1
        return b.lastMessageTime.localeCompare(a.lastMessageTime)
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(state.contacts))
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
  },
})

export const { clearContacts, hydrateContacts, updateContactPreview } = chatSlice.actions
export default chatSlice.reducer
