import { useState, useRef, useEffect } from 'react';
import '@/styles/chat.scss';

/* ── Types ── */
interface Contact {
  id: number;
  name: string;
  type: 'group' | 'user';
  avatar: string;
  lastMsg: string;
  time: string;
  online?: boolean;
}

interface Message {
  id: number;
  text: string;
  from: 'me' | 'them';
  time: string;
}

interface Comment {
  id: number;
  author: string;
  text: string;
}

interface MomentPost {
  id: number;
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

function landscapeAvatar(seed: number) {
  return `https://picsum.photos/seed/${seed}/100/100`;
}

/* ── Mock Data ── */
const contacts: Contact[] = [
  { id: 1, name: 'Project Team', type: 'group', avatar: landscapeAvatar(101), lastMsg: 'See you tomorrow', time: '11:30' },
  { id: 2, name: 'Alice', type: 'user', avatar: landscapeAvatar(202), lastMsg: 'Got it', time: '10:15', online: true },
  { id: 3, name: 'Bob', type: 'user', avatar: landscapeAvatar(303), lastMsg: 'I fixed the code last night', time: 'Yesterday', online: false },
  { id: 4, name: 'Catherine', type: 'user', avatar: landscapeAvatar(404), lastMsg: 'Photo', time: 'Yesterday', online: true },
  { id: 5, name: 'David', type: 'user', avatar: landscapeAvatar(505), lastMsg: 'Sure', time: 'Monday', online: false },
];

const mockMessages: Record<number, Message[]> = {
  1: [
    { id: 1, text: 'Hey everyone, meeting tomorrow', from: 'them', time: '11:00' },
    { id: 2, text: 'Got it', from: 'me', time: '11:05' },
    { id: 3, text: 'See you tomorrow', from: 'them', time: '11:30' },
  ],
  2: [
    { id: 1, text: 'Hello!', from: 'them', time: '10:00' },
    { id: 2, text: 'Hi, what\'s up?', from: 'me', time: '10:05' },
    { id: 3, text: 'I sent you the files', from: 'them', time: '10:10' },
    { id: 4, text: 'Got it, thanks!', from: 'me', time: '10:15' },
  ],
  3: [
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
  const [activeTab, setActiveTab] = useState<'chat' | 'moments'>(() => {
    return (localStorage.getItem('chat_tab') as 'chat' | 'moments') || 'chat';
  });
  const [activeContact, setActiveContact] = useState(1);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Record<number, Message[]>>(mockMessages);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMomentEmoji, setShowMomentEmoji] = useState(false);
  const [moments, setMoments] = useState<MomentPost[]>(initialMoments);
  const [momentText, setMomentText] = useState('');
  const [momentMedia, setMomentMedia] = useState<string | null>(null);
  const [momentMediaType, setMomentMediaType] = useState<'image' | 'video' | null>(null);
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<Record<number, boolean>>({});
  const [viewedPosts] = useState(new Set<number>());
  const [animatingLikes, setAnimatingLikes] = useState<Set<number>>(new Set());
  const [activeIndicatorTop, setActiveIndicatorTop] = useState(0);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const contactsPanelRef = useRef<HTMLElement>(null);
  const activeContactInfo = contacts.find(c => c.id === activeContact) || contacts[0];
  const momentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeContact]);

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
  }, [activeContact]);

  /* ── Chat ── */
  function handleSend() {
    if (!inputText.trim()) return;
    const newMsg: Message = {
      id: Date.now(),
      text: inputText.trim(),
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => ({ ...p, [activeContact]: [...(p[activeContact] || []), newMsg] }));
    setInputText('');
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
    if (!f) return;
    const newMsg: Message = {
      id: Date.now(),
      text: `📎 ${f.name}`,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => ({ ...p, [activeContact]: [...(p[activeContact] || []), newMsg] }));
    e.target.value = '';
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const newMsg: Message = {
      id: Date.now(),
      text: `📷 ${f.name}`,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(p => ({ ...p, [activeContact]: [...(p[activeContact] || []), newMsg] }));
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
      name: 'You',
      avatar: landscapeAvatar(0),
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
      m.id === postId ? { ...m, comments: [...m.comments, { id: Date.now(), author: 'You', text }] } : m
    ));
    setCommentTexts(p => ({ ...p, [postId]: '' }));
    setShowCommentInput(p => ({ ...p, [postId]: false }));
  }

  function toggleCommentInput(postId: number) {
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
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
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
              {contacts.filter(c => c.type === 'group').map(c => (
                <div key={c.id} className={`contact-item${activeContact === c.id ? ' active' : ''}`} onClick={() => setActiveContact(c.id)}>
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
              {contacts.filter(c => c.type === 'user').map(c => (
                <div key={c.id} className={`contact-item${activeContact === c.id ? ' active' : ''}`} onClick={() => setActiveContact(c.id)}>
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
            </aside>

            <div className="panel-divider" />

            <main className="messages-panel">
              <div className="messages-header">
                <div className="messages-header-avatar">
                  <img src={activeContactInfo.avatar} alt="" className="avatar-img" />
                </div>
                <div className="messages-header-info">
                  <div className="messages-header-name">{activeContactInfo.name}</div>
                  <div className="messages-header-status">Active now</div>
                </div>
              </div>
              <div className="msg-list">
                {(messages[activeContact] || []).length === 0 ? (
                  <div className="msg-empty">No messages yet</div>
                ) : (
                  (messages[activeContact] || []).map(msg => (
                    <div key={msg.id} className={`msg-wrap ${msg.from === 'me' ? 'sent' : 'received'}`}>
                      <div className="msg-sender">
                        <div className="msg-avatar">
                          <img
                            src={msg.from === 'me' ? landscapeAvatar(0) : activeContactInfo.avatar}
                            alt=""
                            className="avatar-img"
                          />
                        </div>
                      </div>
                      <div className="msg-content">
                        <div className={`msg ${msg.from === 'me' ? 'sent' : 'received'}`}>
                          <div className="msg-text">{msg.text}</div>
                        </div>
                        <div className="msg-time">{msg.time}</div>
                      </div>
                    </div>
                  ))
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
                  <img src={landscapeAvatar(0)} alt="" className="avatar-img" />
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
                return (
                  <div key={post.id} className="moment-card" style={{ animationDelay: `${idx * 0.06}s` }}>
                    <div className="card-header">
                      <div className="card-avatar">
                        <img src={post.avatar} alt="" className="avatar-img" />
                      </div>
                      <div className="card-author">
                        <div className="card-name">{post.name}</div>
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
                      <button className="card-action-btn" onClick={() => toggleCommentInput(post.id)}>
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

                    {/* Comments visible by default + input below */}
                    <div className="card-comments">
                      {post.comments.map(c => (
                        <div key={c.id} className="comment-item">
                          <span className="comment-author">{c.author}</span>
                          <span className="comment-text">{c.text}</span>
                        </div>
                      ))}
                      <div className="comment-input-row">
                        <input className="comment-input" type="text"
                          placeholder={showCommentInput[post.id] ? "Write a comment..." : ""}
                          value={commentTexts[post.id] || ''}
                          onChange={e => setCommentTexts(p => ({ ...p, [post.id]: e.target.value }))}
                          onFocus={() => setShowCommentInput(p => ({ ...p, [post.id]: true }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(post.id); }} />
                        {showCommentInput[post.id] && commentTexts[post.id]?.trim() && (
                          <button className="comment-submit" onClick={() => handleCommentSubmit(post.id)} title="Send comment" aria-label="Send comment">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
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
