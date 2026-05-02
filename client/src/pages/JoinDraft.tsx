import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';

type Member = { id: string; displayName: string | null; inviteEmail: string | null; inviteStatus: string; reclaimable: boolean };
type LeagueInfo = { id: string; name: string; allowSelfReclaim: boolean; members: Member[] };

function memberLabel(m: Member) {
  return m.displayName ?? (m.inviteEmail ? m.inviteEmail.split('@')[0] : 'Member');
}

export default function JoinDraft() {
  const isMobile = useIsMobile();
  const cardStyle: React.CSSProperties = { background: '#fff', padding: isMobile ? 20 : 32, borderRadius: 8, width: '100%', maxWidth: 420, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' };
  const { code } = useParams<{ code: string }>();
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isReclaim, setIsReclaim] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const { data: league, isLoading, isError } = useQuery<LeagueInfo>({
    queryKey: ['join', code],
    queryFn: () => api.get(`/leagues/join/${code}`).then((r) => r.data),
    retry: false,
  });

  function selectMember(m: Member, reclaim = false) {
    setSelectedMember(m);
    setIsReclaim(reclaim && m.reclaimable);
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
        displayName: isReclaim ? undefined : (displayName.trim() || undefined),
      });
      setAuth(data.user, data.accessToken);
      if (data.inviteToken) {
        localStorage.setItem('draftmate:recovery-token', data.inviteToken);
        setMagicLink(`${window.location.origin}/invite/${data.inviteToken}`);
      } else {
        navigate('/');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? 'Failed to join draft');
    } finally {
      setLoading(false);
    }
  }

  if (magicLink) {
    return (
      <div style={styles.container}>
        <div style={cardStyle}>
          <h2 style={{ marginBottom: 8 }}>{isReclaim ? 'Welcome back!' : "You're in!"}</h2>
          <p style={{ color: '#374151', marginBottom: 16, lineHeight: 1.5 }}>
            Save this link — it's how you get back into your session if you lose it.
            There's no password, so bookmark it or send it to yourself.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              readOnly
              value={magicLink}
              onFocus={(e) => e.target.select()}
              style={{ ...styles.input, flex: 1, color: '#374151', minWidth: 0 }}
            />
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(magicLink); }
                catch { prompt('Copy this link:', magicLink); }
              }}
              style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Copy
            </button>
          </div>
          <button style={{ ...styles.primaryBtn, background: '#16a34a' }} onClick={() => navigate('/')}>
            Continue to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <div style={styles.center}>Loading…</div>;
  if (isError) return (
    <div style={styles.center}>
      <div style={cardStyle}>
        <h2 style={{ marginBottom: 8 }}>Link not found</h2>
        <p style={{ color: '#6b7280' }}>This join link may have expired or been revoked.</p>
      </div>
    </div>
  );

  const unclaimed = league!.members.filter((m) => m.inviteStatus === 'PENDING');
  const claimed = league!.members.filter((m) => m.inviteStatus === 'ACCEPTED');

  return (
    <div style={styles.container}>
      <div style={cardStyle}>
        <h1 style={styles.title}>Join "{league!.name}"</h1>

        {unclaimed.length === 0 && !league!.allowSelfReclaim ? (
          <p style={{ color: '#6b7280', marginTop: 8 }}>All spots have been claimed.</p>
        ) : (
          <>
            {unclaimed.length > 0 && (
              <>
                <p style={styles.subtitle}>Who are you?</p>
                <ul style={styles.memberList}>
                  {unclaimed.map((m) => (
                    <li
                      key={m.id}
                      style={{ ...styles.memberItem, ...(selectedMember?.id === m.id && !isReclaim ? styles.memberItemSelected : {}) }}
                      onClick={() => selectMember(m, false)}
                    >
                      {memberLabel(m)}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {league!.allowSelfReclaim && claimed.length > 0 && (
              <>
                <p style={{ ...styles.subtitle, marginTop: unclaimed.length > 0 ? 16 : 0 }}>
                  Already joined? Reclaim your slot.
                </p>
                <ul style={styles.memberList}>
                  {claimed.map((m) => {
                    const isSelected = selectedMember?.id === m.id;
                    return (
                      <li
                        key={m.id}
                        style={{
                          ...styles.memberItem,
                          ...styles.memberItemClaimed,
                          ...(isSelected && isReclaim ? styles.memberItemSelected : {}),
                          ...(isSelected && !m.reclaimable ? { border: '2px solid #f59e0b', background: '#fffbeb', color: '#92400e' } : {}),
                        }}
                        onClick={() => selectMember(m, true)}
                      >
                        {memberLabel(m)}
                        <span style={styles.claimedBadge}>{m.reclaimable ? 'claimed' : 'account'}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {selectedMember && !isReclaim && selectedMember.inviteStatus === 'ACCEPTED' && (
              <div style={styles.confirmSection}>
                <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
                  <strong>{memberLabel(selectedMember)}</strong> has a registered account. Sign in with your email to access this draft.
                </p>
                <button style={{ ...styles.primaryBtn, background: '#2563eb' }} onClick={() => navigate('/login')}>
                  Sign In →
                </button>
              </div>
            )}

            {selectedMember && !isReclaim && selectedMember.inviteStatus === 'PENDING' && (
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

            {selectedMember && isReclaim && (
              <div style={styles.confirmSection}>
                <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
                  Get a new access link for <strong>{memberLabel(selectedMember)}</strong>.
                </p>
                {error && <p style={styles.error}>{error}</p>}
                <button style={{ ...styles.primaryBtn, background: '#d97706' }} onClick={claim} disabled={loading}>
                  {loading ? 'Reclaiming…' : `Reclaim as ${memberLabel(selectedMember)} →`}
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
  memberItem: { padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  memberItemSelected: { border: '2px solid #2563eb', background: '#eff6ff', color: '#1d4ed8' },
  memberItemClaimed: { color: '#6b7280' },
  claimedBadge: { fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#9ca3af', borderRadius: 4, padding: '2px 6px' },
  confirmSection: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 16 },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, fontSize: 15 },
  error: { color: '#dc2626', fontSize: 13 },
  primaryBtn: { padding: '11px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
