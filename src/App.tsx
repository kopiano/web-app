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
import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store } from '@/store/store';
import { fetchCurrentUser } from '@/store/authSlice';

const OAuthSuccess = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<typeof store.dispatch>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_error')) {
      navigate('/?auth_error=github_login_failed', { replace: true });
      return;
    }
    dispatch(fetchCurrentUser()).finally(() => {
      navigate('/', { replace: true });
    });
  }, [dispatch, navigate]);

  return null;
};

const Layout = () => {
  const dispatch = useDispatch<typeof store.dispatch>();

  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

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
