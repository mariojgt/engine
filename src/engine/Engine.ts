import * as THREE from 'three';
import { Scene } from './Scene';
import { PhysicsWorld } from './PhysicsWorld';
import { ScriptComponent, type ScriptContext } from './ScriptComponent';
import { CharacterControllerManager } from './CharacterController';
import { SpectatorControllerManager } from './SpectatorController';
import { defaultSpectatorPawnConfig } from './SpectatorController';
import { PlayerControllerManager, PlayerController } from './PlayerController';
import { AIControllerManager, AIController } from './AIController';
import type { Controller } from './Controller';
import type { AnimationInstance } from './AnimationInstance';
import { UIManager } from './UIManager';
import { MeshAssetManager, buildThreeMaterialFromAsset } from '../editor/MeshAsset';
import { loadMeshFromAsset } from '../editor/MeshImporter';
import { GameInstance } from './GameInstance';
import { DragSelectionComponent } from './DragSelectionComponent';
import { AudioEngine } from './AudioSystem';
import { EventBus } from './EventBus';

export class Engine {
  public scene: Scene;
  public physics: PhysicsWorld;
  public characterControllers: CharacterControllerManager = new CharacterControllerManager();
  public spectatorControllers: SpectatorControllerManager = new SpectatorControllerManager();
  public playerControllers: PlayerControllerManager = new PlayerControllerManager();
  public aiControllers: AIControllerManager = new AIControllerManager();
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

  constructor() {
    this.scene = new Scene();
    this.physics = new PhysicsWorld();
  }

  /** Build a ScriptContext with all runtime helpers */
  private _buildCtx(go: import('./GameObject').GameObject, dt: number, elapsed: number, print: (v: any) => void): ScriptContext {
    return {
      gameObject: go,
      deltaTime: dt,
      elapsedTime: elapsed,
      print,
      physics: this.physics,
      scene: this.scene,
      uiManager: this.uiManager,
      meshAssetManager: MeshAssetManager.getInstance(),
      loadMeshFromAsset,
      buildThreeMaterialFromAsset,
      projectManager: this.projectManager,
      gameInstance: this.gameInstance,
      engine: this,
    };
  }

  async init(): Promise<void> {
    await this.physics.init();
    console.log('Feather Engine initialized');
  }

  /** Called when Play is pressed — fires BeginPlay on all scripts */
  onPlayStarted(canvas?: HTMLCanvasElement): void {
    this._elapsedTime = 0;
    this._playStarted = true;
    const print = (v: any) => this.onPrint(v);

    // ── 0. Initialize UI overlay ──
    if (canvas) {
      this.uiManager.init(canvas);
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
        go.controller = aiCtrl;
        go.aiController = aiCtrl;               // backwards-compat
        this.aiControllers.register(aiCtrl);
        this._activeControllers.push(aiCtrl);
      }
      // 'None' → no controller assigned
    }

    // ── 3. Compile & attach controller blueprint scripts ──
    if (this.assetManager) {
      for (const go of this.scene.gameObjects) {
        if (!go.controllerBlueprintId) continue;
        const ctrlAsset = this.assetManager.getAsset(go.controllerBlueprintId);
        if (!ctrlAsset || !ctrlAsset.compiledCode) continue;

        const script = new ScriptComponent();
        script.code = ctrlAsset.compiledCode;
        if (script.compile()) {
          this._controllerScripts.push({ go, script });
          console.log(`[Engine] Controller blueprint "${ctrlAsset.name}" attached to ${go.name}`);
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
      const dummyGO = this.scene.gameObjects[0] ?? ({ mesh: new THREE.Mesh(), scripts: [], id: -1, name: 'GameInstance' } as any);
      const giCtx = this._buildCtx(dummyGO, 0, 0, print);
      this.gameInstance.beginPlay(giCtx);
    }

    // ── 4. Fire BeginPlay on all actor & controller scripts ──
    let scriptCount = 0;
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        scriptCount++;
        const ctx = this._buildCtx(go, 0, 0, print);
        script.beginPlay(ctx);
      }
    }
    // Fire BeginPlay on controller blueprint scripts
    for (const { go, script } of this._controllerScripts) {
      scriptCount++;
      const ctx = this._buildCtx(go, 0, 0, print);
      script.beginPlay(ctx);
    }

    console.log(`[Engine] onPlayStarted: ${this.scene.gameObjects.length} gameObjects, ${scriptCount} scripts`);
  }

  /** Called when Stop is pressed — fires OnDestroy on all scripts */
  onPlayStopped(): void {
    const print = (v: any) => this.onPrint(v);
    let scriptCount = 0;
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        scriptCount++;
        const ctx = this._buildCtx(go, 0, this._elapsedTime, print);
        script.onDestroy(ctx);
        script.reset();
      }
    }
    // OnDestroy for controller scripts
    for (const { go, script } of this._controllerScripts) {
      const ctx = this._buildCtx(go, 0, this._elapsedTime, print);
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

    // Destroy UI overlay
    this.uiManager.destroy();

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
      const dummyGO = this.scene.gameObjects[0] ?? ({ mesh: new THREE.Mesh(), scripts: [], id: -1, name: 'GameInstance' } as any);
      const giCtx = this._buildCtx(dummyGO, 0, this._elapsedTime, print);
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
    const dt = this._clock.getDelta();

    // Run scripts on all game objects (tick)
    if (this.physics.isPlaying) {
      this._elapsedTime += dt;
      const print = (v: any) => this.onPrint(v);
      for (const go of this.scene.gameObjects) {
        // Skip destroyed actors and actors with tick disabled
        if (go.isDestroyed || !go.__tickEnabled) continue;
        for (const script of go.scripts) {
          const ctx = this._buildCtx(go, dt, this._elapsedTime, print);
          script.tick(ctx);
        }
      }
      // Tick controller blueprint scripts
      for (const { go, script } of this._controllerScripts) {
        if (go.isDestroyed) continue;
        const ctx = this._buildCtx(go, dt, this._elapsedTime, print);
        script.tick(ctx);
      }

      // Tick Game Instance (persistent across scene loads)
      if (this.gameInstance) {
        const dummyGO = this.scene.gameObjects[0] ?? ({ mesh: new THREE.Mesh(), scripts: [], id: -1, name: 'GameInstance' } as any);
        const giCtx = this._buildCtx(dummyGO, dt, this._elapsedTime, print);
        this.gameInstance.tick(giCtx);
      }

      // Update character controllers
      this.characterControllers.update(dt, this.physics);
      // Update spectator controllers
      this.spectatorControllers.update(dt);
      // Update AI controllers
      this.aiControllers.update(dt);

      // Update animation blueprint instances (after controllers, before mixers)
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
      }

      // Update skeletal mesh animation mixers
      for (const go of this.scene.gameObjects) {
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

    // Notify update listeners
    for (const cb of this._onUpdate) cb(dt);
  }

  onUpdate(cb: (dt: number) => void): void {
    this._onUpdate.push(cb);
  }
}
