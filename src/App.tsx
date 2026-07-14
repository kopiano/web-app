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
import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store } from '@/store/store';
import { fetchCurrentUser } from '@/store/authSlice';

const OAuthSuccess = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<typeof store.dispatch>();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_error')) {
      navigate('/?auth_error=github_login_failed', { replace: true });
      return;
    }
    dispatch(fetchCurrentUser())
      .unwrap()
      .then(() => {
        if (!cancelled) navigate('/', { replace: true });
      })
      .catch(() => {
        if (!cancelled) navigate('/?auth_error=github_login_failed', { replace: true });
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

const Layout = () => {
  const dispatch = useDispatch<typeof store.dispatch>();
  const isOAuthSuccess = window.location.pathname === '/oauth/success';

  useEffect(() => {
    if (!isOAuthSuccess) dispatch(fetchCurrentUser());
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
    element: <Layout />,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/chat', element: <Chat /> },
      { path: '/music', element: <Music /> },
      { path: '/video', element: <Video /> },
      { path: '/oauth/success', element: <OAuthSuccess /> },
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
