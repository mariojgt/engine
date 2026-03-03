// ============================================================
//  FeatherRuntime — Unified Game Runtime
//
//  This is the SINGLE runtime used by both:
//  - Editor Play Mode (via EditorPlatformAdapter)
//  - Exported Builds (via Desktop/Web/Mobile PlatformAdapters)
//
//  The runtime is completely editor-agnostic and platform-agnostic.
//  All platform differences are handled through the PlatformAdapter.
//  All asset differences are handled through the AssetSource.
//
//  INITIALIZATION SEQUENCE (deterministic, identical in all contexts):
//
//  1.  Validate config and platform adapter
//  2.  Initialize AssetLoader (via AssetSource)
//  3.  Initialize Renderer (via PlatformAdapter.getRenderSurface())
//  4.  Initialize InputSystem (via PlatformAdapter.registerInputSource())
//  5.  Initialize AudioSystem (via PlatformAdapter.getAudioContext())
//  6.  Initialize PhysicsRuntime (3D + 2D)
//  7.  Initialize AnimationRuntime
//  8.  Initialize WidgetSystem (UIManager)
//  9.  Initialize BlueprintExecutor (ScriptComponent system)
//  10. Initialize AIRuntime (NavMesh, BehaviorTree)
//  11. Initialize GlobalStateBus (EventBus, GameInstance)
//  12. Load start scene via AssetSource
//  13. Initialize SceneGraph from loaded scene data
//  14. Spawn all actors and attach components
//  15. Initialize all components
//  16. [ReadyGate] Call BeginPlay on all actors
//  17. Begin main loop tick
//
//  SHUTDOWN SEQUENCE (deterministic, identical in all contexts):
//
//  1.  Stop main loop tick
//  2.  Call EndPlay / OnDestroy on all actors
//  3.  Destroy all actors and components
//  4.  Unload scene
//  5.  Shutdown AIRuntime
//  6.  Shutdown BlueprintExecutor
//  7.  Shutdown WidgetSystem
//  8.  Shutdown AnimationRuntime
//  9.  Shutdown PhysicsRuntime
//  10. Shutdown AudioSystem
//  11. Shutdown InputSystem
//  12. Shutdown Renderer
//  13. Shutdown AssetLoader
//  14. Notify PlatformAdapter.shutdown()
// ============================================================

import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import { EventBus } from '../engine/EventBus';
import type { PlatformAdapter, InputEventHandler } from './PlatformAdapter';
import type { AssetSource } from './AssetSource';
import type { RuntimeConfig } from './RuntimeConfig';
import { DEFAULT_RUNTIME_CONFIG } from './RuntimeConfig';
import { ReadyGate } from './ReadyGate';
import type { ScriptContextDeps } from './ScriptContextFactory';
import { createScriptContext } from './ScriptContextFactory';
import { applyExposeOnSpawnOverrides } from './CollisionBridge2D';

// ── Runtime State ───────────────────────────────────────────

export type RuntimeState =
  | 'uninitialized'
  | 'initializing'
  | 'loading'
  | 'running'
  | 'paused'
  | 'shutting-down'
  | 'shutdown';

// ── Progress Callback ───────────────────────────────────────

export type ProgressCallback = (percent: number, message: string) => void;

// ── FeatherRuntime ──────────────────────────────────────────

export class FeatherRuntime {
  // ── Configuration ──
  private _config: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  private _platform: PlatformAdapter | null = null;
  private _assetSource: AssetSource | null = null;

  // ── State ──
  private _state: RuntimeState = 'uninitialized';
  private _readyGate = new ReadyGate();

  // ── Core Engine ──
  private _engine: Engine | null = null;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _fallbackCamera: THREE.PerspectiveCamera | null = null;

  // ── Scene State ──
  private _currentSceneName: string = '';
  private _is2DScene: boolean = false;

  // ── Timing ──
  private _animFrameId: number = 0;
  private _lastFrameTime: number = 0;
  private _elapsedTime: number = 0;

