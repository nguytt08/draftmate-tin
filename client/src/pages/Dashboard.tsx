import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface League {
  id: string;
  name: string;
  description?: string;
  commissionerId: string;
  draft?: { id: string; status: string; currentMemberId: string | null } | null;
  members?: { id: string }[];
  _count?: { members: number; items: number };
}

export default function Dashboard() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newLeagueName, setNewLeagueName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: leagues = [] } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => api.get('/leagues').then((r) => r.data),
  });

  const createLeague = useMutation({
    mutationFn: (name: string) => api.post('/leagues', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leagues'] }); setCreating(false); setNewLeagueName(''); },
  });

  const deleteLeague = useMutation({
    mutationFn: (leagueId: string) => api.delete(`/leagues/${leagueId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  });

  async function logout() {
    await api.post('/auth/logout');
    localStorage.removeItem('draftmate:recovery-token');
    clearAuth();
    navigate('/login');
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>DraftMate <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>by Tin</span></h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#555' }}>{user?.displayName}</span>
          <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <h2>My Leagues</h2>
          <button onClick={() => setCreating(true)} style={styles.primaryBtn}>+ New League</button>
        </div>

        {creating && (
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Create League</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={styles.input}
                placeholder="League name"
                value={newLeagueName}
                onChange={(e) => setNewLeagueName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createLeague.mutate(newLeagueName)}
              />
              <button style={styles.primaryBtn} onClick={() => createLeague.mutate(newLeagueName)}>Create</button>
              <button style={styles.ghostBtn} onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        )}

        {leagues.length === 0 && !creating && (
          <p style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No leagues yet — create one to get started.</p>
        )}

        <div style={styles.grid}>
          {leagues.map((league) => {
            const isCommissioner = league.commissionerId === user?.id;
            const myMemberId = league.members?.[0]?.id;
            const draftActive = league.draft?.status === 'ACTIVE';
            const draftPaused = league.draft?.status === 'PAUSED';
            const draftComplete = league.draft?.status === 'COMPLETED';
            const isMyTurn = draftActive && myMemberId && league.draft?.currentMemberId === myMemberId;

            return (
              <div key={league.id} style={{ ...styles.leagueCard, ...(isMyTurn ? styles.leagueCardActive : {}), position: 'relative' }}>
                {isCommissioner && (
                  <button
                    style={styles.deleteBtn}
                    title="Delete league"
                    onClick={() => {
                      if (confirm(`Delete "${league.name}"? This cannot be undone.`)) {
                        deleteLeague.mutate(league.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                )}
                <h3 style={{ margin: '0 0 6px' }}>{league.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
                    {league._count?.members ?? 0} members · {league._count?.items ?? 0} items
                  </p>
                  {league.draft && (
                    <span style={{ ...styles.badge, ...(draftActive ? styles.badgeGreen : draftPaused ? styles.badgeYellow : styles.badgeGray) }}>
                      {league.draft.status}
                    </span>
                  )}
                </div>
                {isMyTurn && (
                  <p style={{ color: '#15803d', fontSize: 13, fontWeight: 600, margin: '6px 0 0' }}>Your turn to pick!</p>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(draftActive || draftPaused) && (
                    <button style={isMyTurn ? styles.turnBtn : styles.primaryBtn} onClick={() => navigate(`/draft/${league.draft!.id}`)}>
                      {isMyTurn ? 'Pick Now →' : 'Go to Draft →'}
                    </button>
                  )}
                  {draftComplete && (
                    <button style={styles.primaryBtn} onClick={() => navigate(`/draft/${league.draft!.id}`)}>
                      View Results →
                    </button>
                  )}
                  {isCommissioner && (
                    <button style={(draftActive || draftPaused || draftComplete) ? styles.ghostBtn : styles.primaryBtn} onClick={() => navigate(`/leagues/${league.id}/setup`)}>
                      {(draftActive || draftPaused || draftComplete) ? 'Manage' : 'Set Up Draft'}
                    </button>
                  )}
                  {!draftActive && !draftPaused && !draftComplete && !isCommissioner && (
                    <span style={{ fontSize: 13, color: '#9ca3af', alignSelf: 'center' }}>Waiting for commissioner to start</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5' },
  header: { background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 20, fontWeight: 700 },
  main: { maxWidth: 900, margin: '0 auto', padding: '24px 16px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 8 },
  leagueCard: { background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  input: { flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 16 },
  primaryBtn: { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 14 },
  ghostBtn: { padding: '8px 16px', background: 'transparent', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4, fontWeight: 600, fontSize: 14 },
  logoutBtn: { padding: '6px 12px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 4, fontSize: 14 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
  badgeGreen: { background: '#dcfce7', color: '#15803d' },
  badgeYellow: { background: '#fef9c3', color: '#854d0e' },
  badgeGray: { background: '#f3f4f6', color: '#6b7280' },
  leagueCardActive: { borderLeft: '3px solid #16a34a' },
  turnBtn: { padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 14 },
  deleteBtn: { position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', borderRadius: 4 },
};
