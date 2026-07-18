import '@/i18n';
import { Navigate, Outlet, createBrowserRouter, RouterProvider, useNavigate } from 'react-router-dom';
import Overview from '@/pages/Overview';
import Chat from '@/pages/Chat';
import Music from '@/pages/Music';
import Video from '@/pages/Video';
import Header from '@/pages/Header';
import BackgroundImg from '@/components/BackgroundImg';
import { ThemeProvider } from '@/context/ThemeContext';
import "@/App.scss";
import "@/styles/oauth.scss";
import { useEffect, useState } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { store } from '@/store/store';
import { clearUser, fetchCurrentUser } from '@/store/authSlice';
import { authStorage, clearAuthReturnTo, getAuthReturnTo } from '@/lib/auth';

function withAuthError(returnTo: string) {
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.set('auth_error', 'github_login_failed');
  return `${url.pathname}${url.search}${url.hash}`;
}

const OAuthSuccess = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<typeof store.dispatch>();

  useEffect(() => {
    let cancelled = false;
    const returnTo = getAuthReturnTo();
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_error')) {
      clearAuthReturnTo();
      navigate(withAuthError(returnTo), { replace: true });
      return;
    }
    authStorage.clearLoggedOut();
    dispatch(fetchCurrentUser())
      .unwrap()
      .then(() => {
        if (!cancelled) {
          clearAuthReturnTo();
          navigate(returnTo, { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearAuthReturnTo();
          navigate(withAuthError(returnTo), { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate]);

  return (
    <main className="oauth-success-loading" role="status" aria-live="polite">
      <div className="oauth-success-spinner" aria-hidden="true" />
      <span>Signing you in...</span>
    </main>
  );
};

function normalizeSubscriptionReturnTo(value: string | null) {
  if (value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return value;
  }
  const stored = window.sessionStorage.getItem('subscription_return_to');
  if (stored?.startsWith('/') && !stored.startsWith('//') && !stored.includes('\\')) {
    return stored;
  }
  return '/music';
}

function hasActiveSubscription(user: {
  plan?: string;
  subscription_status?: string;
  subscription_end_at?: string | null;
}) {
  const paidPlan = user.plan?.toLowerCase() === 'pro' || user.plan?.toLowerCase() === 'plus';
  const activeStatus = (user.subscription_status ?? '').toLowerCase() === 'active';
  const endTimestamp = user.subscription_end_at
    ? Date.parse(user.subscription_end_at)
    : Number.POSITIVE_INFINITY;
  return paidPlan && activeStatus && endTimestamp > Date.now();
}

const SubscriptionSuccess = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch<typeof store.dispatch>();
  const [status, setStatus] = useState<'refreshing' | 'pending'>('refreshing');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const returnTo = normalizeSubscriptionReturnTo(params.get('return_to'));

    const refreshSubscription = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        try {
          const user = await dispatch(fetchCurrentUser()).unwrap();
          if (hasActiveSubscription(user)) {
            window.sessionStorage.removeItem('subscription_return_to');
            navigate(returnTo, { replace: true });
            return;
          }
        } catch {
          // Retry briefly while the payment webhook and session settle.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (!cancelled) setStatus('pending');
    };

    void refreshSubscription();
    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate]);

  return (
    <main className="oauth-success-loading" role="status" aria-live="polite">
      {status === 'refreshing' && <div className="oauth-success-spinner" aria-hidden="true" />}
      <span>
        {t(status === 'refreshing'
          ? 'music.subscriptionRefreshing'
          : 'music.subscriptionPending')}
      </span>
      {status === 'pending' && (
        <button
          type="button"
          className="subscription-return-button"
          onClick={() => window.location.reload()}
        >
          {t('music.checkSubscriptionAgain')}
        </button>
      )}
    </main>
  );
};

const Layout = () => {
  const dispatch = useDispatch<typeof store.dispatch>();
  const isOAuthSuccess = window.location.pathname === '/oauth/success';

  useEffect(() => {
    if (isOAuthSuccess) return;
    if (authStorage.isLoggedOut() || !authStorage.hasSessionHint()) {
      dispatch(clearUser());
      return;
    }
    dispatch(fetchCurrentUser());
  }, [dispatch, isOAuthSuccess]);

  return (
      <ThemeProvider>
      <BackgroundImg />
      <Header />
      <Outlet />
    </ThemeProvider>
  );
};

const router = createBrowserRouter([
  {
    element: (
      <ThemeProvider>
        <BackgroundImg />
        <Outlet />
      </ThemeProvider>
    ),
    children: [
      { path: '/oauth/success', element: <OAuthSuccess /> },
      { path: '/subscription/success', element: <SubscriptionSuccess /> },
    ],
  },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/chat', element: <Chat /> },
      { path: '/music', element: <Music /> },
      { path: '/video', element: <Video /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function App() {
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}

export default App;
