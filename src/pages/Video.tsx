import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Clock3,
  Expand,
  Heart,
  Home,
  ImagePlus,
  Library,
  ListVideo,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Send,
  Settings2,
  Smile,
  Star,
  ThumbsUp,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import HlsVideo from '@/components/HlsVideo';
import { defaultAvatarDataUrl, resolveAvatarUrl } from '@/lib/avatar';
import type { RootState } from '@/store/store';
import '@/styles/video.scss';

type VideoView = 'home' | 'library' | 'favorites' | 'playlist' | 'watch';
type VideoUploadStep = 'upload' | 'publish';
type VideoVisibility = 'public' | 'private';

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
  replies?: VideoComment[];
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
const VIDEO_COMMENT_EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣',
  '😊','😇','🙂','😉','😍','😘','😋','😎',
  '🤩','🥳','🤔','🤗','🤓','😏','😒','😞',
  '👍','👌','👏','🙌','💪','🙏','👋','🎉',
  '✨','🔥','🚀','❤️','🌍','🎮','🥇','🏅',
  '🌩️','🌨️','🌧️','🌦️','🌥️','🌤️','⛈️','⛅',
  '🍉','🥬','🍇',
];
const VALID_VIEWS = new Set<VideoView>(['home', 'library', 'favorites', 'playlist', 'watch']);
const DEFAULT_UPLOAD_POSTER = VIDEOS[0].poster;
const VIDEO_UPLOAD_DRAFT_KEY = 'lume-video-upload-draft';
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
  className = '',
}: {
  active: string;
  onChange: (category: string) => void;
  className?: string;
}) {
  return (
    <div className={`video-category-nav${className ? ` ${className}` : ''}`} role="tablist" aria-label="Video categories">
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
  variant = '',
}: {
  video: VideoItem;
  favorite: boolean;
  onPlay: (video: VideoItem) => void;
  onFavorite: (videoId: string) => void;
  variant?: string;
}) {
  const playlistLikes = `${Math.max(1, Math.round(Number.parseFloat(video.views) * 0.08))}K`;

  return (
    <article className={`video-tile${variant ? ` is-${variant}` : ''}`}>
      <button type="button" className="video-tile-hit" onClick={() => onPlay(video)}>
        <img src={video.poster} alt="" />
        <span className="video-quality">{video.resolution}</span>
        <span className="video-category-tag">{video.category}</span>
        {variant !== 'playlist' && (
          <span className="video-duration">
            <Clock3 size={12} aria-hidden="true" />
            {video.duration}
          </span>
        )}
        <span className="video-tile-play" aria-hidden="true">
          <Play size={22} fill="currentColor" />
        </span>
        <span className="video-tile-details">
          {variant !== 'playlist' && <img src={video.avatar} alt="" className="video-avatar" />}
          <span className="video-tile-copy">
            <strong>{video.title}</strong>
            <small>{video.creator}</small>
            <span className="video-tile-meta">
              {variant === 'playlist' && (
                <span>
                  <ThumbsUp size={13} aria-hidden="true" />
                  {playlistLikes}
                </span>
              )}
              <span>
                <BarChart3 size={13} aria-hidden="true" />
                {video.views}
              </span>
              {variant === 'playlist' && (
                <span className="video-tile-inline-duration">
                  <Clock3 size={13} aria-hidden="true" />
                  {video.duration}
                </span>
              )}
            </span>
          </span>
        </span>
      </button>
      {variant !== 'playlist' && (
        <button
          type="button"
          className={`video-favorite${favorite ? ' is-active' : ''}`}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
          onClick={() => onFavorite(video.id)}
        >
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      )}
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
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const controlsHideTimerRef = useRef<number | undefined>(undefined);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerHeight, setPlayerHeight] = useState<number>();
  const [comments, setComments] = useState<VideoComment[]>(VIDEO_COMMENTS);
  const [commentDraft, setCommentDraft] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; author: string } | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(() => new Set());
  const [likedVideo, setLikedVideo] = useState(false);

  useEffect(() => {
    setCommentDraft('');
    setIsEmojiPickerOpen(false);
    setReplyTarget(null);
    setComments(VIDEO_COMMENTS);
    setLikedComments(new Set());
    setLikedVideo(false);
    setAreControlsVisible(false);
  }, [video.id]);

  useEffect(() => () => {
    if (controlsHideTimerRef.current !== undefined) {
      window.clearTimeout(controlsHideTimerRef.current);
    }
  }, []);

  const showPlayerControls = () => {
    setAreControlsVisible(true);
    if (controlsHideTimerRef.current !== undefined) {
      window.clearTimeout(controlsHideTimerRef.current);
    }
    controlsHideTimerRef.current = window.setTimeout(() => {
      setAreControlsVisible(false);
      controlsHideTimerRef.current = undefined;
    }, 5_000);
  };

  const hidePlayerControls = () => {
    if (controlsHideTimerRef.current !== undefined) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = undefined;
    }
    setAreControlsVisible(false);
  };

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
    const nextComment: VideoComment = {
      id: `comment-${Date.now()}`,
      author: 'You',
      avatar: video.avatar,
      time: 'Just now',
      text,
      likes: 0,
    };
    setComments((current) => {
      if (!replyTarget) return [nextComment, ...current];
      return current.map((comment) => (
        comment.id === replyTarget.commentId
          ? { ...comment, replies: [...(comment.replies ?? []), nextComment] }
          : comment
      ));
    });
    setCommentDraft('');
    setIsEmojiPickerOpen(false);
    setReplyTarget(null);
  };

  const toggleCommentLike = (commentId: string) => {
    setLikedComments((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const replyToComment = (commentId: string, author: string) => {
    const mention = `@${author} `;
    setReplyTarget({ commentId, author });
    setCommentDraft(mention);
    setIsEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      const input = commentInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(mention.length, mention.length);
    });
  };

  const playbackValue = duration > 0 ? Math.min(currentTime, duration) : 0;

  return (
    <div className="video-watch-page">
      <button type="button" className="video-watch-back" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>

      <div className="video-watch-layout">
        <div className="video-watch-main">
          <div
            ref={stageRef}
            className={`video-watch-player${areControlsVisible ? ' is-controls-visible' : ''}`}
            onMouseEnter={showPlayerControls}
            onMouseMove={showPlayerControls}
            onMouseLeave={hidePlayerControls}
          >
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
                <button
                  type="button"
                  className={`is-like${likedVideo ? ' is-liked' : ''}`}
                  aria-label={likedVideo ? 'Unlike video' : 'Like video'}
                  title={likedVideo ? 'Unlike video' : 'Like video'}
                  aria-pressed={likedVideo}
                  onClick={() => setLikedVideo((current) => !current)}
                >
                  <ThumbsUp size={18} fill={likedVideo ? 'currentColor' : 'none'} />
                  <span>48.2K</span>
                </button>
                <button
                  type="button"
                  className={favorite ? 'is-saved' : ''}
                  aria-pressed={favorite}
                  aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
                  title={favorite ? 'Remove from favorites' : 'Add to favorites'}
                  onClick={() => onFavorite(video.id)}
                >
                  <Star size={18} fill={favorite ? 'currentColor' : 'none'} />
                  <span>12.8K</span>
                </button>
                <button type="button" className="video-watch-more" aria-label="More options" title="More options">
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>
          </section>

          <section className="video-comments" aria-labelledby="video-comments-title">
            <div className="video-comments-heading">
              <div>
                <h2 id="video-comments-title">{comments.length} comments</h2>
              </div>
              <button type="button" aria-label="Comment settings">
                <Settings2 size={17} />
              </button>
            </div>
            <div className="video-comment-compose">
              <img src={video.avatar} alt="" />
              <div>
                {replyTarget && (
                  <div className="video-comment-replying">
                    <span>Replying to <strong>@{replyTarget.author}</strong></span>
                    <button
                      type="button"
                      aria-label="Cancel reply"
                      title="Cancel reply"
                      onClick={() => {
                        setReplyTarget(null);
                        setCommentDraft('');
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={commentInputRef}
                  value={commentDraft}
                  placeholder="Add a thoughtful comment"
                  aria-label="Write a comment"
                  rows={2}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div className="video-comment-compose-actions">
                  <button
                    type="button"
                    className={isEmojiPickerOpen ? 'is-active' : ''}
                    aria-label="Add emoji"
                    title="Add emoji"
                    aria-expanded={isEmojiPickerOpen}
                    onClick={() => setIsEmojiPickerOpen((current) => !current)}
                  >
                    <Smile size={18} />
                  </button>
                  {isEmojiPickerOpen && (
                    <div className="video-comment-emoji-picker" aria-label="Choose an emoji">
                      {VIDEO_COMMENT_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Add ${emoji}`}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setCommentDraft((current) => `${current}${emoji}`);
                            setIsEmojiPickerOpen(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <span />
                  <button type="button" className="video-comment-submit" disabled={!commentDraft.trim()} onClick={submitComment}>
                    Post comment
                    <Send size={16} />
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
                        <button type="button" onClick={() => replyToComment(comment.id, comment.author)}>
                          <MessageCircle size={15} />
                          Reply
                        </button>
                      </footer>
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="video-comment-replies">
                          {comment.replies.map((reply) => {
                            const replyLiked = likedComments.has(reply.id);
                            return (
                              <article key={reply.id} className="video-comment-reply">
                                <img src={reply.avatar} alt="" />
                                <div>
                                  <header>
                                    <strong>{reply.author}</strong>
                                    <time>{reply.time}</time>
                                  </header>
                                  <p>{reply.text}</p>
                                  <footer>
                                    <button
                                      type="button"
                                      className={replyLiked ? 'is-liked' : ''}
                                      onClick={() => toggleCommentLike(reply.id)}
                                    >
                                      <ThumbsUp size={14} fill={replyLiked ? 'currentColor' : 'none'} />
                                      {reply.likes + (replyLiked ? 1 : 0)}
                                    </button>
                                    <button type="button" onClick={() => replyToComment(comment.id, reply.author)}>
                                      <MessageCircle size={14} />
                                      Reply
                                    </button>
                                  </footer>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
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

function getUploadTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled video';
}

function formatUploadedDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '00:00';
  return formatPlaybackTime(value);
}

function VideoUploadDialog({
  step,
  progress,
  videoFile,
  coverPreview,
  title,
  tags,
  visibility,
  duration,
  error,
  isPublishing,
  videoInputRef,
  coverInputRef,
  onClose,
  onSelectVideo,
  onSelectCover,
  onTitleChange,
  onTagsChange,
  onVisibilityChange,
  onPublish,
}: {
  step: VideoUploadStep;
  progress: number;
  videoFile: File | null;
  coverPreview: string;
  title: string;
  tags: string;
  visibility: VideoVisibility;
  duration: string;
  error: string;
  isPublishing: boolean;
  videoInputRef: React.RefObject<HTMLInputElement | null>;
  coverInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSelectVideo: (file: File | null) => void;
  onSelectCover: (file: File | null) => void;
  onTitleChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onVisibilityChange: (visibility: VideoVisibility) => void;
  onPublish: () => void;
}) {
  const readyToPublish = Boolean(title.trim() && videoFile && progress === 100);

  return createPortal(
    <div className="video-upload-overlay" role="presentation">
      <button
        type="button"
        className="video-upload-backdrop"
        aria-label="Close upload dialog"
        disabled={isPublishing}
        onClick={onClose}
      />
      <section
        className={`video-upload-dialog is-${step}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-upload-title"
      >
        <button
          type="button"
          className="video-upload-close"
          aria-label="Close upload dialog"
          disabled={isPublishing}
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {step === 'publish' && (
          <div className="video-upload-progress">
            <div className="video-upload-progress-copy">
              <span>{progress < 100 ? 'Uploading video' : 'Upload complete'}</span>
              <strong>{progress}%</strong>
            </div>
            <span className="video-upload-progress-track" aria-hidden="true">
              <i style={{ width: `${progress}%` }} />
            </span>
            {progress === 100 && (
              <p className="video-upload-processing-complete">
                视频已处理完成，请点击上传
              </p>
            )}
          </div>
        )}

        {step === 'upload' ? (
          <div className="video-upload-select-step">
            <span className="video-upload-mark" aria-hidden="true">
              <Upload size={24} />
            </span>
            <p className="video-upload-eyebrow">New video</p>
            <h2 id="video-upload-title">Upload a video</h2>
            <p className="video-upload-description">
              Choose a video file to prepare it for publishing.
            </p>
            <input
              ref={videoInputRef}
              className="video-upload-file-input"
              type="file"
              accept="video/*"
              onChange={(event) => onSelectVideo(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="video-upload-dropzone"
              disabled={progress > 0 && progress < 100}
              onClick={() => videoInputRef.current?.click()}
            >
              <Upload size={22} />
              <span>
                <strong>{videoFile?.name || 'Select a video file'}</strong>
                <small>{videoFile ? 'Preparing your upload' : 'MP4, WebM, MOV and other video formats'}</small>
              </span>
            </button>
            {error && <p className="video-upload-error" role="alert">{error}</p>}
          </div>
        ) : (
          <div className="video-upload-publish-step">
            <div className="video-upload-summary">
              <span>
                <small>Video</small>
                <strong>{videoFile?.name}</strong>
              </span>
              <span>
                <small>Duration</small>
                <strong>{duration}</strong>
              </span>
              <span className="video-upload-visibility-field">
                <small>Visibility</small>
                <div className={`video-upload-visibility is-${visibility}`} aria-label="Video visibility">
                  {(['public', 'private'] as VideoVisibility[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={visibility === option ? 'is-active' : ''}
                      aria-pressed={visibility === option}
                      onClick={() => onVisibilityChange(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </span>
            </div>

            <div className="video-upload-heading">
              <span className={`video-upload-complete-icon${progress < 100 ? ' is-uploading' : ''}`} aria-hidden="true">
                {progress < 100 ? <Upload size={20} /> : <CheckCircle2 size={20} />}
              </span>
              <div>
                <p className="video-upload-eyebrow">{progress < 100 ? 'Uploading video' : 'Ready to publish'}</p>
                <h2 id="video-upload-title">Video details</h2>
              </div>
            </div>

            <div className="video-upload-form">
              <div
                className={`video-upload-cover-field${coverPreview ? ' has-preview' : ' is-empty'}`}
                role="button"
                tabIndex={0}
                aria-label={coverPreview ? 'Change video cover' : 'Choose video cover'}
                onClick={() => coverInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    coverInputRef.current?.click();
                  }
                }}
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="Selected video cover" />
                ) : (
                  <span className="video-upload-cover-empty">
                    <ImagePlus size={28} aria-hidden="true" />
                    <strong>Choose a cover</strong>
                    <small>Select an image for your video</small>
                  </span>
                )}
                <input
                  ref={coverInputRef}
                  className="video-upload-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => onSelectCover(event.target.files?.[0] ?? null)}
                />
              </div>

              <div className="video-upload-fields">
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    value={title}
                    maxLength={120}
                    placeholder="Give your video a title"
                    onChange={(event) => onTitleChange(event.target.value)}
                  />
                </label>
                <label>
                  <span>Category tags</span>
                  <input
                    type="text"
                    value={tags}
                    placeholder="#Travel #Nature"
                    onChange={(event) => onTagsChange(event.target.value)}
                  />
                  <small>Use # before each category. Separate tags with spaces.</small>
                </label>
              </div>
            </div>

            {error && <p className="video-upload-error" role="alert">{error}</p>}
            <button
              type="button"
              className="video-upload-publish"
              disabled={!readyToPublish || isPublishing}
              onClick={onPublish}
            >
              <Upload size={18} />
              {isPublishing ? 'Publishing...' : 'Publish video'}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function Video() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [videos, setVideos] = useState<VideoItem[]>(VIDEOS);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<VideoUploadStep>('upload');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadVideoFile, setUploadVideoFile] = useState<File | null>(null);
  const [uploadVideoSrc, setUploadVideoSrc] = useState('');
  const [uploadCoverPreview, setUploadCoverPreview] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadDuration, setUploadDuration] = useState('00:00');
  const [uploadResolution, setUploadResolution] = useState<VideoItem['resolution']>('1080p');
  const [uploadVisibility, setUploadVisibility] = useState<VideoVisibility>('public');
  const [uploadError, setUploadError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const uploadDraftHydratedRef = useRef(false);
  const uploadTimerRef = useRef<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const requestedView = searchParams.get('view') as VideoView | null;
  const requestedVideoId = searchParams.get('video');
  const watchedVideo = useMemo(
    () => videos.find((video) => video.id === requestedVideoId) ?? null,
    [requestedVideoId, videos],
  );
  const activeView = requestedView === 'watch' && !watchedVideo
    ? 'home'
    : requestedView && VALID_VIEWS.has(requestedView)
      ? requestedView
      : 'home';
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [homeVisibleCount, setHomeVisibleCount] = useState(20);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(['northbound', 'sea-of-clouds', 'teyvat-after-rain', 'analog-rooms']),
  );

  const selectedCollection = useMemo(() => (
    COLLECTIONS.find((collection) => collection.id === searchParams.get('collection'))
    ?? COLLECTIONS[0]
  ), [searchParams]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return videos.filter((video) => {
      const matchesCategory = activeCategory === 'All' || video.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || `${video.title} ${video.creator} ${video.description}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query, videos]);

  const filteredCollections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return COLLECTIONS;
    return COLLECTIONS.filter((collection) => (
      collection.name.toLowerCase().includes(normalizedQuery)
    ));
  }, [query]);

  const favoriteVideos = useMemo(() => {
    const collectionIds = new Set(selectedCollection.videoIds);
    return filteredVideos.filter((video) => collectionIds.has(video.id) || favoriteIds.has(video.id));
  }, [favoriteIds, filteredVideos, selectedCollection.videoIds]);

  const playlistPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const playlistPageCount = Math.max(1, Math.ceil(filteredVideos.length / 8));
  const safePlaylistPage = Math.min(playlistPage, playlistPageCount);
  const playlistVideos = filteredVideos.slice((safePlaylistPage - 1) * 8, safePlaylistPage * 8);
  const homeVideos = videos.slice(0, homeVisibleCount);
  const featuredVideo = filteredVideos[0] ?? videos[0] ?? VIDEOS[0];
  const watchPlaylist = useMemo(() => {
    return videos;
  }, [videos]);

  useEffect(() => {
    if (activeView !== 'home') return;

    const loadMoreHomeVideos = () => {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 480) return;
      setHomeVisibleCount((count) => Math.min(count + 20, videos.length));
    };

    window.addEventListener('scroll', loadMoreHomeVideos, { passive: true });
    loadMoreHomeVideos();
    return () => window.removeEventListener('scroll', loadMoreHomeVideos);
  }, [activeView, videos.length]);

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

  useEffect(() => {
    if (!isUploadOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPublishing) closeUploadDialog();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPublishing, isUploadOpen]);

  useEffect(() => () => {
    if (uploadTimerRef.current !== null) window.clearInterval(uploadTimerRef.current);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIDEO_UPLOAD_DRAFT_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved) as {
          isOpen?: boolean;
          step?: VideoUploadStep;
          progress?: number;
          title?: string;
          tags?: string;
          duration?: string;
          resolution?: VideoItem['resolution'];
          visibility?: VideoVisibility;
        };
        setIsUploadOpen(Boolean(draft.isOpen));
        setUploadStep(draft.step === 'publish' ? 'publish' : 'upload');
        setUploadProgress(Number.isFinite(draft.progress) ? Math.max(0, Math.min(100, draft.progress ?? 0)) : 0);
        setUploadTitle(draft.title ?? '');
        setUploadTags(draft.tags ?? '');
        setUploadDuration(draft.duration ?? '00:00');
        setUploadResolution(draft.resolution ?? '1080p');
        setUploadVisibility(
          draft.step === 'publish' && draft.visibility === 'private'
            ? 'private'
            : 'public',
        );
      } catch {
        window.localStorage.removeItem(VIDEO_UPLOAD_DRAFT_KEY);
      }
    }
    window.setTimeout(() => {
      uploadDraftHydratedRef.current = true;
    }, 0);
  }, []);

  useEffect(() => {
    if (!uploadDraftHydratedRef.current) return;
    if (!isUploadOpen) {
      window.localStorage.removeItem(VIDEO_UPLOAD_DRAFT_KEY);
      return;
    }
    try {
      window.localStorage.setItem(VIDEO_UPLOAD_DRAFT_KEY, JSON.stringify({
        isOpen: true,
        step: uploadStep,
        progress: uploadProgress,
        title: uploadTitle,
        tags: uploadTags,
        duration: uploadDuration,
        resolution: uploadResolution,
        visibility: uploadVisibility,
      }));
    } catch {
      // Upload drafts are optional; never break the page when storage is unavailable.
    }
  }, [
    isUploadOpen,
    uploadStep,
    uploadProgress,
    uploadTitle,
    uploadTags,
    uploadDuration,
    uploadResolution,
    uploadVisibility,
  ]);

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

  const clearUploadTimer = () => {
    if (uploadTimerRef.current === null) return;
    window.clearInterval(uploadTimerRef.current);
    uploadTimerRef.current = null;
  };

  const closeUploadDialog = () => {
    if (isPublishing) return;
    clearUploadTimer();
    setIsUploadOpen(false);
    setUploadStep('upload');
    setUploadProgress(0);
    setUploadVideoFile(null);
    setUploadVideoSrc('');
    setUploadCoverPreview('');
    setUploadTitle('');
    setUploadTags('');
    setUploadDuration('00:00');
    setUploadResolution('1080p');
    setUploadVisibility('public');
    setUploadError('');
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const openUploadDialog = () => {
    if (!currentUser) {
      window.dispatchEvent(new CustomEvent('app:notification', {
        detail: { message: '请先注册或登录后再上传视频', type: 'error' },
      }));
      return;
    }
    if (uploadStep === 'upload') setUploadVisibility('public');
    setIsUploadOpen(true);
  };

  const updateVideoMetadata = (src: string) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      setUploadDuration(formatUploadedDuration(video.duration));
      if (video.videoWidth >= 3840) setUploadResolution('4K');
      else if (video.videoWidth >= 2048) setUploadResolution('2K');
      else setUploadResolution('1080p');
      video.removeAttribute('src');
      video.load();
    };
    video.onerror = () => {
      video.removeAttribute('src');
      video.load();
    };
    video.src = src;
  };

  const selectUploadVideo = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setUploadError('请选择有效的视频文件。');
      return;
    }

    clearUploadTimer();
    const src = URL.createObjectURL(file);
    setUploadError('');
    setUploadVideoFile(file);
    setUploadVideoSrc(src);
    setUploadTitle(getUploadTitle(file.name));
    setUploadProgress(6);
    setUploadStep('publish');
    updateVideoMetadata(src);

    uploadTimerRef.current = window.setInterval(() => {
      setUploadProgress((current) => {
        const next = Math.min(100, current + Math.max(4, Math.round((100 - current) * 0.18)));
        if (next === 100) {
          clearUploadTimer();
        }
        return next;
      });
    }, 130);
  };

  const selectUploadCover = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('请选择图片作为视频封面。');
      return;
    }
    setUploadError('');
    setUploadCoverPreview(URL.createObjectURL(file));
  };

  const publishVideo = () => {
    if (!currentUser || !uploadVideoFile || !uploadVideoSrc || !uploadTitle.trim()) {
      setUploadError('请完成视频文件和标题后再发布。');
      return;
    }

    const category = uploadTags
      .split(/\s+/)
      .find((tag) => tag.startsWith('#'))
      ?.slice(1)
      .trim() || 'All';
    const creator = currentUser.name || currentUser.username || 'User';
    const newVideo: VideoItem = {
      id: `uploaded-${Date.now()}`,
      title: uploadTitle.trim(),
      description: uploadTags.trim()
        ? `Published with ${uploadTags.trim()}`
        : 'A newly published video.',
      creator,
      avatar: resolveAvatarUrl(currentUser.avatar) || defaultAvatarDataUrl(creator),
      views: '0 views',
      duration: uploadDuration,
      resolution: uploadResolution,
      category,
      poster: uploadCoverPreview || DEFAULT_UPLOAD_POSTER,
      src: uploadVideoSrc,
    };

    setIsPublishing(true);
    window.setTimeout(() => {
      setVideos((current) => [newVideo, ...current]);
      setHomeVisibleCount((current) => Math.max(current, 20));
      setIsPublishing(false);
      const next = new URLSearchParams(searchParams);
      next.delete('page');
      setSearchParams(next);
      closeUploadDialog();
      window.dispatchEvent(new CustomEvent('app:notification', {
        detail: { message: '视频已发布到你的 Playlist 和 Home', type: 'success' },
      }));
    }, 420);
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
        <header className={`video-page-header${activeView === 'library' ? ' is-library' : ''}`}>
          <div>
            <h1>
              {activeView === 'home' && 'Browse the entire Lume library'}
              {activeView === 'library' && 'library'}
              {activeView === 'favorites' && selectedCollection.name}
              {activeView === 'playlist' && 'Video playlist'}
            </h1>
            {activeView === 'home' && (
              <p className="video-page-header-subtitle">
                Everything published on Lume. Hover any card — the whole page floats.
              </p>
            )}
          </div>
          {activeView === 'library' && (
            <label className="video-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="Search videos"
                aria-label="Search videos"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="video-search-clear"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              )}
            </label>
          )}
        </header>

        {activeView === 'playlist' && (
          <div className="video-playlist-category-row">
            <CategoryNav
              active={activeCategory}
              onChange={changeCategory}
              className="is-playlist"
            />
            <button type="button" className="video-upload-trigger" onClick={openUploadDialog}>
              <Upload size={17} />
              <span>Upload video</span>
            </button>
          </div>
        )}

        {activeView === 'favorites' && (
          <CategoryNav
            active={activeCategory}
            onChange={changeCategory}
            className="is-playlist"
          />
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
                  <Play size={20} strokeWidth={2} fill="currentColor" />
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
              </div>
            </section>

            <section className="video-section">
              <div className="video-home-recommendation">Today's Picks</div>
              {homeVideos.length ? (
                <div className="video-home-grid">
                  {homeVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                    favorite={favoriteIds.has(video.id)}
                    onPlay={openVideo}
                    onFavorite={toggleFavorite}
                    variant="playlist"
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
            {filteredCollections.length ? (
              <div className="video-library-grid">
                {filteredCollections.map((collection) => (
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
                  <span className="video-collection-play-button" aria-hidden="true">
                    <Play
                      size={20}
                      strokeWidth={2}
                      fill="currentColor"
                    />
                  </span>
                </button>
                ))}
              </div>
            ) : (
              <div className="video-empty">No collections match your search.</div>
            )}
          </section>
        )}

        {activeView === 'favorites' && (
          <section className="video-section video-favorites-section video-playlist-section">
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
                    variant="playlist"
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
            {playlistVideos.length ? (
              <div className="video-playlist-grid">
                {playlistVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    favorite={favoriteIds.has(video.id)}
                    onPlay={openVideo}
                    onFavorite={toggleFavorite}
                    variant="playlist"
                  />
                ))}
              </div>
            ) : (
              <div className="video-empty">No videos match your search.</div>
            )}
            {playlistPageCount > 1 && (
              <nav className="video-pagination" aria-label="Video playlist pages">
                <span className="video-pagination-status">
                  Page {safePlaylistPage} of {playlistPageCount}
                </span>
                <div className="video-pagination-actions">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={safePlaylistPage === 1}
                    onClick={() => changePlaylistPage(safePlaylistPage - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={safePlaylistPage === playlistPageCount}
                    onClick={() => changePlaylistPage(safePlaylistPage + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
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

      {isUploadOpen && (
        <VideoUploadDialog
          step={uploadStep}
          progress={uploadProgress}
          videoFile={uploadVideoFile}
          coverPreview={uploadCoverPreview}
          title={uploadTitle}
          tags={uploadTags}
          visibility={uploadVisibility}
          duration={uploadDuration}
          error={uploadError}
          isPublishing={isPublishing}
          videoInputRef={videoInputRef}
          coverInputRef={coverInputRef}
          onClose={closeUploadDialog}
          onSelectVideo={selectUploadVideo}
          onSelectCover={selectUploadCover}
          onTitleChange={setUploadTitle}
          onTagsChange={setUploadTags}
          onVisibilityChange={setUploadVisibility}
          onPublish={publishVideo}
        />
      )}

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
