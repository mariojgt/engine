import * as THREE from 'three';
import { GameObject } from './GameObject';
import { ScriptComponent } from './ScriptComponent';
import type { PhysicsConfig, ActorComponentData, LightConfig, ActorType, SkeletalMeshConfig } from '../runtime/RuntimeTypes';
import { defaultLightConfig } from '../runtime/RuntimeTypes';
import type { CollisionConfig, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from './CollisionTypes';
import { defaultCollisionConfig } from './CollisionTypes';
import type { CharacterPawnConfig } from './CharacterPawnData';
import { tryGetEngineDeps } from '../runtime/EngineDeps';
import { AnimationInstance } from './AnimationInstance';

export type MeshType = 'cube' | 'sphere' | 'cylinder' | 'plane';
export type RootMeshType = MeshType | 'none';

// UE5-style default materials — smooth shading, neutral PBR
const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.55,
  metalness: 0.0,
  flatShading: false,
  envMapIntensity: 0.8,
});

const selectedMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5a623,
  roughness: 0.55,
  metalness: 0.0,
  flatShading: false,
  envMapIntensity: 0.8,
});

const geometries: Record<MeshType, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 32),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(2, 2),
};

export class Scene {
  public threeScene: THREE.Scene;
  public gameObjects: GameObject[] = [];
  public selectedObject: GameObject | null = null;

  /**
   * Optional reference to the ActorAssetManager.
   * Set by the editor/engine so runtime spawning can look up actor classes.
   */
  public assetManager: any = null;

  /**
   * Runtime references — set by Engine at play start, cleared at play stop.
   * Used by spawnActorFromClass to build a proper ScriptContext for spawned actors.
   */
  public _runtimePhysics: any = null;
  public _runtimeUiManager: any = null;
  public _runtimePrint: ((v: any) => void) | null = null;
  public _runtimeEngine: any = null;

  /**
   * Actors destroyed at runtime via DestroyActor node.
   * Stored here so they can be restored when play stops.
   */
  private _runtimeDestroyedGOs: GameObject[] = [];

  /** Pending mesh load promises — awaited before physics play to avoid race conditions */
  private _pendingMeshLoads: Promise<void>[] = [];

  private _onChanged: (() => void)[] = [];
  private _onSelectionChanged: ((obj: GameObject | null) => void)[] = [];

