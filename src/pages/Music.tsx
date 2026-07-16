import {
  ChevronRight,
  Heart,
  Home,
  ListMusic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react';
import bg0 from '@/assets/images/bg-0.webp';
import { getMusic, updateMusicFavorite, uploadMusic, type MusicTrack } from '@/api/music';
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
  createdAt: '',
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
  const [activeView, setActiveView] = useState<View>('home');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [volume, setVolume] = useState(68);
  const [lastVolume, setLastVolume] = useState(68);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const currentTrack = tracks[currentIndex] ?? EMPTY_TRACK;
  const featuredTrack = tracks[0] ?? EMPTY_TRACK;
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef(0);
  const renderedSecondRef = useRef(0);
  const addMusicInputRef = useRef<HTMLInputElement>(null);

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

  const playTrack = useCallback((track: MusicTrack) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    if (index < 0) return;
    setCurrentIndex(index);
    resetProgress();
    setIsPlaying(true);
  }, [resetProgress, tracks]);

  const goToTrack = useCallback((direction: 1 | -1) => {
    if (!tracks.length) return;
    setCurrentIndex((current) => {
      if (playMode === 'shuffle') {
        if (tracks.length < 2) return current;
        let next = current;
        while (next === current) next = Math.floor(Math.random() * tracks.length);
        return next;
      }
      return (current + direction + tracks.length) % tracks.length;
    });
    resetProgress();
    setIsPlaying(true);
  }, [playMode, resetProgress, tracks]);

  useEffect(() => {
    document.body.classList.add('music-route');
    document.documentElement.classList.add('music-route');
    return () => {
      document.body.classList.remove('music-route');
      document.documentElement.classList.remove('music-route');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMusic()
      .then((music) => {
        if (!cancelled) setTracks(music);
      })
      .catch((error) => {
        console.error('Failed to load music', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentIndex >= tracks.length && tracks.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack.audioUrl) {
      audio.removeAttribute('src');
      audio.load();
      setIsPlaying(false);
      resetProgress();
      return;
    }
    if (audio.dataset.trackId !== currentTrack.id) {
      audio.dataset.trackId = currentTrack.id;
      audio.src = currentTrack.audioUrl;
      audio.load();
      resetProgress();
    }
  }, [currentTrack.audioUrl, currentTrack.id, resetProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack.audioUrl) return;
    if (isPlaying) {
      void audio.play().catch((error) => {
        console.error('Audio playback failed', error);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [currentTrack.audioUrl, currentTrack.id, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    let frameId = 0;

    const updateProgress = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack.duration;
      const nextElapsed = Math.min(audio.currentTime, duration || currentTrack.duration);
      const nextSecond = Math.floor(nextElapsed);
      elapsedRef.current = nextElapsed;
      syncProgressVisual(nextElapsed, duration || currentTrack.duration);

      if (nextSecond !== renderedSecondRef.current) {
        renderedSecondRef.current = nextSecond;
        if (progressRef.current) progressRef.current.value = String(nextElapsed);
        if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(nextElapsed);
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTrack.duration, isPlaying, syncProgressVisual]);

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
      goToTrack(1);
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [goToTrack, playMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, button, a')) return;
      if (event.code === 'Space' && tracks.length > 0) {
        event.preventDefault();
        setIsPlaying((value) => !value);
      }
      if (event.code === 'ArrowRight') goToTrack(1);
      if (event.code === 'ArrowLeft') goToTrack(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToTrack, tracks.length]);

  const toggleFavorite = async (trackId: string) => {
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
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setIsUploading(true);
    try {
      await uploadMusic(files);
      const refreshed = await getMusic();
      setTracks(refreshed);
      setCurrentIndex(0);
      setActiveView('playlist');
      setIsPlaying(false);
      resetProgress();
    } catch (error) {
      console.error('Failed to upload music', error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <main className="music-page" style={{ '--track-accent': '#fea6d8' } as CSSProperties}>
      <audio ref={audioRef} preload="metadata" />
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
          className="music-add-button"
          onClick={() => addMusicInputRef.current?.click()}
          disabled={isUploading}
          aria-busy={isUploading}
          aria-label="Add music"
          title={isUploading ? 'Uploading and converting music' : 'Add music'}
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

        <article
          className="music-feature-card"
          style={{ backgroundImage: `url(${featuredTrack.cover})` }}
        >
          <div className="music-feature-shine" />
          <div className="music-feature-copy">
            <span className="music-feature-label">{featuredTrack.album.toUpperCase()}</span>
            <h2>{featuredTrack.title}</h2>
            <p>{featuredTrack.artist}</p>
            <button
              className="music-album-play"
              type="button"
              disabled={!tracks.length}
              onClick={() => {
                setCurrentIndex(0);
                resetProgress();
                setIsPlaying(true);
              }}
            >
              <Play size={16} fill="currentColor" />
              <span>Play album</span>
            </button>
          </div>
          <div className="music-feature-index">{tracks.length ? `01 - ${String(tracks.length).padStart(2, '0')}` : '00'}</div>
        </article>

        <div className="music-section-heading">
          <div>
            <h2>{activeView === 'favorites' ? 'Your favorites' : activeView === 'playlist' ? 'All Albums' : 'Trending Albums'}</h2>
            <p>{visibleTracks.length} songs</p>
          </div>
          <button type="button" className="view-all" onClick={() => setActiveView('playlist')}>
            See more <ChevronRight size={15} />
          </button>
        </div>

        {visibleTracks.length ? (
          <div className="music-card-grid">
            {visibleTracks.map((track, index) => {
              const isCurrent = track.id === currentTrack.id;
              return (
                <article
                  className={`music-track-card${isCurrent ? ' is-current' : ''}`}
                  key={track.id}
                  onPointerMove={handleCardPointer}
                  onPointerLeave={resetCardPointer}
                  style={{ backgroundImage: `url(${track.cover})`, '--card-delay': `${index * 70}ms` } as CSSProperties}
                  onClick={() => playTrack(track)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      playTrack(track);
                    }
                  }}
                >
                  <button
                    type="button"
                    className={`music-card-favorite${track.isFavorite ? ' is-favorite' : ''}`}
                    aria-label={track.isFavorite ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(track.id);
                    }}
                  >
                    <Heart size={16} fill={track.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                  <div className="music-track-glass">
                    <div>
                      <h3>{track.title}</h3>
                      <p>{track.artist}</p>
                    </div>
                    <button
                      className="music-card-play"
                      type="button"
                      aria-label={`${isCurrent && isPlaying ? 'Pause' : 'Play'} ${track.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCurrent) setIsPlaying((value) => !value);
                        else playTrack(track);
                      }}
                    >
                      {isCurrent && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="music-empty-state">
            <Heart size={25} />
            <h3>Your favorites are waiting.</h3>
            <p>Tap the heart on a track to keep it close.</p>
            <button type="button" onClick={() => addMusicInputRef.current?.click()}>Add music</button>
          </div>
        )}
      </div>

      <div className="music-player" aria-label="Music player">
        <div className="music-now-playing">
          <div className={`music-cover-disc${isPlaying ? ' is-spinning' : ''}`}>
            <img src={currentTrack.cover} alt="" />
            <span />
          </div>
          <div className="music-track-meta">
            <strong>{currentTrack.title}</strong>
            <span>{currentTrack.artist}</span>
          </div>
        </div>

        <div className="music-transport">
          <button type="button" disabled={!tracks.length} onClick={() => goToTrack(-1)} aria-label="Previous track"><SkipBack size={19} fill="currentColor" /></button>
          <button
            type="button"
            className="music-main-play"
            disabled={!tracks.length}
            onClick={() => setIsPlaying((value) => !value)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" disabled={!tracks.length} onClick={() => goToTrack(1)} aria-label="Next track"><SkipForward size={19} fill="currentColor" /></button>
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
          className={`music-player-favorite${currentTrack.isFavorite ? ' is-favorite' : ''}`}
          disabled={!currentTrack.id}
          onClick={() => toggleFavorite(currentTrack.id)}
          aria-label={currentTrack.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
          title={playModeLabels[playMode]}
        >
          {playMode === 'shuffle'
            ? <Shuffle size={19} strokeWidth={1.9} />
            : (
              <span className={`music-mode-icon${playMode === 'single' ? ' is-single' : ''}`} aria-hidden="true">
                <RefreshCw size={20} strokeWidth={1.9} />
                {playMode === 'single' && <span className="music-mode-icon-number">1</span>}
              </span>
            )}
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
    </main>
  );
}

export default Music;
