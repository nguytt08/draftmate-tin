import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { draftSocket } from '../socket/socket';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';

interface DraftItem { id: string; name: string; bucket?: string | null; isAvailable: boolean; isDeleted?: boolean; metadata?: Record<string, unknown>; commissionerNotes?: string | null }
interface Member { id: string; inviteEmail: string | null; displayName?: string | null; draftPosition: number; userId?: string; user?: { displayName: string } }

function memberDisplay(m: { user?: { displayName: string } | null; displayName?: string | null; inviteEmail: string | null }): string {
  return m.user?.displayName ?? m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member');
}

function getPickOrder(members: Member[], totalRounds: number, format: string) {
  const n = members.length;
  const result: { pickNumber: number; member: Member; round: number }[] = [];
  for (let pick = 1; pick <= totalRounds * n; pick++) {
    const idx = pick - 1;
    const roundIdx = Math.floor(idx / n);
    const pos = idx % n;
    const memberIdx = format === 'SNAKE' && roundIdx % 2 === 1 ? n - 1 - pos : pos;
    result.push({ pickNumber: pick, member: members[memberIdx], round: roundIdx + 1 });
  }
  return result;
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
  const isMobile = useIsMobile();
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
  const [orderExpanded, setOrderExpanded] = useState(true);
  const [boardView, setBoardView] = useState<'rounds' | 'teams'>('rounds');
  const currentOrderRowRef = useRef<HTMLTableRowElement>(null);

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

  // Auto-scroll draft order table to current pick row
  useEffect(() => {
    if (!orderExpanded) return;
    currentOrderRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [localState?.draft.currentPickNumber, orderExpanded]);

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

  async function startDraft(force?: boolean) {
    if (!leagueId) return;
    try {
      await api.post(`/leagues/${leagueId}/draft/start`, force ? { force: true } : {});
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Failed to start draft';
      if (window.confirm(`${msg}\n\nStart anyway?`)) startDraft(true);
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

  const pickOrder = members.length > 0 && settings
    ? getPickOrder(members, settings.totalRounds, settings.format)
    : [];

  const nextMyPick = myMember
    ? pickOrder.find((o) => o.member.id === myMember.id && o.pickNumber >= draft.currentPickNumber)
    : null;
  const picksUntilMyTurn = nextMyPick ? nextMyPick.pickNumber - draft.currentPickNumber : null;

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
      <header style={{ ...styles.header, padding: isMobile ? '8px 12px' : '10px 20px', gap: isMobile ? 8 : 16, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={styles.backBtn}>← Dashboard</button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 120 }}>
          {leagueMeta?.name && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{leagueMeta.name}</div>}
          <span style={{ fontWeight: 700, fontSize: isMobile ? 13 : 15 }}>R{draft.currentRound} · P{draft.currentPickNumber}</span>
          {draft.status === 'COMPLETED' && <span style={{ ...styles.badge, ...styles.badgeGreen, marginLeft: 8 }}>Complete</span>}
          {draft.status === 'PAUSED' && <span style={{ ...styles.badge, ...styles.badgeYellow, marginLeft: 8 }}>Paused</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888' }}>{onlineUsers.length} 🟢</span>
          {draft.timerEndsAt && <span style={{ fontWeight: 700, fontSize: 13, color: isMyTurn ? '#dc2626' : '#94a3b8' }}>{timerDisplay}</span>}
          {isCommissioner && (
            <button onClick={resetDraft} style={{ padding: '4px 10px', fontSize: 12, background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 4, cursor: 'pointer' }}>
              {isMobile ? '↺' : 'Reset Draft'}
            </button>
          )}
        </div>
      </header>

      {/* Draft reset banner */}
      {draft.status === 'PENDING' && (
        <div style={{ background: '#fef9c3', borderBottom: '1px solid #fde68a', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 14 }}>
          <span>Draft has been reset. Reorder members if needed, then start a new draft.</span>
          {isCommissioner && (
            <button onClick={() => startDraft()} style={{ padding: '4px 12px', fontSize: 13, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
              Start Draft
            </button>
          )}
          <button onClick={() => navigate(`/leagues/${leagueId}/setup`)} style={{ padding: '4px 12px', fontSize: 13, background: 'none', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
            Go to League Setup
          </button>
        </div>
      )}

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
          {picksUntilMyTurn !== null && (
            <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.8 }}>
              {picksUntilMyTurn === 1 ? '— Your pick is next!' : `— Your next pick is in ${picksUntilMyTurn} picks`}
            </span>
          )}
        </div>
      )}

      <div style={{ ...styles.body, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-start', overflowX: isMobile ? 'visible' : 'auto', padding: isMobile ? 8 : 16 }}>
        {/* Item Pool */}
        {draft.status === 'ACTIVE' && (
          <section style={{ ...styles.panel, minWidth: isMobile ? 0 : 220 }}>
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
              <div style={{ overflowY: 'auto', maxHeight: isMobile ? undefined : 480 }}>
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
              <ul style={{ ...styles.itemList, maxHeight: isMobile ? undefined : 'calc(100vh - 220px)' }}>
                {filteredItems.map((item) => renderItem(item, false))}
              </ul>
            )}
          </section>
        )}

        {/* Draft Board */}
        <section style={{ ...styles.panel, flex: isMobile ? 'none' : 2, overflowX: isMobile ? 'visible' : 'auto', minWidth: isMobile ? 0 : 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ ...styles.panelTitle, marginBottom: 0 }}>Draft Board</h2>
            {isMobile && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setBoardView('rounds')} style={{ padding: '3px 9px', fontSize: 12, background: boardView === 'rounds' ? '#2563eb' : 'none', color: boardView === 'rounds' ? '#fff' : '#6b7280', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>By Round</button>
                <button onClick={() => setBoardView('teams')} style={{ padding: '3px 9px', fontSize: 12, background: boardView === 'teams' ? '#2563eb' : 'none', color: boardView === 'teams' ? '#fff' : '#6b7280', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>By Team</button>
              </div>
            )}
          </div>
          {isMobile ? (
            boardView === 'teams' ? (
              // Mobile: by-team table — member rows, round columns
              <div style={{ overflowX: 'auto' }}>
                <table style={{ ...styles.table, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>Member</th>
                      {Array.from({ length: settings?.totalRounds ?? 0 }, (_, i) => (
                        <th key={i + 1} style={styles.th}>R{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} style={m.id === draft.currentMemberId ? { background: '#eff6ff' } : {}}>
                        <td style={{ ...styles.td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {memberDisplay(m)}{onlineUsers.includes(m.userId ?? '') && <span style={styles.onlineDot} />}
                        </td>
                        {Array.from({ length: settings?.totalRounds ?? 0 }, (_, i) => {
                          const round = i + 1;
                          const pick = pickGrid[round]?.[m.id];
                          return (
                            <td key={round} style={{ ...styles.td, ...(pick ? {} : styles.tdEmpty) }}>
                              {pick ? (
                                pick.item.isDeleted
                                  ? <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>(removed)</span>
                                  : <>{pick.item.name}{pick.isAutoPick && <span style={styles.autoPick}> ★</span>}{pick.isOverridePick && <span style={styles.overridePick}> 👑</span>}</>
                              ) : (
                                round === draft.currentRound && m.id === draft.currentMemberId
                                  ? <span style={styles.onClock_small}>🕐</span>
                                  : null
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
            // Mobile: round-by-round card grid (pick order matches actual draft sequence)
            <div>
              {Array.from({ length: settings?.totalRounds ?? 0 }, (_, i) => i + 1).map((round) => (
                <div key={round} style={{ marginBottom: 20 }}>
                  <div style={styles.roundHeader}>Round {round}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {pickOrder.filter((o) => o.round === round).map(({ pickNumber, member: m }) => {
                      const pick = pickGrid[round]?.[m.id];
                      const isOnClock = round === draft.currentRound && m.id === draft.currentMemberId;
                      return (
                        <div key={m.id} style={{ ...styles.pickCard, ...(isOnClock ? styles.pickCardActive : {}) }}>
                          <div style={styles.cardMeta}>#{pickNumber} · {memberDisplay(m)}{onlineUsers.includes(m.userId ?? '') && <span style={styles.onlineDot} />}</div>
                          <div style={styles.cardItem}>
                            {pick ? (
                              pick.item.isDeleted
                                ? <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>(removed)</span>
                                : <>{pick.item.name}{pick.isAutoPick && <span style={styles.autoPick}> ★</span>}{pick.isOverridePick && <span style={styles.overridePick}> 👑</span>}</>
                            ) : isOnClock ? (
                              <span style={{ color: '#dc2626', fontWeight: 700 }}>On clock</span>
                            ) : <span style={{ color: '#d1d5db' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            )
          ) : (
            // Desktop: original table
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
                            pick.item.isDeleted ? (
                              <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: 13 }}>(removed)</span>
                            ) : (
                            <span title={pick.isAutoPick ? 'Auto-picked' : pick.isOverridePick ? 'Commissioner override' : ''} style={{ fontSize: 13 }}>
                              {pick.item.name}
                              {pick.isAutoPick && <span style={styles.autoPick}> ★</span>}
                              {pick.isOverridePick && <span style={styles.overridePick}> 👑</span>}
                            </span>
                            )
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
          )}
        </section>

        {/* Right column: Draft Order + Pick History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: isMobile ? 0 : 220, maxWidth: isMobile ? undefined : 240 }}>
          {/* Draft Order */}
          <section style={{ ...styles.panel, flex: 'none' }}>
            <div
              onClick={() => setOrderExpanded((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: orderExpanded ? 12 : 0 }}
            >
              <h2 style={{ ...styles.panelTitle, marginBottom: 0 }}>Draft Order</h2>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{orderExpanded ? '▲' : '▼'}</span>
            </div>
            {orderExpanded && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ ...styles.table, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>Member</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickOrder.map(({ pickNumber, member }) => {
                      const isDone = pickNumber < draft.currentPickNumber;
                      const isCurrent = pickNumber === draft.currentPickNumber;
                      return (
                        <tr
                          key={pickNumber}
                          ref={isCurrent ? currentOrderRowRef : undefined}
                          style={isCurrent ? { background: '#dbeafe', fontWeight: 600 } : isDone ? { opacity: 0.45 } : {}}
                        >
                          <td style={styles.td}>{pickNumber}</td>
                          <td style={styles.td}>{memberDisplay(member)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pick History */}
          <section style={{ ...styles.panel, flex: 'none' }}>
            <h2 style={styles.panelTitle}>Recent Picks</h2>
            <ul style={{ listStyle: 'none', fontSize: 13 }}>
              {[...picks].reverse().slice(0, isMobile ? 10 : 20).map((p) => (
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
  pickBtn: { padding: '6px 14px', minHeight: 36, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 13, flexShrink: 0 },
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
  roundHeader: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e5e7eb' },
  pickCard: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px' },
  pickCardActive: { border: '2px solid #2563eb', background: '#eff6ff' },
  cardMeta: { fontSize: 11, color: '#6b7280', marginBottom: 4, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  cardItem: { fontSize: 13, fontWeight: 500 },
};
