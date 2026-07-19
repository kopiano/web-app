import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type VideoPlaybackStatus = 'idle' | 'playing' | 'paused';

interface VideoPlaybackState {
  activeVideoId: string | null;
  status: VideoPlaybackStatus;
  currentTime: number;
}

const initialState: VideoPlaybackState = {
  activeVideoId: null,
  status: 'idle',
  currentTime: 0,
};

const videoPlaybackSlice = createSlice({
  name: 'videoPlayback',
  initialState,
  reducers: {
    activateVideo: (state, action: PayloadAction<string>) => {
      state.activeVideoId = action.payload;
      state.status = 'playing';
    },
    pauseVideo: (state, action: PayloadAction<string>) => {
      if (state.activeVideoId === action.payload) state.status = 'paused';
    },
    updateVideoPlaybackTime: (
      state,
      action: PayloadAction<{ videoId: string; currentTime: number }>,
    ) => {
      if (state.activeVideoId !== action.payload.videoId) return;
      state.currentTime = action.payload.currentTime;
    },
    clearActiveVideo: (state, action: PayloadAction<string | undefined>) => {
      if (action.payload && state.activeVideoId !== action.payload) return;
      state.activeVideoId = null;
      state.status = 'idle';
      state.currentTime = 0;
    },
  },
});

export const {
  activateVideo,
  pauseVideo,
  updateVideoPlaybackTime,
  clearActiveVideo,
} = videoPlaybackSlice.actions;

export default videoPlaybackSlice.reducer;
