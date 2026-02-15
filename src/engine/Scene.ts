import * as THREE from 'three';
import { GameObject } from './GameObject';
import { ScriptComponent } from './ScriptComponent';
import type { PhysicsConfig, ActorComponentData, LightConfig, ActorType, SkeletalMeshConfig } from '../editor/ActorAsset';
import { defaultLightConfig } from '../editor/ActorAsset';
import type { CollisionConfig, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from './CollisionTypes';
import { defaultCollisionConfig } from './CollisionTypes';
import type { CharacterPawnConfig } from './CharacterPawnData';
import { MeshAssetManager, type MeshAsset } from '../editor/MeshAsset';
import { loadMeshFromAsset } from '../editor/MeshImporter';

export type MeshType = 'cube' | 'sphere' | 'cylinder' | 'plane';
export type RootMeshType = MeshType | 'none';

// Simple materials with flat colors
const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0x6c8ebf,
  roughness: 0.7,
  metalness: 0.1,
  flatShading: true,
});

const selectedMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5a623,
  roughness: 0.7,
  metalness: 0.1,
  flatShading: true,
});

const geometries: Record<MeshType, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 16, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  plane: () => new THREE.PlaneGeometry(2, 2),
};

export class Scene {
  public threeScene: THREE.Scene;
  public gameObjects: GameObject[] = [];
  public selectedObject: GameObject | null = null;

  private _onChanged: (() => void)[] = [];
  private _onSelectionChanged: ((obj: GameObject | null) => void)[] = [];

  constructor() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x1a1a2e);

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.threeScene.add(ambient);

    // Directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.threeScene.add(dirLight);

    // Grid helper
    const grid = new THREE.GridHelper(20, 20, 0x333355, 0x222244);
    this.threeScene.add(grid);

    // Shadow-receiving ground plane (invisible flat mesh under the grid)
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01; // slightly below the grid to avoid z-fighting
    ground.receiveShadow = true;
    this.threeScene.add(ground);
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
      const { scene: loadedScene, animations } = await loadMeshFromAsset(meshAsset);

      // Replace the placeholder geometry with the loaded mesh
      // Remove placeholder from scene
      this.threeScene.remove(placeholder);
      placeholder.geometry.dispose();

      // Create a group as the root mesh
      const group = new THREE.Group();
      group.position.copy(placeholder.position);
      group.rotation.copy(placeholder.rotation);
      group.scale.copy(placeholder.scale);

      // Add all children from the loaded scene
      while (loadedScene.children.length > 0) {
        const child = loadedScene.children[0];
        loadedScene.remove(child);
        // Enable shadows on meshes
        child.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        group.add(child);
      }

      group.userData.gameObjectId = go.id;
      this.threeScene.add(group);

      // Update the game object's mesh reference
      // Use the group as the "mesh" — it's compatible since THREE.Group extends Object3D
      (go as any).mesh = group as any;

      // Store animations if any
      if (animations.length > 0) {
        (go as any)._animationClips = animations;
        (go as any)._animationMixer = new THREE.AnimationMixer(group);
      }

      this._emitChanged();
    } catch (err) {
      console.error('[Scene] Failed to load imported mesh:', err);
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
    blueprintData: import('../editor/BlueprintData').BlueprintData,
    position?: { x: number; y: number; z: number },
    components?: ActorComponentData[],
    compiledCode?: string,
    physicsConfig?: PhysicsConfig,
    actorType?: ActorType,
    characterPawnConfig?: CharacterPawnConfig | null,
    controllerClass?: import('./Controller').ControllerType,
    controllerBlueprintId?: string,
  ): GameObject {
    const go = this.addGameObject(assetName, meshType);
    go.actorAssetId = assetId;

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
   * Re-sync all scene instances that reference the given actor asset.
   * Called when an actor asset's blueprint is edited.
   */
  syncActorAssetInstances(
    assetId: string,
    assetName: string,
    meshType: RootMeshType,
    blueprintData: import('../editor/BlueprintData').BlueprintData,
    compiledCode?: string,
    components?: ActorComponentData[],
    physicsConfig?: PhysicsConfig,
    actorType?: ActorType,
    characterPawnConfig?: CharacterPawnConfig | null,
    controllerClass?: import('./Controller').ControllerType,
    controllerBlueprintId?: string,
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

  removeGameObject(go: GameObject): void {
    this.threeScene.remove(go.mesh);
    this.gameObjects = this.gameObjects.filter((o) => o.id !== go.id);
    if (this.selectedObject === go) {
      this.selectObject(null);
    }
    this._emitChanged();
  }

  selectObject(go: GameObject | null): void {
    // Reset previous selection material
    if (this.selectedObject) {
      (this.selectedObject.mesh.material as THREE.MeshStandardMaterial).color.set(0x6c8ebf);
    }
    this.selectedObject = go;
    if (go) {
      (go.mesh.material as THREE.MeshStandardMaterial).color.set(0xf5a623);
    }
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
        const meshAsset = MeshAssetManager.getAsset(comp.skeletalMesh.meshAssetId);
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

              // Move children from loaded scene into wrapper (preserves internal structure)
              while (loadedScene.children.length > 0) {
                const child = loadedScene.children[0];
                loadedScene.remove(child);
                child.traverse((obj) => {
                  if ((obj as THREE.Mesh).isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                  }
                });
                wrapper.add(child);
              }

              // Setup animation mixer if there are animations
              if (animations.length > 0) {
                const mixer = new THREE.AnimationMixer(wrapper);
                wrapper.userData.__animationMixer = mixer;
                wrapper.userData.__animations = animations;

                if (cfg.animationName) {
                  const clip = animations.find(a => a.name === cfg.animationName);
                  if (clip) {
                    const action = mixer.clipAction(clip);
                    action.setLoop(cfg.loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
                    action.clampWhenFinished = !cfg.loopAnimation;
                    action.timeScale = cfg.animationSpeed;
                    action.play();
                  }
                }

                if (!(go as any)._skeletalMeshMixers) (go as any)._skeletalMeshMixers = [];
                (go as any)._skeletalMeshMixers.push(mixer);
              }
            }).catch(err => {
              console.error('Failed to load skeletal mesh:', err);
            });
          }
        }
      } else {
        // Mesh component — add as child mesh
        const geo = geometries[comp.meshType]();
        const mat = defaultMaterial.clone();
        const child = new THREE.Mesh(geo, mat);
        child.castShadow = true;
        child.receiveShadow = true;
        child.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
        child.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
        child.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);

        // Mark editor-only component visualization meshes (camera, spring arm, capsule, etc.)
        // These are hidden at runtime just like UE hides component gizmos during play.
        const editorOnlyTypes = ['camera', 'springArm', 'capsule', 'characterMovement'];
        if (editorOnlyTypes.includes(comp.type)) {
          child.userData.__isComponentHelper = true;
          // hiddenInGame defaults to true for helper types; user can override per-component
          child.userData.__hiddenInGame = comp.hiddenInGame !== false;
        }

        go.mesh.add(child);
      }
    }

    // Store trigger data on the GO so CollisionSystem.createSensors() can read it
    (go as any)._triggerComponents = triggers;
    // Store light data on the GO so blueprint codegen can read it
    (go as any)._lightComponents = lightComps;
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
}
