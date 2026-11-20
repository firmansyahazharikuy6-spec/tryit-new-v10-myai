import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Camera, ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';

type FinishId = 'titanium' | 'obsidian-gold' | 'cobalt';
type CameraPresetId = 'hero' | 'top' | 'side';

const FINISH_CONFIG: Record<
  FinishId,
  { label: string; color: number; accent: number; metalness: number; roughness: number; swatch: string }
> = {
  titanium: {
    label: 'Brushed Titanium',
    color: 0xcbd5e1,
    accent: 0x6366f1,
    metalness: 0.92,
    roughness: 0.18,
    swatch: '#cbd5e1',
  },
  'obsidian-gold': {
    label: 'Obsidian Gold',
    color: 0xd4a34f,
    accent: 0xf59e0b,
    metalness: 0.94,
    roughness: 0.16,
    swatch: '#d4a34f',
  },
  cobalt: {
    label: 'Anodized Cobalt',
    color: 0x3b82f6,
    accent: 0x22d3ee,
    metalness: 0.88,
    roughness: 0.22,
    swatch: '#3b82f6',
  },
};

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: 'Hero 3/4', pos: [4.6, 3.25, 5.0], target: [0, 0.95, 0] },
  top: { label: 'Zenith', pos: [0.01, 6.4, 0.9], target: [0, 1.15, 0] },
  side: { label: 'Profile', pos: [5.6, 1.45, 0.2], target: [0, 0.95, 0] },
};

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

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

function createDialCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const cx = 512;
  const cy = 512;

  ctx.fillStyle = '#0f131d';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle concentric metallic sheen bands
  const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 480);
  grad.addColorStop(0, '#1e2538');
  grad.addColorStop(0.55, '#111623');
  grad.addColorStop(1, '#090b12');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 490, 0, Math.PI * 2);
  ctx.fill();

  // Outer degree ticks
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = major ? 395 : 418;
    const r1 = 448;
    ctx.strokeStyle = major ? '#818cf8' : '#334155';
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
    ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.stroke();
  }

  // Inner calibration circle
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 290, 0, Math.PI * 2);
  ctx.stroke();

  // Telemetry labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = ['MYAI', '090', 'MYRA', '270'];
  labels.forEach((lbl, idx) => {
    const a = (idx * Math.PI) / 2 - Math.PI / 2;
    ctx.fillText(lbl, cx + Math.cos(a) * 340, cy + Math.sin(a) * 340);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function Myra3DShowcase() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [explode, setExplode] = useState(0.18);
  const [finish, setFinish] = useState<FinishId>('titanium');
  const [preset, setPreset] = useState<CameraPresetId>('hero');
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  const targetExplodeRef = useRef(explode);
  const finishRef = useRef<FinishId>(finish);
  const presetTriggerRef = useRef<{ active: boolean; id: CameraPresetId }>({
    active: false,
    id: 'hero',
  });
  const requestRenderRef = useRef<() => void>(() => {});
  const snapshotFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    targetExplodeRef.current = explode;
    requestRenderRef.current();
  }, [explode]);

  useEffect(() => {
    finishRef.current = finish;
    requestRenderRef.current();
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setControlsCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 540;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x0b0e16);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x0b0e16, 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.hero.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.autoRotate = false;
    controls.minDistance = 2.6;
    controls.maxDistance = 11.5;
    controls.maxPolarAngle = Math.PI * 0.49;

    // 3-point Warm/Cool lighting + RectAreaLight softboxes on hardware GPUs
    const hemi = new THREE.HemisphereLight(0x9ec5ff, 0x1e1915, 0.72);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(5.5, 7.5, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    keyLight.shadow.camera.left = -4.5;
    keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 4.5;
    keyLight.shadow.camera.bottom = -4.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6366f1, 1.35);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softboxA = new THREE.RectAreaLight(0xffffff, 2.6, 3.6, 1.8);
      softboxA.position.set(3.4, 3.8, -2.6);
      softboxA.lookAt(0, 1.3, 0);
      scene.add(softboxA);

      const softboxB = new THREE.RectAreaLight(0x818cf8, 2.0, 2.8, 1.4);
      softboxB.position.set(-3.8, 2.4, 2.4);
      softboxB.lookAt(0, 1.3, 0);
      scene.add(softboxB);
    }

    // Ground disc & contact shadow (Y offset >= 0.02 so no coplanar Z-fighting)
    const stageDiscGeo = new THREE.CylinderGeometry(7.2, 7.5, 0.14, 64);
    const stageDiscMat = new THREE.MeshStandardMaterial({
      color: 0x111521,
      roughness: 0.78,
      metalness: 0.25,
    });
    const stageDisc = new THREE.Mesh(stageDiscGeo, stageDiscMat);
    stageDisc.position.y = -0.07;
    stageDisc.receiveShadow = true;
    scene.add(stageDisc);

    const shadowTex = createContactShadowTexture();
    const contactShadowGeo = new THREE.PlaneGeometry(4.4, 4.4);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.025;
    scene.add(contactShadow);

    // Hero Composite Assembly: MYAI × MYRA Orbital Neural Core (10 parts)
    const rootGroup = new THREE.Group();
    rootGroup.position.y = 0.045;
    scene.add(rootGroup);

    const disposables: Array<{ dispose: () => void }> = [
      stageDiscGeo,
      stageDiscMat,
      shadowTex,
      contactShadowGeo,
      contactShadowMat,
      envTex,
    ];

    const metalMat = new THREE.MeshPhysicalMaterial({
      color: FINISH_CONFIG[finishRef.current].color,
      metalness: FINISH_CONFIG[finishRef.current].metalness,
      roughness: FINISH_CONFIG[finishRef.current].roughness,
      anisotropy: 0.75,
      clearcoat: 0.35,
    });
    const slateMat = new THREE.MeshStandardMaterial({
      color: 0x161b26,
      roughness: 0.82,
      metalness: 0.15,
    });
    const accentMat = new THREE.MeshPhysicalMaterial({
      color: FINISH_CONFIG[finishRef.current].accent,
      metalness: 0.82,
      roughness: 0.24,
      clearcoat: 0.6,
    });
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xa5f3fc,
      metalness: 0.05,
      roughness: 0.08,
      transmission: isSoftwareGl ? 0 : 0.9,
      transparent: true,
      opacity: isSoftwareGl ? 0.44 : 1.0,
      ior: 1.65,
      thickness: 1.4,
      attenuationColor: new THREE.Color(0x6366f1),
      attenuationDistance: 1.8,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const coreSeedMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x6366f1,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.2,
    });

    const dialTex = createDialCanvasTexture(
      renderer.capabilities.getMaxAnisotropy(),
    );
    const dialMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.36,
      metalness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    disposables.push(metalMat, slateMat, accentMat, crystalMat, coreSeedMat, dialTex, dialMat);

    // Part 1: Hexagonal beveled plinth (ExtrudeGeometry)
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 1.45;
      const y = Math.sin(a) * 1.45;
      if (i === 0) hexShape.moveTo(x, y);
      else hexShape.lineTo(x, y);
    }
    hexShape.closePath();
    const plinthGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 3,
    });
    plinthGeo.rotateX(-Math.PI / 2);
    plinthGeo.computeVertexNormals();
    const partPlinth = new THREE.Mesh(plinthGeo, slateMat);
    partPlinth.position.y = 0.06;
    partPlinth.castShadow = true;
    partPlinth.receiveShadow = true;
    rootGroup.add(partPlinth);
    disposables.push(plinthGeo);

    // Part 2: Turned metallic turbine collar (LatheGeometry)
    const lathePts = [
      new THREE.Vector2(0.82, 0),
      new THREE.Vector2(1.16, 0.05),
      new THREE.Vector2(1.08, 0.26),
      new THREE.Vector2(0.95, 0.34),
      new THREE.Vector2(0.75, 0.34),
    ];
    const collarGeo = new THREE.LatheGeometry(lathePts, 48);
    const partCollar = new THREE.Mesh(collarGeo, metalMat);
    partCollar.castShadow = true;
    rootGroup.add(partCollar);
    disposables.push(collarGeo);

    // Part 3: Telemetry calibrated dial disc
    const dialGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.04, 48);
    const partDial = new THREE.Mesh(dialGeo, dialMat);
    rootGroup.add(partDial);
    disposables.push(dialGeo);

    // Part 4: 6 Radial stator cooling vanes
    const statorGroup = new THREE.Group();
    const vaneGeo = new THREE.BoxGeometry(0.1, 0.42, 0.36);
    for (let i = 0; i < 6; i++) {
      const vane = new THREE.Mesh(vaneGeo, metalMat);
      const a = (i / 6) * Math.PI * 2;
      vane.position.set(Math.cos(a) * 0.88, 0, Math.sin(a) * 0.88);
      vane.rotation.y = -a + Math.PI / 2;
      vane.castShadow = true;
      statorGroup.add(vane);
    }
    rootGroup.add(statorGroup);
    disposables.push(vaneGeo);

    // Part 5: Outer gyroscopic gimbal ring
    const outerRingGeo = new THREE.TorusGeometry(0.98, 0.075, 24, 64);
    const partOuterRing = new THREE.Mesh(outerRingGeo, metalMat);
    partOuterRing.rotation.x = Math.PI / 4;
    partOuterRing.castShadow = true;
    rootGroup.add(partOuterRing);
    disposables.push(outerRingGeo);

    // Part 6: Orthogonal inner gimbal ring
    const innerRingGeo = new THREE.TorusGeometry(0.76, 0.055, 20, 56);
    const partInnerRing = new THREE.Mesh(innerRingGeo, accentMat);
    partInnerRing.rotation.y = Math.PI / 3;
    partInnerRing.rotation.x = -Math.PI / 5;
    partInnerRing.castShadow = true;
    rootGroup.add(partInnerRing);
    disposables.push(innerRingGeo);

    // Part 7: Helical optical waveguide coil (TubeGeometry)
    const curvePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      curvePts.push(
        new THREE.Vector3(
          Math.cos(t * 2) * 0.58,
          Math.sin(t) * 0.28,
          Math.sin(t * 2) * 0.58,
        ),
      );
    }
    const tubeGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(curvePts, true),
      64,
      0.028,
      10,
      true,
    );
    const partWaveguide = new THREE.Mesh(tubeGeo, accentMat);
    rootGroup.add(partWaveguide);
    disposables.push(tubeGeo);

    // Part 8: Optical sapphire crystal shell (renderOrder sorted cleanly)
    const crystalGeo = new THREE.IcosahedronGeometry(0.46, 1);
    const partCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    partCrystal.renderOrder = 3;
    rootGroup.add(partCrystal);
    disposables.push(crystalGeo);

    // Part 9: Radiant central neural seed
    const seedGeo = new THREE.OctahedronGeometry(0.22, 0);
    const partSeed = new THREE.Mesh(seedGeo, coreSeedMat);
    partSeed.renderOrder = 1;
    rootGroup.add(partSeed);
    disposables.push(seedGeo);

    // Part 10: Upper magnetic cap crown
    const crownGeo = new THREE.CylinderGeometry(0.32, 0.52, 0.16, 6);
    const partCrown = new THREE.Mesh(crownGeo, slateMat);
    partCrown.castShadow = true;
    rootGroup.add(partCrown);
    disposables.push(crownGeo);

    function applyExplodePositions(eVal: number) {
      partCollar.position.y = 0.28 + eVal * 0.14;
      partDial.position.y = 0.64 + eVal * 0.34;
      statorGroup.position.y = 0.92 + eVal * 0.56;
      partOuterRing.position.y = 1.48 + eVal * 0.82;
      partInnerRing.position.y = 1.48 + eVal * 0.92;
      partWaveguide.position.y = 1.48 + eVal * 1.0;
      partSeed.position.y = 1.48 + eVal * 1.05;
      partCrystal.position.y = 1.48 + eVal * 1.05;
      partCrown.position.y = 2.28 + eVal * 1.48;
    }

    let currentExplode = targetExplodeRef.current;
    applyExplodePositions(currentExplode);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastStamp = performance.now();

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

    function applyCurrentFinish() {
      const cfg = FINISH_CONFIG[finishRef.current];
      metalMat.color.setHex(cfg.color);
      metalMat.metalness = cfg.metalness;
      metalMat.roughness = cfg.roughness;
      accentMat.color.setHex(cfg.accent);
      coreSeedMat.emissive.setHex(cfg.accent);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min((now - lastStamp) / 1000, 0.05) || 0.016;
        lastStamp = now;

        applyCurrentFinish();

        let needsFollowup = false;
        if (Math.abs(targetExplodeRef.current - currentExplode) > 0.002) {
          currentExplode = THREE.MathUtils.damp(
            currentExplode,
            targetExplodeRef.current,
            8.5,
            dt,
          );
          applyExplodePositions(currentExplode);
          needsFollowup = true;
        } else {
          currentExplode = targetExplodeRef.current;
          applyExplodePositions(currentExplode);
        }

        if (presetTriggerRef.current.active) {
          const pCfg = CAMERA_PRESETS[presetTriggerRef.current.id];
          _targetPos.set(...pCfg.pos);
          _targetLook.set(...pCfg.target);
          camera.position.lerp(_targetPos, 1 - Math.exp(-7 * dt));
          controls.target.lerp(_targetLook, 1 - Math.exp(-7 * dt));
          if (
            camera.position.distanceTo(_targetPos) < 0.03 &&
            controls.target.distanceTo(_targetLook) < 0.03
          ) {
            camera.position.copy(_targetPos);
            controls.target.copy(_targetLook);
            presetTriggerRef.current.active = false;
          } else {
            needsFollowup = true;
          }
        }

        const controlsMoving = controls.update();
        if (controlsMoving && !isSoftwareGl) {
          needsFollowup = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if ((renderDirty || needsFollowup) && !disposed) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    requestRenderRef.current = requestRender;

    snapshotFnRef.current = () => {
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `myra-core-${finishRef.current}.png`;
      a.click();
    };

    const onControlsChange = () => requestRender();
    const onControlsStart = () => {
      presetTriggerRef.current.active = false;
    };
    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('start', onControlsStart);

    const onResize = () => {
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 540;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    // Initial render
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('change', onControlsChange);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  function handleSelectPreset(id: CameraPresetId) {
    setPreset(id);
    presetTriggerRef.current = { active: true, id };
    requestRenderRef.current();
  }

  return (
    <div className="relative w-full h-[540px] sm:h-[600px] rounded-2xl overflow-hidden border border-zinc-800 bg-[#0b0e16]">
      {/* Dedicated WebGL Mount Div (no sibling overlays inside) */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Top-Left Minimal Spec Badge (Static, zero backdrop-blur, zero pulse dots) */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 px-3.5 py-2 rounded-xl bg-[#0d111a]/90 border border-zinc-800 text-zinc-100">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>MYAI × MYRA Orbital Core</span>
        </div>
        <div className="mt-0.5 text-[11px] font-mono text-zinc-400">
          10-Part PBR Assembly · Drag to Orbit · Scroll to Zoom
        </div>
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        style={{
          bottom: controlsCollapsed ? '12px' : '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(900px, 94vw)',
        }}
        className="absolute z-20 flex flex-col items-center w-full pointer-events-none"
      >
        <button
          type="button"
          onClick={() => setControlsCollapsed((prev) => !prev)}
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg rounded-b-md text-[11px] font-medium bg-[#121724] border border-zinc-700 text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          {controlsCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!controlsCollapsed && (
          <div className="pointer-events-auto w-full px-4 py-3 rounded-2xl bg-[#101420]/95 border border-zinc-800 shadow-2xl flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-200">
            {/* Exploded View Slider */}
            <label className="flex items-center gap-2.5 min-w-[180px]">
              <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium text-zinc-300 whitespace-nowrap">Explode</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
                className="w-24 accent-indigo-500 cursor-pointer"
              />
              <span className="font-mono text-[11px] text-zinc-400 tabular-nums w-8">
                {Math.round(explode * 100)}%
              </span>
            </label>

            {/* Finish Swatches */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Finish</span>
              {(Object.keys(FINISH_CONFIG) as FinishId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFinish(id)}
                  title={FINISH_CONFIG[id].label}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                    finish === id
                      ? 'border-indigo-400 bg-indigo-500/20 text-white'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                    style={{ backgroundColor: FINISH_CONFIG[id].swatch }}
                  />
                  <span className="hidden sm:inline">{FINISH_CONFIG[id].label}</span>
                </button>
              ))}
            </div>

            {/* Camera Presets + Snapshot */}
            <div className="flex items-center gap-1.5">
              {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => handleSelectPreset(pid)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                    preset === pid
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {CAMERA_PRESETS[pid].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => snapshotFnRef.current()}
                aria-label="Download 3D snapshot PNG"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
