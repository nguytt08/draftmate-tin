import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Login failed');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>DraftMate</h1>
        <p style={{ marginTop: -16, marginBottom: 8, fontSize: 13, color: '#888' }}>by Tin</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Sign In</button>
        </form>
        <p style={styles.link}>No account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 },
  card: { background: '#fff', padding: 32, borderRadius: 8, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  title: { marginBottom: 24, fontSize: 24, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 14, fontWeight: 500 },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 16 },
  button: { padding: '10px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 16, fontWeight: 600 },
  error: { color: '#dc2626', fontSize: 14 },
  link: { marginTop: 16, textAlign: 'center', fontSize: 14 },
};
