import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from '@/pages/Home';
import Music from '@/pages/Music';
import Video from '@/pages/Video';
import "@/App.scss";

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/music', element: <Music /> },
  { path: '/video', element: <Video /> },
]);

function App() {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
