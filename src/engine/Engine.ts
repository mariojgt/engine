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

export class Engine {
  public scene: Scene;
  public physics: PhysicsWorld;
  public characterControllers: CharacterControllerManager = new CharacterControllerManager();
  public spectatorControllers: SpectatorControllerManager = new SpectatorControllerManager();
  public playerControllers: PlayerControllerManager = new PlayerControllerManager();
  public aiControllers: AIControllerManager = new AIControllerManager();

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

  constructor() {
    this.scene = new Scene();
    this.physics = new PhysicsWorld();
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

    let scriptCount = 0;
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        scriptCount++;
        const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: 0, print, physics: this.physics };
        script.beginPlay(ctx);
      }
    }
    // Fire BeginPlay on controller blueprint scripts
    for (const { go, script } of this._controllerScripts) {
      scriptCount++;
      const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: 0, print, physics: this.physics };
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
        const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: this._elapsedTime, print, physics: this.physics };
        script.onDestroy(ctx);
        script.reset();
      }
    }
    // OnDestroy for controller scripts
    for (const { go, script } of this._controllerScripts) {
      const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: this._elapsedTime, print, physics: this.physics };
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
    }

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
        for (const script of go.scripts) {
          const ctx: ScriptContext = { gameObject: go, deltaTime: dt, elapsedTime: this._elapsedTime, print, physics: this.physics };
          script.tick(ctx);
        }
      }
      // Tick controller blueprint scripts
      for (const { go, script } of this._controllerScripts) {
        const ctx: ScriptContext = { gameObject: go, deltaTime: dt, elapsedTime: this._elapsedTime, print, physics: this.physics };
        script.tick(ctx);
      }

      // Update character controllers
      this.characterControllers.update(dt, this.physics);
      // Update spectator controllers
      this.spectatorControllers.update(dt);
      // Update AI controllers
      this.aiControllers.update(dt);

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
    this.physics.step(this.scene);

    // Notify update listeners
    for (const cb of this._onUpdate) cb(dt);
  }

  onUpdate(cb: (dt: number) => void): void {
    this._onUpdate.push(cb);
  }
}
