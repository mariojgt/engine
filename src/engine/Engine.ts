import * as THREE from 'three';
import { Scene } from './Scene';
import { PhysicsWorld } from './PhysicsWorld';
import { ScriptComponent, type ScriptContext } from './ScriptComponent';
import { CharacterControllerManager } from './CharacterController';
import { SpectatorControllerManager } from './SpectatorController';
import { defaultSpectatorPawnConfig } from './SpectatorController';
import { PlayerControllerManager, PlayerController } from './PlayerController';
import { AIControllerManager, AIController } from './AIController';
import { NavMeshSystem } from './ai/NavMeshSystem';
import type { Controller } from './Controller';
import type { AnimationInstance } from './AnimationInstance';
import { UIManager } from './UIManager';
import { MeshAssetManager, buildThreeMaterialFromAsset } from '../editor/MeshAsset';
import { loadMeshFromAsset } from '../editor/MeshImporter';
import { GameInstance } from './GameInstance';
import { DragSelectionComponent } from './DragSelectionComponent';
import { AudioEngine } from './AudioSystem';
import { EventBus } from './EventBus';
import { ParticleSystemManager } from './ParticleSystem';
import { InputManager } from './InputManager';

export class Engine {
  public scene: Scene;
  public physics: PhysicsWorld;
  public input: InputManager = new InputManager();
  public characterControllers: CharacterControllerManager = new CharacterControllerManager();
  public spectatorControllers: SpectatorControllerManager = new SpectatorControllerManager();
  public playerControllers: PlayerControllerManager = new PlayerControllerManager();
  public aiControllers: AIControllerManager = new AIControllerManager();
  public navMeshSystem: NavMeshSystem = new NavMeshSystem();
  public uiManager: UIManager = new UIManager();
  public audio: AudioEngine = new AudioEngine();
  public eventBus: EventBus = EventBus.getInstance();

  /** Exposed DragSelectionComponent class for runtime instantiation by blueprint code */
  public _DragSelectionComponent = DragSelectionComponent;

  /** Play-mode canvas reference for drag selection and other overlay components */
  public _playCanvas: HTMLCanvasElement | null = null;

  /** All controllers created this play session (for central cleanup) */
  private _activeControllers: Controller[] = [];

  /**
   * ScriptComponents created for controller blueprints at play time.
   * Each entry maps: pawnGO → { script, controllerGO } so we can
   * tick and destroy them properly.
   */
  private _controllerScripts: Array<{ go: import('./GameObject').GameObject; script: ScriptComponent }> = [];

  private _clock = new THREE.Clock();
  private _elapsedTime = 0;
  private _playStarted = false;
  private _onUpdate: ((dt: number) => void)[] = [];

  /** Pluggable print handler — editor wires this to the output log */
  public onPrint: (value: any) => void = (v) => console.log('[Print]', v);

  /**
   * Optional reference to the asset manager.
   * Set by the editor so the engine can resolve controller blueprint assets.
   */
  public assetManager: import('../editor/ActorAsset').ActorAssetManager | null = null;

  /**
   * Optional reference to the AI asset manager.
   * Set by the editor so the engine can resolve AI controller blueprints
   * created in the AI section of the content browser.
   */
  public aiAssetManager: import('../editor/ai/AIAssetManager').AIAssetManager | null = null;

  /**
   * BehaviorTreeManager — bridges BT assets to runtime BehaviorTree instances.
   * Initialised automatically when aiAssetManager is set.
   */
  public behaviorTreeManager: import('./BehaviorTreeManager').BehaviorTreeManager | null = null;

  /** PlayerStart spawn transform — set by the editor before play starts */
  public playerStartTransform: { position: { x: number; y: number; z: number }; rotationY: number } | null = null;

  /** ProjectManager reference so blueprint nodes can switch scenes at runtime */
  public projectManager: any = null;

  /** Persistent Game Instance — survives scene loads, destroyed only on play stop */
  public gameInstance: GameInstance | null = null;

  /** Game Instance blueprint manager — set by editor for creating runtime instances */
  public gameInstanceManager: any = null;

  /** Configured Game Instance class ID from Project Settings (like UE's Game Instance Class) */
  public gameInstanceClassId: string | null = null;

  /** 2D Scene Manager reference for 2D camera and sprite nodes */
  public scene2DManager: any = null;

