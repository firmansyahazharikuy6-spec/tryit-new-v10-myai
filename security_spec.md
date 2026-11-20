# MyAI Studio Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Identity Ownership**: Every user profile (`/users/{userId}`), workspace (`/workspaces/{workspaceId}`), media creation log (`/creations/{creationId}`), and arena score (`/leaderboard/{scoreId}`) must carry an immutable `uid`/`ownerId` matching `request.auth.uid` at creation time.
2. **PII Isolation (Split Collection)**: Sensitive PII (`email`) is strictly isolated in `/users/{userId}/private/info` and is never exposed in `/users/{userId}` or queries.
3. **Verified Standard Writes**: All document mutations require `request.auth != null && request.auth.token.email_verified == true`.
4. **Temporal & Schema Integrity**: `createdAt` and `updatedAt` must equal `request.time` (`serverTimestamp()`), and `createdAt`/`ownerId`/`uid` are immutable on update.
5. **Bounded Inputs & IDs**: All document IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and every string/list field enforces strict `.size()` upper bounds to prevent resource exhaustion.
6. **Zero Client Query Trust**: Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid` directly at the rule layer (or strictly enforces parent membership without PII exposure).
7. **Master Gate & Identity Integrity in Collaboration**: Every shared file mutation (`/collabSessions/{sessionId}/files/{fileId}`) verifies active parent ownership or membership in `/members/{uid}`, ensures `lastEditorId == request.auth.uid`, and prevents impersonation or presence hijacking.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Creating `/workspaces/ws-1` or `/collabSessions/c1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Creating `/workspaces/ws-1` or editing `/collabSessions/c1/files/f1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **ID Poisoning**: Creating `/workspaces/../../evil` or 200-char doc ID -> `PERMISSION_DENIED`.
4. **Identity Spoofing**: Creating `/workspaces/ws-1` with `ownerId: "victim-uid"` or updating `/collabSessions/c1/files/f1` with `lastEditorId: "other-uid"` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Creating `/users/u1` or `/collabSessions/c1` with `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
6. **Update-Gap Shadow Field**: Updating `/users/u1` with `{ displayName: "Ok", role: "admin" }` or `/collabSessions/c1/files/f1` with `{ content: "ok", forged: true }` -> `PERMISSION_DENIED`.
7. **Immutable Owner / Parent Tampering**: Updating `/workspaces/ws-1` or `/collabSessions/c1` to change `ownerId` -> `PERMISSION_DENIED`.
8. **Backdated Timestamp Fraud**: Creating `/workspaces/ws-1` or `/collabSessions/c1/files/f1` with client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
9. **PII Cross-User Read & Presence Hijack**: Reading `/users/victim/private/info` or writing `/collabSessions/c1/presence/victim` as attacker -> `PERMISSION_DENIED`.
10. **Blanket List Scraping**: Listing `/workspaces` or `/collabSessions` without `ownerId == request.auth.uid` constraint -> `PERMISSION_DENIED`.
11. **Value/Size Poisoning**: Creating `/creations/c1` with a 500KB `prompt` string, negative `score`, or `version < 1` in collab files -> `PERMISSION_DENIED`.
12. **Unauthorized Invite-Only Join**: Writing `/collabSessions/c1/members/attacker` when `shareMode == 'invite'` and attacker is not the owner -> `PERMISSION_DENIED`.