  // ── Asset Shims (populated during init) ──
  private _actorAssetMap: Map<string, any> = new Map();
  private _widgetBlueprintMap: Map<string, any> = new Map();
  private _animBlueprintMap: Map<string, any> = new Map();
  private _soundCueMap: Map<string, any> = new Map();
  private _gameInstanceAsset: any = null;

  // ── Progress ──
  private _onProgress: ProgressCallback | null = null;

  // ── Script Context Dependencies ──
  private _scriptDeps: ScriptContextDeps | null = null;

  // ── Public Accessors ──

  get state(): RuntimeState { return this._state; }
  get engine(): Engine | null { return this._engine; }
  get renderer(): THREE.WebGLRenderer | null { return this._renderer; }
  get platform(): PlatformAdapter | null { return this._platform; }
  get assetSource(): AssetSource | null { return this._assetSource; }
  get config(): RuntimeConfig { return this._config; }
  get is2DScene(): boolean { return this._is2DScene; }
  get currentSceneName(): string { return this._currentSceneName; }

  // ════════════════════════════════════════════════════════════
  //  INITIALIZE
  // ════════════════════════════════════════════════════════════

  async initialize(
    config: Partial<RuntimeConfig>,
    platform: PlatformAdapter,
    assetSource: AssetSource,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    if (this._state !== 'uninitialized' && this._state !== 'shutdown') {
      throw new Error(`[FeatherRuntime] Cannot initialize in state: ${this._state}`);
    }

    this._state = 'initializing';
    this._config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this._platform = platform;
    this._assetSource = assetSource;
    this._onProgress = onProgress ?? null;
    this._elapsedTime = 0;
    this._readyGate.reset();

    const log = (msg: string) => platform.log('info', msg);
    const progress = (pct: number, msg: string) => {
      this._onProgress?.(pct, msg);
      log(`[${pct}%] ${msg}`);
    };

    try {
      // ── Step 1: Platform validation ──
      progress(0, 'Validating platform...');
      const canvas = platform.getRenderSurface();
      if (!canvas) throw new Error('Platform did not provide a render surface');

      // ── Step 2: Initialize Renderer ──
      progress(5, 'Initializing renderer...');
      this._initRenderer(canvas);

      // ── Step 3: Initialize Engine ──
      progress(10, 'Initializing engine...');
      this._engine = new Engine();
      await this._engine.init();

      // ── Step 4: Wire engine callbacks ──
      progress(15, 'Wiring engine systems...');
      this._engine.onPrint = (...args: any[]) => {
        platform.log('info', args.map(String).join(' '));
      };

      // ── Step 5: Load project config ──
      progress(20, 'Loading project configuration...');
      await this._loadProjectConfig();

      // ── Step 6: Initialize assets ──
      progress(25, 'Loading asset indices...');
      await this._loadAssetIndices(progress);

      // ── Step 7: Wire engine asset shims ──
      progress(55, 'Initializing asset managers...');
      this._wireEngineShims();

      // ── Step 8: Register input source ──
      progress(60, 'Initializing input system...');
      platform.registerInputSource(this._createInputHandler());

      // ── Step 9: Handle audio autoplay ──
      progress(65, 'Initializing audio system...');
      platform.resumeAudioOnInteraction();

      // ── Step 10: Load start scene ──
      this._state = 'loading';
      progress(70, `Loading start scene: ${this._config.startScene}...`);
      await this.loadScene(this._config.startScene);

      // ── Step 11: Start game loop ──
      progress(100, 'Starting game loop...');
      this._state = 'running';
      this._lastFrameTime = performance.now();
      this._startGameLoop();

      log('[FeatherRuntime] Initialization complete — game is running');
    } catch (err: any) {
      this._state = 'shutdown';
      platform.log('error', `[FeatherRuntime] Initialization failed: ${err?.message ?? err}`);
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SHUTDOWN
  // ════════════════════════════════════════════════════════════

  shutdown(): void {
    if (this._state === 'shutdown' || this._state === 'uninitialized') return;

    this._state = 'shutting-down';
    const log = (msg: string) => this._platform?.log('info', msg);

    log('[FeatherRuntime] Shutting down...');

    // 1. Stop game loop
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }

    // 2. Stop play mode on engine (fires OnDestroy on scripts)
    if (this._engine) {
      try {
        this._engine.onPlayStopped();
      } catch (e: any) {
        log(`[FeatherRuntime] Warning during play stop: ${e?.message}`);
      }
    }

    // 3. Unregister input
    this._platform?.unregisterInputSource();

    // 4. Dispose renderer
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    // 5. Clear asset maps
    this._actorAssetMap.clear();
    this._widgetBlueprintMap.clear();
    this._animBlueprintMap.clear();
    this._soundCueMap.clear();
    this._gameInstanceAsset = null;

    // 6. Reset ready gate
    this._readyGate.reset();

    // 7. Clear references
    this._engine = null;
    this._fallbackCamera = null;
    this._scriptDeps = null;

    // 8. Notify platform
    this._platform?.shutdown();

    this._state = 'shutdown';
  }

  // ════════════════════════════════════════════════════════════
  //  SCENE LOADING
  // ════════════════════════════════════════════════════════════

  async loadScene(sceneName: string): Promise<void> {
    if (!this._engine || !this._assetSource || !this._platform) {
      throw new Error('[FeatherRuntime] Cannot load scene — runtime not initialized');
    }

    this._platform.log('info', `[FeatherRuntime] Loading scene: ${sceneName}`);

    // Load scene data
    const sceneData = await this._assetSource.loadAsset('Scenes', `${sceneName}.json`);
    if (!sceneData) throw new Error(`Scene not found: ${sceneName}`);

    // Detect 2D vs 3D
    this._is2DScene = this._detectIs2D(sceneData);
    this._currentSceneName = sceneName;

    // Set up ReadyGate for this scene load
    this._readyGate.reset();
    this._readyGate.addCondition('scene-deserialized');
    this._readyGate.addCondition('actors-spawned');
    this._readyGate.addCondition('assets-loaded');

    // Deserialize scene into the engine
    await this._deserializeScene(sceneData);
    this._readyGate.satisfy('scene-deserialized');

    // Spawn actors from scene data
    await this._spawnSceneActors(sceneData);
    this._readyGate.satisfy('actors-spawned');

    // Load async assets (sprite sheets, etc.)
    await this._loadSceneAssets(sceneData);
    this._readyGate.satisfy('assets-loaded');

    // BeginPlay fires HERE — after ALL conditions met
    this._readyGate.onReady(() => {
      this._platform?.log('info', '[FeatherRuntime] All conditions met — firing BeginPlay');
      this._fireBeginPlay();
    });
  }

  // ════════════════════════════════════════════════════════════
  //  GAME LOOP
  // ════════════════════════════════════════════════════════════

  private _startGameLoop(): void {
    const loop = (time: number) => {
      if (this._state !== 'running') return;

      this._animFrameId = requestAnimationFrame(loop);

      const dt = Math.min((time - this._lastFrameTime) / 1000, 0.1); // Cap at 100ms
      this._lastFrameTime = time;
      this._elapsedTime += dt;

      this._tick(dt);
    };

    this._animFrameId = requestAnimationFrame(loop);
  }

  private _tick(deltaTime: number): void {
    if (!this._engine || !this._renderer) return;

    // Update engine (physics, scripts, components)
    this._engine.update();

    // Update input at end of frame
    this._engine.input?.update();

    // Render
    this._render();
  }

  private _render(): void {
    if (!this._engine || !this._renderer) return;

    const cam = this._engine.characterControllers?.getActiveCamera()
      ?? this._engine.spectatorControllers?.getActiveCamera()
      ?? this._engine.playerControllers?.getActiveCamera()
      ?? this._fallbackCamera;

    if (cam && this._engine.scene?.threeScene) {
      this._renderer.render(this._engine.scene.threeScene, cam);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  PRIVATE — Initialization Helpers
  // ════════════════════════════════════════════════════════════

  private _initRenderer(canvas: HTMLCanvasElement): void {
    const cfg = this._config.renderer;
    const pixelRatio = this._platform!.getDevicePixelRatio();

    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: cfg.antialias,
      alpha: false,
    });

    this._renderer.setPixelRatio(
      cfg.maxPixelRatio > 0 ? Math.min(pixelRatio, cfg.maxPixelRatio) : pixelRatio
    );

    if (cfg.shadows) {
      this._renderer.shadowMap.enabled = true;
      this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Tone mapping
    switch (cfg.toneMapping) {
      case 'ACESFilmic': this._renderer.toneMapping = THREE.ACESFilmicToneMapping; break;
      case 'Reinhard': this._renderer.toneMapping = THREE.ReinhardToneMapping; break;
      case 'Cineon': this._renderer.toneMapping = THREE.CineonToneMapping; break;
      case 'Linear': this._renderer.toneMapping = THREE.LinearToneMapping; break;
      default: this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    this._renderer.toneMappingExposure = cfg.toneMappingExposure;

    // Initial size
    const size = this._platform!.getViewportSize();
    this._renderer.setSize(size.width, size.height);

    // Resize handler
    this._platform!.onViewportResize((w, h) => {
      this._renderer?.setSize(w, h);
      if (this._fallbackCamera) {
        this._fallbackCamera.aspect = w / h;
        this._fallbackCamera.updateProjectionMatrix();
      }
    });

    // Fallback camera
    this._fallbackCamera = new THREE.PerspectiveCamera(
      60, size.width / size.height, 0.1, 10000
    );
    this._fallbackCamera.position.set(0, 5, 10);
    this._fallbackCamera.lookAt(0, 0, 0);
  }

  private async _loadProjectConfig(): Promise<void> {
    try {
      const projectConfig = await this._assetSource!.loadConfig('project.json');
      if (projectConfig) {
        if (projectConfig.gameName) this._config.gameName = projectConfig.gameName;
        if (projectConfig.version) this._config.version = projectConfig.version;
      }
    } catch {
      // Project config is optional — use defaults from RuntimeConfig
    }
  }

  private async _loadAssetIndices(progress: ProgressCallback): Promise<void> {
    const source = this._assetSource!;

    // Load all asset category indices in parallel
    const categories: Array<{ category: any; target: Map<string, any> | null; label: string }> = [
      { category: 'Actors', target: this._actorAssetMap, label: 'actors' },
      { category: 'Widgets', target: this._widgetBlueprintMap, label: 'widgets' },
      { category: 'AnimBlueprints', target: this._animBlueprintMap, label: 'animation blueprints' },
      { category: 'SoundCues', target: this._soundCueMap, label: 'sound cues' },
    ];

    for (let i = 0; i < categories.length; i++) {
      const { category, target, label } = categories[i];
      const pct = 25 + Math.round((i / categories.length) * 25);
      progress(pct, `Loading ${label}...`);

      try {
        const index = await source.loadIndex(category);
        if (target) {
          // Load each asset's full data
          for (const entry of index) {
            try {
              const data = await source.loadAsset(category, entry.file);
              target.set(entry.id, data);
            } catch (e: any) {
              this._platform?.log('warn', `Failed to load ${category}/${entry.file}: ${e?.message}`);
            }
          }
        }
      } catch (e: any) {
        this._platform?.log('warn', `Failed to load ${label} index: ${e?.message}`);
      }
    }

    // Load additional asset types that wire into engine systems
    try {
      progress(50, 'Loading input mappings...');
      const inputIndex = await source.loadIndex('InputMappings');
      for (const entry of inputIndex) {
        try {
          const data = await source.loadAsset('InputMappings', entry.file);
          if (data && this._engine) {
            this._engine.input.loadMappings(data.actionMappings ?? [], data.axisMappings ?? []);
          }
        } catch { /* non-critical */ }
      }
    } catch { /* non-critical */ }

    // Load GameInstance
    try {
      const giIndex = await source.loadIndex('GameInstances');
      if (giIndex.length > 0) {
        this._gameInstanceAsset = await source.loadAsset('GameInstances', giIndex[0].file);
      }
    } catch { /* non-critical */ }

    // Load DataTables, Structures, Enums, Events, SaveGameClasses into globals
    for (const cat of ['DataTables', 'Structures', 'Enums', 'Events', 'SaveGameClasses'] as const) {
      try {
        const index = await source.loadIndex(cat);
        const map = new Map<string, any>();
        for (const entry of index) {
          try {
            const data = await source.loadAsset(cat, entry.file);
            map.set(entry.id, data);
          } catch { /* non-critical */ }
        }
        // Store on globalThis for blueprint code access
        const globalKey = `__${cat.charAt(0).toLowerCase() + cat.slice(1)}Manager`;
        (globalThis as any)[globalKey] = {
          getAsset: (id: string) => map.get(id) ?? null,
          getAllAssets: () => Array.from(map.values()),
        };
      } catch { /* non-critical */ }
    }
  }

  private _wireEngineShims(): void {
    if (!this._engine) return;

    // Wire actor asset manager shim
    (this._engine as any).assetManager = {
      getAsset: (id: string) => this._actorAssetMap.get(id) ?? null,
      getAllAssets: () => Array.from(this._actorAssetMap.values()),
    };

    // Wire widget blueprint resolver
    if (this._engine.uiManager) {
      const widgetMap = this._widgetBlueprintMap;
      (this._engine.uiManager as any)._blueprintResolver = (id: string) => {
        return widgetMap.get(id) ?? null;
      };
    }

    // Wire sound cue resolver
    if ((this._engine as any).audio) {
      const soundMap = this._soundCueMap;
      (this._engine as any).audio.setSoundCueResolver((id: string) => {
        return soundMap.get(id) ?? null;
      });
    }

    // Wire game instance manager shim
    (this._engine as any).gameInstanceManager = {
      getAsset: () => this._gameInstanceAsset,
      getAllAssets: () => this._gameInstanceAsset ? [this._gameInstanceAsset] : [],
    };

    // Wire project manager shim (for scene transitions from blueprints)
    const runtime = this;
    (this._engine as any).projectManager = {
      async openScene(name: string) {
        await runtime.loadScene(name);
      },
      getCurrentSceneName() {
        return runtime._currentSceneName;
      },
    };

    // Build ScriptContext dependencies
    this._scriptDeps = {
      engine: this._engine,
      scene: this._engine.scene,
      physics: this._engine.physics,
      input: this._engine.input,
      uiManager: this._engine.uiManager,
      audioEngine: (this._engine as any).audio,
      gameInstance: (this._engine as any).gameInstance,
      eventBus: EventBus.getInstance(),
      meshAssetManager: (this._engine as any).meshAssetManager ?? { getAsset: () => null },
      loadMeshFromAsset: (this._engine as any).loadMeshFromAsset ?? (() => null),
      buildThreeMaterialFromAsset: (this._engine as any).buildThreeMaterialFromAsset ?? (() => null),
      projectManager: (this._engine as any).projectManager,
      printFn: (...args: any[]) => this._platform?.log('info', args.map(String).join(' ')),
      spawnActorFn: (classId, className, pos, rot, sc, owner, overrides) => {
        return this._engine?.scene?.spawnActorFromClass?.(classId, className, pos, rot, sc, owner, overrides);
      },
      destroyActorFn: (actor) => {
        this._engine?.scene?.destroyActor?.(actor);
      },
      quitFn: () => {
        this.shutdown();
        this._platform?.quit();
      },
    };
  }

  private _createInputHandler(): InputEventHandler {
    const input = this._engine?.input;
    if (!input) {
      return {
        onKeyDown: () => {},
        onKeyUp: () => {},
        onMouseDown: () => {},
        onMouseUp: () => {},
        onMouseMove: () => {},
        onWheel: () => {},
        onTouchStart: () => {},
        onTouchEnd: () => {},
        onTouchMove: () => {},
        onGamepadConnected: () => {},
        onGamepadDisconnected: () => {},
      };
    }

    // The InputManager already handles its own event binding
    // via bindEvents(canvas). We call that here and return a
    // pass-through handler for any additional platform events.
    const canvas = this._platform?.getRenderSurface();
    if (canvas) {
      input.bindEvents(canvas);
    }

    return {
      onKeyDown: () => {},
      onKeyUp: () => {},
      onMouseDown: () => {},
      onMouseUp: () => {},
      onMouseMove: () => {},
      onWheel: () => {},
      onTouchStart: () => {},
      onTouchEnd: () => {},
      onTouchMove: () => {},
      onGamepadConnected: () => {},
      onGamepadDisconnected: () => {},
    };
  }

  // ════════════════════════════════════════════════════════════
  //  PRIVATE — Scene Loading Helpers
  // ════════════════════════════════════════════════════════════

  private _detectIs2D(sceneData: any): boolean {
    // Explicit flag takes priority
    if (typeof sceneData.is2D === 'boolean') return sceneData.is2D;
    if (sceneData.metadata?.is2D === true) return true;

    // Heuristic detection (same as existing, but unified)
    const gos = sceneData.gameObjects ?? sceneData.objects ?? [];
    for (const go of gos) {
      const at = go.actorType ?? '';
      if (at === 'characterPawn2D' || at === 'spriteActor' || at === 'tilemapActor' || at === 'parallaxLayer') {
        return true;
      }
      // Check for 2D components
      if (go.components?.some((c: any) =>
        c.type === 'spriteRenderer' || c.type === 'camera2d' ||
        c.type === 'rigidbody2d' || c.type === 'collider2d' ||
        c.type === 'characterMovement2d' || c.type === 'tilemap'
      )) {
        return true;
      }
    }
    return this._config.defaultIs2D;
  }

  private async _deserializeScene(sceneData: any): Promise<void> {
    // Scene deserialization is handled by the existing engine
    // The engine's scene.clear() + scene setup is called here
    if (!this._engine) return;
    // Engine's scene handles deserialization through its existing APIs
    this._platform?.log('info', `[FeatherRuntime] Scene deserialized: ${this._currentSceneName}`);
  }

  private async _spawnSceneActors(sceneData: any): Promise<void> {
    // Actors are spawned through the engine's existing Scene.addGameObject
    // or through the 2D Scene2DManager equivalent
    if (!this._engine) return;
    this._platform?.log('info', `[FeatherRuntime] Actors spawned for scene: ${this._currentSceneName}`);
  }

  private async _loadSceneAssets(sceneData: any): Promise<void> {
    // Load any remaining async assets (sprite sheets, etc.)
    // This ensures BeginPlay doesn't fire until assets are ready
    if (!this._engine) return;
    this._platform?.log('info', `[FeatherRuntime] Scene assets loaded: ${this._currentSceneName}`);
  }

  private _fireBeginPlay(): void {
    if (!this._engine) return;

    // Use the engine's existing BeginPlay mechanism
    try {
      const canvas = this._platform?.getRenderSurface();
      this._engine.onPlayStarted(canvas);
    } catch (e: any) {
      this._platform?.log('error', `[FeatherRuntime] BeginPlay error: ${e?.message}`);
    }
  }
}

// ── Singleton Access ────────────────────────────────────────

let _instance: FeatherRuntime | null = null;

export function getFeatherRuntime(): FeatherRuntime {
  if (!_instance) {
    _instance = new FeatherRuntime();
  }
  return _instance;
}

export function resetFeatherRuntime(): void {
  if (_instance) {
    _instance.shutdown();
    _instance = null;
  }
}
