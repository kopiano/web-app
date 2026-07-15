import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface HlsVideoProps {
  src: string;
  poster?: string;
  className?: string;
  width?: number;
  height?: number;
}

export default function HlsVideo({ src, poster, className, width, height }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const hasDimensions = Boolean(width && height && width > 0 && height > 0);
  const aspectRatio = hasDimensions ? `${width} / ${height}` : '16 / 9';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackError(false);
    if (!src.toLowerCase().split(/[?#]/, 1)[0].endsWith('.m3u8')) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    let disposed = false;
    let hls: Hls | null = null;
    void import('hls.js').then(({ default: HlsPlayer }) => {
      if (disposed) return;
      if (!HlsPlayer.isSupported()) {
        setPlaybackError(true);
        return;
      }

      hls = new HlsPlayer({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1024 * 1024,
        backBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
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
    }).catch(() => {
      if (!disposed) setPlaybackError(true);
    });

    return () => {
      disposed = true;
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className="hls-video" style={{ aspectRatio }}>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        className={className}
      />
      {playbackError && (
        <div className="hls-video-error" role="alert">
          Unable to play this video.
        </div>
      )}
    </div>
  );
}
