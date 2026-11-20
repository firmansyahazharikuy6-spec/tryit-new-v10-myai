import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkspaceFiles } from './fileFilter';
import type { WorkspaceFile } from '../types/workspace';

const SAMPLE_FILES: WorkspaceFile[] = [
  { path: 'index.html', language: 'html', content: '', updatedAt: 1 },
  { path: 'src/App.tsx', language: 'tsx', content: '', updatedAt: 1 },
  { path: 'src/components/Sidebar.tsx', language: 'tsx', content: '', updatedAt: 1 },
  { path: 'src/styles/app.css', language: 'css', content: '', updatedAt: 1 },
];

test('filterWorkspaceFiles returns all files when query is empty or whitespace', () => {
  assert.equal(filterWorkspaceFiles(SAMPLE_FILES, '').length, 4);
  assert.equal(filterWorkspaceFiles(SAMPLE_FILES, '   ').length, 4);
});

test('filterWorkspaceFiles supports case-insensitive multi-token and language matching', () => {
  const tsxMatches = filterWorkspaceFiles(SAMPLE_FILES, 'sidebar tsx');
  assert.deepEqual(
    tsxMatches.map((f) => f.path),
    ['src/components/Sidebar.tsx'],
  );

  const cssMatches = filterWorkspaceFiles(SAMPLE_FILES, 'CSS');
  assert.deepEqual(
    cssMatches.map((f) => f.path),
    ['src/styles/app.css'],
  );
});

test('filterWorkspaceFiles ranks basename matches ahead of directory substring matches', () => {
  const matches = filterWorkspaceFiles(SAMPLE_FILES, 'app');
  assert.equal(matches[0].path, 'src/App.tsx');
  assert.equal(matches[1].path, 'src/styles/app.css');
});

test('filterWorkspaceFiles returns empty array when no files match', () => {
  assert.deepEqual(filterWorkspaceFiles(SAMPLE_FILES, 'nonexistent-xyz'), []);
});
