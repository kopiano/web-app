import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { VideoApiItem } from '@/api/video';

type VideoViewState = {
  byVideoId: Record<string, Partial<VideoApiItem>>;
};

const initialState: VideoViewState = {
  byVideoId: {},
};

const videoViewSlice = createSlice({
  name: 'videoViews',
  initialState,
  reducers: {
    setVideoViewCount: (
      state,
      action: PayloadAction<{ videoId: string; viewCount: number }>,
    ) => {
      state.byVideoId[action.payload.videoId] = {
        ...state.byVideoId[action.payload.videoId],
        viewCount: action.payload.viewCount,
      };
    },
    setVideoDetails: (state, action: PayloadAction<VideoApiItem>) => {
      state.byVideoId[action.payload.id] = {
        ...state.byVideoId[action.payload.id],
        ...action.payload,
      };
    },
  },
});

export const { setVideoDetails, setVideoViewCount } = videoViewSlice.actions;
export default videoViewSlice.reducer;
