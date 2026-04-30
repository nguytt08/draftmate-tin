import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

// Inline editable commissioner note per item in the setup pool
function CommissionerNoteInline({ leagueId, item }: { leagueId: string; item: { id: string; commissionerNotes?: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.commissionerNotes ?? '');
  const qc = useQueryClient();

  async function save() {
    await api.patch(`/leagues/${leagueId}/items/${item.id}`, { commissionerNotes: note });
    qc.invalidateQueries({ queryKey: ['items', leagueId] });
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input
          autoFocus
          style={{ flex: 1, padding: '3px 6px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 12 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Commissioner note (visible to all drafters)"
        />
        <button onClick={save} style={{ padding: '2px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12 }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ padding: '2px 6px', background: 'none', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}>✕</button>
      </div>
    );
  }

  return (
    <div
      style={{ fontSize: 12, color: note ? '#4b5563' : '#9ca3af', marginTop: 2, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      title="Click to edit commissioner note"
    >
      {note || '+ Add commissioner note'}
    </div>
  );
}

export default function LeagueSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: league } = useQuery({
    queryKey: ['league', id],
    queryFn: () => api.get(`/leagues/${id}`).then((r) => r.data),
  });

  const [settingsForm, setSettingsForm] = useState({
    format: 'SNAKE', totalRounds: 15, pickTimerSeconds: 43200, autoPick: 'RANDOM',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [bulkItems, setBulkItems] = useState('');
  const [newItemName, setNewItemName] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: ['items', id],
    queryFn: () => api.get(`/leagues/${id}/items`).then((r) => r.data),
  });

  const saveSettings = useMutation({
    mutationFn: () => api.put(`/leagues/${id}/settings`, {
      ...settingsForm,
      totalRounds: Number(settingsForm.totalRounds),
      pickTimerSeconds: Number(settingsForm.pickTimerSeconds),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', id] }),
  });

  const inviteMember = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/members/invite`, { email: inviteEmail, notifyPhone: invitePhone || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league', id] }); setInviteEmail(''); setInvitePhone(''); },
  });

  const randomizeOrder = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/members/randomize-order`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', id] }),
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/items`, { name: newItemName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items', id] }); setNewItemName(''); },
  });

  const bulkAdd = useMutation({
    mutationFn: () => {
      const names = bulkItems.split('\n').map((s) => s.trim()).filter(Boolean);
      return api.post(`/leagues/${id}/items/bulk`, { items: names.map((name) => ({ name })) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items', id] }); setBulkItems(''); },
  });

  const startDraft = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/draft/start`),
    onSuccess: (res) => navigate(`/draft/${res.data.id}`),
  });

  const isCommissioner = user?.id === league?.commissionerId;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>{league?.name ?? 'League Setup'}</h1>
        {isCommissioner && (
          <button style={styles.startBtn} onClick={() => startDraft.mutate()}>Start Draft</button>
        )}
      </header>

      <main style={styles.main}>
        <div style={styles.grid}>
          {/* Settings */}
          {isCommissioner && (
            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Draft Settings</h2>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Format</label>
                <select style={styles.input} value={settingsForm.format} onChange={(e) => setSettingsForm((f) => ({ ...f, format: e.target.value }))}>
                  <option value="SNAKE">Snake</option>
                  <option value="LINEAR">Linear</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Rounds</label>
                <input style={styles.input} type="number" min={1} max={50} value={settingsForm.totalRounds}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, totalRounds: Number(e.target.value) }))} />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Pick Timer (seconds)</label>
                <input style={styles.input} type="number" min={60} value={settingsForm.pickTimerSeconds}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, pickTimerSeconds: Number(e.target.value) }))} />
                <span style={{ fontSize: 12, color: '#888' }}>
                  {Math.round(settingsForm.pickTimerSeconds / 3600)}h per pick
                </span>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Auto-Pick on Timer</label>
                <select style={styles.input} value={settingsForm.autoPick} onChange={(e) => setSettingsForm((f) => ({ ...f, autoPick: e.target.value }))}>
                  <option value="RANDOM">Random available item</option>
                  <option value="SKIP">Skip pick</option>
                </select>
              </div>
              <button style={styles.primaryBtn} onClick={() => saveSettings.mutate()}>Save Settings</button>
            </section>
          )}

          {/* Members */}
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Members ({league?.members?.length ?? 0})</h2>
            {isCommissioner && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Email to invite" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)} />
                  <button style={styles.primaryBtn} onClick={() => inviteMember.mutate()}>Invite</button>
                </div>
                <input style={styles.input} placeholder="Phone (optional)" value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)} />
              </div>
            )}
            <button style={{ ...styles.ghostBtn, marginBottom: 12 }} onClick={() => randomizeOrder.mutate()}>
              Randomize Draft Order
            </button>
            <ul style={{ listStyle: 'none' }}>
              {(league?.members ?? []).map((m: { id: string; inviteEmail: string; inviteStatus: string; draftPosition: number | null; user?: { displayName: string } }) => (
                <li key={m.id} style={styles.memberRow}>
                  <span style={styles.position}>{m.draftPosition ?? '—'}</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.user?.displayName ?? m.inviteEmail}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{m.inviteStatus}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Item Pool */}
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Item Pool ({items.length})</h2>
            {isCommissioner && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Item name" value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem.mutate()} />
                  <button style={styles.primaryBtn} onClick={() => addItem.mutate()}>Add</button>
                </div>
                <textarea
                  style={{ ...styles.input, height: 120, resize: 'vertical', width: '100%', marginBottom: 8 }}
                  placeholder={"Bulk add — one item per line\nItem A\nItem B\nItem C"}
                  value={bulkItems}
                  onChange={(e) => setBulkItems(e.target.value)}
                />
                <button style={styles.ghostBtn} onClick={() => bulkAdd.mutate()}>Bulk Add</button>
              </>
            )}
            <ul style={{ listStyle: 'none', marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
              {items.map((item: { id: string; name: string; isAvailable: boolean; commissionerNotes?: string | null }) => (
                <li key={item.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                  {isCommissioner && (
                    <CommissionerNoteInline leagueId={id!} item={item} />
                  )}
                  {!isCommissioner && item.commissionerNotes && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.commissionerNotes}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5' },
  header: { background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  backBtn: { background: 'none', border: 'none', fontSize: 14, color: '#2563eb', fontWeight: 500 },
  title: { flex: 1, fontSize: 20, fontWeight: 700 },
  startBtn: { padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700 },
  main: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  card: { background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  fieldGroup: { marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: '#444' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 },
  primaryBtn: { padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 14 },
  ghostBtn: { padding: '8px 16px', background: 'transparent', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4, fontWeight: 600, fontSize: 14 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
  position: { width: 24, height: 24, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
};
