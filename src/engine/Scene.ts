import * as THREE from 'three';
import { GameObject } from './GameObject';
import { ScriptComponent } from './ScriptComponent';
import type { PhysicsConfig, ActorComponentData } from '../editor/ActorAsset';
import type { CollisionConfig, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from './CollisionTypes';
import { defaultCollisionConfig } from './CollisionTypes';

export type MeshType = 'cube' | 'sphere' | 'cylinder' | 'plane';

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

  addGameObject(name: string, type: MeshType): GameObject {
    const geo = geometries[type]();
    const mat = defaultMaterial.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, type === 'plane' ? 0 : 3, 0);
    if (type === 'plane') {
      mesh.rotation.x = -Math.PI / 2;
    }

    const go = new GameObject(name, mesh);
    mesh.userData.gameObjectId = go.id;
    this.threeScene.add(mesh);
    this.gameObjects.push(go);
    this._emitChanged();
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
    meshType: MeshType,
    blueprintData: import('../editor/BlueprintData').BlueprintData,
    position?: { x: number; y: number; z: number },
    components?: ActorComponentData[],
    compiledCode?: string,
    physicsConfig?: PhysicsConfig,
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
    meshType: MeshType,
    blueprintData: import('../editor/BlueprintData').BlueprintData,
    compiledCode?: string,
    components?: ActorComponentData[],
    physicsConfig?: PhysicsConfig,
  ): void {
    for (const go of this.gameObjects) {
      if (go.actorAssetId !== assetId) continue;
      go.name = assetName;

      // --- Update root mesh geometry if the mesh type changed ---
      const newGeo = geometries[meshType]();
      go.mesh.geometry.dispose();
      go.mesh.geometry = newGeo;

      // --- Rebuild child component meshes & trigger data ---
      // Remove all existing children
      while (go.mesh.children.length > 0) {
        const child = go.mesh.children[0];
        go.mesh.remove(child);
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      }
      // Add fresh children from the components list
      if (components) {
        this._applyComponents(go, components);
      } else {
        (go as any)._triggerComponents = [];
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

  private _applyComponents(go: GameObject, components: ActorComponentData[]): void {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const triggers: Array<{ config: CollisionConfig; name: string; index: number; offset: { x: number; y: number; z: number } }> = [];
    let triggerIdx = 0;

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
        go.mesh.add(child);
      }
    }

    // Store trigger data on the GO so CollisionSystem.createSensors() can read it
    (go as any)._triggerComponents = triggers;
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
}
