import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { api } from './api/client';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import LeagueSetup from './pages/LeagueSetup';
import DraftRoom from './pages/DraftRoom';
import AcceptInvite from './pages/AcceptInvite';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    api.post('/auth/refresh')
      .then(({ data }) => setAuth(data.user, data.accessToken))
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, [setAuth]);

  if (initializing) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/leagues/:id/setup" element={<PrivateRoute><LeagueSetup /></PrivateRoute>} />
        <Route path="/draft/:draftId" element={<PrivateRoute><DraftRoom /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
