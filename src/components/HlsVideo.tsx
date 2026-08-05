import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store/store';
import {
  activateVideo,
  clearActiveVideo,
  pauseVideo,
  updateVideoPlaybackTime,
} from '@/store/videoPlaybackSlice';

const VIDEO_AUDIO_STORAGE_KEY = 'lume-video-audio-v1';
const VIDEO_VIEW_QUALIFICATION_MS = 3_000;
const VIDEO_STARTUP_FALLBACK_MS = 3_000;
const VIDEO_NETWORK_RETRY_LIMIT = 3;
const VIDEO_MEDIA_RETRY_LIMIT = 2;

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    brands?: Array<{ brand: string }>;
  };
}

function isGoogleChromeBrowser() {
  const navigatorWithBrands = navigator as NavigatorWithUserAgentData;
  const brands = navigatorWithBrands.userAgentData?.brands;
  if (brands?.length) {
    return brands.some(({ brand }) => brand === 'Google Chrome');
  }

  return /\bChrome\/\d+/.test(navigator.userAgent)
    && !/\b(?:Edg|OPR|SamsungBrowser|CriOS)\//.test(navigator.userAgent);
}

function configureAutoplayAudio(video: HTMLVideoElement) {
  if (video.dataset.autoplayAudioConfigured === 'true') return;
  // Chrome generally requires muted autoplay. Keep this as a fallback only;
  // Safari should get a chance to autoplay with the user's stored preference.
  if (isGoogleChromeBrowser()) {
    video.defaultMuted = true;
    video.muted = true;
  }
  video.dataset.autoplayAudioConfigured = 'true';
}

type StoredVideoAudio = {
  volume: number;
  muted: boolean;
};

function readStoredVideoAudio(): StoredVideoAudio {
  try {
    const value = JSON.parse(window.localStorage.getItem(VIDEO_AUDIO_STORAGE_KEY) || '');
    const volume = Number(value?.volume);
    if (Number.isFinite(volume) && volume >= 0 && volume <= 1) {
      return { volume, muted: Boolean(value.muted) };
    }
  } catch {
    // Default audio settings are used when storage is unavailable or malformed.
  }
  return { volume: 1, muted: true };
}

function applyStoredVideoAudio(video: HTMLVideoElement) {
  const audio = readStoredVideoAudio();
  video.volume = audio.volume;
  video.muted = audio.muted;
}

interface HlsVideoProps {
  src: string;
  fallbackSrc?: string;
  poster?: string;
  className?: string;
  width?: number;
  height?: number;
  active?: boolean;
  autoPlay?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onViewQualified?: () => void;
  controls?: boolean;
  toggleOnSurfaceClick?: boolean;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  playbackId?: string;
  errorLabel?: string;
  loadingLabel?: string;
}

