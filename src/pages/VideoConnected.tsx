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
import { useDispatch, useSelector } from 'react-redux';
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
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  Film,
  FolderPlus,
  ListFilter,
  LockKeyhole,
  Globe2,
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
  RefreshCw,
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
import ProUpgradeDialog from '@/components/ProUpgradeDialog';
import {
  createVideoComment,
  createVideoCollection,
  deleteVideo,
  getVideo,
  getVideoBanner,
  getVideoCategories,
  getVideoCollections,
  getVideoComments,
  getVideos,
  updateVideo,
  updateVideoCommentLike,
  updateVideoFavorite,
  updateVideoLike,
  uploadVideo,
  videoStatusWebSocketUrl,
  viewVideo,
} from '@/api/video';
import type {
  VideoApiCollection,
  VideoApiComment,
  VideoApiItem,
  VideoBannerItem,
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
import { rememberVideoReturnTo } from '@/lib/videoNavigation';
import { setVideoDetails, setVideoViewCount } from '@/store/videoViewSlice';
import type { AppDispatch, RootState } from '@/store/store';
import '@/styles/video.scss';
import '@/styles/video_ipad.scss';

type VideoView = 'home' | 'library' | 'favorites' | 'playlist' | 'watch';
type UploadStep = 'upload' | 'publish';
type Cursor = { createdAt: string; id: string } | null;
type VideoUploadProgress = {
  percent: number;
  loaded: number;
  total: number;
  bytesPerSecond: number;
  remainingSeconds: number;
};
type VideoProcessingProgress = {
  percentPerSecond: number;
  remainingSeconds: number;
};

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
  | 'liked'
  | 'favorited'
  | 'likeCount'
  | 'favoriteCount'
  | 'viewCount'
  | 'commentCount'
  | 'title'
  | 'description'
  | 'visibility'
  | 'coverUrl'
>>;

type ApiRequestError = {
  response?: {
    status?: number;
  };
};

const VALID_VIEWS = new Set<VideoView>(['home', 'library', 'favorites', 'playlist', 'watch']);
const UPLOAD_DRAFT_KEY = 'lume-video-upload-draft-v2';
const VIDEO_RECORD_EXISTS_KEY = 'lume-video-record-exists-v1';
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

function VideoLoadingSpinner({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`video-list-loading-spinner${compact ? ' is-compact' : ''}`}
      role="status"
      aria-label={label}
    />
  );
}

function playMedia(
  media: HTMLMediaElement,
  onRejected?: (error: unknown) => void,
) {
  void media.play().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    onRejected?.(error);
  });
}

function formatVideoCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');
  const datePart = date.getFullYear() === new Date().getFullYear()
    ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resolutionFor(video: VideoApiItem): CardVideo['resolution'] {
  if ((video.width ?? 0) >= 3840 || (video.height ?? 0) >= 2160) return '4K';
  if ((video.width ?? 0) >= 2048 || (video.height ?? 0) >= 1440) return '2K';
  return '1080p';
}

function formatUploadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 100) return `${Math.round(megabytes)} MB`;
  if (megabytes >= 10) return `${megabytes.toFixed(1)} MB`;
  return `${megabytes.toFixed(2)} MB`;
}

function formatUploadSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 'Calculating speed';
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

function formatRemainingTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Calculating remaining time';
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s remaining`
    : `${minutes}m remaining`;
}

function formatProcessingSpeed(percentPerSecond: number, calculatingLabel = 'Calculating speed') {
  if (!Number.isFinite(percentPerSecond) || percentPerSecond <= 0) return calculatingLabel;
  return `${percentPerSecond.toFixed(1)}%/s`;
}

function firstCategory(video: VideoApiItem, language: string) {
  const category = video.categories?.[0];
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

function withoutHashCharacters(value: string) {
  return value.replace(/#/g, '').trim();
}

function versionedVideoPoster(video: VideoApiItem) {
  // Both the generated poster.webp and an uploaded cover.webp are returned
  // before processing finishes. Keep the image visible while the card is
  // still processing instead of replacing it with an empty placeholder.
  if (!video.coverUrl) return '';
  if (video.status === 'uploading' || video.status === 'processing') {
    const separator = video.coverUrl.includes('?') ? '&' : '?';
    const revision = video.updatedAt || video.status;
    return `${video.coverUrl}${separator}poster_refresh=${encodeURIComponent(revision)}`;
  }
  return video.coverUrl;
}

function isUploadedVideoCover(url: string) {
  return /\/cover\.webp(?:[?#]|$)/i.test(url);
}

function toCardVideo(
  video: VideoApiItem,
  language: string,
  videoOverrides: Record<string, Partial<VideoApiItem>> = {},
  creatorFallback = '',
): CardVideo {
  const effectiveVideo = {
    ...video,
    ...videoOverrides[video.id],
  };
  const creator = effectiveVideo.username || creatorFallback;
  const category = firstCategory(effectiveVideo, language);
  const viewCount = effectiveVideo.viewCount;
  const formatter = new Intl.NumberFormat(language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return {
    id: effectiveVideo.id,
    title: effectiveVideo.title || (language.startsWith('zh') ? '未命名视频' : 'Untitled video'),
    description: effectiveVideo.description,
    creator: creator || (language.startsWith('zh') ? '用户' : 'User'),
    avatar: effectiveVideo.avatar || defaultAvatarDataUrl(creator || 'User'),
    views: `${formatter.format(viewCount)} ${language.startsWith('zh') ? '次播放' : 'views'}`,
    viewCount,
    likeCount: effectiveVideo.likeCount,
    favoriteCount: effectiveVideo.favoriteCount,
    commentCount: effectiveVideo.commentCount,
    duration: formatDuration(effectiveVideo.duration),
    resolution: resolutionFor(effectiveVideo),
    category: category.name,
    categorySlug: category.slug,
    poster: versionedVideoPoster(effectiveVideo),
    src: effectiveVideo.status === 'ready' ? effectiveVideo.hlsMasterUrl : '',
    status: effectiveVideo.status,
    processingProgress: effectiveVideo.processingProgress,
    processingError: effectiveVideo.processingError,
    liked: effectiveVideo.liked,
    favorited: effectiveVideo.favorited,
    createdAt: effectiveVideo.createdAt,
    raw: effectiveVideo,
  };
}

function toFeaturedCard(video: VideoBannerItem): CardVideo {
  const formatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    creator: video.username,
    avatar: video.avatar,
    views: `${formatter.format(video.viewCount)} views`,
    viewCount: video.viewCount,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    duration: formatDuration(video.duration),
    resolution: resolutionFor(video as VideoApiItem),
    category: '',
    categorySlug: '',
    poster: video.coverUrl,
    src: '',
    status: 'ready',
    processingProgress: 0,
    processingError: null,
    liked: false,
    favorited: false,
    createdAt: '',
    raw: video as unknown as VideoApiItem,
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
  };
}

function VideoQueuePoster({ src }: { src: string }) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(!src);
  const imageSource = src
    ? `${src}${src.includes('?') ? '&' : '?'}queue_retry=${retry}`
    : '';

  useEffect(() => {
    setRetry(0);
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <span className="video-watch-queue-poster-placeholder" aria-hidden="true">
        <Film size={18} />
      </span>
    );
  }

  return (
    <img
      src={imageSource}
      alt=""
      loading="eager"
      decoding="async"
      onError={() => {
        if (retry < 2) {
          window.setTimeout(() => setRetry((value) => value + 1), 500);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function preloadImage(src: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      void image.decode()
        .catch(() => undefined)
        .finally(() => resolve(true));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

const preparedVideoOrigins = new Set<string>();

function prepareVideoOrigin(src: string) {
  if (!src) return;
  try {
    const origin = new URL(src, window.location.href).origin;
    if (origin === window.location.origin || preparedVideoOrigins.has(origin)) return;
    preparedVideoOrigins.add(origin);

    for (const rel of ['dns-prefetch', 'preconnect']) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    // Invalid media URLs are handled by the player.
  }
}

function CategoryNav({
  active,
  categories,
  language,
  allLabel,
  ariaLabel,
  onChange,
  className = '',
  includeAll = true,
}: {
  active: string;
  categories: VideoCategory[];
  language: string;
  allLabel: string;
  ariaLabel: string;
  onChange: (category: string) => void;
  className?: string;
  includeAll?: boolean;
}) {
  const options = [
    ...(includeAll ? [{ slug: 'all', label: allLabel }] : []),
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
  onPrepare,
  onFavorite,
  priority = false,
  variant = 'playlist',
}: {
  video: CardVideo;
  onPlay: (video: CardVideo) => void;
  onPrepare?: (video: CardVideo) => void;
  onFavorite: (video: CardVideo) => void;
  priority?: boolean;
  variant?: 'playlist' | 'default';
}) {
  const isProcessing = video.status === 'uploading' || video.status === 'processing';
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterRetry, setPosterRetry] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const posterSource = video.poster
    ? `${video.poster}${video.poster.includes('?') ? '&' : '?'}retry=${posterRetry}`
    : '';
  useEffect(() => {
    setPosterRetry(0);
    setPosterFailed(false);
    setPosterLoaded(false);
  }, [video.id, video.poster]);
  const posterRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setPosterLoaded(true);
  }, []);
  return (
    <article
      className={`video-tile is-${variant}${isProcessing ? ' is-processing' : ''}${video.status === 'failed' ? ' is-failed' : ''}`}
    >
      <button
        type="button"
        className="video-tile-hit"
        onPointerEnter={() => onPrepare?.(video)}
        onPointerDown={() => onPrepare?.(video)}
        onFocus={() => onPrepare?.(video)}
        onClick={() => onPlay(video)}
      >
        {video.poster && !posterFailed && (
          <img
            ref={posterRef}
            src={posterSource}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'low'}
            className={posterLoaded ? 'is-loaded' : undefined}
            onLoad={() => setPosterLoaded(true)}
            onError={() => {
              if (posterRetry < 2) {
                window.setTimeout(() => setPosterRetry((value) => value + 1), 1000);
              } else {
                setPosterFailed(true);
              }
            }}
          />
        )}
        {(!video.poster || posterFailed) && (
          <span className="video-tile-poster-placeholder" aria-hidden="true">
            <Film size={24} />
          </span>
        )}
        <span className="video-quality">{video.resolution}</span>
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

const ProcessingVideoCard = memo(function ProcessingVideoCard({
  video,
  onPlay,
}: {
  video: CardVideo;
  onPlay: (video: CardVideo) => void;
}) {
  return (
    <VideoCard
      video={video}
      onPlay={onPlay}
      onFavorite={() => undefined}
      priority
    />
  );
});

function UploadDialog({
  step,
  progress,
  uploadDetails,
  processingProgress,
  processingDetails,
  videoName,
  coverUrl,
  hasCustomCover,
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
  uploadDetails: VideoUploadProgress;
  processingProgress: number;
  processingDetails: VideoProcessingProgress;
  videoName: string;
  coverUrl: string;
  hasCustomCover: boolean;
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
  const [coverImageError, setCoverImageError] = useState(false);
  const isTransferring = step === 'publish' && progress < 100;
  const isProcessingCoverPending = step === 'publish'
    && progress >= 100
    && !processingFailed
    && !hasCustomCover
    && !coverUrl;

  useEffect(() => {
    setCoverImageError(false);
  }, [coverUrl, processingProgress, processingFailed]);

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
            {progress < 100 && (
              <div className="video-upload-progress-meta">
                <span>{formatUploadBytes(uploadDetails.loaded)} / {formatUploadBytes(uploadDetails.total)}</span>
                <span>{formatUploadSpeed(uploadDetails.bytesPerSecond)}</span>
                <span>{uploadDetails.bytesPerSecond > 0
                  ? formatRemainingTime(uploadDetails.remainingSeconds)
                  : 'Calculating remaining time'}</span>
              </div>
            )}
            {progress >= 100 && processingProgress < 100 && !processingFailed && (
              <div className="video-upload-progress-meta">
                <span>{t('video.upload.processingSpeed', {
                  speed: formatProcessingSpeed(
                    processingDetails.percentPerSecond,
                    t('video.upload.calculatingSpeed'),
                  ),
                })}</span>
                <span>{processingDetails.percentPerSecond > 0
                  ? formatRemainingTime(processingDetails.remainingSeconds)
                  : t('video.upload.calculatingRemainingTime')}</span>
              </div>
            )}
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
                className={`video-upload-cover-field${isProcessingCoverPending ? ' is-processing-placeholder' : coverUrl ? ' has-preview' : ' is-empty'}`}
                role="button"
                tabIndex={0}
                aria-label={t('video.upload.chooseCover')}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) coverInputRef.current?.click();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!busy) coverInputRef.current?.click();
                  }
                }}
              >
                {isProcessingCoverPending ? (
                  <span className="video-upload-cover-processing" aria-hidden="true">
                    <Camera size={58} strokeWidth={1.55} />
                  </span>
                ) : coverUrl && !coverImageError ? (
                  <>
                    <img
                      src={coverUrl}
                      alt=""
                      onError={() => setCoverImageError(true)}
                    />
                    <span className="video-upload-cover-shade" aria-hidden="true">
                      <ImagePlus size={20} />
                    </span>
                  </>
                ) : (
                  <span className="video-upload-cover-empty">
                    <Camera size={64} strokeWidth={1.45} aria-hidden="true" />
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

type VideoSettingsPanel = 'detail' | 'delete';

function VideoSettingsDialog({
  video,
  panel,
  isDeleting,
  deleteError,
  onPanelChange,
  onClose,
  onDelete,
  onUpdate,
}: {
  video: CardVideo;
  panel: VideoSettingsPanel;
  isDeleting: boolean;
  deleteError: string;
  onPanelChange: (panel: VideoSettingsPanel) => void;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onUpdate: (input: {
    title: string;
    description: string;
    visibility: VideoVisibility;
    categories: string[];
    cover: File | null;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(video.raw.title || '');
  const [tags, setTags] = useState(video.raw.description || '');
  const [visibility, setVisibility] = useState<VideoVisibility>(video.raw.visibility || 'public');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(video.raw.coverUrl || video.poster);
  const [coverError, setCoverError] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setTitle(video.raw.title || '');
    setTags(video.raw.description || '');
    setVisibility(video.raw.visibility || 'public');
    setCoverFile(null);
    setCoverPreview(video.raw.coverUrl || video.poster);
    setCoverError(false);
    setError('');
    setSaved(false);
  }, [video.id, video.raw.coverUrl, video.raw.description, video.raw.title, video.raw.visibility, video.poster]);

  useEffect(() => () => {
    if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current);
  }, []);

  const chooseCover = (file: File | null) => {
    if (!file) return;
    if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    coverObjectUrlRef.current = objectUrl;
    setCoverFile(file);
    setCoverPreview(objectUrl);
    setCoverError(false);
    setSaved(false);
  };

  const submitUpdate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('video.settings.titleRequired'));
      return;
    }
    const categories = tags
      .match(/#[\p{L}\p{N}-]+/gu)
      ?.map((tag) => tag.slice(1).toLowerCase())
      ?? [];
    if (categories.length === 0) {
      setError(t('video.settings.categoryRequired'));
      return;
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await onUpdate({
        title: trimmedTitle,
        description: tags.trim(),
        visibility,
        categories,
        cover: coverFile,
      });
      setSaved(true);
      setCoverFile(null);
      onClose();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('video.settings.updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="video-settings-overlay" role="presentation">
      <button
        type="button"
        className="video-settings-backdrop"
        aria-label={t('video.settings.close')}
        onClick={() => {
          if (!busy && !isDeleting) onClose();
        }}
      />
      <div
        className={`video-settings-dialog is-${panel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-settings-title"
      >
        <button
          type="button"
          className="video-settings-close"
          aria-label={t('video.settings.close')}
          disabled={busy || isDeleting}
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <aside className="video-settings-sidebar">
          <p className="video-settings-eyebrow">{t('video.settings.title')}</p>
          <h2 id="video-settings-title">{video.title}</h2>
          <nav aria-label={t('video.settings.navigation')}>
            <button
              type="button"
              className={panel === 'detail' ? 'is-active' : ''}
              aria-current={panel === 'detail' ? 'page' : undefined}
              onClick={() => onPanelChange('detail')}
            >
              <Settings2 size={17} />
              {t('video.settings.detail')}
            </button>
            <button
              type="button"
              className={panel === 'delete' ? 'is-active is-danger' : 'is-danger'}
              aria-current={panel === 'delete' ? 'page' : undefined}
              onClick={() => {
                setError('');
                onPanelChange('delete');
              }}
            >
              <X size={17} />
              {t('video.settings.delete')}
            </button>
          </nav>
        </aside>
        <div className="video-settings-content">
          {panel === 'detail' ? (
            <div className="video-settings-detail">
              <div className="video-settings-heading">
                <span className="video-settings-status-icon"><Settings2 size={20} /></span>
                <div>
                  <p className="video-settings-eyebrow">{t('video.settings.detail')}</p>
                  <h3>{t('video.settings.detailTitle')}</h3>
                </div>
              </div>
              <div className="video-settings-form">
                <div
                  className={`video-upload-cover-field${coverPreview && !coverError ? ' has-preview' : ' is-empty'}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t('video.settings.cover')}
                  onClick={() => {
                    if (!busy) coverInputRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!busy) coverInputRef.current?.click();
                    }
                  }}
                >
                  {coverPreview && !coverError ? (
                    <>
                      <img src={coverPreview} alt="" onError={() => setCoverError(true)} />
                      <span className="video-upload-cover-shade" aria-hidden="true">
                        <ImagePlus size={20} />
                      </span>
                    </>
                  ) : (
                    <span className="video-upload-cover-empty">
                      <Camera size={64} strokeWidth={1.45} aria-hidden="true" />
                    </span>
                  )}
                  <input
                    ref={coverInputRef}
                    className="video-upload-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => chooseCover(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="video-upload-fields">
                  <label>
                    <span>{t('video.upload.videoTitle')}</span>
                    <input value={title} maxLength={255} disabled={busy} onChange={(event) => {
                      setTitle(event.target.value);
                      setSaved(false);
                    }} />
                  </label>
                  <label>
                    <span>{t('video.upload.categories')}</span>
                    <input value={tags} placeholder="#travel #nature" disabled={busy} onChange={(event) => {
                      setTags(event.target.value);
                      setSaved(false);
                    }} />
                    <small>{t('video.upload.categoryHint')}</small>
                  </label>
                  <div className="video-settings-visibility">
                    <span>{t('video.upload.visibility')}</span>
                    <div className={`video-upload-visibility is-${visibility}`}>
                      {(['public', 'private'] as VideoVisibility[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={visibility === option ? 'is-active' : ''}
                          aria-pressed={visibility === option}
                          disabled={busy}
                          onClick={() => {
                            setVisibility(option);
                            setSaved(false);
                          }}
                        >
                          {t(`video.upload.${option}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {error && <p className="video-upload-error" role="alert">{error}</p>}
              {saved && <p className="video-settings-saved" role="status">{t('video.settings.updated')}</p>}
              <button type="button" className="video-upload-publish video-settings-update" disabled={busy} onClick={() => void submitUpdate()}>
                {busy && <LoaderCircle size={17} className="is-spinning" />}
                {busy ? t('video.settings.updating') : t('video.settings.update')}
              </button>
            </div>
          ) : (
            <div className="video-settings-delete">
              <div className="video-delete-icon" aria-hidden="true"><X size={25} /></div>
              <p className="video-settings-eyebrow is-danger">{t('video.settings.delete')}</p>
              <h3>{t('video.deleteTitle')}</h3>
              <p>{t('video.deleteDescription')}</p>
              {deleteError && <p className="video-delete-error">{deleteError}</p>}
              <div className="video-delete-actions">
                <button type="button" className="video-delete-cancel" disabled={isDeleting} onClick={() => onPanelChange('detail')}>
                  {t('video.deleteCancel')}
                </button>
                <button type="button" className="video-delete-confirm" disabled={isDeleting} onClick={() => void onDelete()}>
                  {isDeleting && <LoaderCircle size={17} className="is-spinning" />}
                  {isDeleting ? t('video.deleting') : t('video.deleteConfirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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
  onUpdate,
  canEdit,
  onEditDenied,
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
  onUpdate: (videoId: string, input: {
    title: string;
    description: string;
    visibility: VideoVisibility;
    categories: string[];
    cover: File | null;
  }) => Promise<void>;
  canEdit: boolean;
  onEditDenied: () => void;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
  const [loopMenuOpen, setLoopMenuOpen] = useState(false);
  const [singleLoop, setSingleLoop] = useState(false);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [viewIncrementVisible, setViewIncrementVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<VideoSettingsPanel>('detail');
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
    setDraft('');
    setReplyTarget(null);
    setViewIncrementVisible(false);
    setSingleLoop(false);
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
    if (!media) return;

    const handleEnded = () => {
      if (singleLoop) {
        media.currentTime = 0;
        playMedia(media, () => setIsPlaying(false));
        return;
      }

      // Playlist responses may omit the playable URL; the detail query loads it after selection.
      const playableVideos = playlist.filter((item) => item.status === 'ready');
      if (!playableVideos.length) return;

      const currentIndex = playableVideos.findIndex((item) => item.id === video.id);
      const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % playableVideos.length
        : 0;
      const nextVideo = playableVideos[nextIndex];

      if (nextVideo.id === video.id) {
        media.currentTime = 0;
        playMedia(media, () => setIsPlaying(false));
      } else {
        onSelect(nextVideo);
      }
    };

    media.addEventListener('ended', handleEnded);
    return () => media.removeEventListener('ended', handleEnded);
  }, [media, onSelect, playlist, singleLoop, video.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      event.preventDefault();
      revealControls();
      if (!media) return;
      if (media.paused || media.ended) {
        playMedia(media, () => setIsPlaying(false));
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
    if (media.paused) playMedia(media, () => setIsPlaying(false));
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
            {video.status === 'ready' && (video.raw.originFileUrl || video.src) ? (
              <HlsVideo
                key={video.id}
                src={video.raw.originFileUrl || video.src}
                fallbackSrc={video.raw.originFileUrl ? video.src : undefined}
                poster={video.poster}
                playbackId={video.id}
                active
                autoPlay
                controls={false}
                toggleOnSurfaceClick
                onVideoElement={setMedia}
                errorLabel={t('video.player.error')}
                loadingLabel={t('video.player.loading')}
                onViewQualified={() => {
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
                {video.status === 'failed' ? (
                  <span className="video-processing-message">{t('video.player.failed')}</span>
                ) : (
                  <span
                    className="video-processing-spinner"
                    role="status"
                    aria-label={t('video.player.processing', { progress: video.processingProgress })}
                  />
                )}
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
                  <div
                    className={`video-watch-settings${loopMenuOpen ? ' is-open' : ''}`}
                    onPointerEnter={() => setLoopMenuOpen(true)}
                    onPointerLeave={() => setLoopMenuOpen(false)}
                    onFocus={() => setLoopMenuOpen(true)}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setLoopMenuOpen(false);
                    }}
                  >
                    <button type="button" aria-label={t('video.player.settings')}><Settings2 size={18} /></button>
                    <div className="video-watch-loop-menu">
                      <button
                        type="button"
                        className={singleLoop ? 'is-active' : ''}
                        aria-label={singleLoop ? t('video.player.singleLoopOn') : t('video.player.singleLoopOff')}
                        aria-pressed={singleLoop}
                        title={singleLoop ? t('video.player.singleLoopOn') : t('video.player.singleLoopOff')}
                        onClick={() => setSingleLoop((enabled) => !enabled)}
                      >
                        <span className="video-watch-loop-icon" aria-hidden="true">
                          <RefreshCw size={18} strokeWidth={1.9} />
                          {singleLoop && <span className="video-watch-loop-icon-number">1</span>}
                        </span>
                      </button>
                    </div>
                  </div>
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
                    if (!canEdit) {
                      onEditDenied();
                      return;
                    }
                    setDeleteError('');
                    setSettingsPanel('detail');
                    setIsSettingsOpen(true);
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
                    <header><strong>{comment.username}</strong><time>{formatVideoCommentTime(comment.createdAt)}</time></header>
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
                              <header><strong>{reply.username}</strong><time>{formatVideoCommentTime(reply.createdAt)}</time></header>
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
            <div><span>{t('video.queue.label')}</span></div>
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
                  <VideoQueuePoster src={item.poster} />
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
      {isSettingsOpen && (
        <VideoSettingsDialog
          video={video}
          panel={settingsPanel}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onPanelChange={setSettingsPanel}
          onClose={() => {
            if (!isDeleting) setIsSettingsOpen(false);
          }}
          onDelete={confirmDeleteVideo}
          onUpdate={(input) => onUpdate(video.id, input)}
        />
      )}
    </div>
  );
}

export default function VideoConnected() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const queryClient = useQueryClient();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const videoOverrides = useSelector((state: RootState) => state.videoViews.byVideoId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view') as VideoView | null;
  const activeView = requestedView && VALID_VIEWS.has(requestedView) ? requestedView : 'home';
  const requestedVideoId = searchParams.get('video');
  const selectedCollectionId = searchParams.get('collection');
  const watchFromPlaylist = activeView === 'watch' && searchParams.get('from') === 'playlist';
  const watchFromFavorites = activeView === 'watch' && searchParams.get('from') === 'favorites';
  const playlistPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const urlPlaylistCategory = activeView === 'playlist'
    ? searchParams.get('category') || 'all'
    : 'all';
  const [activeCategory, setActiveCategory] = useState(
    () => searchParams.get('category') || 'all',
  );
  const [featuredVideoId, setFeaturedVideoId] = useState<string | null>(null);
  const [previousFeaturedVideoId, setPreviousFeaturedVideoId] = useState<string | null>(null);
  const playlistFilterCategory = watchFromPlaylist
    ? searchParams.get('category') || activeCategory
    : activeCategory;
  const [search, setSearch] = useState('');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const collectionLoadMoreRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>('upload');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetails, setUploadDetails] = useState<VideoUploadProgress>({
    percent: 0,
    loaded: 0,
    total: 0,
    bytesPerSecond: 0,
    remainingSeconds: 0,
  });
  const [processingDetails, setProcessingDetails] = useState<VideoProcessingProgress>({
    percentPerSecond: 0,
    remainingSeconds: 0,
  });
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
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<VideoVisibility>('public');
  const [collectionCategory, setCollectionCategory] = useState('all');
  const [collectionIncludeFavorites, setCollectionIncludeFavorites] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [isVideoProUpgradeOpen, setIsVideoProUpgradeOpen] = useState(false);
  const [publishedProcessingVideos, setPublishedProcessingVideos] = useState<VideoApiItem[]>([]);
  const [hasVideoRecord, setHasVideoRecord] = useState(() => {
    try {
      return window.localStorage.getItem(VIDEO_RECORD_EXISTS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mockVideoOverrides, setMockVideoOverrides] = useState<Record<string, MockVideoOverride>>({});
  // Keep the first viewport on the eager image path immediately after data arrives.
  const [homeVisibleCardCount, setHomeVisibleCardCount] = useState(8);
  const [mockComments, setMockComments] = useState<VideoApiComment[]>(MOCK_VIDEO_COMMENTS);
  const uploadHydratedRef = useRef(false);
  const uploadCoverObjectUrlRef = useRef<string | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const activeUploadFileRef = useRef<string | null>(null);
  const uploadProgressLoadedRef = useRef(0);
  const uploadSessionRef = useRef(0);
  const draftTitleSaveVersionRef = useRef(0);
  const draftTitleSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadPublishRequestedRef = useRef(false);
  const uploadFinalizingRef = useRef(false);
  const publishedUploadIdsRef = useRef(new Set<string>());
  const processingMeasurementRef = useRef<{
    videoId: string | null;
    progress: number;
    timestamp: number;
    rate: number;
  }>({
    videoId: null,
    progress: 0,
    timestamp: 0,
    rate: 0,
  });
  const publishedVideoPollingRef = useRef<number | null>(null);
  const featuredVideoIdRef = useRef<string | null>(null);
  const featuredPreloadedPostersRef = useRef(new Set<string>());
  const featuredTransitionInFlightRef = useRef(false);

  useEffect(() => {
    const query = searchParams.toString();
    rememberVideoReturnTo(`/video${query ? `?${query}` : ''}`);
  }, [searchParams]);

  useEffect(() => () => {
    uploadAbortControllerRef.current?.abort();
    if (publishedVideoPollingRef.current !== null) {
      window.clearInterval(publishedVideoPollingRef.current);
    }
    if (uploadCoverObjectUrlRef.current) URL.revokeObjectURL(uploadCoverObjectUrlRef.current);
  }, []);

  const categoriesQuery = useQuery({
    queryKey: ['video', 'categories'],
    queryFn: () => getVideoCategories(),
    enabled: activeView === 'playlist'
      || activeView === 'favorites'
      || collectionDialogOpen,
    staleTime: 60_000,
  });
  const playlistCategoriesQuery = useQuery({
    queryKey: ['video', 'categories', 'playlist', currentUser?.id ?? 'public'],
    queryFn: () => getVideoCategories({ scope: 'mine' }),
    enabled: Boolean(currentUser) && (activeView === 'playlist' || collectionDialogOpen),
    staleTime: 60_000,
  });
  const collectionsQuery = useQuery({
    queryKey: ['video', 'collections'],
    queryFn: () => getVideoCollections(),
    enabled: activeView === 'library'
      || activeView === 'favorites'
      || watchFromFavorites,
  });
  const homeQuery = useInfiniteQuery({
    queryKey: ['video', 'home'],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, { limit: 8, scope: 'public' }),
    getNextPageParam: nextCursor,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(800 * (attempt + 1), 2_000),
    enabled: activeView === 'home' || (activeView === 'watch' && !watchFromPlaylist),
  });
  const bannerQuery = useQuery({
    queryKey: ['video', 'banner'],
    queryFn: getVideoBanner,
    enabled: activeView === 'home',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const playlistQuery = useInfiniteQuery({
    queryKey: ['video', 'playlist', playlistFilterCategory, currentUser?.id ?? 'public'],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, {
      limit: 8,
      scope: 'mine',
      sort: 'oldest',
      ...(playlistFilterCategory !== 'all' ? { category: playlistFilterCategory } : {}),
    }),
    getNextPageParam: nextCursor,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (
      query.state.data?.pages
        .flatMap((page) => page.items)
        .some((video) => video.status === 'uploading' || video.status === 'processing')
        ? 1200
        : false
    ),
    enabled: (activeView === 'playlist' || watchFromPlaylist) && Boolean(currentUser),
  });
  const collectionVideosQuery = useInfiniteQuery({
    queryKey: ['video', 'collection', selectedCollectionId, activeCategory],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, {
      limit: 20,
      collection_id: selectedCollectionId,
      scope: 'collection',
      ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
    }),
    getNextPageParam: nextCursor,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
    // The clicked card already contains the playable URL. Use it immediately
    // and refresh the full detail only when the cache is stale.
    staleTime: 60_000,
    refetchOnMount: 'always',
    refetchInterval: (query) => (
      query.state.data?.status === 'ready' || query.state.data?.status === 'failed'
        ? false
        : 800
    ),
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
    refetchOnMount: 'always',
    refetchInterval: (query) => (
      query.state.data?.status === 'ready' || query.state.data?.status === 'failed'
        ? false
        : 1200
    ),
  });
  useEffect(() => {
    const videoId = uploadVideoId;
    const progress = Math.max(0, Math.min(100, uploadStatusQuery.data?.processingProgress ?? 0));
    const now = Date.now();
    const previous = processingMeasurementRef.current;

    if (!videoId || !uploadPublishRequested || videoId !== previous.videoId || progress < previous.progress) {
      processingMeasurementRef.current = {
        videoId,
        progress,
        timestamp: now,
        rate: 0,
      };
      setProcessingDetails({ percentPerSecond: 0, remainingSeconds: 0 });
      return;
    }

    const elapsedSeconds = (now - previous.timestamp) / 1000;
    if (elapsedSeconds <= 0) return;

    if (progress > previous.progress) {
      const instantRate = (progress - previous.progress) / elapsedSeconds;
      const rate = previous.rate > 0
        ? previous.rate * 0.65 + instantRate * 0.35
        : instantRate;
      processingMeasurementRef.current = {
        videoId,
        progress,
        timestamp: now,
        rate,
      };
      setProcessingDetails({
        percentPerSecond: rate,
        remainingSeconds: rate > 0 ? (100 - progress) / rate : 0,
      });
    } else if (now - previous.timestamp > 5000) {
      setProcessingDetails({ percentPerSecond: 0, remainingSeconds: 0 });
    }
  }, [
    uploadStatusQuery.data?.processingProgress,
    uploadVideoId,
    uploadPublishRequested,
  ]);
  const generatedUploadCoverUrl = useMemo(() => {
    const uploadedVideo = uploadStatusQuery.data;
    if (
      uploadCoverUrl
      || !uploadedVideo
      || !['processing', 'ready'].includes(uploadedVideo.status)
      || !uploadedVideo.coverUrl
    ) return '';
    const coverUrl = uploadedVideo.coverUrl;
    const separator = coverUrl.includes('?') ? '&' : '?';
    const revision = [
      uploadedVideo.updatedAt,
      uploadedVideo.status,
      uploadedVideo.processingProgress,
    ].filter(Boolean).join('-');
    return `${coverUrl}${separator}preview=${encodeURIComponent(revision)}`;
  }, [uploadCoverUrl, uploadStatusQuery.data]);
  const homeSourceItems = useMemo(
    () => homeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [homeQuery.data],
  );
  const realHomeItems = useMemo(
    () => homeSourceItems,
    [homeSourceItems],
  );
  const useMockData = homeQuery.isSuccess
    && homeSourceItems.length === 0
    && !hasVideoRecord;
  const watchPlaylistQuery = useInfiniteQuery({
    queryKey: ['video', 'watch-playlist', playlistFilterCategory, currentUser?.id ?? 'public'],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => pageQuery(pageParam, {
      limit: 50,
      scope: 'mine',
      sort: 'oldest',
      ...(playlistFilterCategory !== 'all' ? { category: playlistFilterCategory } : {}),
    }),
    getNextPageParam: nextCursor,
    enabled: watchFromPlaylist && Boolean(currentUser) && !useMockData,
  });
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
  const collectionCategories = useMockData ? MOCK_VIDEO_CATEGORIES : playlistCategories;
  const hasVideoLibraryAccess = Boolean(
    currentUser
    && currentUser.plan?.trim().toLowerCase() === 'pro'
    && currentUser.subscription_status?.trim().toLowerCase() === 'active'
    && (!currentUser.subscription_end_at || Date.parse(currentUser.subscription_end_at) > Date.now()),
  );
  const effectiveCollections = collectionsQuery.data && collectionsQuery.data.length > 0
    ? collectionsQuery.data
    : useMockData
      ? MOCK_VIDEO_COLLECTIONS
      : collectionsQuery.data ?? [];
  const processingVideos = useMemo(
    () => publishedProcessingVideos
      .filter((video) => video.status === 'uploading' || video.status === 'processing'),
    [publishedProcessingVideos],
  );
  const homeVideos = useMemo(
    () => (useMockData ? effectiveMockItems : realHomeItems)
      .map((video) => toCardVideo(video, language, videoOverrides)),
    [effectiveMockItems, language, realHomeItems, useMockData, videoOverrides],
  );
  const bannerVideos = useMemo(
    () => (bannerQuery.data ?? []).map(toFeaturedCard),
    [bannerQuery.data, videoOverrides],
  );
  const featuredVideos = useMemo(
    () => (bannerVideos.length > 0 ? bannerVideos : homeVideos.filter((video) => video.status === 'ready')),
    [bannerVideos, homeVideos],
  );
  useEffect(() => {
    if (activeView !== 'home' || !featuredVideos[0]?.poster) return;
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.src = featuredVideos[0].poster;
  }, [activeView, featuredVideos]);

  useEffect(() => {
    if (activeView !== 'home') {
      setHomeVisibleCardCount(0);
      return;
    }
    setHomeVisibleCardCount(8);
  }, [activeView, homeVideos.length]);
  const mockPlaylistItems = useMemo(
    () => effectiveMockItems.filter((video) => (
      playlistFilterCategory === 'all'
      || video.categories.some((category) => category.slug === playlistFilterCategory)
    )),
    [effectiveMockItems, playlistFilterCategory],
  );
  const mockPlaylistPageCount = Math.max(1, Math.ceil(mockPlaylistItems.length / 8));
  const playlistVideos = useMemo(() => {
    if (!currentUser) return [];
    const currentUserName = currentUser.name || currentUser.username || '';
    const items = useMockData
      ? mockPlaylistItems.slice((playlistPage - 1) * 8, playlistPage * 8)
      : playlistQuery.data?.pages[playlistPage - 1]?.items ?? [];
    const cards = items.map((video) => (
      toCardVideo(video, language, videoOverrides, currentUserName)
    ));
    return cards
      .filter((video, index, all) => all.findIndex((item) => item.id === video.id) === index)
      .sort((left, right) => {
        const createdAtOrder = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (createdAtOrder !== 0) return createdAtOrder;
        return left.id.localeCompare(right.id);
      })
      .slice(0, 8);
  }, [
    currentUser,
    currentUser?.name,
    currentUser?.username,
    language,
    mockPlaylistItems,
    playlistPage,
    playlistQuery.data,
    useMockData,
    videoOverrides,
  ]);
  const processingPlaylistVideos = useMemo(() => {
    if (!currentUser) return [];
    const currentUserName = currentUser.name || currentUser.username || '';
    return processingVideos
      .filter((video) => (
        activeCategory === 'all'
        || video.categories.some((category) => category.slug === activeCategory)
      ))
      .map((video) => toCardVideo(video, language, videoOverrides, currentUserName));
  }, [
    activeCategory,
    currentUser,
    currentUser?.name,
    currentUser?.username,
    language,
    mockPlaylistItems,
    playlistPage,
    playlistQuery.data,
    processingVideos,
    useMockData,
    videoOverrides,
  ]);
  const processingVideoIds = useMemo(
    () => new Set(processingPlaylistVideos.map((video) => video.id)),
    [processingPlaylistVideos],
  );
  const visiblePlaylistVideos = useMemo(
    () => playlistVideos.filter((video) => !processingVideoIds.has(video.id)),
    [playlistVideos, processingVideoIds],
  );
  useEffect(() => {
    if (
      activeView !== 'playlist'
      || useMockData
      || playlistPage <= 1
      || playlistQuery.isFetchingNextPage
      || !playlistQuery.hasNextPage
      || playlistQuery.data?.pages.length === undefined
      || playlistQuery.data.pages.length >= playlistPage
    ) return;
    void playlistQuery.fetchNextPage();
  }, [
    activeView,
    playlistPage,
    playlistQuery.data?.pages.length,
    playlistQuery.fetchNextPage,
    playlistQuery.hasNextPage,
    playlistQuery.isFetchingNextPage,
    useMockData,
  ]);
  useEffect(() => {
    if (activeView !== 'playlist') return;
    const posters = [...processingPlaylistVideos, ...playlistVideos]
      .slice(0, 12)
      .map((video) => video.poster)
      .filter(Boolean);
    posters.forEach((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'high';
      image.src = src;
    });
  }, [activeView, playlistVideos, processingPlaylistVideos]);
  useEffect(() => {
    if (
      !watchFromPlaylist
      || useMockData
      || !watchPlaylistQuery.hasNextPage
      || watchPlaylistQuery.isFetchingNextPage
    ) return;
    void watchPlaylistQuery.fetchNextPage();
  }, [
    useMockData,
    watchFromPlaylist,
    watchPlaylistQuery.fetchNextPage,
    watchPlaylistQuery.hasNextPage,
    watchPlaylistQuery.isFetchingNextPage,
  ]);
  const watchPlaylist = useMemo(() => {
    if (!watchFromPlaylist) return homeVideos;
    if (!currentUser) return [];
    const currentUserName = currentUser.name || currentUser.username || '';
    const items = useMockData
      ? mockPlaylistItems
      : watchPlaylistQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const cards = items
      .filter((video) => video.status === 'ready')
      .map((video) => toCardVideo(video, language, videoOverrides, currentUserName));
    if (cards.length > 0) {
      return cards.sort((left, right) => {
        const createdAtOrder = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (createdAtOrder !== 0) return createdAtOrder;
        return left.id.localeCompare(right.id);
      });
    }
    return playlistFilterCategory === 'all'
      ? homeVideos
      : homeVideos.filter((video) => video.categorySlug === playlistFilterCategory);
  }, [
    homeVideos,
    currentUser,
    language,
    mockPlaylistItems,
    playlistFilterCategory,
    playlistQuery.data,
    watchPlaylistQuery.data,
    useMockData,
    videoOverrides,
    watchFromPlaylist,
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
      .map((video) => toCardVideo(video, language, videoOverrides));
  }, [
    activeCategory,
    collectionVideosQuery.data,
    effectiveMockItems,
    language,
    selectedCollectionId,
    useMockData,
    videoOverrides,
  ]);
  const mockWatchItem = isMockVideoId(requestedVideoId)
    ? effectiveMockItems.find((video) => video.id === requestedVideoId)
    : undefined;
  const watchVideoItem = mockWatchItem ?? watchQuery.data;
  const watchVideo = useMemo(
    () => (watchVideoItem ? toCardVideo(watchVideoItem, language, videoOverrides) : null),
    [language, videoOverrides, watchVideoItem],
  );
  const [lastWatchVideo, setLastWatchVideo] = useState<CardVideo | null>(null);
  useEffect(() => {
    if (watchVideo) setLastWatchVideo(watchVideo);
  }, [watchVideo]);
  const requestedPlaylistVideo = useMemo(
    () => watchPlaylist.find((item) => item.id === requestedVideoId) ?? null,
    [requestedVideoId, watchPlaylist],
  );
  const displayedWatchVideo = watchVideo?.id === requestedVideoId
    ? watchVideo
    : requestedPlaylistVideo ?? lastWatchVideo;
  const watchComments = isMockVideoId(requestedVideoId)
    ? mockComments.filter((comment) => comment.videoId === requestedVideoId)
    : commentsQuery.data ?? [];
  const selectedCollection = effectiveCollections
    .find((collection) => collection.id === selectedCollectionId);
  const collectionNavigationCategories = useMemo(() => {
    const categorySlug = selectedCollection?.categorySlug;
    if (!categorySlug) return [];

    const category = effectiveCategories.find((item) => item.slug === categorySlug);
    return category
      ? [category]
      : [{
        id: `collection-category-${categorySlug}`,
        slug: categorySlug,
        nameZh: categorySlug,
        nameEn: categorySlug,
      }];
  }, [effectiveCategories, selectedCollection?.categorySlug]);
  const filteredCollections = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase(language);
    if (!normalized) return effectiveCollections;
    return effectiveCollections.filter((collection) => (
      collection.title.toLocaleLowerCase(language).includes(normalized)
    ));
  }, [effectiveCollections, language, search]);

  useEffect(() => {
    if (activeView !== 'favorites') return;
    const categorySlug = selectedCollection?.categorySlug ?? 'all';
    if (activeCategory !== categorySlug) setActiveCategory(categorySlug);
  }, [activeCategory, activeView, selectedCollection?.categorySlug]);

  useEffect(() => {
    if (activeView !== 'home' || featuredVideos.length === 0) return;
    if (!featuredVideos.some((video) => video.id === featuredVideoIdRef.current)) {
      const initialId = featuredVideos[Math.floor(Math.random() * featuredVideos.length)].id;
      featuredVideoIdRef.current = initialId;
      setPreviousFeaturedVideoId(null);
      setFeaturedVideoId(initialId);
    }

    if (featuredVideos.length < 2) return;
    const intervalId = window.setInterval(() => {
      if (featuredTransitionInFlightRef.current) return;

      const currentId = featuredVideoIdRef.current;
      const candidates = featuredVideos.filter((video) => video.id !== currentId);
      const nextId = candidates[Math.floor(Math.random() * candidates.length)].id;
      const nextVideo = featuredVideos.find((video) => video.id === nextId);
      if (!nextVideo) return;

      featuredTransitionInFlightRef.current = true;
      const transition = async () => {
        if (!featuredPreloadedPostersRef.current.has(nextVideo.poster)) {
          const preloaded = await preloadImage(nextVideo.poster);
          if (!preloaded) {
            featuredTransitionInFlightRef.current = false;
            return;
          }
          featuredPreloadedPostersRef.current.add(nextVideo.poster);
        }

        setPreviousFeaturedVideoId(featuredVideoIdRef.current);
        featuredVideoIdRef.current = nextVideo.id;
        setFeaturedVideoId(nextVideo.id);
        featuredTransitionInFlightRef.current = false;
      };
      void transition();
    }, 6_000);

    return () => {
      window.clearInterval(intervalId);
      featuredTransitionInFlightRef.current = false;
    };
  }, [activeView, featuredVideos]);

  useEffect(() => {
    if (!previousFeaturedVideoId) return;
    const timer = window.setTimeout(() => setPreviousFeaturedVideoId(null), 1_100);
    return () => window.clearTimeout(timer);
  }, [featuredVideoId, previousFeaturedVideoId]);

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
    const target = loadMoreRef.current;
    if (!target || activeView !== 'home') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHomeVisibleCardCount((count) => Math.min(homeVideos.length, count + 8));
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeView, homeVideos.length]);

  useEffect(() => {
    const target = collectionLoadMoreRef.current;
    if (!target || activeView !== 'favorites' || useMockData || !selectedCollectionId) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (
        entry.isIntersecting
        && collectionVideosQuery.hasNextPage
        && !collectionVideosQuery.isFetchingNextPage
      ) {
        void collectionVideosQuery.fetchNextPage();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeView,
    collectionVideosQuery.fetchNextPage,
    collectionVideosQuery.hasNextPage,
    collectionVideosQuery.isFetchingNextPage,
    selectedCollectionId,
    useMockData,
  ]);

  useEffect(() => {
    if (activeView !== 'playlist' || activeCategory === urlPlaylistCategory) return;
    setActiveCategory(urlPlaylistCategory);
  }, [activeCategory, activeView, urlPlaylistCategory]);

  useEffect(() => {
    if (
      activeView === 'playlist'
      && activeCategory !== 'all'
      && playlistCategoriesQuery.data
      && !playlistCategoriesQuery.data.some((category) => category.slug === activeCategory)
    ) {
      setActiveCategory('all');
      const next = new URLSearchParams(searchParams);
      next.delete('category');
      next.delete('page');
      setSearchParams(next);
    }
  }, [
    activeCategory,
    activeView,
    playlistCategoriesQuery.data,
    searchParams,
    setSearchParams,
  ]);

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
            dispatch(setVideoDetails(updated));
          }
        });
      draftTitleSaveQueueRef.current = save;
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    dispatch,
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

  const finishPublish = useCallback(() => {
    setSearchParams(new URLSearchParams({ view: 'playlist' }));
    setActiveCategory('all');
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSearchParams]);

  const openVideo = useCallback((video: CardVideo) => {
    if (!isMockVideoId(video.id) && video.raw.hlsMasterUrl) {
      // Avoid a blank detail page while the detail request is in flight.
      // The detail query will replace this partial cache entry in the
      // background with the authoritative response.
      queryClient.setQueryData(['video', 'detail', video.id], video.raw);
    }
    const nextParams: Record<string, string> = { view: 'watch', video: video.id };
    if (activeView === 'playlist' || watchFromPlaylist) {
      nextParams.from = 'playlist';
      if (activeCategory !== 'all') nextParams.category = activeCategory;
      if (playlistPage > 1) nextParams.page = String(playlistPage);
    }
    if ((activeView === 'favorites' || watchFromFavorites) && selectedCollectionId) {
      nextParams.from = 'favorites';
      nextParams.collection = selectedCollectionId;
      if (activeCategory !== 'all') nextParams.category = activeCategory;
    }
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [
    activeCategory,
    activeView,
    playlistPage,
    queryClient,
    selectedCollectionId,
    setSearchParams,
    watchFromFavorites,
    watchFromPlaylist,
  ]);

  const prepareVideo = useCallback((video: CardVideo) => {
    if (isMockVideoId(video.id)) return;
    prepareVideoOrigin(video.src || video.raw.originFileUrl);
    void queryClient.prefetchQuery({
      queryKey: ['video', 'detail', video.id],
      queryFn: () => getVideo(video.id),
      staleTime: 60_000,
    });
  }, [queryClient]);

  const returnFromWatch = useCallback(() => {
    const category = searchParams.get('category');
    if (watchFromPlaylist) {
      const next = new URLSearchParams({ view: 'playlist' });
      const page = searchParams.get('page');
      if (category) next.set('category', category);
      if (page) next.set('page', page);

      setSearchParams(next);
      setActiveCategory(category || 'all');
      setSearch('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (watchFromFavorites) {
      const collectionId = searchParams.get('collection');
      if (collectionId) {
        const next = new URLSearchParams({ view: 'favorites', collection: collectionId });
        if (category) next.set('category', category);

        setSearchParams(next);
        setActiveCategory(category || 'all');
        setSearch('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      navigateTo('library');
      return;
    }

    navigateTo('home');
  }, [navigateTo, searchParams, setSearchParams, watchFromFavorites, watchFromPlaylist]);

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
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'watch-playlist'] },
      updatePages,
    );
  }, [queryClient]);

  const updateCachedVideoReaction = useCallback((
    videoId: string,
    kind: 'like' | 'favorite',
    active: boolean,
    count: number,
  ) => {
    const activeKey = kind === 'like' ? 'liked' : 'favorited';
    const countKey = kind === 'like' ? 'likeCount' : 'favoriteCount';
    const updatePages = (data: InfiniteData<VideoPage, Cursor> | undefined) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (
            item.id === videoId
              ? { ...item, [activeKey]: active, [countKey]: count }
              : item
          )),
        })),
      };
    };

    queryClient.setQueryData<VideoApiItem>(['video', 'detail', videoId], (item) => (
      item ? { ...item, [activeKey]: active, [countKey]: count } : item
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
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'watch-playlist'] },
      updatePages,
    );
  }, [queryClient]);

  const updateCachedVideoCommentCount = useCallback((videoId: string, delta: number) => {
    const updatePages = (data: InfiniteData<VideoPage, Cursor> | undefined) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (
            item.id === videoId
              ? { ...item, commentCount: Math.max(0, item.commentCount + delta) }
              : item
          )),
        })),
      };
    };

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
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'watch-playlist'] },
      updatePages,
    );
  }, [queryClient]);

  const updateCachedVideo = useCallback((updated: VideoApiItem) => {
    const updatePages = (data: InfiniteData<VideoPage, Cursor> | undefined) => {
      if (!data) return data;
      let found = false;
      const pages = data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.id !== updated.id) return item;
          found = true;
          return {
            ...item,
            ...updated,
            coverUrl: updated.coverUrl || item.coverUrl,
          };
        }),
      }));
      if (!found && (updated.status === 'uploading' || updated.status === 'processing')) {
        const firstPage = pages[0];
        if (firstPage) {
          pages[0] = {
            ...firstPage,
            items: [updated, ...firstPage.items].slice(0, 8),
          };
        }
      }
      return {
        ...data,
        pages,
      };
    };

    queryClient.setQueryData<VideoApiItem>(
      ['video', 'detail', updated.id],
      current => current
        ? {
          ...current,
          ...updated,
          coverUrl: updated.coverUrl || current.coverUrl,
        }
        : updated,
    );
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
    queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
      { queryKey: ['video', 'watch-playlist'] },
      updatePages,
    );
  }, [queryClient]);

  useEffect(() => {
    if (
      !currentUser
      || (
        publishedProcessingVideos.length === 0
        && !(uploadVideoId && uploadPublishRequested)
      )
    ) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let connectTimer: number | undefined;
    let disposed = false;
    let reconnectDelay = 1000;
    let connectionFailures = 0;

    const connect = () => {
      if (disposed) return;
      const currentSocket = new WebSocket(videoStatusWebSocketUrl());
      socket = currentSocket;
      currentSocket.onopen = () => {
        reconnectDelay = 1000;
        connectionFailures = 0;
      };
      currentSocket.onmessage = event => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (
          !payload
          || typeof payload !== 'object'
          || (payload as { type?: unknown }).type !== 'video_progress'
        ) return;
        const message = payload as {
          video_id?: unknown;
          status?: unknown;
          progress?: unknown;
        };
        const videoId = String(message.video_id || '');
        if (!videoId) return;
        const progress = Math.max(0, Math.min(100, Number(message.progress) || 0));
        const status: VideoApiItem['status'] | null = message.status === 'uploading'
          || message.status === 'processing'
          || message.status === 'ready'
          || message.status === 'failed'
          ? message.status
          : null;
        if (!status) return;

        setPublishedProcessingVideos(current => current.map(item => {
          if (item.id !== videoId) return item;
          return {
            ...item,
            status,
            processingProgress: Math.max(item.processingProgress, progress),
          };
        }));
        queryClient.setQueryData<VideoApiItem>(
          ['video', 'detail', videoId],
          item => item
            ? {
              ...item,
              status,
              processingProgress: Math.max(item.processingProgress, progress),
            }
            : item,
        );
        queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
          { queryKey: ['video', 'home'] },
          data => data && {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              items: page.items.map(item => (
                item.id === videoId
                  ? {
                    ...item,
                    status,
                    processingProgress: Math.max(item.processingProgress, progress),
                  }
                  : item
              )),
            })),
          },
        );
        queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
          { queryKey: ['video', 'playlist'] },
          data => data && {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              items: page.items.map(item => (
                item.id === videoId
                  ? {
                    ...item,
                    status,
                    processingProgress: Math.max(item.processingProgress, progress),
                  }
                  : item
              )),
            })),
          },
        );
        queryClient.setQueriesData<InfiniteData<VideoPage, Cursor>>(
          { queryKey: ['video', 'watch-playlist'] },
          data => data && {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              items: page.items.map(item => (
                item.id === videoId
                  ? {
                    ...item,
                    status,
                    processingProgress: Math.max(item.processingProgress, progress),
                  }
                  : item
              )),
            })),
          },
        );
      };
      currentSocket.onclose = () => {
        if (disposed) return;
        connectionFailures += 1;
        // HTTP polling remains the source of truth when the optional
        // realtime endpoint is unavailable.
        if (connectionFailures >= 3) return;
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };
      currentSocket.onerror = () => {};
    };

    connectTimer = window.setTimeout(connect, 0);
    return () => {
      disposed = true;
      if (connectTimer !== undefined) window.clearTimeout(connectTimer);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      const currentSocket = socket;
      socket = null;
      if (!currentSocket) return;
      currentSocket.onmessage = null;
      currentSocket.onclose = null;
      currentSocket.onerror = null;
      if (currentSocket.readyState === WebSocket.CONNECTING) {
        currentSocket.onopen = () => currentSocket.close(1000, 'Video status closed');
      } else if (currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.close(1000, 'Video status closed');
      }
    };
  }, [
    currentUser?.id,
    publishedProcessingVideos.length,
    queryClient,
    uploadPublishRequested,
    uploadVideoId,
  ]);

  const trackQualifiedVideoView = useCallback(async (videoId: string) => {
    if (isMockVideoId(videoId)) {
      const baseVideo = MOCK_VIDEO_ITEMS.find((item) => item.id === videoId);
      if (!baseVideo) return false;
      const nextViewCount = (videoOverrides[videoId]?.viewCount
        ?? mockVideoOverrides[videoId]?.viewCount
        ?? baseVideo.viewCount) + 1;
      setMockVideoOverrides((previous) => {
        const current = previous[videoId] ?? {};
        return {
          ...previous,
          [videoId]: {
            ...current,
            viewCount: nextViewCount,
          },
        };
      });
      dispatch(setVideoViewCount({ videoId, viewCount: nextViewCount }));
      return true;
    }

    try {
      const result = await viewVideo(videoId);
      dispatch(setVideoViewCount({ videoId, viewCount: result.viewCount }));
      updateCachedVideoViewCount(videoId, result.viewCount);
      return result.counted;
    } catch {
      return false;
    }
  }, [dispatch, mockVideoOverrides, updateCachedVideoViewCount, videoOverrides]);

  const invalidateVideoData = useCallback(async (videoId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['video', 'home'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'banner'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'playlist'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'collection'] }),
      ...(videoId
        ? [queryClient.invalidateQueries({ queryKey: ['video', 'detail', videoId] })]
        : []),
    ]);
    await queryClient.refetchQueries({
      queryKey: ['video', 'playlist'],
      type: 'active',
    });
  }, [queryClient]);

  const deleteWatchedVideo = useCallback(async (videoId: string) => {
    if (isMockVideoId(videoId)) {
      returnFromWatch();
      return;
    }

    await deleteVideo(videoId);
    queryClient.removeQueries({ queryKey: ['video', 'detail', videoId] });
    queryClient.removeQueries({ queryKey: ['video', 'comments', videoId] });
    await invalidateVideoData();
    returnFromWatch();
    notify(t('video.deleted'), 'success');
  }, [invalidateVideoData, queryClient, returnFromWatch, t]);

  const updateWatchedVideo = useCallback(async (videoId: string, input: {
    title: string;
    description: string;
    visibility: VideoVisibility;
    categories: string[];
    cover: File | null;
  }) => {
    if (isMockVideoId(videoId)) {
      setMockVideoOverrides((previous) => ({
        ...previous,
        [videoId]: {
          ...(previous[videoId] ?? {}),
          title: input.title,
          description: input.description,
          visibility: input.visibility,
          ...(input.cover ? { coverUrl: URL.createObjectURL(input.cover) } : {}),
        },
      }));
      return;
    }

    const updated = await updateVideo(videoId, input);
    dispatch(setVideoDetails(updated));
    updateCachedVideo(updated);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['video', 'home'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'playlist'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'collection'] }),
      queryClient.invalidateQueries({ queryKey: ['video', 'watch-playlist'] }),
    ]);
    notify(t('video.settings.updated'), 'success');
  }, [dispatch, notify, queryClient, t, updateCachedVideo]);

  const createCollection = useCallback(async () => {
    if (!currentUser) {
      notify(t('video.authRequired'), 'error');
      return;
    }

    const title = collectionTitle.trim();
    if (!title) {
      setCollectionError(t('video.library.collectionTitleRequired'));
      return;
    }

    setCollectionBusy(true);
    setCollectionError('');
    try {
      await createVideoCollection({
        title,
        visibility: collectionVisibility,
        include_favorites: collectionIncludeFavorites,
        category_slug: collectionCategory === 'all' ? null : collectionCategory,
      });

      await queryClient.invalidateQueries({ queryKey: ['video', 'collections'] });
      await queryClient.invalidateQueries({ queryKey: ['video', 'collection'] });
      setCollectionDialogOpen(false);
      setCollectionTitle('');
      setCollectionVisibility('public');
      setCollectionCategory('all');
      setCollectionIncludeFavorites(false);
      notify(t('video.library.collectionCreated'), 'success');
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : t('video.library.collectionCreateFailed'));
    } finally {
      setCollectionBusy(false);
    }
  }, [
    collectionCategory,
    collectionIncludeFavorites,
    collectionTitle,
    collectionVisibility,
    currentUser,
    queryClient,
    t,
  ]);

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
      let loadedPages = playlistQuery.data?.pages.length ?? 0;
      while (loadedPages < nextPage && playlistQuery.hasNextPage) {
        const result = await playlistQuery.fetchNextPage();
        loadedPages = result.data?.pages.length ?? loadedPages;
        if (!result.hasNextPage) break;
      }
      if (loadedPages < nextPage) return;
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
    const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
    if (
      activeUploadFileRef.current === fileKey
      && uploadAbortControllerRef.current
      && !uploadAbortControllerRef.current.signal.aborted
    ) {
      return;
    }
    const session = uploadSessionRef.current + 1;
    uploadSessionRef.current = session;
    activeUploadFileRef.current = fileKey;
    uploadProgressLoadedRef.current = 0;
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
    setUploadDetails({
      percent: 0,
      loaded: 0,
      total: file.size,
      bytesPerSecond: 0,
      remainingSeconds: 0,
    });
    setUploadVideoId(null);
    setUploadVideoName(file.name);
    setUploadTitle(getFileTitle(file.name));
    const objectUrl = URL.createObjectURL(file);
    const metadataVideo = document.createElement('video');
    metadataVideo.preload = 'auto';
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
        progress => {
          if (session !== uploadSessionRef.current) return;
          if (progress.loaded < uploadProgressLoadedRef.current) return;
          uploadProgressLoadedRef.current = progress.loaded;
          setUploadProgress((current) => Math.max(current, progress.percent));
          setUploadDetails((current) => (
            progress.loaded >= current.loaded ? progress : current
          ));
        },
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
    const latest = await queryClient.fetchQuery({
        queryKey: ['video', 'detail', uploaded.id],
        queryFn: () => getVideo(uploaded.id),
        staleTime: 0,
      });
      setUploadVideoId(uploaded.id);
      setUploadProgress(100);
      if (latest.duration > 0) setUploadDuration(formatDuration(latest.duration));
      setHasVideoRecord(true);
      try {
        window.localStorage.setItem(VIDEO_RECORD_EXISTS_KEY, '1');
      } catch {
        // The current session still suppresses mock content when storage is unavailable.
      }
    updateCachedVideo(latest);
      void invalidateVideoData(latest.id);
    } catch {
      if (controller.signal.aborted || session !== uploadSessionRef.current) return;
      setUploadError(t('video.upload.failed'));
    } finally {
      if (uploadAbortControllerRef.current === controller) {
        uploadAbortControllerRef.current = null;
        activeUploadFileRef.current = null;
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

    if (!uploadVideoId || !uploadPublishRequestedRef.current) return;

    setUploadBusy(true);
    try {
      const updated = await updateVideo(uploadVideoId, { cover: file });
      queryClient.setQueryData(['video', 'detail', uploadVideoId], updated);
      await invalidateVideoData(uploadVideoId);
    } catch (error) {
      const status = (error as ApiRequestError).response?.status;
      if (status === 413) {
        setUploadError(t('video.upload.coverTooLarge'));
      } else if (status === 415) {
        setUploadError(t('video.upload.coverUnsupported'));
      } else {
        setUploadError(t('video.upload.publishFailed'));
      }
    } finally {
      setUploadBusy(false);
    }
  };

  const startPublishedVideoPolling = useCallback((videoId: string) => {
    if (publishedVideoPollingRef.current !== null) {
      window.clearInterval(publishedVideoPollingRef.current);
    }

    const poll = async () => {
      try {
        const updated = await getVideo(videoId);
        updateCachedVideo(updated);
        setPublishedProcessingVideos((current) => current
          .map((item) => item.id === videoId
            ? {
              ...item,
              ...updated,
              coverUrl: isUploadedVideoCover(item.coverUrl)
                ? item.coverUrl
                : updated.coverUrl || item.coverUrl,
              processingProgress: Math.max(item.processingProgress, updated.processingProgress),
            }
            : item)
          .filter((item) => item.status === 'uploading' || item.status === 'processing'));
        if (updated.status === 'ready' || updated.status === 'failed') {
          if (publishedVideoPollingRef.current !== null) {
            window.clearInterval(publishedVideoPollingRef.current);
            publishedVideoPollingRef.current = null;
          }
        }
      } catch {
        // Keep polling transient request failures.
      }
    };

    void poll();
    publishedVideoPollingRef.current = window.setInterval(() => {
      void poll();
    }, 800);
  }, [updateCachedVideo]);

  const closeUpload = () => {
    const uploadId = uploadVideoId;
    const wasPublished = Boolean(
      uploadId
      && (
        uploadPublishRequestedRef.current
        || publishedUploadIdsRef.current.has(uploadId)
      )
    );
    const shouldDeleteDraft = Boolean(uploadId) && !wasPublished;
    uploadSessionRef.current += 1;
    draftTitleSaveVersionRef.current += 1;
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    activeUploadFileRef.current = null;
    uploadProgressLoadedRef.current = 0;
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
    if (wasPublished && uploadId) startPublishedVideoPolling(uploadId);
  };

  const publishUpload = async () => {
    const videoId = uploadVideoId;
    const categories = uploadTags
      .match(/#[\p{L}\p{N}-]+/gu)
      ?.map((tag) => tag.slice(1).toLowerCase())
      ?? [];
    if (!videoId || !uploadTitle.trim()) {
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
      const updated = await updateVideo(videoId, {
        title: uploadTitle,
        description: uploadTags,
        visibility: uploadVisibility,
        categories,
        cover: uploadCoverFile,
        publish: true,
      });
      if (session !== uploadSessionRef.current) return;
      publishedUploadIdsRef.current.add(videoId);
      uploadPublishRequestedRef.current = true;
      setUploadPublishRequested(true);
      queryClient.setQueryData(['video', 'detail', videoId], updated);
      updateCachedVideo(updated);
      setPublishedProcessingVideos((current) => [
        updated,
        ...current.filter((video) => video.id !== updated.id),
      ]);
      notify(t('video.upload.published'), 'success');
      closeUpload();
      finishPublish();
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
      setUploadBusy(true);
      void (async () => {
        try {
          let finalVideo = uploaded;
          if (uploadCoverFile) {
            finalVideo = await updateVideo(uploadVideoId, { cover: uploadCoverFile });
            queryClient.setQueryData(['video', 'detail', uploadVideoId], finalVideo);
          }
          publishedUploadIdsRef.current.add(uploadVideoId);
          setPublishedProcessingVideos((current) => [
            finalVideo,
            ...current.filter((video) => video.id !== finalVideo.id),
          ]);
          closeUpload();
          finishPublish();
          notify(t('video.upload.published'), 'success');
        } catch (error) {
          const status = (error as ApiRequestError).response?.status;
          if (status === 413) {
            setUploadError(t('video.upload.coverTooLarge'));
          } else if (status === 415) {
            setUploadError(t('video.upload.coverUnsupported'));
          } else {
            setUploadError(t('video.upload.coverFailed'));
          }
          uploadPublishRequestedRef.current = false;
          setUploadPublishRequested(false);
          setUploadBusy(false);
          uploadFinalizingRef.current = false;
        }
      })();
      return;
    }
    if (uploaded.status === 'failed') {
      setUploadError(uploaded.processingError || t('video.upload.processingFailed'));
    }
  }, [
    queryClient,
    finishPublish,
    updateCachedVideo,
    uploadPublishRequested,
    uploadCoverFile,
    uploadStatusQuery.data,
    uploadVideoId,
  ]);

  const openUpload = () => {
    if (!currentUser) {
      notify(t('video.authRequired'), 'error');
      return;
    }
    if (uploadStep === 'upload' && !uploadVideoId) setUploadVisibility('public');
    setUploadOpen(true);
  };

  const featured = featuredVideos.find((video) => video.id === featuredVideoId)
    ?? featuredVideos[0]
    ?? null;
  const previousFeatured = featuredVideos.find((video) => video.id === previousFeaturedVideoId)
    ?? null;
  const currentUserName = currentUser?.name || currentUser?.username || t('video.user');
  const currentUserAvatar = resolveAvatarUrl(currentUser?.avatar)
    || defaultAvatarDataUrl(currentUserName);

  return (
    <main className="video-page">
      {activeView === 'watch' && (
        displayedWatchVideo ? (
          <VideoWatch
            video={displayedWatchVideo}
            playlist={watchPlaylist}
            comments={watchComments}
            currentUserAvatar={currentUserAvatar}
            onBack={returnFromWatch}
            onSelect={openVideo}
            onReact={async (kind, active) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(displayedWatchVideo.id)) {
                updateMockReaction(displayedWatchVideo.id, kind, active);
                return;
              }
              const videoId = displayedWatchVideo.id;
              const activeKey = kind === 'like' ? 'liked' : 'favorited';
              const countKey = kind === 'like' ? 'likeCount' : 'favoriteCount';
              const previousActive = displayedWatchVideo[activeKey];
              const previousCount = displayedWatchVideo[countKey];
              try {
                const optimisticCount = Math.max(0, previousCount + (active ? 1 : -1));
                updateCachedVideoReaction(videoId, kind, active, optimisticCount);
                const result = kind === 'like'
                  ? await updateVideoLike(videoId, active)
                  : await updateVideoFavorite(videoId, active);
                updateCachedVideoReaction(videoId, kind, result.active, result.count);
                dispatch(setVideoDetails({
                  ...displayedWatchVideo.raw,
                  [activeKey]: result.active,
                  [countKey]: result.count,
                }));
              } catch {
                updateCachedVideoReaction(videoId, kind, previousActive, previousCount);
                notify(t('video.actionFailed'), 'error');
              }
            }}
            onComment={async (content, target) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(displayedWatchVideo.id)) {
                const createdAt = new Date().toISOString();
                const comment: VideoApiComment = {
                  id: `mock-comment-${Date.now()}`,
                  videoId: displayedWatchVideo.id,
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
                  const current = previous[displayedWatchVideo.id] ?? {};
                  const baseVideo = MOCK_VIDEO_ITEMS.find((video) => video.id === displayedWatchVideo.id);
                  return {
                    ...previous,
                    [displayedWatchVideo.id]: {
                      ...current,
                      commentCount: (current.commentCount ?? baseVideo?.commentCount ?? 0) + 1,
                    },
                  };
                });
                return;
              }
              const videoId = displayedWatchVideo.id;
              const temporaryId = `pending-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              const temporaryComment: VideoApiComment = {
                id: temporaryId,
                videoId,
                userId: currentUser.id,
                username: currentUserName,
                avatar: currentUserAvatar,
                parentId: target?.rootId ?? null,
                replyToUserId: target?.userId ?? null,
                replyToUsername: target?.username ?? null,
                content,
                likeCount: 0,
                liked: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              queryClient.setQueryData<VideoApiComment[]>(
                ['video', 'comments', videoId],
                (comments = []) => [...comments, temporaryComment],
              );
              queryClient.setQueryData<VideoApiItem>(
                ['video', 'detail', videoId],
                (item) => item
                  ? { ...item, commentCount: item.commentCount + 1 }
                  : item,
              );
              updateCachedVideoCommentCount(videoId, 1);
              try {
                const comment = await createVideoComment(videoId, {
                  content,
                  parentId: target?.rootId,
                  replyToUserId: target?.userId,
                });
                queryClient.setQueryData<VideoApiComment[]>(
                  ['video', 'comments', videoId],
                  (comments = []) => comments.map((item) => (
                    item.id === temporaryId ? comment : item
                  )),
                );
              } catch {
                queryClient.setQueryData<VideoApiComment[]>(
                  ['video', 'comments', videoId],
                  (comments = []) => comments.filter((item) => item.id !== temporaryId),
                );
                queryClient.setQueryData<VideoApiItem>(
                  ['video', 'detail', videoId],
                  (item) => item
                    ? { ...item, commentCount: Math.max(0, item.commentCount - 1) }
                    : item,
                );
                updateCachedVideoCommentCount(videoId, -1);
                notify(t('video.comments.failed'), 'error');
              }
            }}
            onCommentLike={async (comment, active) => {
              if (!currentUser) {
                notify(t('video.authRequired'), 'error');
                return;
              }
              if (isMockVideoId(displayedWatchVideo.id) && comment.id.startsWith('mock-comment-')) {
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
              const videoId = displayedWatchVideo.id;
              const previousLiked = comment.liked;
              const previousCount = comment.likeCount;
              const optimisticCount = Math.max(0, previousCount + (active ? 1 : -1));
              queryClient.setQueryData<VideoApiComment[]>(
                ['video', 'comments', videoId],
                (comments = []) => comments.map((item) => (
                  item.id === comment.id
                    ? { ...item, liked: active, likeCount: optimisticCount }
                    : item
                )),
              );
              try {
                const result = await updateVideoCommentLike(comment.id, active);
                queryClient.setQueryData<VideoApiComment[]>(
                  ['video', 'comments', videoId],
                  (comments = []) => comments.map((item) => (
                    item.id === comment.id
                      ? { ...item, liked: result.liked, likeCount: result.likeCount }
                      : item
                  )),
                );
              } catch {
                queryClient.setQueryData<VideoApiComment[]>(
                  ['video', 'comments', videoId],
                  (comments = []) => comments.map((item) => (
                    item.id === comment.id
                      ? { ...item, liked: previousLiked, likeCount: previousCount }
                      : item
                  )),
                );
                notify(t('video.actionFailed'), 'error');
              }
            }}
            onViewQualified={trackQualifiedVideoView}
            onDelete={deleteWatchedVideo}
            onUpdate={updateWatchedVideo}
            canEdit={Boolean(currentUser?.id && displayedWatchVideo.raw.userId === currentUser.id)}
            onEditDenied={() => notify(t('video.publisherOnlyEdit'), 'error')}
          />
        ) : (
          <div className="video-empty">
            {watchQuery.isError || (isMockVideoId(requestedVideoId) && !mockWatchItem)
              ? t('video.loadFailed')
              : <VideoLoadingSpinner label={t('video.loading')} />}
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
                <div className="video-library-header-actions">
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
                  <button
                    type="button"
                    className="video-create-collection-button"
                    aria-label={t('video.library.createCollection')}
                    onClick={() => {
                      if (!currentUser) {
                        notify(t('video.authRequired'), 'error');
                        return;
                      }
                      setCollectionError('');
                      setCollectionTitle('');
                      setCollectionVisibility('public');
                      setCollectionCategory('all');
                      setCollectionIncludeFavorites(false);
                      setCollectionDialogOpen(true);
                    }}
                  >
                    <FolderPlus size={18} />
                    <span>{t('video.library.createCollection')}</span>
                  </button>
                </div>
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
                    next.set('view', 'playlist');
                    if (category === 'all') next.delete('category');
                    else next.set('category', category);
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
                active={selectedCollection?.categorySlug ?? activeCategory}
                categories={collectionNavigationCategories}
                language={language}
                allLabel={t('video.categories.all')}
                ariaLabel={t('video.categories.label')}
                includeAll={!selectedCollection?.categorySlug}
                onChange={setActiveCategory}
                className="is-playlist"
              />
            )}

            {activeView === 'home' && (
              <>
                {featured && (
                  <section className="video-featured" aria-label={t('video.home.featured')}>
                    <button
                      type="button"
                      className="video-featured-media"
                      onPointerEnter={() => prepareVideo(featured)}
                      onPointerDown={() => prepareVideo(featured)}
                      onFocus={() => prepareVideo(featured)}
                      onClick={() => openVideo(featured)}
                    >
                      {featuredVideos.map((video) => (
                        <img
                          key={video.id}
                          className={`video-featured-cover${video.id === featured.id ? ' is-current' : ''}${video.id === previousFeatured?.id ? ' is-previous' : ''}`}
                          src={video.poster}
                          alt=""
                          loading={video.id === featured.id || video.id === previousFeatured?.id ? 'eager' : 'lazy'}
                          decoding="async"
                          fetchPriority={video.id === featured.id ? 'high' : 'auto'}
                        />
                      ))}
                      {(featured.raw.width != null || featured.raw.height != null) && (
                        <span className="video-quality">{featured.resolution}</span>
                      )}
                      <span
                        className="video-featured-play"
                        aria-hidden="true"
                      >
                        <Play size={20} strokeWidth={2} fill="currentColor" />
                      </span>
                    </button>
                    <div className="video-featured-copy">
                      {featured.title && (
                        <h2>{withoutCategoryMarkers(featured.title)}</h2>
                      )}
                      {featured.description && (
                        <p>{withoutHashCharacters(featured.description)}</p>
                      )}
                      {(featured.raw.username || featured.raw.avatar) && (
                        <div className="video-featured-author">
                          {featured.raw.avatar && (
                            <img src={featured.avatar} alt="" {...lazyImageProps()} />
                          )}
                          {featured.raw.username && (
                            <div>
                              <strong>{featured.creator}</strong>
                              <span>{featured.views}<i />{featured.duration}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}
                <section className="video-section">
                  <div className="video-home-recommendation">{t('video.home.today')}</div>
                  {homeVideos.length > 0 ? (
                    <div className="video-home-grid">
                      {homeVideos.map((video, index) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={openVideo}
                          onPrepare={prepareVideo}
                          onFavorite={toggleFavorite}
                          priority={index < homeVisibleCardCount}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="video-empty">
                      {homeQuery.isError
                        ? (
                          <button
                            type="button"
                            className="video-retry-button"
                            onClick={() => void homeQuery.refetch()}
                          >
                            <RefreshCw size={16} aria-hidden="true" />
                            <span>{t('video.loadFailed')}</span>
                          </button>
                        )
                        : homeQuery.isLoading
                          ? <VideoLoadingSpinner label={t('video.loading')} />
                          : t('video.empty')}
                    </div>
                  )}
                  <div ref={loadMoreRef} className="video-load-more-sentinel" aria-hidden="true" />
                  {!useMockData && homeQuery.isFetchingNextPage && (
                    <div className="video-empty">
                      <VideoLoadingSpinner label={t('video.loadingMore')} compact />
                    </div>
                  )}
                </section>
              </>
            )}

            {activeView === 'library' && (
              <section className="video-section video-library-section">
                {filteredCollections.length > 0 ? (
                  <div className="video-library-grid">
                    {filteredCollections.map((collection: VideoApiCollection) => {
                      const isOwnCollection = collection.userId === currentUser?.id;
                      const isProLocked = !isOwnCollection && !hasVideoLibraryAccess;
                      return (
                        <button
                          type="button"
                          key={collection.id}
                          className={`video-collection-card${isProLocked ? ' is-pro-locked' : ''}`}
                          onClick={() => {
                            if (isProLocked) {
                              setIsVideoProUpgradeOpen(true);
                              return;
                            }
                            setSearchParams({ view: 'favorites', collection: collection.id });
                          }}
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
                      );
                    })}
                  </div>
                ) : (
                  <div className="video-empty">
                    {collectionsQuery.isLoading
                      ? <VideoLoadingSpinner label={t('video.loading')} />
                      : t('video.library.empty')}
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
                  <>
                    <div className="video-playlist-grid">
                      {collectionVideos.map((video, index) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={openVideo}
                          onPrepare={prepareVideo}
                          onFavorite={toggleFavorite}
                          priority={index < 12}
                        />
                      ))}
                    </div>
                    <div ref={collectionLoadMoreRef} className="video-load-more-sentinel" aria-hidden="true" />
                    {!useMockData && collectionVideosQuery.isFetchingNextPage && (
                      <div className="video-empty">
                        <VideoLoadingSpinner label={t('video.loadingMore')} compact />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="video-empty">
                    {collectionVideosQuery.isLoading
                      ? <VideoLoadingSpinner label={t('video.loading')} />
                      : t('video.empty')}
                  </div>
                )}
              </section>
            )}

            {activeView === 'playlist' && (
              <section className="video-section video-playlist-section">
                {!currentUser ? (
                  <div className="video-empty">{t('video.authRequired')}</div>
                ) : visiblePlaylistVideos.length > 0 || processingPlaylistVideos.length > 0 ? (
                  <>
                    <div className="video-playlist-grid">
                      {processingPlaylistVideos.map((video) => (
                        <ProcessingVideoCard key={video.id} video={video} onPlay={openVideo} />
                      ))}
                      {visiblePlaylistVideos.map((video, index) => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          onPlay={openVideo}
                          onPrepare={prepareVideo}
                          onFavorite={toggleFavorite}
                          priority={index < 8}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="video-empty">
                    {!playlistQuery.isFetched || playlistQuery.isLoading
                      ? <VideoLoadingSpinner label={t('video.loading')} />
                      : t('video.empty')}
                  </div>
                )}
                {currentUser && (
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
                )}
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
              uploadDetails={uploadDetails}
              processingProgress={uploadStatusQuery.data?.processingProgress ?? 0}
              processingDetails={processingDetails}
              videoName={uploadVideoName}
              coverUrl={uploadCoverUrl || generatedUploadCoverUrl}
              hasCustomCover={Boolean(uploadCoverUrl)}
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

          {collectionDialogOpen && createPortal(
            <div className="video-collection-dialog-overlay" role="presentation">
              <button
                type="button"
                className="video-collection-dialog-backdrop"
                aria-label={t('video.library.cancelCollection')}
                onClick={() => {
                  if (!collectionBusy) setCollectionDialogOpen(false);
                }}
              />
              <section
                className="video-collection-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="video-collection-dialog-title"
              >
                <button
                  type="button"
                  className="video-collection-dialog-close"
                  aria-label={t('video.library.cancelCollection')}
                  disabled={collectionBusy}
                  onClick={() => setCollectionDialogOpen(false)}
                >
                  <X size={20} />
                </button>
                <p className="video-collection-dialog-eyebrow">{t('video.library.folder')}</p>
                <h2 id="video-collection-dialog-title">{t('video.library.createCollectionTitle')}</h2>
                <p className="video-collection-dialog-description">{t('video.library.createCollectionDescription')}</p>

                <label className="video-collection-field">
                  <span>{t('video.library.collectionName')}</span>
                  <input
                    type="text"
                    value={collectionTitle}
                    maxLength={255}
                    autoFocus
                    placeholder={t('video.library.collectionNamePlaceholder')}
                    disabled={collectionBusy}
                    onChange={(event) => {
                      setCollectionTitle(event.target.value);
                      if (collectionError) setCollectionError('');
                    }}
                  />
                </label>

                <fieldset className="video-collection-options">
                  <legend>{t('video.upload.visibility')}</legend>
                  <div className="video-collection-visibility">
                    {(['public', 'private'] as VideoVisibility[]).map((visibility) => (
                      <button
                        key={visibility}
                        type="button"
                        className={collectionVisibility === visibility ? 'is-active' : ''}
                        aria-pressed={collectionVisibility === visibility}
                        disabled={collectionBusy}
                        onClick={() => setCollectionVisibility(visibility)}
                      >
                        {visibility === 'public' ? <Globe2 size={15} /> : <LockKeyhole size={15} />}
                        {t(`video.upload.${visibility}`)}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="video-collection-options">
                  <legend>{t('video.categories.label')}</legend>
                  <label className="video-collection-category-select">
                    <ListFilter size={16} aria-hidden="true" />
                    <select
                      value={collectionCategory}
                      disabled={collectionBusy}
                      aria-label={t('video.categories.label')}
                      onChange={(event) => setCollectionCategory(event.target.value)}
                    >
                      <option value="all">{t('video.categories.all')}</option>
                      {collectionCategories.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {language.startsWith('zh') ? category.nameZh : category.nameEn}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>

                <label className="video-collection-include">
                  <input
                    type="checkbox"
                    checked={collectionIncludeFavorites}
                    disabled={collectionBusy}
                    onChange={(event) => setCollectionIncludeFavorites(event.target.checked)}
                  />
                  <span>
                    <strong>{t('video.library.includeFavorites')}</strong>
                    <small>{t('video.library.includeFavoritesDescription')}</small>
                  </span>
                  <span className="video-collection-switch" aria-hidden="true">
                    <span />
                  </span>
                </label>

                {collectionError && <p className="video-collection-error">{collectionError}</p>}
                <div className="video-collection-dialog-actions">
                  <button
                    type="button"
                    className="video-collection-cancel"
                    disabled={collectionBusy}
                    onClick={() => setCollectionDialogOpen(false)}
                  >
                    {t('video.library.cancelCollection')}
                  </button>
                  <button
                    type="button"
                    className="video-collection-confirm"
                    disabled={collectionBusy || !collectionTitle.trim()}
                    onClick={() => void createCollection()}
                  >
                    {collectionBusy && <LoaderCircle size={17} className="is-spinning" />}
                    {collectionBusy ? t('video.library.creatingCollection') : t('video.library.confirmCreateCollection')}
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )}
        </>
      )}
      <ProUpgradeDialog
        open={isVideoProUpgradeOpen}
        email={currentUser?.email}
        onClose={() => setIsVideoProUpgradeOpen(false)}
      />
    </main>
  );
}