  /** Cached ScriptContext to avoid per-frame allocations */
  private _cachedCtx: ScriptContext = {
    gameObject: null as any,
    deltaTime: 0,
    elapsedTime: 0,
    print: (v: any) => this.onPrint(v),
    physics: null,
    scene: null,
    uiManager: null,
    meshAssetManager: null,
    loadMeshFromAsset: null,
    buildThreeMaterialFromAsset: null,
    projectManager: null,
    gameInstance: null,
    engine: null,
  };

  constructor() {
    this.scene = new Scene();
    this.physics = new PhysicsWorld();
    
    // Initialize static parts of the cached context
    this._cachedCtx.physics = this.physics;
    this._cachedCtx.scene = this.scene;
    this._cachedCtx.uiManager = this.uiManager;
    this._cachedCtx.meshAssetManager = MeshAssetManager.getInstance();
    this._cachedCtx.loadMeshFromAsset = loadMeshFromAsset;
    this._cachedCtx.buildThreeMaterialFromAsset = buildThreeMaterialFromAsset;
    this._cachedCtx.engine = this;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Unified Spawn Actor — global entry point used by blueprint-generated
  //  code.  Automatically dispatches to the correct manager (2D vs 3D)
  //  and emits a 'spawnActor' event on the EventBus so game-level code
  //  can hook into spawning.
  // ─────────────────────────────────────────────────────────────────────
  spawnActor(
    classId: string,
    className: string,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
    scale: { x: number; y: number; z: number },
    owner: any,
    overrides: Record<string, any> | null,
  ): any {
    let result: any = null;

    // 1. Try 2D path if Scene2DManager is actively playing
    const s2d = this.scene2DManager;
    if (s2d && s2d.isPlaying && typeof s2d.spawnActorFromClassId === 'function') {
      result = s2d.spawnActorFromClassId(classId, position, overrides);
    }

    // 2. Fallback to 3D path
    if (result == null && typeof this.scene.spawnActorFromClass === 'function') {
      result = this.scene.spawnActorFromClass(
        classId, className, position, rotation, scale, owner, overrides,
      );
    }

    // 3. Emit global event so custom systems can react (e.g. spawn pooling, analytics)
    try {
      const bus = EventBus.getInstance();
      bus.emit('spawnActor', {
        classId,
        className,
        position,
        rotation,
        scale,
        owner,
        overrides,
        result,
      });
    } catch { /* EventBus not available — fine in gameplay window */ }

    if (result == null) {
      console.warn(`[Engine] spawnActor: failed to spawn actor class="${className}" id="${classId}"`);
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Debug Drawing — ephemeral 3D lines / spheres for blueprint trace nodes
  // ─────────────────────────────────────────────────────────────────────
  private _debugLines: { obj: THREE.Object3D; life: number }[] = [];

  /**
   * Draw a debug line in the 3D scene. Automatically removed after `duration` seconds.
   * Called by generated blueprint code when "Draw Debug" is checked on trace nodes.
   */
  drawDebugLine(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    color: number = 0x00ff00,
    duration = 0.1,
  ): void {
    // console.log(`[Engine] drawDebugLine ${JSON.stringify(start)} -> ${JSON.stringify(end)}`);
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, linewidth: 2 });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 99999;
    line.frustumCulled = false;
    
    // Ensure we add to the active scene
    if (this.scene && this.scene.threeScene) {
        this.scene.threeScene.add(line);
        this._debugLines.push({ obj: line, life: duration });
    } else {
        console.warn('[Engine] drawDebugLine: No active scene to draw into');
    }
  }

  /**
   * Draw a small debug sphere at a point. Useful for visualising hit locations.
   */
  drawDebugPoint(
    point: { x: number; y: number; z: number },
    radius = 0.05,
    color: number = 0xff0000,
    duration = 0.1,
  ): void {
    const geom = new THREE.SphereGeometry(radius, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(point.x, point.y, point.z);
    mesh.renderOrder = 10000;
    mesh.frustumCulled = false;
    this.scene.threeScene.add(mesh);
    this._debugLines.push({ obj: mesh, life: duration });
  }

  /** Tick debug draw lifetimes — called from the main update loop */
  _tickDebugDraw(dt: number): void {
    for (let i = this._debugLines.length - 1; i >= 0; i--) {
      this._debugLines[i].life -= dt;
      if (this._debugLines[i].life <= 0) {
        const entry = this._debugLines[i];
        entry.obj.removeFromParent();
        if ((entry.obj as any).geometry) (entry.obj as any).geometry.dispose();
        if ((entry.obj as any).material) (entry.obj as any).material.dispose();
        this._debugLines.splice(i, 1);
      }
    }
  }

  /** Remove all debug draw objects immediately */
  _clearDebugDraw(): void {
    for (const entry of this._debugLines) {
      entry.obj.removeFromParent();
      if ((entry.obj as any).geometry) (entry.obj as any).geometry.dispose();
      if ((entry.obj as any).material) (entry.obj as any).material.dispose();
    }
    this._debugLines.length = 0;
  }

  /** Dummy GameObject for GameInstance context */
  private _dummyGO: any = { mesh: new THREE.Mesh(), scripts: [], id: -1, name: 'GameInstance' };

  /** Update and return the cached ScriptContext */
  private _getCtx(go: import('./GameObject').GameObject, dt: number, elapsed: number): ScriptContext {
    this._cachedCtx.gameObject = go;
    this._cachedCtx.deltaTime = dt;
    this._cachedCtx.elapsedTime = elapsed;
    this._cachedCtx.projectManager = this.projectManager;
    this._cachedCtx.gameInstance = this.gameInstance;
    return this._cachedCtx;
  }

  async init(): Promise<void> {
    await this.physics.init();
    console.log('Feather Engine initialized');
  }

  /** Called when Play is pressed — fires BeginPlay on all scripts */
  async onPlayStarted(canvas?: HTMLCanvasElement): Promise<void> {
    this._elapsedTime = 0;
    this._playStarted = true;

    // ── 0. Initialize UI overlay & Input ──
    if (canvas) {
      this.uiManager.init(canvas);
      this.input.bindEvents(canvas);
      this._playCanvas = canvas;
    }

    // ── 0a. Wire runtime references into Scene so spawnActorFromClass / destroyActor work ──
    this.scene._runtimePhysics = this.physics;
    this.scene._runtimeUiManager = this.uiManager;
    this.scene._runtimePrint = (v: any) => this.onPrint(v);
    this.scene._runtimeEngine = this;

    // ── 0b. Apply PlayerStart spawn position to character/spectator pawns ──
    if (this.playerStartTransform) {
      const sp = this.playerStartTransform;
      for (const go of this.scene.gameObjects) {
        if (go.actorType === 'characterPawn' || go.actorType === 'spectatorPawn') {
          go.mesh.position.set(sp.position.x, sp.position.y, sp.position.z);
          go.mesh.rotation.y = sp.rotationY;
        }
      }
    }

    // ── 1. Create pawn controllers (CharacterController / SpectatorController) ──
    if (canvas) {
      for (const go of this.scene.gameObjects) {
        if (go.actorType === 'characterPawn' && go.characterPawnConfig) {
          this.characterControllers.createController(
            go,
            go.characterPawnConfig,
            canvas,
            this.physics,
            this.scene.threeScene,
          );
        } else if (go.actorType === 'spectatorPawn') {
          const config = go.spectatorPawnConfig ?? defaultSpectatorPawnConfig();
          this.spectatorControllers.createController(go, config, canvas);
        }
      }

      // Set canvas on all player controllers for cursor control
      for (const pc of this.playerControllers.controllers) {
        pc.setCanvas(canvas);
      }
    }

    // ── 1b. Register character-pawn colliders with the collision system ──
    // Character capsule colliders are created above, AFTER createSensors() already
    // ran during physics.play().  Register them now so triggers can detect pawns.
    for (const go of this.scene.gameObjects) {
      if (go.actorType === 'characterPawn' && go.characterController) {
        const ctrl = go.characterController;
        if (ctrl.collider) {
          this.physics.collision.registerColliderHandle(ctrl.collider.handle, go.id);
        }
      }
    }

    // ── 2. Assign Controllers based on each pawn's controllerClass ──
    let defaultPlayerIndex = 0;
    for (const go of this.scene.gameObjects) {
      const controllerClass = go.controllerClass || 'None';
      const pawn = go.characterController;
      if (!pawn) continue;                      // not a pawn — skip

      if (controllerClass === 'PlayerController') {
        const pc = this.playerControllers.getOrCreate(defaultPlayerIndex++);
        pc.possess(pawn);
        go.controller = pc;
        this._activeControllers.push(pc);
      } else if (controllerClass === 'AIController') {
        const aiCtrl = new AIController();
        aiCtrl.possess(pawn);
        // Set the blueprint class name from the controller blueprint asset
        if (go.controllerBlueprintId) {
          let ctrlName = '';
          if (this.assetManager) {
            const a = this.assetManager.getAsset(go.controllerBlueprintId);
            if (a) ctrlName = a.name;
          }
          if (!ctrlName && this.aiAssetManager) {
            const a = this.aiAssetManager.getAIController(go.controllerBlueprintId);
            if (a) ctrlName = a.name;
          }
          if (ctrlName) aiCtrl.blueprintClassName = ctrlName;
        }
        go.controller = aiCtrl;
        go.aiController = aiCtrl;               // backwards-compat
        this.aiControllers.register(aiCtrl);
        this._activeControllers.push(aiCtrl);
      }
      // 'None' → no controller assigned
    }

    // ── 3. Compile & attach controller blueprint scripts ──
    for (const go of this.scene.gameObjects) {
      if (!go.controllerBlueprintId) continue;

      // Try ActorAssetManager first, then AIAssetManager
      let compiledCode: string | undefined;
      let assetName = 'unknown';

      if (this.assetManager) {
        const ctrlAsset = this.assetManager.getAsset(go.controllerBlueprintId);
        if (ctrlAsset && ctrlAsset.compiledCode) {
          compiledCode = ctrlAsset.compiledCode;
          assetName = ctrlAsset.name;
        }
      }

      // Fallback: check AIAssetManager (AI Controllers created from AI section)
      if (!compiledCode && this.aiAssetManager) {
        const aiCtrl = this.aiAssetManager.getAIController(go.controllerBlueprintId);
        if (aiCtrl && aiCtrl.compiledCode) {
          compiledCode = aiCtrl.compiledCode;
          assetName = aiCtrl.name;
        }
      }

      if (!compiledCode) continue;

      const script = new ScriptComponent();
      script.code = compiledCode;
      if (script.compile()) {
        this._controllerScripts.push({ go, script });
        console.log(`[Engine] Controller blueprint "${assetName}" attached to ${go.name}`);
      }
    }

    // ── 3b. Pre-play check: warn about empty task compiledCode ──
    if (this.aiAssetManager) {
      const tasks = this.aiAssetManager.getAllTasks?.() || [];
      for (const task of tasks) {
        if (!task.compiledCode || task.compiledCode.trim().length === 0) {
          console.warn(`[Engine] ⚠ AI Task "${task.name}" (${task.id}) has EMPTY compiledCode. Open its blueprint editor at least once before Play to compile it.`);
        } else {
          console.log(`[Engine] AI Task "${task.name}" compiledCode OK (${task.compiledCode.length} chars)`);
        }
      }
    }

    // Fallback: if no pawn had an explicit controllerClass, auto-possess the
    // first pawn with PlayerController 0 (backwards-compatible behavior).
    if (this._activeControllers.length === 0) {
      const pc = this.playerControllers.getOrCreate(0);
      const firstCharPawn = this.characterControllers.activePawn;
      const firstSpecPawn = this.spectatorControllers.activeSpectator;
      if (firstCharPawn) {
        pc.possess(firstCharPawn);
        if (firstCharPawn.gameObject) firstCharPawn.gameObject.controller = pc;
        this._activeControllers.push(pc);
      } else if (firstSpecPawn) {
        pc.possess(firstSpecPawn);
        if (firstSpecPawn.gameObject) firstSpecPawn.gameObject.controller = pc;
        this._activeControllers.push(pc);
      }
    }

    // ── 2b. Wire character controllers into AnimBP instances ──
    for (const go of this.scene.gameObjects) {
      if (!go.characterController) continue;
      const instances = (go as any)._animationInstances as AnimationInstance[] | undefined;
      if (!instances) continue;
      for (const inst of instances) {
        inst.characterController = go.characterController;
      }
    }

    // ── 3. Initialize Game Instance BEFORE any BeginPlay ──
    // Must happen first so every blueprint can access __gameInstance in BeginPlay.
    // Uses the class ID configured in Project Settings (like UE's Game Instance Class).
    // Falls back to the first available Game Instance blueprint if none is configured.
    if (!this.gameInstance && this.gameInstanceManager) {
      const assets = this.gameInstanceManager.assets as import('../editor/GameInstanceData').GameInstanceBlueprintAsset[];
      let targetAsset = null;
      if (this.gameInstanceClassId) {
        targetAsset = assets.find((a: any) => a.id === this.gameInstanceClassId) || null;
        if (!targetAsset) {
          console.warn(`[Engine] Configured Game Instance class "${this.gameInstanceClassId}" not found — falling back`);
        }
      }
      if (!targetAsset && assets.length > 0) {
        targetAsset = assets[0];
      }
      if (targetAsset) {
        this.gameInstance = new GameInstance(targetAsset);
        console.log(`[Engine] Created Game Instance from "${targetAsset.name}" (id: ${targetAsset.id})`);
      }
    }
    // Fire BeginPlay on Game Instance first (so its variables are ready for other scripts)
    if (this.gameInstance) {
      const dummyGO = this.scene.gameObjects[0] ?? this._dummyGO;
      const giCtx = this._getCtx(dummyGO, 0, 0);
      this.gameInstance.beginPlay(giCtx);
    }

    // ── 4a. Auto-build NavMesh BEFORE BeginPlay so BT tasks can query it ──
    // If the navmesh was not pre-baked (no data loaded), generate it now from
    // the live Three.js scene so runtime BT tasks / blueprint nodes work.
    if (!this.navMeshSystem.isReady && this.scene.threeScene) {
      console.log('[Engine] NavMesh not yet built – auto-generating from scene geometry...');
      try {
        // Race against a 10 s timeout so WASM init can't hang the game forever
        const navTimeout = new Promise<boolean>(r => setTimeout(() => r(false), 10000));
        const built = await Promise.race([
          this.navMeshSystem.generateFromScene(this.scene.threeScene),
          navTimeout,
        ]);
        if (built) {
          console.log('[Engine] NavMesh auto-built successfully.');
        } else {
          console.warn('[Engine] NavMesh auto-build returned false or timed out.');
        }
      } catch (e) {
        console.error('[Engine] NavMesh auto-build failed:', e);
      }
    }
    // Register AI controllers with the navmesh (built or pre-baked)
    if (this.navMeshSystem.isReady) {
      for (const ctrl of this.aiControllers.controllers) {
        ctrl.registerNavMeshAgent(this.navMeshSystem);
      }
      console.log(`[Engine] NavMesh: ${this.aiControllers.controllers.length} AI agents registered.`);
    } else {
      for (const ctrl of this.aiControllers.controllers) {
        ctrl.navMeshSystem = this.navMeshSystem;
      }
    }
    // ── 4. Fire BeginPlay on all actor & controller scripts ──
    let scriptCount = 0;
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        scriptCount++;
        const ctx = this._getCtx(go, 0, 0);
        script.beginPlay(ctx);
      }
    }
    // Fire BeginPlay on controller blueprint scripts
    for (const { go, script } of this._controllerScripts) {
      scriptCount++;
      const ctx = this._getCtx(go, 0, 0);
      script.beginPlay(ctx);
    }

    console.log(`[Engine] onPlayStarted: ${this.scene.gameObjects.length} gameObjects, ${scriptCount} scripts`);


  }

