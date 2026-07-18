import { Music2, Pause, Play, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayback } from '@/context/MusicPlaybackContext';
import '@/styles/miniMusicPlayer.scss';

function MiniMusicPlayer() {
  const { t } = useTranslation();
  const {
    track,
    isPlaying,
    canPlay,
    togglePlayback,
    playNext,
  } = useMusicPlayback();

  if (!track?.id) return null;

  return (
    <aside
      className={`mini-music-player${isPlaying ? '' : ' fade-out'}`}
      aria-hidden={!isPlaying}
      aria-label={t('music.player')}
    >
      <div className={`mini-music-cover${isPlaying ? ' is-playing' : ''}`} aria-hidden="true">
        {track.cover
          ? <img src={track.cover} alt="" />
          : <Music2 size={19} />}
      </div>

      <div className="mini-music-meta">
        <strong title={track.title}>{track.title}</strong>
        <span title={track.artist}>{track.artist}</span>
      </div>

      <div className="mini-music-controls">
        <button
          type="button"
          className="mini-music-play"
          disabled={!canPlay}
          onClick={togglePlayback}
          aria-label={t(isPlaying ? 'music.pause' : 'music.play')}
        >
          {isPlaying
            ? <Pause size={17} fill="currentColor" />
            : <Play size={17} fill="currentColor" />}
        </button>
        <button
          type="button"
          disabled={!canPlay}
          onClick={playNext}
          aria-label={t('music.nextTrack')}
          title={t('music.nextTrack')}
        >
          <SkipForward size={17} fill="currentColor" />
        </button>
      </div>
    </aside>
  );
}

export default MiniMusicPlayer;
