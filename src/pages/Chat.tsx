import { Fragment, useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AudioLines,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  BrainCircuit,
  ChevronDown,
  CircleAlert,
  FileAudio,
  FileText,
  LoaderCircle,
  Maximize2,
  Pause,
  Plus,
  Play,
  Settings2,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import avatarFrame from '@/assets/images/avatar-frame.webp';
import {
  defaultAvatarDataUrl,
  resolveAssetUrl,
  resolveAvatarUrl,
  resolveChatAvatarUrl,
} from '@/lib/avatar';
import {
  addGroupMembers,
  createGroup,
  sendAutomaticReply,
  sendImageMessage,
  sendMessage,
} from '@/api/chat';
import {
  acknowledgeVoiceTrainingJob,
  characterTtsStreamUrl,
  createVoiceTrainingJob,
  generateCharacterTts,
  getCharacterBinding,
  getCharacterModels,
  getCharacters,
  getVoiceTrainingJob,
  saveCharacterBinding,
  streamCharacterTts,
  streamLlmReply,
  switchCharacterModel,
  testLlmConnection,
} from '@/api/voice';
import {
  createMoment,
  createMomentComment,
  deleteMoment,
  getMoment,
  getMoments,
  likeMoment,
  unlikeMoment,
  viewMoment,
} from '@/api/moment';
import HlsVideo from '@/components/HlsVideo';
import type {
  ChatApiMessage,
  ChatApiMember,
  ChatMessageEvent,
  SendImageMessageInput,
  SendMessageInput,
} from '@/api/chat';
import type {
  CharacterSummary,
  CharacterVoiceModelOption,
  LlmConfigInput,
} from '@/api/voice';
import type { MomentApiItem, MomentUploadProgress } from '@/api/moment';
import type { RootState, AppDispatch } from '@/store/store';
import {
  appendConversationMessage,
  fetchConversationHistory,
  MESSAGE_CACHE_TTL_MS,
  patchConversationMessage,
  refreshContacts,
  replaceConversationMessage,
  toChatMessage,
  updateContactPreview,
} from '@/store/chatSlice';
import type { ChatMessage } from '@/store/chatSlice';
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
  isPro?: boolean;
  role?: string | null;
  members?: ChatApiMember[];
}

type Message = ChatMessage;

interface Comment {
  id: string;
  author: string;
  text: string;
}

interface MomentPost {
  id: string;
  authorId?: string;
  name: string;
  avatar: string;
  text: string;
  media?: string;
  mediaType?: 'image' | 'video';
  poster?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  processingStatus: 'processing' | 'ready' | 'failed';
  processingProgress: number;
  processingError?: string;
  time: string;
  createdAt?: string;
  likes: number;
  liked: boolean;
  views: number;
  comments: Comment[];
}

const MOMENTS_PAGE_SIZE = 10;

type NotificationType = 'success' | 'warning' | 'error';

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣',
  '😊','😇','🙂','😉','😍','😘','😋','😎',
  '🤩','🥳','🤔','🤗','🤓','😏','😒','😞',
  '👍','👌','👏','🙌','💪','🙏','👋', '🎉',
  '✨','🔥','🚀','❤️','🌍','🎮','🥇','🏅',
  '🌩️','🌨️','🌧️','🌦️','🌥️','🌤️','⛈️','⛅',
  '🍉','🥬','🍇',
];

const ACTIVE_CONTACT_KEY = 'chat_active_contact';
const ACTIVE_TAB_KEY = 'chat_tab';
const SHARE_GROUP_DRAFT_KEY = 'chat_group_share_draft';
const CREATE_GROUP_DRAFT_KEY = 'chat_create_group_draft';
const LLM_CONFIG_KEY = 'character_llm_config';
const LLM_DIALOG_DRAFT_KEY = 'character_llm_dialog_draft';
const MODEL_TRAINING_DRAFT_KEY = 'character_voice_training_draft';
const SELECTED_CHARACTER_KEY = 'character_selected';
const VOICE_MODEL_KEY = 'character_voice_model';
const VOICE_TRAINING_JOB_KEY = 'character_voice_training_job';
const WEBSOCKET_HEARTBEAT_INTERVAL_MS = 25_000;
const CONTACT_PRESENCE_REFRESH_INTERVAL_MS = 30_000;
const MOMENT_IMPRESSION_DELAY_MS = 1_000;
const MOMENT_IMPRESSION_VISIBILITY_RATIO = 0.6;
const MAX_VISIBLE_GROUP_AVATARS = 20;
// Keep the encoded JSON request below the backend's 7 MB body limit.
const MAX_GROUP_AVATAR_BYTES = 4 * 1024 * 1024;
const GROUP_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function takeReadySpeechText(
  text: string,
  flush = false,
  maxCharacters = 28,
): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  let current = '';
  for (const character of text) {
    current += character;
    const currentLength = current.trim().length;
    const isBoundary = /[。！？!?；;，,：:\n]/u.test(character);
    if ((isBoundary && currentLength >= 6) || currentLength >= maxCharacters) {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    }
  }
  if (flush && current.trim()) {
    chunks.push(current.trim());
    current = '';
  }
  return { chunks, remainder: current };
}

interface VoiceMessagePlayerProps {
  audioStreamUrl?: string;
  audioSegments?: string[];
  status?: Message['audioStatus'];
  autoPlay?: boolean;
  onStreamReady?: () => void;
  onStreamError?: () => void;
  onAutoPlayStarted?: () => void;
  onAutoPlayBlocked?: () => void;
  label: string;
  generatingLabel: string;
  bufferingLabel: string;
  readyLabel: string;
  failedLabel: string;
}

function VoiceMessagePlayer({
  audioStreamUrl,
  audioSegments,
  status,
  autoPlay,
  onStreamReady,
  onStreamError,
  onAutoPlayStarted,
  onAutoPlayBlocked,
  label,
  generatingLabel,
  bufferingLabel,
  readyLabel,
  failedLabel,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamStateReportedRef = useRef<'ready' | 'failed' | null>(null);
  const autoPlayRef = useRef(Boolean(autoPlay));
  const autoPlayAttemptedRef = useRef('');
  const queuedSegmentPlayRef = useRef<number | null>(null);
  const waitingForSegmentRef = useRef<number | null>(null);
  const [activeSegment, setActiveSegment] = useState(0);
  const [isUsingStream, setIsUsingStream] = useState(Boolean(audioStreamUrl));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const segments = audioSegments || [];
  const segmentUrl = isUsingStream && audioStreamUrl
    ? audioStreamUrl
    : segments[activeSegment] || '';

  useEffect(() => {
    autoPlayRef.current = Boolean(autoPlay);
    if (!autoPlay) autoPlayAttemptedRef.current = '';
  }, [autoPlay]);

  useEffect(() => {
    setActiveSegment(current => Math.min(current, Math.max(0, segments.length - 1)));
  }, [segments.length]);

  useEffect(() => {
    streamStateReportedRef.current = null;
    if (audioStreamUrl) {
      setActiveSegment(0);
      setIsUsingStream(true);
    }
  }, [audioStreamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    if (segmentUrl) audio.load();
    const shouldContinueSegments = (
      !isUsingStream
      && queuedSegmentPlayRef.current === activeSegment
    );
    if (
      segmentUrl
      && ((isUsingStream && autoPlayRef.current) || shouldContinueSegments)
    ) {
      const attemptKey = shouldContinueSegments
        ? `continue:${activeSegment}:${segmentUrl}`
        : `stream:${segmentUrl}`;
      if (autoPlayAttemptedRef.current === attemptKey) return;
      autoPlayAttemptedRef.current = attemptKey;
      queuedSegmentPlayRef.current = null;
      void audio.play()
        .then(() => {
          setIsPlaying(true);
          if (!shouldContinueSegments) onAutoPlayStarted?.();
        })
        .catch(() => {
          setIsPlaying(false);
          if (!shouldContinueSegments) onAutoPlayBlocked?.();
        });
    }
  }, [activeSegment, isUsingStream, segmentUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, segmentUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (
      isUsingStream
      || !autoPlay
      || !segmentUrl
      || activeSegment !== 0
      || status === 'failed'
    ) {
      return;
    }
    const attemptKey = `segment:${segmentUrl}`;
    if (!audio || autoPlayAttemptedRef.current === attemptKey) return;
    autoPlayAttemptedRef.current = attemptKey;
    void audio.play()
      .then(() => {
        setIsPlaying(true);
        onAutoPlayStarted?.();
      })
      .catch(() => {
        setIsPlaying(false);
        onAutoPlayBlocked?.();
      });
  }, [activeSegment, autoPlay, isUsingStream, segmentUrl, status]);

  useEffect(() => {
    const nextSegment = waitingForSegmentRef.current;
    if (nextSegment === null) return;
    if (nextSegment < segments.length) {
      waitingForSegmentRef.current = null;
      setIsBuffering(false);
      selectSegment(nextSegment, true);
    } else if (status !== 'generating') {
      waitingForSegmentRef.current = null;
      setIsBuffering(false);
      setIsPlaying(false);
    }
  }, [segments.length, status]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !segmentUrl) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function selectSegment(nextSegment: number, autoplay = false) {
    if (isUsingStream || nextSegment < 0 || nextSegment >= segments.length) return;
    if (autoplay) queuedSegmentPlayRef.current = nextSegment;
    setActiveSegment(nextSegment);
  }

  function handleEnded() {
    if (isUsingStream) {
      queuedSegmentPlayRef.current = 0;
      setIsUsingStream(false);
      if (segments.length === 0 && status === 'generating') {
        waitingForSegmentRef.current = 0;
        setIsBuffering(true);
      } else if (segments.length === 0) {
        queuedSegmentPlayRef.current = null;
        setIsPlaying(false);
        setCurrentTime(0);
      }
    } else if (activeSegment < segments.length - 1) {
      selectSegment(activeSegment + 1, true);
    } else if (status === 'generating') {
      waitingForSegmentRef.current = activeSegment + 1;
      setIsBuffering(true);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }

  function cyclePlaybackRate() {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }

  function formatAudioTime(value: number) {
    if (!Number.isFinite(value) || value < 0) return '0:00';
    return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
  }

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const progressPercent = hasDuration
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;
  const statusLabel = isBuffering
    ? bufferingLabel
    : status === 'generating'
      ? generatingLabel
      : status === 'failed'
        ? failedLabel
        : readyLabel;
  const formattedTime = hasDuration
    ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
    : statusLabel;
  const hasMultipleSegments = !isUsingStream && segments.length > 1;

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }

  return (
    <div
      className={`voice-message-player is-${status || 'ready'}${isPlaying ? ' is-playing' : ''}${isBuffering ? ' is-buffering' : ''}`}
      aria-label={`${label}: ${statusLabel}`}
    >
      <button
        type="button"
        className="voice-message-play"
        disabled={!segmentUrl || status === 'failed'}
        onClick={togglePlayback}
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
        title={isPlaying ? `Pause ${label}` : `Play ${label}`}
      >
        {status === 'failed'
          ? <CircleAlert size={17} strokeWidth={2} aria-hidden="true" />
          : isBuffering
            ? <LoaderCircle className="voice-message-spinner" size={17} strokeWidth={2.2} aria-hidden="true" />
            : status === 'generating' && !segmentUrl
              ? <AudioLines size={17} strokeWidth={2.1} aria-hidden="true" />
              : isPlaying
                ? <Pause size={15} fill="currentColor" aria-hidden="true" />
                : <Play size={15} fill="currentColor" aria-hidden="true" />}
      </button>
      <div className="voice-message-track">
        <button
          type="button"
          className="voice-message-waveform"
          disabled={!hasDuration}
          onClick={seek}
          aria-label={`${label}: ${formattedTime}`}
          title={statusLabel}
        >
          {Array.from({ length: 30 }, (_, index) => {
            const position = ((index + 1) / 30) * 100;
            return (
              <i
                key={index}
                className={position <= progressPercent ? 'is-active' : ''}
                style={{ '--wave-height': `${30 + ((index * 23) % 66)}%` } as React.CSSProperties}
              />
            );
          })}
        </button>
        <div className="voice-message-meta">
          <span className="voice-message-time">{formattedTime}</span>
          <span className="voice-message-context" aria-live="polite">
            {(isBuffering || (status === 'generating' && hasDuration)) && (
              <span className={`voice-message-state${isBuffering ? ' is-buffering' : ''}`}>
                {isBuffering
                  ? <LoaderCircle className="voice-message-spinner" size={10} strokeWidth={2.4} aria-hidden="true" />
                  : <i aria-hidden="true" />}
                {isBuffering ? bufferingLabel : generatingLabel}
              </span>
            )}
            {!isBuffering && status !== 'generating' && hasMultipleSegments && (
              <span
                className="voice-message-segment"
                aria-label={`${label}: ${activeSegment + 1} / ${segments.length}`}
              >
                {activeSegment + 1}/{segments.length}
              </span>
            )}
          </span>
          <button
            type="button"
            className="voice-message-rate"
            disabled={!segmentUrl || status === 'failed'}
            onClick={cyclePlaybackRate}
            aria-label={`${label}: ${playbackRate}x`}
            title={`${playbackRate}x`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
      <audio
        ref={audioRef}
        className="voice-message-audio"
        src={segmentUrl}
        crossOrigin="use-credentials"
        preload="metadata"
        onLoadedMetadata={event => {
          event.currentTarget.playbackRate = playbackRate;
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
        }}
        onDurationChange={event => {
          if (Number.isFinite(event.currentTarget.duration)) {
            setDuration(event.currentTarget.duration);
          }
        }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        onCanPlay={() => {
          setIsPlaying(current => current || !audioRef.current?.paused);
          if (isUsingStream && streamStateReportedRef.current === null) {
            streamStateReportedRef.current = 'ready';
            onStreamReady?.();
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onError={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          if (isUsingStream && streamStateReportedRef.current === null) {
            streamStateReportedRef.current = 'failed';
            onStreamError?.();
          }
        }}
        onEnded={handleEnded}
        aria-label={label}
      />
    </div>
  );
}

function formatVoiceTrainingError(error: string, t: TFunction) {
  const detail = error.trim();
  if (!detail) return t('chat.modelTrainingFailed');

  if (
    /\bWinError\s*2\b/i.test(detail)
    || /系统找不到指定的文件/.test(detail)
    || /The system cannot find the file specified/i.test(detail)
  ) {
    return t('chat.modelTrainingMissingFile', { error: detail });
  }

  return detail;
}

function isTrainingVersionDirectoryConflict(error: unknown) {
  const apiMessage = getApiErrorMessage(error) || '';
  const errorMessage = error instanceof Error ? error.message : '';
  return /training version directory already exists|version directory already exists|训练版本目录已存在/i
    .test(`${apiMessage} ${errorMessage}`);
}

function uniqueTrainingVersionName(versionName: string) {
  const suffix = `retry-${Date.now().toString(36)}`;
  return `${versionName.slice(0, Math.max(1, 80 - suffix.length - 1))}-${suffix}`;
}

function contactCharacterSelectionKey(
  userId?: string | number | null,
  contactUserId?: string | number | null,
) {
  return `${SELECTED_CHARACTER_KEY}:${userId || 'guest'}:${contactUserId || 'none'}`;
}

function voiceModelStorageKey(userId?: string | number | null) {
  return `${VOICE_MODEL_KEY}:${userId || 'guest'}`;
}

function voiceTrainingJobStorageKey(userId?: string | number | null) {
  return `${VOICE_TRAINING_JOB_KEY}:${userId || 'guest'}`;
}

interface ShareCandidate {
  userId: string;
  username: string;
  avatar: string;
  online: boolean;
}

interface ShareGroupDraft {
  open?: boolean;
  memberIds: string[];
}

interface CreateGroupDraft {
  open?: boolean;
  step: 1 | 2;
  search: string;
  memberIds: string[];
  name: string;
  avatar: string;
}

interface StoredLlmConfig extends LlmConfigInput {
  connected: boolean;
}

interface LlmDialogDraft {
  open: boolean;
}

interface ModelTrainingDraft {
  open: boolean;
  nickname: string;
  versionName: string;
}

interface LlmPreset {
  id: string;
  model_name: string;
  api_request_url: string;
  effort: string;
}

const LLM_PRESETS: LlmPreset[] = [
  {
    id: 'deepseek-v4-flash',
    model_name: 'deepseek-v4-flash',
    api_request_url: 'https://api.deepseek.com',
    effort: 'low',
  },
  {
    id: 'custom',
    model_name: '',
    api_request_url: '',
    effort: '',
  },
];

const EMPTY_LLM_CONFIG: StoredLlmConfig = {
  model_name: 'deepseek-v4-flash',
  api_token: '',
  api_request_url: 'https://api.deepseek.com',
  effort: 'low',
  connected: false,
};

function normalizeLlmConfig(config: Partial<StoredLlmConfig>): StoredLlmConfig {
  const modelName = typeof config.model_name === 'string'
    ? config.model_name
    : EMPTY_LLM_CONFIG.model_name;
  const effort = typeof config.effort === 'string' ? config.effort : '';
  return {
    ...EMPTY_LLM_CONFIG,
    ...config,
    effort: effort.trim() || (
      modelName.trim().toLowerCase() === 'deepseek-v4-flash' ? 'low' : ''
    ),
  };
}

function readLocalDraft<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readSessionDraft<T>(key: string): T | null {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

interface MomentImpressionProps {
  enabled: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
  onQualified: () => void;
}

function MomentImpression({
  enabled,
  className,
  style,
  children,
  onQualified,
}: MomentImpressionProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const onQualifiedRef = useRef(onQualified);
  onQualifiedRef.current = onQualified;

  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || !element) return;

    let timer: number | undefined;
    let visibleEnough = false;
    let qualified = false;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const scheduleQualification = () => {
      clearTimer();
      if (
        qualified
        || !visibleEnough
        || document.visibilityState !== 'visible'
      ) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        if (
          qualified
          || !visibleEnough
          || document.visibilityState !== 'visible'
        ) {
          return;
        }
        qualified = true;
        onQualifiedRef.current();
      }, MOMENT_IMPRESSION_DELAY_MS);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visibleEnough = entry.isIntersecting
        && entry.intersectionRatio >= MOMENT_IMPRESSION_VISIBILITY_RATIO;
      if (visibleEnough) {
        scheduleQualification();
      } else {
        clearTimer();
      }
    }, {
      threshold: [0, MOMENT_IMPRESSION_VISIBILITY_RATIO, 1],
    });
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleQualification();
      } else {
        clearTimer();
      }
    };

    observer.observe(element);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  return (
    <div ref={elementRef} className={className} style={style}>
      {children}
    </div>
  );
}

function fallbackAvatar(name: string) {
  return defaultAvatarDataUrl(name);
}

