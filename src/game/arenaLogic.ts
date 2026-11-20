export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export type EnemyArchetype = 'stalker' | 'marksman' | 'charger';

export type EnemyActionState = 'move' | 'windup' | 'attack' | 'ko';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  dashCooldown: number;
  dashTimer: number;
  fireCooldown: number;
  invulnTimer: number;
  hitFlashTimer: number;
  dashDirX: number;
  dashDirZ: number;
}

export interface EnemyState {
  id: number;
  archetype: EnemyArchetype;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  actionState: EnemyActionState;
  stateTimer: number;
  attackCooldown: number;
  chargeDirX: number;
  chargeDirZ: number;
  hitFlashTimer: number;
  hasToken: boolean;
}

export interface ProjectileState {
  id: number;
  fromPlayer: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  ttl: number;
  damage: number;
  radius: number;
}

export interface ArenaSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  wave: number;
  maxWaves: number;
  kills: number;
  hp: number;
  maxHp: number;
  dashReadyRatio: number;
  elapsedSec: number;
  enemiesRemaining: number;
  damageTaken: number;
}

export const ARENA_RADIUS = 36;
export const MAX_CONCURRENT_ATTACK_TOKENS = 3;
export const VICTORY_WAVE = 5;

export function createInitialPlayer(): PlayerState {
  return {
    x: 0,
    z: 8,
    vx: 0,
    vz: 0,
    yaw: Math.PI,
    hp: 5,
    maxHp: 5,
    dashCooldown: 0,
    dashTimer: 0,
    fireCooldown: 0,
    invulnTimer: 0,
    hitFlashTimer: 0,
    dashDirX: 0,
    dashDirZ: -1,
  };
}

export function getWaveBudget(wave: number): {
  totalEnemies: number;
  stalkers: number;
  marksmen: number;
  chargers: number;
  speedMultiplier: number;
} {
  const clamped = Math.max(1, Math.min(20, wave));
  const totalEnemies = 4 + clamped * 3;
  const chargers = clamped >= 2 ? Math.max(1, Math.floor(clamped * 0.8)) : 0;
  const marksmen = clamped >= 1 ? Math.max(1, Math.floor(1 + clamped * 0.7)) : 0;
  const stalkers = Math.max(2, totalEnemies - chargers - marksmen);
  const speedMultiplier = 1 + (clamped - 1) * 0.08;
  return {
    totalEnemies: stalkers + marksmen + chargers,
    stalkers,
    marksmen,
    chargers,
    speedMultiplier,
  };
}

export function buildWaveQueue(wave: number): EnemyArchetype[] {
  const budget = getWaveBudget(wave);
  const queue: EnemyArchetype[] = [];
  for (let i = 0; i < budget.stalkers; i++) queue.push('stalker');
  for (let i = 0; i < budget.marksmen; i++) queue.push('marksman');
  for (let i = 0; i < budget.chargers; i++) queue.push('charger');
  // Interleave archetypes deterministically so every wave mixes behaviors
  const mixed: EnemyArchetype[] = [];
  let step = 0;
  while (queue.length > 0) {
    const idx = (step * 3) % queue.length;
    mixed.push(queue.splice(idx, 1)[0]);
    step++;
  }
  return mixed;
}

export function createEnemyForWave(
  id: number,
  archetype: EnemyArchetype,
  angleRad: number,
  wave: number,
): EnemyState {
  const spawnDist = ARENA_RADIUS - 3.5;
  const x = Math.cos(angleRad) * spawnDist;
  const z = Math.sin(angleRad) * spawnDist;

  if (archetype === 'marksman') {
    return {
      id,
      archetype,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw: Math.atan2(-x, -z),
      hp: 2 + Math.floor(wave / 3),
      maxHp: 2 + Math.floor(wave / 3),
      radius: 1.05,
      actionState: 'move',
      stateTimer: 0,
      attackCooldown: 1.1 + (id % 3) * 0.35,
      chargeDirX: 0,
      chargeDirZ: 0,
      hitFlashTimer: 0,
      hasToken: false,
    };
  }

  if (archetype === 'charger') {
    return {
      id,
      archetype,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw: Math.atan2(-x, -z),
      hp: 4 + Math.floor(wave / 2),
      maxHp: 4 + Math.floor(wave / 2),
      radius: 1.35,
      actionState: 'move',
      stateTimer: 0,
      attackCooldown: 1.4,
      chargeDirX: 0,
      chargeDirZ: 0,
      hitFlashTimer: 0,
      hasToken: false,
    };
  }

  return {
    id,
    archetype: 'stalker',
    x,
    z,
    vx: 0,
    vz: 0,
    yaw: Math.atan2(-x, -z),
    hp: 2 + Math.floor(wave / 4),
    maxHp: 2 + Math.floor(wave / 4),
    radius: 0.9,
    actionState: 'move',
    stateTimer: 0,
    attackCooldown: 0.8,
    chargeDirX: 0,
    chargeDirZ: 0,
    hitFlashTimer: 0,
    hasToken: false,
  };
}

export function clampToArena(pos: Vec2, margin = 1.2): Vec2 {
  const maxR = ARENA_RADIUS - margin;
  const distSq = pos.x * pos.x + pos.z * pos.z;
  if (distSq <= maxR * maxR) return pos;
  const dist = Math.sqrt(distSq) || 1;
  return {
    x: (pos.x / dist) * maxR,
    z: (pos.z / dist) * maxR,
  };
}

export function countActiveAttackTokens(enemies: EnemyState[]): number {
  let count = 0;
  for (const e of enemies) {
    if (e.hasToken && e.actionState !== 'ko') count++;
  }
  return count;
}

