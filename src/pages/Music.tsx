import {
  ChevronRight,
  Heart,
  Home,
  ListMusic,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import bg0 from '@/assets/images/bg-0.webp';
import bg1 from '@/assets/images/bg-1.webp';
import bg2 from '@/assets/images/bg-2.webp';
import bg3 from '@/assets/images/bg-3.webp';
import bg4 from '@/assets/images/bg-4.webp';
import bg8 from '@/assets/images/bg-8.webp';
import bg9 from '@/assets/images/bg-9.webp';
import '@/styles/music.scss';

type View = 'home' | 'playlist' | 'favorites';
type PlayMode = 'sequential' | 'shuffle' | 'single';

type Track = {
  id: number;
  title: string;
  artist: string;
  duration: number;
  cover: string;
  color: string;
};

const tracks: Track[] = [
  { id: 1, title: 'Aerial Bloom', artist: 'Nora Vale', duration: 242, cover: bg9, color: '#8d7cff' },
  { id: 2, title: 'After the Rain', artist: 'Cedar Lane', duration: 218, cover: bg8, color: '#77b8d3' },
  { id: 3, title: 'Velvet Horizon', artist: 'Mira Sol', duration: 196, cover: bg3, color: '#e08f9e' },
  { id: 4, title: 'Quiet Constellation', artist: 'Eli North', duration: 264, cover: bg1, color: '#7aa6c8' },
  { id: 5, title: 'Amber Hours', artist: 'Sunday Echo', duration: 231, cover: bg4, color: '#dca67b' },
  { id: 6, title: 'Softly, Again', artist: 'The Daydreamers', duration: 207, cover: bg2, color: '#a696ca' },
];

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(68);
  const [lastVolume, setLastVolume] = useState(68);
  const [favorites, setFavorites] = useState<Set<number>>(() => new Set([3, 5]));
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const currentTrack = tracks[currentIndex];
  const progressRef = useRef<HTMLInputElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const elapsedLabelRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef(74);
  const renderedSecondRef = useRef(Math.floor(74));

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
      return tracks.filter((track) => favorites.has(track.id));
    }
    if (activeView === 'playlist') {
      return [...tracks].slice(1, 6);
    }
    return tracks.slice(1, 5);
  }, [activeView, favorites]);

  const playTrack = useCallback((track: Track) => {
    const index = tracks.findIndex((item) => item.id === track.id);
    setCurrentIndex(index);
    resetProgress();
    setIsPlaying(true);
  }, [resetProgress]);

  const goToTrack = useCallback((direction: 1 | -1) => {
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
  }, [playMode, resetProgress]);

  useEffect(() => {
    document.body.classList.add('music-route');
    document.documentElement.classList.add('music-route');
    return () => {
      document.body.classList.remove('music-route');
      document.documentElement.classList.remove('music-route');
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    let previousTime: number | null = null;

    const updateProgress = (time: number) => {
      if (previousTime !== null) {
        const deltaSeconds = (time - previousTime) / 1000;
        const nextElapsed = Math.min(elapsedRef.current + deltaSeconds, currentTrack.duration);
        const nextSecond = Math.floor(nextElapsed);

        elapsedRef.current = nextElapsed;
        syncProgressVisual(nextElapsed, currentTrack.duration);

        if (nextSecond !== renderedSecondRef.current || nextElapsed >= currentTrack.duration) {
          renderedSecondRef.current = nextSecond;
          if (progressRef.current) progressRef.current.value = String(nextElapsed);
          if (elapsedLabelRef.current) elapsedLabelRef.current.textContent = formatTime(nextElapsed);
        }
      }
      previousTime = time;
      if (elapsedRef.current >= currentTrack.duration) {
        if (playMode === 'single') {
          resetProgress();
          frameId = window.requestAnimationFrame(updateProgress);
          return;
        }
        goToTrack(1);
        return;
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTrack.duration, goToTrack, isPlaying, playMode, resetProgress, syncProgressVisual]);

  useEffect(() => {
    syncProgressVisual(elapsedRef.current, currentTrack.duration);
  }, [currentTrack.duration, currentTrack.id, syncProgressVisual]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, button, a')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((value) => !value);
      }
      if (event.code === 'ArrowRight') goToTrack(1);
      if (event.code === 'ArrowLeft') goToTrack(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToTrack]);

  const toggleFavorite = (trackId: number) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
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

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <main className="music-page" style={{ '--track-accent': currentTrack.color } as CSSProperties}>
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
      </aside>

      <div className="music-content">
        <header className="music-heading">
          <div>
            <span className="music-eyebrow">YOUR PRIVATE COLLECTION</span>
          </div>
        </header>

        <article
          className="music-feature-card"
          style={{ backgroundImage: `url(${bg0})` }}
        >
          <div className="music-feature-shine" />
          <div className="music-feature-copy">
            <span className="music-feature-label">FEATURED ALBUM / 2026</span>
            <h2>Chromatic Daydreams</h2>
            <p>Six luminous tracks for slow mornings and late-night focus.</p>
            <button
              className="music-album-play"
              type="button"
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
          <div className="music-feature-index">01 - 06</div>
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
                    className={`music-card-favorite${favorites.has(track.id) ? ' is-favorite' : ''}`}
                    aria-label={favorites.has(track.id) ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(track.id);
                    }}
                  >
                    <Heart size={16} fill={favorites.has(track.id) ? 'currentColor' : 'none'} />
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
            <button type="button" onClick={() => setActiveView('home')}>Explore music</button>
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
          <button type="button" onClick={() => goToTrack(-1)} aria-label="Previous track"><SkipBack size={19} fill="currentColor" /></button>
          <button
            type="button"
            className="music-main-play"
            onClick={() => setIsPlaying((value) => !value)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" onClick={() => goToTrack(1)} aria-label="Next track"><SkipForward size={19} fill="currentColor" /></button>
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
              defaultValue={elapsedRef.current}
              onChange={(event) => {
                const nextElapsed = Number(event.target.value);
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
          className={`music-player-favorite${favorites.has(currentTrack.id) ? ' is-favorite' : ''}`}
          onClick={() => toggleFavorite(currentTrack.id)}
          aria-label={favorites.has(currentTrack.id) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} fill={favorites.has(currentTrack.id) ? 'currentColor' : 'none'} />
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
