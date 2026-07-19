import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import chatReducer from './chatSlice';
import { musicApi } from './musicApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
    [musicApi.reducerPath]: musicApi.reducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({
    serializableCheck: {
      ignoredPaths: ['chat.conversations'],
      ignoredActionPaths: [
        'payload.message.sendImageRequest.image',
        'payload.changes.sendImageRequest.image',
      ],
    },
  }).concat(musicApi.middleware),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
