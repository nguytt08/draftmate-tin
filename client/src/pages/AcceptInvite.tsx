import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState({ displayName: '', password: '' });
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post(`/auth/invite/accept/${token}`, form);
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Failed to accept invite');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Accept Invite</h1>
        <p style={{ marginBottom: 16, color: '#555' }}>Set up your account to join the draft.</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Display Name</label>
          <input style={styles.input} value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Join Draft</button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 },
  card: { background: '#fff', padding: 32, borderRadius: 8, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  title: { marginBottom: 8, fontSize: 24, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 14, fontWeight: 500 },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 16 },
  button: { padding: '10px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 16, fontWeight: 600 },
  error: { color: '#dc2626', fontSize: 14 },
};
