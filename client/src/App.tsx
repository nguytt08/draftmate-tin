import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { api } from './api/client';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import LeagueSetup from './pages/LeagueSetup';
import DraftRoom from './pages/DraftRoom';
import AcceptInvite from './pages/AcceptInvite';
import JoinDraft from './pages/JoinDraft';
import AdminPanel from './pages/AdminPanel';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ImpersonationBanner() {
  const { impersonatingUser, setImpersonating, setAuth } = useAuthStore();
  const navigate = useNavigate();

  if (!impersonatingUser) return null;

  async function exit() {
    try {
      const { data } = await api.post('/auth/refresh');
      setAuth(data.user, data.accessToken);
      setImpersonating(null);
      navigate('/admin');
    } catch {
      setImpersonating(null);
      navigate('/');
    }
  }

  return (
    <div style={bannerStyle}>
      Viewing as <strong>{impersonatingUser.displayName}</strong> ({impersonatingUser.email})
      <button onClick={exit} style={exitBtnStyle}>Exit</button>
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
  background: '#7c3aed', color: '#fff', padding: '8px 16px',
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
};

const exitBtnStyle: React.CSSProperties = {
  marginLeft: 'auto', padding: '4px 12px', background: 'rgba(255,255,255,0.2)',
  border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff',
  fontWeight: 600, cursor: 'pointer', fontSize: 13,
};

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    async function init() {
      // 1. Try cookie-based refresh (works on Chrome/Firefox; blocked by Safari ITP cross-domain)
      try {
        const { data } = await api.post('/auth/refresh');
        setAuth(data.user, data.accessToken);
        return;
      } catch {}

      // 2. Fallback: use stored invite token for join-link users whose cookie is blocked
      const recoveryToken = localStorage.getItem('draftmate:recovery-token');
      if (recoveryToken) {
        try {
          const { data } = await api.post(`/auth/invite/magic/${recoveryToken}`);
          setAuth(data.user, data.accessToken);
          return;
        } catch {
          localStorage.removeItem('draftmate:recovery-token');
        }
      }
    }
    init().finally(() => setInitializing(false));
  }, [setAuth]);

  if (initializing) return null;

  return (
    <BrowserRouter>
      <ImpersonationBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/join/:code" element={<JoinDraft />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/leagues/:id/setup" element={<PrivateRoute><LeagueSetup /></PrivateRoute>} />
        <Route path="/draft/:draftId" element={<PrivateRoute><DraftRoom /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
