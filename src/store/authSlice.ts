import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import request from '@/api/request';
import { updateProfile } from '@/api/user';
import type { UpdateProfileInput } from '@/api/user';
import { authStorage } from '@/lib/auth';

export interface AuthUser {
  id: string;
  name: string;
  email?: string | null;
  github_id?: string | null;
  avatar?: string | null;
  username?: string | null;
  role?: string | null;
  plan?: string;
  subscription_status?: string;
  subscription_start_at?: string | null;
  subscription_end_at?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
}

function getCachedUser(): AuthUser | null {
  try {
    const cached = sessionStorage.getItem('auth_user');
    return cached ? JSON.parse(cached) as AuthUser : null;
  } catch {
    return null;
  }
}

const initialState: AuthState = {
  user: getCachedUser(),
  loading: false,
  initialized: false,
};

export const fetchCurrentUser = createAsyncThunk<AuthUser, void, { rejectValue: 'unauthorized' }>(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await request.get<AuthUser>('/users/me');
      return {
        ...data,
        name: data.name || data.username || 'User',
      };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        return rejectWithValue('unauthorized');
      }
      throw error;
    }
  },
);

export const updateCurrentUserProfile = createAsyncThunk<AuthUser, UpdateProfileInput>(
  'auth/updateCurrentUserProfile',
  async (profile) => {
    const { data } = await updateProfile(profile);
    return {
      ...data,
      name: data.name || data.username || 'User',
    };
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
      state.initialized = true;
      if (action.payload) {
        authStorage.markAuthenticated();
        sessionStorage.setItem('auth_user', JSON.stringify(action.payload));
      } else {
        sessionStorage.removeItem('auth_user');
      }
    },
    clearUser: (state) => {
      state.user = null;
      state.loading = false;
      state.initialized = true;
      authStorage.markLoggedOut();
      sessionStorage.removeItem('auth_user');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.pending, (state) => { state.loading = true; })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        if (authStorage.isLoggedOut()) {
          state.user = null;
          state.loading = false;
          state.initialized = true;
          sessionStorage.removeItem('auth_user');
          return;
        }
        state.user = action.payload;
        state.loading = false;
        state.initialized = true;
        authStorage.markAuthenticated();
        sessionStorage.setItem('auth_user', JSON.stringify(action.payload));
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.initialized = true;
        if (action.payload === 'unauthorized') {
          // The HttpOnly Cookie is the source of truth. Do not keep a stale
          // cached profile after the server rejects the session.
          state.user = null;
          authStorage.clear();
          authStorage.markLoggedOut();
          sessionStorage.removeItem('auth_user');
        }
      })
      .addCase(updateCurrentUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.initialized = true;
        authStorage.markAuthenticated();
        sessionStorage.setItem('auth_user', JSON.stringify(action.payload));
      });
  },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