async function groupAvatarFileToDataUrl(file: File) {
  if (!GROUP_AVATAR_TYPES.has(file.type) || file.size > MAX_GROUP_AVATAR_BYTES) {
    throw new Error('invalid-avatar');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('invalid-avatar'));
      element.src = sourceUrl;
    });
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('invalid-avatar');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/webp', 0.86);
    const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
    const decodedBytes = Math.ceil((base64Length * 3) / 4);
    if (decodedBytes > MAX_GROUP_AVATAR_BYTES) throw new Error('invalid-avatar');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function groupAvatarDataUrlIsValid(value: string) {
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i.test(value);
}

function getApiErrorStatus(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status;
}

function getApiErrorMessage(error: unknown) {
  const data = (error as {
    response?: {
      data?: {
        message?: string;
        detail?: string | Array<{ msg?: string }>;
      };
    };
  })?.response?.data;
  if (data?.message) return data.message;
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) {
    return data.detail.map(item => item.msg).filter(Boolean).join(', ');
  }
  return undefined;
}

function createGroupErrorMessage(error: unknown, fallback: string, badRequestMessage: string) {
  const status = getApiErrorStatus(error);
  const message = getApiErrorMessage(error);
  if (message) return message;
  if (status === 400) return badRequestMessage;
  return fallback;
}

function validateCreateGroupMemberIds(memberIds: string[]) {
  return memberIds.length > 0 && memberIds.every(isUuid);
}

function validateCreateGroupAvatar(value: string) {
  return groupAvatarDataUrlIsValid(value);
}

