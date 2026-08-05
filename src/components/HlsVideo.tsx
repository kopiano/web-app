import { useEffect, useRef, useState } from 'react';
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
  const [usingFallback, setUsingFallback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);
  const hasDimensions = Boolean(width && height && width > 0 && height > 0);
  const aspectRatio = hasDimensions ? `${width} / ${height}` : '16 / 9';
  // The watch page has only one active player. Attach it immediately instead
  // of waiting for the observer callback, which can delay the first request.
  const shouldAttachMedia = active && (isInViewport || Boolean(onVideoElement));
  const playbackStorageKey = playbackId ? `lume-video-progress:${playbackId}` : null;
  autoPlayRef.current = autoPlay;
  onViewQualifiedRef.current = onViewQualified;

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
    if (!shouldAttachMedia) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    configureAutoplayAudio(video);
    applyStoredVideoAudio(video);
    playbackReadyRef.current = false;

    const restorePlaybackPosition = () => {
      if (!playbackStorageKey || !Number.isFinite(video.duration) || video.duration <= 0) return;
      try {
        const saved = Number(window.localStorage.getItem(playbackStorageKey));
        if (Number.isFinite(saved) && saved > 0 && saved < video.duration - 3) {
          video.currentTime = saved;
          lastPlaybackTimeRef.current = saved;
        }
      } catch {
        // Playback persistence is optional when storage is unavailable.
      }
    };
    const startPlayback = () => {
      if (!autoPlayRef.current && !resumeAfterInterruptionRef.current) return;
      resumeAfterInterruptionRef.current = false;
      void video.play().catch((error: DOMException) => {
        if (error.name === 'AbortError') return;
        // Fall back to muted autoplay only when the browser blocks audio.
        if (!video.muted && autoplayFallbackAvailableRef.current) {
          autoplayFallbackAvailableRef.current = false;
          autoplayFallbackMutedRef.current = true;
          video.muted = true;
          void video.play().catch((retryError: DOMException) => {
            if (retryError.name !== 'AbortError') setPlaybackError(true);
          });
          return;
        }
        setPlaybackError(true);
      });
    };
    const handleLoadedMetadata = () => {
      restorePlaybackPosition();
      playbackReadyRef.current = true;
      startPlayback();
    };

    const source = usingFallback && fallbackSrc ? fallbackSrc : src;
    if (!source.toLowerCase().split(/[?#]/, 1)[0].endsWith('.m3u8')) {
      video.src = source;
      video.load();
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', startPlayback);
      startPlayback();
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', startPlayback);
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
      setUsingFallback(true);
      hls?.destroy();
      hls = null;
      return true;
    };
    const attachNativeHls = () => {
      if (disposed) return;
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        setPlaybackError(true);
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
        // Keep enough VOD data to absorb normal jitter without allowing one
        // player to consume the connection and memory needed by other views.
        lowLatencyMode: false,
        startFragPrefetch: true,
        startLevel: 0,
        // Start playback as soon as the first playable fragment is buffered.
        // The player can continue filling its VOD buffer in the background.
        maxStarvationDelay: 1,
        maxLoadingDelay: 2,
        capLevelToPlayerSize: true,
        abrBandWidthFactor: 0.7,
        abrBandWidthUpFactor: 0.6,
        maxBufferLength: 12,
        maxMaxBufferLength: 24,
        maxBufferSize: 48 * 1024 * 1024,
        backBufferLength: 8,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 250,
        fragLoadingMaxRetryTimeout: 4000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 250,
        manifestLoadingMaxRetryTimeout: 4000,
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
        restorePlaybackPosition();
        playbackReadyRef.current = true;
      });
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        startPlayback();
      });
      markStarted = () => {
        hasStartedPlayback = true;
        clearStartupFallbackTimer();
      };
      video.addEventListener('playing', markStarted, { once: true });
      startPlayback();
      // Do not leave the user on an endless spinner when the manifest or
      // first fragment is unavailable. The original file is a valid VOD
      // fallback and can usually start independently of HLS.
      if (fallbackSrc) {
        startupFallbackTimer = window.setTimeout(() => {
          if (!hasStartedPlayback) {
            switchToFallback();
          }
        }, 2_500);
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
            void video.play().catch(() => undefined);
          }
        }, 250);
      };
      video.addEventListener('waiting', recoverStalledBuffer);
      video.addEventListener('stalled', recoverStalledBuffer);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          clearRetryTimer();
          const delay = Math.min(3_000, 250 * (2 ** networkRetryCount));
          networkRetryCount += 1;
          if (fallbackSrc && networkRetryCount >= 2 && switchToFallback()) return;
          retryTimer = window.setTimeout(() => {
            if (!disposed && hls) hls.startLoad();
          }, delay);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (fallbackSrc && mediaRetryCount >= 1 && switchToFallback()) return;
          clearRetryTimer();
          mediaRetryCount += 1;
          retryTimer = window.setTimeout(() => {
            if (disposed || !hls) return;
            if (mediaRetryCount === 2) hls.swapAudioCodec();
            hls.recoverMediaError();
          }, Math.min(3_000, mediaRetryCount * 500));
        } else {
          setPlaybackError(true);
          hls.destroy();
          hls = null;
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
  }, [fallbackSrc, playbackStorageKey, shouldAttachMedia, src, usingFallback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldAttachMedia) return;

    if (autoPlay) {
      void video.play().catch((error: DOMException) => {
        if (error.name === 'AbortError') return;
        if (!video.muted && autoplayFallbackAvailableRef.current) {
          autoplayFallbackAvailableRef.current = false;
          autoplayFallbackMutedRef.current = true;
          video.muted = true;
          void video.play().catch((retryError: DOMException) => {
            if (retryError.name !== 'AbortError') setPlaybackError(true);
          });
          return;
        }
        setPlaybackError(true);
      });
    } else {
      video.pause();
    }
  }, [autoPlay, shouldAttachMedia]);

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
    if (!active) {
      onActivate?.();
      return;
    }

    void videoRef.current?.play().catch(() => {
      setPlaybackError(true);
    });
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
      void video.play().catch(() => setPlaybackError(true));
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
      {playbackError && (
        <div className="hls-video-error" role="alert">
          {errorLabel}
        </div>
      )}
    </div>
  );
}
