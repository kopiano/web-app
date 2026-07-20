import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  Heart,
  Home,
  ImagePlus,
  Library,
  ListVideo,
  LoaderCircle,
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
import {
  createVideoComment,
  deleteVideo,
  getVideo,
  getVideoCategories,
  getVideoCollections,
  getVideoComments,
  getVideos,
  updateVideo,
  updateVideoCommentLike,
  updateVideoFavorite,
  updateVideoLike,
  uploadVideo,
  viewVideo,
} from '@/api/video';
import type {
  VideoApiCollection,
  VideoApiComment,
  VideoApiItem,
  VideoCategory,
  VideoPage,
  VideoVisibility,
} from '@/api/video';
import {
  isMockCollectionId,
  isMockVideoId,
  MOCK_COLLECTION_VIDEO_IDS,
  MOCK_VIDEO_CATEGORIES,
  MOCK_VIDEO_COLLECTIONS,
  MOCK_VIDEO_COMMENTS,
  MOCK_VIDEO_ITEMS,
} from '@/data/videoMockData';
import { defaultAvatarDataUrl, resolveAvatarUrl } from '@/lib/avatar';
import type { RootState } from '@/store/store';
import '@/styles/video.scss';

type VideoView = 'home' | 'library' | 'favorites' | 'playlist' | 'watch';
type UploadStep = 'upload' | 'publish';
type Cursor = { createdAt: string; id: string } | null;

type CardVideo = {
  id: string;
  title: string;
  description: string;
  creator: string;
  avatar: string;
  views: string;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  duration: string;
  resolution: '4K' | '2K' | '1080p';
  category: string;
  categorySlug: string;
  poster: string;
  src: string;
  status: VideoApiItem['status'];
  processingProgress: number;
  processingError: string | null;
  liked: boolean;
  favorited: boolean;
  createdAt: string;
  raw: VideoApiItem;
};

type ReplyTarget = {
  rootId: string;
  userId: string;
  username: string;
};

type UploadDraft = {
  isOpen: boolean;
  step: UploadStep;
  videoId: string | null;
  videoName: string;
  title: string;
  tags: string;
  visibility: VideoVisibility;
  duration: string;
  coverUrl: string;
  publishRequested?: boolean;
};

type MockVideoOverride = Partial<Pick<
  VideoApiItem,
  'liked' | 'favorited' | 'likeCount' | 'favoriteCount' | 'viewCount' | 'commentCount'
>>;

type ApiRequestError = {
  response?: {
    status?: number;
  };
};

const VALID_VIEWS = new Set<VideoView>(['home', 'library', 'favorites', 'playlist', 'watch']);
const UPLOAD_DRAFT_KEY = 'lume-video-upload-draft-v2';
const VIDEO_RECORD_EXISTS_KEY = 'lume-video-record-exists-v1';
const VIDEO_VIEW_TTL_MS = 24 * 60 * 60 * 1000;
const COMMENT_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
  '😊', '😇', '🙂', '😉', '😍', '😘', '😋', '😎',
  '🤩', '🥳', '🤔', '🤗', '🤓', '😏', '😒', '😞',
  '👍', '👌', '👏', '🙌', '💪', '🙏', '👋', '🎉',
  '✨', '🔥', '🚀', '❤️', '🌍', '🎮', '🥇', '🏅',
  '🌩️', '🌨️', '🌧️', '🌦️', '🌥️', '🌤️', '⛈️', '⛅',
  '🍉', '🥬', '🍇',
];

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '00:00';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolutionFor(video: VideoApiItem): CardVideo['resolution'] {
  if ((video.width ?? 0) >= 3840 || (video.height ?? 0) >= 2160) return '4K';
  if ((video.width ?? 0) >= 2048 || (video.height ?? 0) >= 1440) return '2K';
  return '1080p';
}

function firstCategory(video: VideoApiItem, language: string) {
  const category = video.categories[0];
  if (!category) return { name: language.startsWith('zh') ? '其它' : 'Other', slug: 'other' };
  return {
    name: language.startsWith('zh') ? category.nameZh : category.nameEn,
    slug: category.slug,
  };
}

function withoutCategoryMarkers(value: string) {
  return value
    .replace(/(^|\s)#[\p{L}\p{N}-]+/gu, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toCardVideo(video: VideoApiItem, language: string): CardVideo {
  const category = firstCategory(video, language);
  const formatter = new Intl.NumberFormat(language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return {
    id: video.id,
    title: video.title || (language.startsWith('zh') ? '未命名视频' : 'Untitled video'),
    description: video.description,
    creator: video.username || (language.startsWith('zh') ? '用户' : 'User'),
    avatar: video.avatar || defaultAvatarDataUrl(video.username || 'User'),
    views: `${formatter.format(video.viewCount)} ${language.startsWith('zh') ? '次播放' : 'views'}`,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    favoriteCount: video.favoriteCount,
    commentCount: video.commentCount,
    duration: formatDuration(video.duration),
    resolution: resolutionFor(video),
    category: category.name,
    categorySlug: category.slug,
    poster: video.coverUrl,
    src: video.status === 'ready' ? video.hlsMasterUrl : '',
    status: video.status,
    processingProgress: video.processingProgress,
    processingError: video.processingError,
    liked: video.liked,
    favorited: video.favorited,
    createdAt: video.createdAt,
    raw: video,
  };
}

function pageQuery(cursor: Cursor, input: Record<string, unknown>) {
  return getVideos({
    ...input,
    ...(cursor ? {
      before_created_at: cursor.createdAt,
      before_id: cursor.id,
    } : {}),
  });
}

function nextCursor(page: VideoPage): Cursor | undefined {
  if (!page.hasMore || !page.nextBeforeCreatedAt || !page.nextBeforeId) return undefined;
  return { createdAt: page.nextBeforeCreatedAt, id: page.nextBeforeId };
}

function getFileTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled video';
}

function notify(message: string, type: 'success' | 'error') {
  window.dispatchEvent(new CustomEvent('app:notification', { detail: { message, type } }));
}

function lazyImageProps() {
  return {
    loading: 'lazy' as const,
    decoding: 'async' as const,
    fetchPriority: 'low' as const,
  };
}

function CategoryNav({
  active,
  categories,
  language,
  allLabel,
  ariaLabel,
  onChange,
  className = '',
}: {
  active: string;
  categories: VideoCategory[];
  language: string;
  allLabel: string;
  ariaLabel: string;
  onChange: (category: string) => void;
  className?: string;
}) {
  const options = [
    { slug: 'all', label: allLabel },
    ...categories.map((category) => ({
      slug: category.slug,
      label: language.startsWith('zh') ? category.nameZh : category.nameEn,
    })),
  ];
  return (
    <div
      className={`video-category-nav${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((category) => (
        <button
          key={category.slug}
          type="button"
          role="tab"
          aria-selected={active === category.slug}
          className={active === category.slug ? 'is-active' : ''}
          onClick={() => onChange(category.slug)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}

const VideoCard = memo(function VideoCard({
  video,
  onPlay,
  onFavorite,
  variant = 'playlist',
}: {
  video: CardVideo;
  onPlay: (video: CardVideo) => void;
  onFavorite: (video: CardVideo) => void;
  variant?: 'playlist' | 'default';
}) {
  const isProcessing = video.status === 'uploading' || video.status === 'processing';
  return (
    <article className={`video-tile is-${variant}${isProcessing ? ' is-processing' : ''}${video.status === 'failed' ? ' is-failed' : ''}`}>
      <button type="button" className="video-tile-hit" onClick={() => onPlay(video)}>
        <img src={video.poster} alt="" {...lazyImageProps()} />
        <span className="video-quality">{video.resolution}</span>
        <span className="video-category-tag">{video.category}</span>
        {variant !== 'playlist' && (
          <span className="video-duration">
            <Clock3 size={12} aria-hidden="true" />
            {video.duration}
          </span>
        )}
        {isProcessing ? (
          <span
            className="video-tile-processing"
            role="status"
            aria-label={`Processing ${video.processingProgress}%`}
          >
            <LoaderCircle size={20} aria-hidden="true" />
            <strong>{video.processingProgress}%</strong>
          </span>
        ) : (
          <span className="video-tile-play" aria-hidden="true">
            <Play size={20} fill="currentColor" />
          </span>
        )}
        <span className="video-tile-details">
          {variant !== 'playlist' && (
            <img src={video.avatar} alt="" className="video-avatar" {...lazyImageProps()} />
          )}
          <span className="video-tile-copy">
            <strong title={video.title}>{video.title}</strong>
            <small>{video.creator}</small>
            <span className="video-tile-meta">
              <span>
                <ThumbsUp size={13} aria-hidden="true" />
                {new Intl.NumberFormat(undefined, { notation: 'compact' }).format(video.likeCount)}
              </span>
              <span>
                <BarChart3 size={13} aria-hidden="true" />
                {video.views}
              </span>
              <span className="video-tile-inline-duration">
                <Clock3 size={13} aria-hidden="true" />
                {video.duration}
              </span>
            </span>
          </span>
        </span>
        {isProcessing && (
          <span className="video-tile-processing-progress" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, video.processingProgress))}%` }} />
          </span>
        )}
      </button>
      {variant !== 'playlist' && (
        <button
          type="button"
          className={`video-favorite${video.favorited ? ' is-active' : ''}`}
          aria-pressed={video.favorited}
          onClick={() => onFavorite(video)}
        >
          <Heart size={17} fill={video.favorited ? 'currentColor' : 'none'} />
        </button>
      )}
    </article>
  );
});

