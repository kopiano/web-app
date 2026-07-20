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
  void isGoogleChromeBrowser();
  if (video.dataset.autoplayAudioConfigured === 'true') return;
  video.defaultMuted = true;
  video.muted = true;
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
  const lastPersistedSecondRef = useRef(-1);
  const playbackReadyRef = useRef(false);
  const lastPlaybackTimeRef = useRef(0);
  const persistPlaybackPositionRef = useRef<(force?: boolean) => void>(() => undefined);
  const [playbackError, setPlaybackError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(!document.hidden);
  const [isInViewport, setIsInViewport] = useState(false);
  const hasDimensions = Boolean(width && height && width > 0 && height > 0);
  const aspectRatio = hasDimensions ? `${width} / ${height}` : '16 / 9';
  const shouldAttachMedia = active && isDocumentVisible && isInViewport;
  const playbackStorageKey = playbackId ? `lume-video-progress:${playbackId}` : null;
  autoPlayRef.current = autoPlay;
  onViewQualifiedRef.current = onViewQualified;

  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (document.hidden) {
        resumeAfterInterruptionRef.current = Boolean(video && !video.paused && !video.ended);
        setIsDocumentVisible(false);
        return;
      }
      setIsDocumentVisible(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      if (playedDuration() < 5_000) return;

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
        Math.max(0, 5_000 - playedMilliseconds),
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
      configureAutoplayAudio(video);
      resumeAfterInterruptionRef.current = false;
      void video.play().catch(() => undefined);
    };
    const handleLoadedMetadata = () => {
      restorePlaybackPosition();
      playbackReadyRef.current = true;
      startPlayback();
    };

    if (!src.toLowerCase().split(/[?#]/, 1)[0].endsWith('.m3u8')) {
      video.src = src;
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', startPlayback);
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
    let handleHlsLoadedMetadata: (() => void) | null = null;
    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };
    const attachNativeHls = () => {
      if (disposed) return;
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        setPlaybackError(true);
        return;
      }

      nativeHlsAttached = true;
      video.src = src;
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
      hls = new Hls({
        autoStartLoad: true,
        enableWorker: true,
        lowLatencyMode: false,
        startFragPrefetch: false,
        maxBufferLength: 12,
        maxMaxBufferLength: 12,
        maxBufferSize: 128 * 1024 * 1024,
        backBufferLength: 6,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
        restorePlaybackPosition();
        playbackReadyRef.current = true;
        startPlayback();
      });
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetryCount = 0;
        mediaRetryCount = 0;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          clearRetryTimer();
          const delay = Math.min(10_000, 500 * (2 ** networkRetryCount));
          networkRetryCount += 1;
          retryTimer = window.setTimeout(() => {
            if (!disposed && hls) hls.startLoad();
          }, delay);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
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
      if (nativeHlsAttached) {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', startPlayback);
      }
      if (handleHlsLoadedMetadata) {
        video.removeEventListener('loadedmetadata', handleHlsLoadedMetadata);
      }
      video.removeEventListener('error', handleNativePlaybackError);
      window.removeEventListener('online', handleOnline);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [playbackStorageKey, shouldAttachMedia, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldAttachMedia) return;

    if (autoPlay) {
      configureAutoplayAudio(video);
      void video.play().catch(() => undefined);
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
        preload="metadata"
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
