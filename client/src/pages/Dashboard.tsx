import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';

interface League {
  id: string;
  name: string;
  description?: string;
  commissionerId: string;
  createdAt: string;
  draft?: { id: string; status: string; currentMemberId: string | null; commissionerPickRequired: boolean } | null;
  members?: { id: string }[];
  _count?: { members: number; items: number };
}

export default function Dashboard() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [newLeagueName, setNewLeagueName] = useState('');
  const [creating, setCreating] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneExpanded, setCloneExpanded] = useState(false);
  const [clonePage, setClonePage] = useState(1);

  const { data: leagues = [] } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => api.get('/leagues').then((r) => r.data),
  });

  const createLeague = useMutation({
    mutationFn: (name: string) => api.post('/leagues', { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leagues'] }); cancelCreating(); },
  });

  const cloneLeague = useMutation({
    mutationFn: ({ sourceId, name }: { sourceId: string; name: string }) =>
      api.post(`/leagues/${sourceId}/clone`, { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      cancelCreating();
      navigate(`/leagues/${res.data.id}/setup`);
    },
  });

  const deleteLeague = useMutation({
    mutationFn: (leagueId: string) => api.delete(`/leagues/${leagueId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  });

  function cancelCreating() {
    setCreating(false);
    setNewLeagueName('');
    setCloneSourceId(null);
    setCloneExpanded(false);
    setClonePage(1);
  }

  function handleSubmit() {
    if (!newLeagueName.trim()) return;
    if (cloneSourceId) {
      cloneLeague.mutate({ sourceId: cloneSourceId, name: newLeagueName });
    } else {
      createLeague.mutate(newLeagueName);
    }
  }

  const commissionerLeagues = leagues.filter((l) => l.commissionerId === user?.id);
  const CLONE_PAGE_SIZE = 10;
  const cloneTotal = Math.min(commissionerLeagues.length, 30);
  const cloneTotalPages = Math.ceil(cloneTotal / CLONE_PAGE_SIZE);
  const visibleCloneLeagues = cloneExpanded
    ? commissionerLeagues.slice((clonePage - 1) * CLONE_PAGE_SIZE, clonePage * CLONE_PAGE_SIZE)
    : commissionerLeagues.slice(0, 5);

  return (
    <div style={styles.page}>
      <header style={{ ...styles.header, padding: isMobile ? '10px 16px' : '12px 24px' }}>
        <h1 style={styles.logo}>DraftMate <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>by Tin</span></h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          <span style={{ fontSize: 14, color: '#555' }}>{user?.displayName}</span>
          {user?.isAdmin && (
            <button onClick={() => navigate('/admin')} style={styles.adminBtn}>Admin</button>
          )}
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
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoFocus
              />
              <button
                style={styles.primaryBtn}
                onClick={handleSubmit}
                disabled={createLeague.isPending || cloneLeague.isPending}
              >
                {cloneLeague.isPending ? 'Cloning…' : createLeague.isPending ? 'Creating…' : cloneSourceId ? 'Clone League' : 'Create'}
              </button>
              <button style={styles.ghostBtn} onClick={cancelCreating}>Cancel</button>
            </div>

            {commissionerLeagues.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Or clone an existing league:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {visibleCloneLeagues.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        border: `1px solid ${cloneSourceId === l.id ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: 6,
                        background: cloneSourceId === l.id ? '#eff6ff' : '#fff',
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</span>
                        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                          {l._count?.members ?? 0} members · {l._count?.items ?? 0} items · {new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <button
                        style={{ ...styles.ghostBtn, padding: '4px 10px', fontSize: 13 }}
                        onClick={() => {
                          if (cloneSourceId === l.id) {
                            setCloneSourceId(null);
                          } else {
                            setCloneSourceId(l.id);
                            setNewLeagueName(l.name);
                          }
                        }}
                      >
                        {cloneSourceId === l.id ? 'Deselect' : 'Clone'}
                      </button>
                    </div>
                  ))}
                </div>

                {!cloneExpanded && commissionerLeagues.length > 5 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1, borderTop: '1px dashed #d1d5db' }} />
                    <button
                      style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap' }}
                      onClick={() => { setCloneExpanded(true); setClonePage(1); }}
                    >
                      Show {Math.min(commissionerLeagues.length, 30) - 5} more ▾
                    </button>
                    <div style={{ flex: 1, borderTop: '1px dashed #d1d5db' }} />
                  </div>
                )}

                {cloneExpanded && cloneTotalPages > 1 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                    {Array.from({ length: cloneTotalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setClonePage(page)}
                        style={{
                          padding: '2px 8px',
                          fontSize: 13,
                          border: '1px solid',
                          borderRadius: 4,
                          cursor: 'pointer',
                          borderColor: clonePage === page ? '#2563eb' : '#d1d5db',
                          background: clonePage === page ? '#2563eb' : '#fff',
                          color: clonePage === page ? '#fff' : '#374151',
                          fontWeight: clonePage === page ? 600 : 400,
                        }}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                )}
                {cloneExpanded && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1, borderTop: '1px dashed #d1d5db' }} />
                    <button
                      style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap' }}
                      onClick={() => { setCloneExpanded(false); setClonePage(1); }}
                    >
                      Show less ▴
                    </button>
                    <div style={{ flex: 1, borderTop: '1px dashed #d1d5db' }} />
                  </div>
                )}
              </div>
            )}
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
                {isCommissioner && draftActive && league.draft?.commissionerPickRequired && (
                  <p style={{ color: '#92400e', fontSize: 13, fontWeight: 600, margin: '6px 0 0' }}>⏱ Pick needed — timer expired</p>
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

  async function logout() {
    await api.post('/auth/logout');
    localStorage.removeItem('draftmate:recovery-token');
    clearAuth();
    navigate('/login');
  }
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
  primaryBtn: { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  ghostBtn: { padding: '8px 16px', background: 'transparent', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  logoutBtn: { padding: '6px 12px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, cursor: 'pointer' },
  adminBtn: { padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
  badgeGreen: { background: '#dcfce7', color: '#15803d' },
  badgeYellow: { background: '#fef9c3', color: '#854d0e' },
  badgeGray: { background: '#f3f4f6', color: '#6b7280' },
  leagueCardActive: { borderLeft: '3px solid #16a34a' },
  turnBtn: { padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  deleteBtn: { position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', borderRadius: 4 },
};
