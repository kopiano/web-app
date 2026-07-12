import '@/i18n';
import { Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom';
import Overview from '@/pages/Overview';
import Chat from '@/pages/Chat';
import Music from '@/pages/Music';
import Video from '@/pages/Video';
import Header from '@/pages/Header';
import BackgroundImg from '@/components/BackgroundImg';
import { ThemeProvider } from '@/context/ThemeContext';
import "@/App.scss";

const Layout = () => (
  <ThemeProvider>
    <BackgroundImg />
    <Header />
    <Outlet />
  </ThemeProvider>
);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/chat', element: <Chat /> },
      { path: '/music', element: <Music /> },
      { path: '/video', element: <Video /> },
    ],
  },
]);

function App() {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