export function scoreForKill(archetype: EnemyArchetype, wave: number): number {
  const base =
    archetype === 'charger' ? 220 : archetype === 'marksman' ? 150 : 100;
  return base + (wave - 1) * 25;
}

export function bodyDatasetStateForPhase(
  phase: GamePhase,
): 'title' | 'playing' | 'paused' | 'gameover' {
  if (phase === 'victory') return 'gameover';
  return phase;
}

export function circlesOverlap(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  const sum = ar + br;
  return dx * dx + dz * dz <= sum * sum;
}

export function stepEnemyBehavior(
  enemy: EnemyState,
  player: PlayerState,
  dt: number,
  speedMult: number,
  availableTokenBudget: number,
): {
  spawnProjectile?: {
    x: number;
    z: number;
    vx: number;
    vz: number;
    damage: number;
  };
  telegraphStarted?: boolean;
  consumedToken?: boolean;
  releasedToken?: boolean;
} {
  if (enemy.hitFlashTimer > 0) {
    enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
  }

  if (enemy.actionState === 'ko') {
    enemy.stateTimer -= dt;
    enemy.x += enemy.vx * dt;
    enemy.z += enemy.vz * dt;
    enemy.vx *= Math.max(0, 1 - dt * 5);
    enemy.vz *= Math.max(0, 1 - dt * 5);
    return {};
  }

  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const nx = dx / dist;
  const nz = dz / dist;

  if (enemy.archetype === 'stalker') {
    // Flanks with sinusoidal weave so stalkers do not stack into single file
    const weave = Math.sin(enemy.id * 1.7 + dist * 0.45) * 0.42;
    const tx = -nz * weave;
    const tz = nx * weave;
    const dirLen = Math.hypot(nx + tx, nz + tz) || 1;
    const speed = 7.4 * speedMult;
    enemy.vx = ((nx + tx) / dirLen) * speed;
    enemy.vz = ((nz + tz) / dirLen) * speed;
    enemy.x += enemy.vx * dt;
    enemy.z += enemy.vz * dt;
    enemy.yaw = Math.atan2(enemy.vx, enemy.vz);
    return {};
  }

  if (enemy.archetype === 'marksman') {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    if (enemy.actionState === 'windup') {
      enemy.stateTimer -= dt;
      enemy.yaw = Math.atan2(nx, nz);
      if (enemy.stateTimer <= 0) {
        enemy.actionState = 'move';
        enemy.attackCooldown = 2.0 / speedMult;
        const wasToken = enemy.hasToken;
        enemy.hasToken = false;
        return {
          releasedToken: wasToken,
          spawnProjectile: {
            x: enemy.x + nx * 1.1,
            z: enemy.z + nz * 1.1,
            vx: nx * 16.5,
            vz: nz * 16.5,
            damage: 1,
          },
        };
      }
      return {};
    }

    // Maintain 14-18m orbital ring
    const idealMin = 13.5;
    const idealMax = 18.0;
    const orbitSign = enemy.id % 2 === 0 ? 1 : -1;
    let radial = 0;
    if (dist < idealMin) radial = -1;
    else if (dist > idealMax) radial = 1;

    const speed = 5.4 * speedMult;
    const vx = (nx * radial + -nz * orbitSign * 0.85) * speed;
    const vz = (nz * radial + nx * orbitSign * 0.85) * speed;
    enemy.vx = vx;
    enemy.vz = vz;
    enemy.x += vx * dt;
    enemy.z += vz * dt;
    enemy.yaw = Math.atan2(nx, nz);

    if (enemy.attackCooldown <= 0 && dist <= 26 && availableTokenBudget > 0) {
      enemy.actionState = 'windup';
      enemy.stateTimer = 0.55; // Visible & audible telegraph window
      enemy.hasToken = true;
      return { telegraphStarted: true, consumedToken: true };
    }
    return {};
  }

  // Charger: approaches to medium range -> pauses 0.65s glowing telegraph -> high-speed dash
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

  if (enemy.actionState === 'windup') {
    enemy.stateTimer -= dt;
    enemy.vx = 0;
    enemy.vz = 0;
    enemy.yaw = Math.atan2(nx, nz);
    enemy.chargeDirX = nx;
    enemy.chargeDirZ = nz;
    if (enemy.stateTimer <= 0) {
      enemy.actionState = 'attack';
      enemy.stateTimer = 0.58;
      const chargeSpeed = 23.5 * speedMult;
      enemy.vx = enemy.chargeDirX * chargeSpeed;
      enemy.vz = enemy.chargeDirZ * chargeSpeed;
    }
    return {};
  }

  if (enemy.actionState === 'attack') {
    enemy.stateTimer -= dt;
    enemy.x += enemy.vx * dt;
    enemy.z += enemy.vz * dt;
    if (enemy.stateTimer <= 0) {
      enemy.actionState = 'move';
      enemy.attackCooldown = 2.2;
      const wasToken = enemy.hasToken;
      enemy.hasToken = false;
      enemy.vx = 0;
      enemy.vz = 0;
      return { releasedToken: wasToken };
    }
    return {};
  }

  const approachSpeed = 4.3 * speedMult;
  enemy.vx = nx * approachSpeed;
  enemy.vz = nz * approachSpeed;
  enemy.x += enemy.vx * dt;
  enemy.z += enemy.vz * dt;
  enemy.yaw = Math.atan2(nx, nz);

  if (dist < 17 && enemy.attackCooldown <= 0 && availableTokenBudget > 0) {
    enemy.actionState = 'windup';
    enemy.stateTimer = 0.65;
    enemy.hasToken = true;
    enemy.chargeDirX = nx;
    enemy.chargeDirZ = nz;
    return { telegraphStarted: true, consumedToken: true };
  }

  return {};
}
