import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

type Member = { id: string; displayName: string | null; inviteEmail: string | null };
type LeagueInfo = { id: string; name: string; members: Member[] };

export default function JoinDraft() {
  const { code } = useParams<{ code: string }>();
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const { data: league, isLoading, isError } = useQuery<LeagueInfo>({
    queryKey: ['join', code],
    queryFn: () => api.get(`/leagues/join/${code}`).then((r) => r.data),
    retry: false,
  });

  function selectMember(m: Member) {
    setSelectedMember(m);
    setDisplayName(m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : ''));
    setError('');
  }

  async function claim() {
    if (!selectedMember) return;
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/join/${code}/claim`, {
        memberId: selectedMember.id,
        displayName: displayName.trim() || undefined,
      });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Failed to join draft');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <div style={styles.center}>Loading…</div>;
  if (isError) return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h2 style={{ marginBottom: 8 }}>Link not found</h2>
        <p style={{ color: '#6b7280' }}>This join link may have expired or been revoked.</p>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Join "{league!.name}"</h1>

        {league!.members.length === 0 ? (
          <p style={{ color: '#6b7280', marginTop: 8 }}>All spots have been claimed.</p>
        ) : (
          <>
            <p style={styles.subtitle}>Who are you?</p>
            <ul style={styles.memberList}>
              {league!.members.map((m) => (
                <li
                  key={m.id}
                  style={{
                    ...styles.memberItem,
                    ...(selectedMember?.id === m.id ? styles.memberItemSelected : {}),
                  }}
                  onClick={() => selectMember(m)}
                >
                  {m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member')}
                </li>
              ))}
            </ul>

            {selectedMember && (
              <div style={styles.confirmSection}>
                <label style={styles.label}>Your name</label>
                <input
                  style={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') claim(); }}
                  autoFocus
                />
                {error && <p style={styles.error}>{error}</p>}
                <button style={styles.primaryBtn} onClick={claim} disabled={loading}>
                  {loading ? 'Joining…' : `Join as ${displayName || selectedMember.displayName || 'Drafter'} →`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f5f5', padding: 16 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  card: { background: '#fff', padding: 32, borderRadius: 8, width: '100%', maxWidth: 420, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { color: '#6b7280', fontSize: 14, marginBottom: 12 },
  memberList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 },
  memberItem: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 500, transition: 'all 0.1s' },
  memberItemSelected: { border: '2px solid #2563eb', background: '#eff6ff', color: '#1d4ed8' },
  confirmSection: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 16 },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 15 },
  error: { color: '#dc2626', fontSize: 13 },
  primaryBtn: { padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
