import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function joinMagic() {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/invite/magic/${token}`, { displayName: displayName.trim() || undefined });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Failed to join draft');
    } finally {
      setLoading(false);
    }
  }

  async function joinWithPassword() {
    if (!displayName.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/invite/accept/${token}`, { displayName: displayName.trim(), password });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Failed to join draft');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>You're invited!</h1>
        <p style={styles.subtitle}>Enter your name to join the draft instantly.</p>

        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input
            style={styles.input}
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') joinMagic(); }}
            autoFocus
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.primaryBtn} onClick={joinMagic} disabled={loading}>
          {loading ? 'Joining…' : 'Join Draft →'}
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerText}>or</span>
        </div>

        {!showPasswordForm ? (
          <button style={styles.ghostBtn} onClick={() => setShowPasswordForm(true)}>
            Create an account with a password
          </button>
        ) : (
          <div style={styles.passwordSection}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
            <button style={styles.secondaryBtn} onClick={joinWithPassword} disabled={loading}>
              {loading ? 'Joining…' : 'Join with Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f5', padding: 16 },
  card: { background: '#fff', padding: 32, borderRadius: 8, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  title: { marginBottom: 4, fontSize: 24, fontWeight: 700 },
  subtitle: { marginBottom: 20, color: '#6b7280', fontSize: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 15 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
  primaryBtn: { width: '100%', padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  divider: { display: 'flex', alignItems: 'center', margin: '20px 0', gap: 8 },
  dividerText: { color: '#9ca3af', fontSize: 13, whiteSpace: 'nowrap', padding: '0 8px', borderTop: 'none', flex: 'none', position: 'relative' },
  ghostBtn: { width: '100%', padding: '9px 0', background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, color: '#374151', cursor: 'pointer' },
  passwordSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  secondaryBtn: { padding: '9px 0', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};
