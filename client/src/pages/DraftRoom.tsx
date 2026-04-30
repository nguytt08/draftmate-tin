import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { draftSocket } from '../socket/socket';
import { useAuthStore } from '../store/authStore';
import { formatDistanceToNow } from 'date-fns';

interface DraftItem { id: string; name: string; isAvailable: boolean; metadata?: Record<string, unknown>; commissionerNotes?: string | null }
interface Member { id: string; inviteEmail: string; draftPosition: number; userId?: string; user?: { displayName: string } }
interface Pick { id: string; pickNumber: number; round: number; positionInRound: number; memberId: string; itemId: string; isAutoPick: boolean; item: DraftItem; member: Member }
interface DraftState {
  draft: { id: string; status: string; currentPickNumber: number; currentRound: number; currentMemberId: string | null; timerEndsAt: string | null; completedAt: string | null };
  picks: Pick[];
  availableItems: DraftItem[];
  members: Member[];
  settings: { totalRounds: number; pickTimerSeconds: number; format: string } | null;
}

export default function DraftRoom() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [localState, setLocalState] = useState<DraftState | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('');
  const [notesItem, setNotesItem] = useState<DraftItem | null>(null);

  const { data: leagueId } = useQuery<string>({
    queryKey: ['draft-league', draftId],
    queryFn: async () => {
      const { data } = await api.get(`/leagues`);
      const league = data.find((l: { draft?: { id: string } }) => l.draft?.id === draftId);
      return league?.id ?? null;
    },
  });

  const fetchState = useCallback(async () => {
    if (!leagueId) return;
    const { data } = await api.get(`/leagues/${leagueId}/draft`);
    setLocalState(data);
  }, [leagueId]);

  // Connect socket
  useEffect(() => {
    if (!draftId || !user) return;
    draftSocket.connect();
    draftSocket.emit('draft:join', { draftId });

    draftSocket.on('draft:state', (state: DraftState) => setLocalState(state));
    draftSocket.on('draft:pick_made', () => fetchState());
    draftSocket.on('draft:auto_pick', () => fetchState());
    draftSocket.on('draft:completed', () => fetchState());
    draftSocket.on('draft:paused', () => fetchState());
    draftSocket.on('draft:resumed', () => fetchState());
    draftSocket.on('presence:update', ({ onlineMembers }: { onlineMembers: string[] }) => setOnlineUsers(onlineMembers));

    return () => {
      draftSocket.emit('draft:leave', { draftId });
      draftSocket.off('draft:state');
      draftSocket.off('draft:pick_made');
      draftSocket.off('draft:auto_pick');
      draftSocket.off('draft:completed');
      draftSocket.off('draft:paused');
      draftSocket.off('draft:resumed');
      draftSocket.off('presence:update');
      draftSocket.disconnect();
    };
  }, [draftId, user, fetchState]);

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

  if (!localState) {
    return <div style={styles.loading}>Loading draft...</div>;
  }

  const { draft, picks, availableItems, members, settings } = localState;

  // Find the member record for the current user
  const myMember = members.find((m) => m.userId === user?.id);
  const isMyTurn = draft.currentMemberId === myMember?.id;
  const currentMember = members.find((m) => m.id === draft.currentMemberId);

  const filteredItems = availableItems.filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  // Build pick grid per round per member
  const pickGrid: Record<number, Record<string, Pick | null>> = {};
  for (let r = 1; r <= (settings?.totalRounds ?? 0); r++) {
    pickGrid[r] = {};
    for (const m of members) pickGrid[r][m.id] = null;
  }
  for (const p of picks) {
    if (pickGrid[p.round]) pickGrid[p.round][p.memberId] = p;
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Dashboard</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontWeight: 700 }}>Round {draft.currentRound} · Pick {draft.currentPickNumber}</span>
          {draft.status === 'COMPLETED' && <span style={{ ...styles.badge, ...styles.badgeGreen, marginLeft: 8 }}>Complete</span>}
          {draft.status === 'PAUSED' && <span style={{ ...styles.badge, ...styles.badgeYellow, marginLeft: 8 }}>Paused</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#888' }}>{onlineUsers.length} online</span>
          {draft.timerEndsAt && <span style={{ fontWeight: 700, color: isMyTurn ? '#dc2626' : '#555' }}>{timerDisplay}</span>}
        </div>
      </header>

      {/* On-the-clock banner */}
      {isMyTurn && draft.status === 'ACTIVE' && (
        <div style={styles.onClock}>
          It's your pick! — {timerDisplay} remaining
        </div>
      )}
      {!isMyTurn && draft.status === 'ACTIVE' && currentMember && (
        <div style={styles.waitingBanner}>
          Waiting for <strong>{currentMember.user?.displayName ?? currentMember.inviteEmail}</strong>...
        </div>
      )}

      <div style={styles.body}>
        {/* Item Pool */}
        {draft.status === 'ACTIVE' && (
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Available ({availableItems.length})</h2>
            <input
              style={{ ...styles.input, marginBottom: 8, width: '100%' }}
              placeholder="Search items..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul style={styles.itemList}>
              {filteredItems.map((item) => (
                <li key={item.id} style={styles.itemRow}>
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <button
                    style={styles.notesBtn}
                    title="View / add notes"
                    onClick={() => setNotesItem(item)}
                  >
                    +
                  </button>
                  {isMyTurn && (
                    <button
                      style={styles.pickBtn}
                      disabled={submitting}
                      onClick={() => submitPick(item.id)}
                    >
                      Pick
                    </button>
                  )}
                </li>
              ))}
            </ul>
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
                    {m.user?.displayName ?? m.inviteEmail}
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
                          <span title={pick.isAutoPick ? 'Auto-picked' : ''} style={{ fontSize: 13 }}>
                            {pick.item.name}
                            {pick.isAutoPick && <span style={styles.autoPick}> ★</span>}
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
                  {p.member.user?.displayName ?? p.member.inviteEmail} · R{p.round}.{p.positionInRound}
                  {p.isAutoPick && ' (auto)'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Notes Modal */}
      {notesItem && leagueId && (
        <NotesModal
          item={notesItem}
          leagueId={leagueId}
          onClose={() => setNotesItem(null)}
        />
      )}
    </div>
  );
}

// ─── Notes Modal ─────────────────────────────────────────────────────────────

function NotesModal({ item, leagueId, onClose }: { item: DraftItem; leagueId: string; onClose: () => void }) {
  const [myNote, setMyNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get(`/leagues/${leagueId}/items/${item.id}/notes`).then(({ data }) => {
      setMyNote(data.myNote ?? '');
      setLoaded(true);
    });
  }, [item.id, leagueId]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/leagues/${leagueId}/items/${item.id}/notes/mine`, { note: myNote });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.box} onClick={(e) => e.stopPropagation()}>
        <div style={modal.header}>
          <h2 style={modal.title}>{item.name}</h2>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Commissioner Notes */}
        <div style={modal.section}>
          <p style={modal.sectionLabel}>Commissioner Notes</p>
          {item.commissionerNotes ? (
            <p style={modal.commissionerText}>{item.commissionerNotes}</p>
          ) : (
            <p style={modal.empty}>No commissioner notes for this player.</p>
          )}
        </div>

        {/* Personal Notes */}
        <div style={modal.section}>
          <p style={modal.sectionLabel}>My Notes <span style={modal.privateTag}>private</span></p>
          {loaded ? (
            <>
              <textarea
                style={modal.textarea}
                placeholder="Add your personal scouting notes..."
                value={myNote}
                onChange={(e) => setMyNote(e.target.value)}
                rows={5}
              />
              <button style={modal.saveBtn} onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <p style={modal.empty}>Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}

const modal: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  box: { background: '#fff', borderRadius: 10, width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, color: '#888', lineHeight: 1 },
  section: { padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 8 },
  commissionerText: { fontSize: 14, lineHeight: 1.6, color: '#1a1a1a', background: '#f8fafc', padding: '10px 12px', borderRadius: 6, margin: 0 },
  privateTag: { background: '#f3f4f6', color: '#6b7280', fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, marginLeft: 6, textTransform: 'uppercase' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  saveBtn: { marginTop: 8, padding: '7px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 14 },
  empty: { fontSize: 13, color: '#aaa', margin: 0, fontStyle: 'italic' },
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 18, color: '#888' },
  header: { background: '#1e293b', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { background: 'none', border: 'none', color: '#93c5fd', fontSize: 14, fontWeight: 500 },
  onClock: { background: '#dc2626', color: '#fff', textAlign: 'center', padding: '10px', fontWeight: 700, fontSize: 15 },
  waitingBanner: { background: '#fef3c7', textAlign: 'center', padding: '8px', fontSize: 14, color: '#92400e' },
  body: { display: 'flex', gap: 12, padding: 16, flex: 1, alignItems: 'flex-start', overflowX: 'auto' },
  panel: { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 220, flex: 1 },
  panelTitle: { fontSize: 15, fontWeight: 700, marginBottom: 12 },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 },
  itemList: { listStyle: 'none', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' },
  itemRow: { display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f0f0f0', gap: 8, fontSize: 14 },
  notesBtn: { padding: '2px 8px', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 4, fontWeight: 700, fontSize: 14, lineHeight: 1.4 },
  pickBtn: { padding: '4px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 13 },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  th: { padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' },
  thActive: { background: '#dbeafe', color: '#1d4ed8' },
  td: { padding: '7px 12px', border: '1px solid #e5e7eb', verticalAlign: 'top' },
  tdEmpty: { background: '#fafafa' },
  onClock_small: { color: '#dc2626', fontWeight: 600 },
  autoPick: { color: '#f59e0b' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
  badgeGreen: { background: '#dcfce7', color: '#15803d' },
  badgeYellow: { background: '#fef3c7', color: '#92400e' },
  onlineDot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 4, verticalAlign: 'middle' },
};
