import {
  ChevronLeft,
  ChevronRight,
  Check,
  CircleAlert,
  Clock3,
  Heart,
  Home,
  LayoutGrid,
  Library,
  ListMusic,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import bg0 from '@/assets/images/bg-0.webp';
import playlistDiscArt from '@/assets/images/bg-8.webp';
import {
  deleteMusicTrack,
  getMusicLibrary,
  getMusicTrack,
  musicWebSocketUrl,
  normalizeMusicEvent,
  updateMusicFavorite,
  uploadMusic,
  MusicDuplicateError,
  type MusicDuplicateMatch,
  type MusicPage,
  type MusicTrack,
  type MusicUserLibrary,
} from '@/api/music';
import ProUpgradeDialog from '@/components/ProUpgradeDialog';
import { useMusicPlayback } from '@/context/MusicPlaybackContext';
import { musicApi, type MusicPageQueryArgs } from '@/store/musicApi';
import { store, type AppDispatch, type RootState } from '@/store/store';
import '@/styles/music.scss';

type MusicProps = {
  isActive?: boolean;
};
type View = 'home' | 'library' | 'playlist' | 'favorites';
type PlayMode = 'sequential' | 'shuffle' | 'single';
type LibraryLayout = 'list' | 'cards';
type StoredPlaybackProgress = {
  trackId: string;
  elapsed: number;
};
type PendingDuplicateUpload = {
  files: File[];
  kind: 'exact' | 'similar';
  matches: MusicDuplicateMatch[];
};

const EMPTY_TRACK: MusicTrack = {
  id: '',
  title: 'Your music library',
  artist: 'Add music to begin',
  album: 'Private Collection',
  duration: 0,
  bitrate: 0,
  sampleRate: 0,
  cover: bg0,
  audioUrl: '',
  originalUrl: '',
  format: 'm4a',
  originalFormat: '',
  size: 0,
  originalSize: 0,
  isFavorite: false,
  processingStatus: 'ready',
  processingError: '',
  createdAt: '',
  detailsLoaded: true,
};

const navItems: Array<{ id: View; labelKey: string; icon: typeof Home }> = [
  { id: 'home', labelKey: 'music.home', icon: Home },
  { id: 'library', labelKey: 'music.library', icon: Library },
  { id: 'playlist', labelKey: 'music.playlist', icon: ListMusic },
  { id: 'favorites', labelKey: 'music.favorites', icon: Heart },
];

const playModeLabelKeys: Record<PlayMode, string> = {
  sequential: 'music.listRepeat',
  shuffle: 'music.shuffle',
  single: 'music.repeatOne',
};

const CURRENT_MUSIC_TRACK_KEY = 'music_current_track_id';
const CURRENT_MUSIC_TRACK_META_KEY = 'music_current_track_meta';
const CURRENT_MUSIC_PROGRESS_KEY = 'music_current_track_progress';
const ACTIVE_MUSIC_VIEW_KEY = 'music_active_view';
const MUSIC_LIBRARY_LAYOUT_KEY = 'music_library_layout';
const MUSIC_ADD_PARTICLE_COUNT = 60;
const MUSIC_ADD_PARTICLE_COLORS = [
  '#ff5f7e',
  '#ff9f43',
  '#ffd166',
  '#48d597',
  '#38bdf8',
  '#7c83fd',
  '#c084fc',
  '#f472b6',
];
const MUSIC_ADD_PARTICLES = Array.from({ length: MUSIC_ADD_PARTICLE_COUNT }, (_, particleIndex) => {
  const angle = ((Math.PI * 2 * particleIndex) / MUSIC_ADD_PARTICLE_COUNT) - (Math.PI / 2);
  const distance = 2.1 + ((particleIndex % 5) * 0.28);
  return {
    key: particleIndex,
    style: {
      '--particle-x': `${(Math.cos(angle) * distance).toFixed(3)}rem`,
      '--particle-y': `${(Math.sin(angle) * distance).toFixed(3)}rem`,
      animationDelay: '0s',
      backgroundColor: MUSIC_ADD_PARTICLE_COLORS[particleIndex % MUSIC_ADD_PARTICLE_COLORS.length],
    } as CSSProperties,
  };
});

const getStoredMusicView = (): View => {
  try {
    const storedView = window.localStorage.getItem(ACTIVE_MUSIC_VIEW_KEY);
    return storedView === 'library' || storedView === 'playlist' || storedView === 'favorites'
      ? storedView
      : 'home';
  } catch {
    return 'home';
  }
};

const getStoredLibraryLayout = (): LibraryLayout => {
  try {
    return window.localStorage.getItem(MUSIC_LIBRARY_LAYOUT_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list';
  }
};

const getStoredCurrentTrack = (): MusicTrack | null => {
  try {
    const value = window.localStorage.getItem(CURRENT_MUSIC_TRACK_META_KEY);
    if (!value) return null;
    const track = JSON.parse(value) as Partial<MusicTrack>;
    if (typeof track.id !== 'string' || !track.id) return null;
    return {
      ...EMPTY_TRACK,
      ...track,
      id: track.id,
      title: typeof track.title === 'string' ? track.title : EMPTY_TRACK.title,
      artist: typeof track.artist === 'string' ? track.artist : EMPTY_TRACK.artist,
      album: typeof track.album === 'string' ? track.album : EMPTY_TRACK.album,
      audioUrl: '',
      originalUrl: '',
      detailsLoaded: false,
    };
  } catch {
    return null;
  }
};

const getStoredPlaybackProgress = (): StoredPlaybackProgress | null => {
  try {
    const value = window.localStorage.getItem(CURRENT_MUSIC_PROGRESS_KEY);
    if (!value) return null;
    const progress = JSON.parse(value) as Partial<StoredPlaybackProgress>;
    if (typeof progress.trackId !== 'string' || !progress.trackId) return null;
    if (typeof progress.elapsed !== 'number' || !Number.isFinite(progress.elapsed)) return null;
    return {
      trackId: progress.trackId,
      elapsed: Math.max(0, progress.elapsed),
    };
  } catch {
    return null;
  }
};

const mergeMusicTrack = (existing: MusicTrack | undefined, incoming: MusicTrack) => {
  if (!existing) return incoming;
  if (!existing.detailsLoaded) return { ...existing, ...incoming };
  return {
    ...existing,
    ...incoming,
    bitrate: existing.bitrate,
    sampleRate: existing.sampleRate,
    audioUrl: existing.audioUrl,
    originalUrl: existing.originalUrl,
    format: existing.format,
    originalFormat: existing.originalFormat,
    size: existing.size,
    originalSize: existing.originalSize,
    detailsLoaded: true,
  };
};

const mergeMusicTracks = (current: MusicTrack[], incoming: MusicTrack[]) => {
  if (!incoming.length) return current;
  const incomingById = new Map(incoming.map((track) => [track.id, track]));
  const merged = current.map((track) => {
    const update = incomingById.get(track.id);
    if (!update) return track;
    incomingById.delete(track.id);
    return mergeMusicTrack(track, update);
  });
  incomingById.forEach((track) => merged.push(track));
  return merged;
};

const formatTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

const formatDateAdded = (value: string, locale: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';

  const difference = (timestamp - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const [unit, seconds] = units.find(([, unitSeconds]) => Math.abs(difference) >= unitSeconds)
    ?? ['second', 1];
  return formatter.format(Math.round(difference / seconds), unit);
};

const hasActiveLibrarySubscription = (user: RootState['auth']['user']) => {
  if (!user) return false;
  const paidPlan = user.plan?.trim().toLowerCase() === 'pro';
  const activeStatus = (user.subscription_status ?? '').trim().toLowerCase() === 'active';
  const endTimestamp = user.subscription_end_at
    ? Date.parse(user.subscription_end_at)
    : Number.POSITIVE_INFINITY;
  return paidPlan && activeStatus && endTimestamp > Date.now();
};

function musicPageCacheKey(args: MusicPageQueryArgs) {
  return `${args.view}:${args.userId || 'guest'}:${args.page}:${args.pageSize}`;
}

function Music({ isActive = true }: MusicProps) {
  const { t, i18n } = useTranslation();
  const { publishPlayback, registerControls } = useMusicPlayback();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const authInitialized = useSelector((state: RootState) => state.auth.initialized);
  const [storedPlaybackProgress] = useState(getStoredPlaybackProgress);
  const [activeView, setActiveView] = useState<View>(getStoredMusicView);
  const [collectionUserId, setCollectionUserId] = useState('');
  const [libraryLayout, setLibraryLayout] = useState<LibraryLayout>(getStoredLibraryLayout);
  const [libraryPage, setLibraryPage] = useState(1);
  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    const storedTrack = getStoredCurrentTrack();
    return storedTrack ? [storedTrack] : [];
  });
  const [pageTracks, setPageTracks] = useState<MusicTrack[]>([]);
  const [musicTotal, setMusicTotal] = useState(0);
  const [musicTotalDuration, setMusicTotalDuration] = useState(0);
  const [musicPageCount, setMusicPageCount] = useState(0);
  const [userLibraries, setUserLibraries] = useState<MusicUserLibrary[]>([]);
  const [isUserLibraryLoaded, setIsUserLibraryLoaded] = useState(false);
  const [isUserLibraryLoading, setIsUserLibraryLoading] = useState(false);
  const [userLibraryLoadFailed, setUserLibraryLoadFailed] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackTrackId, setPlaybackTrackId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicLoaded, setIsMusicLoaded] = useState(false);
  const [isMusicPageLoading, setIsMusicPageLoading] = useState(false);
  const [musicRefreshKey, setMusicRefreshKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<'confirm' | 'ignore' | ''>('');
  const [pendingDuplicateUpload, setPendingDuplicateUpload] = useState<PendingDuplicateUpload | null>(null);
  const [openTrackMenuId, setOpenTrackMenuId] = useState('');
  const [favoriteBurstId, setFavoriteBurstId] = useState('');
  const [deletingTrackId, setDeletingTrackId] = useState('');
  const [removingTrackId, setRemovingTrackId] = useState('');
  const [featuredTrackId, setFeaturedTrackId] = useState('');
  const [previousFeaturedCover, setPreviousFeaturedCover] = useState('');
  const [featuredTransition, setFeaturedTransition] = useState(0);
  const [volume, setVolume] = useState(68);
  const [lastVolume, setLastVolume] = useState(68);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const emptyTrack = useMemo(() => ({
    ...EMPTY_TRACK,
    title: t('music.emptyTrackTitle'),
    artist: t('music.emptyTrackArtist'),
    album: t('music.emptyTrackAlbum'),
  }), [t]);
  const currentTrack = tracks[currentIndex] ?? emptyTrack;
  const featuredCandidates = useMemo(
    () => pageTracks.filter((track) => track.processingStatus === 'ready'),
    [pageTracks],
  );
  const featuredCandidateIds = useMemo(
    () => featuredCandidates.map((track) => track.id).join('|'),
    [featuredCandidates],
  );
  const featuredTrack = featuredCandidates.find((track) => track.id === featuredTrackId)
    ?? featuredCandidates[0]
    ?? pageTracks[0]
    ?? emptyTrack;
  const featuredTrackNumber = pageTracks.findIndex((track) => track.id === featuredTrack.id) + 1;
  const isFeaturedPlaying = playbackTrackId === featuredTrack.id && isPlaying;
  const hasPlayableTracks = tracks.some((track) => track.processingStatus === 'ready')
    || pageTracks.some((track) => track.processingStatus === 'ready');
  const libraryPageSize = libraryLayout === 'list' ? 10 : 8;
  const libraryPageCount = Math.max(1, musicPageCount);
  const libraryTracks = pageTracks;
  const isCollectionView = activeView === 'playlist' || activeView === 'favorites';
  const hasLibraryAccess = hasActiveLibrarySubscription(currentUser);
  const activeCollection = activeView === 'favorites' ? 'favorites' : 'uploads';
  const collectionOwnerId = collectionUserId || currentUser?.id || '';
  const activeCollectionLibrary = userLibraries.find(
    (library) => (
      library.userId === collectionOwnerId
      && library.collection === activeCollection
    ),
  );
  const collectionTitle = activeCollectionLibrary?.playlistName
    || t(activeView === 'favorites' ? 'music.likedSongs' : 'music.myMusic');
  const libraryOwner = activeCollectionLibrary?.username
    || currentUser?.name
    || currentUser?.username
    || t('music.guestListener');
  const isViewingOwnCollection = Boolean(
    currentUser?.id && collectionOwnerId === currentUser.id,
  );
  const isViewingProCollection = Boolean(
    isCollectionView && currentUser?.id && collectionOwnerId !== currentUser.id,
  );
  const libraryDuration = useMemo(() => {
    const totalSeconds = musicTotalDuration;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [
      hours ? t('music.durationHours', { count: hours }) : '',
      minutes ? t('music.durationMinutes', { count: minutes }) : '',
      seconds || (!hours && !minutes) ? t('music.durationSeconds', { count: seconds }) : '',
    ].filter(Boolean).join(' ');
  }, [musicTotalDuration, t]);
  const sectionTitleKey = activeView === 'playlist'
    ? 'music.allAlbums'
    : 'music.trendingAlbums';
  const duplicateUploadCount = pendingDuplicateUpload
    ? Math.min(
      Math.max(1, pendingDuplicateUpload.matches.length),
      pendingDuplicateUpload.files.length,
    )
    : 0;
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement>(null);
  const initialElapsed = storedPlaybackProgress?.trackId === currentTrack.id
    ? storedPlaybackProgress.elapsed
    : 0;
  const elapsedRef = useRef(initialElapsed);
  const renderedSecondRef = useRef(Math.floor(initialElapsed));
  const storedPlaybackProgressRef = useRef(storedPlaybackProgress);
  const addMusicInputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<MusicTrack[]>([]);
  const featuredTrackIdRef = useRef('');
  const detailRequestsRef = useRef(new Map<string, Promise<MusicTrack>>());
  const playRequestRef = useRef(0);
  const musicPageRequestRef = useRef(0);
  const musicScopeRef = useRef('');
  const musicRefreshKeyRef = useRef(0);
  const musicPageCacheRef = useRef(new Map<string, MusicPage>());
  const userLibraryRequestRef = useRef(0);
  const favoriteBurstTimeoutRef = useRef<number | undefined>(undefined);
  const pageTracksRef = useRef<MusicTrack[]>([]);
  tracksRef.current = tracks;
  pageTracksRef.current = pageTracks;

  const requireMusicAccount = useCallback(() => {
    if (currentUser) return true;
    window.dispatchEvent(new CustomEvent('app:notification', {
      detail: { message: t('music.signInRequired'), type: 'warning' },
    }));
    return false;
  }, [currentUser, t]);

  const openUpgradeDialog = useCallback(() => {
    setIsUpgradeOpen(true);
  }, []);

  const openLibraryCollection = useCallback((library: MusicUserLibrary) => {
    const isOwnLibrary = library.userId === currentUser?.id;
    if (!isOwnLibrary && !hasLibraryAccess) {
      openUpgradeDialog();
      return;
    }
    setLibraryPage(1);
    setCollectionUserId(library.userId);
    setActiveView(library.collection === 'favorites' ? 'favorites' : 'playlist');
  }, [currentUser?.id, hasLibraryAccess, openUpgradeDialog]);

  const syncProgressVisual = useCallback((value: number, duration: number) => {
    const progress = duration > 0 ? Math.min((value / duration) * 100, 100) : 0;
    if (progressFillRef.current) progressFillRef.current.style.width = `${progress}%`;
  }, []);

  const setProgressPosition = useCallback((value: number, duration: number) => {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const safeValue = Math.max(0, safeDuration > 0 ? Math.min(value, safeDuration) : value);
    elapsedRef.current = safeValue;
    renderedSecondRef.current = Math.floor(safeValue);
    if (progressRef.current) progressRef.current.value = String(safeValue);
    if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(safeValue);
    syncProgressVisual(safeValue, safeDuration);
  }, [syncProgressVisual]);

  const persistPlaybackProgress = useCallback((trackId: string, elapsed: number) => {
    if (!trackId || !Number.isFinite(elapsed)) return;
    const progress = {
      trackId,
      elapsed: Math.max(0, elapsed),
    };
    storedPlaybackProgressRef.current = progress;
    try {
      window.localStorage.setItem(CURRENT_MUSIC_PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // Playback remains available when storage is unavailable.
    }
  }, []);

  const resetProgress = useCallback(() => {
    setProgressPosition(0, 1);
  }, [setProgressPosition]);

  const sectionTracks = pageTracks;

  const loadTrackDetails = useCallback(async (trackId: string) => {
    const current = tracksRef.current.find((track) => track.id === trackId);
    if (current?.detailsLoaded) return current;

    let request = detailRequestsRef.current.get(trackId);
    if (!request) {
      request = getMusicTrack(trackId);
      detailRequestsRef.current.set(trackId, request);
    }
    try {
      const detailed = await request;
      setTracks((items) => {
        const updated = items.map((item) => (
          item.id === trackId ? { ...item, ...detailed } : item
        ));
        tracksRef.current = updated;
        return updated;
      });
      setPageTracks((items) => items.map((item) => (
        item.id === trackId ? { ...item, ...detailed } : item
      )));
      return detailed;
    } finally {
      detailRequestsRef.current.delete(trackId);
    }
  }, []);

  const playTrack = useCallback(async (track: MusicTrack) => {
    if (track.processingStatus !== 'ready') return;
    const playRequest = playRequestRef.current + 1;
    playRequestRef.current = playRequest;
    let playableTrack = track;
    try {
      playableTrack = await loadTrackDetails(track.id);
    } catch (error) {
      if (playRequest === playRequestRef.current) {
        console.error('Failed to load music details', error);
      }
      return;
    }
    if (playRequest !== playRequestRef.current) return;
    if (!playableTrack.audioUrl) return;
    const index = tracksRef.current.findIndex((item) => item.id === track.id);
    if (index < 0) return;
    const preservesProgress = playbackTrackId === track.id
      || storedPlaybackProgressRef.current?.trackId === track.id;
    setCurrentIndex(index);
    setPlaybackTrackId(track.id);
    if (!preservesProgress) {
      resetProgress();
      persistPlaybackProgress(track.id, 0);
    }
    setIsPlaying(true);
  }, [loadTrackDetails, persistPlaybackProgress, playbackTrackId, resetProgress]);

  const goToTrack = useCallback((direction: 1 | -1) => {
    const currentTrackId = playbackTrackId || currentTrack.id;
    const readyVisibleTracks = pageTracksRef.current.filter(
      (track) => track.processingStatus === 'ready',
    );
    const readyTracks = tracksRef.current.filter(
      (track) => track.processingStatus === 'ready',
    );
    const visibleHasCurrent = readyVisibleTracks.some((track) => track.id === currentTrackId);
    const currentTracks = visibleHasCurrent && readyVisibleTracks.length > 1
      ? readyVisibleTracks
      : readyTracks;
    if (!currentTracks.length) return;

    const queueCurrentIndex = currentTracks.findIndex((track) => track.id === currentTrackId);
    let nextTrack: MusicTrack;
    if (playMode === 'shuffle') {
      const candidates = currentTracks.filter((track) => track.id !== currentTrackId);
      nextTrack = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : currentTracks[0];
    } else {
      const nextIndex = queueCurrentIndex < 0
        ? direction === 1 ? 0 : currentTracks.length - 1
        : (queueCurrentIndex + direction + currentTracks.length) % currentTracks.length;
      nextTrack = currentTracks[nextIndex];
    }
    void playTrack(nextTrack);
  }, [currentTrack.id, playbackTrackId, playMode, playTrack]);

  useEffect(() => {
    document.body.classList.toggle('music-route', isActive);
    document.documentElement.classList.toggle('music-route', isActive);
    return () => {
      document.body.classList.remove('music-route');
      document.documentElement.classList.remove('music-route');
    };
  }, [isActive]);

  useEffect(() => {
    setCollectionUserId(currentUser?.id || '');
  }, [currentUser?.id]);

  useEffect(() => () => {
    if (favoriteBurstTimeoutRef.current !== undefined) {
      window.clearTimeout(favoriteBurstTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!openTrackMenuId) return;
    const closeMenu = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.music-card-actions')) return;
      setOpenTrackMenuId('');
    };
    const closeMenuWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenTrackMenuId('');
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenuWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenuWithEscape);
    };
  }, [openTrackMenuId]);

  useEffect(() => {
    if (!pendingDuplicateUpload || isUploading) return;
    const closeDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingDuplicateUpload(null);
    };
    document.addEventListener('keydown', closeDialog);
    return () => document.removeEventListener('keydown', closeDialog);
  }, [isUploading, pendingDuplicateUpload]);

  useEffect(() => {
    if (!authInitialized || !currentUser || hasLibraryAccess || !isViewingProCollection) return;
    musicPageRequestRef.current += 1;
    setActiveView('library');
  }, [
    authInitialized,
    currentUser,
    hasLibraryAccess,
    isViewingProCollection,
  ]);

  useEffect(() => {
    if (activeView === 'library') {
      musicPageRequestRef.current += 1;
      setIsMusicPageLoading(false);
      return;
    }
    if (!authInitialized) return;
    if (isViewingProCollection && currentUser && !hasLibraryAccess) {
      musicPageRequestRef.current += 1;
      setPageTracks([]);
      setMusicTotal(0);
      setMusicTotalDuration(0);
      setMusicPageCount(0);
      setIsMusicLoaded(true);
      setIsMusicPageLoading(false);
      return;
    }
    if (activeView === 'favorites' && !currentUser) {
      musicPageRequestRef.current += 1;
      musicScopeRef.current = 'favorites:guest';
      setPageTracks([]);
      setMusicTotal(0);
      setMusicTotalDuration(0);
      setMusicPageCount(0);
      setIsMusicLoaded(true);
      setIsMusicPageLoading(false);
      return;
    }

    const requestedScope = `${activeView}:${collectionOwnerId || 'guest'}`;
    if (musicScopeRef.current !== requestedScope) {
      musicScopeRef.current = requestedScope;
      setPageTracks([]);
      setMusicTotal(0);
      setMusicTotalDuration(0);
      setMusicPageCount(0);
      setIsMusicLoaded(false);
    }

    const requestId = musicPageRequestRef.current + 1;
    musicPageRequestRef.current = requestId;
    const requestedPage = isCollectionView ? libraryPage : 1;
    const requestedPageSize = activeView === 'home'
      ? 4
      : libraryPageSize;

    const pageQueryArgs: MusicPageQueryArgs = {
      view: activeView === 'home' ? 'home' : activeView,
      page: requestedPage,
      pageSize: requestedPageSize,
      userId: collectionOwnerId || undefined,
    };
    const pageCacheKey = musicPageCacheKey(pageQueryArgs);
    const cachedPage = musicPageCacheRef.current.get(pageCacheKey)
      ?? musicApi.endpoints.getMusicPage.select(pageQueryArgs)(store.getState()).data;
    const shouldForceRefetch = musicRefreshKeyRef.current !== musicRefreshKey;
    musicRefreshKeyRef.current = musicRefreshKey;
    const applyMusicPage = (music: MusicPage) => {
      if (requestId !== musicPageRequestRef.current) return;
      if (
        isCollectionView
        && music.totalPages > 0
        && requestedPage > music.totalPages
      ) {
        setMusicTotal(music.total);
        setMusicTotalDuration(music.totalDuration);
        setMusicPageCount(music.totalPages);
        setLibraryPage(music.totalPages);
        return;
      }

      const cachedById = new Map(tracksRef.current.map((track) => [track.id, track]));
      const visibleItems = music.items.map((track) => (
        mergeMusicTrack(cachedById.get(track.id), track)
      ));
      const mergedTracks = mergeMusicTracks(tracksRef.current, music.items);
      tracksRef.current = mergedTracks;
      setTracks(mergedTracks);
      setPageTracks(visibleItems);
      setMusicTotal(music.total);
      setMusicTotalDuration(music.totalDuration);
      setMusicPageCount(music.totalPages);
    };

    if (cachedPage) {
      musicPageCacheRef.current.set(pageCacheKey, cachedPage);
      applyMusicPage(cachedPage);
      setIsMusicLoaded(true);
      setIsMusicPageLoading(false);
    } else {
      setIsMusicPageLoading(true);
    }

    const musicRequest = dispatch(
      musicApi.endpoints.getMusicPage.initiate(pageQueryArgs, {
        subscribe: false,
        forceRefetch: shouldForceRefetch,
      }),
    ).unwrap();

    musicRequest
      .then((music) => {
        if (requestId !== musicPageRequestRef.current) return;
        musicPageCacheRef.current.set(pageCacheKey, music);
        applyMusicPage(music);
        if (isCollectionView && requestedPage < music.totalPages) {
          dispatch(musicApi.util.prefetch('getMusicPage', {
            ...pageQueryArgs,
            page: requestedPage + 1,
          }, { force: false }));
        }
      })
      .catch((error) => {
        if (requestId === musicPageRequestRef.current) {
          console.error('Failed to load music', error);
        }
      })
      .finally(() => {
        if (requestId === musicPageRequestRef.current) {
          setIsMusicLoaded(true);
          if (!cachedPage) setIsMusicPageLoading(false);
        }
      });
  }, [
    activeView,
    authInitialized,
    collectionOwnerId,
    dispatch,
    currentUser?.id,
    hasLibraryAccess,
    isCollectionView,
    isViewingProCollection,
    libraryPage,
    libraryPageSize,
    musicRefreshKey,
  ]);

  useEffect(() => {
    if (activeView !== 'library') return;
    if (!authInitialized) return;
    if (!currentUser) {
      userLibraryRequestRef.current += 1;
      setUserLibraries([]);
      setIsUserLibraryLoaded(true);
      setIsUserLibraryLoading(false);
      setUserLibraryLoadFailed(false);
      return;
    }
    const requestId = userLibraryRequestRef.current + 1;
    userLibraryRequestRef.current = requestId;
    setIsUserLibraryLoading(true);
    setUserLibraryLoadFailed(false);

    getMusicLibrary()
      .then((libraries) => {
        if (requestId !== userLibraryRequestRef.current) return;
        setUserLibraries(libraries);
      })
      .catch((error) => {
        if (requestId !== userLibraryRequestRef.current) return;
        console.error('Failed to load music libraries', error);
        setUserLibraryLoadFailed(true);
      })
      .finally(() => {
        if (requestId !== userLibraryRequestRef.current) return;
        setIsUserLibraryLoaded(true);
        setIsUserLibraryLoading(false);
      });
  }, [activeView, authInitialized, currentUser?.id, musicRefreshKey]);

  useEffect(() => {
    if (!currentUser) return;
    let socket: WebSocket | null = null;
    let connectTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let reconnectDelay = 1000;

    const mergeTrack = (updated: MusicTrack) => {
      setTracks((current) => {
        const next = updated.processingStatus === 'failed'
          ? current.filter((track) => track.id !== updated.id)
          : mergeMusicTracks(current, [updated]);
        tracksRef.current = next;
        return next;
      });
      setPageTracks((current) => {
        if (updated.processingStatus === 'failed') {
          return current.filter((track) => track.id !== updated.id);
        }
        return current.map((track) => (
          track.id === updated.id ? mergeMusicTrack(track, updated) : track
        ));
      });
      setMusicRefreshKey((key) => key + 1);
    };

    const reconcileProcessingTracks = () => {
      if (tracksRef.current.some((track) => track.processingStatus === 'processing')) {
        setMusicRefreshKey((key) => key + 1);
      }
    };

    const connect = () => {
      if (disposed) return;
      const currentSocket = new WebSocket(musicWebSocketUrl());
      socket = currentSocket;

      currentSocket.onopen = () => {
        reconnectDelay = 1000;
        reconcileProcessingTracks();
      };
      currentSocket.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        const updated = normalizeMusicEvent(payload);
        if (updated) mergeTrack(updated);
      };
      currentSocket.onclose = () => {
        if (socket === currentSocket) socket = null;
        if (disposed) return;
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
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      if (currentSocket.readyState === WebSocket.CONNECTING) {
        currentSocket.onopen = () => currentSocket.close(1000, 'Music closed');
      } else if (currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.close(1000, 'Music closed');
      }
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentIndex >= tracks.length && tracks.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, tracks.length]);

  useEffect(() => {
    if (!tracks.length || tracks[currentIndex]?.processingStatus === 'ready') return;
    const firstPlayableIndex = tracks.findIndex(
      (track) => track.processingStatus === 'ready',
    );
    if (firstPlayableIndex >= 0) setCurrentIndex(firstPlayableIndex);
  }, [currentIndex, tracks]);

  useEffect(() => {
    if (!currentTrack.id) return;
    try {
      window.localStorage.setItem(CURRENT_MUSIC_TRACK_KEY, currentTrack.id);
      window.localStorage.setItem(CURRENT_MUSIC_TRACK_META_KEY, JSON.stringify({
        ...currentTrack,
        audioUrl: '',
        originalUrl: '',
        detailsLoaded: false,
      }));
    } catch {
      // Playback remains available when storage is unavailable.
    }
  }, [currentTrack.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_MUSIC_VIEW_KEY, activeView);
    } catch {
      // Keep the current view usable when storage is unavailable.
    }
  }, [activeView]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MUSIC_LIBRARY_LAYOUT_KEY, libraryLayout);
    } catch {
      // Keep the selected layout usable when storage is unavailable.
    }
  }, [libraryLayout]);

  useEffect(() => {
    if (isCollectionView) {
      setLibraryPage((page) => Math.min(page, libraryPageCount));
    }
  }, [isCollectionView, libraryPageCount]);

  useEffect(() => {
    const candidates = pageTracksRef.current.filter((track) => track.processingStatus === 'ready');
    if (!candidates.length) {
      featuredTrackIdRef.current = '';
      setFeaturedTrackId('');
      setPreviousFeaturedCover('');
      return;
    }

    if (!candidates.some((track) => track.id === featuredTrackIdRef.current)) {
      const initialTrack = candidates[Math.floor(Math.random() * candidates.length)];
      featuredTrackIdRef.current = initialTrack.id;
      setFeaturedTrackId(initialTrack.id);
      setPreviousFeaturedCover('');
    }

    if (candidates.length < 2) return;
    const interval = window.setInterval(() => {
      const readyTracks = pageTracksRef.current.filter((track) => track.processingStatus === 'ready');
      const currentId = featuredTrackIdRef.current;
      const currentFeaturedTrack = readyTracks.find((track) => track.id === currentId);
      const alternatives = readyTracks.filter((track) => track.id !== currentId);
      if (!alternatives.length) return;

      const nextTrack = alternatives[Math.floor(Math.random() * alternatives.length)];
      setPreviousFeaturedCover(currentFeaturedTrack?.cover || bg0);
      featuredTrackIdRef.current = nextTrack.id;
      setFeaturedTrackId(nextTrack.id);
      setFeaturedTransition((transition) => transition + 1);
    }, 7000);

    return () => window.clearInterval(interval);
  }, [featuredCandidateIds]);

  useEffect(() => {
    if (!previousFeaturedCover) return;
    const timer = window.setTimeout(() => setPreviousFeaturedCover(''), 900);
    return () => window.clearTimeout(timer);
  }, [featuredTransition, previousFeaturedCover]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playbackTrackId || playbackTrackId !== currentTrack.id || !currentTrack.audioUrl) {
      audio.removeAttribute('src');
      delete audio.dataset.trackId;
      audio.load();
      const storedProgress = storedPlaybackProgressRef.current;
      if (storedProgress?.trackId === currentTrack.id) {
        setProgressPosition(storedProgress.elapsed, currentTrack.duration);
      } else {
        resetProgress();
      }
      return;
    }
    if (audio.dataset.trackId !== currentTrack.id) {
      const storedProgress = storedPlaybackProgressRef.current;
      const restoredElapsed = storedProgress?.trackId === currentTrack.id
        ? storedProgress.elapsed
        : 0;
      audio.dataset.trackId = currentTrack.id;
      audio.src = currentTrack.audioUrl;
      setProgressPosition(restoredElapsed, currentTrack.duration);

      const restoreAudioPosition = () => {
        if (audio.dataset.trackId !== currentTrack.id) return;
        const mediaDuration = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : currentTrack.duration;
        const maxElapsed = mediaDuration > 0 ? Math.max(0, mediaDuration - 0.25) : restoredElapsed;
        const nextElapsed = Math.min(restoredElapsed, maxElapsed);
        audio.currentTime = nextElapsed;
        setProgressPosition(nextElapsed, mediaDuration);
        persistPlaybackProgress(currentTrack.id, nextElapsed);
      };

      audio.addEventListener('loadedmetadata', restoreAudioPosition);
      audio.load();
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        restoreAudioPosition();
      }
      return () => audio.removeEventListener('loadedmetadata', restoreAudioPosition);
    }
  }, [
    currentTrack.audioUrl,
    currentTrack.duration,
    currentTrack.id,
    persistPlaybackProgress,
    playbackTrackId,
    resetProgress,
    setProgressPosition,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio
      || !playbackTrackId
      || playbackTrackId !== currentTrack.id
      || !currentTrack.audioUrl
    ) return;
    if (isPlaying) {
      void audio.play().catch((error) => {
        console.error('Audio playback failed', error);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [currentTrack.audioUrl, currentTrack.id, isPlaying, playbackTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio
      || !isPlaying
      || !playbackTrackId
      || playbackTrackId !== currentTrack.id
      || audio.dataset.trackId !== currentTrack.id
    ) return;
    let frameId = 0;

    const updateProgress = () => {
      if (
        playbackTrackId !== currentTrack.id
        || audio.dataset.trackId !== currentTrack.id
      ) return;

      const mediaDuration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : 0;
      const visualDuration = mediaDuration || currentTrack.duration;
      const nextElapsed = Math.min(audio.currentTime, visualDuration);
      const nextSecond = Math.floor(nextElapsed);
      elapsedRef.current = nextElapsed;
      syncProgressVisual(nextElapsed, visualDuration);

      if (nextSecond !== renderedSecondRef.current) {
        renderedSecondRef.current = nextSecond;
        if (progressRef.current) progressRef.current.value = String(nextElapsed);
        if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(nextElapsed);
        persistPlaybackProgress(currentTrack.id, nextElapsed);
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    currentTrack.duration,
    currentTrack.id,
    isPlaying,
    persistPlaybackProgress,
    playbackTrackId,
    syncProgressVisual,
  ]);

  useEffect(() => {
    syncProgressVisual(elapsedRef.current, currentTrack.duration);
  }, [currentTrack.duration, currentTrack.id, syncProgressVisual]);

  useEffect(() => {
    const persistCurrentPosition = () => {
      if (!currentTrack.id) return;
      const audio = audioRef.current;
      const elapsed = audio?.dataset.trackId === currentTrack.id
        ? audio.currentTime
        : elapsedRef.current;
      persistPlaybackProgress(currentTrack.id, elapsed);
    };
    window.addEventListener('pagehide', persistCurrentPosition);
    return () => {
      persistCurrentPosition();
      window.removeEventListener('pagehide', persistCurrentPosition);
    };
  }, [currentTrack.id, persistPlaybackProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => {
      if (playMode === 'single') {
        audio.currentTime = 0;
        resetProgress();
        persistPlaybackProgress(currentTrack.id, 0);
        void audio.play().catch((error) => {
          console.error('Audio repeat playback failed', error);
          setIsPlaying(false);
        });
        return;
      }
      goToTrack(1);
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [currentTrack.id, goToTrack, persistPlaybackProgress, playMode, resetProgress]);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, button, a')) return;
      if (event.code === 'Space' && hasPlayableTracks) {
        event.preventDefault();
        if (isPlaying) setIsPlaying(false);
        else void playTrack(currentTrack);
      }
      if (event.code === 'ArrowRight') goToTrack(1);
      if (event.code === 'ArrowLeft') goToTrack(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTrack, goToTrack, hasPlayableTracks, isActive, isPlaying, playTrack]);

  const toggleFavorite = async (trackId: string) => {
    if (!requireMusicAccount()) return;
    const track = tracks.find((item) => item.id === trackId)
      ?? pageTracks.find((item) => item.id === trackId);
    if (!track) return;
    const nextFavorite = !track.isFavorite;
    const updateFavoriteState = (favorite: boolean) => {
      setTracks((current) => {
        const next = current.map((item) => (
          item.id === trackId ? { ...item, isFavorite: favorite } : item
        ));
        tracksRef.current = next;
        return next;
      });
      setPageTracks((current) => current.map((item) => (
        item.id === trackId ? { ...item, isFavorite: favorite } : item
      )));
    };
    if (favoriteBurstTimeoutRef.current !== undefined) {
      window.clearTimeout(favoriteBurstTimeoutRef.current);
    }
    if (nextFavorite) {
      setFavoriteBurstId(trackId);
      favoriteBurstTimeoutRef.current = window.setTimeout(() => {
        setFavoriteBurstId((current) => current === trackId ? '' : current);
        favoriteBurstTimeoutRef.current = undefined;
      }, 1120);
    } else {
      setFavoriteBurstId('');
    }
    updateFavoriteState(nextFavorite);
    try {
      const persisted = await updateMusicFavorite(trackId, nextFavorite);
      updateFavoriteState(persisted);
      if (activeView === 'favorites' && isViewingOwnCollection) {
        setMusicRefreshKey((key) => key + 1);
      }
    } catch (error) {
      console.error('Failed to update favorite', error);
      updateFavoriteState(track.isFavorite);
    }
  };

  const removeDeletedTrack = useCallback((trackId: string) => {
    const currentTracks = tracksRef.current;
    const deletedIndex = currentTracks.findIndex((track) => track.id === trackId);
    if (deletedIndex < 0) return;

    const currentTrackId = currentTracks[currentIndex]?.id ?? '';
    const audio = audioRef.current;
    const deletesPlayback = playbackTrackId === trackId || audio?.dataset.trackId === trackId;
    const remainingTracks = currentTracks.filter((track) => track.id !== trackId);

    if (deletesPlayback && audio) {
      audio.pause();
      audio.removeAttribute('src');
      delete audio.dataset.trackId;
      audio.load();
    }
    if (deletesPlayback) {
      playRequestRef.current += 1;
      setPlaybackTrackId('');
      setIsPlaying(false);
      resetProgress();
    }
    if (storedPlaybackProgressRef.current?.trackId === trackId) {
      storedPlaybackProgressRef.current = null;
      window.localStorage.removeItem(CURRENT_MUSIC_PROGRESS_KEY);
    }

    detailRequestsRef.current.delete(trackId);
    tracksRef.current = remainingTracks;
    setTracks(remainingTracks);
    setPageTracks((current) => current.filter((track) => track.id !== trackId));

    if (!remainingTracks.length) {
      window.localStorage.removeItem(CURRENT_MUSIC_TRACK_KEY);
      setCurrentIndex(0);
      return;
    }

    if (currentTrackId && currentTrackId !== trackId) {
      const preservedIndex = remainingTracks.findIndex((track) => track.id === currentTrackId);
      if (preservedIndex >= 0) {
        setCurrentIndex(preservedIndex);
        return;
      }
    }

    const adjacentIndex = Math.min(deletedIndex, remainingTracks.length - 1);
    const adjacentReadyIndex = remainingTracks.findIndex(
      (track, index) => index >= adjacentIndex && track.processingStatus === 'ready',
    );
    const firstReadyIndex = remainingTracks.findIndex((track) => track.processingStatus === 'ready');
    setCurrentIndex(adjacentReadyIndex >= 0 ? adjacentReadyIndex : Math.max(0, firstReadyIndex));
  }, [currentIndex, playbackTrackId, resetProgress]);

  const handleDeleteTrack = useCallback(async (trackId: string) => {
    if (!requireMusicAccount()) {
      setOpenTrackMenuId('');
      return;
    }
    if (deletingTrackId) return;
    setDeletingTrackId(trackId);
    setOpenTrackMenuId('');
    try {
      await deleteMusicTrack(trackId);
      setRemovingTrackId(trackId);
      await new Promise((resolve) => window.setTimeout(resolve, 240));
      removeDeletedTrack(trackId);
      setMusicRefreshKey((key) => key + 1);
    } catch (error) {
      console.error('Failed to delete music', error);
    } finally {
      setDeletingTrackId('');
      setRemovingTrackId('');
    }
  }, [deletingTrackId, removeDeletedTrack, requireMusicAccount]);

  const toggleMute = () => {
    if (volume > 0) {
      setLastVolume(volume);
      setVolume(0);
    } else {
      setVolume(lastVolume || 68);
    }
  };

  const handleCardPointer = (event: PointerEvent<HTMLElement>) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--pointer-x', `${x}%`);
    card.style.setProperty('--pointer-y', `${y}%`);
    card.style.setProperty('--tilt-x', `${(50 - y) / 18}deg`);
    card.style.setProperty('--tilt-y', `${(x - 50) / 18}deg`);
  };

  const resetCardPointer = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--tilt-x', '0deg');
    event.currentTarget.style.setProperty('--tilt-y', '0deg');
  };

  const mergeUploadedTracks = useCallback((created: MusicTrack[]) => {
    const activeTrackId = audioRef.current?.dataset.trackId || tracksRef.current[currentIndex]?.id || '';
    const createdIds = new Set(created.map((track) => track.id));
    const refreshed = [
      ...created,
      ...tracksRef.current.filter((track) => !createdIds.has(track.id)),
    ];
    const refreshedCurrentIndex = refreshed.findIndex((track) => track.id === activeTrackId);
    tracksRef.current = refreshed;
    setTracks(refreshed);
    if (refreshedCurrentIndex >= 0) {
      setCurrentIndex(refreshedCurrentIndex);
    } else if (!activeTrackId) {
      const firstPlayableIndex = refreshed.findIndex(
        (track) => track.processingStatus === 'ready',
      );
      setCurrentIndex(Math.max(0, firstPlayableIndex));
      setIsPlaying(false);
      resetProgress();
    }
    setLibraryPage(1);
    setActiveView('playlist');
    setMusicRefreshKey((key) => key + 1);
  }, [currentIndex, resetProgress]);

  const notifyUploadError = useCallback((error: unknown) => {
    console.error('Failed to upload music', error);
    setTracks((current) => current.filter((track) => track.processingStatus !== 'failed'));
    setPageTracks((current) => current.filter((track) => track.processingStatus !== 'failed'));
    window.dispatchEvent(new CustomEvent('app:notification', {
      detail: {
        message: error instanceof MusicDuplicateError && error.kind === 'exact'
          ? t('music.exactDuplicate')
          : error instanceof Error
            ? error.message
            : t('music.uploadFailed'),
        type: 'error',
      },
    }));
  }, [t]);

  const handleAddMusic = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!requireMusicAccount()) {
      event.target.value = '';
      return;
    }
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setIsUploading(true);
    try {
      mergeUploadedTracks(await uploadMusic(files));
    } catch (error) {
      if (error instanceof MusicDuplicateError) {
        setPendingDuplicateUpload({
          files,
          kind: error.kind,
          matches: error.matches,
        });
      } else {
        notifyUploadError(error);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const confirmDuplicateUpload = async () => {
    if (
      !pendingDuplicateUpload
      || pendingDuplicateUpload.kind !== 'similar'
      || isUploading
    ) return;
    const upload = pendingDuplicateUpload;
    setDuplicateAction('confirm');
    setIsUploading(true);
    try {
      mergeUploadedTracks(await uploadMusic(upload.files, { allowSimilar: true }));
      setPendingDuplicateUpload(null);
    } catch (error) {
      setPendingDuplicateUpload(null);
      notifyUploadError(error);
    } finally {
      setIsUploading(false);
      setDuplicateAction('');
    }
  };

  const uploadWithoutDuplicates = async () => {
    if (!pendingDuplicateUpload || isUploading) return;
    const upload = pendingDuplicateUpload;
    const created: MusicTrack[] = [];
    let skippedCount = 0;
    let firstUploadError: unknown = null;

    setDuplicateAction('ignore');
    setIsUploading(true);
    try {
      for (const file of upload.files) {
        try {
          created.push(...await uploadMusic([file]));
        } catch (error) {
          if (error instanceof MusicDuplicateError) {
            skippedCount += 1;
          } else if (!firstUploadError) {
            firstUploadError = error;
          }
        }
      }

      if (created.length > 0) mergeUploadedTracks(created);
      setPendingDuplicateUpload(null);

      window.dispatchEvent(new CustomEvent('app:notification', {
        detail: {
          message: t('music.ignoreDuplicateResult', {
            uploadedCount: created.length,
            skippedCount,
          }),
          type: created.length > 0 ? 'success' : 'warning',
        },
      }));

      if (firstUploadError) notifyUploadError(firstUploadError);
    } finally {
      setIsUploading(false);
      setDuplicateAction('');
    }
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const toggleCurrentPlayback = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentTrack.processingStatus === 'ready') {
      void playTrack(currentTrack);
    }
  }, [currentTrack, isPlaying, playTrack]);

  const playNextTrack = useCallback(() => {
    goToTrack(1);
  }, [goToTrack]);

  const playPreviousTrack = useCallback(() => {
    goToTrack(-1);
  }, [goToTrack]);

  useEffect(() => {
    publishPlayback({
      track: currentTrack.id ? currentTrack : null,
      isPlaying,
      canPlay: hasPlayableTracks,
    });
  }, [currentTrack, hasPlayableTracks, isPlaying, publishPlayback]);

  useEffect(() => registerControls({
    togglePlayback: toggleCurrentPlayback,
    playNext: playNextTrack,
  }), [playNextTrack, registerControls, toggleCurrentPlayback]);

  const toggleLibraryPlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const selectedTrack = currentTrack.processingStatus === 'ready'
      ? currentTrack
      : pageTracks.find((track) => track.processingStatus === 'ready')
        ?? tracks.find((track) => track.processingStatus === 'ready');
    if (selectedTrack) void playTrack(selectedTrack);
  };

  return (
    <main className="music-page" style={{ '--track-accent': '#fea6d8' } as CSSProperties}>
      <audio ref={audioRef} preload="none" />
      <div className="music-ambient music-ambient-one" />
      <div className="music-ambient music-ambient-two" />

      <aside className="music-sidebar" aria-label={t('music.navigation')}>
        <nav className="music-side-nav">
          {navItems.map(({ id, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            return (
              <button
                key={id}
                type="button"
                className={`music-nav-item${activeView === id ? ' is-active' : ''}`}
                onClick={() => {
                  if (id !== activeView) setLibraryPage(1);
                  if (id === 'playlist' || id === 'favorites') {
                    setCollectionUserId(currentUser?.id || '');
                  }
                  setActiveView(id);
                }}
                aria-current={activeView === id ? 'page' : undefined}
                aria-label={label}
                // title={label}
              >
                <Icon size={24} strokeWidth={1.8} />
              </button>
            );
          })}
        </nav>
        <span className="music-sidebar-divider" aria-hidden="true" />
        <button
          type="button"
          className={`music-add-button${currentUser ? '' : ' is-restricted'}`}
          onClick={() => {
            if (requireMusicAccount()) addMusicInputRef.current?.click();
          }}
          disabled={isUploading}
          aria-busy={isUploading}
          aria-disabled={!currentUser || isUploading}
          aria-label={t('music.addMusic')}
          // title={currentUser ? undefined : t('music.signInRequired')}
        >
          <Plus size={23} strokeWidth={1.8} />
        </button>
        <input
          ref={addMusicInputRef}
          className="music-add-input"
          type="file"
          accept=".mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.ncm,audio/*"
          multiple
          onChange={handleAddMusic}
          tabIndex={-1}
        />
      </aside>

      <div className="music-content">
        {activeView !== 'library' && !isCollectionView && (
          <header className="music-heading">
            <div>
              <span className="music-eyebrow">{t('music.collectionEyebrow')}</span>
            </div>
          </header>
        )}

        {activeView === 'library' ? (
          <div className="music-user-library" aria-labelledby="music-user-library-title">
            <header className="music-user-library-heading">
              <h1 id="music-user-library-title">{t('music.yourLibrary')}</h1>
              <p>{t('music.yourLibraryDescription')}</p>
            </header>

            {!currentUser ? (
              <div className="music-user-library-empty">
                <Library size={26} aria-hidden="true" />
                <h2>{t('music.librarySignInTitle')}</h2>
                <p>{t('music.librarySignInDescription')}</p>
              </div>
            ) : !isUserLibraryLoaded || isUserLibraryLoading ? (
              <div
                className="music-user-library-loading"
                aria-label={t('music.loadingLibraries')}
                aria-busy="true"
              >
                <LoaderCircle size={24} aria-hidden="true" />
              </div>
            ) : userLibraryLoadFailed ? (
              <div className="music-user-library-empty">
                <CircleAlert size={25} aria-hidden="true" />
                <h2>{t('music.libraryLoadFailed')}</h2>
                <p>{t('music.libraryLoadFailedDescription')}</p>
              </div>
            ) : userLibraries.length ? (
              <div className="music-user-library-grid">
                {userLibraries.map((library, index) => {
                  const isOwnLibrary = library.userId === currentUser.id;
                  const isLockedLibrary = !isOwnLibrary && !hasLibraryAccess;
                  return (
                    <button
                      type="button"
                      className={`music-user-playlist-card${isLockedLibrary ? ' is-locked' : ''}`}
                      key={`${library.userId}:${library.collection}`}
                      style={{ '--library-card-delay': `${index * 55}ms` } as CSSProperties}
                      onClick={() => openLibraryCollection(library)}
                      aria-label={isLockedLibrary
                        ? t('music.proLockedPlaylistLabel', {
                          playlist: library.playlistName,
                        })
                        : t('music.userPlaylistLabel', {
                          playlist: library.playlistName,
                          username: library.username,
                          count: library.trackCount,
                        })}
                    >
                      <div className="music-user-playlist-avatar" aria-hidden="true">
                        {library.avatar ? (
                          <img src={library.avatar} alt="" />
                        ) : (
                          <span>{library.username.trim().charAt(0).toUpperCase() || '?'}</span>
                        )}
                      </div>
                      <div className="music-user-playlist-copy">
                        <strong>{library.playlistName}</strong>
                        <span>{library.username}</span>
                        <small>
                          <Music2 size={14} strokeWidth={1.9} aria-hidden="true" />
                          {t('music.trackCount', { count: library.trackCount })}
                        </small>
                      </div>
                      {!isOwnLibrary && (
                        <span className="music-user-playlist-pro-badge" aria-hidden="true">PRO</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="music-user-library-empty">
                <Library size={26} aria-hidden="true" />
                <h2>{t('music.noPlaylists')}</h2>
                <p>{t('music.noPlaylistsDescription')}</p>
              </div>
            )}
          </div>
        ) : isCollectionView ? (
          <div className="music-library" aria-labelledby="music-library-title">
            <article
              className={`music-library-hero${isPlaying ? ' is-playing' : ''}`}
              style={{ '--library-art': `url(${playlistDiscArt})` } as CSSProperties}
            >
              <button
                type="button"
                className="music-library-disc-button"
                disabled={!hasPlayableTracks}
                onClick={toggleLibraryPlayback}
                aria-label={t(isPlaying ? 'music.pausePlaylist' : 'music.playPlaylist')}
              >
                <span className="music-library-waves" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="music-library-turntable" aria-hidden="true">
                  <span className="music-library-platter">
                    <span className="music-library-disc">
                      <img src={playlistDiscArt} alt="" />
                      <span className="music-library-disc-grooves" />
                      <span className="music-library-disc-center">
                        <i />
                      </span>
                    </span>
                  </span>
                  <span className="music-library-tonearm">
                    <span className="music-library-tonearm-base" />
                    <span className="music-library-tonearm-rail">
                      <i />
                    </span>
                  </span>
                  <span className="music-library-status-light" />
                </span>
              </button>
              <div className="music-library-hero-copy">
                <h1 id="music-library-title">{collectionTitle}</h1>
                <p>
                  {t('music.likedSongsSummary', {
                    owner: libraryOwner,
                    count: musicTotal,
                    duration: libraryDuration,
                  })}
                </p>
              </div>
            </article>

            <div className="music-library-toolbar">
              <button
                type="button"
                className="music-library-play"
                disabled={!hasPlayableTracks}
                onClick={toggleLibraryPlayback}
                aria-label={t(isPlaying ? 'music.pausePlaylist' : 'music.playPlaylist')}
              >
                {isPlaying
                  ? <Pause size={23} fill="currentColor" />
                  : <Play size={23} fill="currentColor" />}
              </button>
              <div
                className={`music-library-layout-switch is-${libraryLayout}`}
                aria-label={t('music.libraryLayout')}
              >
                <button
                  type="button"
                  className={libraryLayout === 'list' ? 'is-active' : ''}
                  onClick={() => {
                    setLibraryPage(1);
                    setLibraryLayout('list');
                  }}
                  aria-pressed={libraryLayout === 'list'}
                  aria-label={t('music.listView')}
                  // title={t('music.listView')}
                >
                  <ListMusic size={20} />
                </button>
                <button
                  type="button"
                  className={libraryLayout === 'cards' ? 'is-active' : ''}
                  onClick={() => {
                    setLibraryPage(1);
                    setLibraryLayout('cards');
                  }}
                  aria-pressed={libraryLayout === 'cards'}
                  aria-label={t('music.cardView')}
                  // title={t('music.cardView')}
                >
                  <LayoutGrid size={19} />
                </button>
              </div>
            </div>

            {!isMusicLoaded ? (
              <div className="music-list-loading" aria-label={t('music.loadingMusicList')} aria-busy="true">
                <LoaderCircle size={22} aria-hidden="true" />
              </div>
            ) : musicTotal > 0 ? (
              <>
                {libraryLayout === 'list' ? (
                  <div
                    className={`music-library-table${isMusicPageLoading ? ' is-loading' : ''}`}
                    role="table"
                    aria-label={collectionTitle}
                    aria-busy={isMusicPageLoading}
                  >
                    <div className="music-library-table-head" role="row">
                      <span role="columnheader">#</span>
                      <span role="columnheader">{t('music.title')}</span>
                      <span role="columnheader">{t('music.album')}</span>
                      <span role="columnheader">{t('music.dateAdded')}</span>
                      <span aria-hidden="true" />
                      <span role="columnheader" aria-label={t('music.duration')}>
                        <Clock3 size={17} />
                      </span>
                      <span aria-hidden="true" />
                    </div>
                    <div className="music-library-table-body" role="rowgroup">
                      {libraryTracks.map((track, index) => {
                        const trackNumber = (libraryPage - 1) * libraryPageSize + index + 1;
                        const isCurrent = track.id === currentTrack.id;
                        const isReady = track.processingStatus === 'ready';
                        return (
                          <div
                            className={`music-library-row${isCurrent ? ' is-current' : ''}${removingTrackId === track.id ? ' is-removing' : ''}`}
                            role="row"
                            key={track.id}
                          >
                            <button
                              type="button"
                              className="music-library-track-number"
                              disabled={!isReady}
                              onClick={() => {
                                if (isCurrent && isPlaying) setIsPlaying(false);
                                else void playTrack(track);
                              }}
                              aria-label={t(
                                isCurrent && isPlaying ? 'music.pauseTrack' : 'music.playTrack',
                                { title: track.title },
                              )}
                            >
                              {isCurrent && isPlaying ? (
                                <>
                                  <span className="music-library-equalizer" aria-hidden="true">
                                    <i /><i /><i /><i />
                                  </span>
                                  <Pause className="music-library-row-pause" size={15} fill="currentColor" aria-hidden="true" />
                                </>
                              ) : (
                                <>
                                  <span className="music-library-index">{trackNumber}</span>
                                  <Play className="music-library-row-play" size={15} fill="currentColor" />
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="music-library-track"
                              disabled={!isReady}
                              onClick={() => void playTrack(track)}
                            >
                              <img src={track.cover || bg0} alt="" />
                              <span>
                                <strong>{track.title}</strong>
                                <small>{track.artist}</small>
                              </span>
                            </button>
                            <span className="music-library-album" role="cell">{track.album || t('music.unknownAlbum')}</span>
                            <span className="music-library-date" role="cell">
                              {formatDateAdded(track.createdAt, i18n.resolvedLanguage || i18n.language)}
                            </span>
                            <button
                              type="button"
                              className={`music-library-favorite${track.isFavorite ? ' is-favorite' : ''}`}
                              aria-disabled={!currentUser}
                              // title={currentUser ? undefined : t('music.signInRequired')}
                              onClick={() => void toggleFavorite(track.id)}
                              aria-label={t(track.isFavorite ? 'music.removeFromFavorites' : 'music.addToFavorites')}
                            >
                              <span className="music-library-add-icon" aria-hidden="true">
                                <Plus className="music-library-add-plus" size={15} strokeWidth={2.2} />
                                <Check className="music-library-add-check" size={14} strokeWidth={2.8} />
                              </span>
                              {favoriteBurstId === track.id && (
                                <span className="music-library-add-particles" aria-hidden="true">
                                  {MUSIC_ADD_PARTICLES.map((particle) => (
                                    <i key={particle.key} style={particle.style} />
                                  ))}
                                </span>
                              )}
                            </button>
                            <span className="music-library-duration" role="cell">{formatTime(track.duration)}</span>
                            {(activeView === 'favorites' || isViewingOwnCollection) && (
                              <div
                                className={`music-card-actions music-library-row-actions${openTrackMenuId === track.id ? ' is-open' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="music-library-more"
                                  aria-label={t('music.moreOptions', { title: track.title })}
                                  aria-haspopup="menu"
                                  aria-expanded={openTrackMenuId === track.id}
                                  onClick={() => setOpenTrackMenuId((current) => current === track.id ? '' : track.id)}
                                >
                                  <MoreHorizontal size={20} />
                                </button>
                                <div className="music-card-menu" role="menu">
                                  {activeView === 'favorites' ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="music-card-delete"
                                      onClick={() => void toggleFavorite(track.id)}
                                    >
                                      <Heart
                                        size={16}
                                        fill={track.isFavorite ? 'currentColor' : 'none'}
                                        aria-hidden="true"
                                      />
                                      <span>
                                        {t(track.isFavorite
                                          ? 'music.removeFromFavorites'
                                          : 'music.addToFavorites')}
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className={`music-card-delete${currentUser ? '' : ' is-restricted'}`}
                                      disabled={Boolean(deletingTrackId)}
                                      aria-disabled={!currentUser || Boolean(deletingTrackId)}
                                      // title={currentUser ? undefined : t('music.signInRequired')}
                                      onClick={() => void handleDeleteTrack(track.id)}
                                    >
                                      {deletingTrackId === track.id
                                        ? <LoaderCircle size={16} aria-hidden="true" />
                                        : <Trash2 size={16} aria-hidden="true" />}
                                      <span>{t(deletingTrackId === track.id ? 'music.deleting' : 'music.delete')}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`music-card-grid music-library-card-grid${isMusicPageLoading ? ' is-loading' : ''}`}
                    aria-busy={isMusicPageLoading}
                  >
                    {libraryTracks.map((track, index) => {
                      const isCurrent = track.id === currentTrack.id;
                      const isReady = track.processingStatus === 'ready';
                      return (
                        <article
                          className={`music-track-card${isCurrent ? ' is-current' : ''} is-${track.processingStatus}${removingTrackId === track.id ? ' is-removing' : ''}`}
                          key={track.id}
                          onPointerMove={handleCardPointer}
                          onPointerLeave={resetCardPointer}
                          style={{ backgroundImage: `url(${track.cover || bg0})`, '--card-delay': `${index * 55}ms` } as CSSProperties}
                          onClick={() => void playTrack(track)}
                          tabIndex={isReady ? 0 : -1}
                          role={isReady ? 'button' : 'status'}
                          aria-disabled={!isReady}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              void playTrack(track);
                            }
                          }}
                        >
                          {(activeView === 'favorites' || isViewingOwnCollection) && (
                            <div
                              className={`music-card-actions${openTrackMenuId === track.id ? ' is-open' : ''}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="music-card-menu-trigger"
                                aria-label={t('music.moreOptions', { title: track.title })}
                                aria-haspopup="menu"
                                aria-expanded={openTrackMenuId === track.id}
                                onClick={() => setOpenTrackMenuId((current) => current === track.id ? '' : track.id)}
                              >
                                <MoreHorizontal size={20} />
                              </button>
                              <div className="music-card-menu" role="menu">
                                {activeView === 'favorites' ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="music-card-delete"
                                    onClick={() => void toggleFavorite(track.id)}
                                  >
                                    <Heart
                                      size={16}
                                      fill={track.isFavorite ? 'currentColor' : 'none'}
                                      aria-hidden="true"
                                    />
                                    <span>
                                      {t(track.isFavorite
                                        ? 'music.removeFromFavorites'
                                        : 'music.addToFavorites')}
                                    </span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={`music-card-delete${currentUser ? '' : ' is-restricted'}`}
                                    disabled={Boolean(deletingTrackId)}
                                    aria-disabled={!currentUser || Boolean(deletingTrackId)}
                                    // title={currentUser ? undefined : t('music.signInRequired')}
                                    onClick={() => void handleDeleteTrack(track.id)}
                                  >
                                    {deletingTrackId === track.id
                                      ? <LoaderCircle size={16} aria-hidden="true" />
                                      : <Trash2 size={16} aria-hidden="true" />}
                                    <span>{t(deletingTrackId === track.id ? 'music.deleting' : 'music.delete')}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {!isReady && (
                            <div className={`music-processing-status is-${track.processingStatus}`}>
                              {track.processingStatus === 'processing'
                                ? <LoaderCircle size={18} aria-hidden="true" />
                                : <CircleAlert size={18} aria-hidden="true" />}
                              <span>
                                {track.processingStatus === 'processing'
                                  ? t('music.preparingAudio')
                                  : track.processingError || t('music.processingFailed')}
                              </span>
                            </div>
                          )}
                          <div className="music-track-glass">
                            <div className="music-track-copy">
                              <h3><span>{track.title}</span></h3>
                              <p>{track.artist}</p>
                            </div>
                            <button
                              className="music-card-play"
                              type="button"
                              disabled={!isReady}
                              aria-label={t(
                                isCurrent && isPlaying ? 'music.pauseTrack' : 'music.playTrack',
                                { title: track.title },
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isCurrent && isPlaying) setIsPlaying(false);
                                else void playTrack(track);
                              }}
                            >
                              {!isReady
                                ? <LoaderCircle size={17} />
                                : isCurrent && isPlaying
                                  ? <Pause size={17} fill="currentColor" />
                                  : <Play size={17} fill="currentColor" />}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <nav className="music-library-pagination" aria-label={t('music.pagination')}>
                  <span>{libraryPage} / {libraryPageCount}</span>
                  <LoaderCircle
                    className={`music-library-page-loader${isMusicPageLoading ? ' is-visible' : ''}`}
                    size={18}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    disabled={isMusicPageLoading || libraryPage <= 1}
                    onClick={() => {
                      setLibraryPage((page) => Math.max(1, page - 1));
                    }}
                    aria-label={t('music.previousPage')}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    disabled={isMusicPageLoading || libraryPage >= libraryPageCount}
                    onClick={() => {
                      setLibraryPage((page) => Math.min(libraryPageCount, page + 1));
                    }}
                    aria-label={t('music.nextPage')}
                  >
                    <ChevronRight size={20} />
                  </button>
                </nav>
              </>
            ) : (
              <div className="music-empty-state">
                <Heart size={25} />
                <h3>{t(activeView === 'favorites' ? 'music.emptyFavoritesTitle' : 'music.emptyLibraryTitle')}</h3>
                <p>{t(activeView === 'favorites' ? 'music.emptyFavoritesDescription' : 'music.emptyLibraryDescription')}</p>
              </div>
            )}
          </div>
        ) : (
          <>
        {!isMusicLoaded ? (
          <div className="music-feature-card is-loading" aria-label={t('music.loadingMusic')} aria-busy="true">
            <LoaderCircle size={24} aria-hidden="true" />
          </div>
        ) : pageTracks.length ? (
          <article
            className="music-feature-card"
            style={{
              backgroundImage: `url(${previousFeaturedCover || featuredTrack.cover || bg0})`,
            }}
          >
            {previousFeaturedCover && (
              <div className="music-feature-cover-clip" aria-hidden="true">
                <div
                  key={featuredTransition}
                  className="music-feature-cover-transition"
                  style={{ backgroundImage: `url(${featuredTrack.cover || bg0})` }}
                />
              </div>
            )}
            <div className="music-feature-shine" />
            <div className="music-feature-copy">
              <span className="music-feature-label">{featuredTrack.album.toUpperCase()}</span>
              <h2>{featuredTrack.title}</h2>
              <p>{featuredTrack.artist}</p>
              <button
                className={`music-album-play${isFeaturedPlaying ? ' is-playing' : ''}`}
                type="button"
                disabled={featuredTrack.processingStatus !== 'ready'}
                aria-label={t(
                  isFeaturedPlaying ? 'music.pauseTrack' : 'music.playTrack',
                  { title: featuredTrack.title },
                )}
                onClick={() => {
                  if (isFeaturedPlaying) {
                    setIsPlaying(false);
                  } else if (playbackTrackId === featuredTrack.id) {
                    setIsPlaying(true);
                  } else {
                    void playTrack(featuredTrack);
                  }
                }}
              >
                <span className="music-album-play-icon" aria-hidden="true">
                  <Play className="music-album-play-start" size={16} fill="currentColor" />
                  <Pause className="music-album-play-pause" size={16} fill="currentColor" />
                </span>
                <span>{t(isFeaturedPlaying ? 'music.pauseAlbum' : 'music.playAlbum')}</span>
              </button>
            </div>
            <div className="music-feature-index">
              {`${String(Math.max(1, featuredTrackNumber)).padStart(2, '0')} - ${String(musicTotal).padStart(2, '0')}`}
            </div>
          </article>
        ) : null}

        <div className="music-section-heading">
          <div>
            <h2>{t(sectionTitleKey)}</h2>
            <p>{t('music.songCount', { count: musicTotal })}</p>
          </div>
          <div className="music-section-actions">
            {activeView === 'home' && (
              <button
                type="button"
                className="view-all"
                onClick={() => {
                  setLibraryLayout('cards');
                  setLibraryPage(1);
                  setActiveView('playlist');
                }}
              >
                {t('music.seeMore')} <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>

        {!isMusicLoaded ? (
          <div className="music-list-loading" aria-label={t('music.loadingMusicList')} aria-busy="true">
            <LoaderCircle size={22} aria-hidden="true" />
          </div>
        ) : sectionTracks.length ? (
          <div className={`music-card-grid${isMusicPageLoading ? ' is-loading' : ''}`} aria-busy={isMusicPageLoading}>
            {sectionTracks.map((track, index) => {
              const isCurrent = track.id === currentTrack.id;
              const isReady = track.processingStatus === 'ready';
              return (
                <article
                  className={`music-track-card${isCurrent ? ' is-current' : ''} is-${track.processingStatus}${removingTrackId === track.id ? ' is-removing' : ''}`}
                  key={track.id}
                  onPointerMove={handleCardPointer}
                  onPointerLeave={resetCardPointer}
                  style={{ backgroundImage: `url(${track.cover || bg0})`, '--card-delay': `${index * 70}ms` } as CSSProperties}
                  onClick={() => void playTrack(track)}
                  tabIndex={isReady ? 0 : -1}
                  role={isReady ? 'button' : 'status'}
                  aria-disabled={!isReady}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void playTrack(track);
                    }
                  }}
                >
                  <div
                    className={`music-card-actions${openTrackMenuId === track.id ? ' is-open' : ''}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="music-card-menu-trigger"
                      aria-label={t('music.moreOptions', { title: track.title })}
                      aria-haspopup="menu"
                      aria-expanded={openTrackMenuId === track.id}
                      onClick={() => setOpenTrackMenuId((current) => current === track.id ? '' : track.id)}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    <div className="music-card-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={`music-card-delete${currentUser ? '' : ' is-restricted'}`}
                        disabled={Boolean(deletingTrackId)}
                        aria-disabled={!currentUser || Boolean(deletingTrackId)}
                        // title={currentUser ? undefined : t('music.signInRequired')}
                        onClick={() => void handleDeleteTrack(track.id)}
                      >
                        {deletingTrackId === track.id
                          ? <LoaderCircle size={16} aria-hidden="true" />
                          : <Trash2 size={16} aria-hidden="true" />}
                        <span>{t(deletingTrackId === track.id ? 'music.deleting' : 'music.delete')}</span>
                      </button>
                    </div>
                  </div>
                  {!isReady && (
                    <div className={`music-processing-status is-${track.processingStatus}`}>
                      {track.processingStatus === 'processing'
                        ? <LoaderCircle size={18} aria-hidden="true" />
                        : <CircleAlert size={18} aria-hidden="true" />}
                      <span>
                        {track.processingStatus === 'processing'
                          ? t('music.preparingAudio')
                          : track.processingError || t('music.processingFailed')}
                      </span>
                    </div>
                  )}
                  <div className="music-track-glass">
                    <div className="music-track-copy">
                      <h3>
                        <span>{track.title}</span>
                      </h3>
                      <p>{track.artist}</p>
                    </div>
                    <button
                      className="music-card-play"
                      type="button"
                      disabled={!isReady}
                      aria-label={t(
                        isCurrent && isPlaying ? 'music.pauseTrack' : 'music.playTrack',
                        { title: track.title },
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCurrent && isPlaying) setIsPlaying(false);
                        else void playTrack(track);
                      }}
                    >
                      {!isReady
                        ? <LoaderCircle size={17} />
                        : isCurrent && isPlaying
                          ? <Pause size={17} fill="currentColor" />
                          : <Play size={17} fill="currentColor" />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="music-empty-state">
            <Heart size={25} />
            <h3>{t('music.emptyLibraryTitle')}</h3>
            <p>{t('music.emptyLibraryDescription')}</p>
            <button
              type="button"
              className={currentUser ? undefined : 'is-restricted'}
              aria-disabled={!currentUser}
              // title={currentUser ? undefined : t('music.signInRequired')}
              onClick={() => {
                if (requireMusicAccount()) addMusicInputRef.current?.click();
              }}
            >
              {t('music.addMusic')}
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="music-player" aria-label={t('music.player')}>
        <div className="music-now-playing">
          <div className={`music-cover-disc${isPlaying ? ' is-spinning' : ''}`}>
            <img src={currentTrack.cover || bg0} alt="" />
            <span />
          </div>
          <div className="music-track-meta">
              <strong
                className="music-player-title"
                // title={currentTrack.title}
              >
              <span>{currentTrack.title}</span>
            </strong>
            <span>{currentTrack.artist}</span>
          </div>
        </div>

        <div className="music-transport">
          <button type="button" disabled={!hasPlayableTracks} onClick={playPreviousTrack} aria-label={t('music.previousTrack')}><SkipBack size={19} fill="currentColor" /></button>
          <button
            type="button"
            className="music-main-play"
            disabled={!hasPlayableTracks}
            onClick={toggleCurrentPlayback}
            aria-label={t(isPlaying ? 'music.pause' : 'music.play')}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" disabled={!hasPlayableTracks} onClick={playNextTrack} aria-label={t('music.nextTrack')}><SkipForward size={19} fill="currentColor" /></button>
        </div>

        <div className={`music-timeline${isPlaying ? ' is-playing' : ''}`}>
          <span ref={elapsedLabelRef}>{formatTime(elapsedRef.current)}</span>
          <div className="music-timeline-control">
            <div className="music-timeline-rail" aria-hidden="true">
              <div className="music-timeline-fill" ref={progressFillRef}>
                <span className="music-timeline-thumb" />
              </div>
            </div>
            <input
              ref={progressRef}
              type="range"
              min="0"
              max={currentTrack.duration}
              value={Math.min(elapsedRef.current, currentTrack.duration)}
              onChange={(event) => {
                const nextElapsed = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = nextElapsed;
                setProgressPosition(nextElapsed, currentTrack.duration);
                persistPlaybackProgress(currentTrack.id, nextElapsed);
              }}
              aria-label={t('music.trackProgress')}
            />
          </div>
          <span>{formatTime(currentTrack.duration)}</span>
        </div>

        <button
          type="button"
          className={`music-player-favorite${currentTrack.isFavorite ? ' is-favorite' : ''}${currentUser ? '' : ' is-restricted'}`}
          disabled={!currentTrack.id}
          aria-disabled={!currentUser || !currentTrack.id}
          onClick={() => toggleFavorite(currentTrack.id)}
          aria-label={t(currentTrack.isFavorite ? 'music.removeFromFavorites' : 'music.addToFavorites')}
          title={currentUser ? undefined : t('music.signInRequired')}
        >
          <Heart size={16} fill={currentTrack.isFavorite ? 'currentColor' : 'none'} />
          {/* <span>Favorites</span> */}
        </button>

        <button
          type="button"
          className="music-mode-button"
          onClick={() => setPlayMode((mode) => {
            if (mode === 'sequential') return 'shuffle';
            if (mode === 'shuffle') return 'single';
            return 'sequential';
          })}
          aria-label={t('music.playbackMode', { mode: t(playModeLabelKeys[playMode]) })}
          // title={playModeLabels[playMode]}
        >
          <span className={`music-mode-icon${playMode === 'single' ? ' is-single' : ''}`} aria-hidden="true">
            {playMode === 'shuffle'
              ? <Shuffle size={20} strokeWidth={1.9} />
              : (
                <RefreshCw size={20} strokeWidth={1.9} />
              )}
            {playMode === 'single' && <span className="music-mode-icon-number">1</span>}
          </span>
        </button>

        <div className="music-volume">
          <button type="button" onClick={toggleMute} aria-label={t(volume === 0 ? 'music.unmute' : 'music.mute')}>
            <VolumeIcon size={19} />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={t('music.volume')}
            style={{ '--range-progress': `${volume}%` } as CSSProperties}
          />
        </div>
        </div>
      )}
      <ProUpgradeDialog
        open={isUpgradeOpen}
        email={currentUser?.email}
        onClose={() => setIsUpgradeOpen(false)}
      />
      {pendingDuplicateUpload && (
        <div className="music-duplicate-overlay" role="presentation">
          <button
            type="button"
            className="music-duplicate-backdrop"
            aria-label={t('music.cancelUpload')}
            disabled={isUploading}
            onClick={() => setPendingDuplicateUpload(null)}
          />
          <section
            className="music-duplicate-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="music-duplicate-title"
            aria-describedby="music-duplicate-description"
          >
            <button
              type="button"
              className="music-duplicate-close"
              aria-label={t('music.cancelUpload')}
              disabled={isUploading}
              onClick={() => setPendingDuplicateUpload(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <div className="music-duplicate-heading">
              <span className="music-duplicate-icon" aria-hidden="true">
                <CircleAlert size={22} />
              </span>
              <div>
                <h2 id="music-duplicate-title">
                  {t(
                    pendingDuplicateUpload.kind === 'exact'
                      ? 'music.exactDuplicateTitle'
                      : 'music.possibleDuplicate',
                  )}
                </h2>
                <p id="music-duplicate-description">
                  {t(
                    pendingDuplicateUpload.kind === 'exact'
                      ? 'music.exactDuplicateDescription'
                      : 'music.duplicateDescription',
                  )}
                </p>
              </div>
            </div>
            <div className="music-duplicate-guidance">
              <div className="music-duplicate-policy">
                {pendingDuplicateUpload.kind === 'similar' && (
                  <p>
                    <strong>{t('music.keepBothLabel')}</strong>
                    {t('music.duplicatePolicy')}
                  </p>
                )}
                <p>
                  <strong>{t('music.ignoreDuplicatesLabel')}</strong>
                  {t('music.ignoreDuplicatePolicy')}
                </p>
              </div>
              <div
                className="music-duplicate-summary"
                aria-label={t('music.duplicateUploadSummary', {
                  duplicateCount: duplicateUploadCount,
                  uploadCount: pendingDuplicateUpload.files.length,
                })}
              >
                <strong>
                  <span>{duplicateUploadCount}</span>
                  <i aria-hidden="true">/</i>
                  <span>{pendingDuplicateUpload.files.length}</span>
                </strong>
                <span>{t('music.duplicateRatioLabel')}</span>
              </div>
            </div>
            {pendingDuplicateUpload.matches.length > 0 && (
              <div className="music-duplicate-list">
                {pendingDuplicateUpload.matches.map((match) => (
                  <div className="music-duplicate-match" key={match.id}>
                    <div>
                      <strong>{match.title}</strong>
                      <span>{match.artist} · {match.album}</span>
                    </div>
                    <time>{formatTime(match.duration)}</time>
                  </div>
                ))}
              </div>
            )}
            <div className={`music-duplicate-actions${pendingDuplicateUpload.kind === 'exact' ? ' is-exact' : ''}`}>
              {pendingDuplicateUpload.kind === 'similar' && (
                <button
                  type="button"
                  className="music-duplicate-confirm"
                  disabled={isUploading}
                  onClick={() => void confirmDuplicateUpload()}
                >
                  {duplicateAction === 'confirm' && <LoaderCircle size={16} aria-hidden="true" />}
                  {t(duplicateAction === 'confirm' ? 'music.uploading' : 'music.keepBoth')}
                </button>
              )}
              <button
                type="button"
                className="music-duplicate-cancel"
                disabled={isUploading}
                onClick={() => void uploadWithoutDuplicates()}
              >
                {duplicateAction === 'ignore' && <LoaderCircle size={16} aria-hidden="true" />}
                {t(duplicateAction === 'ignore' ? 'music.checkingDuplicates' : 'music.ignoreDuplicates')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Music;
