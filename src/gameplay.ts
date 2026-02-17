// ============================================================
//  Gameplay Window — Separate runtime window for play mode
//  This file runs in the dedicated gameplay window, receiving
//  scene data from the editor and running the game simulation.
//  Like UE's "Play in Window" mode.
// ============================================================

import * as THREE from 'three';
import { Engine } from './engine/Engine';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

console.log('[Gameplay] Gameplay window script loaded');

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const statsOverlay = document.getElementById('stats-overlay') as HTMLElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
const frameTimeDisplay = document.getElementById('frame-time') as HTMLElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;

let renderer: THREE.WebGLRenderer | null = null;
let engine: Engine | null = null;
let animationId: number | null = null;

// FPS tracking
let lastTime = performance.now();
let frames = 0;
let fpsUpdateTime = 0;

// ---- Initialize renderer ----

function initRenderer(): void {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Match canvas to window size
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer!.setSize(w, h);
  };
  resize();
  window.addEventListener('resize', resize);

  console.log('[Gameplay] Renderer initialized');
}

// ---- Game loop ----

function gameLoop(time: number): void {
  animationId = requestAnimationFrame(gameLoop);

  const dt = (time - lastTime) / 1000;
  lastTime = time;

  // Update FPS counter
  frames++;
  fpsUpdateTime += dt;
  if (fpsUpdateTime >= 0.5) {
    const fps = Math.round(frames / fpsUpdateTime);
    fpsCounter.textContent = `FPS: ${fps}`;
    frameTimeDisplay.textContent = `Frame: ${(dt * 1000).toFixed(2)} ms`;
    frames = 0;
    fpsUpdateTime = 0;
  }

  // Update engine
  if (engine) {
    engine.update();
  }

  // Render
  if (engine && renderer) {
    const cam = engine.characterControllers.getActiveCamera()
      ?? engine.spectatorControllers.getActiveCamera()
      ?? engine.playerControllers.getActiveCamera();

    if (cam) {
      renderer.render(engine.scene.threeScene, cam);
    }
  }
}

// ---- Start gameplay ----

async function startGameplay(sceneData: any): Promise<void> {
  console.log('[Gameplay] Starting gameplay with scene data:', sceneData);

  // Initialize engine
  engine = new Engine();
  engine.onPrint = (msg: any) => {
    console.log('[Game]', msg);
  };

  // Deserialize scene from editor
  if (sceneData && sceneData.gameObjects) {
    console.log('[Gameplay] Loading', sceneData.gameObjects.length, 'game objects...');

    for (const goData of sceneData.gameObjects) {
      try {
        console.log('[Gameplay] Creating game object:', goData.name);

        const go = engine.scene.addGameObjectFromAsset(
          goData.actorAssetId || goData.id,
          goData.name,
          goData.meshType,
          goData.blueprintData,
          {
            x: goData.position[0],
            y: goData.position[1],
            z: goData.position[2],
          },
          goData.components,
          goData.compiledCode,
          goData.physicsConfig,
          goData.actorType,
          goData.characterPawnConfig || null,
          goData.controllerClass,
          goData.controllerBlueprintId,
          goData.rootMaterialOverrides,
        );

        // Apply rotation and scale
        go.mesh.rotation.fromArray(goData.rotation);
        go.mesh.scale.fromArray(goData.scale);

        console.log('[Gameplay] Created game object:', go.name, 'at', go.mesh.position);
      } catch (err) {
        console.error('[Gameplay] Failed to create game object:', goData.name, err);
      }
    }

    console.log('[Gameplay] Scene loaded:', engine.scene.gameObjects.length, 'game objects');
  }

  // Start physics
  engine.physics.play(engine.scene);

  // Start game runtime
  if (canvas) {
    engine.onPlayStarted(canvas);
  }

  // Hide loading overlay
  loadingOverlay.classList.add('hidden');

  // Start game loop
  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);

  console.log('[Gameplay] Gameplay started');
}

// ---- Stop gameplay ----

function stopGameplay(): void {
  console.log('[Gameplay] Stopping gameplay');

  // Cancel animation frame
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Stop engine
  if (engine) {
    engine.onPlayStopped();
    engine.physics.stop(engine.scene);
    engine = null;
  }

  console.log('[Gameplay] Gameplay stopped');
}

// ---- Initialize ----

async function init(): Promise<void> {
  console.log('[Gameplay] Initializing gameplay window');

  initRenderer();

  console.log('[Gameplay] Setting up event listener for gameplay:start...');

  // Listen for scene data from editor window
  await listen('gameplay:start', (event: any) => {
    console.log('[Gameplay] Received gameplay:start event!', event);
    const sceneData = event.payload;
    console.log('[Gameplay] Scene data:', sceneData);
    startGameplay(sceneData);
  });

  console.log('[Gameplay] Event listener for gameplay:start registered');

  // Listen for stop command
  await listen('gameplay:stop', () => {
    console.log('[Gameplay] Received gameplay:stop event');
    stopGameplay();
    // Close this window
    getCurrentWindow().close();
  });

  // Handle window close
  await getCurrentWindow().onCloseRequested(async (event) => {
    console.log('[Gameplay] Window close requested');
    stopGameplay();
    // Allow close to proceed
  });

  console.log('[Gameplay] Gameplay window ready and waiting for gameplay:start event');
}

// Start initialization
init().catch(console.error);
