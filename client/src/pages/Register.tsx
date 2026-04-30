import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '' });
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/register', form);
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Registration failed');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create Account</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Display Name</label>
          <input style={styles.input} value={form.displayName} onChange={(e) => update('displayName', e.target.value)} required />
          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} />
          <label style={styles.label}>Phone (optional, for SMS notifications)</label>
          <input style={styles.input} type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+15551234567" />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">Register</button>
        </form>
        <p style={styles.link}>Already have an account? <Link to="/login">Sign in</Link></p>
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
