// ============================================================
//  WebBuildTarget — HTML5 / Web Export
//  Produces a self-contained folder with index.html + assets
//  Runnable from any modern web server (not file://).
//
//  Strategy:
//  1. Generate a game-only Vite project (no editor, no Tauri)
//  2. Assets are served from /project-data/ via fetch()
//  3. Vite bundles and minifies the TypeScript runtime
//  4. Output: dist/ folder with index.html + all assets
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON, WebSettings } from '../BuildConfigurationAsset';

export interface BuildStepResult {
  success: boolean;
  message: string;
  outputPath?: string;
}

// ── HTML template for web build ───────────────────────────────

function generateWebHtml(config: BuildConfigurationJSON, webSettings: WebSettings): string {
  const { gameName } = config.general;
  const { canvasWidth, canvasHeight, allowFullscreen } = webSettings;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${gameName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #game-container {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    #render-canvas {
      max-width: 100%; max-height: 100%;
      aspect-ratio: ${canvasWidth} / ${canvasHeight};
      display: block;
    }
    ${allowFullscreen ? `
    #fullscreen-btn {
      position: fixed; bottom: 12px; right: 12px;
      background: rgba(0,0,0,0.6); color: #fff;
      border: 1px solid rgba(255,255,255,0.3); border-radius: 4px;
      padding: 6px 12px; cursor: pointer; font-size: 12px;
      z-index: 100;
    }` : ''}
    #loading-overlay {
      position: fixed; inset: 0; background: #000;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; z-index: 9999; color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      transition: opacity 0.4s;
    }
    #loading-overlay.hidden { opacity: 0; pointer-events: none; }
    .loading-title { font-size: 28px; font-weight: 700; margin-bottom: 20px; }
    .loading-bar-outer { width: 280px; height: 5px; background: #222; border-radius: 3px; }
    .loading-bar-inner { height: 100%; background: #60a5fa; border-radius: 3px; width: 0%; transition: width 0.3s; }
    .loading-status { margin-top: 10px; font-size: 12px; color: #888; }
    .cors-note { margin-top: 20px; font-size: 11px; color: #555; text-align: center; max-width: 300px; }
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="loading-title">${gameName}</div>
    <div class="loading-bar-outer"><div class="loading-bar-inner" id="loading-bar"></div></div>
    <div class="loading-status" id="loading-status">Loading...</div>
    <p class="cors-note">⚠️ Requires a web server — not runnable from file://</p>
  </div>
  <div id="game-container">
    <canvas id="render-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
  </div>
  ${allowFullscreen ? `<button id="fullscreen-btn" onclick="document.documentElement.requestFullscreen?.()">⛶ Fullscreen</button>` : ''}
  <script type="module" src="/src/game_runtime.ts"></script>
</body>
</html>`;
}

// ── PWA manifest ──────────────────────────────────────────────

function generateManifest(config: BuildConfigurationJSON): string {
  return JSON.stringify({
    name: config.general.gameName,
    short_name: config.general.gameName,
    start_url: '/',
    display: 'fullscreen',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2);
}

// ── Web runtime entry point ───────────────────────────────────

function generateWebRuntime(config: BuildConfigurationJSON): string {
  const startScene = config.entryPoint.startScene || '';
  return `// ⚠️ AUTO-GENERATED — DO NOT EDIT
// Web game runtime entry point

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Engine } from './engine/Engine';
import { MeshAssetManager } from './editor/MeshAsset';
import { Camera2D } from './engine/Camera2D';
import { TilemapRenderer } from './editor/TilemapRenderer';
import type { TilesetAsset, TilemapAsset } from './engine/TilemapData';
import { isAnimatedTileId, decodeAnimatedTileIndex, TilemapCollisionBuilder } from './engine/TilemapData';
import { Physics2DWorld } from './engine/Physics2DWorld';
import { SpriteActor } from './engine/SpriteActor';
import type { SpriteActorConfig } from './engine/SpriteActor';
import { CharacterMovement2D, defaultCharacterMovement2DProps } from './engine/CharacterMovement2D';
import { SortingLayerManager } from './engine/SortingLayers';
import { ScriptComponent } from './engine/ScriptComponent';
import { EventBus } from './engine/EventBus';
import { AIController } from './engine/AIController';

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const loadingBar = document.getElementById('loading-bar') as HTMLDivElement;
const loadingStatus = document.getElementById('loading-status') as HTMLDivElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;

function setProgress(pct: number, msg: string) {
  if (loadingBar) loadingBar.style.width = pct + '%';
  if (loadingStatus) loadingStatus.textContent = msg;
  console.log('[Runtime]', pct + '%', msg);
}

/** Race a promise against a timeout — returns the result or undefined on timeout */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>(r => setTimeout(() => {
      console.warn('[Runtime] TIMEOUT:', label, '(' + ms + 'ms)');
      r(undefined);
    }, ms)),
  ]);
}

// Polyfill Tauri invoke for web — replaces with fetch-based asset loading
;(window as any).__TAURI__ = {
  core: {
    invoke: async (cmd: string, args: any) => {
      if (cmd === 'read_file') {
        const res = await fetch('/project-data/' + args.path.replace(/^.*project-data[\\\\\\/]/, ''));
        if (!res.ok) throw new Error('File not found: ' + args.path);
        return res.text();
      }
      if (cmd === 'read_binary_file') {
        const res = await fetch('/project-data/' + args.path.replace(/^.*project-data[\\\\\\/]/, ''));
        if (!res.ok) throw new Error('File not found: ' + args.path);
        const buf = await res.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }
      if (cmd === 'file_exists') {
        try {
          const res = await fetch('/project-data/' + args.path.replace(/^.*project-data[\\\\\\/]/, ''), { method: 'HEAD' });
          return res.ok;
        } catch { return false; }
      }
      if (cmd === 'list_dir_files') {
        return [];
      }
      if (cmd === 'write_file' || cmd === 'write_binary_file') {
        try {
          localStorage.setItem('feather_' + args.path, JSON.stringify(args.contents));
        } catch {}
        return;
      }
      console.warn('[WebRuntime] Unhandled invoke: ' + cmd, args);
      return null;
    }
  }
};

// ── Shared state ──
let engine: Engine;
let renderer: THREE.WebGLRenderer;
let fallbackCamera: THREE.PerspectiveCamera;
let sceneLoading = false;

// ── 2D scene state ──
let is2DScene = false;
let camera2D: Camera2D | null = null;
let tilemapRenderer: TilemapRenderer | null = null;
let root2D: THREE.Group | null = null;
let physics2D: Physics2DWorld | null = null;
let spriteActors2D: SpriteActor[] = [];
/** Per-actor compiled blueprint scripts (same as Scene2DManager._actorBlueprintScripts) */
const actorBlueprintScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
/** Per-actor AnimBP compiled event-graph scripts */
const actorAnimBPScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
/** Per-actor AnimBP state machine tracking (current state, ABP data) */
const actorAnimBPStates = new Map<SpriteActor, { abp: any; currentStateId: string }>();
/** Active AI controllers for 2D scene */
let aiControllers2D: AIController[] = [];
/** Sorting layer manager for correct 2D sprite z-ordering */
let sortingLayerMgr: SortingLayerManager | null = null;
let saved3DToneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;
let saved3DExposure = 0.75;

/**
 * Set up default scene environment (lights, sky, ground) so the game
 * isn't a black void.  Loads composition.json if available, else uses defaults.
 */

