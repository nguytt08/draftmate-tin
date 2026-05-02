import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { draftSocket } from '../socket/socket';
import { useAuthStore } from '../store/authStore';

interface DraftItem { id: string; name: string; bucket?: string | null; isAvailable: boolean; metadata?: Record<string, unknown>; commissionerNotes?: string | null }
interface Member { id: string; inviteEmail: string | null; displayName?: string | null; draftPosition: number; userId?: string; user?: { displayName: string } }

function memberDisplay(m: { user?: { displayName: string } | null; displayName?: string | null; inviteEmail: string | null }): string {
  return m.user?.displayName ?? m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member');
}
interface Pick { id: string; pickNumber: number; round: number; positionInRound: number; memberId: string; itemId: string; isAutoPick: boolean; isOverridePick: boolean; item: DraftItem; member: Member }
interface DraftState {
  draft: { id: string; status: string; currentPickNumber: number; currentRound: number; currentMemberId: string | null; timerEndsAt: string | null; completedAt: string | null; commissionerPickRequired: boolean };
  picks: Pick[];
  availableItems: DraftItem[];
  members: Member[];
  settings: { totalRounds: number; pickTimerSeconds: number; format: string; enforceBucketPicking?: boolean } | null;
}

export default function DraftRoom() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [localState, setLocalState] = useState<DraftState | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('');
  const [showNotes, setShowNotes] = useState(() => localStorage.getItem('draftroom:showNotes') !== 'false');
  const [myNotes, setMyNotes] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const { data: leagueMeta } = useQuery<{ id: string; commissionerId: string; name: string } | null>({
    queryKey: ['draft-league', draftId],
    queryFn: async () => {
      const { data } = await api.get(`/leagues`);
      const league = data.find((l: { draft?: { id: string } }) => l.draft?.id === draftId);
      return league ? { id: league.id, commissionerId: league.commissionerId, name: league.name } : null;
    },
  });
  const leagueId = leagueMeta?.id;
  const isCommissioner = user?.id === leagueMeta?.commissionerId;

  const fetchState = useCallback(async () => {
    if (!leagueId) return;
    const { data } = await api.get(`/leagues/${leagueId}/draft`);
    setLocalState(data);
  }, [leagueId]);

  // Initial state fetch once leagueId resolves (fallback if socket is slow)
  useEffect(() => {
    if (leagueId) fetchState();
  }, [leagueId, fetchState]);

  // Fetch all personal notes on load
  useEffect(() => {
    if (!leagueId || !user) return;
    api.get(`/leagues/${leagueId}/items/notes/mine`)
      .then(({ data }) => setMyNotes(data))
      .catch(() => {});
  }, [leagueId, user]);

  // Connect socket
  useEffect(() => {
    if (!draftId || !user) return;
    draftSocket.connect();
    draftSocket.emit('draft:join', { draftId });

    draftSocket.on('draft:state', (state: DraftState) => setLocalState(state));
    draftSocket.on('presence:update', ({ onlineMembers }: { onlineMembers: string[] }) => setOnlineUsers(onlineMembers));

    return () => {
      draftSocket.emit('draft:leave', { draftId });
      draftSocket.off('draft:state');
      draftSocket.off('presence:update');
      draftSocket.disconnect();
    };
  }, [draftId, user]);

  // Timer countdown
  useEffect(() => {
    if (!localState?.draft.timerEndsAt) { setTimerDisplay(''); return; }
    const update = () => {
      const end = new Date(localState.draft.timerEndsAt!);
      const ms = end.getTime() - Date.now();
      if (ms <= 0) { setTimerDisplay('Expired'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTimerDisplay(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [localState?.draft.timerEndsAt]);

  async function submitPick(itemId: string) {
    if (!leagueId || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/leagues/${leagueId}/draft/picks`, { itemId });
      await fetchState();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Pick failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPickOverride(itemId: string, forMemberName: string) {
    if (!leagueId || submitting) return;
    if (!window.confirm(`Pick this on behalf of ${forMemberName}?`)) return;
    setSubmitting(true);
    try {
      await api.post(`/leagues/${leagueId}/draft/picks/override`, { itemId });
      await fetchState();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Override failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function resetDraft() {
    if (!leagueId) return;
    if (!window.confirm('Reset the draft? All picks will be deleted and the draft restarts from pick 1.')) return;
    try {
      await api.post(`/leagues/${leagueId}/draft/reset`);
      await fetchState();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Reset failed');
    }
  }

  function toggleNotes() {
    setShowNotes((v) => {
      const next = !v;
      localStorage.setItem('draftroom:showNotes', String(next));
      return next;
    });
  }

  async function saveNote(itemId: string) {
    const note = editingText.trim();
    setMyNotes((prev) => ({ ...prev, [itemId]: note }));
    setEditingNoteId(null);
    if (!leagueId) return;
    await api.put(`/leagues/${leagueId}/items/${itemId}/notes/mine`, { note });
  }

  if (!localState) {
    return <div style={styles.loading}>Loading draft...</div>;
  }

  const { draft, picks, availableItems, members, settings } = localState;

  const myMember = members.find((m) => m.userId === user?.id);
  const isMyTurn = draft.currentMemberId === myMember?.id;
  const currentMember = members.find((m) => m.id === draft.currentMemberId);

  const filteredItems = availableItems.filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const enforceBuckets = settings?.enforceBucketPicking ?? false;
  const myPicks = picks.filter((p) => p.memberId === myMember?.id);
  const myUsedBuckets = new Set(myPicks.map((p) => p.item.bucket).filter(Boolean) as string[]);
  const currentMemberPicks = picks.filter((p) => p.memberId === draft.currentMemberId);
  const currentMemberUsedBuckets = new Set(currentMemberPicks.map((p) => p.item.bucket).filter(Boolean) as string[]);
  const namedBuckets = [...new Set(availableItems.map((i) => i.bucket).filter(Boolean) as string[])].sort();
  const hasBuckets = namedBuckets.length > 0;

  function isBucketBlocked(bucket: string | null | undefined) {
    return enforceBuckets && isMyTurn && !!bucket && myUsedBuckets.has(bucket);
  }

  function isOverrideBlocked(bucket: string | null | undefined) {
    return enforceBuckets && isCommissioner && !isMyTurn && !!bucket && currentMemberUsedBuckets.has(bucket);
  }

  const groupedItems = hasBuckets
    ? namedBuckets.reduce<Record<string, DraftItem[]>>((acc, b) => {
        acc[b] = filteredItems.filter((i) => i.bucket === b);
        return acc;
      }, { '': filteredItems.filter((i) => !i.bucket) })
    : null;

  const pickGrid: Record<number, Record<string, Pick | null>> = {};
  for (let r = 1; r <= (settings?.totalRounds ?? 0); r++) {
    pickGrid[r] = {};
    for (const m of members) pickGrid[r][m.id] = null;
  }
  for (const p of picks) {
    if (pickGrid[p.round]) pickGrid[p.round][p.memberId] = p;
  }

  function renderItem(item: DraftItem, blocked = false, overrideBlocked = false) {
    const commNote = item.commissionerNotes;
    const myNote = myNotes[item.id] ?? '';
    const isEditing = editingNoteId === item.id;

    return (
      <li
        key={item.id}
        style={{ ...styles.itemRow, ...(hoveredItemId === item.id ? styles.itemRowHovered : {}) }}
        onMouseEnter={() => setHoveredItemId(item.id)}
        onMouseLeave={() => setHoveredItemId(null)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14 }}>{item.name}</span>
          {showNotes && (
            <div>
              {commNote && (
                <div style={styles.commNote}>📋 {commNote}</div>
              )}
              {isEditing ? (
                <textarea
                  autoFocus
                  style={styles.inlineTextarea}
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={() => saveNote(item.id)}
                  rows={2}
                  placeholder="Your notes (private)..."
                />
              ) : (
                <div
                  style={myNote ? styles.myNote : styles.addNote}
                  onClick={() => { setEditingNoteId(item.id); setEditingText(myNote); }}
                >
                  {myNote || '+ Add note'}
                </div>
              )}
            </div>
          )}
        </div>
        {isMyTurn && (
          <button style={styles.pickBtn} disabled={submitting || blocked} onClick={() => submitPick(item.id)}>Pick</button>
        )}
        {isCommissioner && !isMyTurn && draft.status === 'ACTIVE' && draft.currentMemberId && (
          <button style={styles.overrideBtn} disabled={submitting || overrideBlocked} onClick={() => submitPickOverride(item.id, memberDisplay(currentMember!))}>Override</button>
        )}
      </li>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Dashboard</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          {leagueMeta?.name && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{leagueMeta.name}</div>}
          <span style={{ fontWeight: 700 }}>Round {draft.currentRound} · Pick {draft.currentPickNumber}</span>
          {draft.status === 'COMPLETED' && <span style={{ ...styles.badge, ...styles.badgeGreen, marginLeft: 8 }}>Complete</span>}
          {draft.status === 'PAUSED' && <span style={{ ...styles.badge, ...styles.badgeYellow, marginLeft: 8 }}>Paused</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#888' }}>{onlineUsers.length} online</span>
          {draft.timerEndsAt && <span style={{ fontWeight: 700, color: isMyTurn ? '#dc2626' : '#555' }}>{timerDisplay}</span>}
          {isCommissioner && (
            <button onClick={resetDraft} style={{ padding: '4px 10px', fontSize: 12, background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 4, cursor: 'pointer' }}>
              Reset Draft
            </button>
          )}
        </div>
      </header>

      {/* On-the-clock banner */}
      {isMyTurn && draft.status === 'ACTIVE' && (
        <div style={styles.onClock}>
          It's your pick! — {timerDisplay} remaining
        </div>
      )}
      {isCommissioner && !isMyTurn && draft.status === 'ACTIVE' && draft.commissionerPickRequired && currentMember && (
        <div style={styles.commissionerAlert}>
          ⏱ Pick timer expired for <strong>{memberDisplay(currentMember)}</strong> — use the Override button to make their pick.
        </div>
      )}
      {!isMyTurn && draft.status === 'ACTIVE' && currentMember && !(isCommissioner && draft.commissionerPickRequired) && (
        <div style={styles.waitingBanner}>
          Waiting for <strong>{memberDisplay(currentMember)}</strong>...
        </div>
      )}

      <div style={styles.body}>
        {/* Item Pool */}
        {draft.status === 'ACTIVE' && (
          <section style={styles.panel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ ...styles.panelTitle, marginBottom: 0 }}>Available ({availableItems.length})</h2>
              <button onClick={toggleNotes} style={{ padding: '3px 8px', fontSize: 12, background: 'none', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
                {showNotes ? 'Hide Notes' : 'Show Notes'}
              </button>
            </div>

            {hasBuckets && isMyTurn && enforceBuckets && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {namedBuckets.map((b) => (
                  <span key={b} style={{
                    padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: myUsedBuckets.has(b) ? '#f3f4f6' : '#dcfce7',
                    color: myUsedBuckets.has(b) ? '#9ca3af' : '#15803d',
                    textDecoration: myUsedBuckets.has(b) ? 'line-through' : 'none',
                  }}>
                    {b} {myUsedBuckets.has(b) ? '✓' : ''}
                  </span>
                ))}
              </div>
            )}

            <input
              style={{ ...styles.input, marginBottom: 8, width: '100%' }}
              placeholder="Search items..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />

            {hasBuckets && groupedItems ? (
              <div style={{ overflowY: 'auto', maxHeight: 480 }}>
                {namedBuckets.map((bucket) => {
                  const blocked = isBucketBlocked(bucket);
                  const overrideBlocked = isOverrideBlocked(bucket);
                  const bucketItems = groupedItems[bucket] ?? [];
                  if (bucketItems.length === 0) return null;
                  return (
                    <div key={bucket} style={{ marginBottom: 12, opacity: (blocked || overrideBlocked) ? 0.45 : 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {bucket} {(blocked || overrideBlocked) ? '(already picked)' : `(${bucketItems.length})`}
                      </div>
                      <ul style={{ ...styles.itemList, margin: 0 }}>
                        {bucketItems.map((item) => renderItem(item, blocked, overrideBlocked))}
                      </ul>
                    </div>
                  );
                })}
                {(groupedItems[''] ?? []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                      Other ({groupedItems[''].length})
                    </div>
                    <ul style={{ ...styles.itemList, margin: 0 }}>
                      {groupedItems[''].map((item) => renderItem(item, false, false))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <ul style={styles.itemList}>
                {filteredItems.map((item) => renderItem(item, false))}
              </ul>
            )}
          </section>
        )}

        {/* Draft Board */}
        <section style={{ ...styles.panel, flex: 2, overflowX: 'auto' }}>
          <h2 style={styles.panelTitle}>Draft Board</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Round</th>
                {members.map((m) => (
                  <th key={m.id} style={{ ...styles.th, ...(m.id === draft.currentMemberId ? styles.thActive : {}) }}>
                    {memberDisplay(m)}
                    {onlineUsers.includes(m.userId ?? '') && <span style={styles.onlineDot} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: settings?.totalRounds ?? 0 }, (_, i) => i + 1).map((round) => (
                <tr key={round}>
                  <td style={styles.td}>{round}</td>
                  {members.map((m) => {
                    const pick = pickGrid[round]?.[m.id];
                    return (
                      <td key={m.id} style={{ ...styles.td, ...(pick ? {} : styles.tdEmpty) }}>
                        {pick ? (
                          <span title={pick.isAutoPick ? 'Auto-picked' : pick.isOverridePick ? 'Commissioner override' : ''} style={{ fontSize: 13 }}>
                            {pick.item.name}
                            {pick.isAutoPick && <span style={styles.autoPick}> ★</span>}
                            {pick.isOverridePick && <span style={styles.overridePick}> 👑</span>}
                          </span>
                        ) : (
                          round === draft.currentRound && m.id === draft.currentMemberId
                            ? <span style={styles.onClock_small}>On clock</span>
                            : null
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Pick History */}
        <section style={{ ...styles.panel, maxWidth: 240 }}>
          <h2 style={styles.panelTitle}>Recent Picks</h2>
          <ul style={{ listStyle: 'none', fontSize: 13 }}>
            {[...picks].reverse().slice(0, 20).map((p) => (
              <li key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontWeight: 500 }}>{p.item.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {memberDisplay(p.member)} · R{p.round}.{p.positionInRound}
                  {p.isAutoPick && ' (auto)'}
                  {p.isOverridePick && ' (override)'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 18, color: '#888' },
  header: { background: '#1e293b', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { background: 'none', border: 'none', color: '#93c5fd', fontSize: 14, fontWeight: 500 },
  onClock: { background: '#dc2626', color: '#fff', textAlign: 'center', padding: '10px', fontWeight: 700, fontSize: 15 },
  waitingBanner: { background: '#fef3c7', textAlign: 'center', padding: '8px', fontSize: 14, color: '#92400e' },
  commissionerAlert: { background: '#fef9c3', border: '1px solid #fde68a', textAlign: 'center', padding: '10px 16px', fontSize: 14, color: '#92400e', fontWeight: 600 },
  body: { display: 'flex', gap: 12, padding: 16, flex: 1, alignItems: 'flex-start', overflowX: 'auto' },
  panel: { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 220, flex: 1 },
  panelTitle: { fontSize: 15, fontWeight: 700, marginBottom: 12 },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 },
  itemList: { listStyle: 'none', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' },
  itemRow: { display: 'flex', alignItems: 'flex-start', padding: '7px 8px', borderBottom: '1px solid #f0f0f0', gap: 8, borderRadius: 4, transition: 'background 0.1s' },
  itemRowHovered: { background: '#dbeafe' },
  pickBtn: { padding: '4px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 13, flexShrink: 0 },
  overrideBtn: { padding: '4px 10px', background: 'none', color: '#9ca3af', border: '1px solid #d1d5db', borderRadius: 4, fontWeight: 500, fontSize: 12, flexShrink: 0, cursor: 'pointer' },
  commNote: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 3 },
  myNote: { fontSize: 12, color: '#2563eb', fontStyle: 'italic', marginTop: 3, cursor: 'pointer' },
  addNote: { fontSize: 12, color: '#d1d5db', marginTop: 3, cursor: 'pointer' },
  inlineTextarea: { width: '100%', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', resize: 'vertical' as const, fontFamily: 'inherit', marginTop: 3, boxSizing: 'border-box' as const },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  th: { padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' },
  thActive: { background: '#dbeafe', color: '#1d4ed8' },
  td: { padding: '7px 12px', border: '1px solid #e5e7eb', verticalAlign: 'top' },
  tdEmpty: { background: '#fafafa' },
  onClock_small: { color: '#dc2626', fontWeight: 600 },
  autoPick: { color: '#f59e0b' },
  overridePick: { color: '#6b7280' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
  badgeGreen: { background: '#dcfce7', color: '#15803d' },
  badgeYellow: { background: '#fef3c7', color: '#92400e' },
  onlineDot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 4, verticalAlign: 'middle' },
};