function isCreateGroupPayloadValid(name: string, memberIds: string[], avatar: string) {
  return name.length > 0
    && name.length <= 255
    && validateCreateGroupMemberIds(memberIds)
    && validateCreateGroupAvatar(avatar);
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

function historyDateLabel(value: string, t: TFunction) {
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

  if (dayDifference === 0) return t('chat.today');
  if (dayDifference === 1) return t('chat.yesterday');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function messageTimeLabel(value: string, language: string) {
  return new Date(value).toLocaleTimeString(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function localizedMockLabel(value: string, t: TFunction) {
  if (value === 'Yesterday') return t('chat.yesterday');
  if (value === 'Monday') return t('chat.monday');
  if (value === 'Photo') return t('chat.photo');
  return value;
}

function localizedGroupName(value: string, t: TFunction) {
  return value === 'Genshin Impact' ? t('chat.groupNames.genshinImpact') : value;
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
  {
    id: 'mock:group:1',
    name: 'Project Team',
    type: 'group',
    avatar: fallbackAvatar('Project Team'),
    lastMsg: 'See you tomorrow',
    time: '11:30',
    members: [
      {
        user_id: 'mock:user:2',
        username: 'Alice',
        avatar: fallbackAvatar('Alice'),
        online: true,
        created_at: '2026-01-03T09:00:00.000Z',
      },
      {
        user_id: 'mock:user:3',
        username: 'Bob',
        avatar: fallbackAvatar('Bob'),
        online: false,
        created_at: '2026-01-07T09:00:00.000Z',
      },
      {
        user_id: 'mock:user:4',
        username: 'Catherine',
        avatar: fallbackAvatar('Catherine'),
        online: true,
        created_at: '2026-01-12T09:00:00.000Z',
      },
    ],
  },
  { id: 'mock:user:2', name: 'Alice', type: 'user', avatar: fallbackAvatar('Alice'), lastMsg: 'Got it', time: '10:15', online: true },
  { id: 'mock:user:3', name: 'Bob', type: 'user', avatar: fallbackAvatar('Bob'), lastMsg: 'I fixed the code last night', time: 'Yesterday', online: false },
  { id: 'mock:user:4', name: 'Catherine', type: 'user', avatar: fallbackAvatar('Catherine'), lastMsg: 'Photo', time: 'Yesterday', online: true },
  { id: 'mock:user:5', name: 'David', type: 'user', avatar: fallbackAvatar('David'), lastMsg: 'Sure', time: 'Monday', online: false },
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

function momentTimeLabel(value: string, language: string, t: TFunction) {
  const date = new Date(value);
  const now = new Date();
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  const startOfDay = (input: Date) => new Date(
    input.getFullYear(),
    input.getMonth(),
    input.getDate(),
  ).getTime();
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (minutes < 1) return t('chat.justNow');
  if (dayDifference === 0 && minutes < 60) return t('chat.minutesAgo', { count: minutes });
  if (dayDifference === 0) return t('chat.hoursAgo', { count: Math.floor(minutes / 60) });
  if (dayDifference === 1) return t('chat.yesterday');
  return date.toLocaleDateString(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function momentFallbackAvatar(name: string) {
  return fallbackAvatar(name);
}

function formatUploadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 100) return `${Math.round(megabytes)} MB`;
  if (megabytes >= 10) return `${megabytes.toFixed(1)} MB`;
  return `${megabytes.toFixed(2)} MB`;
}

function formatUploadSpeed(bytesPerSecond: number, t: TFunction) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return t('chat.calculatingSpeed');
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

function formatRemainingTime(seconds: number, t: TFunction) {
  if (!Number.isFinite(seconds) || seconds <= 0) return t('chat.finishingSoon');
  if (seconds < 60) return t('chat.secondsRemaining', { count: Math.max(1, Math.ceil(seconds)) });
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return remainingSeconds > 0
    ? t('chat.minuteSecondsRemaining', { minutes, seconds: remainingSeconds })
    : t('chat.minutesRemaining', { count: minutes });
}

function toMomentPost(item: MomentApiItem): MomentPost {
  const media = item.media[0];
  return {
    id: item.id,
    authorId: item.user_id,
    name: item.username,
    avatar: resolveAvatarUrl(item.avatar) || momentFallbackAvatar(item.username),
    text: item.content || '',
    media: media ? resolveAssetUrl(media.url) : undefined,
    mediaType: media?.type,
    poster: media?.poster_url ? resolveAssetUrl(media.poster_url) : undefined,
    mediaWidth: media?.width,
    mediaHeight: media?.height,
    processingStatus: item.processing_status || 'ready',
    processingProgress: Math.min(100, Math.max(0, item.processing_progress ?? 100)),
    processingError: item.processing_error || undefined,
    time: item.created_at,
    createdAt: item.created_at,
    likes: item.like_count ?? 0,
    liked: item.liked ?? false,
    views: item.view_count ?? 0,
    comments: Array.isArray(item.comments)
      ? item.comments.map(comment => ({
        id: comment.id,
        author: comment.username,
        text: comment.content,
      }))
      : [],
  };
}

function notify(message: string, type: NotificationType) {
  window.dispatchEvent(new CustomEvent('app:notification', {
    detail: { message, type },
  }));
}

function insertAtSelection(
  input: HTMLInputElement | HTMLTextAreaElement | null,
  currentValue: string,
  value: string,
  updateValue: (nextValue: string) => void,
) {
  const selectionStart = input?.selectionStart ?? currentValue.length;
  const selectionEnd = input?.selectionEnd ?? selectionStart;
  const nextValue = `${currentValue.slice(0, selectionStart)}${value}${currentValue.slice(selectionEnd)}`;
  const nextCursorPosition = selectionStart + value.length;

  updateValue(nextValue);
  window.requestAnimationFrame(() => {
    input?.focus();
    input?.setSelectionRange(nextCursorPosition, nextCursorPosition);
  });
}

function Chat() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const authInitialized = useSelector((state: RootState) => state.auth.initialized);
  const remoteContacts = useSelector((state: RootState) => state.chat.contacts);
  const contactsLoading = useSelector((state: RootState) => state.chat.loading);
  const contactsInitialized = useSelector((state: RootState) => state.chat.initialized);
  const contactsError = useSelector((state: RootState) => state.chat.error);
  const contactsLastFetchedAt = useSelector((state: RootState) => state.chat.lastFetchedAt);
  const currentUserName = currentUser?.name || currentUser?.username || t('chat.you');
  const currentUserAvatar = resolveAvatarUrl(currentUser?.avatar)
    || (currentUser?.github_id
      ? `https://avatars.githubusercontent.com/u/${currentUser.github_id}?v=4`
      : fallbackAvatar(currentUserName));
  const [activeTab, setActiveTab] = useState<'chat' | 'moments'>(() => {
    return localStorage.getItem(ACTIVE_TAB_KEY) === 'moments' ? 'moments' : 'chat';
  });
  const [activeContact, setActiveContact] = useState('mock:group:1');
  const [isMemberShareOpen, setIsMemberShareOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [sharingMembers, setSharingMembers] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [createGroupStep, setCreateGroupStep] = useState<1 | 2>(1);
  const [groupSearch, setGroupSearch] = useState('');
  const [createMemberIds, setCreateMemberIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupCreateError, setGroupCreateError] = useState('');
  const [isModelTrainingOpen, setIsModelTrainingOpen] = useState(
    () => readLocalDraft<ModelTrainingDraft>(MODEL_TRAINING_DRAFT_KEY)?.open ?? false,
  );
  const [isLlmConfigOpen, setIsLlmConfigOpen] = useState(
    () => readLocalDraft<LlmDialogDraft>(LLM_DIALOG_DRAFT_KEY)?.open ?? false,
  );
  const [modelNickname, setModelNickname] = useState(
    () => readLocalDraft<ModelTrainingDraft>(MODEL_TRAINING_DRAFT_KEY)?.nickname ?? '',
  );
  const [modelVersionName, setModelVersionName] = useState(
    () => readLocalDraft<ModelTrainingDraft>(MODEL_TRAINING_DRAFT_KEY)?.versionName ?? '',
  );
  const [warFiles, setWarFiles] = useState<File[]>([]);
  const [listTextFile, setListTextFile] = useState<File | null>(null);
  const [voiceUploadProgress, setVoiceUploadProgress] = useState({
    percent: 0,
    successful: 0,
  });
  const [modelTraining, setModelTraining] = useState(false);
  const [modelTrainingError, setModelTrainingError] = useState('');
  const [activeVoiceModelId, setActiveVoiceModelId] = useState('');
  const [activeVoiceTrainingJobId, setActiveVoiceTrainingJobId] = useState('');
  const [voiceModelStatus, setVoiceModelStatus] = useState('');
  const [voiceModelErrorDetail, setVoiceModelErrorDetail] = useState('');
  const [voiceModelProgress, setVoiceModelProgress] = useState(0);
  const [voiceModelStage, setVoiceModelStage] = useState('');
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [voiceModelOptions, setVoiceModelOptions] = useState<CharacterVoiceModelOption[]>([]);
  const [selectedVoiceModelVersion, setSelectedVoiceModelVersion] = useState('');
  const [voiceModelSwitching, setVoiceModelSwitching] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [characterBindingSaving, setCharacterBindingSaving] = useState(false);
  const [llmConfig, setLlmConfig] = useState<StoredLlmConfig>(
    () => (
      normalizeLlmConfig(readSessionDraft<StoredLlmConfig>(LLM_CONFIG_KEY) || {})
    ),
  );
  const [llmConnecting, setLlmConnecting] = useState(false);
  const [selectedLlmPreset, setSelectedLlmPreset] = useState('deepseek-v4-flash');
  const [llmConfigError, setLlmConfigError] = useState('');
  const [llmConnectionStatus, setLlmConnectionStatus] = useState<
    'success' | 'failed' | ''
  >(() => {
    const savedConfig = readSessionDraft<StoredLlmConfig>(LLM_CONFIG_KEY);
    return savedConfig?.connected ? 'success' : '';
  });
  const [voiceReplyLoading, setVoiceReplyLoading] = useState(false);
  const warFilesInputRef = useRef<HTMLInputElement>(null);
  const listTextFileInputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState('');
  const guestMessages = mockMessages;
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMomentEmoji, setShowMomentEmoji] = useState(false);
  const [moments, setMoments] = useState<MomentPost[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const [momentsInitialized, setMomentsInitialized] = useState(false);
  const [momentsError, setMomentsError] = useState('');
  const [momentsLoadMoreError, setMomentsLoadMoreError] = useState('');
  const [momentsHasMore, setMomentsHasMore] = useState(true);
  const [playingMomentVideoId, setPlayingMomentVideoId] = useState<string | null>(null);
  const [momentPublishing, setMomentPublishing] = useState(false);
  const [momentUploadProgress, setMomentUploadProgress] = useState<MomentUploadProgress | null>(null);
  const [openMomentMenuId, setOpenMomentMenuId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deleteMomentId, setDeleteMomentId] = useState<string | null>(null);
  const [deletingMomentId, setDeletingMomentId] = useState<string | null>(null);
  const [completedProcessingMoments, setCompletedProcessingMoments] = useState<Set<string>>(
    new Set(),
  );
  const [momentText, setMomentText] = useState('');
  const [momentMedia, setMomentMedia] = useState<string | null>(null);
  const [momentMediaType, setMomentMediaType] = useState<'image' | 'video' | null>(null);
  const [momentFile, setMomentFile] = useState<File | null>(null);
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<Record<string, boolean>>({});
  const [commentEmojiPost, setCommentEmojiPost] = useState<string | null>(null);

  useEffect(() => {
    writeLocalDraft(MODEL_TRAINING_DRAFT_KEY, {
      open: isModelTrainingOpen,
      nickname: modelNickname,
      versionName: modelVersionName,
    } satisfies ModelTrainingDraft);
  }, [isModelTrainingOpen, modelNickname, modelVersionName]);

  useEffect(() => {
    writeLocalDraft(LLM_DIALOG_DRAFT_KEY, {
      open: isLlmConfigOpen,
    } satisfies LlmDialogDraft);
  }, [isLlmConfigOpen]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(llmConfig));
    } catch {
      // Session storage can be unavailable in private browsing contexts.
    }
  }, [llmConfig]);

  useEffect(() => {
    const userId = currentUser?.id;
    setActiveVoiceModelId(localStorage.getItem(voiceModelStorageKey(userId)) || '');
    setActiveVoiceTrainingJobId(
      localStorage.getItem(voiceTrainingJobStorageKey(userId)) || '',
    );
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const contactUserId = activeContact.startsWith('user:')
      ? contactIdFromConversation(activeContact)
      : '';

    setSelectedCharacterId('');
    if (!contactUserId || activeContact.startsWith('mock:')) {
      setCharacters([]);
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([getCharacters(), getCharacterBinding(contactUserId)])
      .then(([items, binding]) => {
        if (cancelled) return;
        setCharacters(items);
        const boundCharacterId = binding?.character_id || '';
        const fallbackCharacterId = items.find(
          character => character.train_status === 'ready' && character.voice_model,
        )?.id || '';
        setSelectedCharacterId(
          items.some(character => character.id === boundCharacterId)
            ? boundCharacterId
            : fallbackCharacterId,
        );
      })
      .catch(() => {
        if (cancelled) return;
        void getCharacters()
          .then(items => {
            if (cancelled) return;
            setCharacters(items);
            const cachedCharacterId = localStorage.getItem(
              contactCharacterSelectionKey(currentUser?.id, contactUserId),
            );
            const fallbackCharacterId = items.find(
              character => character.train_status === 'ready' && character.voice_model,
            )?.id || '';
            setSelectedCharacterId(
              items.some(character => character.id === cachedCharacterId)
                ? cachedCharacterId || ''
                : fallbackCharacterId,
            );
          })
          .catch(() => {
            if (!cancelled) setCharacters([]);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [activeContact, currentUser?.id]);

  useEffect(() => {
    const contactUserId = activeContact.startsWith('user:')
      ? contactIdFromConversation(activeContact)
      : '';
    if (selectedCharacterId && contactUserId) {
      localStorage.setItem(
        contactCharacterSelectionKey(currentUser?.id, contactUserId),
        selectedCharacterId,
      );
    }
    const selectedCharacter = characters.find(
      character => character.id === selectedCharacterId,
    );
    const modelId = selectedCharacter?.voice_model || '';
    if (modelId) {
      setActiveVoiceModelId(modelId);
      setVoiceModelStatus(selectedCharacter?.train_status || '');
      localStorage.setItem(voiceModelStorageKey(currentUser?.id), modelId);
    } else {
      setActiveVoiceModelId('');
      setVoiceModelStatus(selectedCharacter?.train_status || '');
    }
  }, [
    activeContact,
    characters,
    currentUser?.id,
    selectedCharacterId,
  ]);

  useEffect(() => {
    if (!selectedCharacterId) {
      setVoiceModelOptions([]);
      setSelectedVoiceModelVersion('');
      return;
    }

    let cancelled = false;
    void getCharacterModels(selectedCharacterId)
      .then(models => {
        if (cancelled) return;
        setVoiceModelOptions(models);
        const active = models.find(model => model.active);
        setSelectedVoiceModelVersion(active?.id || '');
      })
      .catch(() => {
        if (cancelled) return;
        setVoiceModelOptions([]);
        setSelectedVoiceModelVersion('');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCharacterId]);

  const viewedPostsRef = useRef(new Set<string>());
  const [animatingLikes, setAnimatingLikes] = useState<Set<string>>(new Set());
  const [activeIndicatorTop, setActiveIndicatorTop] = useState(0);
  const chatImageRef = useRef<HTMLInputElement>(null);
  const momentImageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const msgListRef = useRef<HTMLDivElement>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const messageListNearBottomRef = useRef(true);
  const lastScrolledConversationRef = useRef('');
  const wasHistoryLoadingRef = useRef(false);
  const wasHistoryLoadingMoreRef = useRef(false);
  const historyLoadMoreScrollHeightRef = useRef(0);
  const historyLoadMoreConversationRef = useRef('');
  const imagePreviewUrlsRef = useRef(new Set<string>());
  const contactsPanelRef = useRef<HTMLElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const momentEmojiPickerRef = useRef<HTMLDivElement>(null);
  const commentEmojiPickerRef = useRef<HTMLDivElement>(null);
  const momentMenuRef = useRef<HTMLDivElement>(null);
  const momentsFeedRef = useRef<HTMLDivElement>(null);
  const momentVideoElementsRef = useRef(new Map<string, HTMLDivElement>());
  const momentsLoadingRef = useRef(false);
  const momentsCursorRef = useRef<{ createdAt: string; id: string } | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const isChatComposingRef = useRef(false);
  const commentInputRefs = useRef(new Map<string, HTMLInputElement>());
  const processingFailureNotifiedRef = useRef(new Set<string>());
  const processingCompletionTimersRef = useRef(new Map<string, number>());
  const voiceModelNoticeRef = useRef('');
  const voiceReplyInFlightRef = useRef(false);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const restoredGroupDialogDraftsRef = useRef(new Set<string>());
  const momentLikeRequestsRef = useRef(new Set<string>());
  const momentCommentRequestsRef = useRef(new Set<string>());
  const visibleContacts = useMemo<Contact[]>(
    () => currentUser ? remoteContacts : contacts,
    [currentUser, remoteContacts],
  );
  const activeContactInfo = useMemo(
    () => visibleContacts.find(contact => contact.id === activeContact) || null,
    [activeContact, visibleContacts],
  );
  const isSelectedSystemUser = activeContactInfo?.type === 'user'
    && activeContactInfo.role === 'system';
  const canSwitchVoiceModel = currentUser?.role === 'admin'
    || currentUser?.role === 'super_admin';
  const voiceModelButtonState = voiceModelStatus === 'ready'
    ? ' is-ready'
    : ['queued', 'uploading', 'training', 'downloading'].includes(voiceModelStatus)
      ? ' is-training'
      : voiceModelStatus === 'failed'
        ? ' is-failed'
        : '';
  const voiceModelButtonTitle = voiceModelStatus === 'ready'
    ? t('chat.modelTrainingReady', { model: activeVoiceModelId })
    : ['queued', 'uploading', 'training', 'downloading'].includes(voiceModelStatus)
      ? t('chat.modelTrainingInProgress', { model: activeVoiceModelId })
      : voiceModelStatus === 'failed'
        ? t('chat.modelTrainingFailed')
        : t('chat.configureModelTraining');
  const trainingProgressVisible = modelTraining || Boolean(
    activeVoiceTrainingJobId
    && ['queued', 'uploading', 'training', 'downloading', 'ready', 'failed'].includes(
      voiceModelStatus,
    ),
  );
  const trainingProgressPercent = modelTraining
    ? Math.max(1, Math.round(voiceUploadProgress.percent * 0.4))
    : voiceModelStatus === 'ready'
      ? 100
      : ['uploading', 'training', 'downloading'].includes(voiceModelStatus)
        ? Math.max(1, Math.min(99, voiceModelProgress || 1))
        : voiceModelStatus === 'queued'
          ? Math.max(1, voiceModelProgress || 1)
          : 0;
  const activeConversationId = activeContactInfo?.id || '';
  const activeConversationCache = useSelector(
    (state: RootState) => state.chat.conversations[activeConversationId],
  );
  const activeMessages = currentUser
    ? activeConversationCache?.messages || []
    : guestMessages[activeConversationId] || [];
  const historyLoading = Boolean(currentUser && activeConversationCache?.loading);
  const historyLoadingMore = Boolean(currentUser && activeConversationCache?.loadingMore);
  const activeGroupMembers = useMemo(
    () => {
      if (activeContactInfo?.type !== 'group') return [];

      return [...(activeContactInfo.members || [])]
        .map((member, index) => ({
          member,
          index,
          createdAt: Date.parse(member.created_at),
        }))
        .sort((left, right) => {
          if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
          return left.index - right.index;
        })
        .map(({ member }) => member);
    },
    [activeContactInfo],
  );
  const existingGroupMemberIds = useMemo(
    () => new Set(activeGroupMembers.map(member => member.user_id)),
    [activeGroupMembers],
  );
  const shareCandidates = useMemo<ShareCandidate[]>(() => {
    const candidates = new Map<string, ShareCandidate>();

    visibleContacts
      .filter(contact => contact.type === 'user')
      .forEach(contact => {
        candidates.set(contact.id.replace(/^user:/, ''), {
          userId: contact.id.replace(/^user:/, ''),
          username: contact.name,
          avatar: contact.avatar,
          online: Boolean(contact.online),
        });
      });

    activeGroupMembers.forEach(member => {
      candidates.set(member.user_id, {
        userId: member.user_id,
        username: member.username,
        avatar: resolveChatAvatarUrl(member.avatar, member.username),
        online: member.online,
      });
    });

    return Array.from(candidates.values()).sort((a, b) => {
      const memberOrder = Number(existingGroupMemberIds.has(b.userId))
        - Number(existingGroupMemberIds.has(a.userId));
      return memberOrder || a.username.localeCompare(b.username);
    });
  }, [activeGroupMembers, existingGroupMemberIds, visibleContacts]);
  const createGroupCandidates = useMemo<ShareCandidate[]>(
    () => visibleContacts
      .filter(contact => (
        contact.type === 'user'
        && contact.id.replace(/^user:/, '') !== currentUser?.id
      ))
      .map(contact => ({
        userId: contact.id.replace(/^user:/, ''),
        username: contact.name,
        avatar: contact.avatar,
        online: Boolean(contact.online),
      }))
      .sort((a, b) => a.username.localeCompare(b.username)),
    [currentUser?.id, visibleContacts],
  );
  const selectedCreateMembers = useMemo(
    () => createGroupCandidates.filter(candidate => createMemberIds.has(candidate.userId)),
    [createGroupCandidates, createMemberIds],
  );
  const filteredCreateGroupCandidates = useMemo(() => {
    const search = groupSearch.trim().toLocaleLowerCase();
    if (!search) return createGroupCandidates;
    return createGroupCandidates.filter(candidate => (
      candidate.username.toLocaleLowerCase().includes(search)
    ));
  }, [createGroupCandidates, groupSearch]);
  const isConversationLoading = Boolean(
    currentUser
      && !activeContactInfo
      && !(contactsInitialized && visibleContacts.length === 0),
  );
  const momentInputRef = useRef<HTMLTextAreaElement>(null);
  const processingMomentKey = useMemo(
    () => moments
      .filter(moment => moment.processingStatus === 'processing')
      .map(moment => moment.id)
      .sort()
      .join(','),
    [moments],
  );
  const readyMomentVideoIds = useMemo(
    () => moments
      .filter(moment => (
        moment.media
        && moment.mediaType === 'video'
        && moment.processingStatus === 'ready'
        && !completedProcessingMoments.has(moment.id)
      ))
      .map(moment => moment.id),
    [moments, completedProcessingMoments],
  );
  const readyMomentVideoKey = readyMomentVideoIds.join(',');
  const loadMoments = async (reset = false) => {
    if (momentsLoadingRef.current || (!reset && !momentsHasMore)) return;
    momentsLoadingRef.current = true;
    setMomentsLoading(true);
    if (reset) {
      setMomentsError('');
      setMomentsLoadMoreError('');
    } else {
      setMomentsLoadMoreError('');
    }

    try {
      const cursor = reset ? null : momentsCursorRef.current;
      const data = await getMoments(cursor || undefined);
      const nextMoments = data.map(toMomentPost);
      setMoments(previous => {
        if (reset) return nextMoments;
        const existingIds = new Set(previous.map(moment => moment.id));
        return [
          ...previous,
          ...nextMoments.filter(moment => !existingIds.has(moment.id)),
        ];
      });
      const lastMoment = data[data.length - 1];
      if (lastMoment) {
        momentsCursorRef.current = {
          createdAt: lastMoment.created_at,
          id: lastMoment.id,
        };
      } else if (reset) {
        momentsCursorRef.current = null;
      }
      setMomentsHasMore(data.length === MOMENTS_PAGE_SIZE);
      setMomentsInitialized(true);
    } catch {
      if (reset || !momentsInitialized) {
        setMomentsError(t('chat.loadMomentsFailed'));
      } else {
        setMomentsLoadMoreError(t('chat.loadMoreMomentsFailed'));
      }
    } finally {
      momentsLoadingRef.current = false;
      setMomentsLoading(false);
    }
  };

  function handleMomentsScroll(event: React.UIEvent<HTMLDivElement>) {
    const feed = event.currentTarget;
    const distanceToBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    if (distanceToBottom <= 320) {
      void loadMoments();
    }
  }

  useEffect(() => {
    if (!showEmoji && !showMomentEmoji && commentEmojiPost === null) return;

    const closeEmojiPickersOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (showEmoji && !emojiPickerRef.current?.contains(target)) {
        setShowEmoji(false);
      }
      if (showMomentEmoji && !momentEmojiPickerRef.current?.contains(target)) {
        setShowMomentEmoji(false);
      }
      if (commentEmojiPost !== null && !commentEmojiPickerRef.current?.contains(target)) {
        setCommentEmojiPost(null);
      }
    };

    document.addEventListener('pointerdown', closeEmojiPickersOutside);
    return () => document.removeEventListener('pointerdown', closeEmojiPickersOutside);
  }, [showEmoji, showMomentEmoji, commentEmojiPost]);

  useEffect(() => {
    if (openMomentMenuId === null) return;

    const closeMomentMenuOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !momentMenuRef.current?.contains(target)) {
        setOpenMomentMenuId(null);
      }
    };

    document.addEventListener('pointerdown', closeMomentMenuOutside);
    return () => document.removeEventListener('pointerdown', closeMomentMenuOutside);
  }, [openMomentMenuId]);

  useEffect(() => {
    if (openMomentMenuId === null && deleteMomentId === null && previewImage === null) return;

    const closeMomentOverlays = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || deletingMomentId !== null) return;
      setOpenMomentMenuId(null);
      setDeleteMomentId(null);
      setPreviewImage(null);
    };

    document.addEventListener('keydown', closeMomentOverlays);
    return () => document.removeEventListener('keydown', closeMomentOverlays);
  }, [openMomentMenuId, deleteMomentId, deletingMomentId, previewImage]);

  useEffect(() => {
    if (!isMemberShareOpen && !isCreateGroupOpen) return;

    const closeGroupDialogs = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sharingMembers || groupCreating) return;
      if (isMemberShareOpen) closeMemberShareDialog();
      if (isCreateGroupOpen) closeCreateGroupDialog();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeGroupDialogs);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeGroupDialogs);
    };
  }, [groupCreating, isCreateGroupOpen, isMemberShareOpen, sharingMembers]);

  useEffect(() => {
    if (previewImage === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewImage]);

  useEffect(() => {
    if (currentUser) {
      const savedTab = localStorage.getItem(`${ACTIVE_TAB_KEY}:${currentUser.id}`)
        || localStorage.getItem(ACTIVE_TAB_KEY);
      const restoredTab = savedTab === 'moments' ? 'moments' : 'chat';
      setActiveTab(restoredTab);
      setActiveContact(localStorage.getItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`) || '');
      localStorage.setItem(ACTIVE_TAB_KEY, restoredTab);
    } else {
      setActiveContact('mock:group:1');
    }
  }, [currentUser?.id]);

  useEffect(() => {
    setMoments([]);
    setMomentsInitialized(false);
    setMomentsError('');
    setMomentsLoadMoreError('');
    setMomentsHasMore(true);
    setPlayingMomentVideoId(null);
    momentsCursorRef.current = null;
  }, [currentUser?.id]);

  function selectTab(tab: 'chat' | 'moments') {
    setActiveTab(tab);
    if (tab !== 'moments') setPlayingMomentVideoId(null);
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
    if (currentUser) {
      localStorage.setItem(`${ACTIVE_TAB_KEY}:${currentUser.id}`, tab);
    }
  }

  useEffect(() => {
    if (!authInitialized || !currentUser) return;
    dispatch(refreshContacts({ silent: remoteContacts.length > 0 }));
  }, [authInitialized, currentUser?.id, dispatch]);

  useEffect(() => {
    if (
      !authInitialized
      || activeTab !== 'moments'
      || momentsInitialized
      || momentsLoading
      || momentsError
    ) {
      return;
    }
    void loadMoments(true);
  }, [activeTab, authInitialized, currentUser?.id, momentsInitialized, momentsLoading, momentsError]);

  useEffect(() => {
    const feed = momentsFeedRef.current;
    if (activeTab !== 'moments' || !feed || !readyMomentVideoKey) {
      setPlayingMomentVideoId(null);
      return;
    }

    const visibleRatios = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const momentId = (entry.target as HTMLElement).dataset.momentVideoId;
        if (!momentId) return;
        const targetHeight = entry.boundingClientRect.height;
        const rootHeight = entry.rootBounds?.height || feed.clientHeight;
        const visibleHeight = entry.intersectionRect.height;
        const effectiveHeight = Math.min(targetHeight, rootHeight);
        const visibleRatio = effectiveHeight > 0 ? visibleHeight / effectiveHeight : 0;
        visibleRatios.set(momentId, entry.isIntersecting ? visibleRatio : 0);
      });

      let nextPlayingId: string | null = null;
      let highestRatio = 0;
      readyMomentVideoIds.forEach(momentId => {
        const ratio = visibleRatios.get(momentId) || 0;
        if (ratio >= 0.6 && ratio > highestRatio) {
          highestRatio = ratio;
          nextPlayingId = momentId;
        }
      });
      setPlayingMomentVideoId(current => current === nextPlayingId ? current : nextPlayingId);
    }, {
      root: feed,
      threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1],
    });

    readyMomentVideoIds.forEach(momentId => {
      const element = momentVideoElementsRef.current.get(momentId);
      if (element) observer.observe(element);
    });

    return () => {
      observer.disconnect();
      setPlayingMomentVideoId(null);
    };
  }, [activeTab, readyMomentVideoKey]);

  useEffect(() => {
    return () => {
      if (momentMedia?.startsWith('blob:')) URL.revokeObjectURL(momentMedia);
    };
  }, [momentMedia]);

  useEffect(() => {
    const timers = processingCompletionTimersRef.current;
    return () => {
      timers.forEach(timerId => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !processingMomentKey) return;

    const momentIds = processingMomentKey.split(',');
    let disposed = false;
    let polling = false;
    let intervalId: number | undefined;
    let initialTimerId: number | undefined;

    const refreshProcessingMoments = async () => {
      if (disposed || polling) return;
      polling = true;
      const results = await Promise.allSettled(momentIds.map(id => getMoment(id)));
      polling = false;
      if (disposed) return;

      const updates = new Map<string, MomentPost>();
      results.forEach(result => {
        if (result.status !== 'fulfilled') return;
        const post = toMomentPost(result.value);
        updates.set(post.id, post);
        if (
          post.processingStatus === 'ready'
          && !processingCompletionTimersRef.current.has(post.id)
        ) {
          setCompletedProcessingMoments(previous => new Set(previous).add(post.id));
          const timerId = window.setTimeout(() => {
            setCompletedProcessingMoments(previous => {
              const next = new Set(previous);
              next.delete(post.id);
              return next;
            });
            processingCompletionTimersRef.current.delete(post.id);
          }, 900);
          processingCompletionTimersRef.current.set(post.id, timerId);
        }
        if (
          post.processingStatus === 'failed'
          && !processingFailureNotifiedRef.current.has(post.id)
        ) {
          processingFailureNotifiedRef.current.add(post.id);
          notify(`${t('chat.videoProcessingFailed')}. ${t('chat.publishVideoAgain')}`, 'error');
        }
      });
      if (updates.size > 0) {
        setMoments(previous => previous.map(moment => {
          const update = updates.get(moment.id);
          if (!update) return moment;
          return {
            ...update,
            likes: moment.likes,
            liked: moment.liked,
            views: moment.views,
            comments: moment.comments,
          };
        }));
      }
    };

    initialTimerId = window.setTimeout(() => void refreshProcessingMoments(), 1500);
    intervalId = window.setInterval(() => void refreshProcessingMoments(), 2000);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, processingMomentKey]);

  useEffect(() => {
    if (!currentUser) return;

    let socket: WebSocket | null = null;
    let connectTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let disposed = false;
    let reconnectDelay = 1000;

    const stopHeartbeat = () => {
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
    };

    const connect = () => {
      if (disposed) return;
      const currentSocket = new WebSocket(messageWebSocketUrl());
      socket = currentSocket;

      currentSocket.onopen = () => {
        reconnectDelay = 1000;
        const sendHeartbeat = () => {
          if (currentSocket.readyState === WebSocket.OPEN) {
            currentSocket.send(JSON.stringify({ type: 'heartbeat' }));
          }
        };
        sendHeartbeat();
        stopHeartbeat();
        heartbeatTimer = window.setInterval(sendHeartbeat, WEBSOCKET_HEARTBEAT_INTERVAL_MS);
      };

      currentSocket.onmessage = event => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isChatMessageEvent(payload)) return;
        if (payload.event !== 'message' || payload.message.send_id === currentUser.id) return;

        const conversationId = messageConversationId(payload.message, currentUser.id);
        const incoming = toChatMessage(payload.message, currentUser.id);
        if (!conversationId || !incoming) return;

        dispatch(appendConversationMessage({ conversationId, message: incoming }));
        if (payload.message.content) {
          dispatch(updateContactPreview({
            id: conversationId,
            content: payload.message.content,
            lastMessageTime: payload.message.created_at,
          }));
        }
      };

      currentSocket.onclose = () => {
        stopHeartbeat();
        if (socket === currentSocket) socket = null;
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      };

      currentSocket.onerror = () => {};
    };

    // StrictMode cleans up the first effect immediately in development.
    // Deferring avoids creating a socket that would be closed while connecting.
    connectTimer = window.setTimeout(connect, 0);
    return () => {
      disposed = true;
      if (connectTimer !== undefined) window.clearTimeout(connectTimer);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      stopHeartbeat();

      const currentSocket = socket;
      socket = null;
      if (!currentSocket) return;

      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      if (currentSocket.readyState === WebSocket.CONNECTING) {
        currentSocket.onopen = () => currentSocket.close(1000, 'Chat closed');
      } else {
        currentSocket.onopen = null;
        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.close(1000, 'Chat closed');
        }
      }
    };
  }, [currentUser?.id, dispatch]);

  useEffect(() => {
    if (!currentUser) return;

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        dispatch(refreshContacts({ silent: true }));
      }
    }, CONTACT_PRESENCE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshTimer);
  }, [currentUser?.id, dispatch]);

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
    dispatch(fetchConversationHistory({
      conversationId,
      chatType,
      contactId,
      userId: currentUser.id,
    }));
  }, [activeConversationId, activeContactInfo?.type, currentUser?.id, dispatch]);

  useEffect(() => {
    if (
      !currentUser
      || !activeContactInfo
      || activeContactInfo.id.startsWith('mock:')
      || !activeConversationCache?.fetchedAt
    ) {
      return;
    }

    const elapsed = Date.now() - activeConversationCache.fetchedAt;
    const timer = window.setTimeout(() => {
      dispatch(fetchConversationHistory({
        conversationId: activeContactInfo.id,
        chatType: activeContactInfo.type === 'group' ? 'public' : 'private',
        contactId: contactIdFromConversation(activeContactInfo.id),
        userId: currentUser.id,
      }));
    }, Math.max(0, MESSAGE_CACHE_TTL_MS - elapsed + 50));

    return () => window.clearTimeout(timer);
  }, [
    activeContactInfo?.id,
    activeContactInfo?.type,
    activeConversationCache?.fetchedAt,
    currentUser?.id,
    dispatch,
  ]);

  function handleMessageListScroll(event: React.UIEvent<HTMLDivElement>) {
    const messageList = event.currentTarget;
    messageListNearBottomRef.current = (
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight <= 96
    );
    if (
      messageList.scrollTop > 80
      || !currentUser
      || !activeContactInfo
      || activeContactInfo.id.startsWith('mock:')
      || !activeConversationCache?.initialized
      || !activeConversationCache.hasMore
      || activeConversationCache.loadingMore
    ) {
      return;
    }

    historyLoadMoreScrollHeightRef.current = messageList.scrollHeight;
    historyLoadMoreConversationRef.current = activeContactInfo.id;
    dispatch(fetchConversationHistory({
      conversationId: activeContactInfo.id,
      chatType: activeContactInfo.type === 'group' ? 'public' : 'private',
      contactId: contactIdFromConversation(activeContactInfo.id),
      userId: currentUser.id,
      mode: 'older',
    }));
  }

  function selectContact(contactId: string) {
    setActiveContact(contactId);
    if (currentUser) {
      localStorage.setItem(`${ACTIVE_CONTACT_KEY}:${currentUser.id}`, contactId);
    }
  }

  async function handleCharacterChange(characterId: string) {
    const contactUserId = activeContactInfo?.type === 'user'
      ? contactIdFromConversation(activeContactInfo.id)
      : '';
    if (!currentUser || !contactUserId || activeContactInfo?.id.startsWith('mock:')) {
      setSelectedCharacterId(characterId);
      return;
    }

    const previousCharacterId = selectedCharacterId;
    setSelectedCharacterId(characterId);
    localStorage.setItem(
      contactCharacterSelectionKey(currentUser.id, contactUserId),
      characterId,
    );
    setCharacterBindingSaving(true);
    try {
      await saveCharacterBinding(contactUserId, characterId || null);
    } catch (error) {
      setSelectedCharacterId(previousCharacterId);
      if (previousCharacterId) {
        localStorage.setItem(
          contactCharacterSelectionKey(currentUser.id, contactUserId),
          previousCharacterId,
        );
      } else {
        localStorage.removeItem(
          contactCharacterSelectionKey(currentUser.id, contactUserId),
        );
      }
      notify(getApiErrorMessage(error) || t('chat.characterSaveFailed'), 'error');
    } finally {
      setCharacterBindingSaving(false);
    }
  }

  async function handleVoiceModelChange(modelId: string) {
    if (!selectedCharacterId || !modelId || voiceModelSwitching) return;
    const previousModelId = selectedVoiceModelVersion;
    const requestedModel = voiceModelOptions.find(model => model.id === modelId);
    setSelectedVoiceModelVersion(modelId);
    setVoiceModelSwitching(true);
    try {
      await switchCharacterModel(selectedCharacterId, modelId);
      const [models, updatedCharacters] = await Promise.all([
        getCharacterModels(selectedCharacterId),
        getCharacters(),
      ]);
      const active = models.find(model => model.active);
      setVoiceModelOptions(models);
      setSelectedVoiceModelVersion(active?.id || modelId);
      setCharacters(updatedCharacters);
      const selectedCharacter = updatedCharacters.find(
        character => character.id === selectedCharacterId,
      );
      if (selectedCharacter?.voice_model) {
        setActiveVoiceModelId(selectedCharacter.voice_model);
        setVoiceModelStatus(selectedCharacter.train_status);
        localStorage.setItem(
          voiceModelStorageKey(currentUser?.id),
          selectedCharacter.voice_model,
        );
      }
      notify(
        t('chat.voiceModelSwitched', { model: requestedModel?.name || modelId }),
        'success',
      );
    } catch (error) {
      setSelectedVoiceModelVersion(previousModelId);
      notify(getApiErrorMessage(error) || t('chat.voiceModelSwitchFailed'), 'error');
    } finally {
      setVoiceModelSwitching(false);
    }
  }

  function shareDraftKey() {
    if (!currentUser || activeContactInfo?.type !== 'group') return '';
    return `${SHARE_GROUP_DRAFT_KEY}:${currentUser.id}:${activeContactInfo.id.replace(/^group:/, '')}`;
  }

  function createGroupDraftKey() {
    return currentUser ? `${CREATE_GROUP_DRAFT_KEY}:${currentUser.id}` : '';
  }

  function openMemberShareDialog() {
    const key = shareDraftKey();
    const draft = key ? readLocalDraft<ShareGroupDraft>(key) : null;
    const candidateIds = new Set(shareCandidates.map(candidate => candidate.userId));
    setSelectedMemberIds(new Set(
      (draft?.memberIds || []).filter(memberId => (
        candidateIds.has(memberId) && !existingGroupMemberIds.has(memberId)
      )),
    ));
    setIsMemberShareOpen(true);
  }

  function persistMemberShareDraft(open: boolean) {
    const key = shareDraftKey();
    if (!key) return;
    writeLocalDraft(key, {
      open,
      memberIds: Array.from(selectedMemberIds),
    } satisfies ShareGroupDraft);
  }

  function closeMemberShareDialog() {
    if (sharingMembers) return;
    const key = shareDraftKey();
    if (key) localStorage.removeItem(key);
    setIsMemberShareOpen(false);
    setSelectedMemberIds(new Set());
  }

  function openCreateGroupDialog() {
    const key = createGroupDraftKey();
    const draft = key ? readLocalDraft<CreateGroupDraft>(key) : null;
    const candidateIds = new Set(createGroupCandidates.map(candidate => candidate.userId));
    const memberIds = (draft?.memberIds || []).filter(memberId => candidateIds.has(memberId));
    setCreateGroupStep(draft?.step === 2 && memberIds.length > 0 ? 2 : 1);
    setGroupSearch(draft?.search || '');
    setCreateMemberIds(new Set(memberIds));
    setGroupName(draft?.name || '');
    setGroupAvatar(draft?.avatar || '');
    setGroupCreateError('');
    setIsCreateGroupOpen(true);
  }

  function persistCreateGroupDraft(open: boolean) {
    const key = createGroupDraftKey();
    if (!key) return;
    const draft = {
      open,
      step: createGroupStep,
      search: groupSearch,
      memberIds: Array.from(createMemberIds),
      name: groupName,
      avatar: groupAvatar,
    } satisfies CreateGroupDraft;
    if (!writeLocalDraft(key, draft) && groupAvatar) {
      writeLocalDraft(key, { ...draft, avatar: '' });
    }
  }

  function closeCreateGroupDialog() {
    if (groupCreating) return;
    const key = createGroupDraftKey();
    if (key) localStorage.removeItem(key);
    setIsCreateGroupOpen(false);
    setCreateGroupStep(1);
    setGroupSearch('');
    setCreateMemberIds(new Set());
    setGroupName('');
    setGroupAvatar('');
    setGroupCreateError('');
  }

  function closeModelTrainingDialog() {
    if (modelTraining) return;
    setIsModelTrainingOpen(false);
    setModelTrainingError('');
  }

  function handleWarFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    setWarFiles(Array.from(event.target.files || []));
    setVoiceUploadProgress({ percent: 0, successful: 0 });
    event.target.value = '';
  }

  function handleListTextFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setListTextFile(event.target.files?.[0] || null);
    event.target.value = '';
  }

  async function handleStartModelTraining() {
    const nickname = modelNickname.trim();
    const versionName = modelVersionName.trim();
    if (
      !nickname
      || !versionName
      || warFiles.length === 0
      || warFiles.some(file => file.size === 0)
      || !listTextFile
      || listTextFile.size === 0
    ) {
      setModelTrainingError(t('chat.modelTrainingFilesRequired'));
      return;
    }

    setModelTraining(true);
    setModelTrainingError('');
    setVoiceUploadProgress({ percent: 1, successful: 0 });
    const uploadTotalBytes = [...warFiles, listTextFile].reduce(
      (total, file) => total + file.size,
      0,
    );
    const uploadFallbackTimer = window.setInterval(() => {
      setVoiceUploadProgress(current => (
        current.percent >= 95
          ? current
          : { ...current, percent: Math.min(95, current.percent + 1) }
      ));
    }, 500);
    try {
      const submitTraining = (requestedVersionName: string) => createVoiceTrainingJob({
        nickname,
        versionName: requestedVersionName,
        audioFiles: warFiles,
        listFile: listTextFile,
        onUploadProgress: progress => {
          const total = progress.total || uploadTotalBytes;
          const percent = total > 0
            ? Math.min(100, Math.round((progress.loaded / total) * 100))
            : 0;
          setVoiceUploadProgress(current => ({ ...current, percent }));
        },
      });
      let submittedVersionName = versionName;
      let job;
      try {
        job = await submitTraining(submittedVersionName);
      } catch (error) {
        if (!isTrainingVersionDirectoryConflict(error)) throw error;
        submittedVersionName = uniqueTrainingVersionName(versionName);
        setModelVersionName(submittedVersionName);
        setModelTrainingError(t('chat.modelTrainingVersionConflictRetry', {
          version: submittedVersionName,
        }));
        job = await submitTraining(submittedVersionName);
      }
      setVoiceUploadProgress({
        percent: 100,
        successful: warFiles.length,
      });
      setActiveVoiceTrainingJobId(job.id);
      setActiveVoiceModelId(job.model_id);
      setVoiceModelStatus(job.status);
      setVoiceModelErrorDetail(job.error || '');
      setVoiceModelProgress(job.progress || 0);
      setVoiceModelStage(job.stage || '');
      localStorage.setItem(voiceTrainingJobStorageKey(currentUser?.id), job.id);
      notify(t('chat.modelTrainingQueued', { model: job.model_id }), 'success');
    } catch (error) {
      const apiError = getApiErrorMessage(error);
      setModelTrainingError(
        apiError === 'Another training job is already running'
          ? t('chat.modelTrainingBusy')
          : apiError || t('chat.modelTrainingFailed'),
      );
    } finally {
      window.clearInterval(uploadFallbackTimer);
      setModelTraining(false);
    }
  }

  async function handleConnectLlm() {
    const normalizedConfig = {
      model_name: llmConfig.model_name.trim(),
      api_token: llmConfig.api_token.trim(),
      api_request_url: llmConfig.api_request_url.trim(),
      effort: llmConfig.effort.trim() || (
        llmConfig.model_name.trim().toLowerCase() === 'deepseek-v4-flash' ? 'low' : ''
      ),
    };
    if (
      !normalizedConfig.model_name
      || !normalizedConfig.api_token
      || !normalizedConfig.api_request_url
      || !normalizedConfig.effort
    ) {
      setLlmConfigError(t('chat.llmConfigRequired'));
      return;
    }

    setLlmConnecting(true);
    setLlmConfigError('');
    setLlmConnectionStatus('');
    try {
      await testLlmConnection(normalizedConfig);
      const connectedConfig = { ...normalizedConfig, connected: true };
      setLlmConfig(connectedConfig);
      setLlmConnectionStatus('success');
      notify(t('chat.llmConnected'), 'success');
    } catch (error) {
      setLlmConfigError(getApiErrorMessage(error) || t('chat.llmConnectionFailed'));
      setLlmConfig(current => ({ ...current, connected: false }));
      setLlmConnectionStatus('failed');
    } finally {
      setLlmConnecting(false);
    }
  }

  async function createAutomaticReply(
    conversationId: string,
    userText: string,
    messages: Message[],
    userMessagePersistence: Promise<boolean>,
  ) {
    if (voiceReplyInFlightRef.current) {
      return;
    }
    if (!llmConfig.connected) {
      setIsLlmConfigOpen(true);
      notify(t('chat.llmRequiredForVoice'), 'warning');
      return;
    }
    const characterId = selectedCharacterId;
    const selectedCharacter = characters.find(character => character.id === characterId);
    const shouldGenerateVoice = Boolean(
      selectedCharacter
      && selectedCharacter.voice_model
      && selectedCharacter.train_status === 'ready',
    );
    if (!currentUser) {
      notify(t('chat.signInToSend'), 'warning');
      return;
    }
    const clientMessageId = crypto.randomUUID();
    const temporaryId = `llm:${clientMessageId}`;
    let temporaryReplyCreated = false;
    let voiceMessageId: string | number = temporaryId;
    let pendingSpeechText = '';
    let queuedTts = Promise.resolve();
    let ttsError: unknown = null;
    let firstSpeechStreamUrl = '';
    const audioSegments: string[] = [];
    const ttsInput = shouldGenerateVoice ? {
      character_id: characterId,
      model_id: selectedVoiceModelVersion || undefined,
      language: (i18n.resolvedLanguage || i18n.language).startsWith('zh') ? 'zh' as const : 'en' as const,
      speed_factor: 1,
    } : null;

    const patchVoiceMessage = (changes: Partial<ChatMessage>) => {
      dispatch(patchConversationMessage({
        conversationId,
        messageId: voiceMessageId,
        changes,
      }));
    };
    const generateSpeechChunk = async (text: string) => {
      if (!ttsInput) return;
      const segmentCountBeforeRequest = audioSegments.length;
      if (import.meta.env.VITE_CHARACTER_TTS_WEBSOCKET !== 'false') {
        try {
          await streamCharacterTts({ ...ttsInput, text }, {
            onSegment: segment => {
              audioSegments.push(segment.audio_url);
              patchVoiceMessage({
                audioSegments: [...audioSegments],
                audioStatus: 'generating',
              });
            },
          });
          return;
        } catch (error) {
          if (audioSegments.length > segmentCountBeforeRequest) return;
        }
      }
      const generated = await generateCharacterTts({ ...ttsInput, text });
      if (!generated.audio_url) {
        throw new Error('Character TTS response has no audio URL');
      }
      audioSegments.push(generated.audio_url);
      patchVoiceMessage({
        audioSegments: [...audioSegments],
        audioStatus: 'generating',
      });
    };
    const queueSpeechText = (delta: string, flush = false) => {
      if (!ttsInput || ttsError) return;
      pendingSpeechText += delta;
      const ready = takeReadySpeechText(pendingSpeechText, flush);
      pendingSpeechText = ready.remainder;
      ready.chunks.forEach(text => {
        if (
          !firstSpeechStreamUrl
          && import.meta.env.VITE_CHARACTER_TTS_STREAMING !== 'false'
        ) {
          firstSpeechStreamUrl = characterTtsStreamUrl({ ...ttsInput, text });
          patchVoiceMessage({
            audioStreamUrl: firstSpeechStreamUrl,
            audioStatus: 'generating',
          });
          return;
        }
        queuedTts = queuedTts.then(async () => {
          if (ttsError) return;
          try {
            await generateSpeechChunk(text);
          } catch (error) {
            ttsError = error;
            patchVoiceMessage({ audioStatus: 'failed' });
          }
        });
      });
    };

    voiceReplyInFlightRef.current = true;
    setVoiceReplyLoading(true);
    try {
      const result = await streamLlmReply({
        message: userText,
        history: messages
          .filter(message => message.text.trim() && message.status !== 'failed')
          .slice(-8)
          .map(message => ({
            role: message.from === 'me' ? 'user' as const : 'assistant' as const,
            content: message.text.trim(),
          })),
        llm: {
          model_name: llmConfig.model_name,
          api_token: llmConfig.api_token,
          api_request_url: llmConfig.api_request_url,
          effort: llmConfig.effort,
        },
        character_id: characterId || undefined,
        prefer_low_latency: true,
      }, (_delta, text) => {
        if (!temporaryReplyCreated) {
          temporaryReplyCreated = true;
          const createdAt = new Date();
          dispatch(appendConversationMessage({
            conversationId,
            message: {
              id: temporaryId,
              text,
              from: 'them',
              time: createdAt.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              createdAt: createdAt.toISOString(),
              status: 'sending',
              clientMessageId,
              audioStatus: shouldGenerateVoice ? 'generating' : undefined,
              audioAutoPlay: shouldGenerateVoice,
            },
          }));
        } else {
          dispatch(patchConversationMessage({
            conversationId,
            messageId: temporaryId,
            changes: { text },
          }));
        }
        queueSpeechText(_delta);
      });
      queueSpeechText('', true);
      if (!temporaryReplyCreated) {
        temporaryReplyCreated = true;
        const createdAt = new Date();
        dispatch(appendConversationMessage({
          conversationId,
          message: {
            id: temporaryId,
            text: result.text,
            from: 'them',
            time: createdAt.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            createdAt: createdAt.toISOString(),
            status: 'sending',
            clientMessageId,
            audioStatus: shouldGenerateVoice ? 'generating' : undefined,
            audioAutoPlay: shouldGenerateVoice,
          },
        }));
      }
      if (!await userMessagePersistence) {
        throw new Error(t('chat.automaticReplyNotSaved'));
      }
      const persisted = await sendAutomaticReply({
        sender_id: contactIdFromConversation(conversationId),
        content: result.text,
        client_message_id: clientMessageId,
      });
      const persistedReply = toChatMessage(persisted, currentUser.id);
      if (!persistedReply) {
        throw new Error('Automatic reply response has no content');
      }
      dispatch(replaceConversationMessage({
        conversationId,
        temporaryId,
        message: {
          ...persistedReply,
          status: 'sent',
          audioStatus: shouldGenerateVoice ? 'generating' : undefined,
          audioStreamUrl: firstSpeechStreamUrl || undefined,
          audioSegments: shouldGenerateVoice ? [...audioSegments] : undefined,
        },
      }));
      voiceMessageId = persisted.id;
      if (shouldGenerateVoice) {
        await queuedTts;
        patchVoiceMessage({
          audioSegments: [...audioSegments],
          audioStatus: ttsError ? 'failed' : 'ready',
        });
        if (ttsError) {
          notify(getApiErrorMessage(ttsError) || t('chat.ttsReplyFailed'), 'warning');
        }
      }
    } catch (error) {
      if (temporaryReplyCreated) {
        dispatch(patchConversationMessage({
          conversationId,
          messageId: temporaryId,
          changes: { status: 'failed' },
        }));
      }
      notify(
        getApiErrorMessage(error)
        || (error instanceof Error ? error.message : '')
        || t('chat.llmReplyFailed'),
        'error',
      );
    } finally {
      voiceReplyInFlightRef.current = false;
      setVoiceReplyLoading(false);
    }
  }

  useEffect(() => {
    if (!activeVoiceTrainingJobId) {
      setVoiceModelStatus('');
      setVoiceModelProgress(0);
      setVoiceModelStage('');
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const loadStatus = async () => {
      try {
        const job = await getVoiceTrainingJob(activeVoiceTrainingJobId);
        if (cancelled) return;
        setActiveVoiceModelId(job.model_id);
        setVoiceModelStatus(job.status);
        setVoiceModelErrorDetail(job.status === 'failed' ? job.error || '' : '');
        setVoiceModelProgress(job.progress || 0);
        setVoiceModelStage(job.stage || '');
        const noticeKey = `${job.id}:${job.status}`;
        if (job.status === 'ready' && voiceModelNoticeRef.current !== noticeKey) {
          localStorage.setItem(voiceModelStorageKey(currentUser?.id), job.model_id);
          if (!job.acknowledged) {
            void acknowledgeVoiceTrainingJob(job.id).catch(() => {
              // The next ready-state refresh can retry the idempotent acknowledgement.
            });
          }
          try {
            const updatedCharacters = await getCharacters();
            if (cancelled) return;
            setCharacters(updatedCharacters);
            const trainedCharacter = updatedCharacters.find(character => (
              character.voice_model === job.model_id
              && character.train_status === 'ready'
            ));
            const contactUserId = activeContact.startsWith('user:')
              ? contactIdFromConversation(activeContact)
              : '';
            if (trainedCharacter) {
              setSelectedCharacterId(trainedCharacter.id);
              setActiveVoiceModelId(job.model_id);
              setVoiceModelStatus('ready');
              void getCharacterModels(trainedCharacter.id)
                .then(models => {
                  if (cancelled) return;
                  const activeModel = models.find(model => model.active);
                  setVoiceModelOptions(models);
                  setSelectedVoiceModelVersion(activeModel?.id || '');
                })
                .catch(() => {
                  // Changing the character later retries the model list request.
                });
              if (contactUserId) {
                localStorage.setItem(
                  contactCharacterSelectionKey(currentUser?.id, contactUserId),
                  trainedCharacter.id,
                );
                if (currentUser && !activeContact.startsWith('mock:')) {
                  void saveCharacterBinding(contactUserId, trainedCharacter.id).catch(() => {
                    notify(t('chat.characterSaveFailed'), 'warning');
                  });
                }
              }
            }
          } catch {
            // The character list will be refreshed again when the conversation changes.
          }
          voiceModelNoticeRef.current = noticeKey;
          notify(t('chat.modelTrainingReady', { model: job.model_id }), 'success');
        }
        if (job.status === 'failed' && voiceModelNoticeRef.current !== noticeKey) {
          voiceModelNoticeRef.current = noticeKey;
          notify(job.error || t('chat.modelTrainingFailed'), 'error');
        }
        if (!['ready', 'failed'].includes(job.status)) {
          timer = window.setTimeout(loadStatus, 3000);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(loadStatus, 5000);
      }
    };
    void loadStatus();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeContact, activeVoiceTrainingJobId, currentUser, t]);

  function toggleCreateGroupMember(userId: string) {
    setCreateMemberIds(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setGroupCreateError('');
  }

  async function handleGroupAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setGroupAvatar(await groupAvatarFileToDataUrl(file));
      setGroupCreateError('');
    } catch {
      setGroupCreateError(t('chat.invalidGroupAvatar'));
    } finally {
      event.target.value = '';
    }
  }

  async function handleCreateGroup() {
    const trimmedName = groupName.trim();
    const memberIds = Array.from(createMemberIds);
    if (!trimmedName) {
      setGroupCreateError(t('chat.groupNameRequired'));
      return;
    }
    if (!groupAvatar) {
      setGroupCreateError(t('chat.groupAvatarRequired'));
      return;
    }
    if (memberIds.length === 0) {
      setGroupCreateError(t('chat.selectGroupMembers'));
      setCreateGroupStep(1);
      return;
    }
    if (!isCreateGroupPayloadValid(trimmedName, memberIds, groupAvatar)) {
      setGroupCreateError(t('chat.createGroupInvalid'));
      return;
    }

    setGroupCreating(true);
    setGroupCreateError('');
    try {
      const result = await createGroup({
        name: trimmedName,
        member_ids: memberIds,
        avatar: groupAvatar,
      });
      await dispatch(refreshContacts()).unwrap();
      const contactId = `group:${result.group_id}`;
      selectContact(contactId);
      setIsCreateGroupOpen(false);
      const draftKey = createGroupDraftKey();
      if (draftKey) localStorage.removeItem(draftKey);
      notify(t('chat.groupCreated'), 'success');
    } catch (error) {
      setGroupCreateError(createGroupErrorMessage(
        error,
        t('chat.createGroupFailed'),
        t('chat.createGroupInvalid'),
      ));
    } finally {
      setGroupCreating(false);
    }
  }

  async function handleAddGroupMembers() {
    if (activeContactInfo?.type !== 'group') return;
    const memberIds = Array.from(selectedMemberIds)
      .filter(memberId => !existingGroupMemberIds.has(memberId));
    if (memberIds.length === 0) return;

    setSharingMembers(true);
    try {
      const result = await addGroupMembers(
        activeContactInfo.id.replace(/^group:/, ''),
        memberIds,
      );
      await dispatch(refreshContacts()).unwrap();
      setIsMemberShareOpen(false);
      setSelectedMemberIds(new Set());
      const draftKey = shareDraftKey();
      if (draftKey) localStorage.removeItem(draftKey);
      notify(t('chat.membersAdded', { count: result.added_count }), 'success');
    } catch {
      notify(t('chat.addMembersFailed'), 'error');
    } finally {
      setSharingMembers(false);
    }
  }

  useEffect(() => {
    if (!isMemberShareOpen) return;
    persistMemberShareDraft(true);
  }, [
    activeContactInfo?.id,
    activeContactInfo?.type,
    currentUser?.id,
    isMemberShareOpen,
    selectedMemberIds,
  ]);

  useEffect(() => {
    if (!isCreateGroupOpen) return;
    persistCreateGroupDraft(true);
  }, [
    createGroupStep,
    createMemberIds,
    currentUser?.id,
    groupAvatar,
    groupName,
    groupSearch,
    isCreateGroupOpen,
  ]);

  useEffect(() => {
    if (!currentUser || !contactsInitialized || contactsLoading) return;

    const createKey = createGroupDraftKey();
    if (createKey && !restoredGroupDialogDraftsRef.current.has(createKey)) {
      restoredGroupDialogDraftsRef.current.add(createKey);
      const draft = readLocalDraft<CreateGroupDraft>(createKey);
      if (draft?.open) {
        openCreateGroupDialog();
        return;
      }
    }

    const memberShareKey = shareDraftKey();
    if (memberShareKey && !restoredGroupDialogDraftsRef.current.has(memberShareKey)) {
      restoredGroupDialogDraftsRef.current.add(memberShareKey);
      const draft = readLocalDraft<ShareGroupDraft>(memberShareKey);
      if (draft?.open) openMemberShareDialog();
    }
  }, [
    activeContactInfo?.id,
    activeContactInfo?.type,
    contactsInitialized,
    contactsLoading,
    currentUser?.id,
  ]);

  useLayoutEffect(() => {
    const conversationChanged = lastScrolledConversationRef.current !== activeConversationId;
    const historyJustLoaded = wasHistoryLoadingRef.current && !historyLoading;
    const olderHistoryJustLoaded = (
      wasHistoryLoadingMoreRef.current
      && !historyLoadingMore
      && historyLoadMoreConversationRef.current === activeConversationId
    );
    const shouldJumpToBottom = conversationChanged || historyLoading || historyJustLoaded;
    const messageList = msgListRef.current;

    if (olderHistoryJustLoaded && messageList) {
      messageList.scrollTop = Math.max(
        0,
        messageList.scrollHeight - historyLoadMoreScrollHeightRef.current,
      );
      historyLoadMoreConversationRef.current = '';
    } else if (historyLoadingMore) {
      // Keep the viewport stable while older messages are being prepended.
    } else if (shouldJumpToBottom) {
      if (messageList) {
        messageList.scrollTop = messageList.scrollHeight;
        messageListNearBottomRef.current = true;
      }
    } else if (messageList && messageListNearBottomRef.current) {
      messageList.scrollTop = messageList.scrollHeight;
    }

    lastScrolledConversationRef.current = activeConversationId;
    wasHistoryLoadingRef.current = historyLoading;
    wasHistoryLoadingMoreRef.current = historyLoadingMore;
  }, [activeMessages, activeConversationId, historyLoading, historyLoadingMore]);

  useEffect(() => {
    const input = momentInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 70)}px`;
  }, [momentText]);

  useEffect(() => {
    return () => {
      imagePreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      imagePreviewUrlsRef.current.clear();
      void voiceAudioContextRef.current?.close();
      voiceAudioContextRef.current = null;
    };
  }, []);

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
  ): Promise<boolean> {
    try {
      const persisted = await sendMessage(request);
      const persistedMessage = toChatMessage(persisted, userId);
      if (!persistedMessage) throw new Error('Message response has no content');
      dispatch(replaceConversationMessage({
        conversationId,
        temporaryId,
        message: { ...persistedMessage, id: persisted.id, status: 'sent' },
      }));
      return true;
    } catch {
      dispatch(patchConversationMessage({
        conversationId,
        messageId: temporaryId,
        changes: { status: 'failed' },
      }));
      return false;
    }
  }

  async function persistImageMessage(
    conversationId: string,
    temporaryId: string,
    request: SendImageMessageInput,
    previewUrl: string,
    userId: string,
  ) {
    try {
      const persisted = await sendImageMessage(request);
      const persistedMessage = toChatMessage(persisted, userId);
      if (!persistedMessage?.imageUrl) throw new Error('Image message response has no image');
      dispatch(replaceConversationMessage({
        conversationId,
        temporaryId,
        message: { ...persistedMessage, id: persisted.id, status: 'sent' },
      }));
      window.setTimeout(() => {
        URL.revokeObjectURL(previewUrl);
        imagePreviewUrlsRef.current.delete(previewUrl);
      }, 0);
    } catch {
      dispatch(patchConversationMessage({
        conversationId,
        messageId: temporaryId,
        changes: { status: 'failed' },
      }));
    }
  }

  async function handleSend() {
    const content = inputText.trim();
    if (!content || !activeConversationId || !activeContactInfo) return;
    if (isSelectedSystemUser && voiceReplyInFlightRef.current) return;
    if (!currentUser) {
      notify(t('chat.signInToSend'), 'warning');
      return;
    }
    if (isSelectedSystemUser) {
      const AudioContextConstructor = window.AudioContext
        || (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (AudioContextConstructor) {
        const audioContext = voiceAudioContextRef.current
          || new AudioContextConstructor();
        voiceAudioContextRef.current = audioContext;
        if (audioContext.state === 'suspended') {
          void audioContext.resume();
        }
      }
    }

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
      createdAt: new Date().toISOString(),
      status: 'sending',
      clientMessageId,
      sendRequest: request,
    };
    dispatch(appendConversationMessage({ conversationId, message: newMsg }));
    setInputText('');

    const userMessagePersistence = persistMessage(
      conversationId,
      temporaryId,
      request,
      currentUser.id,
    );
    if (isSelectedSystemUser) {
      void createAutomaticReply(
        conversationId,
        content,
        activeMessages,
        userMessagePersistence,
      );
    }
    await userMessagePersistence;
  }

  async function retryMessage(message: Message) {
    if (message.status !== 'failed' || !activeConversationId || !currentUser) return;
    dispatch(patchConversationMessage({
      conversationId: activeConversationId,
      messageId: message.id,
      changes: { status: 'sending' },
    }));
    if (message.sendImageRequest && message.imageUrl) {
      await persistImageMessage(
        activeConversationId,
        String(message.id),
        message.sendImageRequest,
        message.imageUrl,
        currentUser.id,
      );
    } else if (message.sendRequest) {
      await persistMessage(activeConversationId, String(message.id), message.sendRequest, currentUser.id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // IME candidate confirmation also emits Enter; let the input method handle it.
    if (isChatComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function pickEmoji(emoji: string) {
    insertAtSelection(chatInputRef.current, inputText, emoji, setInputText);
    setShowEmoji(false);
  }

  function pickMomentEmoji(emoji: string) {
    insertAtSelection(momentInputRef.current, momentText, emoji, setMomentText);
    setShowMomentEmoji(false);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !activeConversationId) return;
    if (!currentUser) {
      notify(t('chat.signInToSend'), 'warning');
      return;
    }
    const newMsg: Message = {
      id: Date.now(),
      text: `📎 ${f.name}`,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    dispatch(appendConversationMessage({
      conversationId: activeConversationId,
      message: newMsg,
    }));
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/') || !activeConversationId || !activeContactInfo) return;
    if (!currentUser) {
      notify(t('chat.signInToSend'), 'warning');
      return;
    }
    const temporaryId = `local:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const conversationId = activeConversationId;
    const contactId = contactIdFromConversation(conversationId);
    const clientMessageId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(f);
    imagePreviewUrlsRef.current.add(previewUrl);
    const request: SendImageMessageInput = activeContactInfo.type === 'group'
      ? { chat_type: 'public', group_id: contactId, client_message_id: clientMessageId, image: f }
      : { chat_type: 'private', receiver_id: contactId, client_message_id: clientMessageId, image: f };
    const newMsg: Message = {
      id: temporaryId,
      text: f.name,
      from: 'me',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
      status: 'sending',
      clientMessageId,
      sendImageRequest: request,
      imageUrl: previewUrl,
      imageName: f.name,
    };
    dispatch(appendConversationMessage({ conversationId, message: newMsg }));

    await persistImageMessage(conversationId, temporaryId, request, previewUrl, currentUser.id);
  }

  /* ── Moments ── */
  function handleMomentUpload(type: 'image' | 'video') {
    if (type === 'image') momentImageRef.current?.click();
    else videoRef.current?.click();
  }

  function handleMomentFile(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const expectedType = type === 'image' ? 'image/' : 'video/';
    const maxBytes = type === 'image' ? 10 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;
    if (!file.type.startsWith(expectedType)) {
      notify(t(type === 'image' ? 'chat.invalidImageFile' : 'chat.invalidVideoFile'), 'warning');
      return;
    }
    if (file.size > maxBytes) {
      notify(
        type === 'image'
          ? t('chat.imageTooLarge')
          : t('chat.videoTooLarge'),
        'warning',
      );
      return;
    }
    setMomentMedia(URL.createObjectURL(file));
    setMomentMediaType(type);
    setMomentFile(file);
  }

  async function handleMomentPublish() {
    if ((!momentText.trim() && !momentFile) || momentPublishing || !currentUser) return;
    setMomentPublishing(true);
    setMomentUploadProgress(momentFile ? {
      percent: 0,
      loaded: 0,
      total: momentFile.size,
      bytesPerSecond: 0,
      remainingSeconds: 0,
    } : null);
    try {
      const created = await createMoment({
        content: momentText,
        media: momentFile || undefined,
        mediaType: momentMediaType || undefined,
        onUploadProgress: setMomentUploadProgress,
      });
      setMoments(previous => [toMomentPost(created), ...previous.filter(item => item.id !== created.id)]);
      setMomentsInitialized(true);
      setMomentText('');
      setMomentMedia(null);
      setMomentMediaType(null);
      setMomentFile(null);
      notify(
        created.processing_status === 'processing'
          ? t('chat.videoUploadedProcessing')
          : t('chat.momentPublished'),
        'success',
      );
    } catch {
      notify(t('chat.publishMomentFailed'), 'error');
    } finally {
      setMomentPublishing(false);
      setMomentUploadProgress(null);
    }
  }

  async function handleMomentDelete() {
    if (!deleteMomentId || deletingMomentId) return;
    const momentId = deleteMomentId;
    setDeletingMomentId(momentId);

    try {
      await deleteMoment(momentId);
      const completionTimer = processingCompletionTimersRef.current.get(momentId);
      if (completionTimer !== undefined) {
        window.clearTimeout(completionTimer);
        processingCompletionTimersRef.current.delete(momentId);
      }
      processingFailureNotifiedRef.current.delete(momentId);
      setCompletedProcessingMoments(previous => {
        const next = new Set(previous);
        next.delete(momentId);
        return next;
      });
      setMoments(previous => previous.filter(moment => moment.id !== momentId));
      setPlayingMomentVideoId(current => current === momentId ? null : current);
      setDeleteMomentId(null);
      notify(t('chat.momentDeleted'), 'success');
    } catch {
      notify(t('chat.deleteMomentFailed'), 'error');
    } finally {
      setDeletingMomentId(null);
    }
  }

  async function toggleLike(postId: string) {
    if (!currentUser) {
      notify(t('chat.signInRequired'), 'warning');
      return;
    }
    if (momentLikeRequestsRef.current.has(postId)) return;
    const current = moments.find(m => m.id === postId);
    if (!current) return;

    const nextLiked = !current.liked;
    momentLikeRequestsRef.current.add(postId);
    if (nextLiked) {
      setAnimatingLikes(prev => new Set(prev).add(postId));
      window.setTimeout(() => {
        setAnimatingLikes(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      }, 650);
    }
    setMoments(p => p.map(m =>
      m.id === postId
        ? {
          ...m,
          liked: nextLiked,
          likes: Math.max(0, m.likes + (nextLiked ? 1 : -1)),
        }
        : m
    ));

    try {
      const result = nextLiked
        ? await likeMoment(postId)
        : await unlikeMoment(postId);
      setMoments(previous => previous.map(moment =>
        moment.id === postId
          ? { ...moment, liked: result.liked, likes: result.like_count }
          : moment
      ));
    } catch {
      setMoments(previous => previous.map(moment =>
        moment.id === postId
          ? { ...moment, liked: current.liked, likes: current.likes }
          : moment
      ));
      notify(t('chat.updateLikeFailed'), 'error');
    } finally {
      momentLikeRequestsRef.current.delete(postId);
    }
  }

  async function trackView(postId: string) {
    if (viewedPostsRef.current.has(postId)) return;
    viewedPostsRef.current.add(postId);
    try {
      const result = await viewMoment(postId);
      setMoments(previous => previous.map(moment =>
        moment.id === postId
          ? {
            ...moment,
            likes: result.like_count,
            views: result.view_count,
          }
          : moment
      ));
    } catch {
      viewedPostsRef.current.delete(postId);
    }
  }

  async function handleCommentSubmit(postId: string) {
    const text = commentTexts[postId]?.trim();
    if (!currentUser) {
      notify(t('chat.signInRequired'), 'warning');
      return;
    }
    if (!text || momentCommentRequestsRef.current.has(postId)) return;
    const temporaryId = `temporary:${crypto.randomUUID()}`;
    momentCommentRequestsRef.current.add(postId);
    setMoments(p => p.map(m =>
      m.id === postId
        ? {
          ...m,
          comments: [...m.comments, { id: temporaryId, author: currentUserName, text }],
        }
        : m
    ));
    setCommentTexts(p => ({ ...p, [postId]: '' }));
    setCommentEmojiPost(null);

    try {
      const comment = await createMomentComment(postId, text);
      setMoments(previous => previous.map(moment =>
        moment.id === postId
          ? {
            ...moment,
            comments: moment.comments.map(item =>
              item.id === temporaryId
                ? { id: comment.id, author: comment.username, text: comment.content }
                : item
            ),
          }
          : moment
      ));
    } catch {
      setMoments(previous => previous.map(moment =>
        moment.id === postId
          ? {
            ...moment,
            comments: moment.comments.filter(item => item.id !== temporaryId),
          }
          : moment
      ));
      setCommentTexts(previous => ({
        ...previous,
        [postId]: previous[postId]?.trim() ? previous[postId] : text,
      }));
      notify(t('chat.publishCommentFailed'), 'error');
    } finally {
      momentCommentRequestsRef.current.delete(postId);
    }
  }

  function toggleCommentInput(postId: string) {
    if (!currentUser) {
      notify(t('chat.signInRequired'), 'warning');
      return;
    }
    setShowCommentInput(p => ({ ...p, [postId]: !p[postId] }));
    setCommentEmojiPost(null);
  }

  function pickCommentEmoji(postId: string, emoji: string) {
    const currentText = commentTexts[postId] || '';
    insertAtSelection(
      commentInputRefs.current.get(postId) || null,
      currentText,
      emoji,
      nextText => setCommentTexts(p => ({ ...p, [postId]: nextText })),
    );
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
              onClick={() => selectTab('chat')}
              aria-label={t('chat.chat')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className={`chat-nav-btn${activeTab === 'moments' ? ' active' : ''}`}
              onClick={() => selectTab('moments')}
              aria-label={t('chat.moments')}
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
              <div className="contact-group-heading">
                <div className="contact-group-label">{t('chat.groups')}</div>
                {currentUser && (
                  <button
                    type="button"
                    className="create-group-trigger"
                    aria-label={t('chat.createGroup')}
                    // title={t('chat.createGroup')}
                    onClick={openCreateGroupDialog}
                  >
                    <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
              {visibleContacts.filter(c => c.type === 'group').map(c => (
                <div
                  key={c.id}
                  className={`contact-item${activeContact === c.id ? ' active' : ''}${c.role === 'system' ? ' is-system-character' : ''}`}
                  onClick={() => selectContact(c.id)}
                >
                  <div className="contact-avatar">
                    <img src={c.avatar} alt="" className="avatar-img" />
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{localizedGroupName(c.name, t)}</div>
                    <div className="contact-preview">{localizedMockLabel(c.lastMsg, t)}</div>
                  </div>
                  <div className="contact-time">{localizedMockLabel(c.time, t)}</div>
                </div>
              ))}
              <div className="contact-divider" />
              <div className="contact-group-label">{t('chat.contacts')}</div>
              {visibleContacts.filter(c => c.type === 'user').map(c => (
                <div
                  key={c.id}
                  className={`contact-item${activeContact === c.id ? ' active' : ''}${c.role === 'system' ? ' is-system-character' : ''}`}
                  onClick={() => selectContact(c.id)}
                >
                  <div className={`contact-avatar${c.isPro ? ' has-pro-frame' : ''}`}>
                    <img src={c.avatar} alt="" className="avatar-img" />
                    {c.isPro && (
                      <img
                        src={avatarFrame}
                        alt=""
                        className="contact-avatar-frame"
                        aria-hidden="true"
                      />
                    )}
                    {c.online && <div className="contact-online" />}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-preview">{localizedMockLabel(c.lastMsg, t)}</div>
                  </div>
                  <div className="contact-time">{localizedMockLabel(c.time, t)}</div>
                </div>
              ))}
              {currentUser && visibleContacts.length === 0 && (
                <div
                  className={`contacts-state${contactsLoading || !contactsInitialized ? ' loading' : ''}`}
                  role={contactsError ? 'alert' : 'status'}
                  aria-label={contactsLoading || !contactsInitialized ? t('chat.loadingContacts') : undefined}
                >
                  {contactsLoading || !contactsInitialized ? (
                    <span className="chat-loading-spinner" aria-hidden="true" />
                  ) : (
                    <span>{contactsError ? t('chat.loadContactsFailed') : t('chat.noContacts')}</span>
                  )}
                  {contactsError && (
                    <button
                      type="button"
                      className="contacts-retry"
                      onClick={() => dispatch(refreshContacts())}
                    >
                      {t('chat.retry')}
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
                      <div className="messages-header-name">
                        {activeContactInfo.type === 'group'
                          ? localizedGroupName(activeContactInfo.name, t)
                          : activeContactInfo.name}
                      </div>
                      <div
                        className={`messages-header-status ${
                          activeContactInfo.type === 'group'
                            ? 'group'
                            : activeContactInfo.online
                              ? 'online'
                              : 'offline'
                        }`}
                      >
                        {activeContactInfo.type === 'group'
                          ? t('chat.members', { count: activeContactInfo.members?.length || 0 })
                          : activeContactInfo.online
                            ? t('chat.online')
                            : t('chat.offline')}
                      </div>
                    </div>
                    <div className="messages-header-actions">
                      {isSelectedSystemUser && (
                        <>
                          <div className="character-selector-wrap model-version-selector-wrap">
                            <select
                              className={`character-selector${selectedVoiceModelVersion ? '' : ' is-empty'}`}
                              value={selectedVoiceModelVersion}
                              aria-label={t('chat.selectVoiceModelVersion')}
                              title={t('chat.selectVoiceModelVersion')}
                              disabled={
                                !selectedCharacterId
                                || !canSwitchVoiceModel
                                || voiceModelSwitching
                                || voiceModelOptions.length === 0
                              }
                              onChange={event => void handleVoiceModelChange(event.target.value)}
                            >
                              <option value="">{t('chat.selectVoiceModelVersion')}</option>
                              {voiceModelOptions.map(model => (
                                <option
                                  key={model.id}
                                  value={model.id}
                                  disabled={model.status !== 'ready'}
                                >
                                  {model.id} {model.name === model.id ? '' : `(${model.name})`}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="character-selector-icon" size={14} strokeWidth={2.2} aria-hidden="true" />
                          </div>
                          <div className="character-selector-wrap">
                            <select
                              className={`character-selector${selectedCharacterId ? '' : ' is-empty'}`}
                              value={selectedCharacterId}
                              aria-label={t('chat.selectCharacter')}
                              title={t('chat.selectCharacter')}
                              disabled={characterBindingSaving}
                              onChange={event => void handleCharacterChange(event.target.value)}
                            >
                              <option value="">{t('chat.noCharacterSelected')}</option>
                              {characters.map(character => (
                                <option
                                  key={character.id}
                                  value={character.id}
                                  disabled={character.train_status !== 'ready'}
                                >
                                  {character.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="character-selector-icon" size={14} strokeWidth={2.2} aria-hidden="true" />
                          </div>
                          <button
                            type="button"
                            className={`model-training-trigger voice-model-trigger${voiceModelButtonState}`}
                            aria-label={t('chat.configureModelTraining')}
                            title={voiceModelButtonTitle}
                            onClick={() => setIsModelTrainingOpen(true)}
                          >
                            <AudioLines size={16} strokeWidth={2.1} aria-hidden="true" />
                            <span>{t('chat.modelButton')}</span>
                          </button>
                          <button
                            type="button"
                            className={`model-training-trigger llm-config-trigger${llmConfig.connected ? ' is-connected' : ''}`}
                            aria-label={t('chat.configureLlm')}
                            title={t('chat.configureLlm')}
                            onClick={() => setIsLlmConfigOpen(true)}
                          >
                            <Settings2 size={16} strokeWidth={2.1} aria-hidden="true" />
                            <span>{t('chat.llmButton')}</span>
                          </button>
                        </>
                      )}
                      {activeContactInfo.type === 'group' && (
                        <div className="group-members-toolbar">
                          <div
                            className="group-member-stack"
                            aria-label={t('chat.groupMemberAvatars', { count: activeGroupMembers.length })}
                          >
                            {activeGroupMembers.slice(0, MAX_VISIBLE_GROUP_AVATARS).map(member => (
                              <span
                                key={member.user_id}
                                className="group-member-avatar"
                              >
                                <img
                                  src={member.user_id === currentUser?.id
                                    ? currentUserAvatar
                                    : resolveChatAvatarUrl(member.avatar, member.username)}
                                  alt={member.username}
                                />
                                {member.online && <span className="group-member-online" aria-hidden="true" />}
                              </span>
                            ))}
                            {activeGroupMembers.length > MAX_VISIBLE_GROUP_AVATARS && (
                              <span className="group-member-overflow">
                                {activeGroupMembers.length - MAX_VISIBLE_GROUP_AVATARS}+
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="group-share-button"
                            aria-label={t('chat.shareGroup')}
                            onClick={openMemberShareDialog}
                          >
                            <Share2 size={16} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {isConversationLoading ? (
                      <div className="messages-header-loading" role="status" aria-label={t('chat.loadingConversation')}>
                        <span className="chat-loading-spinner" aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="messages-header-info">
                        <div className="messages-header-name">{t('chat.noContacts')}</div>
                      </div>
                    )}
                    <div className="messages-header-actions">
                      {isSelectedSystemUser && (
                        <>
                          <div className="character-selector-wrap model-version-selector-wrap">
                            <select
                              className={`character-selector${selectedVoiceModelVersion ? '' : ' is-empty'}`}
                              value={selectedVoiceModelVersion}
                              aria-label={t('chat.selectVoiceModelVersion')}
                              title={t('chat.selectVoiceModelVersion')}
                              disabled={
                                !selectedCharacterId
                                || voiceModelSwitching
                                || voiceModelOptions.length === 0
                              }
                              onChange={event => void handleVoiceModelChange(event.target.value)}
                            >
                              <option value="">{t('chat.selectVoiceModelVersion')}</option>
                              {voiceModelOptions.map(model => (
                                <option
                                  key={model.id}
                                  value={model.id}
                                  disabled={model.status !== 'ready'}
                                >
                                  {model.id} {model.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="character-selector-icon" size={14} strokeWidth={2.2} aria-hidden="true" />
                          </div>
                          <div className="character-selector-wrap">
                            <select
                              className={`character-selector${selectedCharacterId ? '' : ' is-empty'}`}
                              value={selectedCharacterId}
                              aria-label={t('chat.selectCharacter')}
                              title={t('chat.selectCharacter')}
                              disabled={characterBindingSaving}
                              onChange={event => void handleCharacterChange(event.target.value)}
                            >
                              <option value="">{t('chat.noCharacterSelected')}</option>
                              {characters.map(character => (
                                <option
                                  key={character.id}
                                  value={character.id}
                                  disabled={character.train_status !== 'ready'}
                                >
                                  {character.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="character-selector-icon" size={14} strokeWidth={2.2} aria-hidden="true" />
                          </div>
                          <button
                            type="button"
                            className={`model-training-trigger voice-model-trigger${voiceModelButtonState}`}
                            aria-label={t('chat.configureModelTraining')}
                            title={voiceModelButtonTitle}
                            onClick={() => setIsModelTrainingOpen(true)}
                          >
                            <AudioLines size={16} strokeWidth={2.1} aria-hidden="true" />
                            <span>{t('chat.modelButton')}</span>
                          </button>
                          <button
                            type="button"
                            className={`model-training-trigger llm-config-trigger${llmConfig.connected ? ' is-connected' : ''}`}
                            aria-label={t('chat.configureLlm')}
                            title={t('chat.configureLlm')}
                            onClick={() => setIsLlmConfigOpen(true)}
                          >
                            <Settings2 size={16} strokeWidth={2.1} aria-hidden="true" />
                            <span>{t('chat.llmButton')}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div ref={msgListRef} className="msg-list" onScroll={handleMessageListScroll}>
                {historyLoadingMore && (
                  <div className="message-history-loading" role="status" aria-label={t('chat.loadingOlderMessages')}>
                    <span className="chat-loading-spinner" aria-hidden="true" />
                  </div>
                )}
                {isConversationLoading || historyLoading ? (
                  <div className="messages-loading" role="status" aria-label={t('chat.loadingConversation')}>
                    <span className="chat-loading-spinner" aria-hidden="true" />
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="msg-empty">{t('chat.noMessages')}</div>
                ) : (
                  activeMessages.map((msg, msgIndex, contactMessages) => {
                    const previousMessage = contactMessages[msgIndex - 1];
                    const messageRenderKey = msg.clientMessageId || msg.id;
                    const showDateDivider = Boolean(
                      msg.createdAt
                      && (!previousMessage?.createdAt
                        || historyDateLabel(previousMessage.createdAt, t) !== historyDateLabel(msg.createdAt, t)),
                    );

                    return (
                    <Fragment key={messageRenderKey}>
                      {showDateDivider && msg.createdAt && (
                        <div className="message-date-divider" role="separator">
                          <span>{historyDateLabel(msg.createdAt, t)}</span>
                        </div>
                      )}
                    <div className={`msg-wrap ${msg.from === 'me' ? 'sent' : 'received'}`}>
                      <div className="msg-sender">
                        <div className="msg-avatar">
                          <img
                            src={msg.from === 'me'
                              ? currentUserAvatar
                              : activeContactInfo?.avatar || fallbackAvatar(activeContactInfo?.name || '')}
                            alt=""
                            className="avatar-img"
                          />
                        </div>
                      </div>
                      <div className="msg-content">
                        <div className={`msg ${msg.from === 'me' ? 'sent' : 'received'}${msg.imageUrl ? ' image-message' : ''}`}>
                          {msg.imageUrl && (
                            <button
                              type="button"
                              className="chat-message-image-link"
                              onClick={() => setPreviewImage(msg.imageUrl || null)}
                              aria-label={t('chat.openImage', { name: msg.imageName || '' }).trim()}
                            >
                              <img
                                className="chat-message-image"
                                src={msg.imageUrl}
                                alt={msg.imageName || t('chat.sharedImage')}
                              />
                              <span className="chat-message-image-expand" aria-hidden="true">
                                <Maximize2 size={17} strokeWidth={1.9} />
                              </span>
                            </button>
                          )}
                          {!msg.imageUrl && (
                          <div className={`msg-text${msgIndex === contactMessages.length - 1 ? ' typing-text' : ''}`}>
                            {msgIndex === contactMessages.length - 1 ? (
                              Array.from(msg.text).map((char, charIndex) => (
                                <span
                                  key={`${messageRenderKey}-${charIndex}`}
                                  className="msg-char"
                                  style={{ '--char-delay': `${charIndex * 0.032}s` } as React.CSSProperties}
                                >
                                  {char}
                                </span>
                              ))
                            ) : msg.text}
                          </div>
                          )}
                          {(msg.audioStatus || msg.audioStreamUrl || msg.audioSegments?.length || msg.audioUrl) && (
                            <VoiceMessagePlayer
                              audioStreamUrl={msg.audioStreamUrl}
                              audioSegments={
                                msg.audioSegments?.length
                                  ? msg.audioSegments
                                  : [msg.audioUrl].filter((url): url is string => Boolean(url))
                              }
                              status={msg.audioStatus}
                              autoPlay={msg.audioAutoPlay}
                              onStreamError={() => {
                                dispatch(patchConversationMessage({
                                  conversationId: activeConversationId,
                                  messageId: msg.id,
                                  changes: { audioStatus: 'failed' },
                                }));
                              }}
                              onAutoPlayStarted={() => {
                                dispatch(patchConversationMessage({
                                  conversationId: activeConversationId,
                                  messageId: msg.id,
                                  changes: { audioAutoPlay: false },
                                }));
                              }}
                              onAutoPlayBlocked={() => {
                                dispatch(patchConversationMessage({
                                  conversationId: activeConversationId,
                                  messageId: msg.id,
                                  changes: { audioAutoPlay: false },
                                }));
                                notify(t('chat.characterVoiceAutoPlayBlocked'), 'warning');
                              }}
                              label={t('chat.characterVoice')}
                              generatingLabel={t('chat.characterVoiceGenerating')}
                              bufferingLabel={t('chat.characterVoiceBuffering')}
                              readyLabel={t('chat.characterVoiceReady')}
                              failedLabel={t('chat.characterVoiceFailed')}
                            />
                          )}
                        </div>
                        <div className="msg-time">
                          {msg.createdAt
                            ? messageTimeLabel(msg.createdAt, i18n.resolvedLanguage || i18n.language)
                            : localizedMockLabel(msg.time, t)}
                          {msg.from === 'me' && msg.status && (
                            <>
                              <span
                                className={`msg-status ${msg.status}`}
                                aria-label={
                                  msg.status === 'sent'
                                    ? t('chat.delivered')
                                    : msg.status === 'sending'
                                      ? t('chat.sending')
                                      : t('chat.messageFailed')
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
                                    ? t('chat.delivered')
                                    : msg.status === 'sending'
                                      ? t('chat.sending')
                                      : t('chat.failed')}
                                </span>
                              </span>
                              {msg.status === 'failed' && (msg.sendRequest || msg.sendImageRequest) && (
                                <button
                                  type="button"
                                  className="msg-retry-btn"
                                  onClick={() => retryMessage(msg)}
                                >
                                  {t('chat.retry')}
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
                    <button
                      type="button"
                      className="input-tool-btn"
                      onPointerDown={event => event.preventDefault()}
                      onClick={() => setShowEmoji(!showEmoji)}
                      aria-label={t('chat.emoji')}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                      </svg>
                    </button>
                    {showEmoji && (
                      <div ref={emojiPickerRef} className="emoji-picker">
                        <div className="emoji-grid">
                          {EMOJIS.map(e => (
                            <button
                              key={e}
                              type="button"
                              className="emoji-btn"
                              onPointerDown={event => event.preventDefault()}
                              onClick={() => pickEmoji(e)}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="input-tool-btn"
                    onClick={() => {
                      if (!currentUser) {
                        notify(t('chat.signInToSend'), 'warning');
                        return;
                      }
                      chatImageRef.current?.click();
                    }}
                    aria-label={t('chat.image')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                  </button>
                  <input ref={chatImageRef} type="file" accept="image/*" hidden onChange={pickImage} />
                  <button
                    type="button"
                    className="input-tool-btn"
                    onClick={() => {
                      if (!currentUser) {
                        notify(t('chat.signInToSend'), 'warning');
                        return;
                      }
                      fileRef.current?.click();
                    }}
                    aria-label={t('chat.file')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </button>
                  <input ref={fileRef} type="file" hidden onChange={pickFile} />
                  <input ref={chatInputRef} className="msg-text-input" type="text" placeholder={t('chat.messagePlaceholder')} value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onCompositionStart={() => { isChatComposingRef.current = true; }}
                    onCompositionEnd={() => { isChatComposingRef.current = false; }}
                    onKeyDown={handleKeyDown} />
                  <button
                    className="msg-send-btn"
                    disabled={!inputText.trim() || (isSelectedSystemUser && voiceReplyLoading)}
                    onClick={handleSend}
                    aria-label={t('chat.sendMessage')}
                  >
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
          <div ref={momentsFeedRef} className="moments-feed" onScroll={handleMomentsScroll}>
            <div className="moment-post">
              <div className="moment-post-top">
                <div className="moment-post-avatar">
                  <img src={currentUserAvatar} alt="" className="avatar-img" />
                </div>
                <textarea ref={momentInputRef} className="moment-post-input" placeholder={t('chat.whatsHappening')} value={momentText}
                  onChange={e => setMomentText(e.target.value)} />
              </div>
              {momentMedia && (
                momentMediaType === 'image'
                  ? <img src={momentMedia} alt="" className="moment-preview" />
                  : <video src={momentMedia} controls className="moment-preview" />
              )}
              {momentPublishing && momentFile && momentUploadProgress !== null && (
                <div
                  className={`moment-upload-progress${momentUploadProgress.percent >= 100 ? ' complete' : ''}`}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={momentUploadProgress.percent}
                >
                  <div className="moment-upload-heading">
                    <div className="moment-upload-title">
                      <span className="moment-upload-icon" aria-hidden="true">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 16V4" />
                          <path d="m7 9 5-5 5 5" />
                          <path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
                        </svg>
                      </span>
                      <span>
                        {momentUploadProgress.percent >= 100
                          ? t('chat.uploadComplete')
                          : t(momentMediaType === 'video' ? 'chat.uploadingVideo' : 'chat.uploadingImage')}
                      </span>
                    </div>
                    <strong>{momentUploadProgress.percent}%</strong>
                  </div>
                  <div className="moment-upload-size">
                    <span>{formatUploadBytes(momentUploadProgress.loaded)} / {formatUploadBytes(momentUploadProgress.total)}</span>
                    <span>{momentFile.name}</span>
                  </div>
                  <div className="moment-upload-track">
                    <span
                      className="moment-upload-fill"
                      style={{ width: `${momentUploadProgress.percent}%` }}
                    >
                      <i aria-hidden="true" />
                    </span>
                  </div>
                  <div className="moment-upload-meta">
                    {momentUploadProgress.percent >= 100 ? (
                      <span>
                        {momentMediaType === 'video'
                          ? t('chat.creatingVideoMoment')
                          : t('chat.creatingMoment')}
                      </span>
                    ) : (
                      <>
                        <span>{formatUploadSpeed(momentUploadProgress.bytesPerSecond, t)}</span>
                        <i aria-hidden="true" />
                        <span>
                          {momentUploadProgress.bytesPerSecond > 0
                            ? formatRemainingTime(momentUploadProgress.remainingSeconds, t)
                            : t('chat.calculatingRemainingTime')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="moment-post-bottom">
                <div className="moment-post-tools">
                  <button
                    type="button"
                    className="moment-tool-btn"
                    onPointerDown={event => event.preventDefault()}
                    onClick={() => setShowMomentEmoji(p => !p)}
                    aria-label={t('chat.addEmoji')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>
                  {showMomentEmoji && (
                    <div ref={momentEmojiPickerRef} className="emoji-picker moment-emoji-picker">
                      <div className="emoji-grid">
                        {EMOJIS.map(e => (
                          <button
                            key={e}
                            type="button"
                            className="emoji-btn"
                            onPointerDown={event => event.preventDefault()}
                            onClick={() => pickMomentEmoji(e)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="moment-tool-btn media-image" onClick={() => handleMomentUpload('image')} aria-label={t('chat.image')}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                      <path d="m14 14 1.1-1.1" />
                    </svg>
                  </button>
                  <button className="moment-tool-btn media-video" onClick={() => handleMomentUpload('video')} aria-label={t('chat.video')}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7h18" />
                      <path d="m7 3 3 4" />
                      <path d="m14 3 3 4" />
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <path d="m10 12 5 3-5 3Z" />
                    </svg>
                  </button>
                  <input ref={momentImageRef} type="file" accept="image/*" hidden onChange={e => handleMomentFile(e, 'image')} />
                  <input ref={videoRef} type="file" accept="video/*" hidden onChange={e => handleMomentFile(e, 'video')} />
                </div>
                <button
                  className="moment-submit"
                  disabled={!currentUser || momentPublishing || (!momentText.trim() && !momentFile)}
                  onClick={handleMomentPublish}
                  aria-label={currentUser ? t('chat.post') : t('chat.signInToPost')}
                  // title={currentUser ? undefined : t('chat.signInToPost')}
                >
                  {momentPublishing && <span className="moment-submit-spinner" aria-hidden="true" />}
                  {momentPublishing ? t('chat.posting') : t('chat.post')}
                </button>
              </div>
            </div>

            {momentsLoading && !momentsInitialized ? (
              <div className="moments-loading" role="status" aria-label={t('chat.loadingMoments')}>
                <span className="chat-loading-spinner" aria-hidden="true" />
              </div>
            ) : momentsError ? (
              <div className="moment-empty" role="alert">
                <span>{momentsError}</span>
                <button type="button" className="moments-retry" onClick={() => void loadMoments(true)}>
                  {t('chat.retry')}
                </button>
              </div>
            ) : moments.length === 0 ? (
              <div className="moment-empty">{t('chat.noMoments')}</div>
            ) : (
              <>
                {moments.map((post, idx) => {
                  const isCurrentUserPost = post.authorId === currentUser?.id;
                  return (
                  <MomentImpression
                    key={post.id}
                    enabled={post.mediaType !== 'video'}
                    className="moment-card"
                    style={{ animationDelay: `${idx * 0.06}s` }}
                    onQualified={() => void trackView(post.id)}
                  >
                    <div className="card-header">
                      <div className="card-avatar">
                        <img src={isCurrentUserPost ? currentUserAvatar : post.avatar} alt="" className="avatar-img" />
                      </div>
                      <div className="card-author">
                        <div className="card-name">{isCurrentUserPost ? currentUserName : post.name}</div>
                        <div className="card-time">
                          {post.createdAt
                            ? momentTimeLabel(post.createdAt, i18n.resolvedLanguage || i18n.language, t)
                            : post.time}
                        </div>
                      </div>
                      {isCurrentUserPost && (
                        <div
                          className="moment-card-menu-wrap"
                          ref={openMomentMenuId === post.id ? momentMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className={`card-menu${openMomentMenuId === post.id ? ' active' : ''}`}
                            aria-label={t('chat.moreActions')}
                            aria-haspopup="menu"
                            aria-expanded={openMomentMenuId === post.id}
                            onClick={() => setOpenMomentMenuId(current => (
                              current === post.id ? null : post.id
                            ))}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                          {openMomentMenuId === post.id && (
                            <div className="moment-card-menu-popover" role="menu">
                              <button
                                type="button"
                                className="moment-delete-action"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMomentMenuId(null);
                                  setDeleteMomentId(post.id);
                                }}
                              >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v5M14 11v5" />
                                </svg>
                                <span>{t('chat.delete')}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {post.text && <div className="card-text">{post.text}</div>}
                    {post.media && post.mediaType === 'image' && (
                      <button
                        type="button"
                        className="card-media-wrap moment-image-wrap"
                        aria-label={t('chat.viewImage')}
                        onClick={() => setPreviewImage(post.media || null)}
                      >
                        <img
                          src={post.media}
                          alt={t('chat.momentImagePreview')}
                          className="card-media moment-image"
                        />
                        <span className="moment-image-expand" aria-hidden="true">
                          <Maximize2 size={17} strokeWidth={1.9} />
                        </span>
                      </button>
                    )}
                    {post.mediaType === 'video' && (
                      post.processingStatus === 'processing'
                      || completedProcessingMoments.has(post.id)
                    ) && (
                      <div
                        className={`moment-video-status video-layout${
                          completedProcessingMoments.has(post.id) ? ' complete' : ''
                        }`}
                        style={{
                          aspectRatio: post.mediaWidth && post.mediaHeight
                            ? `${post.mediaWidth} / ${post.mediaHeight}`
                            : '16 / 9',
                        }}
                        role="status"
                      >
                        <div
                          className={`moment-video-progress-ring${
                            !completedProcessingMoments.has(post.id)
                              && post.processingProgress === 0 ? ' idle' : ''
                          }`}
                          role="progressbar"
                          aria-label={t('chat.videoTranscodingProgress')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            completedProcessingMoments.has(post.id)
                              ? 100
                              : post.processingProgress
                          }
                        >
                          <svg
                            className="moment-video-progress-svg"
                            viewBox="0 0 112 112"
                            aria-hidden="true"
                          >
                            <defs>
                              <linearGradient
                                id={`moment-progress-gradient-${post.id}`}
                                x1="16"
                                y1="18"
                                x2="96"
                                y2="94"
                                gradientUnits="userSpaceOnUse"
                              >
                                <stop offset="0" stopColor="#bdffc9" />
                                <stop offset="1" stopColor="#fdc5d8" />
                              </linearGradient>
                            </defs>
                            <circle
                              className="moment-video-progress-track"
                              cx="56"
                              cy="56"
                              r="47"
                              pathLength="100"
                            />
                            <circle
                              className="moment-video-progress-indicator"
                              cx="56"
                              cy="56"
                              r="47"
                              pathLength="100"
                              stroke={`url(#moment-progress-gradient-${post.id})`}
                              strokeDasharray="100"
                              strokeDashoffset={
                                100 - (
                                  completedProcessingMoments.has(post.id)
                                    ? 100
                                    : post.processingProgress
                                )
                              }
                            />
                          </svg>
                          <span className="moment-video-progress-value">
                            {completedProcessingMoments.has(post.id) ? (
                              <>
                                <svg
                                  className="moment-video-progress-check"
                                  width="26"
                                  height="26"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="m5 12 4 4L19 6" />
                                </svg>
                                <small className="moment-video-progress-label">{t('chat.ready')}</small>
                              </>
                            ) : (
                              <>
                                <span className="moment-video-progress-number">
                                  <b>{post.processingProgress}</b>
                                  <small>%</small>
                                </span>
                                <small className="moment-video-progress-label">
                                  {post.processingProgress > 0 ? t('chat.encoding') : t('chat.queued')}
                                </small>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="moment-video-processing-content">
                          <strong>
                            {completedProcessingMoments.has(post.id)
                              ? t('chat.processingComplete')
                              : post.processingProgress > 0
                                ? t('chat.transcodingVideo')
                                : t('chat.waitingToProcess')}
                          </strong>
                          <span>
                            {completedProcessingMoments.has(post.id)
                              ? t('chat.videoReady')
                              : post.processingProgress > 0
                              ? t('chat.preparingVideo')
                              : t('chat.videoQueued')}
                          </span>
                        </div>
                      </div>
                    )}
                    {post.mediaType === 'video' && post.processingStatus === 'failed' && (
                      <div className="moment-video-status failed" role="alert">
                        <div>
                          <strong>{t('chat.videoProcessingFailed')}</strong>
                          <span>{post.processingError || t('chat.publishVideoAgain')}</span>
                        </div>
                      </div>
                    )}
                    {post.media
                      && post.mediaType === 'video'
                      && post.processingStatus === 'ready'
                      && !completedProcessingMoments.has(post.id) && (
                      <div
                        ref={element => {
                          if (element) {
                            momentVideoElementsRef.current.set(post.id, element);
                          } else {
                            momentVideoElementsRef.current.delete(post.id);
                          }
                        }}
                        data-moment-video-id={post.id}
                        className="card-media-wrap video-media-wrap"
                      >
                        <HlsVideo
                          src={post.media}
                          poster={post.poster}
                          width={post.mediaWidth}
                          height={post.mediaHeight}
                          className="card-media"
                          active={playingMomentVideoId === post.id}
                          autoPlay={playingMomentVideoId === post.id}
                          onActivate={() => setPlayingMomentVideoId(post.id)}
                          onDeactivate={() => setPlayingMomentVideoId(current => (
                            current === post.id ? null : current
                          ))}
                          onViewQualified={() => void trackView(post.id)}
                        />
                      </div>
                    )}
                    <div className="card-actions">
                      <button
                        className={`card-action-btn heart-btn${post.liked ? ' liked' : ''}${currentUser ? '' : ' guest-restricted'}`}
                        onClick={() => toggleLike(post.id)}
                        aria-disabled={!currentUser}
                        aria-label={t('chat.likeMoment')}
                        // title={currentUser ? undefined : t('chat.signInRequired')}
                      >
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
                      <button
                        className={`card-action-btn comment-action-btn${showCommentInput[post.id] ? ' comment-active' : ''}${currentUser ? '' : ' guest-restricted'}`}
                        onClick={() => toggleCommentInput(post.id)}
                        aria-disabled={!currentUser}
                        aria-label={t('chat.commentOnMoment')}
                        // title={currentUser ? undefined : t('chat.signInRequired')}
                      >
                        <span className="action-svg">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="action-label">{post.comments.length}</span>
                      </button>
                      <span className="card-action-btn views-btn" aria-label={t('chat.momentViews')}>
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
                      <button className="card-action-btn share-btn" aria-label={t('chat.shareMoment')}>
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
                              type="button"
                              className="comment-emoji-btn"
                              onPointerDown={event => event.preventDefault()}
                              onClick={() => {
                                setCommentEmojiPost(p => p === post.id ? null : post.id);
                                setShowCommentInput(p => ({ ...p, [post.id]: true }));
                              }}
                              aria-label={t('chat.addEmojiToComment')}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                              </svg>
                            </button>
                            {commentEmojiPost === post.id && (
                              <div ref={commentEmojiPickerRef} className="emoji-picker comment-emoji-picker">
                                <div className="emoji-grid">
                                  {EMOJIS.map(e => (
                                    <button
                                      key={e}
                                      type="button"
                                      className="emoji-btn"
                                      onPointerDown={event => event.preventDefault()}
                                      onClick={() => pickCommentEmoji(post.id, e)}
                                    >
                                      {e}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <input
                            ref={node => {
                              if (node) commentInputRefs.current.set(post.id, node);
                              else commentInputRefs.current.delete(post.id);
                            }}
                            className="comment-input"
                            type="text"
                            placeholder={t('chat.commentPlaceholder')}
                            value={commentTexts[post.id] || ''}
                            onChange={e => setCommentTexts(p => ({ ...p, [post.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(post.id); }} />
                          <button
                            className="comment-submit"
                            disabled={!commentTexts[post.id]?.trim()}
                            onClick={() => handleCommentSubmit(post.id)}
                            aria-label={t('chat.sendComment')}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </MomentImpression>
                  );
                })}
                {momentsLoading && momentsInitialized && (
                  <div className="moments-loading-more" role="status" aria-label={t('chat.loadingMoreMoments')}>
                    <span className="chat-loading-spinner" aria-hidden="true" />
                  </div>
                )}
                {momentsLoadMoreError && !momentsLoading && (
                  <div className="moments-load-more-error" role="alert">
                    <span>{momentsLoadMoreError}</span>
                    <button type="button" className="moments-retry" onClick={() => void loadMoments()}>
                      {t('chat.retry')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {previewImage && (
        <div
          className="moment-image-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('chat.imagePreview')}
        >
          <button
            type="button"
            className="moment-image-preview-backdrop"
            aria-label={t('chat.closeImagePreview')}
            onClick={() => setPreviewImage(null)}
          />
          <div className="moment-image-preview-content">
            <img src={previewImage} alt={t('chat.imagePreview')} />
            <button
              type="button"
              className="moment-image-preview-close"
              aria-label={t('chat.closeImagePreview')}
              onClick={() => setPreviewImage(null)}
            >
              <X size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
      {isMemberShareOpen && activeContactInfo?.type === 'group' && (
        <div className="group-share-overlay" role="presentation">
          <button
            type="button"
            className="group-share-backdrop"
            aria-label={t('chat.closeShareDialog')}
            onClick={closeMemberShareDialog}
          />
          <div
            className="group-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-share-title"
            aria-describedby="group-share-description"
          >
            <button
              type="button"
              className="group-share-close"
              aria-label={t('chat.closeShareDialog')}
              onClick={closeMemberShareDialog}
            >
              <X size={17} aria-hidden="true" />
            </button>
            <div className="group-share-heading">
              <span className="group-share-icon" aria-hidden="true">
                <Share2 size={24} strokeWidth={1.8} />
              </span>
              <div className="group-share-heading-copy">
                <p className="group-share-eyebrow">{t('chat.groupMembers')}</p>
                <h2 id="group-share-title">{t('chat.shareGroupTitle')}</h2>
                <p id="group-share-description" className="group-share-description">
                  {t('chat.shareGroupDescription')}
                </p>
              </div>
            </div>
            <div className="group-share-list">
              {shareCandidates.map(candidate => {
                const isExistingMember = existingGroupMemberIds.has(candidate.userId);
                const isChecked = isExistingMember || selectedMemberIds.has(candidate.userId);

                return (
                  <label
                    key={candidate.userId}
                    className={`group-share-user${isExistingMember ? ' is-existing' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isExistingMember}
                      onChange={() => {
                        setSelectedMemberIds(current => {
                          const next = new Set(current);
                          if (next.has(candidate.userId)) next.delete(candidate.userId);
                          else next.add(candidate.userId);
                          return next;
                        });
                      }}
                    />
                    <span className="group-share-checkbox" aria-hidden="true">
                      {isChecked && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="group-share-user-avatar">
                      <img src={candidate.avatar} alt="" />
                      {candidate.online && <span aria-hidden="true" />}
                    </span>
                    <span className="group-share-username">{candidate.username}</span>
                    {isExistingMember && (
                      <span className="group-share-member-label">{t('chat.alreadyMember')}</span>
                    )}
                  </label>
                );
              })}
              {shareCandidates.length === 0 && (
                <p className="group-share-empty">{t('chat.noUsersToShare')}</p>
              )}
            </div>
            <div className="group-share-actions">
              <button
                type="button"
                className="group-dialog-primary"
                disabled={sharingMembers || selectedMemberIds.size === 0}
                onClick={() => void handleAddGroupMembers()}
              >
                {sharingMembers ? t('chat.addingMembers') : t('chat.addSelectedMembers')}
                <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
      {isCreateGroupOpen && currentUser && (
        <div className="group-share-overlay" role="presentation">
          <button
            type="button"
            className="group-share-backdrop"
            aria-label={t('chat.closeCreateGroupDialog')}
            disabled={groupCreating}
            onClick={closeCreateGroupDialog}
          />
          <div
            className={`group-share-dialog create-group-dialog${
              createGroupStep === 2 ? ' is-details' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
            aria-describedby="create-group-description"
          >
            <button
              type="button"
              className="group-share-close"
              aria-label={t('chat.closeCreateGroupDialog')}
              disabled={groupCreating}
              onClick={closeCreateGroupDialog}
            >
              <X size={17} aria-hidden="true" />
            </button>
            <div className="create-group-flow">
              <section className="create-group-people">
                <div className="group-share-heading">
                  <span className="group-share-icon" aria-hidden="true">
                    <Users size={24} strokeWidth={1.8} />
                  </span>
                  <div className="group-share-heading-copy">
                    <p className="group-share-eyebrow">{t('chat.createGroupEyebrow')}</p>
                    <h2 id="create-group-title">{t('chat.createGroupTitle')}</h2>
                    <p id="create-group-description" className="group-share-description">
                      {t('chat.createGroupDescription')}
                    </p>
                  </div>
                </div>

                {selectedCreateMembers.length > 0 && (
                  <div className="create-group-selection">
                    <div
                      className="group-member-stack create-group-avatar-stack"
                      aria-label={t('chat.selectedPeople', {
                        count: selectedCreateMembers.length,
                      })}
                    >
                      {selectedCreateMembers
                        .slice(0, MAX_VISIBLE_GROUP_AVATARS)
                        .map(member => (
                          <span
                            key={member.userId}
                            className="group-member-avatar"
                            // title={member.username}
                          >
                            <img src={member.avatar} alt={member.username} />
                          </span>
                        ))}
                      {selectedCreateMembers.length > MAX_VISIBLE_GROUP_AVATARS && (
                        <span className="group-member-overflow">
                          {selectedCreateMembers.length - MAX_VISIBLE_GROUP_AVATARS}+
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="create-group-next"
                      onClick={() => setCreateGroupStep(2)}
                    >
                      {t('chat.next')}
                      <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                )}

                <label className="create-group-search">
                  <Search size={16} strokeWidth={1.9} aria-hidden="true" />
                  <input
                    type="search"
                    value={groupSearch}
                    placeholder={t('chat.searchUsers')}
                    onChange={event => setGroupSearch(event.target.value)}
                  />
                </label>

                <div className="group-share-list create-group-user-list">
                  {filteredCreateGroupCandidates.map(candidate => {
                    const isSelected = createMemberIds.has(candidate.userId);
                    return (
                      <button
                        key={candidate.userId}
                        type="button"
                        className={`group-share-user create-group-user${
                          isSelected ? ' is-selected' : ''
                        }`}
                        aria-pressed={isSelected}
                        onClick={() => toggleCreateGroupMember(candidate.userId)}
                      >
                        <span className="group-share-user-avatar">
                          <img src={candidate.avatar} alt="" />
                          {candidate.online && <span aria-hidden="true" />}
                        </span>
                        <span className="group-share-username">{candidate.username}</span>
                        <span className="create-group-user-check" aria-hidden="true">
                          {isSelected && <Check size={13} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                  {filteredCreateGroupCandidates.length === 0 && (
                    <p className="group-share-empty">{t('chat.noMatchingUsers')}</p>
                  )}
                </div>
              </section>

              <section className="create-group-details" aria-hidden={createGroupStep !== 2}>
                <p className="group-share-eyebrow">{t('chat.groupDetails')}</p>
                <div className="create-group-details-heading">
                  <div>
                    <h3>{t('chat.groupDetails')}</h3>
                    <p>{t('chat.selectedPeople', { count: selectedCreateMembers.length })}</p>
                  </div>
                  <button
                    type="button"
                    className="create-group-back"
                    onClick={() => setCreateGroupStep(1)}
                    aria-label={t('chat.createGroupTitle')}
                  >
                    <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>

                <label className="create-group-field create-group-name-field">
                  <span>{t('chat.groupName')}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={groupName}
                    placeholder={t('chat.groupNamePlaceholder')}
                    onChange={event => {
                      setGroupName(event.target.value);
                      setGroupCreateError('');
                    }}
                  />
                </label>

                <div className="create-group-action-row">
                  <div className="create-group-avatar-field">
                    <span>{t('chat.groupAvatar')}</span>
                    <button
                      type="button"
                      className={`create-group-avatar-upload${groupAvatar ? ' has-image' : ''}`}
                      onClick={() => groupAvatarInputRef.current?.click()}
                      aria-label={t('chat.uploadGroupAvatar')}
                    >
                      {groupAvatar
                        ? <img src={groupAvatar} alt="" />
                        : <Camera size={19} strokeWidth={1.8} aria-hidden="true" />}
                    </button>
                  </div>
                  <input
                    ref={groupAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={event => void handleGroupAvatarChange(event)}
                  />
                </div>

                <div className="create-group-members-summary create-group-creator-summary">
                  <span>{t('chat.groupCreator')}</span>
                  <div className="create-group-summary-row">
                    <img src={currentUserAvatar} alt={currentUserName} />
                    <strong>{currentUserName}</strong>
                  </div>
                </div>

                <div className="create-group-members-summary">
                  <span>{t('chat.selectedMembers')}</span>
                  <div className="group-member-stack create-group-details-stack">
                    {selectedCreateMembers
                      .slice(0, MAX_VISIBLE_GROUP_AVATARS)
                      .map(member => (
                        <span
                          key={member.userId}
                          className="group-member-avatar"
                          // title={member.username}
                        >
                          <img src={member.avatar} alt={member.username} />
                        </span>
                      ))}
                    {selectedCreateMembers.length > MAX_VISIBLE_GROUP_AVATARS && (
                      <span className="group-member-overflow">
                        {selectedCreateMembers.length - MAX_VISIBLE_GROUP_AVATARS}+
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="group-dialog-primary create-group-submit"
                  disabled={groupCreating}
                  onClick={() => void handleCreateGroup()}
                >
                  {groupCreating ? t('chat.creatingGroup') : t('chat.createGroup')}
                </button>

                {groupCreateError && (
                  <p className="create-group-error" role="alert">{groupCreateError}</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      {isLlmConfigOpen && isSelectedSystemUser && (
        <div className="group-share-overlay llm-config-overlay" role="presentation">
          <button
            type="button"
            className="group-share-backdrop"
            aria-label={t('chat.closeLlmDialog')}
            onClick={() => {
              if (!llmConnecting) setIsLlmConfigOpen(false);
            }}
          />
          <div
            className="group-share-dialog llm-config-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="llm-config-title"
          >
            <button
              type="button"
              className="group-share-close"
              aria-label={t('chat.closeLlmDialog')}
              disabled={llmConnecting}
              onClick={() => setIsLlmConfigOpen(false)}
            >
              <X size={17} aria-hidden="true" />
            </button>

            <div className="group-share-heading">
              <span className="group-share-icon llm-config-icon" aria-hidden="true">
                <Settings2 size={23} strokeWidth={1.8} />
              </span>
              <div className="group-share-heading-copy">
                <h2 id="llm-config-title">{t('chat.llmConfigTitle')}</h2>
                <p className="group-share-description">{t('chat.llmConfigDescription')}</p>
              </div>
            </div>

            <div className="llm-config-form">
              <label className="create-group-field create-group-name-field model-training-name-field llm-config-field llm-preset-field">
                <span>{t('chat.llmPreset')}</span>
                <select
                  value={selectedLlmPreset}
                  onChange={event => {
                    const preset = LLM_PRESETS.find(item => item.id === event.target.value);
                    setSelectedLlmPreset(event.target.value);
                    if (!preset || preset.id === 'custom') {
                      setLlmConfig(current => ({
                        ...current,
                        model_name: '',
                        api_token: '',
                        api_request_url: '',
                        effort: '',
                        connected: false,
                      }));
                    } else {
                      setLlmConfig(current => ({
                        ...current,
                        model_name: preset.model_name,
                        api_request_url: preset.api_request_url,
                        effort: preset.effort,
                        connected: false,
                      }));
                    }
                    setLlmConnectionStatus('');
                    setLlmConfigError('');
                  }}
                >
                  <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                  <option value="custom">{t('chat.llmCustomPreset')}</option>
                </select>
              </label>
              <label className="create-group-field create-group-name-field model-training-name-field llm-config-field">
                <span>{t('chat.llmModelName')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="text"
                  value={llmConfig.model_name}
                  required
                  aria-required="true"
                  placeholder="deepseek-v4-flash"
                  onChange={event => {
                    setLlmConfig(current => ({
                      ...current,
                      model_name: event.target.value,
                      effort: current.effort.trim() || (
                        event.target.value.trim().toLowerCase() === 'deepseek-v4-flash'
                          ? 'low'
                          : ''
                      ),
                      connected: false,
                    }));
                    setLlmConnectionStatus('');
                  }}
                />
              </label>
              <label className="create-group-field create-group-name-field model-training-name-field llm-config-field">
                <span>{t('chat.llmApiToken')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="password"
                  autoComplete="off"
                  value={llmConfig.api_token}
                  required
                  aria-required="true"
                  placeholder="sk-..."
                  onChange={event => {
                    setLlmConfig(current => ({
                      ...current,
                      api_token: event.target.value,
                      connected: false,
                    }));
                    setLlmConnectionStatus('');
                  }}
                />
              </label>
              <label className="create-group-field create-group-name-field model-training-name-field llm-config-field">
                <span>{t('chat.llmRequestUrl')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="url"
                  value={llmConfig.api_request_url}
                  required
                  aria-required="true"
                  placeholder="https://api.deepseek.com"
                  onChange={event => {
                    setLlmConfig(current => ({
                      ...current,
                      api_request_url: event.target.value,
                      connected: false,
                    }));
                    setLlmConnectionStatus('');
                  }}
                />
              </label>
              <label className="create-group-field create-group-name-field model-training-name-field llm-config-field">
                <span>{t('chat.llmReasoningEffort')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="text"
                  value={llmConfig.effort}
                  required
                  aria-required="true"
                  placeholder="low"
                  onChange={event => {
                    setLlmConfig(current => ({
                      ...current,
                      effort: event.target.value,
                      connected: false,
                    }));
                    setLlmConnectionStatus('');
                  }}
                />
              </label>
              {llmConfigError && (
                <p className="create-group-error" role="alert">{llmConfigError}</p>
              )}
              <div className="llm-config-actions">
                <span
                  className={`llm-connection-status is-${llmConnectionStatus}`}
                  role={llmConnectionStatus === 'failed' ? 'alert' : undefined}
                >
                  {llmConnectionStatus === 'success'
                    ? t('chat.llmConnectionSuccessStatus')
                    : llmConnectionStatus === 'failed'
                      ? t('chat.llmConnectionFailedStatus')
                      : ''}
                </span>
                <button
                  type="button"
                  className="group-dialog-primary llm-connect-submit"
                  disabled={
                    llmConnecting
                    || !llmConfig.model_name.trim()
                    || !llmConfig.api_token.trim()
                    || !llmConfig.api_request_url.trim()
                    || !llmConfig.effort.trim()
                  }
                  onClick={() => void handleConnectLlm()}
                >
                  {llmConnecting ? t('chat.llmConnecting') : t('chat.connectLlm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isModelTrainingOpen && isSelectedSystemUser && (
        <div className="group-share-overlay model-training-overlay" role="presentation">
          <button
            type="button"
            className="group-share-backdrop"
            aria-label={t('chat.closeModelTrainingDialog')}
            onClick={closeModelTrainingDialog}
          />
          <div
            className="group-share-dialog model-training-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-training-title"
            aria-describedby="model-training-description"
          >
            <button
              type="button"
              className="group-share-close"
              aria-label={t('chat.closeModelTrainingDialog')}
              onClick={closeModelTrainingDialog}
            >
              <X size={17} aria-hidden="true" />
            </button>

            <div className="group-share-heading">
              <span className="group-share-icon model-training-icon" aria-hidden="true">
                <Sparkles size={24} strokeWidth={1.8} />
              </span>
              <div className="group-share-heading-copy">
                <p className="group-share-eyebrow">{t('chat.modelTrainingEyebrow')}</p>
                <h2 id="model-training-title">{t('chat.modelTrainingTitle')}</h2>
                <p id="model-training-description" className="group-share-description">
                  {t('chat.modelTrainingDescription')}
                </p>
              </div>
            </div>

            <div className="model-training-form">
              <label className="create-group-field create-group-name-field model-training-name-field">
                <span>{t('chat.modelNickname')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="text"
                  value={modelNickname}
                  maxLength={50}
                  required
                  aria-required="true"
                  placeholder={t('chat.modelNicknamePlaceholder')}
                  onChange={event => setModelNickname(event.target.value)}
                />
              </label>

              <label className="create-group-field create-group-name-field model-training-name-field">
                <span>{t('chat.modelVersionName')}<b className="required-mark" aria-hidden="true">*</b></span>
                <input
                  type="text"
                  value={modelVersionName}
                  maxLength={80}
                  required
                  aria-required="true"
                  list="voice-model-version-names"
                  placeholder={t('chat.modelVersionNamePlaceholder')}
                  onChange={event => {
                    const value = event.target.value;
                    if (voiceModelOptions.some(model => model.name === value)) return;
                    setModelVersionName(value);
                  }}
                />
                <datalist id="voice-model-version-names">
                  {voiceModelOptions.map(model => (
                    <option key={model.id} value={model.name} disabled />
                  ))}
                </datalist>
              </label>

              <div className="model-training-upload-grid">
                <div className="model-training-upload-card">
                  <div className="model-training-upload-copy">
                    <span className="model-training-upload-icon" aria-hidden="true">
                      <FileAudio size={19} strokeWidth={1.8} />
                    </span>
                    <div>
                      <strong>{t('chat.warAudioFiles')}<b className="required-mark" aria-hidden="true">*</b></strong>
                      <small>{t('chat.warAudioDescription')}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="model-training-file-button"
                    onClick={() => warFilesInputRef.current?.click()}
                  >
                    <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                    {t('chat.chooseWarFiles')}
                  </button>
                  <input
                    ref={warFilesInputRef}
                    type="file"
                    accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*"
                    multiple
                    hidden
                    required
                    aria-required="true"
                    onChange={handleWarFilesChange}
                  />
                  {warFiles.length > 0 && (
                    <div
                      className="model-training-upload-progress"
                      role="progressbar"
                      aria-label={t('chat.modelTrainingUploadProgress')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={voiceUploadProgress.percent}
                    >
                      <div className="model-training-upload-progress-heading">
                        <span>{t('chat.modelTrainingUploadProgress')}</span>
                        <strong>{voiceUploadProgress.percent}%</strong>
                      </div>
                      <div className="model-training-upload-track">
                        <span style={{ width: `${voiceUploadProgress.percent}%` }} />
                      </div>
                      <small>
                        {t('chat.modelTrainingUploadCount', {
                          uploaded: voiceUploadProgress.successful,
                          total: warFiles.length,
                        })}
                      </small>
                    </div>
                  )}
                  <div className={`model-training-file-status${warFiles.length ? ' has-files' : ''}`}>
                    {warFiles.length
                      ? t('chat.warFilesSelected', { count: warFiles.length })
                      : t('chat.noWarFiles')}
                  </div>
                </div>

                <div className="model-training-upload-card">
                  <div className="model-training-upload-copy">
                    <span className="model-training-upload-icon" aria-hidden="true">
                      <FileText size={19} strokeWidth={1.8} />
                    </span>
                    <div>
                      <strong>{t('chat.listTextFile')}<b className="required-mark" aria-hidden="true">*</b></strong>
                      <small>{t('chat.listTextDescription')}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="model-training-file-button"
                    onClick={() => listTextFileInputRef.current?.click()}
                  >
                    <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                    {t('chat.chooseListTextFile')}
                  </button>
                  <input
                    ref={listTextFileInputRef}
                    type="file"
                    accept=".txt,.list"
                    hidden
                    required
                    aria-required="true"
                    onChange={handleListTextFileChange}
                  />
                  <div className={`model-training-file-status${listTextFile ? ' has-files' : ''}`}>
                    {listTextFile && (
                      <CheckCircle2
                        className="model-training-file-success"
                        size={15}
                        strokeWidth={2.5}
                        aria-label={t('chat.listTextFileReady')}
                      />
                    )}
                    <span>{listTextFile?.name || t('chat.noListTextFile')}</span>
                  </div>
                </div>
              </div>

              <div className="model-training-summary">
                <BrainCircuit size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{t('chat.modelTrainingSummary')}</span>
              </div>

              {trainingProgressVisible && (
                <div
                  className={`model-training-job-progress${
                    voiceModelStatus === 'ready' ? ' is-complete' : ''
                  }${
                    voiceModelStatus === 'failed' ? ' is-failed' : ''
                  }`}
                  role="progressbar"
                  aria-label={t('chat.modelTrainingProgress')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={trainingProgressPercent}
                >
                  <div className="model-training-upload-progress-heading">
                    <span>{t('chat.modelTrainingProgress')}</span>
                    <strong>{trainingProgressPercent}%</strong>
                  </div>
                  <div className="model-training-upload-track">
                    <span style={{ width: `${trainingProgressPercent}%` }} />
                  </div>
                  <p className="model-training-job-status">
                    {voiceModelStatus === 'ready'
                      ? t('chat.modelTrainingCompleted')
                      : voiceModelStatus === 'training'
                        ? voiceModelStage
                          ? t('chat.modelTrainingRunningStage', { stage: voiceModelStage })
                          : t('chat.modelTrainingRunning')
                        : voiceModelStatus === 'queued'
                          ? t('chat.modelTrainingQueuedStatus')
                          : voiceModelStatus === 'failed'
                            ? formatVoiceTrainingError(voiceModelErrorDetail, t)
                            : modelTraining
                              ? t('chat.modelTrainingStarting')
                              : t('chat.modelTrainingAwaitingCommand')}
                  </p>
                </div>
              )}

              <button
                type="button"
                className="group-dialog-primary model-training-submit"
                disabled={
                  modelTraining
                  || ['queued', 'training'].includes(voiceModelStatus)
                  || !modelNickname.trim()
                  || !modelVersionName.trim()
                  || warFiles.length === 0
                  || warFiles.some(file => file.size === 0)
                  || !listTextFile
                  || listTextFile.size === 0
                }
                onClick={() => void handleStartModelTraining()}
              >
                <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                {modelTraining ? t('chat.modelTrainingStarting') : t('chat.publishModel')}
                <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              {modelTrainingError && (
                <p className="create-group-error" role="alert">{modelTrainingError}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {deleteMomentId && (
        <div className="moment-delete-overlay" role="presentation">
          <button
            type="button"
            className="moment-delete-backdrop"
            aria-label={t('chat.cancelDeletion')}
            disabled={deletingMomentId !== null}
            onClick={() => setDeleteMomentId(null)}
          />
          <div
            className="moment-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="moment-delete-title"
            aria-describedby="moment-delete-description"
          >
            <div className="moment-delete-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
              </svg>
            </div>
            <h3 id="moment-delete-title">{t('chat.deleteMomentTitle')}</h3>
            <p id="moment-delete-description">
              {t('chat.deleteMomentDescription')}
            </p>
            <div className="moment-delete-actions">
              <button
                type="button"
                className="moment-delete-cancel"
                disabled={deletingMomentId !== null}
                onClick={() => setDeleteMomentId(null)}
              >
                {t('chat.cancel')}
              </button>
              <button
                type="button"
                className="moment-delete-confirm"
                disabled={deletingMomentId !== null}
                onClick={() => void handleMomentDelete()}
              >
                {deletingMomentId !== null && (
                  <span className="moment-delete-spinner" aria-hidden="true" />
                )}
                {deletingMomentId !== null ? t('chat.deleting') : t('chat.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default Chat;