function UploadDialog({
  step,
  progress,
  processingProgress,
  videoName,
  coverUrl,
  title,
  tags,
  visibility,
  duration,
  error,
  busy,
  publishRequested,
  processingFailed,
  videoInputRef,
  coverInputRef,
  onClose,
  onVideo,
  onCover,
  onTitle,
  onTags,
  onVisibility,
  onPublish,
}: {
  step: UploadStep;
  progress: number;
  processingProgress: number;
  videoName: string;
  coverUrl: string;
  title: string;
  tags: string;
  visibility: VideoVisibility;
  duration: string;
  error: string;
  busy: boolean;
  publishRequested: boolean;
  processingFailed: boolean;
  videoInputRef: RefObject<HTMLInputElement | null>;
  coverInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onVideo: (file: File | null) => void;
  onCover: (file: File | null) => void;
  onTitle: (value: string) => void;
  onTags: (value: string) => void;
  onVisibility: (value: VideoVisibility) => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const isTransferring = step === 'publish' && progress < 100;
  return createPortal(
    <div className="video-upload-overlay" role="presentation">
      <button
        type="button"
        className="video-upload-backdrop"
        aria-label={t('video.upload.close')}
        disabled={busy}
        onClick={onClose}
      />
      <section
        className={[
          'video-upload-dialog',
          `is-${step}`,
          isTransferring ? 'is-transferring' : '',
          publishRequested ? 'is-processing' : '',
        ].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="video-upload-close"
          aria-label={t('video.upload.close')}
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        {step === 'publish' && (
          <div className="video-upload-progress">
            <div className="video-upload-progress-copy">
              <span>
                {progress < 100
                  ? t('video.upload.uploading')
                  : processingFailed
                    ? t('video.upload.processingFailed')
                    : publishRequested
                    ? t('video.upload.awaitingReady', { progress: processingProgress })
                    : t('video.upload.processing', { progress: processingProgress })}
              </span>
              <strong>{progress < 100 ? progress : processingProgress}%</strong>
            </div>
            <span className="video-upload-progress-track" aria-hidden="true">
              <i style={{ width: `${progress < 100 ? progress : processingProgress}%` }} />
            </span>
            {progress === 100 && processingProgress >= 100 && (
              <p className="video-upload-processing-complete">
                {t('video.upload.processingComplete')}
              </p>
            )}
          </div>
        )}
        {step === 'upload' ? (
          <div className="video-upload-select-step">
            <span className="video-upload-mark" aria-hidden="true"><Upload size={24} /></span>
            <p className="video-upload-eyebrow">{t('video.upload.newVideo')}</p>
            <h2>{t('video.upload.title')}</h2>
            <p className="video-upload-description">{t('video.upload.description')}</p>
            <input
              ref={videoInputRef}
              className="video-upload-file-input"
              type="file"
              accept="video/*"
              onChange={(event) => onVideo(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={`video-upload-dropzone${isDraggingVideo ? ' is-dragging' : ''}`}
              onClick={() => videoInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingVideo(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setIsDraggingVideo(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setIsDraggingVideo(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingVideo(false);
                onVideo(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <Upload size={22} />
              <span>
                <strong>{videoName || t('video.upload.selectVideo')}</strong>
                <small>{t('video.upload.formats')}</small>
              </span>
            </button>
            {error && <p className="video-upload-error" role="alert">{error}</p>}
          </div>
        ) : (
          <div className="video-upload-publish-step">
            <div className="video-upload-summary">
              <span><small>{t('video.upload.video')}</small><strong>{videoName}</strong></span>
              <span><small>{t('video.upload.duration')}</small><strong>{duration}</strong></span>
              <span className="video-upload-visibility-field">
                <small>{t('video.upload.visibility')}</small>
                <div className={`video-upload-visibility is-${visibility}`}>
                  {(['public', 'private'] as VideoVisibility[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={visibility === option ? 'is-active' : ''}
                      aria-pressed={visibility === option}
                      disabled={publishRequested && !processingFailed}
                      onClick={() => onVisibility(option)}
                    >
                      {t(`video.upload.${option}`)}
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
                <p className="video-upload-eyebrow">
                  {progress < 100
                    ? t('video.upload.uploading')
                    : processingFailed
                      ? t('video.upload.processingFailed')
                      : publishRequested
                      ? t('video.upload.publishQueued')
                      : t('video.upload.detailsReady')}
                </p>
                <h2>{t('video.upload.details')}</h2>
              </div>
            </div>
            <div className="video-upload-form">
              <div
                className={`video-upload-cover-field${coverUrl ? ' has-preview' : ' is-empty'}`}
                role="button"
                tabIndex={0}
                aria-label={t('video.upload.chooseCover')}
                aria-disabled={publishRequested && !processingFailed}
                onClick={() => {
                  if (!publishRequested || processingFailed) coverInputRef.current?.click();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!publishRequested || processingFailed) coverInputRef.current?.click();
                  }
                }}
              >
                {coverUrl ? (
                  <>
                    <img src={coverUrl} alt={t('video.upload.selectedCover')} />
                    <span className="video-upload-cover-shade" aria-hidden="true">
                      <ImagePlus size={20} />
                    </span>
                  </>
                ) : (
                  <span className="video-upload-cover-empty">
                    <ImagePlus size={28} aria-hidden="true" />
                    <strong>{t('video.upload.chooseCover')}</strong>
                    <small>{t('video.upload.coverHint')}</small>
                  </span>
                )}
                <input
                  ref={coverInputRef}
                  className="video-upload-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => onCover(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="video-upload-fields">
                <label>
                  <span>{t('video.upload.videoTitle')}</span>
                  <input
                    value={title}
                    maxLength={255}
                    disabled={publishRequested && !processingFailed}
                    onChange={(event) => onTitle(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('video.upload.categories')}</span>
                  <input
                    value={tags}
                    placeholder="#travel #nature"
                    disabled={publishRequested && !processingFailed}
                    onChange={(event) => onTags(event.target.value)}
                  />
                  <small>{t('video.upload.categoryHint')}</small>
                </label>
              </div>
            </div>
            {error && <p className="video-upload-error" role="alert">{error}</p>}
            <button
              type="button"
              className="video-upload-publish"
              disabled={!title.trim() || progress < 100 || busy || (publishRequested && !processingFailed)}
              onClick={onPublish}
            >
              <Upload size={18} />
              {busy
                ? t('video.upload.publishing')
                : processingFailed
                  ? t('video.upload.retryPublish')
                  : publishRequested
                  ? t('video.upload.awaitingReady', { progress: processingProgress })
                  : t('video.upload.publish')}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function VideoWatch({
  video,
  playlist,
  comments,
  currentUserAvatar,
  onBack,
  onSelect,
  onReact,
  onComment,
  onCommentLike,
  onViewQualified,
  onDelete,
}: {
  video: CardVideo;
  playlist: CardVideo[];
  comments: VideoApiComment[];
  currentUserAvatar: string;
  onBack: () => void;
  onSelect: (video: CardVideo) => void;
  onReact: (kind: 'like' | 'favorite', active: boolean) => void;
  onComment: (content: string, target: ReplyTarget | null) => void;
  onCommentLike: (comment: VideoApiComment, active: boolean) => void;
  onViewQualified: (videoId: string) => Promise<boolean>;
  onDelete: (videoId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewedRef = useRef(false);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.raw.duration);
  const [playerHeight, setPlayerHeight] = useState<number>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [volumeControlOpen, setVolumeControlOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [viewIncrementVisible, setViewIncrementVisible] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const controlsTimerRef = useRef<number | undefined>(undefined);
  const volumeControlTimerRef = useRef<number | undefined>(undefined);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimerRef.current = undefined;
    }, document.fullscreenElement === stageRef.current ? 6_000 : 5_000);
  }, []);

  const hideControls = useCallback(() => {
    if (controlsTimerRef.current !== undefined) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = undefined;
    }
    setControlsVisible(false);
  }, []);

  const showVolumeControl = useCallback(() => {
    if (volumeControlTimerRef.current !== undefined) {
      window.clearTimeout(volumeControlTimerRef.current);
      volumeControlTimerRef.current = undefined;
    }
    setVolumeControlOpen(true);
  }, []);

  const hideVolumeControl = useCallback(() => {
    if (volumeControlTimerRef.current !== undefined) {
      window.clearTimeout(volumeControlTimerRef.current);
    }
    volumeControlTimerRef.current = window.setTimeout(() => {
      setVolumeControlOpen(false);
      volumeControlTimerRef.current = undefined;
    }, 140);
  }, []);

  useEffect(() => {
    viewedRef.current = false;
    setDraft('');
    setReplyTarget(null);
    setViewIncrementVisible(false);
  }, [video.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setPlayerHeight(stage.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === stageRef.current;
      setIsFullscreen(fullscreen);
      if (fullscreen) {
        revealControls();
        return;
      }

      hideControls();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (controlsTimerRef.current !== undefined) {
        window.clearTimeout(controlsTimerRef.current);
      }
      if (volumeControlTimerRef.current !== undefined) {
        window.clearTimeout(volumeControlTimerRef.current);
      }
    };
  }, [hideControls, revealControls]);

  useEffect(() => {
    revealControls();
  }, [revealControls, video.id]);

  useEffect(() => {
    if (!media) return;
    let lastSecond = -1;
    const sync = () => {
      const second = Math.floor(media.currentTime);
      if (second !== lastSecond) {
        lastSecond = second;
        setCurrentTime(media.currentTime);
      }
      setDuration(Number.isFinite(media.duration) ? media.duration : video.raw.duration);
      setIsPlaying(!media.paused && !media.ended);
      setIsMuted(media.muted);
      setVolume(media.volume);
    };
    sync();
    media.addEventListener('loadedmetadata', sync);
    media.addEventListener('timeupdate', sync);
    media.addEventListener('play', sync);
    media.addEventListener('pause', sync);
    media.addEventListener('volumechange', sync);
    return () => {
      media.removeEventListener('loadedmetadata', sync);
      media.removeEventListener('timeupdate', sync);
      media.removeEventListener('play', sync);
      media.removeEventListener('pause', sync);
      media.removeEventListener('volumechange', sync);
    };
  }, [media, video.raw.duration]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      event.preventDefault();
      revealControls();
      if (!media) return;
      if (media.paused || media.ended) {
        void media.play();
      } else {
        media.pause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [media, revealControls]);

  const roots = comments.filter((comment) => !comment.parentId);
  const replies = useMemo(() => {
    const grouped = new Map<string, VideoApiComment[]>();
    comments.forEach((comment) => {
      if (!comment.parentId) return;
      grouped.set(comment.parentId, [...(grouped.get(comment.parentId) ?? []), comment]);
    });
    return grouped;
  }, [comments]);

  const startReply = (rootId: string, comment: VideoApiComment) => {
    const mention = `@${comment.username} `;
    setReplyTarget({ rootId, userId: comment.userId, username: comment.username });
    setDraft(mention);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(mention.length, mention.length);
    });
  };

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    onComment(content, replyTarget);
    setDraft('');
    setReplyTarget(null);
    setEmojiOpen(false);
  };

  const togglePlayback = () => {
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
  };

  const toggleMute = () => {
    if (!media) return;
    media.muted = !media.muted;
  };

  const seek = (value: number) => {
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    if (!media) return;
    media.volume = value;
    media.muted = value === 0;
  };

  const confirmDeleteVideo = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onDelete(video.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('video.deleteFailed'));
      setIsDeleting(false);
    }
  };

  return (
    <div className="video-watch-page">
      <button type="button" className="video-watch-back" onClick={onBack}>
        <ArrowLeft size={18} />
        {t('video.back')}
      </button>
      <div className="video-watch-layout">
        <div className="video-watch-main">
          <div
            ref={stageRef}
            className={`video-watch-player${isFullscreen ? ' is-fullscreen' : ''}${controlsVisible ? ' is-controls-visible' : ''}`}
            onPointerEnter={revealControls}
            onPointerMove={revealControls}
            onPointerDown={revealControls}
            onPointerLeave={hideControls}
          >
            {video.status === 'ready' && video.src ? (
              <HlsVideo
                key={video.id}
                src={video.src}
                poster={video.poster}
                playbackId={video.id}
                active
                autoPlay
                controls={false}
                toggleOnSurfaceClick
                onVideoElement={setMedia}
                errorLabel={t('video.player.error')}
                onViewQualified={() => {
                  if (viewedRef.current) return;
                  viewedRef.current = true;
                  void onViewQualified(video.id).then((counted) => {
                    if (!counted) return;
                    setViewIncrementVisible(true);
                    window.setTimeout(() => setViewIncrementVisible(false), 1200);
                  });
                }}
              />
            ) : (
              <div className="hls-video video-processing-player" style={{ aspectRatio: '16 / 9' }}>
                <img src={video.poster} alt="" {...lazyImageProps()} />
                <span>
                  {video.status === 'failed'
                    ? t('video.player.failed')
                    : t('video.player.processing', { progress: video.processingProgress })}
                </span>
              </div>
            )}
            {video.status === 'ready' && (
              <div className="video-watch-controls">
                <input
                  className="video-watch-timeline"
                  type="range"
                  min="0"
                  max={Math.max(duration, 0)}
                  step="0.1"
                  value={Math.min(currentTime, duration || currentTime)}
                  aria-label={t('video.player.progress')}
                  onChange={(event) => seek(Number(event.target.value))}
                  style={{ '--video-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
                />
                <div className="video-watch-control-row">
                  <button type="button" aria-label={isPlaying ? t('video.player.pause') : t('video.player.play')} onClick={togglePlayback}>
                    {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                  </button>
                  <span className="video-watch-time">
                    {formatPlaybackTime(currentTime)} <i>/</i> {formatPlaybackTime(duration)}
                  </span>
                  <span className="video-watch-control-spacer" />
                  <span className="video-watch-quality">{video.resolution}</span>
                  <div
                    className={`video-watch-volume${volumeControlOpen ? ' is-open' : ''}`}
                    onPointerLeave={hideVolumeControl}
                    onFocus={showVolumeControl}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) hideVolumeControl();
                    }}
                  >
                    <button
                      type="button"
                      aria-label={isMuted ? t('video.player.unmute') : t('video.player.mute')}
                      onPointerEnter={showVolumeControl}
                      onClick={toggleMute}
                    >
                      {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                    </button>
                    <input
                      className="video-watch-volume-range"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      aria-label={t('video.player.volume')}
                      onPointerEnter={showVolumeControl}
                      onChange={(event) => changeVolume(Number(event.target.value))}
                      style={{ '--video-volume': `${(isMuted ? 0 : volume) * 100}%` } as CSSProperties}
                    />
                  </div>
                  <button type="button" aria-label={t('video.player.settings')}><Settings2 size={18} /></button>
                  <button
                    type="button"
                    aria-label={t('video.player.fullscreen')}
                    onClick={() => {
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else void stageRef.current?.requestFullscreen();
                    }}
                  >
                    <Expand size={19} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <section className="video-watch-details">
            <h1>{video.title}</h1>
            <div className="video-watch-meta">
              <div className="video-watch-author">
                <img src={video.avatar} alt="" {...lazyImageProps()} />
                <span>
                  <strong>{video.creator}</strong>
                  <small className="video-watch-view-count">
                    {video.views}
                    {viewIncrementVisible && <b aria-live="polite">+1</b>}
                  </small>
                </span>
              </div>
              <div className="video-watch-actions">
                <button
                  type="button"
                  className={`is-like${video.liked ? ' is-liked' : ''}`}
                  aria-pressed={video.liked}
                  onClick={() => onReact('like', !video.liked)}
                >
                  <ThumbsUp size={18} fill={video.liked ? 'currentColor' : 'none'} />
                  <span>{new Intl.NumberFormat(undefined, { notation: 'compact' }).format(video.likeCount)}</span>
                </button>
                <button
                  type="button"
                  className={video.favorited ? 'is-saved' : ''}
                  aria-pressed={video.favorited}
                  onClick={() => onReact('favorite', !video.favorited)}
                >
                  <Star size={18} fill={video.favorited ? 'currentColor' : 'none'} />
                  <span>{new Intl.NumberFormat(undefined, { notation: 'compact' }).format(video.favoriteCount)}</span>
                </button>
                <button
                  type="button"
                  className="video-watch-more"
                  aria-label={t('video.more')}
                  onClick={() => {
                    setDeleteError('');
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>
          </section>
          <section className="video-comments">
            <div className="video-comments-heading">
              <h2>{t('video.comments.count', { count: comments.length })}</h2>
              <button type="button" aria-label={t('video.comments.settings')}><Settings2 size={17} /></button>
            </div>
            <div className="video-comment-compose">
              <img src={currentUserAvatar} alt="" {...lazyImageProps()} />
              <div>
                {replyTarget && (
                  <div className="video-comment-replying">
                    <span>{t('video.comments.replying', { name: replyTarget.username })}</span>
                    <button type="button" aria-label={t('video.comments.cancelReply')} onClick={() => {
                      setReplyTarget(null);
                      setDraft('');
                    }}>
                      <X size={15} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={2}
                  placeholder={t('video.comments.placeholder')}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="video-comment-compose-actions">
                  <button type="button" className={emojiOpen ? 'is-active' : ''} onClick={() => setEmojiOpen((open) => !open)}>
                    <Smile size={18} />
                  </button>
                  {emojiOpen && (
                    <div className="video-comment-emoji-picker">
                      {COMMENT_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setDraft((value) => `${value}${emoji}`);
                            setEmojiOpen(false);
                            inputRef.current?.focus();
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <span />
                  <button type="button" className="video-comment-submit" disabled={!draft.trim()} onClick={submit}>
                    {t('video.comments.post')}
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="video-comment-list">
              {roots.map((comment) => (
                <article key={comment.id} className="video-comment">
                  <img src={comment.avatar || defaultAvatarDataUrl(comment.username)} alt="" {...lazyImageProps()} />
                  <div>
                    <header><strong>{comment.username}</strong><time>{new Date(comment.createdAt).toLocaleString()}</time></header>
                    <p>{comment.content}</p>
                    <footer>
                      <button type="button" className={comment.liked ? 'is-liked' : ''} onClick={() => onCommentLike(comment, !comment.liked)}>
                        <ThumbsUp size={15} fill={comment.liked ? 'currentColor' : 'none'} />
                        {comment.likeCount}
                      </button>
                      <button type="button" onClick={() => startReply(comment.id, comment)}>
                        <MessageCircle size={15} />
                        {t('video.comments.reply')}
                      </button>
                    </footer>
                    {(replies.get(comment.id) ?? []).length > 0 && (
                      <div className="video-comment-replies">
                        {(replies.get(comment.id) ?? []).map((reply) => (
                          <article key={reply.id} className="video-comment-reply">
                            <img src={reply.avatar || defaultAvatarDataUrl(reply.username)} alt="" {...lazyImageProps()} />
                            <div>
                              <header><strong>{reply.username}</strong><time>{new Date(reply.createdAt).toLocaleString()}</time></header>
                              <p>{reply.content}</p>
                              <footer>
                                <button type="button" className={reply.liked ? 'is-liked' : ''} onClick={() => onCommentLike(reply, !reply.liked)}>
                                  <ThumbsUp size={14} fill={reply.liked ? 'currentColor' : 'none'} />
                                  {reply.likeCount}
                                </button>
                                <button type="button" onClick={() => startReply(comment.id, reply)}>
                                  <MessageCircle size={14} />
                                  {t('video.comments.reply')}
                                </button>
                              </footer>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <aside className="video-watch-queue" style={playerHeight ? { height: playerHeight } : undefined}>
          <header>
            <div><span>{t('video.queue.label')}</span><h2>{t('video.queue.next')}</h2></div>
            <strong>{t('video.queue.count', { count: playlist.length })}</strong>
          </header>
          <div className="video-watch-queue-list">
            {playlist.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={item.id === video.id ? 'is-current' : ''}
                onClick={() => onSelect(item)}
              >
                <span className="video-watch-queue-index">{index + 1}</span>
                <span className="video-watch-queue-poster">
                  <img src={item.poster} alt="" {...lazyImageProps()} />
                  <small>{item.duration}</small>
                </span>
                <span className="video-watch-queue-copy">
                  <strong>{item.title}</strong>
                  <small>{item.creator}</small>
                  <em>{item.views}</em>
                </span>
                {item.id === video.id && <span className="video-watch-now">{t('video.queue.playing')}</span>}
              </button>
            ))}
          </div>
        </aside>
      </div>
      {isDeleteDialogOpen && createPortal(
        <div className="video-delete-overlay" role="presentation">
          <button
            type="button"
            className="video-delete-backdrop"
            aria-label={t('video.deleteCancel')}
            onClick={() => {
              if (!isDeleting) setIsDeleteDialogOpen(false);
            }}
          />
          <section
            className="video-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-delete-title"
          >
            <button
              type="button"
              className="video-delete-close"
              aria-label={t('video.deleteCancel')}
              disabled={isDeleting}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="video-delete-icon" aria-hidden="true">
              <MoreHorizontal size={26} />
            </div>
            <p className="video-delete-eyebrow">{t('video.more')}</p>
            <h2 id="video-delete-title">{t('video.deleteTitle')}</h2>
            <p>{t('video.deleteDescription')}</p>
            {deleteError && <p className="video-delete-error">{deleteError}</p>}
            <div className="video-delete-actions">
              <button
                type="button"
                className="video-delete-cancel"
                disabled={isDeleting}
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                {t('video.deleteCancel')}
              </button>
              <button
                type="button"
                className="video-delete-confirm"
                disabled={isDeleting}
                onClick={() => void confirmDeleteVideo()}
              >
                {isDeleting && <LoaderCircle size={17} className="is-spinning" />}
                {isDeleting ? t('video.deleting') : t('video.deleteConfirm')}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function VideoConnected() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const queryClient = useQueryClient();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view') as VideoView | null;
  const activeView = requestedView && VALID_VIEWS.has(requestedView) ? requestedView : 'home';
  const requestedVideoId = searchParams.get('video');
  const selectedCollectionId = searchParams.get('collection');
  const playlistPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>('upload');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadVideoId, setUploadVideoId] = useState<string | null>(null);
  const [uploadVideoName, setUploadVideoName] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<VideoVisibility>('public');
  const [uploadDuration, setUploadDuration] = useState('00:00');
  const [uploadCoverUrl, setUploadCoverUrl] = useState('');
  const [uploadCoverFile, setUploadCoverFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadPublishRequested, setUploadPublishRequested] = useState(false);
  const [publishedProcessingVideos, setPublishedProcessingVideos] = useState<VideoApiItem[]>([]);
  const [hasVideoRecord, setHasVideoRecord] = useState(() => {
    try {
      return window.localStorage.getItem(VIDEO_RECORD_EXISTS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mockVideoOverrides, setMockVideoOverrides] = useState<Record<string, MockVideoOverride>>({});
  const [mockComments, setMockComments] = useState<VideoApiComment[]>(MOCK_VIDEO_COMMENTS);
  const uploadHydratedRef = useRef(false);
  const uploadCoverObjectUrlRef = useRef<string | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadSessionRef = useRef(0);
  const draftTitleSaveVersionRef = useRef(0);
  const draftTitleSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadPublishRequestedRef = useRef(false);
  const uploadFinalizingRef = useRef(false);

  useEffect(() => () => {
    uploadAbortControllerRef.current?.abort();
    if (uploadCoverObjectUrlRef.current) URL.revokeObjectURL(uploadCoverObjectUrlRef.current);
  }, []);

  const categoriesQuery = useQuery({
    queryKey: ['video', 'categories'],
    queryFn: () => getVideoCategories(),
  });
  const playlistCategoriesQuery = useQuery({
    queryKey: ['video', 'categories', 'playlist', currentUser?.id ?? 'public'],
    queryFn: () => getVideoCategories({
      scope: currentUser ? 'accessible' : 'public',
    }),
    enabled: activeView === 'playlist',
  });
  const collectionsQuery = useQuery({
    queryKey: ['video', 'collections'],
    queryFn: () => getVideoCollections(),
  });
  const homeQuery = useInfiniteQuery({
    queryKey: ['video', 'home'],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, { limit: 20, scope: 'public' }),
    getNextPageParam: nextCursor,
  });
  const playlistQuery = useInfiniteQuery({
    queryKey: ['video', 'playlist', activeCategory, currentUser?.id ?? 'public'],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, {
      limit: 8,
      scope: currentUser ? 'accessible' : 'public',
      ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
    }),
    getNextPageParam: nextCursor,
    refetchInterval: (query) => (
      query.state.data?.pages
        .flatMap((page) => page.items)
        .some((video) => video.status === 'uploading' || video.status === 'processing')
        ? 1200
        : false
    ),
    enabled: activeView === 'playlist',
  });
  const collectionVideosQuery = useInfiniteQuery({
    queryKey: ['video', 'collection', selectedCollectionId, activeCategory],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, {
      limit: 20,
      collection_id: selectedCollectionId,
      ...(currentUser ? { scope: 'accessible' } : {}),
      ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
    }),
    getNextPageParam: nextCursor,
    enabled: activeView === 'favorites'
      && Boolean(selectedCollectionId)
      && !isMockCollectionId(selectedCollectionId),
  });
  const watchQuery = useQuery({
    queryKey: ['video', 'detail', requestedVideoId],
    queryFn: () => getVideo(requestedVideoId as string),
    enabled: activeView === 'watch'
      && Boolean(requestedVideoId)
      && !isMockVideoId(requestedVideoId),
    refetchInterval: (query) => query.state.data?.status === 'processing' ? 1500 : false,
  });
  const commentsQuery = useQuery({
    queryKey: ['video', 'comments', requestedVideoId],
    queryFn: () => getVideoComments(requestedVideoId as string),
    enabled: activeView === 'watch'
      && Boolean(requestedVideoId)
      && !isMockVideoId(requestedVideoId),
  });
  const uploadStatusQuery = useQuery({
    queryKey: ['video', 'detail', uploadVideoId],
    queryFn: () => getVideo(uploadVideoId as string),
    enabled: Boolean(uploadVideoId) && uploadOpen,
    refetchInterval: (query) => (
      query.state.data?.status === 'uploading' || query.state.data?.status === 'processing'
        ? 1200
        : false
    ),
  });
  const generatedUploadCoverUrl = useMemo(() => {
    if (uploadCoverUrl || !uploadStatusQuery.data?.coverUrl) return '';
    const coverUrl = uploadStatusQuery.data.coverUrl;
    const separator = coverUrl.includes('?') ? '&' : '?';
    const revision = uploadStatusQuery.data.updatedAt
      || `${uploadStatusQuery.data.status}-${uploadStatusQuery.data.processingProgress}`;
    return `${coverUrl}${separator}preview=${encodeURIComponent(revision)}`;
  }, [uploadCoverUrl, uploadStatusQuery.data]);
  const publishedProcessingQuery = useQuery({
    queryKey: ['video', 'published-processing', publishedProcessingVideos.map((video) => video.id)],
    queryFn: () => getVideos({ limit: 50, scope: 'accessible' }),
    enabled: publishedProcessingVideos.length > 0,
    refetchInterval: (query) => (
      query.state.data?.items.some((video) => (
        publishedProcessingVideos.some((pending) => pending.id === video.id)
        && (video.status === 'uploading' || video.status === 'processing')
      ))
        ? 1200
        : false
    ),
  });

  const homeSourceItems = useMemo(
    () => homeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [homeQuery.data],
  );
  const realHomeItems = useMemo(
    () => homeSourceItems
      .filter((video) => video.status === 'ready'),
    [homeSourceItems],
  );
  const useMockData = homeQuery.isSuccess
    && homeSourceItems.length === 0
    && !hasVideoRecord;
  const effectiveMockItems = useMemo(
    () => MOCK_VIDEO_ITEMS.map((video) => ({
      ...video,
      ...(mockVideoOverrides[video.id] ?? {}),
    })),
    [mockVideoOverrides],
  );
  const effectiveCategories = useMockData
    ? MOCK_VIDEO_CATEGORIES
    : categoriesQuery.data ?? [];
  const playlistCategories = playlistCategoriesQuery.data ?? [];
  const effectiveCollections = useMockData
    ? MOCK_VIDEO_COLLECTIONS
    : collectionsQuery.data ?? [];
  const processingVideos = useMemo(
    () => publishedProcessingVideos
      .map((pending) => (
        publishedProcessingQuery.data?.items.find((video) => video.id === pending.id) ?? pending
      ))
      .filter((video) => video.status === 'uploading' || video.status === 'processing'),
    [publishedProcessingQuery.data, publishedProcessingVideos],
  );
  const homeVideos = useMemo(
    () => (useMockData ? effectiveMockItems : realHomeItems)
      .map((video) => toCardVideo(video, language)),
    [effectiveMockItems, language, realHomeItems, useMockData],
  );
  const mockPlaylistItems = useMemo(
    () => effectiveMockItems.filter((video) => (
      activeCategory === 'all'
      || video.categories.some((category) => category.slug === activeCategory)
    )),
    [activeCategory, effectiveMockItems],
  );
  const mockPlaylistPageCount = Math.max(1, Math.ceil(mockPlaylistItems.length / 8));
  const playlistVideos = useMemo(() => {
    const items = useMockData
      ? mockPlaylistItems.slice((playlistPage - 1) * 8, playlistPage * 8)
      : playlistQuery.data?.pages[playlistPage - 1]?.items ?? [];
    const cards = items
      .filter((video) => (
        video.status === 'ready'
        || (
          video.owned
          && (video.status === 'uploading' || video.status === 'processing')
        )
      ))
      .map((video) => toCardVideo(video, language));
    const processingCards = processingVideos
      .filter((video) => (
        activeCategory === 'all'
        || video.categories.some((category) => category.slug === activeCategory)
      ))
      .map((video) => toCardVideo(video, language));
    return [...processingCards, ...cards]
      .filter((video, index, all) => all.findIndex((item) => item.id === video.id) === index)
      .slice(0, 8);
  }, [
    activeCategory,
    language,
    mockPlaylistItems,
    playlistPage,
    playlistQuery.data,
    processingVideos,
    useMockData,
  ]);
  const collectionVideos = useMemo(() => {
    const mockIds = selectedCollectionId
      ? MOCK_COLLECTION_VIDEO_IDS[selectedCollectionId] ?? []
      : [];
    const items = useMockData && isMockCollectionId(selectedCollectionId)
      ? effectiveMockItems.filter((video) => (
        mockIds.includes(video.id)
        && (
          activeCategory === 'all'
          || video.categories.some((category) => category.slug === activeCategory)
        )
      ))
      : collectionVideosQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return items
      .filter((video) => video.status === 'ready')
      .map((video) => toCardVideo(video, language));
  }, [
    activeCategory,
    collectionVideosQuery.data,
    effectiveMockItems,
    language,
    selectedCollectionId,
    useMockData,
  ]);
  const mockWatchItem = isMockVideoId(requestedVideoId)
    ? effectiveMockItems.find((video) => video.id === requestedVideoId)
    : undefined;
  const watchVideoItem = mockWatchItem ?? watchQuery.data;
  const watchVideo = watchVideoItem ? toCardVideo(watchVideoItem, language) : null;
  const watchComments = isMockVideoId(requestedVideoId)
    ? mockComments.filter((comment) => comment.videoId === requestedVideoId)
    : commentsQuery.data ?? [];
  const selectedCollection = effectiveCollections
    .find((collection) => collection.id === selectedCollectionId);
  const filteredCollections = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase(language);
    if (!normalized) return effectiveCollections;
    return effectiveCollections.filter((collection) => (
      collection.title.toLocaleLowerCase(language).includes(normalized)
    ));
  }, [effectiveCollections, language, search]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || activeView !== 'home' || useMockData) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && homeQuery.hasNextPage && !homeQuery.isFetchingNextPage) {
        void homeQuery.fetchNextPage();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeView,
    homeQuery.fetchNextPage,
    homeQuery.hasNextPage,
    homeQuery.isFetchingNextPage,
    useMockData,
  ]);

  useEffect(() => {
    if (
      activeView === 'playlist'
      && activeCategory !== 'all'
      && playlistCategoriesQuery.data
      && !playlistCategoriesQuery.data.some((category) => category.slug === activeCategory)
    ) {
      setActiveCategory('all');
    }
  }, [activeCategory, activeView, playlistCategoriesQuery.data]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(UPLOAD_DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as UploadDraft;
        setUploadOpen(Boolean(draft.isOpen));
        setUploadStep(draft.step === 'publish' ? 'publish' : 'upload');
        setUploadVideoId(draft.videoId || null);
        setUploadVideoName(draft.videoName || '');
        setUploadTitle(draft.title || '');
        setUploadTags(draft.tags || '');
        setUploadVisibility(
          draft.step === 'publish' && draft.videoId && draft.visibility === 'private'
            ? 'private'
            : 'public',
        );
        setUploadDuration(draft.duration || '00:00');
        setUploadCoverUrl(draft.coverUrl || '');
        const publishRequested = Boolean(draft.publishRequested);
        uploadPublishRequestedRef.current = publishRequested;
        setUploadPublishRequested(publishRequested);
        if (draft.videoId) setUploadProgress(100);
      }
    } catch {
      window.localStorage.removeItem(UPLOAD_DRAFT_KEY);
    }
    uploadHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!uploadHydratedRef.current) return;
    if (!uploadOpen) {
      window.localStorage.removeItem(UPLOAD_DRAFT_KEY);
      return;
    }
    const draft: UploadDraft = {
      isOpen: true,
      step: uploadStep,
      videoId: uploadVideoId,
      videoName: uploadVideoName,
      title: uploadTitle,
      tags: uploadTags,
      visibility: uploadVisibility,
      duration: uploadDuration,
      coverUrl: uploadCoverObjectUrlRef.current ? '' : uploadCoverUrl,
      publishRequested: uploadPublishRequested,
    };
    try {
      window.localStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Only small text and the backend ID are persisted.
    }
  }, [
    uploadCoverUrl,
    uploadDuration,
    uploadOpen,
    uploadPublishRequested,
    uploadStep,
    uploadTags,
    uploadTitle,
    uploadVideoId,
    uploadVideoName,
    uploadVisibility,
  ]);

  useEffect(() => {
    const videoId = uploadVideoId;
    const title = uploadTitle.trim();
    if (
      !videoId
      || uploadStep !== 'publish'
      || uploadPublishRequested
      || !title
    ) {
      return;
    }

    const session = uploadSessionRef.current;
    const version = draftTitleSaveVersionRef.current + 1;
    draftTitleSaveVersionRef.current = version;
    const timer = window.setTimeout(() => {
      const save = draftTitleSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            session !== uploadSessionRef.current
            || version !== draftTitleSaveVersionRef.current
          ) {
            return;
          }
          const updated = await updateVideo(videoId, { title });
          if (
            session === uploadSessionRef.current
            && version === draftTitleSaveVersionRef.current
          ) {
            queryClient.setQueryData(['video', 'detail', videoId], updated);
          }
        });
      draftTitleSaveQueueRef.current = save;
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    queryClient,
    uploadPublishRequested,
    uploadStep,
    uploadTitle,
    uploadVideoId,
  ]);

  useEffect(() => {
    const uploaded = uploadStatusQuery.data;
    if (!uploaded) return;
    setUploadDuration(formatDuration(uploaded.duration));
  }, [uploadStatusQuery.data]);

  const navigateTo = (view: 'home' | 'library' | 'playlist') => {
    const next = new URLSearchParams();
    if (view !== 'home') next.set('view', view);
    setSearchParams(next);
    setActiveCategory('all');
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openVideo = useCallback((video: CardVideo) => {
    setSearchParams({ view: 'watch', video: video.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSearchParams]);

  const updateMockReaction = useCallback((
    videoId: string,
    kind: 'like' | 'favorite',
    active: boolean,
  ) => {
    const baseVideo = MOCK_VIDEO_ITEMS.find((video) => video.id === videoId);
    if (!baseVideo) return;
    const activeKey = kind === 'like' ? 'liked' : 'favorited';
    const countKey = kind === 'like' ? 'likeCount' : 'favoriteCount';

    setMockVideoOverrides((previous) => {
      const current = previous[videoId] ?? {};
      const wasActive = current[activeKey] ?? baseVideo[activeKey];
      if (wasActive === active) return previous;
      const currentCount = current[countKey] ?? baseVideo[countKey];
      return {
        ...previous,
        [videoId]: {
          ...current,
          [activeKey]: active,
          [countKey]: Math.max(0, currentCount + (active ? 1 : -1)),
        },
      };
    });
  }, []);

  const updateCachedVideoViewCount = useCallback((videoId: string, viewCount: number) => {
    const updatePages = (data: InfiniteData<VideoPage, Cursor> | undefined) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (
            item.id === videoId ? { ...item, viewCount } : item
          )),
        })),
      };
    };

    queryClient.setQueryData<VideoApiItem>(['video', 'detail', videoId], (item) => (
      item ? { ...item, viewCount } : item
    ));
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'home'] },
      updatePages,
    );
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'playlist'] },
      updatePages,
    );
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'collection'] },
      updatePages,
    );
  }, [queryClient]);

  const trackQualifiedVideoView = useCallback(async (videoId: string) => {
    const viewerKey = currentUser?.id ?? 'guest';
    const storageKey = `lume-video-viewed:${viewerKey}:${videoId}`;
    const now = Date.now();
    try {
      const viewedAt = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(viewedAt) && viewedAt > 0 && now - viewedAt < VIDEO_VIEW_TTL_MS) {
        return false;
      }
    } catch {
      // View deduplication still works server-side when storage is unavailable.
    }

    if (isMockVideoId(videoId)) {
      const baseVideo = MOCK_VIDEO_ITEMS.find((item) => item.id === videoId);
      if (!baseVideo) return false;
      setMockVideoOverrides((previous) => {
        const current = previous[videoId] ?? {};
        const currentViewCount = current.viewCount ?? baseVideo.viewCount;
        return {
          ...previous,
          [videoId]: {
            ...current,
            viewCount: currentViewCount + 1,
          },
        };
      });
      try {
        window.localStorage.setItem(storageKey, String(now));
      } catch {
        // Storage is optional for mock data too.
      }
      return true;
    }

    try {
      const result = await viewVideo(videoId);
      updateCachedVideoViewCount(videoId, result.viewCount);
      try {
        window.localStorage.setItem(storageKey, String(now));
      } catch {
        // The API remains the source of truth if the browser blocks storage.
      }
      return result.counted;
    } catch {
      return false;
    }
  }, [currentUser?.id, updateCachedVideoViewCount]);

  const invalidateVideoData = useCallback(async (videoId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['video', 'home'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'playlist'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'collection'] }),
      ...(videoId
        ? [queryClient.invalidateQueries({ queryKey: ['video', 'detail', videoId] })]
        : []),
    ]);
  }, [queryClient]);

  const deleteWatchedVideo = useCallback(async (videoId: string) => {
    if (isMockVideoId(videoId)) {
      setSearchParams({});
      return;
    }

    await deleteVideo(videoId);
    queryClient.removeQueries({ queryKey: ['video', 'detail', videoId] });
    queryClient.removeQueries({ queryKey: ['video', 'comments', videoId] });
    await invalidateVideoData();
    setSearchParams({});
    notify(t('video.deleted'), 'success');
  }, [invalidateVideoData, queryClient, setSearchParams, t]);

  const toggleFavorite = useCallback(async (video: CardVideo) => {
    if (!currentUser) {
      notify(t('video.authRequired'), 'error');
      return;
    }
    if (isMockVideoId(video.id)) {
      updateMockReaction(video.id, 'favorite', !video.favorited);
      return;
    }
    try {
      await updateVideoFavorite(video.id, !video.favorited);
      await invalidateVideoData(video.id);
    } catch {
      notify(t('video.actionFailed'), 'error');
    }
  }, [currentUser, invalidateVideoData, t, updateMockReaction]);

  const changePlaylistPage = async (nextPage: number) => {
    if (nextPage < 1) return;
    if (useMockData && nextPage > mockPlaylistPageCount) return;
    if (!useMockData && nextPage > (playlistQuery.data?.pages.length ?? 0)) {
      if (!playlistQuery.hasNextPage) return;
      await playlistQuery.fetchNextPage();
    }
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectUploadVideo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setUploadError(t('video.upload.invalidVideo'));
      return;
    }
    const session = uploadSessionRef.current + 1;
    uploadSessionRef.current = session;
    draftTitleSaveVersionRef.current += 1;
    uploadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    uploadPublishRequestedRef.current = false;
    uploadFinalizingRef.current = false;
    setUploadPublishRequested(false);
    setUploadError('');
    setUploadBusy(false);
    setUploadStep('publish');
    setUploadProgress(0);
    setUploadVideoId(null);
    setUploadVideoName(file.name);
    setUploadTitle(getFileTitle(file.name));
    const objectUrl = URL.createObjectURL(file);
    const metadataVideo = document.createElement('video');
    metadataVideo.preload = 'metadata';
    metadataVideo.onloadedmetadata = () => {
      setUploadDuration(formatDuration(metadataVideo.duration));
      URL.revokeObjectURL(objectUrl);
      metadataVideo.removeAttribute('src');
      metadataVideo.load();
    };
    metadataVideo.onerror = () => URL.revokeObjectURL(objectUrl);
    metadataVideo.src = objectUrl;
    try {
      const uploaded = await uploadVideo(
        file,
        setUploadProgress,
        controller.signal,
        (draftVideo) => {
          if (session !== uploadSessionRef.current) {
            void deleteVideo(draftVideo.id);
            return;
          }
          setUploadVideoId(draftVideo.id);
          setHasVideoRecord(true);
          try {
            window.localStorage.setItem(VIDEO_RECORD_EXISTS_KEY, '1');
          } catch {
            // The current session still suppresses mock content when storage is unavailable.
          }
          queryClient.setQueryData(['video', 'detail', draftVideo.id], draftVideo);
        },
      );
      if (session !== uploadSessionRef.current) {
        void deleteVideo(uploaded.id);
        return;
      }
      setUploadVideoId(uploaded.id);
      setUploadProgress(100);
      if (uploaded.duration > 0) setUploadDuration(formatDuration(uploaded.duration));
      setHasVideoRecord(true);
      try {
        window.localStorage.setItem(VIDEO_RECORD_EXISTS_KEY, '1');
      } catch {
        // The current session still suppresses mock content when storage is unavailable.
      }
      queryClient.setQueryData(['video', 'detail', uploaded.id], uploaded);
    } catch {
      if (controller.signal.aborted || session !== uploadSessionRef.current) return;
      setUploadError(t('video.upload.failed'));
    } finally {
      if (uploadAbortControllerRef.current === controller) {
        uploadAbortControllerRef.current = null;
      }
    }
  };

  const selectUploadCover = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError(t('video.upload.invalidCover'));
      return;
    }
    setUploadError('');
    if (uploadCoverObjectUrlRef.current) URL.revokeObjectURL(uploadCoverObjectUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    uploadCoverObjectUrlRef.current = previewUrl;
    setUploadCoverFile(file);
    setUploadCoverUrl(previewUrl);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const closeUpload = () => {
    const uploadId = uploadVideoId;
    const shouldDeleteDraft = Boolean(uploadId) && !uploadPublishRequestedRef.current;
    uploadSessionRef.current += 1;
    draftTitleSaveVersionRef.current += 1;
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    uploadFinalizingRef.current = false;
    setUploadOpen(false);
    setUploadStep('upload');
    setUploadProgress(0);
    setUploadVideoId(null);
    setUploadVideoName('');
    setUploadTitle('');
    setUploadTags('');
    setUploadVisibility('public');
    setUploadDuration('00:00');
    if (uploadCoverObjectUrlRef.current) {
      URL.revokeObjectURL(uploadCoverObjectUrlRef.current);
      uploadCoverObjectUrlRef.current = null;
    }
    setUploadCoverUrl('');
    setUploadCoverFile(null);
    setUploadError('');
    setUploadBusy(false);
    uploadPublishRequestedRef.current = false;
    setUploadPublishRequested(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (coverInputRef.current) coverInputRef.current.value = '';
    if (shouldDeleteDraft) {
      void deleteVideo(uploadId as string)
        .then(() => invalidateVideoData(uploadId as string))
        .catch(() => {
          // The server owns cleanup of a partially uploaded record if deletion cannot be completed here.
        });
    }
  };

  const publishUpload = async () => {
    const categories = uploadTags
      .match(/#[\p{L}\p{N}-]+/gu)
      ?.map((tag) => tag.slice(1).toLowerCase())
      ?? [];
    if (!uploadVideoId || !uploadTitle.trim()) {
      setUploadError(t('video.upload.titleRequired'));
      return;
    }
    if (categories.length === 0) {
      setUploadError(t('video.upload.categoryRequired'));
      return;
    }
    setUploadBusy(true);
    setUploadError('');
    const session = uploadSessionRef.current;
    try {
      const updated = await updateVideo(uploadVideoId, {
        title: uploadTitle,
        description: uploadTags,
        visibility: uploadVisibility,
        categories,
        cover: uploadCoverFile,
        publish: true,
      });
      if (session !== uploadSessionRef.current) return;
      uploadPublishRequestedRef.current = true;
      setUploadPublishRequested(true);
      queryClient.setQueryData(['video', 'detail', uploadVideoId], updated);
      if (updated.status !== 'ready') {
        setPublishedProcessingVideos((current) => [
          updated,
          ...current.filter((video) => video.id !== updated.id),
        ]);
        void invalidateVideoData(uploadVideoId);
      }
      if (updated.status === 'ready') {
        await invalidateVideoData(uploadVideoId);
        if (session !== uploadSessionRef.current) return;
        closeUpload();
        notify(t('video.upload.published'), 'success');
      }
    } catch (error) {
      if (session !== uploadSessionRef.current) return;
      uploadPublishRequestedRef.current = false;
      setUploadPublishRequested(false);
      const status = (error as ApiRequestError).response?.status;
      if (status === 413) {
        setUploadError(t('video.upload.coverTooLarge'));
      } else if (status === 415) {
        setUploadError(t('video.upload.coverUnsupported'));
      } else if (status === 401) {
        setUploadError(t('video.authRequired'));
      } else if (status === 404) {
        setUploadError(t('video.upload.draftMissing'));
      } else if (status === 400) {
        setUploadError(t('video.upload.invalidDetails'));
      } else {
        setUploadError(t('video.upload.publishFailed'));
      }
    } finally {
      if (session === uploadSessionRef.current) setUploadBusy(false);
    }
  };

  useEffect(() => {
    const uploaded = uploadStatusQuery.data;
    if (!uploaded || !uploadPublishRequested || !uploadVideoId) return;
    if (uploaded.status === 'ready') {
      if (uploadFinalizingRef.current) return;
      uploadFinalizingRef.current = true;
      void invalidateVideoData(uploadVideoId).then(() => {
        closeUpload();
        notify(t('video.upload.published'), 'success');
      }).catch(() => {
        uploadFinalizingRef.current = false;
      });
      return;
    }
    if (uploaded.status === 'failed') {
      setUploadError(uploaded.processingError || t('video.upload.processingFailed'));
    }
  }, [
    invalidateVideoData,
    uploadPublishRequested,
    uploadStatusQuery.data,
    uploadVideoId,
  ]);

  useEffect(() => {
    const completedIds = publishedProcessingQuery.data?.items
      .filter((video) => (
        publishedProcessingVideos.some((pending) => pending.id === video.id)
        && video.status === 'ready'
      ))
      .map((video) => video.id)
      ?? [];
    if (completedIds.length === 0) return;
    setPublishedProcessingVideos((current) => current.filter((video) => !completedIds.includes(video.id)));
    void Promise.all(completedIds.map((videoId) => invalidateVideoData(videoId)));
  }, [invalidateVideoData, publishedProcessingQuery.data, publishedProcessingVideos]);

  const openUpload = () => {
    if (!currentUser) {
      notify(t('video.authRequired'), 'error');
      return;
    }
    if (uploadStep === 'upload' && !uploadVideoId) setUploadVisibility('public');
    setUploadOpen(true);
  };

  const featured = homeVideos.find((video) => video.status === 'ready') ?? null;
  const currentUserName = currentUser?.name || currentUser?.username || t('video.user');
  const currentUserAvatar = resolveAvatarUrl(currentUser?.avatar)
    || defaultAvatarDataUrl(currentUserName);

  return (
    <main className="video-page">
      {activeView === 'watch' && (
        watchVideo ? (
          <VideoWatch
            video={watchVideo}
            playlist={homeVideos}
            comments={watchComments}
            currentUserAvatar={currentUserAvatar}
            onBack={() => navigateTo('home')}
            onSelect={openVideo}
            onReact={async (kind, active) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(watchVideo.id)) {
                updateMockReaction(watchVideo.id, kind, active);
                return;
              }
              try {
                if (kind === 'like') await updateVideoLike(watchVideo.id, active);
                else await updateVideoFavorite(watchVideo.id, active);
                await invalidateVideoData(watchVideo.id);
              } catch {
                notify(t('video.actionFailed'), 'error');
              }
            }}
            onComment={async (content, target) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(watchVideo.id)) {
                const createdAt = new Date().toISOString();
                const comment: VideoApiComment = {
                  id: `mock-comment-${Date.now()}`,
                  videoId: watchVideo.id,
                  userId: currentUser.id,
                  username: currentUserName,
                  avatar: currentUserAvatar,
                  parentId: target?.rootId ?? null,
                  replyToUserId: target?.userId ?? null,
                  replyToUsername: target?.username ?? null,
                  content,
                  likeCount: 0,
                  liked: false,
                  createdAt,
                  updatedAt: createdAt,
                };
                setMockComments((previous) => [...previous, comment]);
                setMockVideoOverrides((previous) => {
                  const current = previous[watchVideo.id] ?? {};
                  const baseVideo = MOCK_VIDEO_ITEMS.find((video) => video.id === watchVideo.id);
                  return {
                    ...previous,
                    [watchVideo.id]: {
                      ...current,
                      commentCount: (current.commentCount ?? baseVideo?.commentCount ?? 0) + 1,
                    },
                  };
                });
                return;
              }
              try {
                await createVideoComment(watchVideo.id, {
                  content,
                  parentId: target?.rootId,
                  replyToUserId: target?.userId,
                });
                await queryClient.invalidateQueries({ queryKey: ['video', 'comments', watchVideo.id] });
                await queryClient.invalidateQueries({ queryKey: ['video', 'detail', watchVideo.id] });
              } catch {
                notify(t('video.comments.failed'), 'error');
              }
            }}
            onCommentLike={async (comment, active) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(watchVideo.id) && comment.id.startsWith('mock-comment-')) {
                setMockComments((previous) => previous.map((item) => (
                  item.id === comment.id
                    ? {
                      ...item,
                      liked: active,
                      likeCount: Math.max(0, item.likeCount + (active ? 1 : -1)),
                    }
                    : item
                )));
                return;
              }
              try {
                await updateVideoCommentLike(comment.id, active);
                await queryClient.invalidateQueries({ queryKey: ['video', 'comments', watchVideo.id] });
              } catch {
                notify(t('video.actionFailed'), 'error');
              }
            }}
            onViewQualified={trackQualifiedVideoView}
            onDelete={deleteWatchedVideo}
          />
        ) : (
          <div className="video-empty">
            {watchQuery.isError || (isMockVideoId(requestedVideoId) && !mockWatchItem)
              ? t('video.loadFailed')
              : t('video.loading')}
          </div>
        )
      )}

      {activeView !== 'watch' && (
        <>
          <div className="video-page-shell">
            <header className={`video-page-header${activeView === 'library' ? ' is-library' : ''}`}>
              <div>
                <h1>
                  {activeView === 'home' && t('video.home.title')}
                  {activeView === 'library' && t('video.library.title')}
                  {activeView === 'favorites' && (selectedCollection?.title || t('video.library.title'))}
                  {activeView === 'playlist' && t('video.playlist.title')}
                </h1>
                {activeView === 'home' && <p className="video-page-header-subtitle">{t('video.home.subtitle')}</p>}
              </div>
              {activeView === 'library' && (
                <label className="video-search">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    placeholder={t('video.library.search')}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button type="button" className="video-search-clear" aria-label={t('video.library.clear')} onClick={() => setSearch('')}>
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
                  categories={playlistCategories}
                  language={language}
                  allLabel={t('video.categories.all')}
                  ariaLabel={t('video.categories.label')}
                  onChange={(category) => {
                    setActiveCategory(category);
                    const next = new URLSearchParams(searchParams);
                    next.delete('page');
                    setSearchParams(next);
                  }}
                  className="is-playlist"
                />
                <button type="button" className="video-upload-trigger" onClick={openUpload}>
                  <Upload size={17} />
                  <span>{t('video.upload.action')}</span>
                </button>
              </div>
            )}

            {activeView === 'favorites' && (
              <CategoryNav
                active={activeCategory}
                categories={effectiveCategories}
                language={language}
                allLabel={t('video.categories.all')}
                ariaLabel={t('video.categories.label')}
                onChange={setActiveCategory}
                className="is-playlist"
              />
            )}

            {activeView === 'home' && (
              <>
                {featured && (
                  <section className="video-featured" aria-label={t('video.home.featured')}>
                    <button type="button" className="video-featured-media" onClick={() => openVideo(featured)}>
                      <img src={featured.poster} alt="" {...lazyImageProps()} />
                      <span className="video-quality">{featured.resolution}</span>
                      <span className="video-featured-play" aria-hidden="true">
                        <Play size={20} strokeWidth={2} fill="currentColor" />
                      </span>
                    </button>
                    <div className="video-featured-copy">
                      <span className="video-featured-label">{t('video.home.featured')}</span>
                      <h2>{withoutCategoryMarkers(featured.title)}</h2>
                      <p>{withoutCategoryMarkers(featured.description)}</p>
                      <div className="video-featured-author">
                        <img src={featured.avatar} alt="" {...lazyImageProps()} />
                        <div>
                          <strong>{featured.creator}</strong>
                          <span>{featured.views}<i />{featured.duration}</span>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
                <section className="video-section">
                  <div className="video-home-recommendation">{t('video.home.today')}</div>
                  {homeVideos.length > 0 ? (
                    <div className="video-home-grid">
                      {homeVideos.map((video) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={openVideo}
                          onFavorite={toggleFavorite}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="video-empty">
                      {homeQuery.isError ? t('video.loadFailed') : homeQuery.isLoading ? t('video.loading') : t('video.empty')}
                    </div>
                  )}
                  <div ref={loadMoreRef} className="video-load-more-sentinel" aria-hidden="true" />
                  {!useMockData && homeQuery.isFetchingNextPage && (
                    <div className="video-empty">{t('video.loadingMore')}</div>
                  )}
                </section>
              </>
            )}

            {activeView === 'library' && (
              <section className="video-section video-library-section">
                {filteredCollections.length > 0 ? (
                  <div className="video-library-grid">
                    {filteredCollections.map((collection: VideoApiCollection) => (
                      <button
                        type="button"
                        key={collection.id}
                        className="video-collection-card"
                        onClick={() => setSearchParams({ view: 'favorites', collection: collection.id })}
                        style={{ '--collection-art': `url(${collection.coverUrl})` } as CSSProperties}
                      >
                        <span className="video-collection-shine" aria-hidden="true" />
                        <img src={collection.avatar || defaultAvatarDataUrl(collection.username)} alt="" {...lazyImageProps()} />
                        <span className="video-collection-copy">
                          <small>{t('video.library.folder')}</small>
                          <strong>{collection.title}</strong>
                          <span>{collection.username}</span>
                          <em>
                            {t('video.library.videoCount', { count: collection.videoCount })}
                            <i />
                            {t('video.library.playCount', { count: collection.totalViews })}
                          </em>
                        </span>
                        <span className="video-collection-play-button" aria-hidden="true">
                          <Play size={20} strokeWidth={2} fill="currentColor" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="video-empty">
                    {collectionsQuery.isLoading ? t('video.loading') : t('video.library.empty')}
                  </div>
                )}
              </section>
            )}

            {activeView === 'favorites' && (
              <section className="video-section video-favorites-section video-playlist-section">
                <div className="video-collection-toolbar">
                  <button type="button" className="video-icon-button" aria-label={t('video.back')} onClick={() => navigateTo('library')}>
                    <ArrowLeft size={19} />
                  </button>
                  <div>
                    <img
                      src={selectedCollection?.avatar || defaultAvatarDataUrl(selectedCollection?.username || 'User')}
                      alt=""
                      {...lazyImageProps()}
                    />
                    <span>
                      <strong>{selectedCollection?.username}</strong>
                      <small>{t('video.library.playCount', { count: selectedCollection?.totalViews ?? 0 })}</small>
                    </span>
                  </div>
                </div>
                {collectionVideos.length > 0 ? (
                  <div className="video-playlist-grid">
                    {collectionVideos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onPlay={openVideo}
                        onFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="video-empty">
                    {collectionVideosQuery.isLoading ? t('video.loading') : t('video.empty')}
                  </div>
                )}
              </section>
            )}

            {activeView === 'playlist' && (
              <section className="video-section video-playlist-section">
                {playlistVideos.length > 0 ? (
                  <div className="video-playlist-grid">
                    {playlistVideos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onPlay={openVideo}
                        onFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="video-empty">
                    {playlistQuery.isLoading ? t('video.loading') : t('video.empty')}
                  </div>
                )}
                <nav className="video-pagination" aria-label={t('video.playlist.pagination')}>
                  <span className="video-pagination-status">{t('video.playlist.page', { page: playlistPage })}</span>
                  <div className="video-pagination-actions">
                    <button type="button" disabled={playlistPage === 1} onClick={() => void changePlaylistPage(playlistPage - 1)}>
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      disabled={
                        useMockData
                          ? playlistPage >= mockPlaylistPageCount
                          : playlistPage === (playlistQuery.data?.pages.length ?? 1)
                            && !playlistQuery.hasNextPage
                      }
                      onClick={() => void changePlaylistPage(playlistPage + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </nav>
              </section>
            )}
          </div>

          <nav className="video-dock" aria-label={t('video.navigation')}>
            {([
              { view: 'home' as const, label: t('video.nav.home'), icon: Home },
              { view: 'library' as const, label: t('video.nav.library'), icon: Library },
              { view: 'playlist' as const, label: t('video.nav.playlist'), icon: ListVideo },
            ]).map(({ view, label, icon: Icon }) => (
              <button
                type="button"
                key={view}
                className={activeView === view || (view === 'library' && activeView === 'favorites') ? 'is-active' : ''}
                onClick={() => navigateTo(view)}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {uploadOpen && (
            <UploadDialog
              step={uploadStep}
              progress={uploadProgress}
              processingProgress={uploadStatusQuery.data?.processingProgress ?? 0}
              videoName={uploadVideoName}
              coverUrl={uploadCoverUrl || generatedUploadCoverUrl}
              title={uploadTitle}
              tags={uploadTags}
              visibility={uploadVisibility}
              duration={uploadDuration}
              error={uploadError}
              busy={uploadBusy}
              publishRequested={uploadPublishRequested}
              processingFailed={uploadStatusQuery.data?.status === 'failed'}
              videoInputRef={videoInputRef}
              coverInputRef={coverInputRef}
              onClose={closeUpload}
              onVideo={(file) => void selectUploadVideo(file)}
              onCover={(file) => void selectUploadCover(file)}
              onTitle={setUploadTitle}
              onTags={setUploadTags}
              onVisibility={setUploadVisibility}
              onPublish={() => void publishUpload()}
            />
          )}
        </>
      )}
    </main>
  );
}
