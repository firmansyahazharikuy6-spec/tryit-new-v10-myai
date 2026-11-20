import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelSafeThinkingLevel,
  buildResilientModelChain,
  classifyGeminiError,
  isModelInCooldown,
  recordModelFailure,
  recordModelSuccess,
  sanitizeChatHistory,
  type CoreGeminiModel,
  type ModelHealthRecord,
} from './modelStability';

test('classifyGeminiError detects 429 quota, 503 unavailable, timeout, and invalid key cleanly', () => {
  const quota = classifyGeminiError(
    new Error('429 RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProjectPerModel-FreeTier'),
  );
  assert.equal(quota.kind, 'quota_or_billing');
  assert.equal(quota.retryableWithFallback, true);

  const spike = classifyGeminiError(
    new Error('503 UNAVAILABLE: This model is currently experiencing high demand.'),
  );
  assert.equal(spike.kind, 'unavailable');
  assert.equal(spike.retryableWithFallback, true);
  assert.equal(spike.sameModelRetry, true);

  const timeout = classifyGeminiError(new Error('Upstream model stream timed out after 10000ms'));
  assert.equal(timeout.kind, 'timeout');
  assert.equal(timeout.retryableWithFallback, true);

  const badKey = classifyGeminiError(new Error('API_KEY_INVALID: API key not valid'));
  assert.equal(badKey.kind, 'auth');
  assert.equal(badKey.retryableWithFallback, false);
});

test('buildResilientModelChain puts healthy fallback ahead of cooled-down models', () => {
  const health = new Map<CoreGeminiModel, ModelHealthRecord>();
  const now = 1_000_000;

  // Paid model hits free-tier quota limit -> 5m cooldown
  recordModelFailure(
    health,
    'gemini-4-neon',
    classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED FreeTier')),
    now,
  );
  // Hydrogen hits 503 spike -> 45s cooldown
  recordModelFailure(
    health,
    'gemini-4-hydrogen',
    classifyGeminiError(new Error('503 UNAVAILABLE')),
    now,
  );

  const chain = buildResilientModelChain('gemini-4-neon', health, now + 1000);
  assert.equal(chain[0], 'gemini-3.1-flash-lite');
  assert.deepEqual(chain, [
    'gemini-3.1-flash-lite',
    'gemini-4-neon',
    'gemini-4-hydrogen',
  ]);
});

test('cooldown expires and recordModelSuccess restores primary priority', () => {
  const health = new Map<CoreGeminiModel, ModelHealthRecord>();
  const now = 5_000_000;

  const failRec = recordModelFailure(
    health,
    'gemini-4-hydrogen',
    classifyGeminiError(new Error('503 UNAVAILABLE')),
    now,
  );
  assert.equal(isModelInCooldown(failRec, now + 10_000), true);
  assert.equal(isModelInCooldown(failRec, now + 60_000), false);

  recordModelSuccess(health, 'gemini-4-hydrogen', 820, now + 60_500);
  const chain = buildResilientModelChain('gemini-4-hydrogen', health, now + 61_000);
  assert.equal(chain[0], 'gemini-4-hydrogen');
  assert.equal(chain[1], 'gemini-3.1-flash-lite');
});

test('buildModelSafeThinkingLevel keeps thinking levels compatible across all models', () => {
  assert.equal(buildModelSafeThinkingLevel('gemini-3.1-flash-lite', 'HIGH'), 'MEDIUM');
  assert.equal(buildModelSafeThinkingLevel('gemini-3.1-flash-lite', 'LOW'), 'LOW');
  assert.equal(buildModelSafeThinkingLevel('gemini-4-hydrogen', 'HIGH'), 'HIGH');
});

test('sanitizeChatHistory drops leading model turns and merges consecutive user turns', () => {
  const contents = sanitizeChatHistory(
    [
      { role: 'assistant', content: 'Orphan welcome text' },
      { role: 'user', content: 'First user attempt' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'Second user attempt after error' },
      { role: 'assistant', content: 'Model answer' },
      { role: 'user', content: 'Trailing history user turn' },
    ],
    'Final active question',
  );

  assert.equal(contents.length, 3);
  assert.equal(contents[0].role, 'user');
  assert.match(contents[0].parts[0].text, /First user attempt[\s\S]*Second user attempt/);
  assert.equal(contents[1].role, 'model');
  assert.equal(contents[1].parts[0].text, 'Model answer');
  assert.equal(contents[2].role, 'user');
  assert.match(contents[2].parts[0].text, /Trailing history user turn[\s\S]*Final active question/);
});