  constructor() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x1a1a2e);

    // NOTE: Default lights, grid, and ground plane are now managed by
    // SceneCompositionManager. The composition manager creates them
    // when createDefaultComposition() is called from main.ts.
  }

  /**
   * Wait for all pending async mesh loads (static mesh components, skeletal meshes)
   * to complete. Call before physics.play() to ensure colliders are accurate.
   */
  async waitForMeshLoads(): Promise<void> {
    if (this._pendingMeshLoads.length > 0) {
      await Promise.allSettled(this._pendingMeshLoads);
      this._pendingMeshLoads = [];
    }
  }

  addGameObject(name: string, type: RootMeshType): GameObject {
    let mesh: THREE.Mesh;
    if (type === 'none') {
      // DefaultSceneRoot — invisible placeholder mesh (no geometry)
      const invisGeo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
      const invisMat = new THREE.MeshBasicMaterial({ visible: false });
      mesh = new THREE.Mesh(invisGeo, invisMat);
      mesh.position.set(0, 3, 0);
    } else {
      const geo = geometries[type]();
      const mat = defaultMaterial.clone();
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, type === 'plane' ? 0 : 3, 0);
      if (type === 'plane') {
        mesh.rotation.x = -Math.PI / 2;
      }
    }

    const go = new GameObject(name, mesh);
    mesh.userData.gameObjectId = go.id;
    this.threeScene.add(mesh);
    this.gameObjects.push(go);
    this._emitChanged();
    return go;
  }

  /**
   * Create a GameObject from an imported MeshAsset.
   * Asynchronously loads the GLB data and places the mesh in the scene.
   */
  async addGameObjectFromMeshAsset(
    meshAsset: MeshAsset,
    position?: { x: number; y: number; z: number },
  ): Promise<GameObject> {
    // Create a placeholder mesh while loading
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x888888, wireframe: true }),
    );
    const pos = position ?? { x: 0, y: 3, z: 0 };
    placeholder.position.set(pos.x, pos.y, pos.z);

    const go = new GameObject(meshAsset.name, placeholder);
    go.customMeshAssetId = meshAsset.id;
    placeholder.userData.gameObjectId = go.id;
    this.threeScene.add(placeholder);
    this.gameObjects.push(go);
    this._emitChanged();

    // Load the actual mesh asynchronously
    try {
      const deps = tryGetEngineDeps();
      const loadFn = deps?.loadMeshFromAsset;
      if (!loadFn) throw new Error('loadMeshFromAsset not available via EngineDeps');
      const { scene: loadedScene, animations } = await loadFn(meshAsset);

      // Replace the placeholder geometry with the loaded mesh
      // Remove placeholder from scene
      this.threeScene.remove(placeholder);
      placeholder.geometry.dispose();

      // Create a group as the root mesh
      const group = new THREE.Group();
      group.position.copy(placeholder.position);
      group.rotation.copy(placeholder.rotation);
      group.scale.copy(placeholder.scale);

      // Add all children from the loaded scene.
      // loadMeshFromAsset already normalises root transforms and enables shadows.
      while (loadedScene.children.length > 0) {
        const child = loadedScene.children[0];
        loadedScene.remove(child);
        group.add(child);
      }

      group.userData.gameObjectId = go.id;
      this.threeScene.add(group);

      // Update the game object's mesh reference
      // Use the group as the "mesh" — it's compatible since THREE.Group extends Object3D
      (go as any).mesh = group as any;

      // Store animations if any
      if (animations.length > 0) {
        // Rename clip names to match stored AnimationAssetJSON.assetName
        if (meshAsset.animations && meshAsset.animations.length > 0) {
          for (const clip of animations) {
            const match = meshAsset.animations.find(
              (a: any) => a.assetName === clip.name || a.assetName.endsWith('_' + clip.name)
            );
            if (match) clip.name = match.assetName;
          }
        }
        (go as any)._animationClips = animations;
        (go as any)._animationMixer = new THREE.AnimationMixer(group);
      }

      this._emitChanged();
    } catch (err) {
      console.error('[Scene] Failed to load imported mesh:', err);
      // Clean up the placeholder so it doesn't ghost in the scene
      this.threeScene.remove(placeholder);
      placeholder.geometry.dispose();
      (placeholder.material as THREE.Material).dispose();
    }

    return go;
  }

  /**
   * Create a GameObject from an ActorAsset reference.
   * The blueprint data is cloned from the asset so each instance is independent at runtime,
   * but `actorAssetId` links it back so the editor can re-sync when the asset changes.
   */
  addGameObjectFromAsset(
    assetId: string,
    assetName: string,
    meshType: RootMeshType,
    blueprintData: import('../runtime/BlueprintData').BlueprintData,
    position?: { x: number; y: number; z: number },
    components?: ActorComponentData[],
    compiledCode?: string,
    physicsConfig?: PhysicsConfig,
    actorType?: ActorType,
    characterPawnConfig?: CharacterPawnConfig | null,
    controllerClass?: import('./Controller').ControllerType,
    controllerBlueprintId?: string,
    rootMaterialOverrides?: Record<string, string>,
    rootHiddenInGame?: boolean,
  ): GameObject {
    const go = this.addGameObject(assetName, meshType);
    go.actorAssetId = assetId;

    // Mark root mesh for Hidden In Game
    if (rootHiddenInGame) {
      go.mesh.userData.__rootHiddenInGame = true;
    }

    // Apply root material overrides
    if (rootMaterialOverrides && Object.keys(rootMaterialOverrides).length > 0) {
      this._applyMaterialOverridesToMesh(go.mesh, rootMaterialOverrides);
    }

    // Apply physics config from the actor asset
    if (physicsConfig) {
      go.physicsConfig = structuredClone(physicsConfig);
      go.hasPhysics = physicsConfig.enabled && physicsConfig.simulatePhysics;
    }

    // Deep copy blueprint data from the asset
    const src = blueprintData;
    const dst = go.blueprintData;
    dst.variables = structuredClone(src.variables);
    dst.functions = structuredClone(src.functions);
    dst.macros = structuredClone(src.macros);
    dst.customEvents = structuredClone(src.customEvents);
    dst.structs = structuredClone(src.structs);
    dst.eventGraph = structuredClone(src.eventGraph);

    if (position) {
      go.mesh.position.set(position.x, position.y, position.z);
    }

    // Set actor type and character pawn config
    if (actorType) go.actorType = actorType;
    if (characterPawnConfig) go.characterPawnConfig = structuredClone(characterPawnConfig);
    if (controllerClass) go.controllerClass = controllerClass;
    if (controllerBlueprintId) go.controllerBlueprintId = controllerBlueprintId;

    // Add child component meshes & collect trigger component data
    if (components) {
      this._applyComponents(go, components);
    }

    // Apply compiled blueprint code so the script runs at play time
    if (compiledCode) {
      if (go.scripts.length === 0) go.scripts.push(new ScriptComponent());
      go.scripts[0].code = compiledCode;
      go.scripts[0].compile();
    }

    return go;
  }

  /**
   * Runtime spawning: create a new actor instance from an ActorAsset class.
   * Called by blueprint-generated code: `__scene.spawnActorFromClass(classId, className, pos, rot, scale, owner, overrides)`
   */
  spawnActorFromClass(
    classId: string,
    className: string,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
    scale: { x: number; y: number; z: number },
    owner: any,
    overrides: Record<string, any> | null,
  ): GameObject | null {
    if (!this.assetManager) {
      console.warn('[Scene] spawnActorFromClass: no assetManager — cannot look up class', className);
      return null;
    }

    const asset = this.assetManager.getAsset(classId);
    if (!asset) {
      console.warn('[Scene] spawnActorFromClass: asset not found for id', classId, className);
      return null;
    }

    // Clone blueprint data from the asset.
    // Cooked actor JSONs store blueprint fields (variables, functions, etc.) at the
    // top level rather than inside a nested `blueprintData` object — synthesise one
    // if necessary so the downstream code always has a valid object to read from.
    const bpData = asset.blueprintData ?? {
      variables: asset.variables ?? [],
      functions: asset.functions ?? [],
      macros: asset.macros ?? [],
      customEvents: asset.customEvents ?? [],
      structs: asset.structs ?? [],
      eventGraph: asset.eventGraphData ?? { nodes: [], connections: [] },
    };
    let origVars: typeof bpData.variables | null = null;

    // Apply Expose on Spawn overrides — temporarily swap variable defaults
    if (overrides) {
      const varsClone = structuredClone(bpData.variables);
      for (const v of varsClone) {
        if (v.exposeOnSpawn && overrides.hasOwnProperty(v.name)) {
          v.defaultValue = overrides[v.name];
        }
      }
      origVars = bpData.variables;
      bpData.variables = varsClone;
    }

    const go = this.addGameObjectFromAsset(
      asset.id,
      asset.name,
      asset.rootMeshType,
      bpData,
      position,
      asset.components,
      asset.compiledCode,
      asset.rootPhysics,
      asset.actorType,
      asset.characterPawnConfig,
      asset.controllerClass,
      asset.controllerBlueprintId,
      asset.rootMaterialOverrides,
      asset.rootHiddenInGame,
    );

    // Restore original variables on the asset if we swapped them
    if (origVars) {
      bpData.variables = origVars;
    }

    // Patch compiled code with override values and re-compile before beginPlay
    // The compiled code has defaults baked in as literals (e.g. "let __var_Health = 100;")
    // We need to replace those with the overridden values so the script starts with correct state.
    if (overrides && go.scripts.length > 0) {
      let code = go.scripts[0].code;
      for (const [name, value] of Object.entries(overrides)) {
        const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
        // Match: let __var_<name> = <anything>;
        const regex = new RegExp(`(let __var_${safeName}\\s*=\\s*)([^;]*)(;)`);
        let serialized: string;
        if (value === null || value === undefined) {
          serialized = 'null';
        } else if (typeof value === 'object') {
          serialized = JSON.stringify(value);
        } else if (typeof value === 'string') {
          serialized = JSON.stringify(value);
        } else if (typeof value === 'boolean') {
          serialized = value ? 'true' : 'false';
        } else {
          serialized = String(value);
        }
        code = code.replace(regex, `$1${serialized}$3`);
      }
      go.scripts[0].code = code;
      go.scripts[0].compile();
    }

    // Apply rotation and scale
    go.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    go.mesh.scale.set(scale.x, scale.y, scale.z);

    // Assign owner
    if (owner && owner.id != null) go.owner = owner;

    // Fire BeginPlay on the spawned actor's scripts immediately
    const printFn = this._runtimePrint ?? ((v: any) => console.log('[Print]', v));
    for (const script of go.scripts) {
      const _deps = tryGetEngineDeps();
      const ctx: import('./ScriptComponent').ScriptContext = {
        gameObject: go,
        deltaTime: 0,
        elapsedTime: 0,
        print: printFn,
        physics: this._runtimePhysics,
        scene: this,
        uiManager: this._runtimeUiManager,
        meshAssetManager: _deps?.meshAssets ?? null,
        loadMeshFromAsset: _deps?.loadMeshFromAsset ?? null,
        buildThreeMaterialFromAsset: _deps?.buildMaterialFromAsset ?? null,
        engine: this._runtimeEngine,
        gameInstance: (this._runtimeEngine as any)?.gameInstance ?? null,
        projectManager: (this._runtimeEngine as any)?.projectManager ?? null,
        actorAssetManager: (this._runtimeEngine as any)?.actorAssetManager ?? null,
      };
      script.beginPlay(ctx);
    }

    // If the spawned actor has a physics body, create it now
    // (physics.play() already ran, so we need to add it manually for
    //  runtime-spawned actors)
    if (this._runtimePhysics && go.hasPhysics && !go.rigidBody) {
      this._runtimePhysics.addPhysicsBody(go);
    }

    // Auto-launch projectile movement if the actor has the component
    if (this._runtimeEngine && (this._runtimeEngine as any)._autoLaunchProjectile) {
      (this._runtimeEngine as any)._autoLaunchProjectile(go);
    }

    console.log(`[Scene] spawnActorFromClass: spawned "${asset.name}" at (${position.x}, ${position.y}, ${position.z})`);
    return go;
  }

  /**
   * Re-sync all scene instances that reference the given actor asset.
   * Called when an actor asset's blueprint is edited.
   */
  syncActorAssetInstances(
    assetId: string,
    assetName: string,
    meshType: RootMeshType,
    blueprintData: import('../runtime/BlueprintData').BlueprintData,
    compiledCode?: string,
    components?: ActorComponentData[],
    physicsConfig?: PhysicsConfig,
    actorType?: ActorType,
    characterPawnConfig?: CharacterPawnConfig | null,
    controllerClass?: import('./Controller').ControllerType,
    controllerBlueprintId?: string,
    rootMaterialOverrides?: Record<string, string>,
  ): void {
    for (const go of this.gameObjects) {
      if (go.actorAssetId !== assetId) continue;
      go.name = assetName;

      // --- Update root mesh geometry if the mesh type changed ---
      if (meshType === 'none') {
        const invisGeo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
        go.mesh.geometry.dispose();
        go.mesh.geometry = invisGeo;
        go.mesh.material = new THREE.MeshBasicMaterial({ visible: false }) as any;
      } else {
        const newGeo = geometries[meshType]();
        go.mesh.geometry.dispose();
        go.mesh.geometry = newGeo;
        // Re-apply root material overrides
        if (rootMaterialOverrides && Object.keys(rootMaterialOverrides).length > 0) {
          this._applyMaterialOverridesToMesh(go.mesh, rootMaterialOverrides);
        }
      }

      // --- Rebuild child component meshes & trigger data ---
      // Collect existing skeletal mesh wrappers (keyed by componentId) so we can
      // reuse them instead of destroying + async-reloading every sync cycle.
      const existingSkeletalMeshes = new Map<string, THREE.Object3D>();
      for (let i = go.mesh.children.length - 1; i >= 0; i--) {
        const child = go.mesh.children[i];
        if (child.userData.__isSkeletalMesh && child.userData.__componentId) {
          existingSkeletalMeshes.set(child.userData.__componentId, child);
          go.mesh.remove(child); // temporarily detach — _applyComponents will re-attach if still valid
        }
      }

      // Remove all remaining (non-skeletal-mesh) children
      while (go.mesh.children.length > 0) {
        const child = go.mesh.children[0];
        go.mesh.remove(child);
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      }
      // Add fresh children from the components list
      if (components) {
        this._applyComponents(go, components, existingSkeletalMeshes);
      } else {
        (go as any)._triggerComponents = [];
      }

      // Dispose any leftover skeletal meshes that were not reused
      for (const leftover of existingSkeletalMeshes.values()) {
        leftover.traverse(child => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else (mat as THREE.Material).dispose();
          }
        });
      }

      // --- Re-clone the blueprint data ---
      const dst = go.blueprintData;
      dst.variables = structuredClone(blueprintData.variables);
      dst.functions = structuredClone(blueprintData.functions);
      dst.macros = structuredClone(blueprintData.macros);
      dst.customEvents = structuredClone(blueprintData.customEvents);
      dst.structs = structuredClone(blueprintData.structs);
      dst.eventGraph = structuredClone(blueprintData.eventGraph);

      // --- Recompile scripts so the latest blueprint code runs at play time ---
      if (compiledCode) {
        if (go.scripts.length === 0) go.scripts.push(new ScriptComponent());
        go.scripts[0].code = compiledCode;
        go.scripts[0].compile();
      }

      // --- Re-sync physics config ---
      if (physicsConfig) {
        go.physicsConfig = structuredClone(physicsConfig);
        go.hasPhysics = physicsConfig.enabled && physicsConfig.simulatePhysics;
      }

      // --- Re-sync actor type / character pawn config ---
      if (actorType) go.actorType = actorType;
      if (characterPawnConfig !== undefined) {
        go.characterPawnConfig = characterPawnConfig ? structuredClone(characterPawnConfig) : null;
      }
      if (controllerClass) go.controllerClass = controllerClass;
      if (controllerBlueprintId !== undefined) go.controllerBlueprintId = controllerBlueprintId || '';
    }
    this._emitChanged();
  }

  clear(): void {
    // Restore any runtime destroyed actors so they can be properly disposed
    this.restoreRuntimeDestroyedActors();

    while (this.gameObjects.length > 0) {
      this.removeGameObject(this.gameObjects[0]);
    }

    this._runtimeDestroyedGOs = [];
    this.selectedObject = null;
    this._emitChanged();
  }

  removeGameObject(go: GameObject): void {
    this.threeScene.remove(go.mesh);
    this.gameObjects = this.gameObjects.filter((o) => o.id !== go.id);
    if (this.selectedObject === go) {
      this.selectObject(null);
    }

    // Properly dispose of Three.js resources to prevent memory leaks
    go.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });

    this._emitChanged();
  }

  /**
   * Runtime "Destroy Actor" — fires OnDestroy on scripts, removes physics bodies,
   * unregisters collision callbacks, removes from Three.js scene & gameObjects array.
   * The GO is backed up so it can be restored when play stops.
   * Called from blueprint-generated code: `__scene.destroyActor(target)`
   */
  destroyActor(go: GameObject): void {
    if (!go) return;

    // Fire OnDestroy on all scripts so cleanup code runs (input listeners, etc.)
    const printFn = this._runtimePrint ?? ((v: any) => console.log('[Print]', v));
    for (const script of go.scripts) {
      try {
        const _deps2 = tryGetEngineDeps();
        const ctx: import('./ScriptComponent').ScriptContext = {
          gameObject: go,
          deltaTime: 0,
          elapsedTime: 0,
          print: printFn,
          physics: this._runtimePhysics,
          scene: this,
          uiManager: this._runtimeUiManager,
          meshAssetManager: _deps2?.meshAssets ?? null,
          loadMeshFromAsset: _deps2?.loadMeshFromAsset ?? null,
          buildThreeMaterialFromAsset: _deps2?.buildMaterialFromAsset ?? null,
          engine: this._runtimeEngine,
          gameInstance: (this._runtimeEngine as any)?.gameInstance ?? null,
          projectManager: (this._runtimeEngine as any)?.projectManager ?? null,
          actorAssetManager: (this._runtimeEngine as any)?.actorAssetManager ?? null,
        };
        script.onDestroy(ctx);
        script.reset();
      } catch (e) {
        console.warn(`[Scene] destroyActor: error in onDestroy for "${go.name}":`, e);
      }
    }

    // Dispose AnimationInstance(s) so event-graph scripts and mixers are cleaned up
    const animInstances = (go as any)._animationInstances as any[] | undefined;
    if (animInstances) {
      for (const inst of animInstances) {
        try { inst.dispose(); } catch { /* noop */ }
      }
    }

    // Remove physics body & colliders
    if (this._runtimePhysics) {
      try {
        this._runtimePhysics.removePhysicsBody(go);
      } catch { /* noop — GO might not have physics */ }
      // Unregister collision callbacks
      if (this._runtimePhysics.collision) {
        try {
          this._runtimePhysics.collision.unregisterCallbacks(go.id);
        } catch { /* noop */ }
      }
    }

    // Do NOT dispose geometry/materials — the GO may need to be restored on stop.
    // Remove from Three.js scene & gameObjects array
    this.threeScene.remove(go.mesh);
    this.gameObjects = this.gameObjects.filter((o) => o.id !== go.id);
    if (this.selectedObject === go) {
      this.selectObject(null);
    }

    // Backup for restoration when play stops
    go.isDestroyed = true;
    this._runtimeDestroyedGOs.push(go);

    console.log(`[Scene] destroyActor: destroyed "${go.name}" (id=${go.id})`);
    this._emitChanged();
  }

  /**
   * Restore all actors that were destroyed at runtime via DestroyActor.
   * Called when play stops to reset the scene to its pre-play state.
   */
  restoreRuntimeDestroyedActors(): void {
    if (this._runtimeDestroyedGOs.length === 0) return;
    for (const go of this._runtimeDestroyedGOs) {
      go.isDestroyed = false;
      // Re-add mesh to Three.js scene
      this.threeScene.add(go.mesh);
      // Re-add to gameObjects array
      this.gameObjects.push(go);
    }
    console.log(`[Scene] Restored ${this._runtimeDestroyedGOs.length} runtime-destroyed actor(s)`);
    this._runtimeDestroyedGOs = [];
    this._emitChanged();
  }

  selectObject(go: GameObject | null): void {
    this.selectedObject = go;
    for (const cb of this._onSelectionChanged) cb(go);
  }

  findById(id: number): GameObject | undefined {
    return this.gameObjects.find((o) => o.id === id);
  }

  onChanged(cb: () => void): void {
    this._onChanged.push(cb);
  }

  onSelectionChanged(cb: (obj: GameObject | null) => void): void {
    this._onSelectionChanged.push(cb);
  }

  private _emitChanged(): void {
    for (const cb of this._onChanged) cb();
  }

  // ------------------------------------------------------------------
  //  Apply child components (mesh + trigger) from ActorComponentData[]
  // ------------------------------------------------------------------

  /** Translucent green wireframe material for trigger volumes (UE-style) */
  private static _triggerWireMat = new THREE.LineBasicMaterial({
    color: 0x00e676,
    transparent: true,
    opacity: 0.6,
    depthTest: true,
  });

  /** Semi-transparent fill for trigger volumes so they're easy to spot */
  private static _triggerFillMat = new THREE.MeshBasicMaterial({
    color: 0x00e676,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  /** Build a wireframe + translucent fill group for a trigger's collision shape */
  private _createTriggerHelper(cfg: CollisionConfig): THREE.Group {
    const group = new THREE.Group();
    group.userData.__isTriggerHelper = true;

    let geo: THREE.BufferGeometry;
    switch (cfg.shape) {
      case 'sphere': {
        const d = cfg.dimensions as SphereShapeDimensions;
        geo = new THREE.SphereGeometry(d.radius, 20, 12);
        break;
      }
      case 'capsule': {
        const d = cfg.dimensions as CapsuleShapeDimensions;
        geo = new THREE.CapsuleGeometry(d.radius, d.height, 8, 16);
        break;
      }
      case 'box':
      default: {
        const d = cfg.dimensions as BoxShapeDimensions;
        geo = new THREE.BoxGeometry(d.width, d.height, d.depth);
        break;
      }
    }

    // Wireframe edges
    const edges = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(edges, Scene._triggerWireMat);
    group.add(wire);

    // Translucent fill
    const fill = new THREE.Mesh(geo, Scene._triggerFillMat);
    group.add(fill);

    return group;
  }

  private _applyComponents(
    go: GameObject,
    components: ActorComponentData[],
    existingSkeletalMeshes?: Map<string, THREE.Object3D>,
  ): void {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const triggers: Array<{ config: CollisionConfig; name: string; index: number; offset: { x: number; y: number; z: number } }> = [];
    let triggerIdx = 0;
    const lightComps: Array<{ light: THREE.Light; config: LightConfig; name: string; index: number }> = [];
    let lightIdx = 0;
    const meshComps: Array<{ mesh: THREE.Object3D; name: string; index: number }> = [];
    let meshIdx = 0;

    // Clear any existing skeletal mesh mixers — they'll be re-populated below
    (go as any)._skeletalMeshMixers = [];
    // Clear any existing animation instances — they'll be re-populated below
    (go as any)._animationInstances = [];

    for (const comp of components) {
      if (comp.type === 'trigger') {
        // Collect trigger component data for the collision system
        const cfg = comp.collision
          ? structuredClone(comp.collision)
          : defaultCollisionConfig();
        triggers.push({
          config: cfg,
          name: comp.name,
          index: triggerIdx++,
          offset: { x: comp.offset.x, y: comp.offset.y, z: comp.offset.z },
        });

        // Create a visible wireframe helper so the trigger is visible in the viewport
        const helper = this._createTriggerHelper(cfg);
        helper.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
        helper.userData.__triggerCompName = comp.name;
        go.mesh.add(helper);
      } else if (comp.type === 'light') {
        // Light component — create Three.js light
        const cfg: LightConfig = comp.light ? { ...defaultLightConfig(comp.light.lightType), ...comp.light } : defaultLightConfig('point');
        let threeLight: THREE.Light;

        switch (cfg.lightType) {
          case 'directional': {
            const dl = new THREE.DirectionalLight(cfg.color, cfg.intensity);
            dl.castShadow = cfg.castShadow;
            dl.shadow.mapSize.width = cfg.shadowMapSize;
            dl.shadow.mapSize.height = cfg.shadowMapSize;
            dl.shadow.bias = cfg.shadowBias;
            dl.shadow.camera.near = 0.5;
            dl.shadow.camera.far = 50;
            dl.shadow.camera.left = -15;
            dl.shadow.camera.right = 15;
            dl.shadow.camera.top = 15;
            dl.shadow.camera.bottom = -15;
            dl.target.position.set(cfg.target.x, cfg.target.y, cfg.target.z);
            threeLight = dl;
            // The target must be added to the scene for it to work
            go.mesh.add(dl.target);
            break;
          }
          case 'point': {
            const pl = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
            pl.castShadow = cfg.castShadow;
            pl.shadow.mapSize.width = cfg.shadowMapSize;
            pl.shadow.mapSize.height = cfg.shadowMapSize;
            pl.shadow.bias = cfg.shadowBias;
            threeLight = pl;
            break;
          }
          case 'spot': {
            const toRadLight = (d: number) => (d * Math.PI) / 180;
            const sl = new THREE.SpotLight(cfg.color, cfg.intensity, cfg.distance, toRadLight(cfg.angle), cfg.penumbra, cfg.decay);
            sl.castShadow = cfg.castShadow;
            sl.shadow.mapSize.width = cfg.shadowMapSize;
            sl.shadow.mapSize.height = cfg.shadowMapSize;
            sl.shadow.bias = cfg.shadowBias;
            sl.target.position.set(cfg.target.x, cfg.target.y, cfg.target.z);
            threeLight = sl;
            go.mesh.add(sl.target);
            break;
          }
          case 'ambient': {
            threeLight = new THREE.AmbientLight(cfg.color, cfg.intensity);
            break;
          }
          case 'hemisphere': {
            threeLight = new THREE.HemisphereLight(cfg.color, cfg.groundColor, cfg.intensity);
            break;
          }
          default:
            threeLight = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
        }

        threeLight.visible = cfg.enabled;
        threeLight.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
        threeLight.userData.__lightCompName = comp.name;
        go.mesh.add(threeLight);

        // --- Editor helper: icon + range wireframe ---
        const helperGroup = new THREE.Group();
        helperGroup.userData.__isLightHelper = true;
        helperGroup.position.set(comp.offset.x, comp.offset.y, comp.offset.z);

        // Clickable light icon (small diamond)
        const iconGeo = new THREE.OctahedronGeometry(0.12, 0);
        const iconMat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        });
        const iconMesh = new THREE.Mesh(iconGeo, iconMat);
        iconMesh.renderOrder = 999;
        helperGroup.add(iconMesh);

        // Range indicator
        if (cfg.lightType === 'point' && cfg.distance > 0) {
          const rangeGeo = new THREE.SphereGeometry(cfg.distance, 24, 16);
          const rangeWire = new THREE.Mesh(rangeGeo, new THREE.MeshBasicMaterial({
            color: cfg.color, wireframe: true, transparent: true, opacity: 0.06,
          }));
          helperGroup.add(rangeWire);
        } else if (cfg.lightType === 'spot') {
          const toRadH = (d: number) => (d * Math.PI) / 180;
          const coneH = cfg.distance > 0 ? cfg.distance : 5;
          const coneR = Math.tan(toRadH(cfg.angle)) * coneH;
          const coneGeo = new THREE.ConeGeometry(coneR, coneH, 24, 1, true);
          const coneWire = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
            color: cfg.color, wireframe: true, transparent: true, opacity: 0.08,
          }));
          coneWire.position.y = -coneH / 2;
          helperGroup.add(coneWire);
        } else if (cfg.lightType === 'directional') {
          const dDir = new THREE.Vector3(cfg.target.x - comp.offset.x, cfg.target.y - comp.offset.y, cfg.target.z - comp.offset.z).normalize();
          const arrow = new THREE.ArrowHelper(dDir, new THREE.Vector3(), 1.5, new THREE.Color(cfg.color).getHex(), 0.3, 0.15);
          helperGroup.add(arrow);
        }

        go.mesh.add(helperGroup);

        lightComps.push({ light: threeLight, config: cfg, name: comp.name, index: lightIdx++ });
      } else if (comp.type === 'skeletalMesh' && comp.skeletalMesh?.meshAssetId) {
        // Skeletal Mesh component — reuse existing wrapper if possible, otherwise load async
        const _skDeps = tryGetEngineDeps();
        const meshAsset = _skDeps?.meshAssets?.getAsset(comp.skeletalMesh.meshAssetId) ?? null;
        if (meshAsset) {
          const cfg = comp.skeletalMesh;

          // Check if we already have a loaded wrapper for this component with the same mesh asset
          const existing = existingSkeletalMeshes?.get(comp.id);
          const existingMeshAssetId = existing?.userData.__meshAssetId;

          if (existing && existingMeshAssetId === cfg.meshAssetId && existing.children.length > 0) {
            // Reuse — just update transforms
            existing.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
            existing.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
            existing.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);
            existing.name = comp.name;
            existing.userData.__skeletalMeshCompName = comp.name;
            go.mesh.add(existing);
            existingSkeletalMeshes!.delete(comp.id); // consumed — don't dispose it

            // Re-attach mixers
            const mixer = existing.userData.__animationMixer as THREE.AnimationMixer | undefined;
            if (mixer) {
              if (!(go as any)._skeletalMeshMixers) (go as any)._skeletalMeshMixers = [];
              (go as any)._skeletalMeshMixers.push(mixer);
            }

            const animations = existing.userData.__animations as THREE.AnimationClip[] | undefined;
            if (animations && animations.length > 0 && mixer) {
              // Check if an Animation Blueprint is assigned
              const abpId = cfg.animationBlueprintId;
              const _abpDeps = tryGetEngineDeps();
              const abpAsset = abpId ? _abpDeps?.animBlueprints?.getAsset(abpId) : undefined;

              if (abpAsset) {
                const strictMatch = !!cfg.strictSkeletonMatching;
                let skeletonMismatch = false;
                if (abpAsset.targetSkeletonMeshAssetId && abpAsset.targetSkeletonMeshAssetId !== cfg.meshAssetId) {
                  console.warn('[AnimBP] Target mesh mismatch:', abpAsset.name, 'expected', abpAsset.targetSkeletonMeshAssetId, 'got', cfg.meshAssetId);
                }
                if (abpAsset.targetSkeletonId && meshAsset.skeleton?.assetId && abpAsset.targetSkeletonId !== meshAsset.skeleton.assetId) {
                  console.warn('[AnimBP] Skeleton mismatch:', abpAsset.name, 'expected', abpAsset.targetSkeletonId, 'got', meshAsset.skeleton.assetId);
                  skeletonMismatch = true;
                }

                if (skeletonMismatch && !strictMatch) {
                  console.warn('[AnimBP] Skeleton mismatch detected — continuing anyway (Strict Skeleton off).');
                }
                if (skeletonMismatch && strictMatch) {
                  console.warn('[AnimBP] Skeleton mismatch — blocking AnimBP (Strict Skeleton on).');
                  skeletonMismatch = true;
                }

                if (!skeletonMismatch || !strictMatch) {
                  const animInstance = new AnimationInstance(abpAsset, mixer, animations, go);
                  existing.userData.__animationInstance = animInstance;

                  if (go.characterController) {
                    animInstance.characterController = go.characterController;
                  }

                  animInstance.sceneRef = this;

                  if (!(go as any)._animationInstances) (go as any)._animationInstances = [];
                  (go as any)._animationInstances.push(animInstance);
                }
              } else if (cfg.animationName) {
                const clip = animations.find(a => a.name === cfg.animationName);
                if (clip) {
                  const action = mixer.clipAction(clip);
                  action.setLoop(cfg.loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
                  action.clampWhenFinished = !cfg.loopAnimation;
                  action.timeScale = cfg.animationSpeed;
                  action.play();
                }
              }
            }
          } else {
            // Dispose old one if it existed with a different mesh asset
            if (existing) existingSkeletalMeshes!.delete(comp.id);

            // Create a new wrapper group
            const wrapper = new THREE.Group();
            wrapper.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
            wrapper.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
            wrapper.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);
            wrapper.userData.__isSkeletalMesh = true;
            wrapper.userData.__skeletalMeshCompName = comp.name;
            wrapper.userData.__componentId = comp.id;
            wrapper.userData.__meshAssetId = cfg.meshAssetId;
            wrapper.name = comp.name;
            go.mesh.add(wrapper);

            // Async load the mesh
            loadMeshFromAsset(meshAsset).then(({ scene: loadedScene, animations }) => {
              if (!wrapper.parent) return; // GO removed while loading

              // ── Rename loaded AnimationClip names to match stored asset names ──
              // The GLB stores clips with their original names (e.g. "Idle"),
              // but the MeshAsset prefixes them (e.g. "Character_Idle").
              // The AnimBP editor and single-anim picker both use the prefixed
              // assetName, so we must align the runtime clip names.
              if (meshAsset.animations.length > 0) {
                for (const clip of animations) {
                  const match = meshAsset.animations.find(
                    a => a.assetName === clip.name || a.assetName.endsWith('_' + clip.name)
                  );
                  if (match) {
                    clip.name = match.assetName;
                  }
                }
              }

              // Move children from loaded scene into wrapper.
              // Keep the scene graph intact so SkinnedMesh → Skeleton bindings remain valid.
              // loadMeshFromAsset already normalised root transforms and enabled shadows.
              while (loadedScene.children.length > 0) {
                const child = loadedScene.children[0];
                loadedScene.remove(child);
                wrapper.add(child);
              }

              // Rebuild world matrices so skinned mesh bones resolve correctly
              wrapper.updateMatrixWorld(true);

              // Apply material overrides for this skeletal mesh component
              if (comp.materialOverrides && Object.keys(comp.materialOverrides).length > 0) {
                const overMgr = MeshAssetManager.getInstance();
                if (overMgr) {
                  const meshChildren: THREE.Mesh[] = [];
                  wrapper.traverse(c => { if ((c as THREE.Mesh).isMesh) meshChildren.push(c as THREE.Mesh); });
                  for (const [slotKey, matId] of Object.entries(comp.materialOverrides)) {
                    const idx = parseInt(slotKey, 10);
                    if (isNaN(idx) || idx < 0 || idx >= meshChildren.length) continue;
                    const matAsset = overMgr.getMaterial(matId);
                    if (!matAsset) continue;
                    const m = meshChildren[idx];
                    const oldM = m.material;
                    if (Array.isArray(oldM)) oldM.forEach(x => x.dispose());
                    else (oldM as THREE.Material).dispose();
                    m.material = buildThreeMaterialFromAsset(matAsset, overMgr);
                  }
                }
              }

              // Setup animation mixer if there are animations.
              // Use the wrapper as root — animations reference bone names, and
              // Three.js AnimationMixer.findNode walks the full subtree.
              if (animations.length > 0) {
                const mixer = new THREE.AnimationMixer(wrapper);
                wrapper.userData.__animationMixer = mixer;
                wrapper.userData.__animations = animations;

                // Check if an Animation Blueprint is assigned
                const abpId = cfg.animationBlueprintId;
                const _abpDeps2 = tryGetEngineDeps();
                const abpAsset = abpId ? _abpDeps2?.animBlueprints?.getAsset(abpId) : undefined;

                if (abpAsset) {
                  const strictMatch = !!cfg.strictSkeletonMatching;
                  let skeletonMismatch = false;
                  if (abpAsset.targetSkeletonMeshAssetId && abpAsset.targetSkeletonMeshAssetId !== cfg.meshAssetId) {
                    console.warn('[AnimBP] Target mesh mismatch:', abpAsset.name, 'expected', abpAsset.targetSkeletonMeshAssetId, 'got', cfg.meshAssetId);
                  }
                  if (abpAsset.targetSkeletonId && meshAsset.skeleton?.assetId && abpAsset.targetSkeletonId !== meshAsset.skeleton.assetId) {
                    console.warn('[AnimBP] Skeleton mismatch:', abpAsset.name, 'expected', abpAsset.targetSkeletonId, 'got', meshAsset.skeleton.assetId);
                    skeletonMismatch = true;
                  }

                  if (skeletonMismatch && !strictMatch) {
                    console.warn('[AnimBP] Skeleton mismatch detected — continuing anyway (Strict Skeleton off).');
                  }
                  if (skeletonMismatch && strictMatch) {
                    console.warn('[AnimBP] Skeleton mismatch — blocking AnimBP (Strict Skeleton on).');
                    skeletonMismatch = true;
                  }

                  if (!skeletonMismatch || !strictMatch) {
                    // Create AnimationInstance driven by the state machine
                    const animInstance = new AnimationInstance(abpAsset, mixer, animations, go);
                    wrapper.userData.__animationInstance = animInstance;

                    // Wire character controller if available
                    if (go.characterController) {
                      animInstance.characterController = go.characterController;
                    }

                    // Pass scene reference for event graph script context
                    animInstance.sceneRef = this;

                    // Push to go's animation instances array
                    if (!(go as any)._animationInstances) (go as any)._animationInstances = [];
                    (go as any)._animationInstances.push(animInstance);
                  }
                } else if (cfg.animationName) {
                  // Fallback: play single animation (no AnimBP)
                  const clip = animations.find(a => a.name === cfg.animationName);
                  if (clip) {
                    const action = mixer.clipAction(clip);
                    action.setLoop(cfg.loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
                    action.clampWhenFinished = !cfg.loopAnimation;
                    action.timeScale = cfg.animationSpeed;
                    action.play();
                  }
                }

                // Push to go's mixer array (already cleared above)
                (go as any)._skeletalMeshMixers.push(mixer);
              }
            }).catch(err => {
              console.error('Failed to load skeletal mesh:', err);
            });
          }
        }
      } else {
        // Mesh component — add as child mesh (Primitive or Static Mesh)
        if (comp.customMeshAssetId) {
          // ── Static Mesh (imported 3D asset) ──
          const mgr = MeshAssetManager.getInstance();
          const meshAsset = mgr?.getAsset(comp.customMeshAssetId);

          if (meshAsset && mgr) {
            const wrapper = new THREE.Group();
            wrapper.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
            wrapper.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
            wrapper.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);
            wrapper.userData.__meshAssetId = meshAsset.id;
            wrapper.userData.__isStaticMesh = true;
            wrapper.userData.__collisionData = meshAsset.collisionData || null;
            wrapper.userData.__compCollision = comp.collision || null;
            wrapper.userData.__compPhysics = comp.physics || null;
            // Mark with hiddenInGame for play-mode visibility
            if (comp.hiddenInGame) wrapper.userData.__hiddenInGame = true;
            wrapper.name = comp.name;
            go.mesh.add(wrapper);

            // Track immediately (before async load) so blueprint codegen indices are stable
            meshComps.push({ mesh: wrapper, name: comp.name, index: meshIdx++ });

            const loadPromise = loadMeshFromAsset(meshAsset).then(({ scene: loadedScene }) => {
              if (!wrapper.parent) return; // GO removed while loading

              // Move children from loaded scene into wrapper
              while (loadedScene.children.length > 0) {
                const child = loadedScene.children[0];
                loadedScene.remove(child);
                wrapper.add(child);
              }

              wrapper.updateMatrixWorld(true);

              // Mark wrapper as loaded so collision system can find sub-meshes
              wrapper.userData.__meshLoaded = true;

              // Apply material overrides for each slot
              if (comp.materialOverrides && Object.keys(comp.materialOverrides).length > 0) {
                const meshChildren: THREE.Mesh[] = [];
                wrapper.traverse(c => { if ((c as THREE.Mesh).isMesh) meshChildren.push(c as THREE.Mesh); });
                for (const [slotKey, matId] of Object.entries(comp.materialOverrides)) {
                  const idx = parseInt(slotKey, 10);
                  if (isNaN(idx) || idx < 0 || idx >= meshChildren.length) continue;
                  const matAsset = mgr.getMaterial(matId);
                  if (!matAsset) continue;
                  const m = meshChildren[idx];
                  const oldM = m.material;
                  if (Array.isArray(oldM)) oldM.forEach(x => x.dispose());
                  else (oldM as THREE.Material).dispose();
                  m.material = buildThreeMaterialFromAsset(matAsset, mgr);
                }
              }
            }).catch(err => {
              console.error('Failed to load static mesh component:', err);
            });
            this._pendingMeshLoads.push(loadPromise);
          }
        } else {
          // ── Primitive Mesh ──
          const geo = geometries[comp.meshType]();
          let mat: THREE.Material = defaultMaterial.clone();

          // Apply material override if set (slot 0 for primitive mesh components)
          if (comp.materialOverrides && comp.materialOverrides['0']) {
            const mgr = MeshAssetManager.getInstance();
            if (mgr) {
              const matAsset = mgr.getMaterial(comp.materialOverrides['0']);
              if (matAsset) {
                mat.dispose();
                mat = buildThreeMaterialFromAsset(matAsset, mgr);
              }
            }
          }

          const child = new THREE.Mesh(geo, mat);
          child.castShadow = true;
          child.receiveShadow = true;
          child.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
          child.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
          child.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);

          // Mark editor-only component visualization meshes (camera, spring arm, capsule, etc.)
          const editorOnlyTypes = ['camera', 'springArm', 'capsule', 'characterMovement'];
          if (editorOnlyTypes.includes(comp.type)) {
            child.userData.__isComponentHelper = true;
            child.userData.__hiddenInGame = comp.hiddenInGame !== false;
          }

          // Mark mesh components with hiddenInGame for play-mode visibility
          if (comp.type === 'mesh' && comp.hiddenInGame) {
            child.userData.__hiddenInGame = true;
          }

          go.mesh.add(child);
          meshComps.push({ mesh: child, name: comp.name, index: meshIdx++ });
        }
      }
    }

    // Store trigger data on the GO so CollisionSystem.createSensors() can read it
    (go as any)._triggerComponents = triggers;
    // Store light data on the GO so blueprint codegen can read it
    (go as any)._lightComponents = lightComps;
    // Store mesh component children so codegen can index them reliably
    (go as any)._meshComponents = meshComps;

    // Store projectile movement config so the engine can auto-launch at play time
    const projComp = components.find(c => c.type === 'projectileMovement' && c.projectile);
    if (projComp && projComp.projectile) {
      (go as any)._projectileMovementConfig = structuredClone(projComp.projectile);
    }
  }

  /** Hide or show meshes marked as 'Hidden In Game' during Play/Stop.
   * When entering play mode (playing=true), hides root meshes and child meshes
   * that have hiddenInGame set. When leaving play mode, restores them. */
  setMeshesHiddenInGame(playing: boolean): void {
    for (const go of this.gameObjects) {
      // Root mesh hiddenInGame
      if (go.mesh.userData.__rootHiddenInGame) {
        go.mesh.visible = !playing;
      }
      // Child mesh components with hiddenInGame
      for (const child of go.mesh.children) {
        if (child.userData?.__isComponentHelper) continue; // handled by setComponentHelpersVisible
        if (child.userData?.__isTriggerHelper) continue;
        if (child.userData?.__isLightHelper) continue;
        if (child.userData?.__hiddenInGame) {
          child.visible = !playing;
        }
      }
    }
  }

  /** Hide or show trigger wireframe helpers (e.g., hide during Play for cleaner view) */
  setTriggerHelpersVisible(visible: boolean): void {
    for (const go of this.gameObjects) {
      go.mesh.traverse((child) => {
        if (child.userData.__isTriggerHelper) {
          child.visible = visible;
        }
      });
    }
  }

  /** Hide or show light editor helpers (icons + range wireframes) during Play */
  setLightHelpersVisible(visible: boolean): void {
    for (const go of this.gameObjects) {
      go.mesh.traverse((child) => {
        if (child.userData.__isLightHelper) {
          child.visible = visible;
        }
      });
    }
  }

  /** Hide or show editor-only component helpers (camera, spring arm, capsule, etc.) during Play */
  setComponentHelpersVisible(visible: boolean): void {
    for (const go of this.gameObjects) {
      go.mesh.traverse((child) => {
        if (child.userData.__isComponentHelper) {
          if (visible) {
            // Restoring to editor mode — always show
            child.visible = true;
          } else {
            // Entering play mode — hide only if hiddenInGame is true (default)
            child.visible = child.userData.__hiddenInGame === false;
          }
        }
      });
    }
  }

  /**
   * Apply material overrides to a mesh (root or child).
   * For a simple Mesh, swaps slot 0. For a Group, traverses children by slot index.
   */
  private _applyMaterialOverridesToMesh(
    mesh: THREE.Mesh | THREE.Object3D,
    overrides: Record<string, string>,
  ): void {
    const mgr = MeshAssetManager.getInstance();
    if (!mgr) return;

    if ((mesh as THREE.Mesh).isMesh) {
      const matId = overrides['0'];
      if (matId) {
        const matAsset = mgr.getMaterial(matId);
        if (matAsset) {
          const oldMat = (mesh as THREE.Mesh).material as THREE.Material;
          oldMat.dispose();
          (mesh as THREE.Mesh).material = buildThreeMaterialFromAsset(matAsset, mgr);
        }
      }
    } else {
      // Group — traverse all mesh children and apply per-slot
      const meshChildren: THREE.Mesh[] = [];
      mesh.traverse(child => {
        if ((child as THREE.Mesh).isMesh) meshChildren.push(child as THREE.Mesh);
      });
      for (const [slotKey, matId] of Object.entries(overrides)) {
        const idx = parseInt(slotKey, 10);
        if (isNaN(idx) || idx < 0 || idx >= meshChildren.length) continue;
        const matAsset = mgr.getMaterial(matId);
        if (!matAsset) continue;
        const m = meshChildren[idx];
        const oldMat = m.material;
        if (Array.isArray(oldMat)) oldMat.forEach(x => x.dispose());
        else (oldMat as THREE.Material).dispose();
        m.material = buildThreeMaterialFromAsset(matAsset, mgr);
      }
    }
  }

  /**
   * Rebuilds and replaces all instances of a specific material asset in the scene.
   */
  updateMaterialInScene(matAssetId: string): void {
    const mgr = MeshAssetManager.getInstance();
    if (!mgr) return;
    const matAsset = mgr.getMaterial(matAssetId);
    if (!matAsset) return;

    const newMat = buildThreeMaterialFromAsset(matAsset, mgr);

    this.threeScene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (Array.isArray(m.material)) {
          for (let i = 0; i < m.material.length; i++) {
            if (m.material[i].userData.__materialAssetId === matAssetId) {
              m.material[i].dispose();
              m.material[i] = newMat;
            }
          }
        } else if (m.material && (m.material as THREE.Material).userData.__materialAssetId === matAssetId) {
          (m.material as THREE.Material).dispose();
          m.material = newMat;
        }
      }
    });
  }
}
