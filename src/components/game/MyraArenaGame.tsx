import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Pause, Play, RotateCcw, Volume2, VolumeX, ArrowLeft, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { loadPersonalBestScores, saveGameScore } from '../../lib/firebase';
import { syncQueueManager } from '../../lib/syncQueueManager';
import { isRetryableSyncError } from '../../utils/offlineSyncQueue';
import {
  ARENA_RADIUS,
  MAX_CONCURRENT_ATTACK_TOKENS,
  VICTORY_WAVE,
  bodyDatasetStateForPhase,
  buildWaveQueue,
  circlesOverlap,
  clampToArena,
  countActiveAttackTokens,
  createEnemyForWave,
  createInitialPlayer,
  getWaveBudget,
  scoreForKill,
  stepEnemyBehavior,
  type ArenaSnapshot,
  type EnemyArchetype,
  type EnemyState,
  type GamePhase,
  type PlayerState,
  type ProjectileState,
} from '../../game/arenaLogic';

interface MyraArenaGameProps {
  onExitGame: () => void;
}

const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _color = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createBasaltGroundTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0e131e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle organic basalt speckle + subtle hex-like tactical grid
  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 512;
    const y = (i * 139) % 512;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(x, y, 3, 3);
  }

  ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 512; g += 64) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(512, g);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTex(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Procedural Web Audio sound cues
class ArenaAudio {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
      }
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  playTone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType, gainVal = 0.08) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Ignore audio context edge cases
    }
  }

  fire() {
    this.playTone(680, 260, 0.09, 'triangle', 0.06);
  }
  hit() {
    this.playTone(320, 120, 0.08, 'sawtooth', 0.05);
  }
  kill() {
    this.playTone(520, 880, 0.14, 'sine', 0.08);
  }
  dash() {
    this.playTone(220, 560, 0.12, 'sine', 0.07);
  }
  telegraph() {
    this.playTone(440, 620, 0.16, 'square', 0.04);
  }
  damage() {
    this.playTone(150, 55, 0.22, 'sawtooth', 0.12);
  }
  waveClear() {
    this.playTone(523, 784, 0.28, 'triangle', 0.09);
  }
}

// Build composite multi-part procedural actor meshes pivoted at bottom-center (y = 0)
function buildPlayerMesh(shadowTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();

  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 1.05);
  hullShape.lineTo(0.74, -0.55);
  hullShape.lineTo(0.28, -0.82);
  hullShape.lineTo(-0.28, -0.82);
  hullShape.lineTo(-0.74, -0.55);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.06,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    metalness: 0.85,
    roughness: 0.22,
    clearcoat: 0.4,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.72;
  hull.castShadow = true;
  group.add(hull);

  // Part 2: Cockpit visor canopy
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.65,
    roughness: 0.12,
    metalness: 0.2,
  });
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), visorMat);
  visor.scale.set(0.85, 0.55, 1.35);
  visor.position.set(0, 0.82, 0.12);
  group.add(visor);

  // Part 3 & 4: Twin weapon rail barrels
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.9,
    roughness: 0.3,
  });
  const barrelGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.95, 10);
  barrelGeo.rotateX(Math.PI / 2);
  const leftBarrel = new THREE.Mesh(barrelGeo, railMat);
  leftBarrel.position.set(-0.46, 0.54, 0.55);
  const rightBarrel = new THREE.Mesh(barrelGeo, railMat);
  rightBarrel.position.set(0.46, 0.54, 0.55);
  group.add(leftBarrel, rightBarrel);

  // Part 5 & 6: Twin lateral thruster nacelles
  const podGeo = new THREE.BoxGeometry(0.24, 0.26, 0.85);
  const podMat = new THREE.MeshStandardMaterial({
    color: 0x4f46e5,
    metalness: 0.72,
    roughness: 0.28,
  });
  const leftPod = new THREE.Mesh(podGeo, podMat);
  leftPod.position.set(-0.68, 0.52, -0.2);
  const rightPod = new THREE.Mesh(podGeo, podMat);
  rightPod.position.set(0.68, 0.52, -0.2);
  group.add(leftPod, rightPod);

  // Part 7: Rear plasma thruster vent
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.2, 12), ventMat);
  vent.rotation.x = Math.PI / 2;
  vent.position.set(0, 0.54, -0.88);
  group.add(vent);

  // Ground contact shadow disc
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  group.userData = { hullMat, visorMat };
  return group;
}

