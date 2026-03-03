// ============================================================
//  ScriptContextFactory — Creates ScriptContext objects for
//  blueprint execution with a unified interface.
//
//  Previously, ScriptContext was constructed differently in:
//  - Engine.ts (Play mode 3D)
//  - Scene.ts (actor spawning)
//  - Scene2DManager.ts (Play mode 2D)
//  - Generated game_runtime.ts (export 2D/3D)
//
//  Now there is ONE factory used by all contexts.
// ============================================================

import type { AssetSource } from './AssetSource';

/**
 * The ScriptContext interface consumed by compiled blueprint code.
 * This is the contract between the engine and user blueprints.
 *
 * Every system that executes blueprint code MUST provide this
 * context — and every context has the same shape regardless
 * of whether it's Play mode or an exported build.
 */
export interface UnifiedScriptContext {
  // ── Core References ──
  gameObject: any;
  deltaTime: number;
  elapsedTime: number;

  // ── Logging ──
  print: (...args: any[]) => void;

  // ── Systems ──
  physics: any;       // PhysicsWorld or Physics2DWorld shim
  scene: any;         // Scene proxy with gameObjects, findById, destroyActor
  engine: any;        // Engine proxy with input, uiManager, audio, spawnActor, eventBus
  input: any;         // InputManager reference
  uiManager: any;     // UIManager reference
  gameInstance: any;   // GameInstance reference
  animInstance?: any;  // AnimationInstance (for AnimBP event graphs)

  // ── Asset Access ──
  meshAssetManager: any;       // MeshAssetManager (or shim)
  loadMeshFromAsset: any;      // Function to load a mesh
  buildThreeMaterialFromAsset: any; // Function to build materials

  // ── Project ──
  projectManager: any;         // For scene transitions (openScene)

  // ── Internal tracking ──
  __pTrack?: any;              // Performance tracking (optional)
}

/**
 * Dependencies required to create a ScriptContext.
 * These are provided by FeatherRuntime during initialization.
 */
export interface ScriptContextDeps {
  engine: any;
  scene: any;
  physics: any;
  input: any;
  uiManager: any;
  audioEngine: any;
  gameInstance: any;
  eventBus: any;
  meshAssetManager: any;
  loadMeshFromAsset: (...args: any[]) => any;
  buildThreeMaterialFromAsset: (...args: any[]) => any;
  projectManager: any;
  printFn: (...args: any[]) => void;
  spawnActorFn: (classId: string, className: string, pos: any, rot: any, sc: any, owner: any, overrides: any) => any;
  destroyActorFn: (actor: any) => void;
  quitFn: () => void;
}

/**
 * Creates a ScriptContext for a given game object.
 *
 * This is the SINGLE factory — used in Play mode and exports.
 */
export function createScriptContext(
  deps: ScriptContextDeps,
  gameObject: any,
  deltaTime: number,
  elapsedTime: number,
  physicsOverride?: any,
  animInstance?: any,
): UnifiedScriptContext {
  return {
    gameObject,
    deltaTime,
    elapsedTime,
    print: deps.printFn,
    physics: physicsOverride ?? deps.physics,
    scene: {
      gameObjects: deps.scene?.gameObjects ?? [],
      findById: (id: number) => deps.scene?.gameObjects?.find((go: any) => go.id === id) ?? null,
      findByName: (name: string) => deps.scene?.gameObjects?.find((go: any) => go.name === name) ?? null,
      findByTag: (tag: string) => deps.scene?.gameObjects?.filter((go: any) => go.tags?.includes(tag)) ?? [],
      destroyActor: deps.destroyActorFn,
    },
    engine: {
      input: deps.input,
      uiManager: deps.uiManager,
      audio: deps.audioEngine,
      eventBus: deps.eventBus,
      spawnActor: deps.spawnActorFn,
      quit: deps.quitFn,
    },
    input: deps.input,
    uiManager: deps.uiManager,
    gameInstance: deps.gameInstance,
    animInstance,
    meshAssetManager: deps.meshAssetManager,
    loadMeshFromAsset: deps.loadMeshFromAsset,
    buildThreeMaterialFromAsset: deps.buildThreeMaterialFromAsset,
    projectManager: deps.projectManager,
  };
}
