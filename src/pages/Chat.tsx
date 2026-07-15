import { Fragment, useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolveAvatarUrl } from '@/lib/avatar';
import { getMessageHistory, sendMessage } from '@/api/chat';
import type { ChatApiMessage, ChatMessageEvent, SendMessageInput } from '@/api/chat';
import type { RootState, AppDispatch } from '@/store/store';
import { refreshContacts, updateContactPreview } from '@/store/chatSlice';
import '@/styles/chat.scss';

/* ── Types ── */
interface Contact {
  id: string;
  name: string;
  type: 'group' | 'user';
  avatar: string;
  lastMsg: string;
  time: string;
  online?: boolean;
  members?: unknown[];
}

interface Message {
  id: number | string;
  text: string;
  from: 'me' | 'them';
  time: string;
  status?: 'sending' | 'sent' | 'failed';
  clientMessageId?: string;
  sendRequest?: SendMessageInput;
  createdAt?: string;
}

interface Comment {
  id: number;
  author: string;
  text: string;
}

interface MomentPost {
  id: number;
  authorId?: string;
  name: string;
  avatar: string;
  text: string;
  media?: string;
  mediaType?: 'image' | 'video';
  time: string;
  likes: number;
  liked: boolean;
  views: number;
  comments: Comment[];
}

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣',
  '😊','😇','🙂','😉','😍','😘','😋','😎',
  '🤩','🥳','🤔','🤗','👍','👌','👏','🙌',
  '💪','🙏','🎉','✨','🔥','🚀','❤️','💜',
  '👍','👌','👏','🙌','🎉','🍉','☁️','🌍',
  '✨','🔥','🚀','🎮','🥇','🏅','🥬','🍇',
  '🌩️','🌨️','🌧️','🌦️','🌥️','🌤️','⛈️','⛅',
];

const ACTIVE_CONTACT_KEY = 'chat_active_contact';

function landscapeAvatar(seed: number) {
  return `https://picsum.photos/seed/${seed}/100/100`;
}