function _applyExposeOnSpawnOverrides(code: string, overrides: Record<string, any>): string {
  let newCode = code;
  for (const [key, val] of Object.entries(overrides)) {
    const rawVal = JSON.stringify(val);
    const regex = new RegExp('var\\\\s+' + key + '\\\\s*=\\\\s*__gameInstance(\\\\..+?)?;', 'g');
    if (regex.test(newCode)) {
      newCode = newCode.replace(regex, 'var ' + key + ' = ' + rawVal + ';');
    } else {
      newCode = newCode.replace(new RegExp('var\\\\s+' + key + '\\\\s*=[^;]+;', 'g'), 'var ' + key + ' = ' + rawVal + ';');
    }
  }
  return newCode;
}
function spawnRuntimeActor(classId: string, className: string, pos: any, rot: any, sc: any, owner: any, overrides: any) {
  const go = engine.scene.spawnActorFromClass(classId, className, pos, rot, sc, owner, overrides);
  if (go && is2DScene && typeof root2D !== 'undefined' && root2D) {
    const goData = (engine as any).assetManager?.getAsset(classId);
    if (!goData) return go;
    try {
      const components = goData.components ?? [];
      const sprComp = components.find((c: any) => c.type === 'spriteRenderer');
      const rb2dComp = components.find((c: any) => c.type === 'rigidbody2d');
      const allCollider2dComps: any[] = components.filter((c: any) => c.type === 'collider2d');
      const solidColliders = allCollider2dComps.filter((c: any) => !c.isTrigger);
      const primaryCollider = solidColliders[0] ?? allCollider2dComps[0] ?? null;
      const cm2dComp = components.find((c: any) => c.type === 'characterMovement2d');
      
      const colliderShape = (primaryCollider?.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule';
      const colW = primaryCollider?.collider2dSize?.width ?? 0.8;
      const colH = primaryCollider?.collider2dSize?.height ?? 1.0;
      
      const additionalColliders = allCollider2dComps
        .filter((c: any) => c !== primaryCollider)
        .map((c: any) => ({
          shape: (c.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule',
          size: c.collider2dSize ? { width: c.collider2dSize.width, height: c.collider2dSize.height } : undefined,
          radius: c.collider2dRadius,
          isTrigger: !!c.isTrigger,
          name: c.name ?? '',
        }));

      let bodyType: 'dynamic' | 'static' | 'kinematic' | null = null;
      if (rb2dComp) {
        bodyType = (rb2dComp.bodyType ?? 'dynamic') as 'dynamic' | 'static' | 'kinematic';
      } else if (goData.actorType === 'characterPawn2D') {
        bodyType = 'dynamic';
      } else if (allCollider2dComps.length > 0) {
        bodyType = goData.physicsConfig?.simulatePhysics ? 'dynamic' : 'static';
      }

      const spawnPos = { x: pos?.x ?? goData.position?.x ?? 0, y: pos?.y ?? goData.position?.y ?? 0 };
      const movCfg = goData.characterMovement2DConfig ?? {};
      const rootPhys = goData.physicsConfig;

      const actorConfig: any = {
        name: goData.name,
        actorType: goData.actorType,
        position: spawnPos,
        physicsBodyType: bodyType,
        colliderShape,
        colliderSize: { width: colW, height: colH },
        colliderRadius: primaryCollider?.collider2dRadius,
        componentName: primaryCollider?.name || 'Collider2D',
        isTrigger: primaryCollider?.isTrigger ?? false,
        additionalColliders,
        sortingLayer: sprComp?.sortingLayer ?? 'Default',
        orderInLayer: sprComp?.orderInLayer ?? 0,
        freezeRotation: movCfg.freezeRotation ?? rb2dComp?.freezeRotation ?? rootPhys?.lockRotationZ ?? true,
        ccdEnabled: rb2dComp?.ccdEnabled ?? rootPhys?.ccdEnabled ?? true,
        gravityScale: movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0,
        linearDamping: movCfg.linearDrag ?? rb2dComp?.linearDamping ?? rootPhys?.linearDamping ?? 0.0,
        angularDamping: rb2dComp?.angularDamping ?? rootPhys?.angularDamping ?? 0.05,
        mass: rb2dComp?.mass ?? rootPhys?.mass ?? 1.0,
        friction: rb2dComp?.friction ?? rootPhys?.friction ?? 0.5,
        restitution: rb2dComp?.restitution ?? rootPhys?.restitution ?? 0.1,
        characterMovement2D: !!cm2dComp || goData.actorType === 'characterPawn2D',
        blueprintId: goData.actorAssetId ?? undefined,
      };

      const actor = new SpriteActor(actorConfig);
      actor.id = go.id; 
      actor.controllerClass = goData.controllerClass ?? 'None';
      actor.controllerBlueprintId = goData.controllerBlueprintId ?? '';

      actor.spriteRenderer.material.color.setHex(0xffffff);
      actor.spriteRenderer.material.transparent = true;

      if (sprComp?.flipX) actor.spriteRenderer.flipX = true;
      if (sprComp?.flipY) actor.spriteRenderer.flipY = true;
      if (sprComp?.spriteScale) actor.spriteRenderer.spriteScale = { x: sprComp.spriteScale.x, y: sprComp.spriteScale.y };
      if (sprComp?.spriteOffset) actor.spriteRenderer.spriteOffset = { x: sprComp.spriteOffset.x, y: sprComp.spriteOffset.y };

      actor.animBlueprintId = sprComp?.animBlueprint2dId ?? null;

      root2D.add(actor.group);
      if (sortingLayerMgr) actor.applySorting(sortingLayerMgr);

      if (physics2D && bodyType) {
        actor.attachPhysicsBody(physics2D, actorConfig);
        const rbComp = actor.getComponent('RigidBody2D');
        if (rbComp?.rigidBody) {
          const gs = movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0;
          rbComp.rigidBody.setGravityScale(gs, true);
        }
      }

      if (cm2dComp || goData.actorType === 'characterPawn2D') {
        const moveProps = {
          defaultWalkSpeed: 300, jumpZVelocity: 600, gravityScale: 1, airControl: 0.2, coyoteTime: 0.1, jumpBufferTime: 0.1, maxFallSpeed: 1000,
          ...movCfg,
        };
        const cm2d = new CharacterMovement2D(moveProps);
        cm2d.attach(actor);
        actor.characterMovement2D = cm2d;
        actor.setComponent('CharacterMovement2D', cm2d);
      }

      if (go.mesh) go.mesh.visible = false;
      
      if (goData.compiledCode) {
        (actor as any).__actorBlueprintCode = goData.compiledCode;
        if (overrides && Object.keys(overrides).length > 0) {
          (actor as any).__actorBlueprintCode = _applyExposeOnSpawnOverrides((actor as any).__actorBlueprintCode, overrides);
        }
      }

      spriteActors2D.push(actor);

      // Reload AnimBP data so newly spawned actors get their sprite sheets set correctly
      if (typeof loadAnimBP2DData === 'function') {
        loadAnimBP2DData().catch(e => console.warn('AnimBP delay:', e));
      }

      console.log('[Runtime 2D] Spawning actor', classId, 'at', pos);
      return actor; 
    } catch (e) {
      console.warn('[Runtime 2D] Failed to spawn 2D actor at runtime:', e);
    }
  }
  return go;
}


async function setupSceneEnvironment(threeScene: THREE.Scene): Promise<void> {
  // Skip 3D environment for 2D scenes
  if (is2DScene) {
    console.log('[Runtime] Skipping 3D environment setup for 2D scene');
    return;
  }
  let comp: any = null;
  try {
    const res = await fetch('/project-data/Config/composition.json');
    if (res.ok) comp = await res.json();
  } catch { /* ignore */ }

  // ── Directional Light (Sun) ──
  const dirActor = comp?.actors?.find((a: any) => a.actorType === 'DirectionalLight');
  const dirProps = dirActor?.properties;
  const dirTransform = dirActor?.transform;
  const sunColor = new THREE.Color(dirProps?.color ?? '#FFF8F0');
  const sunIntensity = dirProps?.intensity ?? 1.5;
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  const rotX = ((dirTransform?.rotation?.x ?? -45) * Math.PI) / 180;
  const rotY = ((dirTransform?.rotation?.y ?? 0) * Math.PI) / 180;
  sun.position.set(
    Math.sin(rotY) * Math.cos(rotX) * 50,
    -Math.sin(rotX) * 50,
    Math.cos(rotY) * Math.cos(rotX) * 50,
  );
  sun.castShadow = dirProps?.castShadows !== false;
  sun.shadow.mapSize.setScalar(dirProps?.shadowQuality ?? 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = dirProps?.dynamicShadowDistance ?? 80;
  const shadowDist = (dirProps?.dynamicShadowDistance ?? 80) / 2;
  sun.shadow.camera.left = -shadowDist;
  sun.shadow.camera.right = shadowDist;
  sun.shadow.camera.top = shadowDist;
  sun.shadow.camera.bottom = -shadowDist;
  sun.shadow.bias = dirProps?.shadowBias ?? -0.0001;
  sun.shadow.normalBias = dirProps?.shadowNormalBias ?? 0.02;
  sun.shadow.radius = dirProps?.shadowRadius ?? 3;
  threeScene.add(sun);

  // ── Sky Light (Hemisphere) ──
  const skyProps = comp?.actors?.find((a: any) => a.actorType === 'SkyLight')?.properties;
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(skyProps?.skyColor ?? '#B4D4F0'),
    new THREE.Color(skyProps?.groundColor ?? '#AB8860'),
    skyProps?.intensity ?? 0.8,
  );
  threeScene.add(hemi);

  // ── Sky Atmosphere ──
  const skyAtmoActor = comp?.actors?.find((a: any) => a.actorType === 'SkyAtmosphere');
  const skyAtmoProps = skyAtmoActor?.properties;
  const skyType = skyAtmoProps?.skyType ?? 'atmosphere';
  const skyIntensity = skyAtmoProps?.skyIntensity ?? 0.4;

  // PMREMGenerator for environment maps (PBR reflections)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  if (skyType === 'atmosphere') {
    // ── Atmospheric Sky (three.js Sky addon — matches editor SkyAtmosphereActor) ──
    const sky = new Sky();
    sky.scale.setScalar(450000);
    sky.name = '__runtime_sky';
    threeScene.add(sky);

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = skyAtmoProps?.turbidity ?? 0.3;
    uniforms['rayleigh'].value = skyAtmoProps?.rayleigh ?? 0.2;
    uniforms['mieCoefficient'].value = skyAtmoProps?.mieCoefficient ?? 0.001;
    uniforms['mieDirectionalG'].value = skyAtmoProps?.mieDirectionalG ?? 0.3;

    const elevation = skyAtmoProps?.elevation ?? 45;
    const azimuth = skyAtmoProps?.azimuth ?? 180;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunPosition = new THREE.Vector3();
    sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sunPosition);

    threeScene.backgroundIntensity = skyIntensity;
    threeScene.environmentIntensity = skyIntensity;

    // Generate IBL environment map from atmospheric sky for PBR reflections
    if (skyAtmoProps?.generateEnvMap !== false) {
      const skyScene = new THREE.Scene();
      const skyCopy = new Sky();
      skyCopy.scale.setScalar(450000);
      const uCopy = skyCopy.material.uniforms;
      uCopy['turbidity'].value = skyAtmoProps?.turbidity ?? 0.3;
      uCopy['rayleigh'].value = skyAtmoProps?.rayleigh ?? 0.2;
      uCopy['mieCoefficient'].value = skyAtmoProps?.mieCoefficient ?? 0.001;
      uCopy['mieDirectionalG'].value = skyAtmoProps?.mieDirectionalG ?? 0.3;
      uCopy['sunPosition'].value.copy(sunPosition);
      skyScene.add(skyCopy);
      const envTexture = pmremGenerator.fromScene(skyScene, 0, 0.1, 1000).texture;
      threeScene.environment = envTexture;
      skyCopy.geometry.dispose();
      (skyCopy.material as THREE.Material).dispose();
    }
  } else if (skyType === 'gradient' && skyAtmoProps) {
    // ── Gradient Sky ──
    const topColor = new THREE.Color(skyAtmoProps.topColor ?? '#87CEEB');
    const bottomColor = new THREE.Color(skyAtmoProps.bottomColor ?? '#FFFFFF');
    const skyGeo = new THREE.SphereGeometry(9000, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
        offset: { value: 33 },
        exponent: { value: skyAtmoProps.gradientExponent ?? 0.6 },
      },
      vertexShader: \`
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      \`,
      fragmentShader: \`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      \`,
      side: THREE.BackSide,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.name = '__runtime_sky';
    threeScene.add(skyMesh);
    threeScene.background = null;
  } else if (skyType === 'color' && skyAtmoProps) {
    // ── Solid Color Sky ──
    threeScene.background = new THREE.Color(skyAtmoProps.solidColor ?? '#87CEEB');
  } else {
    threeScene.background = new THREE.Color(0x87CEEB);
  }

  // ── Ground Plane ──
  const gpProps = comp?.actors?.find((a: any) => a.actorType === 'DevGroundPlane')?.properties;
  if (gpProps?.planeSize || !comp) {
    const size = gpProps?.planeSize ?? 100;
    const groundGeo = new THREE.PlaneGeometry(size, size);

    // Generate the same UE5-style dev checker texture used in the editor
    const texSize = 512;
    const cvs = document.createElement('canvas');
    cvs.width = texSize;
    cvs.height = texSize;
    const ctx2d = cvs.getContext('2d')!;
    const primary = gpProps?.primaryColor ?? '#4a4a5a';
    const secondary = gpProps?.secondaryColor ?? '#3a3a4a';
    const lineCol = gpProps?.lineColor ?? '#555568';
    const tileCount = 8;
    const tileSize = texSize / tileCount;
    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        ctx2d.fillStyle = (x + y) % 2 === 0 ? primary : secondary;
        ctx2d.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
    ctx2d.strokeStyle = lineCol;
    ctx2d.lineWidth = 1;
    for (let i = 0; i <= tileCount; i++) {
      const pos = i * tileSize;
      ctx2d.beginPath(); ctx2d.moveTo(pos, 0); ctx2d.lineTo(pos, texSize); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(0, pos); ctx2d.lineTo(texSize, pos); ctx2d.stroke();
    }
    ctx2d.strokeStyle = lineCol;
    ctx2d.lineWidth = 2;
    ctx2d.globalAlpha = 0.6;
    const half = texSize / 2;
    ctx2d.beginPath(); ctx2d.moveTo(half, 0); ctx2d.lineTo(half, texSize); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(0, half); ctx2d.lineTo(texSize, half); ctx2d.stroke();
    ctx2d.globalAlpha = 1;
    const devTexture = new THREE.CanvasTexture(cvs);
    devTexture.wrapS = THREE.RepeatWrapping;
    devTexture.wrapT = THREE.RepeatWrapping;
    devTexture.repeat.set(gpProps?.textureScale ?? 20, gpProps?.textureScale ?? 20);
    devTexture.magFilter = THREE.LinearFilter;
    devTexture.minFilter = THREE.LinearMipmapLinearFilter;
    devTexture.colorSpace = THREE.SRGBColorSpace;

    const groundMat = new THREE.MeshStandardMaterial({
      map: devTexture,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = '__runtime_ground';
    threeScene.add(ground);

    if (gpProps?.hasCollision !== false && engine.physics) {
      engine.physics.setGroundPlaneSize(size / 2);
    }
  }

  // ── Post-Process settings ──
  const ppProps = comp?.actors?.find((a: any) => a.actorType === 'PostProcessVolume')?.properties;
  if (ppProps) {
    if (ppProps.toneMappingType === 'ACES') {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } else if (ppProps.toneMappingType === 'Reinhard') {
      renderer.toneMapping = THREE.ReinhardToneMapping;
    } else if (ppProps.toneMappingType === 'Cineon') {
      renderer.toneMapping = THREE.CineonToneMapping;
    } else if (ppProps.toneMappingType === 'Linear') {
      renderer.toneMapping = THREE.LinearToneMapping;
    } else if (ppProps.toneMappingType === 'AgX') {
      renderer.toneMapping = THREE.AgXToneMapping;
    } else if (ppProps.toneMappingType === 'Neutral') {
      renderer.toneMapping = THREE.NeutralToneMapping;
    }
    renderer.toneMappingExposure = ppProps.exposure ?? 1.0;
  }

  // ── World Settings (gravity) ──
  const ws = comp?.worldSettings;
  if (ws && engine.physics?.world) {
    const gravY = (ws.gravity ?? -980) / 100;
    engine.physics.world.gravity = { x: 0, y: gravY, z: 0 };
  }

  // ── Extract PlayerStart transform ──
  const psActor = comp?.actors?.find((a: any) => a.actorType === 'PlayerStart');
  if (psActor?.transform) {
    engine.playerStartTransform = {
      position: {
        x: psActor.transform.position?.x ?? 0,
        y: psActor.transform.position?.y ?? 0,
        z: psActor.transform.position?.z ?? 0,
      },
      rotationY: ((psActor.transform.rotation?.y ?? 0) * Math.PI) / 180,
    };
    console.log('[Runtime]   ✓ PlayerStart found at', JSON.stringify(engine.playerStartTransform.position));
  }

  pmremGenerator.dispose();

  console.log('[Runtime] Scene environment set up', comp ? '(from composition.json)' : '(defaults)');
}

// ── Mesh Asset Loading ──
async function initMeshAssets(): Promise<void> {
  try {
    const indexRes = await fetch('/project-data/Meshes/_index.json');
    if (!indexRes.ok) {
      console.log('[Runtime] No mesh asset index found — skipping mesh preload');
      return;
    }
    const index: Array<{ id: string; name: string; file: string }> = await indexRes.json();
    if (index.length === 0) return;

    const mgr = new MeshAssetManager();
    const allMeshAssets: any[] = [];
    const allMaterials: any[] = [];
    const allTextures: any[] = [];
    const allAnimations: any[] = [];

    for (const entry of index) {
      try {
        const bundleRes = await fetch('/project-data/Meshes/' + entry.file);
        if (!bundleRes.ok) continue;
        const bundle = await bundleRes.json();
        if (bundle.meshAsset) {
          allMeshAssets.push(bundle.meshAsset);
          if (bundle.materials) allMaterials.push(...bundle.materials);
          if (bundle.textures) allTextures.push(...bundle.textures);
          if (bundle.animations) allAnimations.push(...bundle.animations);
        }
      } catch (e) {
        console.warn('[Runtime] Failed to load mesh bundle:', entry.file, e);
      }
    }

    try {
      const smRes = await fetch('/project-data/Meshes/_standalone_materials.json');
      if (smRes.ok) {
        const sm = await smRes.json();
        if (sm.materials) allMaterials.push(...sm.materials);
        if (sm.textures) allTextures.push(...sm.textures);
      }
    } catch { /* ignore */ }

    mgr.importAll({
      meshAssets: allMeshAssets,
      materials: allMaterials,
      textures: allTextures,
      animations: allAnimations,
    });
    console.log('[Runtime] Loaded', allMeshAssets.length, 'mesh assets,', allMaterials.length, 'materials,', allTextures.length, 'textures');
  } catch (e) {
    console.warn('[Runtime] Mesh asset init failed:', e);
  }
}

// ── Runtime Asset Loading ──
async function initRuntimeAssets(projectMeta: any): Promise<void> {
  console.log('[Runtime] Loading runtime assets...');

  // ── 1. Actor Asset Manager shim ──
  const actorMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Actors/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Actors/' + entry.file);
          if (r.ok) actorMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no actors */ }

  if (actorMap.size > 0) {
    const assetManagerShim = {
      getAsset(id: string) { return actorMap.get(id) ?? null; },
      getAllAssets() { return Array.from(actorMap.values()); },
      getAssetByName(name: string) {
        for (const a of actorMap.values()) { if (a.name === name) return a; }
        return null;
      },
    };
    engine.assetManager = assetManagerShim as any;
    (engine.scene as any).assetManager = assetManagerShim;
    console.log('[Runtime]   ✓ Actor assets:', actorMap.size);
  }

  // ── 2. AI Asset Manager shim ──
  const aiControllerMap = new Map<string, any>();
  for (const [id, actor] of actorMap) {
    if (actor.controllerClass === 'AIController' || actor.actorType === 'aiController') {
      aiControllerMap.set(id, actor);
    }
  }
  try {
    const res = await fetch('/project-data/AIControllers/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/AIControllers/' + entry.file);
          if (r.ok) aiControllerMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no AI controllers folder */ }

  if (aiControllerMap.size > 0) {
    engine.aiAssetManager = {
      getAIController(id: string) { return aiControllerMap.get(id) ?? null; },
      getAllTasks: () => [],
    } as any;
    console.log('[Runtime]   ✓ AI controller assets:', aiControllerMap.size);
  }

  // ── 3. Game Instance Manager shim ──
  const gameInstanceAssets: any[] = [];
  try {
    const res = await fetch('/project-data/GameInstances/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/GameInstances/' + entry.file);
          if (r.ok) gameInstanceAssets.push(await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no game instances */ }

  if (gameInstanceAssets.length === 0 && projectMeta.gameInstanceClassId) {
    try {
      const r = await fetch('/project-data/GameInstances/' + projectMeta.gameInstanceClassId + '.json');
      if (r.ok) gameInstanceAssets.push(await r.json());
    } catch { /* skip */ }
  }

  if (gameInstanceAssets.length > 0) {
    engine.gameInstanceManager = { assets: gameInstanceAssets } as any;
    console.log('[Runtime]   ✓ Game Instance assets:', gameInstanceAssets.length);
  }

  // ── 4. Game Instance Class ID ──
  if (projectMeta.gameInstanceClassId) {
    engine.gameInstanceClassId = projectMeta.gameInstanceClassId;
    console.log('[Runtime]   ✓ Game Instance class:', projectMeta.gameInstanceClassId);
  }

  // ── 5. Widget Blueprint resolver ──
  const widgetMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Widgets/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Widgets/' + entry.file);
          if (r.ok) {
            const wbp = await r.json();
            widgetMap.set(entry.id, {
              id: wbp.widgetBlueprintId ?? entry.id,
              name: wbp.widgetBlueprintName ?? entry.name,
              rootWidgetId: wbp.rootWidgetId ?? '',
              widgets: wbp.widgets ?? {},
              compiledCode: wbp.compiledCode ?? '',
            });
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* no widgets */ }

  if (widgetMap.size > 0) {
    engine.uiManager.setBlueprintResolver((id: string) => widgetMap.get(id) ?? null);
    console.log('[Runtime]   ✓ Widget blueprints:', widgetMap.size);
  }

  // ── 6. Sound Cue resolver ──
  const soundMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Sounds/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Sounds/' + entry.file);
          if (r.ok) soundMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no sounds */ }

  if (soundMap.size > 0) {
    engine.audio.setSoundCueResolver((cueId: string) => {
      const cue = soundMap.get(cueId);
      if (!cue) return null;
      const url = cue.url ?? cue.fileUrl ?? cue.filePath ?? null;
      if (!url) return null;
      return { url, volume: cue.volume ?? 1, pitch: cue.pitch ?? 1 };
    });
    console.log('[Runtime]   ✓ Sound assets:', soundMap.size);
  }

  // ── 7. Input Mappings ──
  try {
    const res = await fetch('/project-data/InputMappings/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/InputMappings/' + entry.file);
          if (r.ok) {
            const mapping = await r.json();
            if (mapping.actionMappings || mapping.axisMappings) {
              engine.input.loadMappings(
                mapping.actionMappings ?? [],
                mapping.axisMappings ?? [],
              );
              console.log('[Runtime]   ✓ Input mappings loaded:', entry.name ?? entry.id);
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* no input mappings */ }

  // ── 8. Data Tables ──
  const dataTableMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/DataTables/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/DataTables/' + entry.file);
          if (r.ok) dataTableMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no data tables */ }

  if (dataTableMap.size > 0) {
    (globalThis as any).__dataTableManager = {
      getTable(id: string) { return dataTableMap.get(id) ?? null; },
      getRow(tableId: string, rowKey: string) {
        const table = dataTableMap.get(tableId);
        if (!table?.rows) return null;
        return table.rows.find((r: any) => r.key === rowKey || r.id === rowKey || r.name === rowKey) ?? null;
      },
    };
    console.log('[Runtime]   ✓ Data tables:', dataTableMap.size);
  }

  // ── 9. Structures & Enums ──
  const structMap = new Map<string, any>();
  const enumMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Structures/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Structures/' + entry.file);
          if (r.ok) structMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no structures */ }
  try {
    const res = await fetch('/project-data/Enums/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Enums/' + entry.file);
          if (r.ok) enumMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no enums */ }

  if (structMap.size > 0 || enumMap.size > 0) {
    (globalThis as any).__structureManager = {
      getStructure(id: string) { return structMap.get(id) ?? null; },
      getEnum(id: string) { return enumMap.get(id) ?? null; },
      getAllStructures() { return Array.from(structMap.values()); },
      getAllEnums() { return Array.from(enumMap.values()); },
    };
    console.log('[Runtime]   ✓ Structures:', structMap.size, 'Enums:', enumMap.size);
  }

  // ── 10. Save Game Classes ──
  const saveGameMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/SaveGameClasses/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/SaveGameClasses/' + entry.file);
          if (r.ok) saveGameMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no save game classes */ }

  if (saveGameMap.size > 0) {
    (globalThis as any).__saveGameManager = {
      getClass(id: string) { return saveGameMap.get(id) ?? null; },
      getAllClasses() { return Array.from(saveGameMap.values()); },
    };
    console.log('[Runtime]   ✓ Save game classes:', saveGameMap.size);
  }

  console.log('[Runtime] Runtime assets loaded');
}

// ── Blueprint Script Execution for 2D Actors ──
// Mirrors Scene2DManager._runActorBlueprintScript() — compiles and runs the
// actor blueprint code (Event Graph) each frame so behaviour matches the editor.
function runActorBlueprintScript(actor: SpriteActor, deltaTime: number): void {
  const actorAny = actor as any;
  const code: string | undefined = actorAny.__actorBlueprintCode;
  if (!code) return;

  let ev = actorBlueprintScripts.get(actor);
  if (!ev) {
    const sc = new ScriptComponent();
    sc.code = code;
    const ok = sc.compile();
    ev = { script: ok ? sc : null, started: false, elapsed: 0 };
    actorBlueprintScripts.set(actor, ev);
    if (!ok) {
      console.warn('[Runtime 2D] Failed to compile actor blueprint for "' + actor.name + '".');
    }
  }
  if (!ev.script) return;

  // ── Scene shim ──
  const sceneShim = {
    get gameObjects() { return spriteActors2D as any[]; },
    findById: (id: number) => spriteActors2D.find(a => (a as any).id === id) ?? null,
    destroyActor: (target: any) => {
      if (target && spriteActors2D.includes(target)) {
        (target as any).__pendingDestroy = true;
      }
    },
  };

  // ── Collision shim (bridges 3D overlap API → 2D events) ──
  const collisionShim = {
    registerCallbacks(_goId: number) {
      const cbs = {
        onBeginOverlap: [] as Array<(evt: any) => void>,
        onEndOverlap:   [] as Array<(evt: any) => void>,
        onHit:          [] as Array<(evt: any) => void>,
      };
      actor.on('triggerBegin2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onBeginOverlap) cb(mapped);
      });
      actor.on('triggerEnd2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onEndOverlap) cb(mapped);
      });
      actor.on('collisionBegin2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onBeginOverlap) cb(mapped);
      });
      actor.on('collisionEnd2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onEndOverlap) cb(mapped);
      });
      return cbs;
    },
    isOverlapping(_a: number, _b: number) { return false; },
    getOverlappingCount(_id: number) { return 0; },
    getOverlappingIds(_id: number) { return []; },
  };

  const physicsShim = {
    collision: collisionShim,
    world: null,
  };

  // ── Engine shim ──
  const engineShim = {
    scene2DManager: null,
    navMeshSystem: null,
    _DragSelectionComponent: null,
    eventBus: EventBus.getInstance(),
    get _playCanvas() { return canvas; },
    input: engine.input,
    uiManager: (engine as any).uiManager ?? null,
    spawnActor: spawnRuntimeActor,
    quit: () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } },
    quit: () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } },
    quit: () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } },
  };

  const ctx = {
    gameObject:   actor as any,
    deltaTime,
    elapsedTime:  ev.elapsed,
    print:        (v: any) => console.log('[Actor2D]', v),
    physics:      physicsShim,
    scene:        sceneShim,
    animInstance:  null,
    engine:       engineShim,
    gameInstance:  (engine as any).gameInstance ?? null,
    projectManager: (engine as any).projectManager ?? null,
    projectManager: (engine as any).projectManager ?? null,
  };

  if (!ev.started) {
    console.log('[Runtime 2D] ▶ BeginPlay (actor blueprint) for "' + actor.name + '"');
    ev.script.beginPlay(ctx);
    ev.started = true;
  }
  ev.script.tick(ctx);
  ev.elapsed += deltaTime;
}

/** Flush deferred actor destroys at end of frame */
function flushPendingDestroys(): void {
  for (let i = spriteActors2D.length - 1; i >= 0; i--) {
    const actor = spriteActors2D[i] as any;
    if (actor.__pendingDestroy) {
      spriteActors2D.splice(i, 1);
      if (root2D) root2D.remove(actor.group);
      const ev = actorBlueprintScripts.get(actor);
      if (ev?.script && ev.started) {
        try {
          const destroyCtx = {
            gameObject: actor,
            deltaTime: 0,
            elapsedTime: ev.elapsed,
            print: (v: any) => console.log('[Actor2D]', v),
            physics: null,
            scene: { get gameObjects() { return spriteActors2D as any[]; }, findById: () => null, destroyActor: () => {} },
            animInstance: null,
            engine: { scene2DManager: null, navMeshSystem: null, _DragSelectionComponent: null, eventBus: EventBus.getInstance(), get _playCanvas() { return canvas; }, input: engine.input, uiManager: null, spawnActor: spawnRuntimeActor },
            gameInstance:  (engine as any).gameInstance ?? null,
    projectManager: (engine as any).projectManager ?? null,
    projectManager: (engine as any).projectManager ?? null,
          };
          ev.script.onDestroy(destroyCtx);
        } catch (err) {
          console.error('[Runtime 2D] Error running onDestroy for "' + actor.name + '":', err);
        }
      }
      actorBlueprintScripts.delete(actor);
      actorAnimBPScripts.delete(actor);
      actorAnimBPStates.delete(actor);
      try { actor.dispose(physics2D ?? undefined); } catch {}
    }
  }
}

// ── AnimBP 2D: Sync physics variables into animator ──
function syncAnimBPVars(actor: SpriteActor, _deltaTime: number): void {
  const animator = actor.animator;
  const actorAny = actor as any;

  if (!actorAny.__animVars) {
    actorAny.__animVars = {
      speed: 0, velocityX: 0, velocityY: 0,
      isGrounded: false, isJumping: false, isFalling: false, facingRight: true,
    };
    const entry = actorAnimBPStates.get(actor);
    const abp = entry?.abp;
    if (abp?.blueprintData?.variables) {
      for (const v of abp.blueprintData.variables as any[]) {
        if (!(v.name in actorAny.__animVars)) {
          let def: any = v.defaultValue ?? null;
          if (v.type === 'Float') def = typeof def === 'number' ? def : 0;
          if (v.type === 'Boolean') def = def === true || def === 'true';
          actorAny.__animVars[v.name] = def;
        }
      }
    }
  }

  if (animator) {
    animator.syncAutoVariables(actor);
    actorAny.__animVars['speed']      = animator.variables['speed']      ?? 0;
    actorAny.__animVars['velocityX']  = animator.variables['velocityX']  ?? 0;
    actorAny.__animVars['velocityY']  = animator.variables['velocityY']  ?? 0;
    actorAny.__animVars['isGrounded'] = animator.variables['isGrounded'] ?? false;
    actorAny.__animVars['isJumping']  = animator.variables['isJumping']  ?? false;
    actorAny.__animVars['isFalling']  = animator.variables['isFalling']  ?? false;
  } else {
    const rb = actor.getComponent('RigidBody2D');
    if (rb?.rigidBody) {
      const vel = rb.rigidBody.linvel();
      actorAny.__animVars['speed']      = Math.abs(vel.x);
      actorAny.__animVars['velocityX']  = vel.x;
      actorAny.__animVars['velocityY']  = vel.y;
      actorAny.__animVars['isGrounded'] = rb.isGrounded ?? false;
      actorAny.__animVars['isJumping']  = vel.y >  0.01 && !(rb.isGrounded ?? false);
      actorAny.__animVars['isFalling']  = vel.y < -0.01 && !(rb.isGrounded ?? false);
    }
  }

  const cm = actor.characterMovement2D;
  if (cm) {
    const rb = actor.getComponent('RigidBody2D');
    const vy = rb?.rigidBody?.linvel()?.y ?? 0;
    actorAny.__animVars['isGrounded']  = cm.isGrounded;
    actorAny.__animVars['isJumping']   = !cm.isGrounded && vy > 0.01;
    actorAny.__animVars['isFalling']   = !cm.isGrounded && vy < -0.01;
    actorAny.__animVars['facingRight'] = cm.facingRight;
    if (animator) {
      animator.variables['isGrounded']  = cm.isGrounded;
      animator.variables['isJumping']   = !cm.isGrounded && vy > 0.01;
      animator.variables['isFalling']   = !cm.isGrounded && vy < -0.01;
      animator.variables['facingRight'] = cm.facingRight;
    }
  }

  const entry = actorAnimBPStates.get(actor);
  const abp = entry?.abp;
  if (!entry || !abp?.compiledCode) return;

  let ev = actorAnimBPScripts.get(actor);
  if (!ev) {
    const sc = new ScriptComponent();
    sc.code = abp.compiledCode;
    const ok = sc.compile();
    ev = { script: ok ? sc : null, started: false, elapsed: 0 };
    actorAnimBPScripts.set(actor, ev);
    if (!ok) console.warn('[Runtime 2D] Failed to compile AnimBP for', abp.name);
  }
  if (!ev.script) return;

  const vars: Record<string, any> = actorAny.__animVars;
  const varShim = {
    get: (k: string) => vars[k],
    set: (k: string, v: any) => { vars[k] = v; if (animator) animator.variables[k] = v; },
    has: (k: string) => k in vars,
  };

  const ctx = {
    gameObject: actor as any,
    deltaTime: _deltaTime,
    elapsedTime: ev.elapsed,
    print: (v: any) => console.log('[AnimBP2D]', v),
    physics: { collision: { registerCallbacks: () => ({ onBeginOverlap: [], onEndOverlap: [], onHit: [] }) }, world: null },
    scene: { get gameObjects() { return spriteActors2D as any[]; }, findById: (id: number) => spriteActors2D.find(a => (a as any).id === id) ?? null, destroyActor: () => {} },
    animInstance: { variables: varShim, asset: abp },
    engine: { scene2DManager: null, navMeshSystem: null, _DragSelectionComponent: null, eventBus: EventBus.getInstance(), get _playCanvas() { return canvas; }, input: engine.input, uiManager: (engine as any).uiManager ?? null, spawnActor: spawnRuntimeActor },
    gameInstance:  (engine as any).gameInstance ?? null,
    projectManager: (engine as any).projectManager ?? null,
    projectManager: (engine as any).projectManager ?? null,
  };

  if (!ev.started) {
    ev.script.beginPlay(ctx);
    ev.started = true;
  }
  ev.script.tick(ctx);
  ev.elapsed += _deltaTime;

  if (animator) {
    for (const k of Object.keys(vars)) {
      animator.variables[k] = vars[k];
    }
  }
}

// ── AnimBP 2D transition evaluator ──
function evalAnimBPTransitions(actor: SpriteActor): void {
  const entry = actorAnimBPStates.get(actor);
  if (!entry) return;
  const { abp } = entry;
  const sm = abp?.stateMachine;
  if (!sm) return;
  const animator = actor.animator;
  if (!animator) return;
  const vars: Record<string, any> = (actor as any).__animVars ?? animator.variables ?? {};

  const transitions: any[] = (sm.transitions ?? [])
    .filter((t: any) => t.fromStateId === entry.currentStateId || t.fromStateId === '*')
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const t of transitions) {
    if (t.toStateId === entry.currentStateId) continue;
    const hasRules = t.rules && t.rules.length > 0;
    if (!hasRules) {
      if (animator.currentAnim?.loop) continue;
      if (animator.isPlaying) continue;
    } else {
      if (!evalTransitionRules(t, vars)) continue;
    }
    const targetState = sm.states.find((s: any) => s.id === t.toStateId);
    if (!targetState) continue;
    entry.currentStateId = t.toStateId;
    if (targetState.blendSpace1D) {
      applyBlendSpace(targetState, vars, animator);
    } else if (targetState.spriteAnimationName) {
      animator.play(targetState.spriteAnimationName);
    }
    break;
  }
}

function evalTransitionRules(t: any, vars: Record<string, any>): boolean {
  const groups: any[] = t.rules ?? [];
  if (groups.length === 0) return true;
  const logic: string = t.ruleLogic ?? 'AND';
  const evalGroup = (g: any) => {
    const rules: any[] = g.rules ?? [];
    if (rules.length === 0) return true;
    const evalRule = (r: any) => {
      if (r.kind === 'expr') {
        try { return !!new Function('vars', 'with(vars){return!!(' + r.expr + ')}')(vars); } catch { return false; }
      }
      const val = vars[r.varName]; const cmp = r.value;
      switch (r.op) {
        case '==': return val == cmp; case '!=': return val != cmp;
        case '>': return Number(val) > Number(cmp); case '<': return Number(val) < Number(cmp);
        case '>=': return Number(val) >= Number(cmp); case '<=': return Number(val) <= Number(cmp);
        case 'contains': return String(val).includes(String(cmp));
        default: return false;
      }
    };
    return g.op === 'AND' ? rules.every(evalRule) : rules.some(evalRule);
  };
  return logic === 'AND' ? groups.every(evalGroup) : groups.some(evalGroup);
}

function applyBlendSpace(state: any, vars: Record<string, any>, animator: any): void {
  const bs = state.blendSpace1D;
  if (!bs?.samples?.length) {
    if (state.spriteAnimationName) animator.play(state.spriteAnimationName);
    return;
  }
  const drivingVar = state.blendSpriteAxisVar || bs.drivingVariable;
  const axisValue: number = typeof vars[drivingVar] === 'number' ? vars[drivingVar] : 0;
  const sorted = [...bs.samples].sort((a: any, b: any) => a.rangeMin - b.rangeMin);
  let best = sorted.find((s: any) => axisValue >= s.rangeMin && axisValue <= s.rangeMax);
  if (!best) {
    best = sorted.reduce((prev: any, cur: any) => {
      const pm = (prev.rangeMin + prev.rangeMax) / 2;
      const cm2 = (cur.rangeMin + cur.rangeMax) / 2;
      return Math.abs(axisValue - cm2) < Math.abs(axisValue - pm) ? cur : prev;
    });
  }
  if (!best?.spriteAnimationName) return;
  if (animator.currentAnim?.animName !== best.spriteAnimationName) {
    animator.play(best.spriteAnimationName);
  }
}

// ── Controller shim setup for 2D actors ──
function setupControllerShims(): void {
  for (const actor of spriteActors2D) {
    const actorAny = actor as any;
    if (!actorAny.__2dControllerShim) {
      actorAny.__2dControllerShim = {
        controllerType: actor.controllerClass === 'AIController' ? 'AIController' : 'PlayerController',
        getPawn: () => ({ gameObject: actor }),
        isPossessing: () => true,
      };
    }
    if (actorAny.controller == null) actorAny.controller = actorAny.__2dControllerShim;
    if (actorAny.characterController == null) actorAny.characterController = { gameObject: actor };
    if (actorAny.actorAssetId == null && actorAny.blueprintId) {
      actorAny.actorAssetId = actorAny.blueprintId;
    }
  }
}

// ── AI Controller setup for 2D actors ──
function setupAIControllers2D(): void {
  for (const ctrl of aiControllers2D) ctrl.destroy?.();
  aiControllers2D = [];

  for (const actor of spriteActors2D) {
    if (actor.controllerClass !== 'AIController') continue;
    if (!actor.characterMovement2D) continue;

    const aiCtrl = new AIController();
    (aiCtrl as any).is2D = true;

    const pawnAdapter: any = {
      gameObject: actor as any,
      controller: null as any,
      destroy() {},
    };
    aiCtrl.possess(pawnAdapter);
    actor.aiController = aiCtrl;
    actor.controller = aiCtrl;

    aiControllers2D.push(aiCtrl);
    engine.aiControllers.register(aiCtrl);
  }

  if (aiControllers2D.length > 0) {
    console.log('[Runtime 2D]   ✓ %d AI controllers created', aiControllers2D.length);
  }
}

// ── Load AnimBP 2D data for actors ──
async function loadAnimBP2DData(): Promise<void> {
  const abpIds = new Set<string>();
  for (const actor of spriteActors2D) {
    if (actor.animBlueprintId) abpIds.add(actor.animBlueprintId);
  }
  if (abpIds.size === 0) return;

  let abpIndex: Array<{ id: string; name: string; file: string }> = [];
  try {
    const res = await fetch('/project-data/AnimBlueprints/_index.json');
    if (res.ok) abpIndex = await res.json();
  } catch { /* no AnimBP index */ }

  const abpMap = new Map<string, any>();
  for (const entry of abpIndex) {
    if (!abpIds.has(entry.id)) continue;
    try {
      const res = await fetch('/project-data/AnimBlueprints/' + entry.file);
      if (res.ok) {
        const abpData = await res.json();
        abpMap.set(entry.id, abpData);
        console.log('[Runtime 2D]   ✓ AnimBP loaded:', entry.name);
      }
    } catch { /* skip */ }
  }

  for (const actor of spriteActors2D) {
    if (!actor.animBlueprintId) continue;
    const abp = abpMap.get(actor.animBlueprintId);
    if (!abp) continue;
    const sm = abp.stateMachine;
    // Use entry state if specified, otherwise fall back to first state
    const entryState = sm?.entryStateId
      ? sm.states?.find((s: any) => s.id === sm.entryStateId) ?? sm?.states?.[0]
      : sm?.states?.[0];
    const initialState = entryState?.id ?? '';
    actorAnimBPStates.set(actor, { abp, currentStateId: initialState });
    if (entryState?.spriteAnimationName && actor.animator) {
      // Swap sprite sheet if entry state uses a different one
      if (entryState.spriteSheetId && actor._spriteSheet?.assetId !== entryState.spriteSheetId) {
        const entrySheet = spriteSheetMap.get(entryState.spriteSheetId);
        if (entrySheet?.image && entrySheet?.texture) {
          actor.setSpriteSheet(entrySheet);
          if (entrySheet.animations?.length > 0) {
            actor.initAnimator(entrySheet.animations);
          }
        }
      }
      actor.animator.play(entryState.spriteAnimationName);
    }
  }
}

// ── 2D Scene Setup ──
async function setup2DScene(sceneData: any): Promise<void> {
  const config2D = sceneData.scene2DConfig;
  const renderSettings = config2D.renderSettings ?? config2D.config?.renderSettings ?? {};
  const worldSettings = config2D.worldSettings ?? config2D.config?.worldSettings ?? {};

  // Background color
  const bgColor = renderSettings.backgroundColor ?? '#1a1a2e';
  engine.scene.threeScene.background = new THREE.Color(bgColor);

  // Renderer settings for 2D
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Create root2D group
  root2D = new THREE.Group();
  root2D.name = '__root2D__';
  engine.scene.threeScene.add(root2D);

  // Create Camera2D
  const ppu = renderSettings.pixelsPerUnit ?? 100;
  camera2D = new Camera2D(undefined, {
    pixelsPerUnit: ppu,
    referenceResolution: renderSettings.referenceResolution ?? { width: 1920, height: 1080 },
    backgroundColor: bgColor,
  });
  camera2D.resize(canvas.clientWidth, canvas.clientHeight);

  // ── Initialise Physics2DWorld ──
  physics2D = new Physics2DWorld();
  await physics2D.init({
    gravity: worldSettings.gravity ?? { x: 0, y: -980 },
    pixelsPerUnit: ppu,
  });
  console.log('[Runtime 2D]   ✓ Physics2DWorld initialised');

  // ── Sorting layer manager for z-ordering ──
  const sortingLayerConfig = config2D.config?.sortingLayers ?? config2D.sortingLayers ?? undefined;
  sortingLayerMgr = new SortingLayerManager(sortingLayerConfig);

  // Load tileset images
  const tilesets: TilesetAsset[] = config2D.tilesets ?? [];
  const tilemaps: TilemapAsset[] = config2D.tilemaps ?? [];
  for (const ts of tilesets) {
    if (ts.imagePath) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => { ts.image = img; console.log('[Runtime 2D]   ✓ Tileset:', ts.assetName, img.naturalWidth + 'x' + img.naturalHeight); resolve(); };
          img.onerror = () => { console.warn('[Runtime 2D]   ✗ Tileset image failed:', ts.imagePath); resolve(); };
          img.src = '/project-data/' + ts.imagePath;
        });
      } catch { /* ignore */ }
    } else if (ts.imageDataUrl) {
      try {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => { ts.image = img; resolve(); };
          img.onerror = () => resolve();
          img.src = ts.imageDataUrl!;
        });
      } catch { /* ignore */ }
    }
  }

  // Build tilemap meshes
  tilemapRenderer = new TilemapRenderer(root2D);
  tilemapRenderer.setAllTilemaps(tilemaps, tilesets);
  console.log('[Runtime 2D]   ✓ Tilemap renderer — %d tilemaps, %d tilesets', tilemaps.length, tilesets.length);

  // ── Build tilemap collision bodies ──
  {
    const collisionBuilder = new TilemapCollisionBuilder();
    for (const tilemap of tilemaps) {
      const tileset = tilesets.find(ts => ts.assetId === tilemap.tilesetId);
      if (!tileset) continue;
      for (const layer of tilemap.layers) {
        collisionBuilder.rebuild(layer, physics2D, tileset);
      }
    }
    const stats = physics2D.getWorldStats();
    console.log('[Runtime 2D]   ✓ Tile collision built — bodies=%d, colliders=%d', stats.bodies, stats.colliders);
  }

  // Load sprite sheet images
  const spriteSheets: any[] = config2D.spriteSheets ?? [];
  const spriteSheetMap = new Map<string, any>();
  for (const ss of spriteSheets) {
    if (ss.imagePath) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => { ss.image = img; console.log('[Runtime 2D]   ✓ SpriteSheet:', ss.assetName); resolve(); };
          img.onerror = () => { console.warn('[Runtime 2D]   ✗ SpriteSheet failed:', ss.imagePath); resolve(); };
          img.src = '/project-data/' + ss.imagePath;
        });
      } catch { /* ignore */ }
    } else if (ss.imageDataUrl) {
      try {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => { ss.image = img; resolve(); };
          img.onerror = () => resolve();
          img.src = ss.imageDataUrl!;
        });
      } catch { /* ignore */ }
    }
    if (ss.image) {
      const tex = new THREE.Texture(ss.image as HTMLImageElement);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;
      ss.texture = tex;
    }
    spriteSheetMap.set(ss.assetId, ss);
  }

  // ── Create 2D game objects with proper SpriteActors ──
  spriteActors2D = [];

  if (sceneData.gameObjects) {
    for (const goData of sceneData.gameObjects) {
      try {
        const go = engine.scene.addGameObjectFromAsset(
          goData.actorAssetId || goData.name,
          goData.name,
          goData.meshType ?? 'cube',
          goData.blueprintData ?? { variables: [], functions: [], macros: [], customEvents: [], structs: [], eventGraph: { nodes: [], connections: [] } },
          goData.position,
          goData.components,
          goData.compiledCode,
          goData.physicsConfig,
          goData.actorType,
          goData.characterPawnConfig || null,
          goData.controllerClass,
          goData.controllerBlueprintId,
        );
        if (go.mesh) go.mesh.visible = false;

        // ── Spawn SpriteActor for characterPawn2D / spriteActor ──
        if (goData.actorType === 'characterPawn2D' || goData.actorType === 'spriteActor') {
          const components = goData.components ?? [];
          const sprComp = components.find((c: any) => c.type === 'spriteRenderer');
          const rb2dComp = components.find((c: any) => c.type === 'rigidbody2d');
          const allCollider2dComps: any[] = components.filter((c: any) => c.type === 'collider2d');
          const solidColliders = allCollider2dComps.filter((c: any) => !c.isTrigger);
          const primaryCollider = solidColliders[0] ?? allCollider2dComps[0] ?? null;
          const cm2dComp = components.find((c: any) => c.type === 'characterMovement2d');
          const cam2dComp = components.find((c: any) => c.type === 'camera2d');

          const colliderShape: 'box' | 'circle' | 'capsule' =
            (primaryCollider?.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule';
          const colW = primaryCollider?.collider2dSize?.width ?? 0.8;
          const colH = primaryCollider?.collider2dSize?.height ?? 1.0;

          const additionalColliders = allCollider2dComps
            .filter((c: any) => c !== primaryCollider)
            .map((c: any) => ({
              shape: (c.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule',
              size: c.collider2dSize ? { width: c.collider2dSize.width, height: c.collider2dSize.height } : undefined,
              radius: c.collider2dRadius,
              isTrigger: !!c.isTrigger,
              name: c.name ?? '',
            }));

          let bodyType: 'dynamic' | 'static' | 'kinematic' | null = null;
          if (rb2dComp) {
            bodyType = (rb2dComp.bodyType ?? 'dynamic') as 'dynamic' | 'static' | 'kinematic';
          } else if (goData.actorType === 'characterPawn2D') {
            bodyType = 'dynamic';
          } else if (allCollider2dComps.length > 0) {
            bodyType = goData.physicsConfig?.simulatePhysics ? 'dynamic' : 'static';
          }

          const spawnPos = { x: goData.position?.x ?? 0, y: goData.position?.y ?? 0 };

          // Read baked characterMovement2DConfig (the real source of movement properties)
          const movCfg = goData.characterMovement2DConfig ?? {};
          const rootPhys = goData.physicsConfig;

          const actorConfig: SpriteActorConfig = {
            name: goData.name,
            actorType: goData.actorType,
            position: spawnPos,
            physicsBodyType: bodyType,
            colliderShape,
            colliderSize: { width: colW, height: colH },
            colliderRadius: primaryCollider?.collider2dRadius,
            componentName: primaryCollider?.name || 'Collider2D',
            isTrigger: primaryCollider?.isTrigger ?? false,
            additionalColliders,
            sortingLayer: sprComp?.sortingLayer ?? 'Default',
            orderInLayer: sprComp?.orderInLayer ?? 0,
            freezeRotation: movCfg.freezeRotation ?? rb2dComp?.freezeRotation ?? rootPhys?.lockRotationZ ?? true,
            ccdEnabled: rb2dComp?.ccdEnabled ?? rootPhys?.ccdEnabled ?? true,
            gravityScale: movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0,
            linearDamping: movCfg.linearDrag ?? rb2dComp?.linearDamping ?? rootPhys?.linearDamping ?? 0.0,
            angularDamping: rb2dComp?.angularDamping ?? rootPhys?.angularDamping ?? 0.05,
            mass: rb2dComp?.mass ?? rootPhys?.mass ?? 1.0,
            friction: rb2dComp?.friction ?? rootPhys?.friction ?? 0.5,
            restitution: rb2dComp?.restitution ?? rootPhys?.restitution ?? 0.1,
            characterMovement2D: !!cm2dComp || goData.actorType === 'characterPawn2D',
            blueprintId: goData.actorAssetId ?? undefined,
          };

          const actor = new SpriteActor(actorConfig);
          actor.id = go.id;
          actor.controllerClass = goData.controllerClass ?? 'None';
          actor.controllerBlueprintId = goData.controllerBlueprintId ?? '';

          actor.spriteRenderer.material.color.setHex(0xffffff);
          actor.spriteRenderer.material.transparent = true;

          // Apply sprite renderer properties from component data
          if (sprComp?.flipX) actor.spriteRenderer.flipX = true;
          if (sprComp?.flipY) actor.spriteRenderer.flipY = true;
          if (sprComp?.spriteScale) actor.spriteRenderer.spriteScale = { x: sprComp.spriteScale.x, y: sprComp.spriteScale.y };
          if (sprComp?.spriteOffset) actor.spriteRenderer.spriteOffset = { x: sprComp.spriteOffset.x, y: sprComp.spriteOffset.y };

          // Set animBlueprintId so loadAnimBP2DData() can wire up state machines
          actor.animBlueprintId = sprComp?.animBlueprint2dId ?? null;

          root2D!.add(actor.group);

          // Apply sorting layers for correct z-ordering
          if (sortingLayerMgr) actor.applySorting(sortingLayerMgr);

          // Attach physics body
          if (physics2D && bodyType) {
            actor.attachPhysicsBody(physics2D, actorConfig);
            const rbComp = actor.getComponent('RigidBody2D');
            if (rbComp?.rigidBody) {
              const gs = movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0;
              rbComp.rigidBody.setGravityScale(gs, true);
            }
          }

          // Attach CharacterMovement2D
          if (cm2dComp || goData.actorType === 'characterPawn2D') {
            // Merge from baked characterMovement2DConfig (the actual source)
            const moveProps = {
              ...defaultCharacterMovement2DProps(),
              ...movCfg,
            };
            const cm2d = new CharacterMovement2D(moveProps);
            cm2d.attach(actor);
            actor.characterMovement2D = cm2d;
            actor.setComponent('CharacterMovement2D', cm2d);

            if (go._runtimeComponents) {
              go._runtimeComponents.set('CharacterMovement2D', cm2d);
              go._runtimeComponents.set('RigidBody2D', actor.getComponent('RigidBody2D'));
              go._runtimeComponents.set('SpriteRenderer', actor.getComponent('SpriteRenderer'));
            }
          }

          // Load sprite sheet (if assigned)
          const sheetId = sprComp?.spriteSheetId;
          const sheet = sheetId ? spriteSheetMap.get(sheetId) : null;
          if (sheet?.image && sheet?.texture) {
            actor.setSpriteSheet(sheet);
            const defaultSprite = sprComp?.defaultSprite
              ? sheet.sprites?.find((s: any) => s.name === sprComp.defaultSprite || s.spriteId === sprComp.defaultSprite)
              : sheet.sprites?.[0];
            if (defaultSprite && sheet.texture) {
              actor.spriteRenderer.setSprite(defaultSprite, sheet.texture);
            }
            if (sheet.animations?.length > 0) {
              actor.initAnimator(sheet.animations);
              if (sheet.animations[0]?.animName) {
                actor.animator?.play(sheet.animations[0].animName);
              }
            }
          }

          // Camera2D follow from camera2d component
          if (cam2dComp && camera2D) {
            const camConfig = cam2dComp.camera2dConfig ?? {};
            const smoothing = camConfig.followSmoothing ?? 0.15;
            const deadZone = {
              x: camConfig.deadZoneX ?? camConfig.deadZone?.width ?? 0.5,
              y: camConfig.deadZoneY ?? camConfig.deadZone?.height ?? 0.5,
            };
            camera2D.follow(actor, smoothing, deadZone);
            if ((camConfig.pixelsPerUnit ?? 0) > 0) camera2D.setPixelsPerUnit(camConfig.pixelsPerUnit);
            camera2D.setPixelPerfect(camConfig.pixelPerfect ?? false);
            if (camConfig.defaultZoom) {
              camera2D.setZoom(camConfig.defaultZoom);
            }
            console.log('[Runtime 2D]   ✓ Camera2D follow → "%s"', goData.name);
          }

          if (goData.compiledCode) {
            (actor as any).__actorBlueprintCode = goData.compiledCode;
          }

          spriteActors2D.push(actor);
          console.log('[Runtime 2D]   + SpriteActor:', goData.name, 'physics:', bodyType ?? 'none', 'hasSprite:', !!sheet);
        } else {
          console.log('[Runtime 2D]   + GO:', goData.name);
        }
      } catch (err) {
        console.error('[Runtime 2D]   ✗ Failed:', goData.name, err);
      }
    }
  }

  // ── Set up controller shims, AI controllers, and AnimBP data ──
  setupControllerShims();
  setupAIControllers2D();
  await loadAnimBP2DData();

  // Start physics
  physics2D.play();
  console.log('[Runtime 2D]   ✓ Physics2D started — %d sprite actors', spriteActors2D.length);

  // Fire BeginPlay
  console.log('[Runtime 2D]   Starting onPlayStarted...');
  await withTimeout(engine.onPlayStarted(canvas), 15000, 'onPlayStarted');
  console.log('[Runtime 2D]   ✓ onPlayStarted done');
  engine.scene.setTriggerHelpersVisible(false);
  engine.scene.setLightHelpersVisible(false);
  engine.scene.setComponentHelpersVisible(false);
}

function isLikely2DSceneData(sceneData: any): boolean {
  if (!sceneData || typeof sceneData !== 'object') return false;
  if (sceneData.sceneMode === '2D') return true;

  const cfg2D = sceneData.scene2DConfig;
  if (!cfg2D) return false;

  if (cfg2D.sceneMode === '2D' || cfg2D.config?.sceneMode === '2D') return true;
  if ((cfg2D.tilemaps?.length ?? 0) > 0) return true;
  if ((cfg2D.tilesets?.length ?? 0) > 0) return true;
  if ((cfg2D.spriteSheets?.length ?? 0) > 0) return true;

  const gos: any[] = Array.isArray(sceneData.gameObjects) ? sceneData.gameObjects : [];
  return gos.some(go => go?.actorType === 'characterPawn2D' || go?.actorType === 'spriteActor');
}

// ── Scene loading helper (reused for initial load AND scene switching) ──
async function loadSceneByName(sceneName: string): Promise<void> {
  if (sceneLoading) {
    console.warn('[Runtime] Scene load already in progress, ignoring:', sceneName);
    return;
  }
  sceneLoading = true;

  try {
    console.log('[Runtime] ▶ Loading scene:', sceneName);

    // 1. Clear the current scene
    const scene = engine.scene;
    while (scene.gameObjects.length > 0) {
      scene.removeGameObject(scene.gameObjects[0]);
    }
    console.log('[Runtime]   ✓ Scene cleared');

    // 2. Stop physics from the old scene (pass scene so stop() can clear body refs)
    if (engine.physics && (engine.physics as any).stop) {
      (engine.physics as any).stop(engine.scene);
    }

    // 2b. Destroy existing character/spectator controllers from previous scene
    engine.characterControllers.destroyAll();
    engine.spectatorControllers.destroyAll();

    // 3. Fetch the new scene JSON
    const res = await fetch('/project-data/Scenes/' + sceneName + '.json');
    if (!res.ok) {
      console.error('[Runtime] Scene not found:', sceneName);
      return;
    }
    const sceneData = await res.json();
    console.log('[Runtime]   ✓ Scene JSON loaded:', sceneData.name, '-', (sceneData.gameObjects?.length ?? 0), 'objects');

    // ── Clean up previous 2D scene resources ──
    // Run onDestroy for all blueprint scripts
    for (const [actor, entry] of actorBlueprintScripts.entries()) {
      if (entry.script && entry.started) {
        try { entry.script.onDestroy({ gameObject: actor as any, deltaTime: 0, elapsedTime: entry.elapsed }); } catch {}
      }
    }
    actorBlueprintScripts.clear();
    for (const [, entry] of actorAnimBPScripts.entries()) {
      if (entry.script && entry.started) {
        try { entry.script.onDestroy({}); } catch {}
      }
    }
    actorAnimBPScripts.clear();
    actorAnimBPStates.clear();
    for (const ctrl of aiControllers2D) {
      try { ctrl.destroy?.(); } catch {}
    }
    aiControllers2D = [];
    for (const actor of spriteActors2D) { actor.dispose(physics2D ?? undefined); }
    spriteActors2D = [];
    if (physics2D) { physics2D.cleanup(); physics2D = null; }
    if (tilemapRenderer) { tilemapRenderer.dispose(); tilemapRenderer = null; }
    if (root2D) { engine.scene.threeScene.remove(root2D); root2D = null; }
    if (camera2D) { camera2D.dispose(); camera2D = null; }

    // ── Remove previous 3D environment objects ──
    const toRemove: THREE.Object3D[] = [];
    engine.scene.threeScene.traverse((obj: THREE.Object3D) => {
      if (obj.name?.startsWith('__runtime_') || (obj as any).isDirectionalLight || (obj as any).isHemisphereLight) {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      engine.scene.threeScene.remove(obj);
      (obj as any).geometry?.dispose();
      if ((obj as any).material?.dispose) (obj as any).material.dispose();
    }

    // ── Detect 2D scene (supports legacy / partially-populated sceneMode) ──
    if (isLikely2DSceneData(sceneData) && sceneData.scene2DConfig) {
      is2DScene = true;
      console.log('[Runtime]   ★ 2D scene detected — setting up 2D rendering');
      await setup2DScene(sceneData);
      console.log('[Runtime] ▶ 2D Scene loaded successfully:', sceneName);
      return;
    }

    // ── 3D scene path ──
    is2DScene = false;
    renderer.toneMapping = saved3DToneMapping;
    renderer.toneMappingExposure = saved3DExposure;
    await setupSceneEnvironment(engine.scene.threeScene);

    // 4. Deserialize game objects
    // Track per-instance material overrides to apply AFTER async meshes load
    const deferredMatOverrides: Array<{ go: any; overrides: any[] }> = [];

    if (sceneData.gameObjects) {
      for (const goData of sceneData.gameObjects) {
        try {
          // Build rootMaterialOverrides by merging:
          //  a) goData.rootMaterialOverrides — baked from actor asset (Record<string, string>)
          //  b) goData.materialOverrides — per-instance overrides with materialAssetId
          // Per-instance overrides (b) take priority over actor-level (a).
          const rootMatOverrides: Record<string, string> = {};

          // Start with actor-asset-level material assignments
          if (goData.rootMaterialOverrides) {
            for (const [slot, matId] of Object.entries(goData.rootMaterialOverrides)) {
              if (matId) rootMatOverrides[slot] = matId as string;
            }
          }

          // Layer per-instance material asset IDs on top (take priority)
          if (goData.materialOverrides) {
            for (const m of goData.materialOverrides) {
              if (m.materialAssetId) rootMatOverrides[String(m.index)] = m.materialAssetId;
            }
          }

          const go = engine.scene.addGameObjectFromAsset(
            goData.actorAssetId || goData.name,
            goData.name,
            goData.meshType,
            goData.blueprintData ?? { variables: [], functions: [], macros: [], customEvents: [], structs: [], eventGraph: { nodes: [], connections: [] } },
            goData.position,
            goData.components,
            goData.compiledCode,
            goData.physicsConfig,
            goData.actorType,
            goData.characterPawnConfig || null,
            goData.controllerClass,
            goData.controllerBlueprintId,
            Object.keys(rootMatOverrides).length > 0 ? rootMatOverrides : undefined,
          );

          // Preserve per-instance physics toggle from serialized scene data
          if (typeof goData.hasPhysics === 'boolean') {
            go.hasPhysics = goData.hasPhysics;
          }

          // Preserve explicit per-instance physics config override
          if (goData.physicsConfig) {
            go.physicsConfig = structuredClone(goData.physicsConfig);
          }

          // Restore custom imported mesh instances (same behavior as SceneSerializer.deserializeScene)
          if (goData.customMeshAssetId) {
            const meshAsset = MeshAssetManager.getInstance().getAsset(goData.customMeshAssetId);
            if (meshAsset) {
              try {
                const meshGo = await engine.scene.addGameObjectFromMeshAsset(meshAsset, goData.position);
                meshGo.name = goData.name;
                meshGo.actorAssetId = goData.actorAssetId ?? null;
                if (goData.rotation) {
                  meshGo.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
                }
                if (goData.scale) {
                  meshGo.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
                }
                if (typeof goData.hasPhysics === 'boolean') {
                  meshGo.hasPhysics = goData.hasPhysics;
                }
                if (goData.physicsConfig) {
                  meshGo.physicsConfig = structuredClone(goData.physicsConfig);
                }
                if (goData.materialOverrides && goData.materialOverrides.length > 0) {
                  deferredMatOverrides.push({ go: meshGo, overrides: goData.materialOverrides });
                }
                console.log('[Runtime]   + Created custom-mesh GO:', goData.name);
                continue;
              } catch (err) {
                console.warn('[Runtime]   ! Failed custom mesh restore for', goData.name, err);
              }
            }
          }

          // Defer per-instance color/PBR overrides — meshes may not be loaded yet
          // (StaticMeshComponent loads asynchronously via loadMeshFromAsset)
          if (goData.materialOverrides && goData.materialOverrides.length > 0) {
            deferredMatOverrides.push({ go, overrides: goData.materialOverrides });
          }

          if (goData.rotation) {
            go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
          }
          if (goData.scale) {
            go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
          }
          console.log('[Runtime]   + Created:', goData.name);
        } catch (err) {
          console.error('[Runtime]   ✗ Failed to create game object:', goData.name, err);
        }
      }
    }

    // 5. Wait for async mesh loads (with timeout)
    console.log('[Runtime]   Waiting for mesh loads...');
    await withTimeout(engine.scene.waitForMeshLoads(), 10000, 'waitForMeshLoads');
    console.log('[Runtime]   ✓ Mesh loads done');

    // 5b. Apply deferred per-instance material color/PBR overrides
    // Now that all static/skeletal meshes are loaded, we can traverse and apply.
    for (const { go, overrides } of deferredMatOverrides) {
      const meshes: THREE.Mesh[] = [];
      const collectMeshes = (obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
        for (const ch of obj.children) {
          if (ch.userData?.__isTriggerHelper || ch.userData?.__isLightHelper || ch.userData?.__isComponentHelper) continue;
          collectMeshes(ch);
        }
      };
      collectMeshes(go.mesh);

      for (const ov of overrides) {
        if (ov.index < 0 || ov.index >= meshes.length) continue;
        const mat = meshes[ov.index].material as THREE.MeshStandardMaterial;
        if (mat && 'color' in mat) {
          if (ov.color) mat.color.set(ov.color);
          if (ov.metalness != null) mat.metalness = ov.metalness;
          if (ov.roughness != null) mat.roughness = ov.roughness;
        }
      }
    }

    // 6. Restart physics
    try {
      engine.physics.play(engine.scene);
      console.log('[Runtime]   ✓ Physics started');
    } catch (err) {
      console.error('[Runtime]   ✗ Physics play failed:', err);
    }

    // 7. Fire BeginPlay on all scripts, set up controllers, navmesh, etc.
    // Clear stale controller scripts from previous scene to prevent leaks
    (engine as any)._controllerScripts = [];
    (engine as any)._activeControllers = [];
    console.log('[Runtime]   Starting onPlayStarted...');
    await withTimeout(engine.onPlayStarted(canvas), 15000, 'onPlayStarted');
    console.log('[Runtime]   ✓ onPlayStarted done');

    // 7b. Hide editor-only helpers (same as editor Play mode)
    engine.scene.setTriggerHelpersVisible(false);
    engine.scene.setLightHelpersVisible(false);
    engine.scene.setComponentHelpersVisible(false);

    // 8. Update fallback camera from scene data
    if (sceneData.camera?.position) {
      fallbackCamera.position.set(
        sceneData.camera.position.x ?? 5,
        sceneData.camera.position.y ?? 5,
        sceneData.camera.position.z ?? 5,
      );
    }
    if (sceneData.camera?.target) {
      fallbackCamera.lookAt(
        sceneData.camera.target.x ?? 0,
        sceneData.camera.target.y ?? 0,
        sceneData.camera.target.z ?? 0,
      );
    }

    console.log('[Runtime] ▶ Scene loaded successfully:', sceneName);
  } catch (err) {
    console.error('[Runtime] Scene load failed:', err);
  } finally {
    sceneLoading = false;
  }
}

// ── ProjectManager shim ──
const runtimeProjectManager = {
  async loadSceneRuntime(sceneName: string): Promise<boolean> {
    try {
      await loadSceneByName(sceneName);
      return true;
    } catch (err) {
      console.error('[Runtime] loadSceneRuntime failed:', err);
      return false;
    }
  },
  async openScene(sceneName: string): Promise<boolean> {
    return this.loadSceneRuntime(sceneName);
  },
};

async function main() {
  setProgress(5, 'Initializing renderer...');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  // Match editor: linear color space (sRGB handled by post-processing)
  // The runtime renders directly to canvas (no EffectComposer / GammaCorrectionShader),
  // so we must use SRGBColorSpace for correct gamma output.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', resize);

  setProgress(10, 'Initializing engine (WASM)...');

  engine = new Engine();
  const initOk = await withTimeout(engine.init(), 15000, 'engine.init');
  if (initOk === undefined) {
    console.error('[Runtime] Engine WASM init timed out — continuing anyway');
  }
  console.log('[Runtime] Engine initialized');

  // Wire up the projectManager shim so blueprint scripts can switch scenes
  engine.projectManager = runtimeProjectManager;
  (engine as any).quit = () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } };
  (engine as any).quit = () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } };
  (engine as any).quit = () => { console.log('[Runtime] Quit requested'); if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) { (window as any).__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }).catch(()=>window.close()); } else if (typeof window !== 'undefined') { window.close(); } };

  // Load mesh assets (mesh bundles with materials/textures) into MeshAssetManager
  setProgress(13, 'Loading mesh assets...');
  await initMeshAssets();

  // Load project metadata early so initRuntimeAssets can use it
  setProgress(15, 'Loading project metadata...');
  let projectMeta: any = {};
  try {
    const pmRes = await fetch('/project-data/Config/project.json');
    if (pmRes.ok) projectMeta = await pmRes.json();
  } catch { /* no project meta */ }

  // Wire up all runtime assets (actors, widgets, sounds, input, etc.)
  setProgress(17, 'Loading runtime assets...');
  await initRuntimeAssets(projectMeta);

  // Save default 3D renderer settings before any scene loads
  saved3DToneMapping = renderer.toneMapping;
  saved3DExposure = renderer.toneMappingExposure;

  // NOTE: environment setup is now handled inside loadSceneByName
  setProgress(19, 'Preparing environment...');

  // Fallback camera (used only when no controller camera exists)
  fallbackCamera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  fallbackCamera.position.set(5, 4, 5);
  fallbackCamera.lookAt(0, 0, 0);

  // Determine start scene
  const startScene = '${startScene}' || 'DefaultScene';

  setProgress(30, 'Loading scene: ' + startScene + '...');
  await loadSceneByName(startScene);

  setProgress(100, 'Ready');
  resize();

  setTimeout(() => {
    loadingOverlay?.classList.add('hidden');
    setTimeout(() => { if (loadingOverlay) loadingOverlay.style.display = 'none'; }, 400);
  }, 200);

  let last = performance.now();
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (sceneLoading) return;

    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    engine.update();

    if (is2DScene && camera2D) {
      // ── 2D rendering path ──
      // Mirrors Scene2DManager.update() order exactly:
      // 1. AI controllers  2. actor.update  3. blueprint scripts
      // 4. syncAnimBPVars  5. evalAnimBPTransitions  6. processEvents  7. flushPendingDestroys

      // Step physics
      if (physics2D) physics2D.step(dt);

      // Update AI controllers
      for (const ctrl of aiControllers2D) {
        try { ctrl.update(dt); } catch {}
      }

      // Update all sprite actors
      for (const actor of spriteActors2D) {
        actor.update(dt);
        runActorBlueprintScript(actor, dt);
        syncAnimBPVars(actor, dt);
        evalAnimBPTransitions(actor);
      }

      // Process collision/trigger events
      if (physics2D) {
        try { physics2D.processEvents(); } catch {}
      }

      // Flush deferred destroys
      flushPendingDestroys();

      camera2D.resize(canvas.clientWidth, canvas.clientHeight);
      camera2D.update(dt);
      if (tilemapRenderer) tilemapRenderer.update(dt);
      renderer.render(engine.scene.threeScene, camera2D.camera);
    } else {
      // ── 3D rendering path ──
      const cam = engine.characterControllers.getActiveCamera()
        ?? engine.spectatorControllers.getActiveCamera()
        ?? engine.playerControllers.getActiveCamera();

      if (cam) {
        cam.aspect = canvas.clientWidth / canvas.clientHeight;
        cam.updateProjectionMatrix();
        renderer.render(engine.scene.threeScene, cam);
      } else {
        fallbackCamera.aspect = canvas.clientWidth / canvas.clientHeight;
        fallbackCamera.updateProjectionMatrix();
        renderer.render(engine.scene.threeScene, fallbackCamera);
      }
    }

    engine.input.update();
  }
  requestAnimationFrame(loop);
}

main().catch(err => {
  console.error('[Game] Fatal error:', err);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = 'Error — see DevTools console';
});
`;
}

// ── Web build target ──────────────────────────────────────────

export class WebBuildTarget {
  private _config: BuildConfigurationJSON;
  private _projectPath: string;
  private _stagingDir: string;
  private _onLog: (msg: string) => void;

  constructor(
    config: BuildConfigurationJSON,
    projectPath: string,
    stagingDir: string,
    onLog: (msg: string) => void,
  ) {
    this._config = config;
    this._projectPath = projectPath;
    this._stagingDir = stagingDir;
    this._onLog = onLog;
  }

  async build(): Promise<BuildStepResult> {
    const webSettings = (this._config.platformSettings as any).settings as WebSettings;
    const outputDir = this._resolveOutputDir();
    const gameProjDir = `${this._projectPath}/BuildCache/web/GameProject`;

    this._log('Generating web game project...');

    // Resolve engine root path (where the engine app is running from)
    let engineRoot: string;
    try {
      engineRoot = await invoke<string>('get_engine_root');
      this._log(`Engine root: ${engineRoot}`);
    } catch (e: any) {
      return { success: false, message: `Failed to resolve engine root: ${e?.message ?? e}` };
    }

    try {
      // 1. Write HTML entry point
      await invoke('write_file', {
        path: `${gameProjDir}/index.html`,
        contents: generateWebHtml(this._config, webSettings),
      });

      // 2. Write PWA manifest if requested
      if (webSettings.enablePWA) {
        await invoke('write_file', {
          path: `${gameProjDir}/public/manifest.json`,
          contents: generateManifest(this._config),
        });
      }

      // 3. Write package.json — include ALL engine deps so npm can resolve
      //    all imports. Vite tree-shakes the final bundle.
      const deps = await this._readCurrentDeps(engineRoot);

      // Separate dev vs runtime deps
      const devPkgNames = new Set([
        '@tauri-apps/cli', 'typescript', 'vite', 'esbuild',
        '@types/react', '@types/react-dom', '@types/three',
      ]);
      const devDependencies: Record<string, string> = {};
      const runtimeDependencies: Record<string, string> = {};
      for (const [name, version] of Object.entries(deps)) {
        if (!version) continue;
        if (devPkgNames.has(name)) devDependencies[name] = version as string;
        else runtimeDependencies[name] = version as string;
      }
      if (!devDependencies['typescript']) devDependencies['typescript'] = '~5.9.3';
      if (!devDependencies['vite']) devDependencies['vite'] = '^8.0.0-beta.13';
      if (!runtimeDependencies['three']) runtimeDependencies['three'] = '^0.182.0';

      await invoke('write_file', {
        path: `${gameProjDir}/package.json`,
        contents: JSON.stringify({
          name: this._config.general.gameName.toLowerCase().replace(/\\s+/g, '-'),
          version: this._config.general.version,
          private: true,
          type: 'module',
          scripts: {
            build: 'vite build'
          },
          devDependencies,
          dependencies: runtimeDependencies,
        }, null, 2),
      });

      // 4. Write Vite config
      await invoke('write_file', {
        path: `${gameProjDir}/vite.config.ts`,
        contents: `import { defineConfig } from 'vite';
export default defineConfig({
  clearScreen: false,
  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: { main: 'index.html' }
    }
  }
});`
      });

      // 5. Copy Engine source code into the generated game project
      this._log('Copying Engine source code...');
      const engineSrcPath = `${engineRoot}/src`;
      this._log(`  Engine source path: ${engineSrcPath}`);
      const srcExists = await invoke<boolean>('file_exists', { path: engineSrcPath });
      if (!srcExists) {
        return {
          success: false,
          message: `Engine source directory not found at: ${engineSrcPath}`,
        };
      }
      this._log(`  ✓ Engine source found at: ${engineSrcPath}`);
      await invoke('copy_directory', {
        src: engineSrcPath,
        dest: `${gameProjDir}/src`,
      });

      // 6. Write game runtime JS (now TS!)
      await invoke('write_file', {
        path: `${gameProjDir}/src/game_runtime.ts`,
        contents: generateWebRuntime(this._config),
      });

      // 7. Write tsconfig
      await invoke('write_file', {
        path: `${gameProjDir}/tsconfig.json`,
        contents: JSON.stringify({
          compilerOptions: {
            target: 'ESNext',
            useDefineForClassFields: true,
            module: 'ESNext',
            lib: ['ESNext', 'DOM'],
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            noEmit: true,
            strict: true
          },
          include: ['src']
        }, null, 2),
      });

      // 8. Copy cooked assets to public/project-data/
      this._log('Copying cooked assets...');
      await invoke('copy_directory', {
        src: this._stagingDir,
        dest: `${gameProjDir}/public/project-data`,
      });

      // 9. Install deps only when package.json changed (cached by stamp)
      const depResult = await this._ensureDependencies(gameProjDir);
      if (!depResult.success) {
        return { success: false, message: 'Dependency install failed:\n' + depResult.message };
      }

      this._log('Running Vite build...');
      const buildResult = await this._runCommand(gameProjDir, this._getNpmCmd(), ['run', 'build']);
      if (!buildResult.success) return { success: false, message: 'Vite build failed:\\n' + buildResult.message };

      // 10. Copy dist/ to output directory
      await invoke('copy_directory', {
        src: `${gameProjDir}/dist`,
        dest: outputDir,
      });

      // 7. Write a README about the CORS requirement
      await invoke('write_file', {
        path: `${outputDir}/README.txt`,
        contents: `${this._config.general.gameName} - Web Build
Version: ${this._config.general.version}

To run this game:
  1. Serve this folder from a web server
     (e.g. npx serve . or python3 -m http.server)
  2. Open http://localhost:3000 in a browser

⚠️ This game CANNOT be opened directly from the filesystem (file://)
   because modern browsers block fetch() calls from file:// origins.

Minimum browser requirements:
  - Chrome 90+ / Firefox 88+ / Safari 15+
  - WebGL 2.0 support required
`,
      });

      this._log(`✓ Web build complete → ${outputDir}`);

      return {
        success: true,
        message: 'Web build successful',
        outputPath: outputDir,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Web build failed: ${e?.message ?? String(e)}`,
      };
    }
  }

  private _resolveOutputDir(): string {
    return this._config.output.outputDirectory ||
      `${this._projectPath}/Builds/web/${this._config.general.gameName.replace(/\\s+/g, '_')}_${this._config.general.version}`;
  }

  private _getNpmCmd(): string {
    // navigator might not exist if running purely in rust context but we are in Tauri webview
    return navigator.userAgent.toLowerCase().includes('windows') ? 'npm.cmd' : 'npm';
  }

  private async _runCommand(cwd: string, cmd: string, args: string[]): Promise<{success: boolean, message: string}> {
    try {
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
        'run_build_command',
        { cwd, command: cmd, args }
      );
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || result.stdout };
      }
      return { success: true, message: 'Success' };
    } catch (e: any) {
      return { success: false, message: String(e) };
    }
  }

  private async _ensureDependencies(gameProjDir: string): Promise<{ success: boolean; message: string }> {
    const pkgPath = `${gameProjDir}/package.json`;
    const nodeModulesPath = `${gameProjDir}/node_modules`;
    const stampPath = `${gameProjDir}/.feather-deps.stamp`;

    try {
      const pkgRaw = await invoke<string>('read_file', { path: pkgPath });
      const pkgHash = this._hashString(pkgRaw);

      const [hasNodeModules, oldStamp] = await Promise.all([
        invoke<boolean>('file_exists', { path: nodeModulesPath }).catch(() => false),
        invoke<string>('read_file', { path: stampPath }).catch(() => ''),
      ]);

      if (hasNodeModules && oldStamp.trim() === pkgHash) {
        this._log('Reusing cached node_modules (package.json unchanged)');
        return { success: true, message: 'cached' };
      }

      this._log('Installing dependencies (package changed or cache missing)...');
      const installResult = await this._runCommand(
        gameProjDir,
        this._getNpmCmd(),
        ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      );
      if (!installResult.success) {
        return { success: false, message: installResult.message };
      }

      await invoke('write_file', { path: stampPath, contents: pkgHash });
      return { success: true, message: 'installed' };
    } catch (e: any) {
      return { success: false, message: e?.message ?? String(e) };
    }
  }

  private _hashString(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private async _readCurrentDeps(engineRoot: string): Promise<any> {
    const pkgPath = `${engineRoot}/package.json`;
    this._log(`  Reading deps from: ${pkgPath}`);
    try {
      const enginePkgRaw = await invoke<string>('read_file', { path: pkgPath });
      const enginePkg = JSON.parse(enginePkgRaw);
      return { ...enginePkg.dependencies, ...enginePkg.devDependencies };
    } catch (e: any) {
      this._log(`  ⚠ Could not read ${pkgPath}: ${e?.message ?? e}. Using default versions.`);
      return {};
    }
  }

  private _log(msg: string): void {
    this._onLog(`[Web] ${msg}`);
  }
}
