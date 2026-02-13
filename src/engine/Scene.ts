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
