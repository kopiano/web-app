import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import request from '@/api/request';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  github_id?: string | null;
  avatar?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
}

const initialState: AuthState = { user: null, loading: false, initialized: false };

export const fetchCurrentUser = createAsyncThunk<AuthUser>(
  'auth/fetchCurrentUser',
  async () => (await request.get<AuthUser>('/users/me')).data,
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser | null>) => { state.user = action.payload; },
    clearUser: (state) => { state.user = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => { state.loading = true; })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
        state.initialized = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.loading = false;
        state.initialized = true;
      });
  },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
