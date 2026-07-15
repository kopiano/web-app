import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AuthUser } from '@/store/authSlice';
import { updateCurrentUserProfile } from '@/store/authSlice';
import type { AppDispatch } from '@/store/store';
import { resolveAvatarUrl } from '@/lib/avatar';
import '@/styles/auth.scss';

interface ProfileModalProps {
  user: AuthUser;
  onClose: () => void;
  onSaved: () => void;
}

const AVATAR_SIZE = 512;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function makeDefaultAvatar(username: string) {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create avatar');

  context.fillStyle = '#e8eaf0';
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.fillStyle = '#1f2937';
  context.font = '700 220px Roboto, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(username.trim().charAt(0).toUpperCase() || 'U', AVATAR_SIZE / 2, AVATAR_SIZE / 2 + 8);
  return canvas.toDataURL('image/webp', 0.9);
}

async function fileToWebp(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > MAX_AVATAR_BYTES) throw new Error('Avatar images must be 5 MB or smaller.');

  const source = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to process avatar');

  const scale = Math.max(AVATAR_SIZE / source.width, AVATAR_SIZE / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(source, (AVATAR_SIZE - width) / 2, (AVATAR_SIZE - height) / 2, width, height);
  source.close();
  return canvas.toDataURL('image/webp', 0.9);
}

export default function ProfileModal({ user, onClose, onSaved }: ProfileModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [username, setUsername] = useState(user.name || user.username || '');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [preview, setPreview] = useState(resolveAvatarUrl(user.avatar));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsername(user.name || user.username || '');
    setAvatar(user.avatar || '');
    setPreview(resolveAvatarUrl(user.avatar));
  }, [user]);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextAvatar = await fileToWebp(file);
      setAvatar(nextAvatar);
      setPreview(nextAvatar);
      setError('');
    } catch (avatarError) {
      setError(avatarError instanceof Error ? avatarError.message : 'Unable to process avatar.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Username is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const nextAvatar = avatar || makeDefaultAvatar(trimmedUsername);
      await dispatch(updateCurrentUserProfile({
        avatar: nextAvatar,
        username: trimmedUsername,
        password,
      })).unwrap();
      onSaved();
    } catch (requestError: any) {
      const status = requestError?.response?.status;
      setError(
        status === 409
          ? 'That username is already in use.'
          : status === 403
            ? 'GitHub accounts cannot be edited here.'
            : status === 400
              ? 'Please provide a valid avatar and username.'
              : 'Unable to save your profile.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-backdrop" onClick={onClose} />
      <section className="auth-panel profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close profile">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <header className="auth-header">
          <h2 id="profile-title" className="auth-title">Profile</h2>
          <p className="auth-subtitle">Update your avatar, username, or password.</p>
        </header>
        <form className="auth-form" onSubmit={handleSave}>
          <div className="profile-avatar-field">
            <button
              className="profile-avatar-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change avatar"
              title="Change avatar"
            >
              {preview ? <img src={preview} alt="" /> : <span>{username.trim().charAt(0).toUpperCase() || 'U'}</span>}
              <span className="profile-avatar-edit" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} hidden />
          </div>
          <label className="auth-field">
            <span className="auth-label">Username</span>
            <span className="auth-input-wrap">
              <input className="auth-input" value={username} onChange={event => setUsername(event.target.value)} required autoComplete="username" />
            </span>
          </label>
          <label className="auth-field">
            <span className="auth-label">Password</span>
            <span className="auth-input-wrap">
              <input className="auth-input" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Leave blank to keep your password" autoComplete="new-password" />
            </span>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="profile-actions">
            <button className="profile-cancel" type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="auth-submit profile-save" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