function buildEnemyMesh(
  archetype: EnemyArchetype,
  shadowTex: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  let accentMat: THREE.MeshStandardMaterial;

  if (archetype === 'stalker') {
    // 4-part crescent blade flanker
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xbe123c,
      roughness: 0.34,
      metalness: 0.68,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), bodyMat);
    core.scale.set(1.1, 0.65, 1.35);
    core.position.y = 0.65;
    core.castShadow = true;

    const wingGeo = new THREE.ConeGeometry(0.24, 0.9, 5);
    wingGeo.rotateZ(Math.PI / 2);
    const leftWing = new THREE.Mesh(wingGeo, bodyMat);
    leftWing.position.set(-0.55, 0.65, 0.1);
    leftWing.rotation.y = 0.35;
    const rightWing = new THREE.Mesh(wingGeo, bodyMat);
    rightWing.rotation.z = Math.PI;
    rightWing.position.set(0.55, 0.65, 0.1);
    rightWing.rotation.y = -0.35;

    accentMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      emissive: 0xf43f5e,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), accentMat);
    eye.position.set(0, 0.72, 0.48);

    group.add(core, leftWing, rightWing, eye);
  } else if (archetype === 'marksman') {
    // 5-part orbital turret pylon
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.75,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.72, 0.45, 6), pylonMat);
    base.position.y = 0.25;
    base.castShadow = true;

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 6), pylonMat);
    spire.position.y = 1.05;
    spire.castShadow = true;

    accentMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.3,
      roughness: 0.2,
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 10, 24), accentMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.1;

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), accentMat);
    lens.position.set(0, 1.15, 0.38);

    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.45, 8),
      pylonMat,
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 1.15, 0.56);

    group.add(base, spire, halo, lens, nozzle);
  } else {
    // Charger: 5-part heavy armored ram wedge
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.65,
      metalness: 0.55,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.25,
      metalness: 0.8,
    });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.7), armorMat);
    hull.position.y = 0.62;
    hull.castShadow = true;

    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.88, 1.1, 4), trimMat);
    prow.rotation.x = Math.PI / 2;
    prow.rotation.z = Math.PI / 4;
    prow.position.set(0, 0.62, 1.05);
    prow.castShadow = true;

    const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.9), trimMat);
    leftShoulder.position.set(-0.86, 0.78, -0.1);
    const rightShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.9), trimMat);
    rightShoulder.position.set(0.86, 0.78, -0.1);

    accentMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), accentMat);
    core.position.set(0, 1.08, 0);

    group.add(hull, prow, leftShoulder, rightShoulder, core);
  }

  // Telegraph ring under enemy (hidden unless windup)
  const ringMat = new THREE.MeshBasicMaterial({
    color: archetype === 'charger' ? 0xf97316 : 0xfbbf24,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const telegraphRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.35, 24), ringMat);
  telegraphRing.rotation.x = -Math.PI / 2;
  telegraphRing.position.y = 0.05;
  telegraphRing.visible = false;
  group.add(telegraphRing);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(archetype === 'charger' ? 3.1 : 2.1, archetype === 'charger' ? 3.1 : 2.1),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);

  group.userData = { accentMat, telegraphRing };
  return group;
}

