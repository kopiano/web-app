import type { AuthUser } from '@/store/authSlice';

export interface UpdateProfileInput {
  avatar: string;
  username: string;
  password: string;
}

export function getMe(): Promise<{ data: AuthUser }>;
export function getUserList(): Promise<{ data: AuthUser[] }>;
export function updateProfile(data: UpdateProfileInput): Promise<{ data: AuthUser }>;