function messageWebSocketUrl() {
  const apiUrl = new URL(import.meta.env.VITE_API_URL || 'http://localhost:8100/api');
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/message/ws`;
  apiUrl.search = '';
  return apiUrl.toString();
}

function messageConversationId(message: ChatApiMessage, userId: string) {
  if (message.chat_type === 'public') {
    return message.group_id ? `group:${message.group_id}` : null;
  }

  const contactId = message.send_id === userId ? message.receiver_id : message.send_id;
  return contactId ? `user:${contactId}` : null;
}

function contactIdFromConversation(conversationId: string) {
  return conversationId.slice(conversationId.indexOf(':') + 1);
}

function toUiMessage(message: ChatApiMessage, userId: string): Message | null {
  if (!message.content) return null;
  return {
    id: message.id,
    text: message.content,
    from: message.send_id === userId ? 'me' : 'them',
    time: new Date(message.created_at).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: message.status === 'sent' ? 'sent' : undefined,
    clientMessageId: message.client_message_id || undefined,
    createdAt: message.created_at,
  };
}

function historyDateLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startOfDay = (input: Date) => new Date(
    input.getFullYear(),
    input.getMonth(),
    input.getDate(),
  ).getTime();
  const dayDifference = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000,
  );

  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isChatMessageEvent(value: unknown): value is ChatMessageEvent {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (payload.event !== 'message' || !payload.message || typeof payload.message !== 'object') return false;
  const message = payload.message as Record<string, unknown>;
  return (
    typeof message.id === 'number'
    && typeof message.chat_type === 'string'
    && typeof message.send_id === 'string'
    && typeof message.created_at === 'string'
  );
}

/* ── Mock Data ── */
const contacts: Contact[] = [
  { id: 'mock:group:1', name: 'Project Team', type: 'group', avatar: landscapeAvatar(101), lastMsg: 'See you tomorrow', time: '11:30' },
  { id: 'mock:user:2', name: 'Alice', type: 'user', avatar: landscapeAvatar(202), lastMsg: 'Got it', time: '10:15', online: true },
  { id: 'mock:user:3', name: 'Bob', type: 'user', avatar: landscapeAvatar(303), lastMsg: 'I fixed the code last night', time: 'Yesterday', online: false },
  { id: 'mock:user:4', name: 'Catherine', type: 'user', avatar: landscapeAvatar(404), lastMsg: 'Photo', time: 'Yesterday', online: true },
  { id: 'mock:user:5', name: 'David', type: 'user', avatar: landscapeAvatar(505), lastMsg: 'Sure', time: 'Monday', online: false },
];

const mockMessages: Record<string, Message[]> = {
  'mock:group:1': [
    { id: 1, text: 'Hey everyone, meeting tomorrow', from: 'them', time: '11:00' },
    { id: 2, text: 'Got it', from: 'me', time: '11:05' },
    { id: 3, text: 'See you tomorrow', from: 'them', time: '11:30' },
  ],
  'mock:user:2': [
    { id: 1, text: 'Hello!', from: 'them', time: '10:00' },
    { id: 2, text: 'Hi, what\'s up?', from: 'me', time: '10:05' },
    { id: 3, text: 'I sent you the files', from: 'them', time: '10:10' },
    { id: 4, text: 'Got it, thanks!', from: 'me', time: '10:15' },
  ],
  'mock:user:3': [
    { id: 1, text: 'I fixed the code last night', from: 'them', time: 'Yesterday' },
    { id: 2, text: 'Great, let me check', from: 'me', time: 'Yesterday' },
  ],
};

const initialMoments: MomentPost[] = [
  {
    id: 1, name: 'Alice', avatar: landscapeAvatar(202),
    text: 'Golden hour never disappoints 🌇✨',
    media: 'https://picsum.photos/seed/moment1/600/400',
    mediaType: 'image',
    time: '2h', likes: 5, liked: false, views: 128,
    comments: [{ id: 1, author: 'Bob', text: 'Absolutely stunning!' }],
  },
  {
    id: 2, name: 'Bob', avatar: landscapeAvatar(303),
    text: 'Weekend hiking. The view was worth every step.',
    media: 'https://picsum.photos/seed/moment2/600/400',
    mediaType: 'image',
    time: 'Yesterday', likes: 3, liked: true, views: 64,
    comments: [],
  },
];

function Chat() {
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const authInitialized = useSelector((state: RootState) => state.auth.initialized);
  const remoteContacts = useSelector((state: RootState) => state.chat.contacts);
  const contactsLoading = useSelector((state: RootState) => state.chat.loading);
  const contactsInitialized = useSelector((state: RootState) => state.chat.initialized);
  const contactsError = useSelector((state: RootState) => state.chat.error);
  const contactsLastFetchedAt = useSelector((state: RootState) => state.chat.lastFetchedAt);
  const currentUserName = currentUser?.name || currentUser?.username || 'You';
  const currentUserAvatar = resolveAvatarUrl(currentUser?.avatar)
    || (currentUser?.github_id
      ? `https://avatars.githubusercontent.com/u/${currentUser.github_id}?v=4`
      : landscapeAvatar(0));
  const [activeTab, setActiveTab] = useState<'chat' | 'moments'>(() => {
    return (localStorage.getItem('chat_tab') as 'chat' | 'moments') || 'chat';
  });
  const [activeContact, setActiveContact] = useState('mock:group:1');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMomentEmoji, setShowMomentEmoji] = useState(false);
  const [moments, setMoments] = useState<MomentPost[]>(initialMoments);
  const [momentText, setMomentText] = useState('');
  const [momentMedia, setMomentMedia] = useState<string | null>(null);
  const [momentMediaType, setMomentMediaType] = useState<'image' | 'video' | null>(null);
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<Record<number, boolean>>({});
  const [commentEmojiPost, setCommentEmojiPost] = useState<number | null>(null);
  const [viewedPosts] = useState(new Set<number>());
  const [animatingLikes, setAnimatingLikes] = useState<Set<number>>(new Set());
  const [activeIndicatorTop, setActiveIndicatorTop] = useState(0);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgListRef = useRef<HTMLDivElement>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const lastScrolledConversationRef = useRef('');
  const wasHistoryLoadingRef = useRef(false);
  const contactsPanelRef = useRef<HTMLElement>(null);
  const visibleContacts = useMemo<Contact[]>(
    () => currentUser ? remoteContacts : contacts,
    [currentUser, remoteContacts],
  );
  const activeContactInfo = useMemo(
    () => visibleContacts.find(contact => contact.id === activeContact) || null,
    [activeContact, visibleContacts],
  );
  const activeConversationId = activeContactInfo?.id || '';
  const isConversationLoading = Boolean(
    currentUser
      && !activeContactInfo
      && !(contactsInitialized && visibleContacts.length === 0),
  );
  const momentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (currentUser) {
      setActiveTab('chat');
      setActiveContact(localStorage.getItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`) || '');
      localStorage.setItem('chat_tab', 'chat');
    } else {
      setActiveContact('mock:group:1');
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!authInitialized || !currentUser) return;
    dispatch(refreshContacts({ silent: remoteContacts.length > 0 }));
  }, [authInitialized, currentUser?.id, dispatch]);

  useEffect(() => {
    if (!currentUser) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let reconnectDelay = 1000;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(messageWebSocketUrl());

      socket.onopen = () => {
        reconnectDelay = 1000;
      };

      socket.onmessage = event => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isChatMessageEvent(payload)) return;
        if (payload.event !== 'message' || payload.message.send_id === currentUser.id) return;

        const conversationId = messageConversationId(payload.message, currentUser.id);
        const incoming = toUiMessage(payload.message, currentUser.id);
        if (!conversationId || !incoming) return;

        setMessages(previous => {
          const conversationMessages = previous[conversationId] || [];
          if (conversationMessages.some(message => message.id === incoming.id)) {
            return previous;
          }
          return {
            ...previous,
            [conversationId]: [...conversationMessages, incoming],
          };
        });
        if (payload.message.content) {
          dispatch(updateContactPreview({
            id: conversationId,
            content: payload.message.content,
            lastMessageTime: payload.message.created_at,
          }));
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [currentUser?.id, dispatch]);

  useEffect(() => {
    const refresh = () => {
      if (
        currentUser
        && !contactsInitialized
        && document.visibilityState === 'visible'
      ) {
        dispatch(refreshContacts({ silent: true }));
      }
    };
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [contactsInitialized, currentUser?.id, dispatch]);

  useEffect(() => {
    if (
      !currentUser
      || !contactsInitialized
      || contactsLoading
      || !contactsLastFetchedAt
      || visibleContacts.some(contact => contact.id === activeContact)
    ) {
      return;
    }

    const savedContactId = localStorage.getItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`);
    const nextContactId = visibleContacts.some(contact => contact.id === savedContactId)
      ? savedContactId
      : visibleContacts[0]?.id;

    if (!nextContactId) return;

    setActiveContact(nextContactId);
    localStorage.setItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`, nextContactId);
  }, [
    activeContact,
    contactsInitialized,
    contactsLastFetchedAt,
    contactsLoading,
    currentUser?.id,
    visibleContacts,
  ]);

  useEffect(() => {
    if (!currentUser || !activeContactInfo || activeContactInfo.id.startsWith('mock:')) return;

    const conversationId = activeContactInfo.id;
    const chatType = activeContactInfo.type === 'group' ? 'public' : 'private';
    const contactId = contactIdFromConversation(conversationId);
    let disposed = false;

    setHistoryLoading(true);
    getMessageHistory({ chat_type: chatType, contact_id: contactId })
      .then(history => {
        if (disposed) return;
        const loadedMessages = history
          .map(message => toUiMessage(message, currentUser.id))
          .filter((message): message is Message => message !== null);
        setMessages(previous => {
          const localMessages = previous[conversationId] || [];
          const byClientId = new Map(
            localMessages
              .filter(message => message.clientMessageId)
              .map(message => [message.clientMessageId, message]),
          );
          const merged = loadedMessages.map(message => {
            const local = message.clientMessageId ? byClientId.get(message.clientMessageId) : undefined;
            return local ? { ...local, ...message, status: 'sent' as const } : message;
          });
          const loadedIds = new Set(merged.map(message => message.id));
          const loadedClientIds = new Set(
            merged
              .map(message => message.clientMessageId)
              .filter((id): id is string => Boolean(id)),
          );
          return {
            ...previous,
            [conversationId]: [
              ...merged,
              ...localMessages.filter(message =>
                !loadedIds.has(message.id)
                && (!message.clientMessageId || !loadedClientIds.has(message.clientMessageId)),
              ),
            ],
          };
        });
      })
      .catch(() => {
        if (!disposed) setMessages(previous => ({ ...previous, [conversationId]: previous[conversationId] || [] }));
      })
      .finally(() => {
        if (!disposed) setHistoryLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [activeConversationId, activeContactInfo?.type, currentUser?.id]);

  function selectContact(contactId: string) {
    setActiveContact(contactId);
    if (currentUser) {
      localStorage.setItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`, contactId);
    }
  }

  useLayoutEffect(() => {
    const conversationChanged = lastScrolledConversationRef.current !== activeConversationId;
    const historyJustLoaded = wasHistoryLoadingRef.current && !historyLoading;
    const shouldJumpToBottom = conversationChanged || historyLoading || historyJustLoaded;

    if (shouldJumpToBottom) {
      const messageList = msgListRef.current;
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    } else {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    lastScrolledConversationRef.current = activeConversationId;
    wasHistoryLoadingRef.current = historyLoading;
  }, [messages, activeConversationId, historyLoading]);

  useEffect(() => {
    const input = momentInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 70)}px`;
  }, [momentText]);

  useEffect(() => {
    const panel = contactsPanelRef.current;
    const activeItem = panel?.querySelector<HTMLElement>('.contact-item.active');
    if (activeItem) setActiveIndicatorTop(activeItem.offsetTop);
  }, [activeContact, visibleContacts]);

  /* ── Chat ── */
  async function persistMessage(
    conversationId: string,
    temporaryId: string,
    request: SendMessageInput,
    userId: string,
  ) {
    try {
      const persisted = await sendMessage(request);
      const persistedMessage = toUiMessage(persisted, userId);
      if (!persistedMessage) throw new Error('Message response has no content');
      setMessages(previous => ({
        ...previous,
        [conversationId]: (previous[conversationId] || []).map(message =>
          message.id === temporaryId || message.clientMessageId === request.client_message_id
            ? { ...persistedMessage, id: persisted.id, status: 'sent' }
            : message
        ),
      }));
    } catch {
      setMessages(previous => ({
        ...previous,
        [conversationId]: (previous[conversationId] || []).map(message =>
          message.id === temporaryId ? { ...message, status: 'failed' } : message
        ),
      }));
    }
  }

  async function handleSend() {
    const content = inputText.trim();
    if (!content || !activeConversationId || !activeContactInfo || !currentUser) return;

    const temporaryId = `local:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const conversationId = activeConversationId;
    const contactId = contactIdFromConversation(conversationId);
    const clientMessageId = crypto.randomUUID();
    const request: SendMessageInput = activeContactInfo.type === 'group'
      ? { chat_type: 'public', group_id: contactId, content, client_message_id: clientMessageId }
      : { chat_type: 'private', receiver_id: contactId, content, client_message_id: clientMessageId };
    const newMsg: Message = {
      id: temporaryId,
      text: content,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: 'sending',
      clientMessageId,
      sendRequest: request,
    };
    setMessages(p => ({ ...p, [conversationId]: [...(p[conversationId] || []), newMsg] }));
    setInputText('');

    await persistMessage(conversationId, temporaryId, request, currentUser.id);
  }

  async function retryMessage(message: Message) {
    if (!message.sendRequest || message.status !== 'failed' || !activeConversationId || !currentUser) return;
    setMessages(previous => ({
      ...previous,
      [activeConversationId]: (previous[activeConversationId] || []).map(item =>
        item.id === message.id ? { ...item, status: 'sending' } : item
      ),
    }));
    await persistMessage(activeConversationId, String(message.id), message.sendRequest, currentUser.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function pickEmoji(emoji: string) {
    setInputText(p => p + emoji);
    setShowEmoji(false);
  }

  function pickMomentEmoji(emoji: string) {
    setMomentText(p => p + emoji);
    setShowMomentEmoji(false);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !activeConversationId) return;
    const newMsg: Message = {
      id: Date.now(),
      text: `📎 ${f.name}`,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => ({ ...p, [activeConversationId]: [...(p[activeConversationId] || []), newMsg] }));
    e.target.value = '';
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !activeConversationId) return;
    const newMsg: Message = {
      id: Date.now(),
      text: `📷 ${f.name}`,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => ({ ...p, [activeConversationId]: [...(p[activeConversationId] || []), newMsg] }));
    e.target.value = '';
  }

  /* ── Moments ── */
  function handleMomentUpload(type: 'image' | 'video') {
    if (type === 'image') imageRef.current?.click();
    else videoRef.current?.click();
  }

  function handleMomentFile(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') {
    const file = e.target.files?.[0];
    if (!file) return;
    setMomentMedia(URL.createObjectURL(file));
    setMomentMediaType(type);
  }

  function handleMomentPublish() {
    if (!momentText.trim() && !momentMedia) return;
    setMoments(p => [{
      id: Date.now(),
      authorId: currentUser?.id,
      name: currentUserName,
      avatar: currentUserAvatar,
      text: momentText.trim(),
      media: momentMedia || undefined,
      mediaType: momentMediaType || undefined,
      time: 'just now',
      likes: 0, liked: false, views: 0, comments: [],
    }, ...p]);
    setMomentText('');
    setMomentMedia(null);
    setMomentMediaType(null);
  }

  function toggleLike(postId: number) {
    const current = moments.find(m => m.id === postId);
    if (!current || current.liked) {
      // unlike: no animation
      setMoments(p => p.map(m =>
        m.id === postId ? { ...m, liked: false, likes: m.likes - 1 } : m
      ));
      return;
    }
    // like: trigger particle animation
    setAnimatingLikes(prev => new Set(prev).add(postId));
    setMoments(p => p.map(m =>
      m.id === postId ? { ...m, liked: true, likes: m.likes + 1 } : m
    ));
    setTimeout(() => {
      setAnimatingLikes(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }, 650);
  }

  function trackView(postId: number) {
    if (viewedPosts.has(postId)) return;
    viewedPosts.add(postId);
    setMoments(p => p.map(m =>
      m.id === postId ? { ...m, views: m.views + 1 } : m
    ));
  }

  function handleCommentSubmit(postId: number) {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    setMoments(p => p.map(m =>
      m.id === postId ? { ...m, comments: [...m.comments, { id: Date.now(), author: currentUserName, text }] } : m
    ));
    setCommentTexts(p => ({ ...p, [postId]: '' }));
    setCommentEmojiPost(null);
  }

  function toggleCommentInput(postId: number) {
    setShowCommentInput(p => ({ ...p, [postId]: !p[postId] }));
    setCommentEmojiPost(null);
  }

  function pickCommentEmoji(postId: number, emoji: string) {
    setCommentTexts(p => ({ ...p, [postId]: `${p[postId] || ''}${emoji}` }));
    setCommentEmojiPost(null);
    setShowCommentInput(p => ({ ...p, [postId]: true }));
  }

  return (
    <section className="chat" id="chat">
      <div className="chat-page">
        {/* ── Left Nav ── */}
        <aside className="chat-nav">
          <div className="chat-nav-inner">
            <button
              className={`chat-nav-btn${activeTab === 'chat' ? ' active' : ''}`}
              onClick={() => { setActiveTab('chat'); localStorage.setItem('chat_tab', 'chat'); }}
              title="Chat"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className={`chat-nav-btn${activeTab === 'moments' ? ' active' : ''}`}
              onClick={() => { setActiveTab('moments'); localStorage.setItem('chat_tab', 'moments'); }}
              title="Moments"
              aria-label="Moments"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Chat View ── */}
        <div className={`chat-view${activeTab === 'chat' ? '' : ' hidden'}`}>
          {/* Contacts + Messages merged */}
          <div className="chat-panel">
            <aside ref={contactsPanelRef} className="contacts-panel">
              <div className="contact-active-indicator" style={{ top: activeIndicatorTop }} />
              <div className="contact-group-label">Groups</div>
              {visibleContacts.filter(c => c.type === 'group').map(c => (
                <div key={c.id} className={`contact-item${activeContact === c.id ? ' active' : ''}`} onClick={() => selectContact(c.id)}>
                  <div className="contact-avatar">
                    <img src={c.avatar} alt="" className="avatar-img" />
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-preview">{c.lastMsg}</div>
                  </div>
                  <div className="contact-time">{c.time}</div>
                </div>
              ))}
              <div className="contact-divider" />
              <div className="contact-group-label">Contacts</div>
              {visibleContacts.filter(c => c.type === 'user').map(c => (
                <div key={c.id} className={`contact-item${activeContact === c.id ? ' active' : ''}`} onClick={() => selectContact(c.id)}>
                  <div className="contact-avatar">
                    <img src={c.avatar} alt="" className="avatar-img" />
                    {c.online && <div className="contact-online" />}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-preview">{c.lastMsg}</div>
                  </div>
                  <div className="contact-time">{c.time}</div>
                </div>
              ))}
              {currentUser && visibleContacts.length === 0 && (
                <div className="contacts-state" role={contactsError ? 'alert' : 'status'}>
                  <span>
                    {contactsLoading || !contactsInitialized
                      ? 'Loading contacts...'
                      : contactsError
                        ? 'Unable to load contacts.'
                        : 'No contacts yet.'}
                  </span>
                  {contactsError && (
                    <button
                      type="button"
                      className="contacts-retry"
                      onClick={() => dispatch(refreshContacts())}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </aside>

            <div className="panel-divider" />

            <main className="messages-panel">
              <div className="messages-header">
                {activeContactInfo ? (
                  <>
                    <div className="messages-header-avatar">
                      <img src={activeContactInfo.avatar} alt="" className="avatar-img" />
                    </div>
                    <div className="messages-header-info">
                      <div className="messages-header-name">{activeContactInfo.name}</div>
                      <div className="messages-header-status">Active now</div>
                    </div>
                  </>
                ) : (
                  isConversationLoading ? (
                    <div className="messages-header-loading" role="status" aria-label="Loading conversation">
                      <span className="chat-loading-spinner" aria-hidden="true" />
                    </div>
                  ) : (
                    <div className="messages-header-info">
                      <div className="messages-header-name">No contacts yet</div>
                    </div>
                  )
                )}
              </div>
              <div ref={msgListRef} className="msg-list">
                {isConversationLoading || historyLoading ? (
                  <div className="messages-loading" role="status" aria-label="Loading conversation">
                    <span className="chat-loading-spinner" aria-hidden="true" />
                  </div>
                ) : (messages[activeConversationId] || []).length === 0 ? (
                  <div className="msg-empty">No messages yet</div>
                ) : (
                  (messages[activeConversationId] || []).map((msg, msgIndex, contactMessages) => {
                    const previousMessage = contactMessages[msgIndex - 1];
                    const showDateDivider = Boolean(
                      msg.createdAt
                      && (!previousMessage?.createdAt
                        || historyDateLabel(previousMessage.createdAt) !== historyDateLabel(msg.createdAt)),
                    );

                    return (
                    <Fragment key={msg.id}>
                      {showDateDivider && msg.createdAt && (
                        <div className="message-date-divider" role="separator">
                          <span>{historyDateLabel(msg.createdAt)}</span>
                        </div>
                      )}
                    <div className={`msg-wrap ${msg.from === 'me' ? 'sent' : 'received'}`}>
                      <div className="msg-sender">
                        <div className="msg-avatar">
                          <img
                            src={msg.from === 'me' ? currentUserAvatar : activeContactInfo?.avatar || landscapeAvatar(0)}
                            alt=""
                            className="avatar-img"
                          />
                        </div>
                      </div>
                      <div className="msg-content">
                        <div className={`msg ${msg.from === 'me' ? 'sent' : 'received'}`}>
                          <div className={`msg-text${msgIndex === contactMessages.length - 1 ? ' typing-text' : ''}`}>
                            {msgIndex === contactMessages.length - 1 ? (
                              Array.from(msg.text).map((char, charIndex) => (
                                <span
                                  key={`${msg.id}-${charIndex}`}
                                  className="msg-char"
                                  style={{ '--char-delay': `${charIndex * 0.032}s` } as React.CSSProperties}
                                >
                                  {char}
                                </span>
                              ))
                            ) : msg.text}
                          </div>
                        </div>
                        <div className="msg-time">
                          {msg.time}
                          {msg.from === 'me' && msg.status && (
                            <>
                              <span
                                className={`msg-status ${msg.status}`}
                                aria-label={
                                  msg.status === 'sent'
                                    ? 'Delivered'
                                    : msg.status === 'sending'
                                      ? 'Sending...'
                                      : 'Message failed'
                                }
                                title={
                                  msg.status === 'sent'
                                    ? 'Delivered'
                                    : msg.status === 'sending'
                                      ? 'Sending...'
                                      : 'Message failed'
                                }
                              >
                                {msg.status === 'sending' && (
                                  <span className="msg-status-icon sending-icon" aria-hidden="true" />
                                )}
                                {msg.status === 'sent' && (
                                  <span className="msg-status-icon delivered-icon" aria-hidden="true">
                                    <svg viewBox="0 0 16 16" focusable="false">
                                      <circle cx="8" cy="8" r="7" />
                                      <path d="m4.5 8.2 2.1 2.1 4.8-5" />
                                    </svg>
                                  </span>
                                )}
                                {msg.status === 'failed' && (
                                  <span className="msg-status-icon failed-icon" aria-hidden="true">!</span>
                                )}
                                <span className="msg-status-label">
                                  {msg.status === 'sent'
                                    ? 'Delivered'
                                    : msg.status === 'sending'
                                      ? 'Sending...'
                                      : 'Failed'}
                                </span>
                              </span>
                              {msg.status === 'failed' && msg.sendRequest && (
                                <button
                                  type="button"
                                  className="msg-retry-btn"
                                  onClick={() => retryMessage(msg)}
                                >
                                  Retry
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    </Fragment>
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </div>

              <div className="msg-input-bar">
                <div className="msg-input-inner">
                  <div className="relative">
                    <button className="input-tool-btn" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                      </svg>
                    </button>
                    {showEmoji && (
                      <div className="emoji-picker">
                        <div className="emoji-grid">
                          {EMOJIS.map(e => (<button key={e} className="emoji-btn" onClick={() => pickEmoji(e)}>{e}</button>))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button className="input-tool-btn" onClick={() => imageRef.current?.click()} title="Image">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={pickImage} />
                  <button className="input-tool-btn" onClick={() => fileRef.current?.click()} title="File">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </button>
                  <input ref={fileRef} type="file" hidden onChange={pickFile} />
                  <input className="msg-text-input" type="text" placeholder="Message..." value={inputText}
                    onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} />
                  <button className="msg-send-btn" disabled={!inputText.trim()} onClick={handleSend}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>

        {/* ── Moments View ── */}
        <div className={`moments-view${activeTab === 'moments' ? '' : ' hidden'}`}>
          <div className="moments-feed">
            <div className="moment-post">
              <div className="moment-post-top">
                <div className="moment-post-avatar">
                  <img src={currentUserAvatar} alt="" className="avatar-img" />
                </div>
                <textarea ref={momentInputRef} className="moment-post-input" placeholder="What's happening?" value={momentText}
                  onChange={e => setMomentText(e.target.value)} />
              </div>
              {momentMedia && (
                momentMediaType === 'image'
                  ? <img src={momentMedia} alt="" className="moment-preview" />
                  : <video src={momentMedia} controls className="moment-preview" />
              )}
              <div className="moment-post-bottom">
                <div className="moment-post-tools">
                  <button className="moment-tool-btn" onClick={() => setShowMomentEmoji(p => !p)} title="Emoji" aria-label="Add emoji">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>
                  {showMomentEmoji && (
                    <div className="emoji-picker moment-emoji-picker">
                      <div className="emoji-grid">
                        {EMOJIS.map(e => (
                          <button key={e} className="emoji-btn" onClick={() => pickMomentEmoji(e)}>{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="moment-tool-btn" onClick={() => handleMomentUpload('image')} title="Image">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                  </button>
                  <button className="moment-tool-btn" onClick={() => handleMomentUpload('video')} title="Video">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </button>
                  <input ref={imageRef} type="file" accept="image/*" hidden onChange={e => handleMomentFile(e, 'image')} />
                  <input ref={videoRef} type="file" accept="video/*" hidden onChange={e => handleMomentFile(e, 'video')} />
                </div>
                <button className="moment-submit" onClick={handleMomentPublish}>Post</button>
              </div>
            </div>

            {moments.length === 0 ? (
              <div className="moment-empty">No moments yet</div>
            ) : (
              moments.map((post, idx) => {
                trackView(post.id);
                const isCurrentUserPost = post.authorId === currentUser?.id;
                return (
                  <div key={post.id} className="moment-card" style={{ animationDelay: `${idx * 0.06}s` }}>
                    <div className="card-header">
                      <div className="card-avatar">
                        <img src={isCurrentUserPost ? currentUserAvatar : post.avatar} alt="" className="avatar-img" />
                      </div>
                      <div className="card-author">
                        <div className="card-name">{isCurrentUserPost ? currentUserName : post.name}</div>
                        <div className="card-time">{post.time}</div>
                      </div>
                      <button className="card-menu" title="More">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                        </svg>
                      </button>
                    </div>
                    {post.text && <div className="card-text">{post.text}</div>}
                    {post.media && post.mediaType === 'image' && (
                      <div className="card-media-wrap">
                        <img src={post.media} alt="" className="card-media" />
                      </div>
                    )}
                    {post.media && post.mediaType === 'video' && (
                      <div className="card-media-wrap">
                        <video src={post.media} controls className="card-media" />
                      </div>
                    )}
                    <div className="card-actions">
                      <button className={`card-action-btn heart-btn${post.liked ? ' liked' : ''}`} onClick={() => toggleLike(post.id)}>
                        <span className={`heart-icon${post.liked ? ' liked' : ''}`}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill={post.liked ? '#f91880' : 'none'} stroke={post.liked ? '#f91880' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                          {animatingLikes.has(post.id) && (
                            <span className="heart-particles">
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                              <span className="heart-particle" />
                            </span>
                          )}
                        </span>
                        <span className="action-label">{post.likes}</span>
                      </button>
                      <button className={`card-action-btn comment-action-btn${showCommentInput[post.id] ? ' comment-active' : ''}`} onClick={() => toggleCommentInput(post.id)}>
                        <span className="action-svg">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="action-label">{post.comments.length}</span>
                      </button>
                      <span className="card-action-btn views-btn">
                        <span className="action-svg">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="2" y1="12" x2="2" y2="20" />
                            <line x1="8" y1="4" x2="8" y2="20" />
                            <line x1="14" y1="14" x2="14" y2="20" />
                            <line x1="20" y1="8" x2="20" y2="20" />
                          </svg>
                        </span>
                        <span className="action-label">{post.views}</span>
                      </span>
                      <button className="card-action-btn share-btn">
                        <span className="action-svg">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        </span>
                      </button>
                    </div>

                    {showCommentInput[post.id] && (
                      <div className="card-comments">
                        {post.comments.map(c => (
                          <div key={c.id} className="comment-item">
                            <span className="comment-author">{c.author}</span>
                            <span className="comment-text">{c.text}</span>
                          </div>
                        ))}
                        <div className="comment-input-row">
                          <div className="comment-emoji-wrap">
                            <button
                              className="comment-emoji-btn"
                              onClick={() => {
                                setCommentEmojiPost(p => p === post.id ? null : post.id);
                                setShowCommentInput(p => ({ ...p, [post.id]: true }));
                              }}
                              title="Add emoji"
                              aria-label="Add emoji to comment"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                              </svg>
                            </button>
                            {commentEmojiPost === post.id && (
                              <div className="emoji-picker comment-emoji-picker">
                                <div className="emoji-grid">
                                  {EMOJIS.map(e => (
                                    <button key={e} className="emoji-btn" onClick={() => pickCommentEmoji(post.id, e)}>{e}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <input className="comment-input" type="text"
                            placeholder="Write a comment..."
                            value={commentTexts[post.id] || ''}
                            onChange={e => setCommentTexts(p => ({ ...p, [post.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(post.id); }} />
                          <button
                            className="comment-submit"
                            disabled={!commentTexts[post.id]?.trim()}
                            onClick={() => handleCommentSubmit(post.id)}
                            title="Send comment"
                            aria-label="Send comment"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Chat;
