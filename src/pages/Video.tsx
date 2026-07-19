import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Expand,
  Heart,
  Home,
  Library,
  ListVideo,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Send,
  Settings2,
  Share2,
  Smile,
  Sparkles,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import HlsVideo from '@/components/HlsVideo';
import '@/styles/video.scss';

type VideoView = 'home' | 'library' | 'favorites' | 'playlist' | 'watch';

type VideoItem = {
  id: string;
  title: string;
  description: string;
  creator: string;
  avatar: string;
  views: string;
  duration: string;
  resolution: '4K' | '2K' | '1080p';
  category: string;
  poster: string;
  src: string;
};

type VideoCollection = {
  id: string;
  name: string;
  creator: string;
  avatar: string;
  poster: string;
  videoIds: string[];
  plays: string;
};

type VideoComment = {
  id: string;
  author: string;
  avatar: string;
  time: string;
  text: string;
  likes: number;
};

const VIDEO_SOURCES = {
  sintel: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
  bunny: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
  flower: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
};

const poster = (id: string) => (
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=88`
);

const avatar = (id: string) => (
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=160&q=88`
);

const VIDEOS: VideoItem[] = [
  {
    id: 'northbound',
    title: 'Northbound: Above the Quiet Valleys',
    description: 'A slow journey through glacial light, empty ridgelines, and the people who call the far north home.',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    views: '2.8M views',
    duration: '12:48',
    resolution: '4K',
    category: 'Travel',
    poster: poster('photo-1501785888041-af3ef285b470'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'paper-cities',
    title: 'Paper Cities',
    description: 'Architecture, memory, and the lines that shape a city after dark.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    views: '846K views',
    duration: '08:16',
    resolution: '2K',
    category: 'Design',
    poster: poster('photo-1480714378408-67cf0d13bc1b'),
    src: VIDEO_SOURCES.bunny,
  },
  {
    id: 'sea-of-clouds',
    title: 'A Sea of Clouds',
    description: 'One morning above the cloud line, captured in a single continuous ascent.',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    views: '1.4M views',
    duration: '06:24',
    resolution: '4K',
    category: 'Travel',
    poster: poster('photo-1519681393784-d120267933ba'),
    src: VIDEO_SOURCES.flower,
  },
  {
    id: 'teyvat-after-rain',
    title: 'Teyvat After Rain',
    description: 'A cinematic route through luminous forests and forgotten ruins.',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    views: '3.1M views',
    duration: '18:03',
    resolution: '4K',
    category: 'Genshin Impact',
    poster: poster('photo-1441974231531-c6227db76b6e'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'midnight-express',
    title: 'Midnight Express',
    description: 'A nocturnal portrait of railway workers and the cities they connect.',
    creator: 'Theo Miles',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    views: '592K views',
    duration: '10:52',
    resolution: '1080p',
    category: 'Movies',
    poster: poster('photo-1519608487953-e999c86e7455'),
    src: VIDEO_SOURCES.bunny,
  },
  {
    id: 'soft-focus',
    title: 'Soft Focus',
    description: 'A practical study of daylight, texture, and intimate portrait direction.',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    views: '320K views',
    duration: '07:31',
    resolution: '2K',
    category: 'Design',
    poster: poster('photo-1524504388940-b1c1722653e1'),
    src: VIDEO_SOURCES.flower,
  },
  {
    id: 'last-light',
    title: 'Last Light in Patagonia',
    description: 'Chasing the final warm light across wind-shaped peaks.',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    views: '1.9M views',
    duration: '14:09',
    resolution: '4K',
    category: 'Travel',
    poster: poster('photo-1464822759023-fed622ff2c3b'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'every-frame',
    title: 'Every Frame Has Weight',
    description: 'How framing and silence create tension before a single word is spoken.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    views: '714K views',
    duration: '09:44',
    resolution: '1080p',
    category: 'Movies',
    poster: poster('photo-1485846234645-a62644f84728'),
    src: VIDEO_SOURCES.bunny,
  },
  {
    id: 'alpine-water',
    title: 'Alpine Water',
    description: 'Following a mountain river from first thaw to the valley floor.',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    views: '968K views',
    duration: '11:20',
    resolution: '4K',
    category: 'Nature',
    poster: poster('photo-1433086966358-54859d0ed716'),
    src: VIDEO_SOURCES.flower,
  },
  {
    id: 'windrise',
    title: 'Windrise at Dawn',
    description: 'A peaceful exploration route with an original ambient score.',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    views: '2.2M views',
    duration: '21:18',
    resolution: '4K',
    category: 'Genshin Impact',
    poster: poster('photo-1500530855697-b586d89ba3ee'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'analog-rooms',
    title: 'Analog Rooms',
    description: 'Inside the studios keeping tape, valves, and patient listening alive.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    views: '438K views',
    duration: '13:37',
    resolution: '2K',
    category: 'Music',
    poster: poster('photo-1493225457124-a3eb161ffa5f'),
    src: VIDEO_SOURCES.bunny,
  },
  {
    id: 'coastal-lines',
    title: 'Coastal Lines',
    description: 'Five days tracing the quiet roads at the edge of the Atlantic.',
    creator: 'Theo Miles',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    views: '805K views',
    duration: '16:02',
    resolution: '4K',
    category: 'Travel',
    poster: poster('photo-1507525428034-b723cf961d3e'),
    src: VIDEO_SOURCES.flower,
  },
  {
    id: 'type-in-motion',
    title: 'Type in Motion',
    description: 'A compact masterclass in kinetic typography and restrained transitions.',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    views: '281K views',
    duration: '05:56',
    resolution: '1080p',
    category: 'Design',
    poster: poster('photo-1494438639946-1ebd1d20bf85'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'winter-cabin',
    title: 'The Winter Cabin',
    description: 'Three quiet days of snow, firewood, and cooking far from the road.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    views: '1.1M views',
    duration: '19:40',
    resolution: '4K',
    category: 'Nature',
    poster: poster('photo-1482192505345-5655af888cc4'),
    src: VIDEO_SOURCES.bunny,
  },
  {
    id: 'desert-signal',
    title: 'Desert Signal',
    description: 'A science-fiction short about a message buried beneath an empty horizon.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    views: '1.7M views',
    duration: '17:11',
    resolution: '2K',
    category: 'Movies',
    poster: poster('photo-1500534314209-a25ddb2bd429'),
    src: VIDEO_SOURCES.sintel,
  },
  {
    id: 'forest-frequency',
    title: 'Forest Frequency',
    description: 'Field recordings and minimal composition from deep inside a cedar forest.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    views: '366K views',
    duration: '22:05',
    resolution: '2K',
    category: 'Music',
    poster: poster('photo-1473448912268-2022ce9509d8'),
    src: VIDEO_SOURCES.flower,
  },
];

const COLLECTIONS: VideoCollection[] = [
  {
    id: 'cinema-room',
    name: 'Cinema Room',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    poster: VIDEOS[7].poster,
    videoIds: ['paper-cities', 'midnight-express', 'every-frame', 'desert-signal'],
    plays: '3.8M plays',
  },
  {
    id: 'wild-earth',
    name: 'Wild Earth',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    poster: VIDEOS[8].poster,
    videoIds: ['northbound', 'sea-of-clouds', 'alpine-water', 'winter-cabin'],
    plays: '6.2M plays',
  },
  {
    id: 'teyvat-journal',
    name: 'Teyvat Journal',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    poster: VIDEOS[3].poster,
    videoIds: ['teyvat-after-rain', 'windrise'],
    plays: '5.3M plays',
  },
  {
    id: 'visual-notes',
    name: 'Visual Notes',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    poster: VIDEOS[5].poster,
    videoIds: ['soft-focus', 'type-in-motion', 'paper-cities'],
    plays: '1.4M plays',
  },
  {
    id: 'slow-travel',
    name: 'Slow Travel',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    poster: VIDEOS[6].poster,
    videoIds: ['northbound', 'last-light', 'coastal-lines', 'sea-of-clouds'],
    plays: '7.1M plays',
  },
  {
    id: 'listening-room',
    name: 'Listening Room',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    poster: VIDEOS[10].poster,
    videoIds: ['analog-rooms', 'forest-frequency', 'winter-cabin'],
    plays: '2.2M plays',
  },
];

const CATEGORIES = ['All', 'Movies', 'Genshin Impact', 'Travel', 'Nature', 'Design', 'Music'];
const VALID_VIEWS = new Set<VideoView>(['home', 'library', 'favorites', 'playlist', 'watch']);
const VIDEO_COMMENTS: VideoComment[] = [
  {
    id: 'comment-1',
    author: 'Sora Kim',
    avatar: avatar('photo-1524504388940-b1c1722653e1'),
    time: '2 hours ago',
    text: 'The quiet pacing and the way the light changes across the valley are incredible.',
    likes: 248,
  },
  {
    id: 'comment-2',
    author: 'Milan Ortega',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    time: 'Yesterday',
    text: 'This deserves to be watched on the biggest screen available. Beautiful work.',
    likes: 96,
  },
  {
    id: 'comment-3',
    author: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    time: '3 days ago',
    text: 'That opening sequence is still one of my favorite transitions this year.',
    likes: 172,
  },
];

function CategoryNav({
  active,
  onChange,
}: {
  active: string;
  onChange: (category: string) => void;
}) {
  return (
    <div className="video-category-nav" role="tablist" aria-label="Video categories">
      {CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          role="tab"
          aria-selected={active === category}
          className={active === category ? 'is-active' : ''}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function VideoCard({
  video,
  favorite,
  onPlay,
  onFavorite,
}: {
  video: VideoItem;
  favorite: boolean;
  onPlay: (video: VideoItem) => void;
  onFavorite: (videoId: string) => void;
}) {
  return (
    <article className="video-tile">
      <button type="button" className="video-tile-hit" onClick={() => onPlay(video)}>
        <img src={video.poster} alt="" />
        <span className="video-quality">{video.resolution}</span>
        <span className="video-duration">
          <Clock3 size={12} aria-hidden="true" />
          {video.duration}
        </span>
        <span className="video-tile-play" aria-hidden="true">
          <Play size={22} fill="currentColor" />
        </span>
        <span className="video-tile-details">
          <img src={video.avatar} alt="" className="video-avatar" />
          <span className="video-tile-copy">
            <strong>{video.title}</strong>
            <small>{video.creator}</small>
            <span>
              <Eye size={13} aria-hidden="true" />
              {video.views}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className={`video-favorite${favorite ? ' is-active' : ''}`}
        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={favorite}
        onClick={() => onFavorite(video.id)}
      >
        <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function VideoWatchPage({
  video,
  playlist,
  favorite,
  onFavorite,
  onBack,
  onSelectVideo,
}: {
  video: VideoItem;
  playlist: VideoItem[];
  favorite: boolean;
  onFavorite: (videoId: string) => void;
  onBack: () => void;
  onSelectVideo: (video: VideoItem) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerHeight, setPlayerHeight] = useState<number>();
  const [comments, setComments] = useState<VideoComment[]>(VIDEO_COMMENTS);
  const [commentDraft, setCommentDraft] = useState('');
  const [likedComments, setLikedComments] = useState<Set<string>>(() => new Set());
  const [shared, setShared] = useState(false);

  useEffect(() => {
    setCommentDraft('');
    setComments(VIDEO_COMMENTS);
    setLikedComments(new Set());
  }, [video.id]);

  useEffect(() => {
    const player = stageRef.current;
    if (!player) return;

    const updatePlayerHeight = () => setPlayerHeight(player.getBoundingClientRect().height);
    const observer = new ResizeObserver(updatePlayerHeight);
    updatePlayerHeight();
    observer.observe(player);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!media) return;
    const syncMediaState = () => {
      setIsPlaying(!media.paused && !media.ended);
      setCurrentTime(media.currentTime);
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      setIsMuted(media.muted);
      setVolume(media.volume);
    };

    syncMediaState();
    media.addEventListener('loadedmetadata', syncMediaState);
    media.addEventListener('durationchange', syncMediaState);
    media.addEventListener('timeupdate', syncMediaState);
    media.addEventListener('play', syncMediaState);
    media.addEventListener('pause', syncMediaState);
    media.addEventListener('volumechange', syncMediaState);
    media.addEventListener('ended', syncMediaState);

    return () => {
      media.removeEventListener('loadedmetadata', syncMediaState);
      media.removeEventListener('durationchange', syncMediaState);
      media.removeEventListener('timeupdate', syncMediaState);
      media.removeEventListener('play', syncMediaState);
      media.removeEventListener('pause', syncMediaState);
      media.removeEventListener('volumechange', syncMediaState);
      media.removeEventListener('ended', syncMediaState);
    };
  }, [media]);

  const togglePlayback = () => {
    if (!media) return;
    if (media.paused) {
      void media.play();
      return;
    }
    media.pause();
  };

  const seek = (value: number) => {
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const toggleMute = () => {
    if (!media) return;
    if (media.muted) {
      media.muted = false;
      if (media.volume === 0) media.volume = volume || 0.6;
      return;
    }
    media.muted = true;
  };

  const changeVolume = (value: number) => {
    if (!media) return;
    const nextVolume = Math.min(1, Math.max(0, value));
    media.volume = nextVolume;
    media.muted = nextVolume === 0;
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void stageRef.current?.requestFullscreen();
  };

  const submitComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    setComments((current) => [{
      id: `comment-${Date.now()}`,
      author: 'You',
      avatar: video.avatar,
      time: 'Just now',
      text,
      likes: 0,
    }, ...current]);
    setCommentDraft('');
  };

  const toggleCommentLike = (commentId: string) => {
    setLikedComments((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const shareVideo = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
    } catch {
      // The UI still confirms the interaction when clipboard permission is unavailable.
    }
    setShared(true);
    window.setTimeout(() => setShared(false), 1800);
  };

  const playbackValue = duration > 0 ? Math.min(currentTime, duration) : 0;

  return (
    <div className="video-watch-page">
      <button type="button" className="video-watch-back" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to videos
      </button>

      <div className="video-watch-layout">
        <div className="video-watch-main">
          <div ref={stageRef} className="video-watch-player">
            <HlsVideo
              key={video.id}
              src={video.src}
              poster={video.poster}
              active
              autoPlay
              controls={false}
              onVideoElement={setMedia}
            />
            <div className="video-watch-controls">
              <input
                className="video-watch-timeline"
                type="range"
                min="0"
                max={Math.max(duration, 0)}
                step="0.1"
                value={playbackValue}
                aria-label="Video progress"
                onChange={(event) => seek(Number(event.target.value))}
                style={{ '--video-progress': `${duration ? (playbackValue / duration) * 100 : 0}%` } as React.CSSProperties}
              />
              <div className="video-watch-control-row">
                <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlayback}>
                  {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                </button>
                <span className="video-watch-time">
                  {formatPlaybackTime(currentTime)} <i>/</i> {formatPlaybackTime(duration)}
                </span>
                <span className="video-watch-control-spacer" />
                <span className="video-watch-quality" aria-label={`Video quality ${video.resolution}`}>
                  {video.resolution}
                </span>
                <div className="video-watch-volume">
                  <button type="button" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                    {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                  </button>
                  <input
                    className="video-watch-volume-range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    aria-label="Volume"
                    onChange={(event) => changeVolume(Number(event.target.value))}
                    style={{ '--video-volume': `${(isMuted ? 0 : volume) * 100}%` } as React.CSSProperties}
                  />
                </div>
                <button type="button" aria-label="Player settings" title="Player settings">
                  <Settings2 size={18} />
                </button>
                <button type="button" aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
                  <Expand size={19} />
                </button>
              </div>
            </div>
          </div>

          <section className="video-watch-details">
            <h1>{video.title}</h1>
            <div className="video-watch-meta">
              <div className="video-watch-author">
                <img src={video.avatar} alt="" />
                <span>
                  <strong>{video.creator}</strong>
                  <small>{video.views} · Published 3 days ago</small>
                </span>
              </div>
              <div className="video-watch-actions">
                <button type="button" className="is-like" aria-label="Like video">
                  <Heart size={18} />
                  <span>48.2K</span>
                </button>
                <button
                  type="button"
                  className={favorite ? 'is-saved' : ''}
                  aria-pressed={favorite}
                  onClick={() => onFavorite(video.id)}
                >
                  {favorite ? <Check size={18} /> : <Bookmark size={18} />}
                  <span>{favorite ? 'Saved' : 'Save'}</span>
                </button>
                <button type="button" onClick={shareVideo}>
                  <Share2 size={18} />
                  <span>{shared ? 'Copied' : 'Share'}</span>
                </button>
                <button type="button" className="video-watch-more" aria-label="More options">
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>
            <div className="video-watch-description">
              <div className="video-watch-tags">
                <span>{video.category}</span>
                <span>{video.resolution}</span>
                <span>Cinematic journey</span>
              </div>
              <p>{video.description} Filmed with a small crew over six weeks and finished in natural sound.</p>
            </div>
          </section>

          <section className="video-comments" aria-labelledby="video-comments-title">
            <div className="video-comments-heading">
              <div>
                <span>Conversation</span>
                <h2 id="video-comments-title">{comments.length} comments</h2>
              </div>
              <button type="button" aria-label="Comment settings">
                <Settings2 size={17} />
              </button>
            </div>
            <div className="video-comment-compose">
              <img src={video.avatar} alt="" />
              <div>
                <textarea
                  value={commentDraft}
                  placeholder="Add a thoughtful comment"
                  aria-label="Write a comment"
                  rows={2}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div className="video-comment-compose-actions">
                  <button type="button" aria-label="Add emoji" title="Add emoji">
                    <Smile size={18} />
                  </button>
                  <span />
                  <button type="button" className="video-comment-submit" disabled={!commentDraft.trim()} onClick={submitComment}>
                    <Send size={16} />
                    Post comment
                  </button>
                </div>
              </div>
            </div>
            <div className="video-comment-list">
              {comments.map((comment) => {
                const liked = likedComments.has(comment.id);
                return (
                  <article key={comment.id} className="video-comment">
                    <img src={comment.avatar} alt="" />
                    <div>
                      <header>
                        <strong>{comment.author}</strong>
                        <time>{comment.time}</time>
                      </header>
                      <p>{comment.text}</p>
                      <footer>
                        <button type="button" className={liked ? 'is-liked' : ''} onClick={() => toggleCommentLike(comment.id)}>
                          <ThumbsUp size={15} fill={liked ? 'currentColor' : 'none'} />
                          {comment.likes + (liked ? 1 : 0)}
                        </button>
                        <button type="button">
                          <MessageCircle size={15} />
                          Reply
                        </button>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside
          className="video-watch-queue"
          aria-label="Video playlist"
          style={playerHeight ? { height: playerHeight } : undefined}
        >
          <header>
            <div>
              <span>播放列表</span>
              <h2>接下来播放</h2>
            </div>
            <strong>{playlist.length} 个视频</strong>
          </header>
          <div className="video-watch-queue-list">
            {playlist.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={item.id === video.id ? 'is-current' : ''}
                aria-current={item.id === video.id ? 'true' : undefined}
                onClick={() => onSelectVideo(item)}
              >
                <span className="video-watch-queue-index">{index + 1}</span>
                <span className="video-watch-queue-poster">
                  <img src={item.poster} alt="" />
                  <small>{item.duration}</small>
                </span>
                <span className="video-watch-queue-copy">
                  <strong>{item.title}</strong>
                  <small>{item.creator}</small>
                  <em>{item.views}</em>
                </span>
                {item.id === video.id && <span className="video-watch-now">正在播放</span>}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Video() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view') as VideoView | null;
  const requestedVideoId = searchParams.get('video');
  const watchedVideo = useMemo(
    () => VIDEOS.find((video) => video.id === requestedVideoId) ?? null,
    [requestedVideoId],
  );
  const activeView = requestedView === 'watch' && !watchedVideo
    ? 'home'
    : requestedView && VALID_VIEWS.has(requestedView)
      ? requestedView
      : 'home';
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(['northbound', 'sea-of-clouds', 'teyvat-after-rain', 'analog-rooms']),
  );

  const selectedCollection = useMemo(() => (
    COLLECTIONS.find((collection) => collection.id === searchParams.get('collection'))
    ?? COLLECTIONS[0]
  ), [searchParams]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return VIDEOS.filter((video) => {
      const matchesCategory = activeCategory === 'All' || video.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || `${video.title} ${video.creator} ${video.description}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  const favoriteVideos = useMemo(() => {
    const collectionIds = new Set(selectedCollection.videoIds);
    return filteredVideos.filter((video) => collectionIds.has(video.id) || favoriteIds.has(video.id));
  }, [favoriteIds, filteredVideos, selectedCollection.videoIds]);

  const playlistPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const playlistPageCount = Math.max(1, Math.ceil(filteredVideos.length / 8));
  const safePlaylistPage = Math.min(playlistPage, playlistPageCount);
  const playlistVideos = filteredVideos.slice((safePlaylistPage - 1) * 8, safePlaylistPage * 8);
  const homeVideos = filteredVideos.slice(0, 4);
  const featuredVideo = filteredVideos[0] ?? VIDEOS[0];
  const watchPlaylist = useMemo(() => {
    if (!watchedVideo) return VIDEOS.slice(0, 6);
    const queue = [watchedVideo, ...VIDEOS.filter((video) => video.id !== watchedVideo.id)];
    return queue.slice(0, 6);
  }, [watchedVideo]);

  useEffect(() => {
    if (!activeVideo) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveVideo(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeVideo]);

  const navigateTo = (view: Exclude<VideoView, 'favorites' | 'watch'>) => {
    const next = new URLSearchParams();
    if (view !== 'home') next.set('view', view);
    setSearchParams(next);
    setActiveCategory('All');
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openVideo = (video: VideoItem) => {
    const next = new URLSearchParams();
    next.set('view', 'watch');
    next.set('video', video.id);
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCollection = (collection: VideoCollection) => {
    const next = new URLSearchParams();
    next.set('view', 'favorites');
    next.set('collection', collection.id);
    setSearchParams(next);
    setActiveCategory('All');
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeCategory = (category: string) => {
    setActiveCategory(category);
    if (activeView === 'playlist') {
      const next = new URLSearchParams(searchParams);
      next.delete('page');
      setSearchParams(next);
    }
  };

  const changePlaylistPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFavorite = (videoId: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  return (
    <main className="video-page">
      {activeView === 'watch' && watchedVideo && (
        <VideoWatchPage
          video={watchedVideo}
          playlist={watchPlaylist}
          favorite={favoriteIds.has(watchedVideo.id)}
          onFavorite={toggleFavorite}
          onBack={() => navigateTo('home')}
          onSelectVideo={openVideo}
        />
      )}

      {activeView !== 'watch' && (
        <>
      <div className="video-page-shell">
        <header className="video-page-header">
          <div>
            <span className="video-page-kicker">
              <Sparkles size={14} aria-hidden="true" />
              Curated motion
            </span>
            <h1>
              {activeView === 'home' && 'Watch beautifully.'}
              {activeView === 'library' && 'Your library'}
              {activeView === 'favorites' && selectedCollection.name}
              {activeView === 'playlist' && 'Video library'}
            </h1>
          </div>
          <label className="video-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search videos"
              aria-label="Search videos"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>

        {activeView !== 'library' && (
          <CategoryNav active={activeCategory} onChange={changeCategory} />
        )}

        {activeView === 'home' && (
          <>
            <section className="video-featured" aria-label="Featured video">
              <button
                type="button"
                className="video-featured-media"
                onClick={() => openVideo(featuredVideo)}
              >
                <img src={featuredVideo.poster} alt="" />
                <span className="video-quality">{featuredVideo.resolution}</span>
                <span className="video-featured-play" aria-hidden="true">
                  <Play size={28} fill="currentColor" />
                </span>
              </button>
              <div className="video-featured-copy">
                <span className="video-featured-label">Featured film</span>
                <h2>{featuredVideo.title}</h2>
                <p>{featuredVideo.description}</p>
                <div className="video-featured-author">
                  <img src={featuredVideo.avatar} alt="" />
                  <div>
                    <strong>{featuredVideo.creator}</strong>
                    <span>
                      {featuredVideo.views}
                      <i />
                      {featuredVideo.duration}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="video-watch-button"
                  onClick={() => openVideo(featuredVideo)}
                >
                  <Play size={17} fill="currentColor" />
                  Watch now
                </button>
              </div>
            </section>

            <section className="video-section">
              <div className="video-section-heading">
                <div>
                  <span>Fresh selection</span>
                  <h2>Made for your screen</h2>
                </div>
                <button type="button" onClick={() => navigateTo('playlist')}>
                  View all
                  <ChevronRight size={17} />
                </button>
              </div>
              {homeVideos.length ? (
                <div className="video-home-grid">
                  {homeVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      favorite={favoriteIds.has(video.id)}
                      onPlay={openVideo}
                      onFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              ) : (
                <div className="video-empty">No videos match this category.</div>
              )}
            </section>
          </>
        )}

        {activeView === 'library' && (
          <section className="video-section video-library-section">
            <div className="video-section-heading">
              <div>
                <span>Saved by you</span>
                <h2>Favorite collections</h2>
              </div>
              <small>{COLLECTIONS.length} collections</small>
            </div>
            <div className="video-library-grid">
              {COLLECTIONS.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  className="video-collection-card"
                  onClick={() => openCollection(collection)}
                  style={{ '--collection-art': `url(${collection.poster})` } as React.CSSProperties}
                >
                  <span className="video-collection-shine" aria-hidden="true" />
                  <img src={collection.avatar} alt="" />
                  <span className="video-collection-copy">
                    <small>Favorites folder</small>
                    <strong>{collection.name}</strong>
                    <span>{collection.creator}</span>
                    <em>
                      {collection.videoIds.length} videos
                      <i />
                      {collection.plays}
                    </em>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        {activeView === 'favorites' && (
          <section className="video-section video-favorites-section">
            <div className="video-collection-toolbar">
              <button
                type="button"
                className="video-icon-button"
                aria-label="Back to library"
                title="Back to library"
                onClick={() => navigateTo('library')}
              >
                <ArrowLeft size={19} />
              </button>
              <div>
                <img src={selectedCollection.avatar} alt="" />
                <span>
                  <strong>{selectedCollection.creator}</strong>
                  <small>{selectedCollection.plays}</small>
                </span>
              </div>
            </div>
            {favoriteVideos.length ? (
              <div className="video-playlist-grid">
                {favoriteVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    favorite={favoriteIds.has(video.id)}
                    onPlay={openVideo}
                    onFavorite={toggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="video-empty">No saved videos match this category.</div>
            )}
          </section>
        )}

        {activeView === 'playlist' && (
          <section className="video-section video-playlist-section">
            <div className="video-section-heading">
              <div>
                <span>Complete collection</span>
                <h2>{filteredVideos.length} videos</h2>
              </div>
              <small>Page {safePlaylistPage} of {playlistPageCount}</small>
            </div>
            {playlistVideos.length ? (
              <div className="video-playlist-grid">
                {playlistVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    favorite={favoriteIds.has(video.id)}
                    onPlay={openVideo}
                    onFavorite={toggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="video-empty">No videos match your search.</div>
            )}
            {playlistPageCount > 1 && (
              <nav className="video-pagination" aria-label="Video playlist pages">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePlaylistPage === 1}
                  onClick={() => changePlaylistPage(safePlaylistPage - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                {Array.from({ length: playlistPageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    type="button"
                    key={page}
                    className={safePlaylistPage === page ? 'is-active' : ''}
                    aria-current={safePlaylistPage === page ? 'page' : undefined}
                    onClick={() => changePlaylistPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePlaylistPage === playlistPageCount}
                  onClick={() => changePlaylistPage(safePlaylistPage + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </nav>
            )}
          </section>
        )}
      </div>

      <nav className="video-dock" aria-label="Video navigation">
        {([
          { view: 'home' as const, label: 'Home', icon: Home },
          { view: 'library' as const, label: 'Library', icon: Library },
          { view: 'playlist' as const, label: 'Playlist', icon: ListVideo },
        ]).map(({ view, label, icon: Icon }) => (
          <button
            type="button"
            key={view}
            className={activeView === view || (view === 'library' && activeView === 'favorites')
              ? 'is-active'
              : ''}
            aria-current={activeView === view ? 'page' : undefined}
            onClick={() => navigateTo(view)}
          >
            <Icon size={17} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeVideo && createPortal(
        <div className="video-player-backdrop" role="dialog" aria-modal="true" aria-label={activeVideo.title}>
          <button
            type="button"
            className="video-player-close"
            aria-label="Close video player"
            title="Close"
            onClick={() => setActiveVideo(null)}
          >
            <X size={20} />
          </button>
          <div className="video-player-shell">
            <div className="video-player-stage">
              <HlsVideo
                key={activeVideo.id}
                src={activeVideo.src}
                poster={activeVideo.poster}
                active
                autoPlay
              />
            </div>
            <div className="video-player-info">
              <div>
                <span>{activeVideo.category} · {activeVideo.resolution}</span>
                <h2>{activeVideo.title}</h2>
              </div>
              <div className="video-player-creator">
                <img src={activeVideo.avatar} alt="" />
                <span>
                  <strong>{activeVideo.creator}</strong>
                  <small>{activeVideo.views}</small>
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
        </>
      )}
    </main>
  );
}

export default Video;