  /** Called when Stop is pressed — fires OnDestroy on all scripts */
  onPlayStopped(): void {
    let scriptCount = 0;
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        scriptCount++;
        const ctx = this._getCtx(go, 0, this._elapsedTime);
        script.onDestroy(ctx);
        script.reset();
      }
    }
    // OnDestroy for controller scripts
    for (const { go, script } of this._controllerScripts) {
      const ctx = this._getCtx(go, 0, this._elapsedTime);
      script.onDestroy(ctx);
      script.reset();
    }
    this._controllerScripts = [];

    // Destroy character controllers & all Controllers
    this.characterControllers.destroyAll();
    this.spectatorControllers.destroyAll();
    this.aiControllers.destroyAll();
    this.playerControllers.destroyAll();
    this._activeControllers = [];

    // Destroy NavMesh system (crowd agents, navmesh, debug vis)
    this.navMeshSystem.destroy();
    this.navMeshSystem = new NavMeshSystem();
    for (const go of this.scene.gameObjects) {
      go.characterController = null;
      go.aiController = null;
      go.controller = null;

      // Dispose AnimationInstance(s) so their event-graph scripts are properly reset
      const instances = (go as any)._animationInstances as AnimationInstance[] | undefined;
      if (instances) {
        for (const inst of instances) {
          inst.dispose();
        }
      }
    }

    // Destroy UI overlay & Input
    const dummyGO = this.scene.gameObjects[0] ?? this._dummyGO;
    const uiCtx = this._getCtx(dummyGO, 0, this._elapsedTime);
    this.uiManager.destroy(uiCtx);
    this.input.unbindEvents();

    // Clean up drag selection components on all game objects
    for (const go of this.scene.gameObjects) {
      if ((go as any).__dragSelection) {
        (go as any).__dragSelection.destroy();
        (go as any).__dragSelection = null;
      }
      (go as any).__dragSelCallbacks = null;
    }
    this._playCanvas = null;

    // Destroy Game Instance (only when play fully stops, not on scene transitions)
    if (this.gameInstance) {
      const dummyGO = this.scene.gameObjects[0] ?? this._dummyGO;
      const giCtx = this._getCtx(dummyGO, 0, this._elapsedTime);
      this.gameInstance.onDestroy(giCtx);
      this.gameInstance = null;
      console.log('[Engine] Game Instance destroyed');
    }

    // Clear runtime references from Scene
    this.scene._runtimePhysics = null;
    this.scene._runtimeUiManager = null;
    this.scene._runtimePrint = null;
    this.scene._runtimeEngine = null;

    // Clear update callbacks (may have been registered during play)
    this._onUpdate = [];

    // Clear debug draw objects
    this._clearDebugDraw();

    // Stop all audio
    this.audio.stopAll();

    // Stop physics
    this.physics.stop(this.scene);

    // Clear global event bus
    this.eventBus.clear();

    console.log(`[Engine] onPlayStopped: ${scriptCount} scripts received onDestroy`);
    this._playStarted = false;
    this._elapsedTime = 0;
  }

  update(): void {
    let dt = this._clock.getDelta();
    // Clamp delta-time to prevent physics explosions on lag spikes or tab-away
    if (dt > 0.1) dt = 0.1;

    // Update Particles
    // This runs even in edit mode if animations are generally running (using requestAnimationFrame), 
    // but typically we only want physics/logic in play mode.
    // However, for "Editor Preview", we might want it running.
    // For now, let's run it always so the editor panel shows live updates.
    ParticleSystemManager.getInstance().update(dt);

    // Run scripts on all game objects (tick)
    if (this.physics.isPlaying) {
      this._elapsedTime += dt;
      for (const go of this.scene.gameObjects) {
        // Skip destroyed actors and actors with tick disabled
        if (go.isDestroyed || !go.__tickEnabled) continue;
        for (const script of go.scripts) {
          const ctx = this._getCtx(go, dt, this._elapsedTime);
          script.tick(ctx);
        }
      }
      // Tick controller blueprint scripts
      for (const { go, script } of this._controllerScripts) {
        if (go.isDestroyed) continue;
        const ctx = this._getCtx(go, dt, this._elapsedTime);
        script.tick(ctx);
      }

      // Tick Game Instance (persistent across scene loads)
      if (this.gameInstance) {
        const dummyGO = this.scene.gameObjects[0] ?? this._dummyGO;
        const giCtx = this._getCtx(dummyGO, dt, this._elapsedTime);
        this.gameInstance.tick(giCtx);
      }

      // Tick UI Manager (Widget Blueprints)
      const dummyGO = this.scene.gameObjects[0] ?? this._dummyGO;
      const uiCtx = this._getCtx(dummyGO, dt, this._elapsedTime);
      this.uiManager.tick(uiCtx);

      // Update character controllers
      this.characterControllers.update(dt, this.physics);
      // Update spectator controllers
      this.spectatorControllers.update(dt);
      // Update AI controllers
      this.aiControllers.update(dt);

      // Update NavMesh crowd simulation
      this.navMeshSystem.update(dt);

      // Update animation blueprint instances AND skeletal mesh mixers
      // (combined into a single pass over gameObjects for efficiency)
      for (const go of this.scene.gameObjects) {
        const instances = (go as any)._animationInstances as AnimationInstance[] | undefined;
        if (instances) {
          for (const inst of instances) {
            // Ensure runtime references are available for event graph scripts
            if (!inst.physicsRef) inst.physicsRef = this.physics;
            if (!inst.sceneRef) inst.sceneRef = this.scene;
            if (!inst.uiManagerRef) inst.uiManagerRef = this.uiManager;
            if (!inst.engineRef) inst.engineRef = this;
            if (!inst.gameInstanceRef) inst.gameInstanceRef = this.gameInstance;
            inst.printFn = this.onPrint;
            inst.update(dt);
          }
        }
        const mixers = (go as any)._skeletalMeshMixers as THREE.AnimationMixer[] | undefined;
        if (mixers) {
          for (const mixer of mixers) {
            mixer.update(dt);
          }
        }
      }
    }

    // Step physics
    this.physics.step(this.scene, dt);

    // Tick debug draw lifetimes
    this._tickDebugDraw(dt);

    // Notify update listeners
    for (const cb of this._onUpdate) cb(dt);
  }

  onUpdate(cb: (dt: number) => void): void {
    this._onUpdate.push(cb);
  }
}
