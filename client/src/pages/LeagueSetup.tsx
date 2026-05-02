import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';

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
  const isMobile = useIsMobile();
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
      <div style={{ marginTop: 4 }}>
        <input
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', padding: isMobile ? '6px 8px' : '3px 6px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 12 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Note..."
        />
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button onClick={save} style={{ flex: 1, padding: isMobile ? '8px' : '2px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ flex: 1, padding: isMobile ? '8px' : '2px 6px', background: 'none', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ fontSize: 12, color: note ? '#4b5563' : '#9ca3af', marginTop: 2, cursor: 'pointer', padding: isMobile ? '4px 0' : undefined }}
      onClick={() => setEditing(true)}
      title="Click to edit commissioner note"
    >
      {note || '+ Add commissioner note'}
    </div>
  );
}

type Item = { id: string; name: string; bucket?: string | null; isAvailable: boolean; commissionerNotes?: string | null };

export default function LeagueSetup() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: league } = useQuery({
    queryKey: ['league', id],
    queryFn: () => api.get(`/leagues/${id}`).then((r) => r.data),
  });

  const [settingsForm, setSettingsForm] = useState({
    format: 'SNAKE', totalRounds: 3, pickTimerSeconds: 7200, autoPick: 'COMMISSIONER_PICK',
    enforceBucketPicking: false, allowSelfReclaim: false,
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
  const [showJoinMenu, setShowJoinMenu] = useState(false);
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!showJoinMenu) return;
    const close = () => setShowJoinMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showJoinMenu]);

  useEffect(() => {
    if (!memberMenuId) return;
    const close = () => setMemberMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [memberMenuId]);

  useEffect(() => {
    if (league?.settings) {
      const s = {
        format: league.settings.format,
        totalRounds: league.settings.totalRounds,
        pickTimerSeconds: league.settings.pickTimerSeconds,
        autoPick: league.settings.autoPick,
        enforceBucketPicking: league.settings.enforceBucketPicking ?? false,
        allowSelfReclaim: league.settings.allowSelfReclaim ?? false,
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

  const deleteMember = useMutation({
    mutationFn: (memberId: string) => api.delete(`/leagues/${id}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['league', id] }),
  });

  const selfJoin = useMutation({
    mutationFn: () => api.post(`/leagues/${id}/members/self`),
    onSuccess: ({ data }) => {
      if (data.inviteToken) localStorage.setItem('draftmate:recovery-token', data.inviteToken);
      qc.invalidateQueries({ queryKey: ['league', id] });
    },
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
    mutationFn: (force?: boolean) => api.post(`/leagues/${id}/draft/start`, force ? { force: true } : {}),
    onSuccess: (res) => navigate(`/draft/${res.data.id}`),
    onError: (err: any) => setStartError(err?.response?.data?.error ?? 'Failed to start draft'),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, bucket }: { itemId: string; bucket: string | null }) =>
      api.patch(`/leagues/${id}/items/${itemId}`, { bucket }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items', id] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      try {
        return await api.delete(`/leagues/${id}/items/${itemId}`);
      } catch (err: any) {
        if (err?.response?.status === 409) {
          const confirmed = window.confirm(
            'This item has already been picked in the draft.\n\nForce-delete it? The draft board will show "(removed)" in its slot.',
          );
          if (confirmed) return api.delete(`/leagues/${id}/items/${itemId}?force=true`);
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items', id] }),
  });

  const isCommissioner = user?.id === league?.commissionerId;
  const alreadyMember = (league?.members ?? []).some((m: any) => m.user?.id === user?.id);

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
      <header style={{ ...styles.header, padding: isMobile ? '10px 16px' : '12px 24px' }}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Back</button>
        <h1 style={styles.title}>{league?.name ?? 'League Setup'}</h1>
        {league?.draft?.status === 'ACTIVE' || league?.draft?.status === 'PAUSED' ? (
          <button style={styles.startBtn} onClick={() => navigate(`/draft/${league.draft.id}`)}>
            Go to Draft →
          </button>
        ) : isCommissioner ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {startError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#dc2626', maxWidth: 300 }}>{startError}</span>
                {startError.startsWith('Need at least') && (
                  <button style={{ ...styles.startBtn, background: '#d97706', fontSize: 13, padding: '6px 12px', whiteSpace: 'nowrap' }}
                    onClick={() => { setStartError(null); startDraft.mutate(true); }}
                    disabled={startDraft.isPending}>
                    Start anyway
                  </button>
                )}
              </div>
            )}
            <button style={styles.startBtn} onClick={() => { setStartError(null); startDraft.mutate(undefined); }}
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
                {(() => {
                  const eligibleCount = (league?.members ?? []).filter((m: any) => m.inviteStatus !== 'DECLINED').length;
                  if (eligibleCount === 0) return null;
                  const picksNeeded = settingsForm.totalRounds * eligibleCount;
                  const ok = items.length >= picksNeeded;
                  return (
                    <div style={{ fontSize: 12, color: ok ? '#6b7280' : '#dc2626', marginTop: 4 }}>
                      {settingsForm.totalRounds} rounds × {eligibleCount} members = {picksNeeded} picks — {ok ? `${items.length} items ✓` : `need ${picksNeeded - items.length} more items`}
                    </div>
                  );
                })()}
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
                  <option value="COMMISSIONER_PICK">Commissioner must pick</option>
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
              <div style={styles.fieldGroup}>
                <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.allowSelfReclaim}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, allowSelfReclaim: e.target.checked }))}
                  />
                  Allow self-reclaim on join page
                </label>
                {settingsForm.allowSelfReclaim && (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Claimed members will appear on the join page and can re-authenticate without commissioner help.
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>Members ({league?.members?.length ?? 0})</h2>
              {isCommissioner && !alreadyMember && (
                <button style={{ ...styles.ghostBtn, padding: '4px 10px', fontSize: 12, flexShrink: 0 }} onClick={() => selfJoin.mutate()} disabled={selfJoin.isPending}>
                  + Join as drafter
                </button>
              )}
              {isCommissioner && (
                <button style={{ ...styles.primaryBtn, padding: '5px 12px', fontSize: 13, flexShrink: 0 }} onClick={() => inviteMember.mutate()}>
                  Invite
                </button>
              )}
            </div>
            {/* TODO: re-enable phone field when SMS notifications are implemented */}
            {isCommissioner && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input style={{ ...styles.input, flex: 1, minWidth: 0 }} placeholder="Name" value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') inviteMember.mutate(); }} />
                <input style={{ ...styles.input, flex: 1, minWidth: 0 }} placeholder="Email (optional)" value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') inviteMember.mutate(); }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ ...styles.ghostBtn, flex: 1 }} onClick={() => randomizeOrder.mutate()}>
                Randomize Draft Order
              </button>
              {isCommissioner && (
                <div style={{ position: 'relative', display: 'flex', flex: 1, gap: 0 }}>
                  <button
                    style={{ ...styles.ghostBtn, flex: 1 }}
                    onClick={async () => {
                      if (league?.joinCode) {
                        const link = `${window.location.origin}/join/${league.joinCode}`;
                        try { await navigator.clipboard.writeText(link); }
                        catch { prompt('Copy this join link:', link); }
                      } else {
                        try {
                          const { data } = await api.post(`/leagues/${id}/join-code`);
                          qc.invalidateQueries({ queryKey: ['league', id] });
                          const link = `${window.location.origin}/join/${data.joinCode}`;
                          try { await navigator.clipboard.writeText(link); }
                          catch { prompt('Copy this join link:', link); }
                        } catch (err: any) {
                          alert(err?.response?.data?.error ?? 'Failed to generate join link');
                        }
                      }
                    }}
                  >
                    {league?.joinCode ? 'Copy Join Link' : 'Generate Join Link'}
                  </button>
                  {league?.joinCode && (
                    <button
                      title="Join link options"
                      style={{ ...styles.ghostBtn, padding: '4px 10px', borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                      onClick={(e) => { e.stopPropagation(); setShowJoinMenu((m) => !m); }}
                    >
                      ⋯
                    </button>
                  )}
                  {showJoinMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 180 }}>
                      <button
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}
                        onClick={async () => {
                          if (confirm('Regenerate join link? The old link will stop working.')) {
                            const { data } = await api.post(`/leagues/${id}/join-code`);
                            await navigator.clipboard.writeText(`${window.location.origin}/join/${data.joinCode}`);
                            qc.invalidateQueries({ queryKey: ['league', id] });
                          }
                          setShowJoinMenu(false);
                        }}
                      >
                        Regenerate Join Link
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {isCommissioner && league?.joinCode && (
              <div style={{ marginBottom: 10 }}>
                <input
                  readOnly
                  value={`${window.location.origin}/join/${league.joinCode}`}
                  onFocus={(e) => e.target.select()}
                  style={{ ...styles.input, fontSize: 12, color: '#6b7280', width: '100%', cursor: 'text' }}
                />
              </div>
            )}
            <ul style={{ listStyle: 'none' }}>
              {(league?.members ?? []).map((m: { id: string; inviteEmail: string | null; displayName?: string | null; inviteStatus: string; draftPosition: number | null; user?: { id: string; displayName: string } }) => (
                <li key={m.id} style={styles.memberRow}>
                  <span style={styles.position}>{m.draftPosition ?? '—'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      {m.user?.displayName ?? m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member')}
                      {m.user?.id === user?.id && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6, fontWeight: 400 }}>(You)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{m.inviteEmail ?? 'No email'} · {m.inviteStatus}</div>
                  </div>
                  {isCommissioner && m.inviteStatus === 'ACCEPTED' && (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        title="Member options"
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, padding: '2px 7px', cursor: 'pointer', color: '#6b7280' }}
                        onClick={(e) => { e.stopPropagation(); setMemberMenuId((cur) => cur === m.id ? null : m.id); }}
                      >
                        ⋯
                      </button>
                      {memberMenuId === m.id && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 2, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 180 }}>
                          <button
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' }}
                            onClick={async () => {
                              setMemberMenuId(null);
                              try {
                                const { data } = await api.get(`/leagues/${id}/members/${m.id}/magic-link`);
                                const link = `${window.location.origin}/invite/${data.inviteToken}`;
                                try {
                                  await navigator.clipboard.writeText(link);
                                } catch {
                                  prompt('Copy this magic link:', link);
                                }
                              } catch (err: any) {
                                alert(err?.response?.data?.error ?? 'Could not get magic link');
                              }
                            }}
                          >
                            Copy Magic Link
                          </button>
                          <button
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#dc2626', borderTop: '1px solid #f3f4f6' }}
                            onClick={() => {
                              if (confirm('Revoke this member\'s claim? The slot becomes claimable again.')) revokeMember.mutate(m.id);
                              setMemberMenuId(null);
                            }}
                          >
                            Revoke Access
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {isCommissioner && (
                    <button
                      title="Remove member"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}
                      onClick={() => { if (confirm('Remove this member from the league?')) deleteMember.mutate(m.id); }}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Item Pool — add controls only; item display is in the full-width section below */}
          <section style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>Item Pool ({items.length})</h2>
              {isCommissioner && (
                <button style={{ ...styles.primaryBtn, padding: '5px 12px', fontSize: 13, flexShrink: 0 }} onClick={() => addItem.mutate()}>
                  Add
                </button>
              )}
            </div>
            {isCommissioner && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input className="placeholder-sm" style={{ ...styles.input, flex: 1, minWidth: 0 }} placeholder="Item name" value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem.mutate()} />
                  <input className="placeholder-sm" style={{ ...styles.input, flex: 1, minWidth: 0 }} placeholder="Bucket (e.g. UPPER)" value={newItemBucket}
                    onChange={(e) => setNewItemBucket(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem.mutate(); }}
                    list="bucket-suggestions" />
                  <datalist id="bucket-suggestions">
                    {namedBuckets.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>Bulk add</span>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
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
                  <button style={{ ...styles.ghostBtn, width: '100%' }} onClick={() => bulkAdd.mutate()}>Bulk Add</button>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(140px, 1fr))' : `repeat(${Math.min(namedBuckets.length, 3)}, 1fr) ${unbucketed.length === 0 ? 'minmax(60px, 110px)' : '1fr'}`, gap: 12, marginTop: 12 }}>
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
                            {isCommissioner && isMobile && (
                              <select
                                value={item.bucket ?? ''}
                                onChange={(e) => moveItem.mutate({ itemId: item.id, bucket: e.target.value || null })}
                                style={{ marginTop: 6, width: '100%', padding: '5px 6px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4 }}
                              >
                                <option value="">No bucket</option>
                                {namedBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
                              </select>
                            )}
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
                        {isCommissioner && isMobile && (
                          <select
                            value={item.bucket ?? ''}
                            onChange={(e) => moveItem.mutate({ itemId: item.id, bucket: e.target.value || null })}
                            style={{ marginTop: 6, width: '100%', padding: '5px 6px', fontSize: 12, border: '1px solid #ddd', borderRadius: 4 }}
                          >
                            <option value="">No bucket</option>
                            {namedBuckets.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        )}
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
