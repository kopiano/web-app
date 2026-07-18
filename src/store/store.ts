import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import chatReducer from './chatSlice';

export const store = configureStore({
  reducer: { auth: authReducer, chat: chatReducer },
  middleware: getDefaultMiddleware => getDefaultMiddleware({
    serializableCheck: {
      ignoredPaths: ['chat.conversations'],
      ignoredActionPaths: [
        'payload.message.sendImageRequest.image',
        'payload.changes.sendImageRequest.image',
      ],
    },
  }),
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
