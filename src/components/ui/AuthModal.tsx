import { useEffect, useState } from 'react';
import '@/styles/auth.scss';
import { startGithubLogin } from '@/lib/auth';
import { login, register } from '@/api/auth';
import { fetchCurrentUser, setUser } from '@/store/authSlice';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store/store';

interface AuthModalProps {
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthModal({ onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState('');
  const [toastClosing, setToastClosing] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!toast) return undefined;
    const closeTimer = window.setTimeout(() => setToastClosing(true), 4650);
    const removeTimer = window.setTimeout(() => {
      setToast('');
      setToastClosing(false);
    }, 5000);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [toast]);

  const showToast = (message: string) => {
    setToast('');
    setToastClosing(false);
    window.requestAnimationFrame(() => setToast(message));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (!password.trim() || !trimmedUsername || (mode === 'signup' && !trimmedEmail)) {
      const message = mode === 'signup'
        ? '用户名、邮箱和密码不能为空。'
        : '用户名和密码不能为空。';
      setError(message);
      showToast(message);
      return;
    }
    if (mode === 'signup' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await register({ name: trimmedUsername, email: trimmedEmail, password });
        window.dispatchEvent(new CustomEvent('app:notification', {
          detail: { message: `${trimmedUsername} 注册成功`, type: 'success' },
        }));
        setMode('login');
        setUsername(trimmedUsername);
        setEmail('');
        setError('');
        setSuccess(false);
        return;
      } else {
        const response = await login({ username: trimmedUsername, password }) as {
          data?: { user?: Parameters<typeof setUser>[0] };
        };
        if (response.data?.user) {
          dispatch(setUser(response.data.user));
        } else {
          await dispatch(fetchCurrentUser()).unwrap();
        }
        window.dispatchEvent(new CustomEvent('app:notification', {
          detail: { message: `${trimmedUsername} 登录成功`, type: 'success' },
        }));
      }
      onClose();
    } catch (requestError: any) {
      const status = requestError?.response?.status;
      setError(status === 409
        ? 'This username or email is already registered.'
        : status === 401
          ? 'Invalid username or password.'
          : status === 400
            ? 'Please check the required fields.'
          : status === 500
            ? 'The server could not create the account. Please try again.'
          : requestError?.code === 'ECONNABORTED'
            ? 'The request timed out. Please try again.'
          : !requestError?.response
            ? 'Unable to connect to the server.'
          : 'Unable to complete authentication. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-backdrop" onClick={onClose} />
      <div className="auth-panel glass">
        <button className="auth-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="auth-header">
          <h2 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <p className="auth-subtitle">
            {mode === 'login' ? 'Sign in to your account to continue' : 'Get started with a free account'}
          </p>
        </div>

        {mode === 'login' && <div className="auth-social">
          <button className="auth-social-btn glass-border" type="button" onClick={startGithubLogin}>
            <svg data-component="Octicon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="#000" overflow="visible" style={{ verticalAlign: 'text-bottom' }}><path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"></path></svg>
          </button>
          <button className="auth-social-btn glass-border">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </button>
          <button className="auth-social-btn glass-border">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </button>
        </div>}

        {mode === 'login' && <div className="auth-divider">
          <div className="auth-divider-line" />
          <span className="auth-divider-text">or continue with username</span>
          <div className="auth-divider-line" />
        </div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Username</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          {mode === 'signup' && <div className="auth-field">
            <label className="auth-label">Email</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>}

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input auth-input--pw"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading && <LoadingSpinner />}
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create Account'}
          </button>
          {error && <p className={success ? 'auth-error auth-success' : 'auth-error'} role="alert">{error}</p>}
        </form>

        <p className="auth-footer">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            className="auth-switch-btn"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
      {toast && (
        <div className={`auth-toast${toastClosing ? ' is-closing' : ''}`} role="status" aria-live="polite">
          <span className="auth-toast-icon" aria-hidden="true">✓</span>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="auth-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
