import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MusicTrack } from '@/api/music';

type MusicPlaybackSnapshot = {
  track: MusicTrack | null;
  isPlaying: boolean;
  canPlay: boolean;
};

type MusicPlaybackControls = {
  togglePlayback: () => void;
  playNext: () => void;
};

type MusicPlaybackContextValue = MusicPlaybackSnapshot & {
  publishPlayback: (snapshot: MusicPlaybackSnapshot) => void;
  registerControls: (controls: MusicPlaybackControls) => () => void;
  togglePlayback: () => void;
  playNext: () => void;
};

const INITIAL_SNAPSHOT: MusicPlaybackSnapshot = {
  track: null,
  isPlaying: false,
  canPlay: false,
};

const MusicPlaybackContext = createContext<MusicPlaybackContextValue | null>(null);

export function MusicPlaybackProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const controlsRef = useRef<MusicPlaybackControls | null>(null);

  const publishPlayback = useCallback((nextSnapshot: MusicPlaybackSnapshot) => {
    setSnapshot(nextSnapshot);
  }, []);

  const registerControls = useCallback((controls: MusicPlaybackControls) => {
    controlsRef.current = controls;
    return () => {
      if (controlsRef.current === controls) controlsRef.current = null;
    };
  }, []);

  const togglePlayback = useCallback(() => {
    controlsRef.current?.togglePlayback();
  }, []);

  const playNext = useCallback(() => {
    controlsRef.current?.playNext();
  }, []);

  const value = useMemo(() => ({
    ...snapshot,
    publishPlayback,
    registerControls,
    togglePlayback,
    playNext,
  }), [playNext, publishPlayback, registerControls, snapshot, togglePlayback]);

  return (
    <MusicPlaybackContext.Provider value={value}>
      {children}
    </MusicPlaybackContext.Provider>
  );
}

export function useMusicPlayback() {
  const value = useContext(MusicPlaybackContext);
  if (!value) {
    throw new Error('useMusicPlayback must be used within MusicPlaybackProvider');
  }
  return value;
}
