import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreviewDocument,
  detectIntentAndRoute,
  extractArtifactsFromMarkdown,
  parseSlashCommand,
} from './routerEngine';
import { computeLineDiff, extractAtMentions } from './diffEngine';

test('parseSlashCommand extracts valid MYRA specialist and strips prefix', () => {
  const parsed = parseSlashCommand('/debugger why is /api/guest/models returning 403?');
  assert.equal(parsed.specialist, 'debugger');
  assert.equal(parsed.cleanPrompt, 'why is /api/guest/models returning 403?');

  const unknown = parseSlashCommand('/unknowncmd hello');
  assert.equal(unknown.specialist, null);
  assert.equal(unknown.cleanPrompt, '/unknowncmd hello');
});

test('detectIntentAndRoute routes coding, agentMode, and research tasks accurately', () => {
  const codeRoute = detectIntentAndRoute({
    prompt: 'Build a responsive pricing page in HTML and Tailwind',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'build',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(codeRoute.resolvedTier, 'coding');
  assert.equal(codeRoute.geminiModel, 'gemini-3.1-flash-lite');
  assert.equal(codeRoute.thinkingLevel, 'HIGH');

  const explicitHydrogen = detectIntentAndRoute({
    prompt: 'Build a responsive pricing page in HTML and Tailwind',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'build',
    explicitModel: 'gemini-4-hydrogen',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(explicitHydrogen.geminiModel, 'gemini-4-hydrogen');

  const flashRoute = detectIntentAndRoute({
    prompt: 'Halo ringkas ini dalam 1 kalimat',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'ask',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(flashRoute.resolvedTier, 'flash');
  assert.equal(flashRoute.geminiModel, 'gemini-3.1-flash-lite');
  assert.equal(flashRoute.thinkingLevel, 'LOW');
});

test('extractArtifactsFromMarkdown extracts named and default workspace files', () => {
  const md = [
    'Here is your landing page:',
    '<!-- file: index.html -->',
    '```html',
    '<h1>Hello MYAI</h1>',
    '```',
    '',
    '```css:styles.css',
    'h1 { color: #6366f1; }',
    '```',
  ].join('\n');

  const files = extractArtifactsFromMarkdown(md);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'index.html');
  assert.equal(files[1].path, 'styles.css');
});

test('buildPreviewDocument merges HTML, CSS, and sandbox console bridge cleanly', () => {
  const doc = buildPreviewDocument([
    {
      path: 'index.html',
      language: 'html',
      content: '<html><head><title>Test</title></head><body><main>Hi</main></body></html>',
      updatedAt: 1,
    },
    {
      path: 'styles.css',
      language: 'css',
      content: 'body { background: #111; }',
      updatedAt: 1,
    },
  ]);

  assert.match(doc, /myai-sandbox-log/);
  assert.match(doc, /<style>\s*body \{ background: #111; \}\s*<\/style>/);
  assert.match(doc, /<main>Hi<\/main>/);
});

test('computeLineDiff and extractAtMentions compute accurate diffs and context tokens', () => {
  const diff = computeLineDiff('line1\nline2\nline3', 'line1\nline2-edited\nline3\nline4');
  assert.equal(diff.some((d) => d.type === 'remove' && d.text === 'line2'), true);
  assert.equal(diff.some((d) => d.type === 'add' && d.text === 'line2-edited'), true);
  assert.equal(diff.some((d) => d.type === 'add' && d.text === 'line4'), true);

  const mentions = extractAtMentions('Check @index.html and @memory against @diagnostics please @index.html');
  assert.deepEqual(mentions, ['index.html', 'memory', 'diagnostics']);
});

test('detectIntentAndRoute and extractArtifactsFromMarkdown support Word, PPT, Excel and ecosystem skills', () => {
  const pptRoute = detectIntentAndRoute({
    prompt: 'Tolong buatkan presentasi pitch deck tentang AI',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'build',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(pptRoute.specialist, 'ppt');
  assert.equal(pptRoute.geminiModel, 'gemini-3.1-flash-lite');

  const qoderSlash = parseSlashCommand('/repowiki map architecture');
  assert.equal(qoderSlash.specialist, 'repowiki');

  const extracted = extractArtifactsFromMarkdown(
    '```word:proposal.docx.json\n{"kind":"word","title":"Proposal","sections":[]}\n```\n```json\n{"kind":"excel","title":"RAB","sheets":[]}\n```',
  );
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].path, 'proposal.docx.json');
  assert.equal(extracted[1].path, 'workbook.xlsx.json');
});

test('detectIntentAndRoute accurately aligns natural-language niches without slash commands', () => {
  const sec = detectIntentAndRoute({
    prompt: 'Audit keamanan XSS dan aturan firestore.rules aplikasi saya',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'ask',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(sec.specialist, 'security');
  assert.equal(sec.resolvedTier, 'pro');

  const kpi = detectIntentAndRoute({
    prompt: 'Hitung strategi harga, churn rate, dan LTV CAC SaaS B2B',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    agentMode: 'ask',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(kpi.specialist, 'analyst');

  const qoderProfile = detectIntentAndRoute({
    prompt: 'Pecahkan rencana refactor modul auth agar aman dan terukur',
    selectedTier: 'auto',
    activeSpecialist: 'myra',
    engineProfile: 'qoder',
    agentMode: 'build',
    myraEnabled: true,
    webSearch: false,
    deepResearch: false,
  });
  assert.equal(qoderProfile.specialist, 'quest');
});