export function MyraArenaGame({ onExitGame }: MyraArenaGameProps) {
  const { user } = useAuth();
  const mountRef = useRef<HTMLDivElement>(null);

  const [snapshot, setSnapshot] = useState<ArenaSnapshot>(() => ({
    phase:
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1'
        ? 'playing'
        : 'title',
    score: 0,
    bestScore: 0,
    wave: 1,
    maxWaves: VICTORY_WAVE,
    kills: 0,
    hp: 5,
    maxHp: 5,
    dashReadyRatio: 1,
    elapsedSec: 0,
    enemiesRemaining: 0,
    damageTaken: 0,
  }));

  const [muted, setMuted] = useState(false);
  const [ghostHp, setGhostHp] = useState(5);
  const [cloudSavedNotice, setCloudSavedNotice] = useState<string | null>(null);
  const [cloudBest, setCloudBest] = useState<number | null>(null);

  const audioRef = useRef(new ArenaAudio());
  const actionsRef = useRef<{
    startGame: () => void;
    togglePause: () => void;
    restartGame: () => void;
  }>({
    startGame: () => {},
    togglePause: () => {},
    restartGame: () => {},
  });

  // Load personal best from Firestore when signed in
  useEffect(() => {
    if (!user) return;
    void loadPersonalBestScores(user.uid)
      .then((rows) => {
        if (rows.length > 0) {
          setCloudBest(rows[0].score);
        }
      })
      .catch(() => {
        // Non-blocking best score lookup
      });
  }, [user]);

  // Sync document.body.dataset.state for predictable headless testing
  useEffect(() => {
    document.body.dataset.state = bodyDatasetStateForPhase(snapshot.phase);
    return () => {
      delete document.body.dataset.state;
    };
  }, [snapshot.phase]);

  // Ghost health lag bar
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGhostHp(snapshot.hp);
    }, 280);
    return () => clearTimeout(timer);
  }, [snapshot.hp]);

  // Auto-save score on Game Over or Victory if user is signed in
  const savedRunKeyRef = useRef<string>('');
  useEffect(() => {
    if (
      !user ||
      (snapshot.phase !== 'gameover' && snapshot.phase !== 'victory') ||
      snapshot.score <= 0
    ) {
      return;
    }
    const runKey = `${snapshot.phase}-${snapshot.score}-${snapshot.wave}-${snapshot.kills}`;
    if (savedRunKeyRef.current === runKey) return;
    savedRunKeyRef.current = runKey;

    const payload = {
      playerName: user.displayName || 'Pilot',
      score: snapshot.score,
      wave: snapshot.wave,
      kills: snapshot.kills,
      durationSec: Math.round(snapshot.elapsedSec),
    };

    const runSave = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline: buffering score');
      }
      await saveGameScore(user.uid, payload);
      setCloudSavedNotice('Personal score synced to Firestore leaderboard.');
      setCloudBest((prev) => (prev === null || snapshot.score > prev ? snapshot.score : prev));
    };

    void runSave().catch((err) => {
      if (isRetryableSyncError(err)) {
        syncQueueManager.enqueue(
          {
            kind: 'game:score',
            uid: user.uid,
            label: `Sync Arena score (${snapshot.score})`,
            payload,
          },
          { immediate: typeof navigator !== 'undefined' && navigator.onLine },
        );
        setCloudSavedNotice('Score buffered locally — will sync automatically when online.');
        setCloudBest((prev) => (prev === null || snapshot.score > prev ? snapshot.score : prev));
      } else {
        setCloudSavedNotice(null);
      }
    });
  }, [user, snapshot.phase, snapshot.score, snapshot.wave, snapshot.kills, snapshot.elapsedSec]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth || 1280;
    const height = container.clientHeight || window.innerHeight || 720;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyBg = new THREE.Color(0x0a0e17);
    scene.background = skyBg;
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.0155);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 160);
    camera.position.set(0, 26, 26);
    camera.lookAt(0, 0, 4);

    // Warm key + cool Hemisphere + indigo rim
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1c1917, 0.72);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe8c2, 2.1);
    sun.position.set(18, 28, 16);
    sun.castShadow = !isSoftwareGl;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 85;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x6366f1, 1.15);
    rim.position.set(-20, 12, -20);
    scene.add(rim);

    // Outdoor extending obsidian terrain + procedural perimeter crystal outcrops (no boxy walls)
    const groundTex = createBasaltGroundTexture(
      renderer.capabilities.getMaxAnisotropy(),
    );
    const terrainGeo = new THREE.CircleGeometry(96, 64);
    const terrainMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.85,
      metalness: 0.12,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Glowing combat perimeter ring (Y = 0.025, polygonOffset avoids Z-fighting)
    const perimeterGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.3, ARENA_RADIUS + 0.15, 72);
    const perimeterMat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const perimeterRing = new THREE.Mesh(perimeterGeo, perimeterMat);
    perimeterRing.rotation.x = -Math.PI / 2;
    perimeterRing.position.y = 0.025;
    scene.add(perimeterRing);

    // Instanced natural basalt spires surrounding the outdoor crater ridge
    const ROCK_COUNT = 54;
    const rockGeo = new THREE.DodecahedronGeometry(1.7, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.18,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
    rocks.castShadow = !isSoftwareGl;
    rocks.receiveShadow = true;
    for (let i = 0; i < ROCK_COUNT; i++) {
      const a = (i / ROCK_COUNT) * Math.PI * 2 + (i % 3) * 0.08;
      const r = ARENA_RADIUS + 3.2 + (i % 5) * 4.2;
      const sx = 0.85 + ((i * 7) % 10) * 0.04;
      const sy = 1.1 + ((i * 11) % 10) * 0.22;
      const sz = 0.85 + ((i * 13) % 10) * 0.04;
      _v3A.set(Math.cos(a) * r, sy * 0.55, Math.sin(a) * r);
      _quat.setFromEuler(new THREE.Euler(0.1 * (i % 3), a, 0.08 * (i % 2)));
      _scaleVec.set(sx, sy, sz);
      _mat4.compose(_v3A, _quat, _scaleVec);
      rocks.setMatrixAt(i, _mat4);
      _color.setHSL(0.63 + (i % 4) * 0.015, 0.22, 0.16 + (i % 5) * 0.02);
      rocks.setColorAt(i, _color);
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    scene.add(rocks);

    const shadowTex = createContactShadowTex();
    const playerGroup = buildPlayerMesh(shadowTex);
    scene.add(playerGroup);

    // Pooled InstancedMesh for Projectiles (player cyan bolts + enemy amber orbs)
    const MAX_PROJ = 120;
    const projGeo = new THREE.SphereGeometry(0.32, 10, 8);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    const projInst = new THREE.InstancedMesh(projGeo, projMat, MAX_PROJ);
    projInst.frustumCulled = false;
    projInst.count = 0;
    scene.add(projInst);

    // Pooled InstancedMesh for Sparks / Impact Particles
    const MAX_SPARKS = 140;
    const sparkGeo = new THREE.OctahedronGeometry(0.22, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sparkInst = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    sparkInst.frustumCulled = false;
    sparkInst.count = 0;
    scene.add(sparkInst);

    interface Spark {
      active: boolean;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      ttl: number;
      maxTtl: number;
      colorHex: number;
    }
    const sparks: Spark[] = Array.from({ length: MAX_SPARKS }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ttl: 0,
      maxTtl: 0.4,
      colorHex: 0x38bdf8,
    }));

    function spawnSparks(x: number, y: number, z: number, count: number, colorHex: number) {
      let spawned = 0;
      for (const s of sparks) {
        if (!s.active) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 8;
          s.active = true;
          s.x = x;
          s.y = y;
          s.z = z;
          s.vx = Math.cos(angle) * speed;
          s.vy = 2.5 + Math.random() * 4.5;
          s.vz = Math.sin(angle) * speed;
          s.maxTtl = 0.26 + Math.random() * 0.22;
          s.ttl = s.maxTtl;
          s.colorHex = colorHex;
          spawned++;
          if (spawned >= count) break;
        }
      }
    }

    // Simulation state
    const enemyMeshes = new Map<number, THREE.Group>();
    const autostart =
      new URLSearchParams(window.location.search).get('autostart') === '1';

    const sim = {
      phase: (autostart ? 'playing' : 'title') as GamePhase,
      player: createInitialPlayer() as PlayerState,
      enemies: [] as EnemyState[],
      projectiles: [] as ProjectileState[],
      wave: 1,
      waveQueue: [] as EnemyArchetype[],
      spawnTimer: 0.4,
      nextId: 1,
      score: 0,
      bestScore: Number(localStorage.getItem('myra_arena_best_v1') || '0'),
      kills: 0,
      damageTaken: 0,
      elapsedSec: 0,
      hitstopTimer: 0,
      trauma: 0,
      uiSyncTimer: 0,
      firingHeld: false,
      aimX: 0,
      aimZ: 0,
      keys: {
        up: false,
        down: false,
        left: false,
        right: false,
        dash: false,
      },
    };

    function syncReactSnapshot(force = false) {
      if (!force && sim.uiSyncTimer < 0.08) return;
      sim.uiSyncTimer = 0;
      setSnapshot({
        phase: sim.phase,
        score: sim.score,
        bestScore: sim.bestScore,
        wave: sim.wave,
        maxWaves: VICTORY_WAVE,
        kills: sim.kills,
        hp: sim.player.hp,
        maxHp: sim.player.maxHp,
        dashReadyRatio:
          sim.player.dashCooldown <= 0
            ? 1
            : Math.max(0, 1 - sim.player.dashCooldown / 1.4),
        elapsedSec: sim.elapsedSec,
        enemiesRemaining: sim.enemies.filter((e) => e.actionState !== 'ko').length + sim.waveQueue.length,
        damageTaken: sim.damageTaken,
      });
    }

    function clearEnemyMeshes() {
      for (const grp of enemyMeshes.values()) {
        scene.remove(grp);
      }
      enemyMeshes.clear();
    }

    function resetSimulation(targetPhase: GamePhase) {
      clearEnemyMeshes();
      sim.phase = targetPhase;
      sim.player = createInitialPlayer();
      sim.enemies = [];
      sim.projectiles = [];
      sim.wave = 1;
      sim.waveQueue = buildWaveQueue(1);
      sim.spawnTimer = 0.25;
      sim.score = 0;
      sim.kills = 0;
      sim.damageTaken = 0;
      sim.elapsedSec = 0;
      sim.hitstopTimer = 0;
      sim.trauma = 0;
      savedRunKeyRef.current = '';
      setCloudSavedNotice(null);
      for (const s of sparks) s.active = false;
      syncReactSnapshot(true);
    }

    if (autostart) {
      sim.waveQueue = buildWaveQueue(1);
    }

    actionsRef.current.startGame = () => {
      audioRef.current.unlock();
      resetSimulation('playing');
    };
    actionsRef.current.restartGame = () => {
      audioRef.current.unlock();
      resetSimulation('playing');
    };
    actionsRef.current.togglePause = () => {
      if (sim.phase === 'playing') {
        sim.phase = 'paused';
        syncReactSnapshot(true);
      } else if (sim.phase === 'paused') {
        sim.phase = 'playing';
        syncReactSnapshot(true);
      }
    };

    // Input listeners (reset keys on blur/visibilitychange)
    function clearInputs() {
      sim.keys.up = false;
      sim.keys.down = false;
      sim.keys.left = false;
      sim.keys.right = false;
      sim.keys.dash = false;
      sim.firingHeld = false;
    }

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, _v3A)) {
        sim.aimX = _v3A.x;
        sim.aimZ = _v3A.z;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 && sim.phase === 'playing') {
        audioRef.current.unlock();
        onPointerMove(e);
        sim.firingHeld = true;
      }
    };

    const onPointerUp = () => {
      sim.firingHeld = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (sim.phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        actionsRef.current.startGame();
        return;
      }
      if (k === 'm') {
        setMuted((prev) => {
          const next = !prev;
          audioRef.current.muted = next;
          return next;
        });
        return;
      }
      if (e.key === 'Escape' || k === 'p') {
        if (sim.phase === 'playing' || sim.phase === 'paused') {
          actionsRef.current.togglePause();
        }
        return;
      }
      if (k === 'r' && (sim.phase === 'paused' || sim.phase === 'gameover' || sim.phase === 'victory')) {
        actionsRef.current.restartGame();
        return;
      }

      if (k === 'w' || e.key === 'ArrowUp') sim.keys.up = true;
      if (k === 's' || e.key === 'ArrowDown') sim.keys.down = true;
      if (k === 'a' || e.key === 'ArrowLeft') sim.keys.left = true;
      if (k === 'd' || e.key === 'ArrowRight') sim.keys.right = true;
      if (e.key === 'Shift') sim.keys.dash = true;
      if (e.key === ' ' && sim.phase === 'playing') {
        e.preventDefault();
        audioRef.current.unlock();
        sim.firingHeld = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') sim.keys.up = false;
      if (k === 's' || e.key === 'ArrowDown') sim.keys.down = false;
      if (k === 'a' || e.key === 'ArrowLeft') sim.keys.left = false;
      if (k === 'd' || e.key === 'ArrowRight') sim.keys.right = false;
      if (e.key === 'Shift') sim.keys.dash = false;
      if (e.key === ' ') sim.firingHeld = false;
    };

    const onVisibility = () => {
      if (document.hidden) clearInputs();
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastStamp = performance.now();

    function stepSimulation(dt: number) {
      if (sim.phase !== 'playing') return;

      sim.elapsedSec += dt;
      sim.uiSyncTimer += dt;
      sim.trauma = Math.max(0, sim.trauma - dt * 1.9);

      if (sim.hitstopTimer > 0) {
        sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
        return;
      }

      const p = sim.player;
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);

      let ix = (sim.keys.right ? 1 : 0) - (sim.keys.left ? 1 : 0);
      let iz = (sim.keys.down ? 1 : 0) - (sim.keys.up ? 1 : 0);
      const len = Math.hypot(ix, iz);
      if (len > 0) {
        ix /= len;
        iz /= len;
      }

      if (sim.keys.dash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
        p.dashTimer = 0.16;
        p.dashCooldown = 1.4;
        p.invulnTimer = Math.max(p.invulnTimer, 0.24);
        p.dashDirX = len > 0 ? ix : Math.sin(p.yaw);
        p.dashDirZ = len > 0 ? iz : Math.cos(p.yaw);
        audioRef.current.dash();
        spawnSparks(p.x, 0.5, p.z, 8, 0x38bdf8);
      }

      if (p.dashTimer > 0) {
        p.dashTimer = Math.max(0, p.dashTimer - dt);
        p.vx = p.dashDirX * 29;
        p.vz = p.dashDirZ * 29;
      } else {
        const moveSpeed = 12.6;
        p.vx = THREE.MathUtils.damp(p.vx, ix * moveSpeed, 14, dt);
        p.vz = THREE.MathUtils.damp(p.vz, iz * moveSpeed, 14, dt);
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const clampedP = clampToArena({ x: p.x, z: p.z }, 1.2);
      p.x = clampedP.x;
      p.z = clampedP.z;

      const aimDx = sim.aimX - p.x;
      const aimDz = sim.aimZ - p.z;
      if (aimDx * aimDx + aimDz * aimDz > 0.04) {
        p.yaw = Math.atan2(aimDx, aimDz);
      }

      // Player weapon fire (aims toward cursor raycast point)
      if (sim.firingHeld && p.fireCooldown <= 0) {
        p.fireCooldown = 0.16;
        const dirX = Math.sin(p.yaw);
        const dirZ = Math.cos(p.yaw);
        sim.projectiles.push({
          id: sim.nextId++,
          fromPlayer: true,
          x: p.x + dirX * 1.15,
          z: p.z + dirZ * 1.15,
          vx: dirX * 34,
          vz: dirZ * 34,
          ttl: 1.5,
          damage: 1,
          radius: 0.36,
        });
        audioRef.current.fire();
      }

      // Spawn enemies from wave queue
      if (sim.waveQueue.length > 0 && sim.enemies.length < 12) {
        sim.spawnTimer -= dt;
        if (sim.spawnTimer <= 0) {
          const arch = sim.waveQueue.shift()!;
          const spawnAngle = ((sim.nextId * 2.39996) % (Math.PI * 2));
          const enemy = createEnemyForWave(sim.nextId++, arch, spawnAngle, sim.wave);
          sim.enemies.push(enemy);
          const mesh = buildEnemyMesh(arch, shadowTex);
          enemyMeshes.set(enemy.id, mesh);
          scene.add(mesh);
          sim.spawnTimer = Math.max(0.32, 0.9 - sim.wave * 0.08);
        }
      }

      // Step enemy AI
      const budget = getWaveBudget(sim.wave);
      let activeTokens = countActiveAttackTokens(sim.enemies);
      for (let i = sim.enemies.length - 1; i >= 0; i--) {
        const e = sim.enemies[i];
        const res = stepEnemyBehavior(
          e,
          p,
          dt,
          budget.speedMultiplier,
          MAX_CONCURRENT_ATTACK_TOKENS - activeTokens,
        );
        if (res.consumedToken) activeTokens++;
        if (res.releasedToken) activeTokens = Math.max(0, activeTokens - 1);
        if (res.telegraphStarted) audioRef.current.telegraph();
        if (res.spawnProjectile) {
          sim.projectiles.push({
            id: sim.nextId++,
            fromPlayer: false,
            x: res.spawnProjectile.x,
            z: res.spawnProjectile.z,
            vx: res.spawnProjectile.vx,
            vz: res.spawnProjectile.vz,
            ttl: 2.6,
            damage: res.spawnProjectile.damage,
            radius: 0.42,
          });
        }

        const clampedE = clampToArena({ x: e.x, z: e.z }, 1.1);
        e.x = clampedE.x;
        e.z = clampedE.z;

        if (e.actionState === 'ko' && e.stateTimer <= 0) {
          const grp = enemyMeshes.get(e.id);
          if (grp) {
            scene.remove(grp);
            enemyMeshes.delete(e.id);
          }
          sim.enemies.splice(i, 1);
          continue;
        }

        if (
          e.actionState !== 'ko' &&
          p.invulnTimer <= 0 &&
          circlesOverlap(p.x, p.z, 0.85, e.x, e.z, e.radius * 0.85)
        ) {
          p.hp = Math.max(0, p.hp - 1);
          p.invulnTimer = 0.85;
          p.hitFlashTimer = 0.25;
          sim.damageTaken += 1;
          sim.hitstopTimer = 0.05;
          sim.trauma = Math.min(1, sim.trauma + 0.65);
          audioRef.current.damage();
          spawnSparks(p.x, 0.7, p.z, 12, 0xf43f5e);
          if (p.hp <= 0) {
            sim.phase = 'gameover';
            syncReactSnapshot(true);
            return;
          }
        }
      }

      // Step projectiles
      for (let i = sim.projectiles.length - 1; i >= 0; i--) {
        const pr = sim.projectiles[i];
        pr.ttl -= dt;
        pr.x += pr.vx * dt;
        pr.z += pr.vz * dt;

        const outOfBounds =
          pr.x * pr.x + pr.z * pr.z > ARENA_RADIUS * ARENA_RADIUS;
        if (pr.ttl <= 0 || outOfBounds) {
          sim.projectiles.splice(i, 1);
          continue;
        }

        if (pr.fromPlayer) {
          let hit = false;
          for (const e of sim.enemies) {
            if (e.actionState === 'ko') continue;
            if (circlesOverlap(pr.x, pr.z, pr.radius, e.x, e.z, e.radius)) {
              e.hp -= pr.damage;
              e.hitFlashTimer = 0.12;
              audioRef.current.hit();
              spawnSparks(pr.x, 0.65, pr.z, 6, 0x38bdf8);
              if (e.hp <= 0) {
                e.actionState = 'ko';
                e.stateTimer = 0.24;
                e.hasToken = false;
                e.vx = (pr.vx / 34) * 9;
                e.vz = (pr.vz / 34) * 9;
                sim.kills += 1;
                sim.score += scoreForKill(e.archetype, sim.wave);
                if (sim.score > sim.bestScore) {
                  sim.bestScore = sim.score;
                  try {
                    localStorage.setItem('myra_arena_best_v1', String(sim.bestScore));
                  } catch {
                    // Ignore storage error
                  }
                }
                sim.hitstopTimer = 0.035;
                sim.trauma = Math.min(1, sim.trauma + 0.28);
                audioRef.current.kill();
                spawnSparks(e.x, 0.8, e.z, 14, 0xfbbf24);
              }
              hit = true;
              break;
            }
          }
          if (hit) {
            sim.projectiles.splice(i, 1);
          }
        } else if (
          p.invulnTimer <= 0 &&
          circlesOverlap(pr.x, pr.z, pr.radius, p.x, p.z, 0.85)
        ) {
          p.hp = Math.max(0, p.hp - pr.damage);
          p.invulnTimer = 0.85;
          p.hitFlashTimer = 0.25;
          sim.damageTaken += pr.damage;
          sim.hitstopTimer = 0.05;
          sim.trauma = Math.min(1, sim.trauma + 0.65);
          audioRef.current.damage();
          spawnSparks(p.x, 0.7, p.z, 10, 0xf43f5e);
          sim.projectiles.splice(i, 1);
          if (p.hp <= 0) {
            sim.phase = 'gameover';
            syncReactSnapshot(true);
            return;
          }
        }
      }

      // Advance wave or victory
      if (sim.waveQueue.length === 0 && sim.enemies.length === 0) {
        if (sim.wave >= VICTORY_WAVE) {
          sim.score += p.hp * 250;
          if (sim.score > sim.bestScore) {
            sim.bestScore = sim.score;
            try {
              localStorage.setItem('myra_arena_best_v1', String(sim.bestScore));
            } catch {
              // Ignore
            }
          }
          audioRef.current.waveClear();
          sim.phase = 'victory';
          syncReactSnapshot(true);
          return;
        }
        sim.wave += 1;
        sim.waveQueue = buildWaveQueue(sim.wave);
        sim.spawnTimer = 0.9;
        audioRef.current.waveClear();
        syncReactSnapshot(true);
      }
    }

    function updateSceneVisuals(dt: number, elapsed: number) {
      // Update player group
      const p = sim.player;
      playerGroup.position.set(p.x, Math.sin(elapsed * 5) * 0.08, p.z);
      playerGroup.rotation.y = p.yaw;
      const pTilt = p.dashTimer > 0 ? 0.28 : 0.06;
      playerGroup.rotation.x = pTilt;

      const { hullMat } = playerGroup.userData as {
        hullMat: THREE.MeshPhysicalMaterial;
      };
      if (p.hitFlashTimer > 0) {
        hullMat.emissive.setHex(0xf43f5e);
        hullMat.emissiveIntensity = 1.6;
      } else {
        hullMat.emissive.setHex(0x000000);
        hullMat.emissiveIntensity = 0;
      }

      // Smooth camera follow + trauma-squared shake
      const shakeAmt = sim.trauma * sim.trauma * 0.85;
      const shakeX = (Math.random() - 0.5) * shakeAmt;
      const shakeY = (Math.random() - 0.5) * shakeAmt;
      _v3A.set(p.x * 0.55 + shakeX, 24.5 + shakeY, p.z * 0.55 + 22.5);
      camera.position.lerp(_v3A, 1 - Math.exp(-6.5 * dt));
      _v3B.set(p.x * 0.65, 0.5, p.z * 0.65);
      camera.lookAt(_v3B);

      // Update enemy meshes
      for (const e of sim.enemies) {
        const grp = enemyMeshes.get(e.id);
        if (!grp) continue;
        grp.position.set(e.x, 0, e.z);
        grp.rotation.y = e.yaw;

        if (e.actionState === 'ko') {
          const s = Math.max(0.05, e.stateTimer / 0.24);
          grp.scale.set(s * 1.25, s * 0.5, s * 1.25);
        } else if (e.actionState === 'windup') {
          const pulseScale = 1 + Math.sin(elapsed * 28) * 0.08;
          grp.scale.set(pulseScale, 1 / pulseScale, pulseScale);
        } else {
          grp.scale.set(1, 1, 1);
        }

        const { accentMat, telegraphRing } = grp.userData as {
          accentMat: THREE.MeshStandardMaterial;
          telegraphRing: THREE.Mesh;
        };
        telegraphRing.visible = e.actionState === 'windup';
        accentMat.emissiveIntensity =
          e.hitFlashTimer > 0 ? 3.0 : e.actionState === 'windup' ? 2.4 : 1.1;
      }

      // Update pooled projectiles
      const pCount = Math.min(sim.projectiles.length, MAX_PROJ);
      projInst.count = pCount;
      for (let i = 0; i < pCount; i++) {
        const pr = sim.projectiles[i];
        _v3A.set(pr.x, 0.68, pr.z);
        _quat.identity();
        const sc = pr.fromPlayer ? 0.95 : 1.28;
        _scaleVec.set(sc, sc, sc);
        _mat4.compose(_v3A, _quat, _scaleVec);
        projInst.setMatrixAt(i, _mat4);
        _color.setHex(pr.fromPlayer ? 0x38bdf8 : 0xf59e0b);
        projInst.setColorAt(i, _color);
      }
      projInst.instanceMatrix.needsUpdate = true;
      if (projInst.instanceColor) projInst.instanceColor.needsUpdate = true;

      // Update pooled sparks
      let activeSparkCount = 0;
      for (const s of sparks) {
        if (!s.active) continue;
        s.ttl -= dt;
        if (s.ttl <= 0) {
          s.active = false;
          continue;
        }
        s.vy -= 14 * dt;
        s.x += s.vx * dt;
        s.y = Math.max(0.08, s.y + s.vy * dt);
        s.z += s.vz * dt;
        const life = s.ttl / s.maxTtl;
        _v3A.set(s.x, s.y, s.z);
        _quat.identity();
        _scaleVec.setScalar(life * 1.1);
        _mat4.compose(_v3A, _quat, _scaleVec);
        sparkInst.setMatrixAt(activeSparkCount, _mat4);
        _color.setHex(s.colorHex);
        sparkInst.setColorAt(activeSparkCount, _color);
        activeSparkCount++;
      }
      sparkInst.count = activeSparkCount;
      sparkInst.instanceMatrix.needsUpdate = true;
      if (sparkInst.instanceColor) sparkInst.instanceColor.needsUpdate = true;
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick(now: number) {
      if (disposed) return;
      const rawDt = Math.max(0.001, (now - lastStamp) / 1000);
      const dt = Math.min(rawDt, 0.05);
      lastStamp = now;

      stepSimulation(dt);
      updateSceneVisuals(dt, now / 1000);
      syncReactSnapshot(false);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => {
          if (!disposed) tick(performance.now());
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      frameId = window.setTimeout(() => tick(performance.now()), 16);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      clearEnemyMeshes();
      groundTex.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      perimeterGeo.dispose();
      perimeterMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      projGeo.dispose();
      projMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const isPlaying = snapshot.phase === 'playing';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a0e17] text-zinc-100 select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />

      {/* Title Screen (No header/footer chrome, crisp SVG emblem, zero backdrop-blur) */}
      {snapshot.phase === 'title' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-[#0a0e17]/80">
          <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-[#0f1421] p-7 text-center shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mb-4">
              <svg viewBox="0 0 32 32" className="w-7 h-7 text-indigo-400" fill="none">
                <polygon
                  points="16,3 28,10 28,22 16,29 4,22 4,10"
                  stroke="currentColor"
                  strokeWidth="2.2"
                />
                <circle cx="16" cy="16" r="4.5" fill="#38bdf8" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              MYRA: Core Defense
            </h1>
            <p className="mt-2 text-xs text-zinc-400">
              Survive 5 escalating waves across the Obsidian Basin. Eliminate flankers, marksmen,
              and telegraphed chargers.
            </p>

            {(snapshot.bestScore > 0 || cloudBest !== null) && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-amber-400 tabular-nums">
                <Trophy className="w-3.5 h-3.5" />
                <span>Best Score: {Math.max(snapshot.bestScore, cloudBest ?? 0)}</span>
              </div>
            )}

            <button
              type="button"
              data-start="true"
              onClick={() => actionsRef.current.startGame()}
              className="mt-6 w-full py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>Play Mission</span>
            </button>

            <p className="mt-4 text-[11px] font-mono text-zinc-400">
              WASD Move · Mouse Aim · Click / Space Fire · Shift Dash · Esc Pause
            </p>

            <button
              type="button"
              onClick={onExitGame}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to MyAI Studio</span>
            </button>
          </div>
        </div>
      )}

      {/* Playing Perimeter HUD (>=85% clear center viewport) */}
      {isPlaying && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-10 p-4 flex items-start justify-between gap-4">
          {/* Top-Left: Crystal Shield Segments + Dash Bar */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[#0f1421]/92 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-1.5" aria-label={`Health ${snapshot.hp} of ${snapshot.maxHp}`}>
              {Array.from({ length: snapshot.maxHp }).map((_, i) => {
                const filled = i < snapshot.hp;
                const ghost = !filled && i < ghostHp;
                return (
                  <span
                    key={i}
                    className={`h-2.5 w-6 rounded-xs transition-colors ${
                      filled
                        ? 'bg-emerald-400'
                        : ghost
                          ? 'bg-amber-400/70'
                          : 'bg-zinc-800'
                    }`}
                  />
                );
              })}
              <span className="ml-2 font-mono text-[11px] text-zinc-300 tabular-nums">
                {snapshot.hp}/{snapshot.maxHp}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Dash
              </span>
              <div className="h-1.5 w-28 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-75"
                  style={{ width: `${Math.round(snapshot.dashReadyRatio * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top-Right: Wave, Score & Compact Controls */}
          <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#0f1421]/92 border border-zinc-800">
            <div className="text-right pr-2 border-r border-zinc-800">
              <div className="text-[10px] font-mono uppercase text-zinc-400">
                Wave {snapshot.wave}/{snapshot.maxWaves}
              </div>
              <div className="font-mono text-sm font-bold text-white tabular-nums">
                {String(snapshot.score).padStart(5, '0')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !muted;
                audioRef.current.muted = next;
                setMuted(next);
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => actionsRef.current.togglePause()}
              aria-label="Pause game"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onExitGame}
              aria-label="Exit to Studio"
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Pause / Game Over / Victory Single Modal */}
      {(snapshot.phase === 'paused' ||
        snapshot.phase === 'gameover' ||
        snapshot.phase === 'victory') && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-[#0a0e17]/80">
          <div className="max-w-sm w-full rounded-2xl border border-zinc-800 bg-[#0f1421] p-6 text-center shadow-2xl space-y-4">
            <h2 className="font-display text-xl font-bold text-white">
              {snapshot.phase === 'paused'
                ? 'Mission Paused'
                : snapshot.phase === 'victory'
                  ? 'Basin Secured'
                  : 'Core Breached'}
            </h2>

            <div className="grid grid-cols-3 gap-2 py-3 border-y border-zinc-800 text-xs font-mono tabular-nums">
              <div>
                <div className="text-zinc-500">Score</div>
                <div className="text-white font-semibold mt-0.5">{snapshot.score}</div>
              </div>
              <div>
                <div className="text-zinc-500">Wave</div>
                <div className="text-white font-semibold mt-0.5">
                  {snapshot.wave}/{snapshot.maxWaves}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Kills</div>
                <div className="text-white font-semibold mt-0.5">{snapshot.kills}</div>
              </div>
            </div>

            {cloudSavedNotice && (
              <p className="text-[11px] text-emerald-400 font-medium">{cloudSavedNotice}</p>
            )}

            <div className="flex flex-col gap-2">
              {snapshot.phase === 'paused' && (
                <button
                  type="button"
                  onClick={() => actionsRef.current.togglePause()}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume (Esc)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => actionsRef.current.restartGame()}
                className="w-full py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Play Again (R)</span>
              </button>

              <button
                type="button"
                onClick={onExitGame}
                className="w-full py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to MyAI Studio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
