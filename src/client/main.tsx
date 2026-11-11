import { StrictMode, Suspense, lazy, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/readex-pro';
import '@fontsource/lalezar/arabic-400.css';
import '@fontsource/lalezar/latin-400.css';
import './styles.css';
import { Layout } from './components/Layout.tsx';
import { Button, Spinner } from './components/ui.tsx';
import { useSession } from './lib/session.ts';
import HomePage from './pages/Home.tsx';

const GamesPage = lazy(() => import('./pages/Games.tsx'));
const GameDetailsPage = lazy(() => import('./pages/GameDetails.tsx'));
const CreateRoomPage = lazy(() => import('./pages/CreateRoom.tsx'));
const JoinRoomPage = lazy(() => import('./pages/JoinRoom.tsx'));
const PlayPage = lazy(() => import('./pages/Play.tsx'));
const RoomPage = lazy(() => import('./pages/Room.tsx'));
const ProfilePage = lazy(() => import('./pages/Profile.tsx'));
const FriendsPage = lazy(() => import('./pages/Friends.tsx'));
const LeaderboardPage = lazy(() => import('./pages/Leaderboard.tsx'));
const AchievementsPage = lazy(() => import('./pages/Achievements.tsx'));
const SettingsPage = lazy(() => import('./pages/Settings.tsx'));
const AuthPage = lazy(() => import('./pages/Auth.tsx'));
const PacksPage = lazy(() => import('./pages/Packs.tsx'));
const AdminPage = lazy(() => import('./pages/admin/Admin.tsx'));
const NotFoundPage = lazy(() => import('./pages/NotFound.tsx'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[ui] crashed', error);
  }
  render() {
    if (this.state.error) {
      const chunk = /dynamically imported module|Failed to fetch|Loading chunk/i.test(this.state.error.message);
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="text-6xl">🫠</p>
          <h1 className="mt-4 font-display text-3xl">{chunk ? 'صار تحديث أو انقطع النت' : 'صارت خبصة غير متوقعة'}</h1>
          <p className="mt-2 text-ink-300">{chunk ? 'حدّث الصفحة لتحميل آخر نسخة.' : 'جرّب تحدّث الصفحة. إذا ضلت المشكلة بلّغنا.'}</p>
          <Button className="mt-6" onClick={() => location.reload()}>
            تحديث الصفحة
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const page = (el: ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<Spinner label="عم نحمّل..." />}>{el}</Suspense>
  </ErrorBoundary>
);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: page(<HomePage />) },
      { path: '/games', element: page(<GamesPage />) },
      { path: '/games/:id', element: page(<GameDetailsPage />) },
      { path: '/create', element: page(<CreateRoomPage />) },
      { path: '/join', element: page(<JoinRoomPage />) },
      { path: '/play', element: page(<PlayPage />) },
      { path: '/r/:code', element: page(<RoomPage />) },
      { path: '/u/:username', element: page(<ProfilePage />) },
      { path: '/friends', element: page(<FriendsPage />) },
      { path: '/leaderboard', element: page(<LeaderboardPage />) },
      { path: '/achievements', element: page(<AchievementsPage />) },
      { path: '/settings', element: page(<SettingsPage />) },
      { path: '/packs', element: page(<PacksPage />) },
      { path: '/login', element: page(<AuthPage mode="login" />) },
      { path: '/register', element: page(<AuthPage mode="register" />) },
      { path: '/admin/*', element: page(<AdminPage />) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
]);

void useSession.getState().load();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