export default function HlsVideo({
  src,
  fallbackSrc,
  poster,
  className,
  width,
  height,
  active = false,
  autoPlay = false,
  onActivate,
  onDeactivate,
  onViewQualified,
  controls = active,
  toggleOnSurfaceClick = false,
  onVideoElement,
  playbackId,
  errorLabel = 'Unable to play this video.',
  loadingLabel = 'Loading video',
}: HlsVideoProps) {
  const dispatch = useDispatch<AppDispatch>();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoPlayRef = useRef(autoPlay);
  const onViewQualifiedRef = useRef(onViewQualified);
  const resumeAfterInterruptionRef = useRef(false);
  const autoplayFallbackAvailableRef = useRef(true);
  const autoplayFallbackMutedRef = useRef(false);
  const lastPersistedSecondRef = useRef(-1);
  const playbackReadyRef = useRef(false);
  const lastPlaybackTimeRef = useRef(0);
  const persistPlaybackPositionRef = useRef<(force?: boolean) => void>(() => undefined);
  const [playbackError, setPlaybackError] = useState(false);
  const [failedSourceSet, setFailedSourceSet] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);
  const hasDimensions = Boolean(width && height && width > 0 && height > 0);
  const aspectRatio = hasDimensions ? `${width} / ${height}` : '16 / 9';
  // The watch page has only one active player. Attach it immediately instead
  // of waiting for the observer callback, which can delay the first request.
  const shouldAttachMedia = active && (isInViewport || Boolean(onVideoElement));
  const playbackStorageKey = playbackId ? `lume-video-progress:${playbackId}` : null;
  const sourceSet = `${src}\u0000${fallbackSrc ?? ''}`;
  const usingFallback = failedSourceSet === sourceSet && Boolean(fallbackSrc);
  autoPlayRef.current = autoPlay;
  onViewQualifiedRef.current = onViewQualified;

  const requestPlayback = useCallback(async (
    video: HTMLVideoElement,
    allowMutedFallback: boolean,
  ) => {
    try {
      await video.play();
      return true;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name === 'AbortError') return false;

      if (
        error.name === 'NotAllowedError'
        && allowMutedFallback
        && !video.muted
        && autoplayFallbackAvailableRef.current
      ) {
        autoplayFallbackAvailableRef.current = false;
        autoplayFallbackMutedRef.current = true;
        video.muted = true;
        try {
          await video.play();
          return true;
        } catch (retryError) {
          if (retryError instanceof DOMException && retryError.name === 'AbortError') {
            return false;
          }
        }
      }

      // Source-specific media and HLS error events decide whether to retry,
      // switch sources, or show the terminal playback error.
      setIsLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (!visible) {
        const video = videoRef.current;
        resumeAfterInterruptionRef.current = Boolean(video && !video.paused && !video.ended);
        if (active) onDeactivate?.();
      }
      setIsInViewport(visible);
    }, { threshold: 0.01 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, onDeactivate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldAttachMedia || !onViewQualifiedRef.current) return;

    let playedMilliseconds = 0;
    let playingStartedAt: number | null = null;
    let qualificationTimer: number | undefined;
    let qualified = false;

    const clearQualificationTimer = () => {
      if (qualificationTimer !== undefined) {
        window.clearTimeout(qualificationTimer);
        qualificationTimer = undefined;
      }
    };
    const playedDuration = () => (
      playedMilliseconds
      + (playingStartedAt === null ? 0 : performance.now() - playingStartedAt)
    );
    const qualifyView = () => {
      if (qualified) return;
      if (playedDuration() < VIDEO_VIEW_QUALIFICATION_MS) return;

      qualified = true;
      clearQualificationTimer();
      onViewQualifiedRef.current?.();
    };
    const startPlaybackTimer = () => {
      if (qualified || playingStartedAt !== null) return;
      playingStartedAt = performance.now();
      clearQualificationTimer();
      qualificationTimer = window.setTimeout(
        qualifyView,
        Math.max(0, VIDEO_VIEW_QUALIFICATION_MS - playedMilliseconds),
      );
    };
    const stopPlaybackTimer = () => {
      if (playingStartedAt !== null) {
        playedMilliseconds += performance.now() - playingStartedAt;
        playingStartedAt = null;
      }
      clearQualificationTimer();
      qualifyView();
    };

    video.addEventListener('playing', startPlaybackTimer);
    video.addEventListener('timeupdate', qualifyView);
    video.addEventListener('pause', stopPlaybackTimer);
    video.addEventListener('waiting', stopPlaybackTimer);
    video.addEventListener('ended', stopPlaybackTimer);
    if (!video.paused && !video.ended) startPlaybackTimer();

    return () => {
      clearQualificationTimer();
      video.removeEventListener('playing', startPlaybackTimer);
      video.removeEventListener('timeupdate', qualifyView);
      video.removeEventListener('pause', stopPlaybackTimer);
      video.removeEventListener('waiting', stopPlaybackTimer);
      video.removeEventListener('ended', stopPlaybackTimer);
    };
  }, [shouldAttachMedia, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackError(false);
    setIsPlaying(false);
    setIsLoading(shouldAttachMedia);
    if (!shouldAttachMedia) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    configureAutoplayAudio(video);
    applyStoredVideoAudio(video);
    autoplayFallbackAvailableRef.current = true;
    autoplayFallbackMutedRef.current = false;
    playbackReadyRef.current = false;

    const readSavedPlaybackPosition = () => {
      if (!playbackStorageKey) return -1;
      try {
        const saved = Number(window.localStorage.getItem(playbackStorageKey));
        return Number.isFinite(saved) && saved > 0 ? saved : -1;
      } catch {
        return -1;
      }
    };
    const savedPlaybackPosition = readSavedPlaybackPosition();
    const restorePlaybackPosition = () => {
      if (!playbackStorageKey || !Number.isFinite(video.duration) || video.duration <= 0) return;
      if (savedPlaybackPosition > 0 && savedPlaybackPosition < video.duration - 3) {
        video.currentTime = savedPlaybackPosition;
        lastPlaybackTimeRef.current = savedPlaybackPosition;
      }
    };
    const startPlayback = () => {
      if (!autoPlayRef.current && !resumeAfterInterruptionRef.current) return;
      if (!video.currentSrc || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      resumeAfterInterruptionRef.current = false;
      void requestPlayback(video, true);
    };
    const handleLoadedMetadata = () => {
      restorePlaybackPosition();
      playbackReadyRef.current = true;
      startPlayback();
    };

    const source = usingFallback && fallbackSrc ? fallbackSrc : src;
    if (!source) {
      setPlaybackError(true);
      return;
    }
    if (!source.toLowerCase().split(/[?#]/, 1)[0].endsWith('.m3u8')) {
      const handleDirectPlaybackError = () => {
        if (fallbackSrc && !usingFallback) {
          setFailedSourceSet(sourceSet);
          return;
        }
        setIsLoading(false);
        setPlaybackError(true);
      };
      video.src = source;
      video.load();
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', startPlayback);
      video.addEventListener('error', handleDirectPlaybackError);
      startPlayback();
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', startPlayback);
        video.removeEventListener('error', handleDirectPlaybackError);
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
    }

    let disposed = false;
    let hls: Hls | null = null;
    let nativeHlsAttached = false;
    let retryTimer: number | undefined;
    let networkRetryCount = 0;
    let mediaRetryCount = 0;
    let startupFallbackTimer: number | undefined;
    let hasStartedPlayback = false;
    let startupHasProgress = false;
    let stalledRecoveryTimer: number | undefined;
    let lastStalledRecoveryAt = 0;
    let handleHlsLoadedMetadata: (() => void) | null = null;
    let recoverStalledBuffer: (() => void) | null = null;
    let markStarted: (() => void) | null = null;
    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };
    const clearStalledRecoveryTimer = () => {
      if (stalledRecoveryTimer !== undefined) {
        window.clearTimeout(stalledRecoveryTimer);
        stalledRecoveryTimer = undefined;
      }
    };
    const clearStartupFallbackTimer = () => {
      if (startupFallbackTimer !== undefined) {
        window.clearTimeout(startupFallbackTimer);
        startupFallbackTimer = undefined;
      }
    };
    const switchToFallback = () => {
      if (disposed || !fallbackSrc || usingFallback) return false;
      clearRetryTimer();
      clearStartupFallbackTimer();
      setFailedSourceSet(sourceSet);
      hls?.destroy();
      hls = null;
      return true;
    };
    const attachNativeHls = () => {
      if (disposed) return;
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        if (fallbackSrc && !usingFallback) {
          switchToFallback();
        } else {
          setIsLoading(false);
          setPlaybackError(true);
        }
        return;
      }

      nativeHlsAttached = true;
      video.src = source;
      video.load();
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', startPlayback);
    };
    const retryNativePlayback = (immediate = false) => {
      if (disposed || !nativeHlsAttached) return;
      if (!immediate && networkRetryCount >= VIDEO_NETWORK_RETRY_LIMIT) {
        if (!switchToFallback()) {
          setIsLoading(false);
          setPlaybackError(true);
        }
        return;
      }
      const currentTime = video.currentTime;
      clearRetryTimer();
      const delay = immediate ? 0 : Math.min(10_000, 500 * (2 ** networkRetryCount));
      networkRetryCount += 1;
      retryTimer = window.setTimeout(() => {
        if (disposed || !nativeHlsAttached) return;
        video.load();
        video.addEventListener('loadedmetadata', () => {
          networkRetryCount = 0;
          if (Number.isFinite(currentTime) && currentTime > 0) video.currentTime = currentTime;
          startPlayback();
        }, { once: true });
      }, delay);
    };
    const handleNativePlaybackError = () => retryNativePlayback();
    const handleOnline = () => {
      networkRetryCount = 0;
      clearRetryTimer();
      if (nativeHlsAttached) {
        retryNativePlayback(true);
        return;
      }
      hls?.startLoad();
      startPlayback();
    };
    window.addEventListener('online', handleOnline);

    if (!Hls.isSupported()) {
      attachNativeHls();
      video.addEventListener('error', handleNativePlaybackError);
    } else {
      handleHlsLoadedMetadata = () => {
        restorePlaybackPosition();
        playbackReadyRef.current = true;
      };
      video.addEventListener('loadedmetadata', handleHlsLoadedMetadata);
      video.addEventListener('canplay', startPlayback);
      hls = new Hls({
        autoStartLoad: true,
        enableWorker: true,
        startPosition: savedPlaybackPosition,
        // Keep enough VOD data to absorb normal jitter without allowing one
        // player to consume the connection and memory needed by other views.
        lowLatencyMode: false,
        startFragPrefetch: true,
        // Use the highest rendition from the master playlist. The video
        // player must not silently downgrade the source quality.
        startLevel: -1,
        // Start playback as soon as the first playable fragment is buffered.
        // The player can continue filling its VOD buffer in the background.
        maxStarvationDelay: 1,
        maxLoadingDelay: 2,
        capLevelToPlayerSize: false,
        // 缓冲控制
        // maxBufferLength: 12,
        // maxMaxBufferLength: 24,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 48 * 1024 * 1024,
        backBufferLength: 8,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        fragLoadingTimeOut: 15_000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 250,
        fragLoadingMaxRetryTimeout: 8_000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 250,
        manifestLoadingMaxRetryTimeout: 4000,
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
        // Lock playback to the highest rendition advertised by the source.
        // `currentLevel` is intentionally set after the manifest is parsed,
        // because the available level count is unknown before then.
        if (hls && hls.levels.length > 0) {
          hls.currentLevel = hls.levels.length - 1;
        }
        playbackReadyRef.current = true;
        startPlayback();
      });
      hls.on(Hls.Events.FRAG_LOADED, () => {
        startupHasProgress = true;
        networkRetryCount = 0;
        mediaRetryCount = 0;
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        startupHasProgress = true;
        startPlayback();
      });
      markStarted = () => {
        hasStartedPlayback = true;
        clearStartupFallbackTimer();
      };
      video.addEventListener('playing', markStarted, { once: true });
      // Do not leave the user on an endless spinner when the manifest or
      // first fragment is unavailable. The original file is a valid VOD
      // fallback and can usually start independently of HLS.
      if (fallbackSrc) {
        startupFallbackTimer = window.setTimeout(() => {
          if (
            !hasStartedPlayback
            && !startupHasProgress
            && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
          ) {
            switchToFallback();
          }
        }, VIDEO_STARTUP_FALLBACK_MS);
      }
      recoverStalledBuffer = () => {
        if (disposed || !hls || video.ended) return;
        const now = performance.now();
        if (now - lastStalledRecoveryAt < 1_500) return;
        lastStalledRecoveryAt = now;
        clearStalledRecoveryTimer();
        stalledRecoveryTimer = window.setTimeout(() => {
          stalledRecoveryTimer = undefined;
          if (disposed || !hls || video.ended) return;
          hls.startLoad(Math.max(0, video.currentTime));
          if (video.paused && autoPlayRef.current) {
            void requestPlayback(video, true);
          }
        }, 250);
      };
      video.addEventListener('waiting', recoverStalledBuffer);
      video.addEventListener('stalled', recoverStalledBuffer);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!hls) return;
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) setIsLoading(true);
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          clearRetryTimer();
          const delay = Math.min(3_000, 250 * (2 ** networkRetryCount));
          networkRetryCount += 1;
          if (fallbackSrc && networkRetryCount >= 2 && switchToFallback()) return;
          if (networkRetryCount > VIDEO_NETWORK_RETRY_LIMIT) {
            setIsLoading(false);
            setPlaybackError(true);
            hls.destroy();
            hls = null;
            return;
          }
          retryTimer = window.setTimeout(() => {
            if (!disposed && hls) hls.startLoad();
          }, delay);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (fallbackSrc && mediaRetryCount >= 1 && switchToFallback()) return;
          clearRetryTimer();
          mediaRetryCount += 1;
          if (mediaRetryCount > VIDEO_MEDIA_RETRY_LIMIT) {
            setIsLoading(false);
            setPlaybackError(true);
            hls.destroy();
            hls = null;
            return;
          }
          retryTimer = window.setTimeout(() => {
            if (disposed || !hls) return;
            if (mediaRetryCount === 2) hls.swapAudioCodec();
            hls.recoverMediaError();
          }, Math.min(3_000, mediaRetryCount * 500));
        } else {
          if (fallbackSrc && !usingFallback) {
            switchToFallback();
          } else {
            setIsLoading(false);
            setPlaybackError(true);
            hls.destroy();
            hls = null;
          }
        }
      });
    }

    return () => {
      disposed = true;
      persistPlaybackPositionRef.current(true);
      clearRetryTimer();
      clearStartupFallbackTimer();
      clearStalledRecoveryTimer();
      if (nativeHlsAttached) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', startPlayback);
      }
      if (handleHlsLoadedMetadata) {
        video.removeEventListener('loadedmetadata', handleHlsLoadedMetadata);
      }
      video.removeEventListener('canplay', startPlayback);
      video.removeEventListener('error', handleNativePlaybackError);
      if (recoverStalledBuffer) {
        video.removeEventListener('waiting', recoverStalledBuffer);
        video.removeEventListener('stalled', recoverStalledBuffer);
      }
      if (markStarted) video.removeEventListener('playing', markStarted);
      window.removeEventListener('online', handleOnline);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [
    fallbackSrc,
    playbackStorageKey,
    requestPlayback,
    shouldAttachMedia,
    src,
    sourceSet,
    usingFallback,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldAttachMedia) return;

    if (autoPlay) {
      if (!video.currentSrc || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      void requestPlayback(video, true);
    } else {
      video.pause();
    }
  }, [autoPlay, requestPlayback, shouldAttachMedia]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const persistPlaybackPosition = (force = false) => {
      if (
        !playbackReadyRef.current
        || !playbackId
        || !playbackStorageKey
      ) return;
      const currentTime = Number.isFinite(video.currentTime) && video.currentTime > 0
        ? video.currentTime
        : lastPlaybackTimeRef.current;
      if (!Number.isFinite(currentTime) || currentTime <= 0) return;
      const second = Math.floor(currentTime);
      if (!force && second === lastPersistedSecondRef.current) return;
      lastPersistedSecondRef.current = second;
      try {
        window.localStorage.setItem(playbackStorageKey, String(currentTime));
      } catch {
        // Playback persistence is optional when storage is unavailable.
      }
      dispatch(updateVideoPlaybackTime({ videoId: playbackId, currentTime }));
    };
    persistPlaybackPositionRef.current = persistPlaybackPosition;
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setPlaybackError(false);
      if (playbackId) dispatch(activateVideo(playbackId));
    };
    const handleStopped = () => {
      setIsPlaying(false);
      persistPlaybackPosition(true);
      if (playbackId) dispatch(pauseVideo(playbackId));
    };
    const handleTimeUpdate = () => {
      if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
        lastPlaybackTimeRef.current = video.currentTime;
      }
      persistPlaybackPosition();
    };
    const handleSeeked = () => {
      if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
        lastPlaybackTimeRef.current = video.currentTime;
      }
      persistPlaybackPosition(true);
    };
    const handleLoading = (event: Event) => {
      if (video.ended) return;
      const isActuallyBuffering = (
        event.type === 'loadstart'
        || event.type === 'seeking'
        || (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
      );
      if (isActuallyBuffering) setIsLoading(true);
    };
    const handlePlayable = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        setIsLoading(false);
      }
    };
    const handleMediaError = () => {
      setIsLoading(false);
    };
    const persistAudio = () => {
      // A browser-imposed autoplay fallback is not a user preference.
      if (autoplayFallbackMutedRef.current) {
        autoplayFallbackMutedRef.current = false;
        return;
      }
      try {
        window.localStorage.setItem(VIDEO_AUDIO_STORAGE_KEY, JSON.stringify({
          volume: video.volume,
          muted: video.muted,
        }));
      } catch {
        // Audio persistence is optional when storage is unavailable.
      }
    };
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handleStopped);
    video.addEventListener('ended', handleStopped);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadstart', handleLoading);
    video.addEventListener('waiting', handleLoading);
    video.addEventListener('stalled', handleLoading);
    video.addEventListener('seeking', handleLoading);
    video.addEventListener('canplay', handlePlayable);
    video.addEventListener('error', handleMediaError);
    video.addEventListener('volumechange', persistAudio);
    window.addEventListener('pagehide', handleStopped);

    return () => {
      persistPlaybackPosition(true);
      persistPlaybackPositionRef.current = () => undefined;
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handleStopped);
      video.removeEventListener('ended', handleStopped);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadstart', handleLoading);
      video.removeEventListener('waiting', handleLoading);
      video.removeEventListener('stalled', handleLoading);
      video.removeEventListener('seeking', handleLoading);
      video.removeEventListener('canplay', handlePlayable);
      video.removeEventListener('error', handleMediaError);
      video.removeEventListener('volumechange', persistAudio);
      window.removeEventListener('pagehide', handleStopped);
      if (playbackId) dispatch(clearActiveVideo(playbackId));
    };
  }, [dispatch, playbackId, playbackStorageKey]);

  useEffect(() => {
    onVideoElement?.(videoRef.current);
    return () => onVideoElement?.(null);
  }, [onVideoElement]);

  const handlePlay = () => {
    setPlaybackError(false);
    setIsLoading(true);
    if (!active) {
      onActivate?.();
      return;
    }

    const video = videoRef.current;
    if (video) void requestPlayback(video, false);
  };

  const handleSurfaceClick = () => {
    if (!toggleOnSurfaceClick) return;
    if (!active) {
      onActivate?.();
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      setPlaybackError(false);
      setIsLoading(true);
      void requestPlayback(video, false);
    } else {
      video.pause();
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container || !onDeactivate) return;

    const legacyObserverEnabled = false;
    if (!legacyObserverEnabled) return;

    let hasBeenVisible = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        hasBeenVisible = true;
      } else if (hasBeenVisible) {
        onDeactivate();
      }
    }, { threshold: 0.01 });
    observer.observe(container);

    return () => observer.disconnect();
  }, [active, onDeactivate]);

  return (
    <div
      ref={containerRef}
      className="hls-video"
      style={{ aspectRatio }}
      onClick={handleSurfaceClick}
    >
      <video
        ref={videoRef}
        controls={controls}
        playsInline
        muted
        preload={autoPlay ? 'auto' : 'metadata'}
        poster={poster}
        className={className}
      />
      {onActivate && (!active || !isPlaying) && (
        <button
          type="button"
          className="hls-video-play"
          aria-label={active ? 'Resume video' : 'Play video'}
          onClick={(event) => {
            event.stopPropagation();
            handlePlay();
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l10-6.5-10-6.5Z" />
          </svg>
        </button>
      )}
      {isLoading && !playbackError && (
        <div className="hls-video-loading" role="status" aria-label={loadingLabel}>
          <span className="hls-video-loading-spinner" aria-hidden="true" />
        </div>
      )}
      {playbackError && (
        <div className="hls-video-error" role="alert">
          {errorLabel}
        </div>
      )}
    </div>
  );
}
