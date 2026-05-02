import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  _count: { leagues: number; memberships: number };
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { setAuth, setImpersonating } = useAuthStore();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/auth/admin/users').then((r) => r.data.users),
  });

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  async function viewAs(user: AdminUser) {
    setImpersonatingId(user.id);
    try {
      const { data } = await api.post(`/auth/admin/impersonate/${user.id}`);
      setImpersonating({ id: user.id, email: user.email, displayName: user.displayName });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } finally {
      setImpersonatingId(null);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>Admin Panel</h1>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Dashboard</button>
      </header>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <h2 style={{ margin: 0 }}>All Users</h2>
          <input
            style={styles.search}
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <p style={{ color: '#888', marginTop: 24 }}>Loading…</p>}

        {!isLoading && filtered.length === 0 && (
          <p style={{ color: '#888', marginTop: 24 }}>No users found.</p>
        )}

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Leagues</th>
              <th style={styles.th}>Memberships</th>
              <th style={styles.th}>Joined</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} style={styles.row}>
                <td style={styles.td}>{u.displayName}</td>
                <td style={{ ...styles.td, color: '#555', fontSize: 13 }}>{u.email}</td>
                <td style={{ ...styles.td, textAlign: 'center' }}>{u._count.leagues}</td>
                <td style={{ ...styles.td, textAlign: 'center' }}>{u._count.memberships}</td>
                <td style={{ ...styles.td, color: '#888', fontSize: 13 }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td style={styles.td}>
                  <button
                    style={styles.viewBtn}
                    disabled={impersonatingId === u.id}
                    onClick={() => viewAs(u)}
                  >
                    {impersonatingId === u.id ? '…' : 'View as'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5' },
  header: {
    background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '12px 24px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  logo: { fontSize: 20, fontWeight: 700, margin: 0 },
  main: { maxWidth: 1000, margin: '0 auto', padding: '24px 16px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16 },
  search: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, width: 280 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  row: { transition: 'background 0.1s' },
  backBtn: { padding: '6px 12px', background: 'transparent', color: '#555', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, cursor: 'pointer' },
  viewBtn: { padding: '5px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
};
