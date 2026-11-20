import { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Link2,
  Lock,
  LogIn,
  Radio,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type {
  CollabMemberRecord,
  CollabPresencePeer,
  CollabSessionMeta,
  CollabShareMode,
  CollabSyncStatus,
} from '../types/workspace';
import { parseCollabSessionIdFromInput } from '../utils/collabSync';

interface CollabModalProps {
  open: boolean;
  isCollabActive: boolean;
  collabSessionId: string | null;
  pendingSessionId: string | null;
  sessionMeta: CollabSessionMeta | null;
  members: CollabMemberRecord[];
  activePeers: CollabPresencePeer[];
  ownedSessions: CollabSessionMeta[];
  syncStatus: CollabSyncStatus;
  collabError: string | null;
  workspaceTitle: string;
  fileCount: number;
  onStartSession: (shareMode: CollabShareMode) => Promise<string>;
  onJoinSession: (sessionId: string) => Promise<unknown>;
  onLeaveSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
  onChangeShareMode: (mode: CollabShareMode) => Promise<void>;
  onInviteMember: (uid: string, displayName?: string) => Promise<void>;
  onRevokeMember: (uid: string) => Promise<void>;
  onClose: () => void;
}

export function CollabModal({
  open,
  isCollabActive,
  collabSessionId,
  pendingSessionId,
  sessionMeta,
  members,
  activePeers,
  ownedSessions,
  syncStatus,
  collabError,
  workspaceTitle,
  fileCount,
  onStartSession,
  onJoinSession,
  onLeaveSession,
  onEndSession,
  onChangeShareMode,
  onInviteMember,
  onRevokeMember,
  onClose,
}: CollabModalProps) {
  const { user, authBusy, signInGoogle } = useAuth();
  const [shareMode, setShareMode] = useState<CollabShareMode>('open');
  const [joinInput, setJoinInput] = useState('');
  const [inviteUid, setInviteUid] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!open) return null;

  const isOwner = Boolean(
    user && sessionMeta && sessionMeta.ownerId === user.uid,
  );
  const inviteUrl =
    typeof window !== 'undefined' && collabSessionId
      ? `${window.location.origin}/app?collab=${collabSessionId}`
      : '';

  async function handleStart() {
    setBusy(true);
    setLocalError(null);
    try {
      await onStartSession(shareMode);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not create session.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCollabSessionIdFromInput(joinInput);
    if (!parsed) {
      setLocalError(
        'Enter a valid Session ID or full ?collab= invite URL (min 4 characters).',
      );
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await onJoinSession(parsed);
      setJoinInput('');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Unable to join session.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUid = inviteUid.trim();
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(trimmedUid)) {
      setLocalError('Enter a valid collaborator Firebase UID.');
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      await onInviteMember(trimmedUid, inviteName.trim() || undefined);
      setInviteUid('');
      setInviteName('');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not add collaborator.',
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCopyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    });
  }

  const displayError = localError || collabError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Real-Time Collaborative Workspace"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111115] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-sm">
                Real-Time Collaborative Workspace
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Simultaneous Firestore file sync with live cursors &amp; 3-way merge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close collaboration dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {displayError && (
            <div
              role="alert"
              className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300"
            >
              {displayError}
            </div>
          )}

          {!user ? (
            <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center mx-auto">
                <LogIn className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium text-sm">
                  Google Sign-In Required for Multi-User Sync
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  {pendingSessionId
                    ? `Sign in with Google to automatically join shared session "${pendingSessionId}" and edit files together in real time.`
                    : 'Sign in with Google to host shared Firestore sessions, get an invite link, and edit the same file simultaneously with teammates.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signInGoogle()}
                disabled={authBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In with Google</span>
              </button>
            </div>
          ) : isCollabActive && collabSessionId ? (
            <>
              {/* Active Session Header Card */}
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      <span className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">
                        {sessionMeta?.title || workspaceTitle}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Session ID: {collabSessionId} · Status: {syncStatus}
                    </p>
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => void onChangeShareMode('open')}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          sessionMeta?.shareMode === 'open'
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        <span>Open Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onChangeShareMode('invite')}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          sessionMeta?.shareMode === 'invite'
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Invite Only</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Invite URL Copy */}
                <div className="flex items-center gap-2">
                  <label htmlFor="collab-invite-link" className="sr-only">
                    Invite link
                  </label>
                  <input
                    id="collab-invite-link"
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-700 dark:text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Your UID:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 font-mono">
                    {user.uid}
                  </code>
                </p>
              </div>

              {/* Invite collaborator by UID (owner only) */}
              {isOwner && (
                <form
                  onSubmit={handleInviteSubmit}
                  className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                >
                  <div className="font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Add Collaborator by UID</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label htmlFor="invite-uid-input" className="sr-only">
                      Collaborator Firebase UID
                    </label>
                    <input
                      id="invite-uid-input"
                      type="text"
                      value={inviteUid}
                      onChange={(e) => setInviteUid(e.target.value)}
                      placeholder="Collaborator UID..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs"
                    />
                    <label htmlFor="invite-name-input" className="sr-only">
                      Optional display label
                    </label>
                    <input
                      id="invite-name-input"
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Name (optional)"
                      className="sm:w-36 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Add Editor
                    </button>
                  </div>
                </form>
              )}

              {/* Members & Live Presence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Participants ({members.length}) · Online Now ({activePeers.length + 1})
                  </span>
                </div>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  {members.map((member) => {
                    const peer = activePeers.find((p) => p.uid === member.uid);
                    const isSelf = member.uid === user.uid;
                    return (
                      <div
                        key={member.uid}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-zinc-950/60"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: member.color }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {member.displayName} {isSelf ? '(You)' : ''}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">
                              {peer
                                ? `Active in ${peer.activeFilePath || 'workspace'} · Ln ${peer.cursorLine}, Col ${peer.cursorCol}${peer.isTyping ? ' (typing)' : ''}`
                                : isSelf
                                  ? 'Connected to Firestore listener'
                                  : `Role: ${member.role}`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 uppercase">
                            {member.role}
                          </span>
                          {isOwner && !isSelf && (
                            <button
                              type="button"
                              onClick={() => void onRevokeMember(member.uid)}
                              aria-label={`Remove ${member.displayName}`}
                              className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => void onLeaveSession()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Leave Live Session
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void onEndSession()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/15 text-red-600 dark:text-red-400 hover:bg-red-600/25 cursor-pointer"
                  >
                    End Session for All
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Start a New Collaborative Session */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-sm">
                      Share &ldquo;{workspaceTitle}&rdquo; Live
                    </h3>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Publishes {fileCount} workspace files into Firestore for real-time multi-user editing.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShareMode('open')}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      shareMode === 'open'
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <Globe className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Anyone with link</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Verified Google users with your session link can co-edit.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareMode('invite')}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      shareMode === 'invite'
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Invite Only (UID)</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Only collaborators added by UID can access or edit.
                    </p>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer"
                >
                  {busy ? 'Creating Firestore Session...' : 'Start Live Collab Session'}
                </button>
              </div>

              {/* Join Existing Session */}
              <form
                onSubmit={handleJoinSubmit}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5"
              >
                <label
                  htmlFor="join-collab-input"
                  className="block font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Join Existing Session by ID or Invite URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="join-collab-input"
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    placeholder="collab-... or https://.../app?collab=..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Join</span>
                  </button>
                </div>
              </form>

              {/* Owned sessions quick list */}
              {ownedSessions.length > 0 && (
                <div className="space-y-2">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Your Hosted Collaborative Sessions
                  </span>
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                    {ownedSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-zinc-950/60"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{sess.title}</div>
                          <div className="text-[11px] font-mono text-zinc-500 truncate">
                            {sess.id} · {sess.activeFileCount} files · {sess.shareMode}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onJoinSession(sess.id)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600/25 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Reconnect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
