import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_RADIUS,
  VICTORY_WAVE,
  bodyDatasetStateForPhase,
  buildWaveQueue,
  circlesOverlap,
  clampToArena,
  createEnemyForWave,
  createInitialPlayer,
  getWaveBudget,
  scoreForKill,
  stepEnemyBehavior,
} from './arenaLogic';

test('getWaveBudget ramps spawn count and introduces chargers from wave 2', () => {
  const w1 = getWaveBudget(1);
  const w3 = getWaveBudget(3);
  assert.equal(w1.chargers, 0);
  assert.ok(w1.marksmen >= 1);
  assert.ok(w3.totalEnemies > w1.totalEnemies);
  assert.ok(w3.chargers >= 2);
  assert.ok(w3.speedMultiplier > w1.speedMultiplier);
});

test('buildWaveQueue returns exact budget length with distinct archetypes', () => {
  const queue = buildWaveQueue(3);
  const budget = getWaveBudget(3);
  assert.equal(queue.length, budget.totalEnemies);
  assert.ok(queue.includes('stalker'));
  assert.ok(queue.includes('marksman'));
  assert.ok(queue.includes('charger'));
});

test('charger executes windup telegraph before charging when token budget allows', () => {
  const player = createInitialPlayer();
  player.x = 0;
  player.z = 0;
  const charger = createEnemyForWave(1, 'charger', 0, 2);
  charger.x = 10;
  charger.z = 0;
  charger.attackCooldown = 0;

  const res1 = stepEnemyBehavior(charger, player, 0.016, 1, 2);
  assert.equal(res1.telegraphStarted, true);
  assert.equal(res1.consumedToken, true);
  assert.equal(charger.actionState, 'windup');

  // Advance past telegraph duration -> transitions to attack dash
  stepEnemyBehavior(charger, player, 0.7, 1, 1);
  assert.equal(charger.actionState, 'attack');
  assert.ok(Math.abs(charger.vx) > 15);
});

test('marksman maintains kiting range and emits projectile after windup', () => {
  const player = createInitialPlayer();
  player.x = 0;
  player.z = 0;
  const marksman = createEnemyForWave(2, 'marksman', 0, 1);
  marksman.x = 16;
  marksman.z = 0;
  marksman.attackCooldown = 0;

  const resStart = stepEnemyBehavior(marksman, player, 0.016, 1, 1);
  assert.equal(resStart.telegraphStarted, true);
  assert.equal(marksman.actionState, 'windup');

  const resFire = stepEnemyBehavior(marksman, player, 0.6, 1, 0);
  assert.ok(resFire.spawnProjectile);
  assert.equal(resFire.releasedToken, true);
  assert.equal(marksman.actionState, 'move');
});

test('clampToArena keeps coordinates inside playable boundary', () => {
  const clamped = clampToArena({ x: 100, z: 0 }, 1.2);
  assert.ok(clamped.x <= ARENA_RADIUS - 1.2 + 0.0001);
});

test('circlesOverlap detects collisions and bodyDatasetStateForPhase maps victory to gameover', () => {
  assert.equal(circlesOverlap(0, 0, 1, 1.5, 0, 0.6), true);
  assert.equal(circlesOverlap(0, 0, 1, 3, 0, 0.6), false);
  assert.equal(bodyDatasetStateForPhase('victory'), 'gameover');
  assert.equal(bodyDatasetStateForPhase('playing'), 'playing');
  assert.ok(scoreForKill('charger', VICTORY_WAVE) > scoreForKill('stalker', 1));
});
