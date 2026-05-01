import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

const BUCKET_PALETTE = [
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#fef9c3', text: '#854d0e' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#ffedd5', text: '#c2410c' },
];

function bucketColor(bucket: string, allBuckets: string[]) {
  const idx = allBuckets.indexOf(bucket);
  return BUCKET_PALETTE[idx % BUCKET_PALETTE.length];
}

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

type Item = { id: string; name: string; bucket?: string | null; isAvailable: boolean; commissionerNotes?: string | null };

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
    format: 'SNAKE', totalRounds: 3, pickTimerSeconds: 7200, autoPick: 'RANDOM',
    enforceBucketPicking: false,
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Tracks the last values confirmed saved to (or loaded from) the server
  const serverSettingsRef = useRef<typeof settingsForm | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [bulkItems, setBulkItems] = useState('');
  const [bulkBucket, setBulkBucket] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemBucket, setNewItemBucket] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverBucket, setDragOverBucket] = useState<string | null>(null);

  useEffect(() => {
    if (league?.settings) {
      const s = {
        format: league.settings.format,
        totalRounds: league.settings.totalRounds,
        pickTimerSeconds: league.settings.pickTimerSeconds,
        autoPick: league.settings.autoPick,
        enforceBucketPicking: league.settings.enforceBucketPicking ?? false,
      };
      serverSettingsRef.current = s;
      setSettingsForm(s);
    }
  }, [league?.settings]);

  useEffect(() => {
    if (!serverSettingsRef.current || !id) return;
    // Skip if form matches server — happens on hydration and after saves
    if (JSON.stringify(settingsForm) === JSON.stringify(serverSettingsRef.current)) return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await api.put(`/leagues/${id}/settings`, {
          ...settingsForm,
          totalRounds: Number(settingsForm.totalRounds),
          pickTimerSeconds: Number(settingsForm.pickTimerSeconds),
        });
        serverSettingsRef.current = { ...settingsForm };
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [settingsForm, id]);

  const { data: items = [] } = useQuery<Item[]>({
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
    mutationFn: () => api.post(`/leagues/${id}/members/invite`, {
      email: inviteEmail || undefined,
      displayName: inviteDisplayName || undefined,
      notifyPhone: invitePhone || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', id] });
      setInviteEmail('');
      setInviteDisplayName('');
      setInvitePhone('');
    },
  });

  const randomizeOrder = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/members/randomize-order`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', id] }),
  });

  const revokeMember = useMutation({
    mutationFn: (memberId: string) => api.post(`/leagues/${id}/members/${memberId}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', id] }),
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/items`, { name: newItemName, bucket: newItemBucket || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items', id] }); setNewItemName(''); },
  });

  const bulkAdd = useMutation({
    mutationFn: () => {
      const names = bulkItems.split('\n').map((s) => s.trim()).filter(Boolean);
      return api.post(`/leagues/${id}/items/bulk`, {
        items: names.map((name) => ({ name, bucket: bulkBucket || undefined })),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items', id] }); setBulkItems(''); },
  });

  const startDraft = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/draft/start`),
    onSuccess: (res) => navigate(`/draft/${res.data.id}`),
    onError: (err: any) => setStartError(err?.response?.data?.error ?? 'Failed to start draft'),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, bucket }: { itemId: string; bucket: string | null }) =>
      api.patch(`/leagues/${id}/items/${itemId}`, { bucket }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items', id] }),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/leagues/${id}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items', id] }),
  });

  const isCommissioner = user?.id === league?.commissionerId;

  const acceptedMembers = (league?.members ?? []).filter((m: any) => m.inviteStatus === 'ACCEPTED');
  const suggestedRounds = acceptedMembers.length > 0 && items.length > 0
    ? Math.floor(items.length / acceptedMembers.length)
    : null;

  // Group items by bucket for display
  const bucketed = items.reduce<Record<string, Item[]>>((acc, item) => {
    const key = item.bucket ?? '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const namedBuckets = Object.keys(bucketed).filter(Boolean).sort();
  const unbucketed = bucketed[''] ?? [];
  const allBucketNames = namedBuckets; // for color mapping

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>{league?.name ?? 'League Setup'}</h1>
        {league?.draft?.status === 'ACTIVE' || league?.draft?.status === 'PAUSED' ? (
          <button style={styles.startBtn} onClick={() => navigate(`/draft/${league.draft.id}`)}>
            Go to Draft →
          </button>
        ) : isCommissioner ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {startError && (
              <span style={{ fontSize: 13, color: '#dc2626', maxWidth: 300 }}>{startError}</span>
            )}
            <button style={styles.startBtn} onClick={() => { setStartError(null); startDraft.mutate(); }}
              disabled={startDraft.isPending}>
              {startDraft.isPending ? 'Starting…' : 'Start Draft'}
            </button>
          </div>
        ) : null}
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...styles.input, flex: 1 }} type="number" min={1} max={50} value={settingsForm.totalRounds}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, totalRounds: Number(e.target.value) }))} />
                  {suggestedRounds && suggestedRounds !== settingsForm.totalRounds && (
                    <button
                      onClick={() => setSettingsForm((f) => ({ ...f, totalRounds: suggestedRounds! }))}
                      style={{ padding: '4px 8px', fontSize: 12, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 4, whiteSpace: 'nowrap' }}
                    >
                      Use {suggestedRounds} (items ÷ members)
                    </button>
                  )}
                </div>
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
              <div style={styles.fieldGroup}>
                <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.enforceBucketPicking}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, enforceBucketPicking: e.target.checked }))}
                  />
                  Enforce bucket picking
                </label>
                {settingsForm.enforceBucketPicking && (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Each drafter may pick at most one person per bucket.
                  </span>
                )}
              </div>
              <button
                style={styles.primaryBtn}
                onClick={() => saveSettings.mutate()}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Save Settings'}
              </button>
            </section>
          )}

          {/* Members */}
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Members ({league?.members?.length ?? 0})</h2>
            {isCommissioner && (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Name" value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)} />
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Email (optional)" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Phone (optional)" value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)} />
                  <button style={styles.primaryBtn} onClick={() => inviteMember.mutate()}>Invite</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button style={styles.ghostBtn} onClick={() => randomizeOrder.mutate()}>
                Randomize Draft Order
              </button>
              {isCommissioner && (
                <button
                  style={styles.ghostBtn}
                  onClick={async () => {
                    const { data } = await api.post(`/leagues/${id}/join-code`);
                    const link = `${window.location.origin}/join/${data.joinCode}`;
                    navigator.clipboard.writeText(link);
                    qc.invalidateQueries({ queryKey: ['league', id] });
                  }}
                >
                  {league?.joinCode ? 'Copy Join Link' : 'Generate & Copy Join Link'}
                </button>
              )}
            </div>
            {isCommissioner && league?.joinCode && (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                Join link: <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>{window.location.origin}/join/{league.joinCode}</code>
              </div>
            )}
            <ul style={{ listStyle: 'none' }}>
              {(league?.members ?? []).map((m: { id: string; inviteEmail: string | null; displayName?: string | null; inviteStatus: string; draftPosition: number | null; user?: { displayName: string } }) => (
                <li key={m.id} style={styles.memberRow}>
                  <span style={styles.position}>{m.draftPosition ?? '—'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{m.user?.displayName ?? m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member')}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{m.inviteEmail ?? 'No email'} · {m.inviteStatus}</div>
                  </div>
                  {isCommissioner && m.inviteStatus === 'ACCEPTED' && (
                    <button
                      title="Revoke claim — resets this slot to claimable so someone else can join"
                      onClick={() => { if (confirm('Revoke this member\'s claim? They will be signed out and the slot becomes claimable again.')) revokeMember.mutate(m.id); }}
                      style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 11, padding: '2px 7px', cursor: 'pointer', color: '#dc2626', flexShrink: 0 }}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Item Pool — add controls only; item display is in the full-width section below */}
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Item Pool ({items.length})</h2>
            {isCommissioner && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input style={{ ...styles.input, flex: 2 }} placeholder="Item name" value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem.mutate()} />
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Bucket (e.g. UPPER)" value={newItemBucket}
                    onChange={(e) => setNewItemBucket(e.target.value)}
                    list="bucket-suggestions" />
                  <datalist id="bucket-suggestions">
                    {namedBuckets.map((b) => <option key={b} value={b} />)}
                  </datalist>
                  <button style={styles.primaryBtn} onClick={() => addItem.mutate()}>Add</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <input style={{ ...styles.input, flex: 1 }} placeholder="Bucket for this batch (optional)" value={bulkBucket}
                      onChange={(e) => setBulkBucket(e.target.value)}
                      list="bucket-suggestions" />
                  </div>
                  <textarea
                    style={{ ...styles.input, height: 100, resize: 'vertical', width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
                    placeholder={"Bulk add — one item per line\nItem A\nItem B\nItem C"}
                    value={bulkItems}
                    onChange={(e) => setBulkItems(e.target.value)}
                  />
                  <button style={styles.ghostBtn} onClick={() => bulkAdd.mutate()}>Bulk Add</button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Full-width item display below the top row */}
        {items.length > 0 && (
          <section style={{ ...styles.card, marginTop: 16 }}>
            {/* Bucketed display */}
            {namedBuckets.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(namedBuckets.length + 1, 4)}, 1fr)`, gap: 12, marginTop: 12 }}>
                {namedBuckets.map((bucket) => {
                  const color = bucketColor(bucket, allBucketNames);
                  const isOver = dragOverBucket === bucket;
                  return (
                    <div
                      key={bucket}
                      onDragOver={isCommissioner ? (e) => { e.preventDefault(); setDragOverBucket(bucket); } : undefined}
                      onDragLeave={isCommissioner ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverBucket(null); } : undefined}
                      onDrop={isCommissioner ? (e) => { e.preventDefault(); if (draggedItemId) { const item = items.find((it) => it.id === draggedItemId); if ((item?.bucket ?? null) !== bucket) moveItem.mutate({ itemId: draggedItemId, bucket }); } setDraggedItemId(null); setDragOverBucket(null); } : undefined}
                      style={{ borderRadius: 6, border: isOver ? '2px dashed #2563eb' : '2px dashed transparent', padding: 6, transition: 'border-color 0.15s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ background: color.bg, color: color.text, fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999 }}>
                          {bucket}
                        </span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{bucketed[bucket].length}</span>
                      </div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {bucketed[bucket].map((item) => (
                          <li
                            key={item.id}
                            draggable={isCommissioner}
                            onDragStart={isCommissioner ? () => setDraggedItemId(item.id) : undefined}
                            onDragEnd={isCommissioner ? () => { setDraggedItemId(null); setDragOverBucket(null); } : undefined}
                            style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0', opacity: draggedItemId === item.id ? 0.4 : 1, cursor: isCommissioner ? 'grab' : 'default' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                              {isCommissioner && (
                                <button onClick={() => deleteItem.mutate(item.id)} title="Remove item"
                                  style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>
                                  ✕
                                </button>
                              )}
                            </div>
                            {isCommissioner && <CommissionerNoteInline leagueId={id!} item={item} />}
                            {!isCommissioner && item.commissionerNotes && (
                              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.commissionerNotes}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {/* No bucket column — always shown so items can be dragged here to clear their bucket */}
                <div
                  onDragOver={isCommissioner ? (e) => { e.preventDefault(); setDragOverBucket(''); } : undefined}
                  onDragLeave={isCommissioner ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverBucket(null); } : undefined}
                  onDrop={isCommissioner ? (e) => { e.preventDefault(); if (draggedItemId) { const item = items.find((it) => it.id === draggedItemId); if ((item?.bucket ?? null) !== null) moveItem.mutate({ itemId: draggedItemId, bucket: null }); } setDraggedItemId(null); setDragOverBucket(null); } : undefined}
                  style={{
                    borderRadius: 6,
                    border: dragOverBucket === '' ? '2px dashed #6b7280' : (draggedItemId && items.find(it => it.id === draggedItemId)?.bucket ? '2px dashed #d1d5db' : '2px dashed transparent'),
                    padding: 6,
                    transition: 'border-color 0.15s',
                    minHeight: 80,
                    background: dragOverBucket === '' ? '#f9fafb' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ background: '#f3f4f6', color: '#6b7280', fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999 }}>
                      No bucket
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{unbucketed.length}</span>
                  </div>
                  {unbucketed.length === 0 && draggedItemId && items.find(it => it.id === draggedItemId)?.bucket && (
                    <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0', pointerEvents: 'none' }}>
                      Drop here to remove bucket
                    </div>
                  )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {unbucketed.map((item) => (
                      <li
                        key={item.id}
                        draggable={isCommissioner}
                        onDragStart={isCommissioner ? () => setDraggedItemId(item.id) : undefined}
                        onDragEnd={isCommissioner ? () => { setDraggedItemId(null); setDragOverBucket(null); } : undefined}
                        style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0', opacity: draggedItemId === item.id ? 0.4 : 1, cursor: isCommissioner ? 'grab' : 'default' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                          {isCommissioner && (
                            <button onClick={() => deleteItem.mutate(item.id)} title="Remove item"
                              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>
                              ✕
                            </button>
                          )}
                        </div>
                        {isCommissioner && <CommissionerNoteInline leagueId={id!} item={item} />}
                        {!isCommissioner && item.commissionerNotes && (
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.commissionerNotes}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                {items.map((item) => (
                  <li key={item.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                      {isCommissioner && (
                        <button onClick={() => deleteItem.mutate(item.id)} title="Remove item"
                          style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>
                          ✕
                        </button>
                      )}
                    </div>
                    {isCommissioner && <CommissionerNoteInline leagueId={id!} item={item} />}
                    {!isCommissioner && item.commissionerNotes && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.commissionerNotes}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
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
  main: { maxWidth: 1200, margin: '0 auto', padding: '24px 16px' },
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
