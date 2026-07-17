import {
  ChevronRight,
  CircleAlert,
  Heart,
  Home,
  ListMusic,
  LoaderCircle,
  MoreHorizontal,
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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import bg0 from '@/assets/images/bg-0.webp';
import {
  deleteMusicTrack,
  getMusic,
  getMusicTrack,
  musicWebSocketUrl,
  normalizeMusicEvent,
  updateMusicFavorite,
  uploadMusic,
  type MusicTrack,
} from '@/api/music';
import type { RootState } from '@/store/store';
import '@/styles/music.scss';

type View = 'home' | 'playlist' | 'favorites';
type PlayMode = 'sequential' | 'shuffle' | 'single';

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

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'playlist', label: 'Playlist', icon: ListMusic },
  { id: 'favorites', label: 'Favorites', icon: Heart },
];

const playModeLabels: Record<PlayMode, string> = {
  sequential: 'List repeat',
  shuffle: 'Shuffle',
  single: 'Repeat one',
};

const formatTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

function Music() {
  const { t } = useTranslation();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [activeView, setActiveView] = useState<View>('home');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackTrackId, setPlaybackTrackId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicLoaded, setIsMusicLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [openTrackMenuId, setOpenTrackMenuId] = useState('');
  const [deletingTrackId, setDeletingTrackId] = useState('');
  const [removingTrackId, setRemovingTrackId] = useState('');
  const [featuredTrackId, setFeaturedTrackId] = useState('');
  const [previousFeaturedCover, setPreviousFeaturedCover] = useState('');
  const [featuredTransition, setFeaturedTransition] = useState(0);
  const [volume, setVolume] = useState(68);
  const [lastVolume, setLastVolume] = useState(68);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const currentTrack = tracks[currentIndex] ?? EMPTY_TRACK;
  const featuredCandidates = useMemo(
    () => tracks.filter((track) => track.processingStatus === 'ready'),
    [tracks],
  );
  const featuredCandidateIds = featuredCandidates.map((track) => track.id).join('|');
  const featuredTrack = featuredCandidates.find((track) => track.id === featuredTrackId)
    ?? featuredCandidates[0]
    ?? tracks[0]
    ?? EMPTY_TRACK;
  const featuredTrackNumber = tracks.findIndex((track) => track.id === featuredTrack.id) + 1;
  const isFeaturedPlaying = playbackTrackId === featuredTrack.id && isPlaying;
  const hasPlayableTracks = tracks.some((track) => track.processingStatus === 'ready');
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef(0);
  const renderedSecondRef = useRef(0);
  const addMusicInputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<MusicTrack[]>([]);
  const featuredTrackIdRef = useRef('');
  const detailRequestsRef = useRef(new Map<string, Promise<MusicTrack>>());
  const playRequestRef = useRef(0);
  tracksRef.current = tracks;

  const requireMusicAccount = useCallback(() => {
    if (currentUser) return true;
    window.dispatchEvent(new CustomEvent('app:notification', {
      detail: { message: t('music.signInRequired'), type: 'warning' },
    }));
    return false;
  }, [currentUser, t]);

  const syncProgressVisual = useCallback((value: number, duration: number) => {
    const progress = duration > 0 ? Math.min((value / duration) * 100, 100) : 0;
    if (progressFillRef.current) progressFillRef.current.style.width = `${progress}%`;
  }, []);

  const resetProgress = useCallback(() => {
    elapsedRef.current = 0;
    renderedSecondRef.current = 0;
    if (progressRef.current) progressRef.current.value = '0';
    if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(0);
    syncProgressVisual(0, 1);
  }, [syncProgressVisual]);

  const visibleTracks = useMemo(() => {
    if (activeView === 'favorites') {
      return tracks.filter((track) => track.isFavorite);
    }
    return tracks;
  }, [activeView, tracks]);

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
      setTracks((items) => items.map((item) => (
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
    setCurrentIndex(index);
    setPlaybackTrackId(track.id);
    resetProgress();
    setIsPlaying(true);
  }, [loadTrackDetails, resetProgress]);

  const goToTrack = useCallback((direction: 1 | -1) => {
    const currentTracks = tracksRef.current;
    const playableIndexes = currentTracks.reduce<number[]>((indexes, track, index) => {
      if (track.processingStatus === 'ready') indexes.push(index);
      return indexes;
    }, []);
    if (!playableIndexes.length) return;
    let nextIndex: number;
    if (playMode === 'shuffle') {
      const candidates = playableIndexes.filter((index) => index !== currentIndex);
      nextIndex = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : playableIndexes[0];
    } else {
      const playablePosition = playableIndexes.indexOf(currentIndex);
      const nextPosition = playablePosition < 0
        ? direction === 1 ? 0 : playableIndexes.length - 1
        : (playablePosition + direction + playableIndexes.length) % playableIndexes.length;
      nextIndex = playableIndexes[nextPosition];
    }
    void playTrack(currentTracks[nextIndex]);
  }, [currentIndex, playMode, playTrack]);

  const refreshMusic = useCallback(async () => {
    const activeTrackId = audioRef.current?.dataset.trackId || tracksRef.current[currentIndex]?.id;
    const music = await getMusic();
    setTracks((current) => music.map((track) => {
      const loaded = current.find((item) => item.id === track.id && item.detailsLoaded);
      return loaded
        ? {
            ...loaded,
            ...track,
            duration: loaded.duration,
            bitrate: loaded.bitrate,
            sampleRate: loaded.sampleRate,
            audioUrl: loaded.audioUrl,
            originalUrl: loaded.originalUrl,
            format: loaded.format,
            originalFormat: loaded.originalFormat,
            size: loaded.size,
            originalSize: loaded.originalSize,
            detailsLoaded: true,
          }
        : track;
    }));
    if (activeTrackId) {
      const nextIndex = music.findIndex((track) => track.id === activeTrackId);
      if (nextIndex >= 0) setCurrentIndex(nextIndex);
    }
  }, [currentIndex]);

  useEffect(() => {
    document.body.classList.add('music-route');
    document.documentElement.classList.add('music-route');
    return () => {
      document.body.classList.remove('music-route');
      document.documentElement.classList.remove('music-route');
    };
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
    let cancelled = false;
    getMusic()
      .then((music) => {
        if (!cancelled) {
          tracksRef.current = music;
          setTracks(music);
        }
      })
      .catch((error) => {
        console.error('Failed to load music', error);
      })
      .finally(() => {
        if (!cancelled) setIsMusicLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let socket: WebSocket | null = null;
    let connectTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let reconnectDelay = 1000;

    const mergeTrack = (updated: MusicTrack) => {
      setTracks((current) => {
        const exists = current.some((track) => track.id === updated.id);
        return exists
          ? current.map((track) => track.id === updated.id ? { ...track, ...updated } : track)
          : [updated, ...current];
      });
    };

    const reconcileProcessingTracks = () => {
      tracksRef.current
        .filter((track) => track.processingStatus === 'processing')
        .forEach((track) => {
          void getMusicTrack(track.id).then(mergeTrack).catch(() => {});
        });
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
    const candidates = tracksRef.current.filter((track) => track.processingStatus === 'ready');
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
      const readyTracks = tracksRef.current.filter((track) => track.processingStatus === 'ready');
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
      resetProgress();
      return;
    }
    if (audio.dataset.trackId !== currentTrack.id) {
      audio.dataset.trackId = currentTrack.id;
      audio.src = currentTrack.audioUrl;
      resetProgress();
    }
  }, [currentTrack.audioUrl, currentTrack.id, playbackTrackId, resetProgress]);

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
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTrack.duration, currentTrack.id, isPlaying, playbackTrackId, syncProgressVisual]);

  useEffect(() => {
    syncProgressVisual(elapsedRef.current, currentTrack.duration);
  }, [currentTrack.duration, currentTrack.id, syncProgressVisual]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => {
      if (playMode === 'single') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      setIsPlaying(false);
      audio.currentTime = 0;
      resetProgress();
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [playMode, resetProgress]);

  useEffect(() => {
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
  }, [currentTrack, goToTrack, hasPlayableTracks, isPlaying, playTrack]);

  const toggleFavorite = async (trackId: string) => {
    if (!requireMusicAccount()) return;
    const track = tracks.find((item) => item.id === trackId);
    if (!track) return;
    const nextFavorite = !track.isFavorite;
    setTracks((current) => current.map((item) => (
      item.id === trackId ? { ...item, isFavorite: nextFavorite } : item
    )));
    try {
      const persisted = await updateMusicFavorite(trackId, nextFavorite);
      setTracks((current) => current.map((item) => (
        item.id === trackId ? { ...item, isFavorite: persisted } : item
      )));
    } catch (error) {
      console.error('Failed to update favorite', error);
      setTracks((current) => current.map((item) => (
        item.id === trackId ? { ...item, isFavorite: track.isFavorite } : item
      )));
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

    detailRequestsRef.current.delete(trackId);
    tracksRef.current = remainingTracks;
    setTracks(remainingTracks);

    if (!remainingTracks.length) {
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

  const handleAddMusic = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!requireMusicAccount()) {
      event.target.value = '';
      return;
    }
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setIsUploading(true);
    try {
      const created = await uploadMusic(files);
      const activeTrackId = audioRef.current?.dataset.trackId || currentTrack.id;
      const createdIds = new Set(created.map((track) => track.id));
      const refreshed = [
        ...created,
        ...tracksRef.current.filter((track) => !createdIds.has(track.id)),
      ];
      const refreshedCurrentIndex = refreshed.findIndex((track) => track.id === activeTrackId);
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
      setActiveView('playlist');
    } catch (error) {
      console.error('Failed to upload music', error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const toggleCurrentPlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentTrack.processingStatus === 'ready') {
      void playTrack(currentTrack);
    }
  };

  return (
    <main className="music-page" style={{ '--track-accent': '#fea6d8' } as CSSProperties}>
      <audio ref={audioRef} preload="none" />
      <div className="music-ambient music-ambient-one" />
      <div className="music-ambient music-ambient-two" />

      <aside className="music-sidebar" aria-label="Music navigation">
        <nav className="music-side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`music-nav-item${activeView === id ? ' is-active' : ''}`}
              onClick={() => setActiveView(id)}
              aria-current={activeView === id ? 'page' : undefined}
              aria-label={label}
              // title={label}
            >
              <Icon size={24} strokeWidth={1.8} />
            </button>
          ))}
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
          aria-label="Add music"
          title={currentUser ? undefined : t('music.signInRequired')}
        >
          <Plus size={23} strokeWidth={1.8} />
        </button>
        <input
          ref={addMusicInputRef}
          className="music-add-input"
          type="file"
          accept=".mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,audio/*"
          multiple
          onChange={handleAddMusic}
          tabIndex={-1}
        />
      </aside>

      <div className="music-content">
        <header className="music-heading">
          <div>
            <span className="music-eyebrow">YOUR PRIVATE COLLECTION</span>
          </div>
        </header>

        {!isMusicLoaded ? (
          <div className="music-feature-card is-loading" aria-label="Loading music" aria-busy="true">
            <LoaderCircle size={24} aria-hidden="true" />
          </div>
        ) : tracks.length ? (
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
                aria-label={isFeaturedPlaying ? `Pause ${featuredTrack.title}` : `Play ${featuredTrack.title}`}
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
                <span>{isFeaturedPlaying ? 'Pause album' : 'Play album'}</span>
              </button>
            </div>
            <div className="music-feature-index">
              {`${String(Math.max(1, featuredTrackNumber)).padStart(2, '0')} - ${String(tracks.length).padStart(2, '0')}`}
            </div>
          </article>
        ) : null}

        <div className="music-section-heading">
          <div>
            <h2>{activeView === 'favorites' ? 'Your favorites' : activeView === 'playlist' ? 'All Albums' : 'Trending Albums'}</h2>
            <p>{visibleTracks.length} songs</p>
          </div>
          <div className="music-section-actions">
            <button
              type="button"
              className="music-refresh-button"
              onClick={() => void refreshMusic().catch((error) => console.error('Failed to refresh music', error))}
              aria-label="Refresh music"
              title="Refresh music"
            >
              <RefreshCw size={16} />
            </button>
            <button type="button" className="view-all" onClick={() => setActiveView('playlist')}>
              See more <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {!isMusicLoaded ? (
          <div className="music-list-loading" aria-label="Loading music list" aria-busy="true">
            <LoaderCircle size={22} aria-hidden="true" />
          </div>
        ) : visibleTracks.length ? (
          <div className="music-card-grid">
            {visibleTracks.map((track, index) => {
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
                      aria-label={`More options for ${track.title}`}
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
                        title={currentUser ? undefined : t('music.signInRequired')}
                        onClick={() => void handleDeleteTrack(track.id)}
                      >
                        {deletingTrackId === track.id
                          ? <LoaderCircle size={16} aria-hidden="true" />
                          : <Trash2 size={16} aria-hidden="true" />}
                        <span>{deletingTrackId === track.id ? 'Deleting' : 'Delete'}</span>
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
                          ? 'Preparing audio'
                          : track.processingError || 'Processing failed'}
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
                      aria-label={`${isCurrent && isPlaying ? 'Pause' : 'Play'} ${track.title}`}
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
            <h3>{tracks.length ? 'Your favorites are waiting.' : 'Your music library is empty.'}</h3>
            <p>{tracks.length ? 'Tap the heart on a track to keep it close.' : 'Add music to start your private collection.'}</p>
            <button
              type="button"
              className={currentUser ? undefined : 'is-restricted'}
              aria-disabled={!currentUser}
              title={currentUser ? undefined : t('music.signInRequired')}
              onClick={() => {
                if (requireMusicAccount()) addMusicInputRef.current?.click();
              }}
            >
              Add music
            </button>
          </div>
        )}
      </div>

      {isMusicLoaded && tracks.length > 0 && (
        <div className="music-player" aria-label="Music player">
        <div className="music-now-playing">
          <div className={`music-cover-disc${isPlaying ? ' is-spinning' : ''}`}>
            <img src={currentTrack.cover || bg0} alt="" />
            <span />
          </div>
          <div className="music-track-meta">
            <strong className="music-player-title" title={currentTrack.title}>
              <span>{currentTrack.title}</span>
            </strong>
            <span>{currentTrack.artist}</span>
          </div>
        </div>

        <div className="music-transport">
          <button type="button" disabled={!hasPlayableTracks} onClick={() => goToTrack(-1)} aria-label="Previous track"><SkipBack size={19} fill="currentColor" /></button>
          <button
            type="button"
            className="music-main-play"
            disabled={!hasPlayableTracks}
            onClick={toggleCurrentPlayback}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" disabled={!hasPlayableTracks} onClick={() => goToTrack(1)} aria-label="Next track"><SkipForward size={19} fill="currentColor" /></button>
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
                elapsedRef.current = nextElapsed;
                renderedSecondRef.current = Math.floor(nextElapsed);
                if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(nextElapsed);
                syncProgressVisual(nextElapsed, currentTrack.duration);
              }}
              aria-label="Track progress"
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
          aria-label={currentTrack.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
          aria-label={`Playback mode: ${playModeLabels[playMode]}`}
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
          <button type="button" onClick={toggleMute} aria-label={volume === 0 ? 'Unmute' : 'Mute'}>
            <VolumeIcon size={19} />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            style={{ '--range-progress': `${volume}%` } as CSSProperties}
          />
        </div>
        </div>
      )}
    </main>
  );
}

export default Music;
