import * as THREE from 'three';
import { GameObject } from './GameObject';

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
    this.threeScene.add(dirLight);

    // Grid helper
    const grid = new THREE.GridHelper(20, 20, 0x333355, 0x222244);
    this.threeScene.add(grid);
  }

  addGameObject(name: string, type: MeshType): GameObject {
    const geo = geometries[type]();
    const mat = defaultMaterial.clone();
    const mesh = new THREE.Mesh(geo, mat);
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
    components?: Array<{ meshType: MeshType; offset: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }>,
  ): GameObject {
    const go = this.addGameObject(assetName, meshType);
    go.actorAssetId = assetId;

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

    // Add child component meshes as children of the root mesh
    if (components) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      for (const comp of components) {
        const geo = geometries[comp.meshType]();
        const mat = defaultMaterial.clone();
        const child = new THREE.Mesh(geo, mat);
        child.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
        child.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
        child.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);
        go.mesh.add(child);
      }
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
  ): void {
    for (const go of this.gameObjects) {
      if (go.actorAssetId !== assetId) continue;
      go.name = assetName;

      // Re-clone the blueprint data
      const dst = go.blueprintData;
      dst.variables = structuredClone(blueprintData.variables);
      dst.functions = structuredClone(blueprintData.functions);
      dst.macros = structuredClone(blueprintData.macros);
      dst.customEvents = structuredClone(blueprintData.customEvents);
      dst.structs = structuredClone(blueprintData.structs);
      dst.eventGraph = structuredClone(blueprintData.eventGraph);
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
}
