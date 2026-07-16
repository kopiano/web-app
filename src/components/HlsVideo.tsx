import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

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
}: HlsVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoPlayRef = useRef(autoPlay);
  const [playbackError, setPlaybackError] = useState(false);
  const hasDimensions = Boolean(width && height && width > 0 && height > 0);
  const aspectRatio = hasDimensions ? `${width} / ${height}` : '16 / 9';
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackError(false);
    if (!active) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    const startPlayback = () => {
      if (!autoPlayRef.current) return;
      // video.muted = true;
      void video.play().catch(() => undefined);
    };

    if (!src.toLowerCase().split(/[?#]/, 1)[0].endsWith('.m3u8')) {
      video.src = src;
      video.addEventListener('canplay', startPlayback);
      return () => {
        video.removeEventListener('canplay', startPlayback);
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
    }

    let disposed = false;
    let hls: Hls | null = null;
    let nativeHlsAttached = false;
    const attachNativeHls = () => {
      if (disposed) return;
      if (!video.canPlayType('application/vnd.apple.mpegurl')) {
        setPlaybackError(true);
        return;
      }

      nativeHlsAttached = true;
      video.src = src;
      video.addEventListener('canplay', startPlayback);
    };

    void import('hls.js').then(({ default: HlsPlayer }) => {
      if (disposed) return;
      if (!HlsPlayer.isSupported()) {
        attachNativeHls();
        return;
      }

      hls = new HlsPlayer({
        // autoStartLoad: true,
        enableWorker: true,
        lowLatencyMode: false,
        startFragPrefetch: false,
        maxBufferLength: 12,
        maxMaxBufferLength: 12,
        maxBufferSize: 8 * 1024 * 1024,
        backBufferLength: 6,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(HlsPlayer.Events.MANIFEST_PARSED, startPlayback);
      hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setPlaybackError(true);
          hls.destroy();
          hls = null;
        }
      });
    }).catch(attachNativeHls);

    return () => {
      disposed = true;
      if (nativeHlsAttached) {
        video.removeEventListener('canplay', startPlayback);
      }
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [active, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    if (autoPlay) {
      // video.muted = true;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [active, autoPlay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container || !onDeactivate) return;

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
    <div ref={containerRef} className="hls-video" style={{ aspectRatio }}>
      <video
        ref={videoRef}
        controls={active}
        playsInline
        preload={active ? 'metadata' : 'none'}
        poster={poster}
        className={className}
      />
      {!active && onActivate && (
        <button
          type="button"
          className="hls-video-play"
          aria-label="Play video"
          onClick={onActivate}
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
          Unable to play this video.
        </div>
      )}
    </div>
  );
}
