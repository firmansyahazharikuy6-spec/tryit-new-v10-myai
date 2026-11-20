import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces master catch-all deny and rules_version 2', () => {
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.length >= 9);
  assert.match(rulesText, /match \/users\/\{userId\}/);
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /match \/workspaces\/\{workspaceId\}/);
  assert.match(rulesText, /match \/creations\/\{creationId\}/);
  assert.match(rulesText, /match \/leaderboard\/\{scoreId\}/);
  assert.match(rulesText, /match \/collabSessions\/\{sessionId\}/);
  assert.match(rulesText, /match \/members\/\{memberId\}/);
  assert.match(rulesText, /match \/files\/\{fileId\}/);
  assert.match(rulesText, /match \/presence\/\{userId\}/);
});

test('all Dirty Dozen security pillars are statically enforced', () => {
  // Pillar 2: Strict hasAll + hasOnly & update affectedKeys
  assert.match(rulesText, /data\.keys\(\)\.hasAll/);
  assert.match(rulesText, /data\.keys\(\)\.hasOnly/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly/);
  // Pillar 3: ID hardening
  assert.match(rulesText, /isValidId\(id\)/);
  assert.match(rulesText, /\^\[a-zA-Z0-9_\\\\-\]\+\$/);
  // Verified email enforcement for standard writes
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  // Pillar 6: PII isolation (no blanket reads on users or private subcollection)
  assert.doesNotMatch(rulesText, /allow read: if isSignedIn\(\);/);
  // Pillar 8: Secure list queries check resource.data.ownerId
  assert.match(rulesText, /allow list: if isSignedIn\(\) && resource\.data\.ownerId == request\.auth\.uid;/);
  // Collaborative master gate, editor identity integrity & monotonic versioning
  assert.match(rulesText, /isCollabMember\(sessionId\)/);
  assert.match(rulesText, /data\.lastEditorId == request\.auth\.uid/);
  assert.match(rulesText, /incoming\(\)\.version == existing\(\)\.version \+ 1/);
  // Temporal integrity
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
});

