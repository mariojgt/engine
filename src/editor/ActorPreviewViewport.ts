// ============================================================
//  ActorPreviewViewport — Mini Three.js scene for actor editing
//  Shows the actor's root mesh + child components with
//  orbit controls and transform gizmos.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ActorAsset, ActorComponentData } from './ActorAsset';

type MeshType = 'cube' | 'sphere' | 'cylinder' | 'plane';

const geometries: Record<MeshType, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 16, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  plane: () => new THREE.PlaneGeometry(2, 2),
};

const rootMaterial = new THREE.MeshStandardMaterial({
  color: 0x6c8ebf,
  roughness: 0.6,
  metalness: 0.1,
  flatShading: true,
});

const childMaterial = new THREE.MeshStandardMaterial({
  color: 0x8fbf6c,
  roughness: 0.6,
  metalness: 0.1,
  flatShading: true,
});

const selectedMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5a623,
  roughness: 0.6,
  metalness: 0.1,
  flatShading: true,
});

export type SelectionChangedCallback = (selected: { type: 'root' } | { type: 'component'; id: string } | null) => void;

export class ActorPreviewViewport {
  public container: HTMLElement;
  private _scene: THREE.Scene;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _camera!: THREE.PerspectiveCamera;
  private _controls: OrbitControls | null = null;
  private _transformControls: TransformControls | null = null;
  private _asset: ActorAsset;
  private _rootMesh: THREE.Mesh | null = null;
  private _componentMeshes: Map<string, THREE.Mesh> = new Map();
  private _resizeObserver: ResizeObserver;
  private _disposed = false;
  private _animFrameId = 0;
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _selectedId: string | null = null; // null = nothing, '__root__' = root, else component id
  private _onSelectionChanged: SelectionChangedCallback | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, asset: ActorAsset) {
    this.container = container;
    this._asset = asset;
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1a2e);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this._scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 8, 5);
    this._scene.add(dir);

    // Small grid
    const grid = new THREE.GridHelper(10, 10, 0x333355, 0x222244);
    this._scene.add(grid);

    this._initCamera();

    try {
      this._initRenderer();
      this._initControls();
      this._initTransformControls();
      this._setupEvents();
    } catch (err) {
      console.warn('WebGL not available for preview:', err);
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#666;font-size:12px;">WebGL required</div>';
    }

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(container);

    this.rebuild();
    this._startRenderLoop();
  }

  set onSelectionChanged(cb: SelectionChangedCallback | null) {
    this._onSelectionChanged = cb;
  }

  private _initCamera(): void {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 300;
    this._camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    this._camera.position.set(3, 2.5, 3);
    this._camera.lookAt(0, 0, 0);
  }

  private _initRenderer(): void {
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 300;
    this._renderer.setSize(w, h);
    this.container.innerHTML = '';
    this.container.appendChild(this._renderer.domElement);
  }

  private _initControls(): void {
    if (!this._renderer) return;
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.1;
    this._controls.target.set(0, 0.5, 0);
  }

  private _initTransformControls(): void {
    if (!this._renderer || !this._controls) return;
    this._transformControls = new TransformControls(this._camera, this._renderer.domElement);
    this._transformControls.setSize(0.6);
    this._transformControls.setSpace('local');

    this._transformControls.addEventListener('dragging-changed', (event: any) => {
      if (this._controls) this._controls.enabled = !event.value;
    });

    // When gizmo moves, sync back to component data
    this._transformControls.addEventListener('objectChange', () => {
      this._syncMeshToData();
    });

    this._scene.add(this._transformControls.getHelper());
  }

  private _setupEvents(): void {
    if (!this._renderer) return;
    this._renderer.domElement.addEventListener('click', (e) => this._onClick(e));

    this._keyHandler = (e: KeyboardEvent) => {
      if (!this._transformControls) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'w': this._transformControls.setMode('translate'); break;
        case 'r': this._transformControls.setMode('rotate'); break;
        case 's': this._transformControls.setMode('scale'); break;
      }
    };
    // Use the container to scope key events
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', this._keyHandler);
  }

  private _onClick(e: MouseEvent): void {
    if (!this._renderer) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const meshes: THREE.Mesh[] = [];
    if (this._rootMesh) meshes.push(this._rootMesh);
    for (const m of this._componentMeshes.values()) meshes.push(m);

    const hits = this._raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Mesh;
      const id = hit.userData.__componentId as string;
      this._selectById(id);
    } else {
      this._selectById(null);
    }
  }

  selectById(id: string | null): void {
    this._selectById(id);
  }

  private _selectById(id: string | null): void {
    // Reset materials
    if (this._rootMesh) (this._rootMesh.material as THREE.MeshStandardMaterial).color.set(0x6c8ebf);
    for (const m of this._componentMeshes.values()) {
      (m.material as THREE.MeshStandardMaterial).color.set(0x8fbf6c);
    }

    this._selectedId = id;

    let mesh: THREE.Mesh | null = null;
    if (id === '__root__' && this._rootMesh) {
      mesh = this._rootMesh;
      (mesh.material as THREE.MeshStandardMaterial).color.set(0xf5a623);
    } else if (id && this._componentMeshes.has(id)) {
      mesh = this._componentMeshes.get(id)!;
      (mesh.material as THREE.MeshStandardMaterial).color.set(0xf5a623);
    }

    if (this._transformControls) {
      if (mesh) {
        this._transformControls.attach(mesh);
      } else {
        this._transformControls.detach();
      }
    }

    if (this._onSelectionChanged) {
      if (id === '__root__') this._onSelectionChanged({ type: 'root' });
      else if (id) this._onSelectionChanged({ type: 'component', id });
      else this._onSelectionChanged(null);
    }
  }

  /** Sync the Three.js mesh position/rotation/scale back to ActorComponentData */
  private _syncMeshToData(): void {
    if (!this._selectedId) return;

    if (this._selectedId === '__root__' && this._rootMesh) {
      // Root doesn't have offset in the data model — it's always at origin.
      // But we could allow it in the future.
      return;
    }

    const comp = this._asset.components.find(c => c.id === this._selectedId);
    if (!comp) return;
    const mesh = this._componentMeshes.get(this._selectedId);
    if (!mesh) return;

    comp.offset.x = mesh.position.x;
    comp.offset.y = mesh.position.y;
    comp.offset.z = mesh.position.z;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    comp.rotation.x = toDeg(mesh.rotation.x);
    comp.rotation.y = toDeg(mesh.rotation.y);
    comp.rotation.z = toDeg(mesh.rotation.z);
    comp.scale.x = mesh.scale.x;
    comp.scale.y = mesh.scale.y;
    comp.scale.z = mesh.scale.z;

    this._asset.touch();
  }

  /** Rebuild all meshes from the asset data */
  rebuild(): void {
    // Remove old meshes
    if (this._rootMesh) {
      this._scene.remove(this._rootMesh);
      this._rootMesh.geometry.dispose();
      this._rootMesh = null;
    }
    for (const m of this._componentMeshes.values()) {
      this._scene.remove(m);
      m.geometry.dispose();
    }
    this._componentMeshes.clear();

    if (this._transformControls) this._transformControls.detach();

    // Root mesh
    const rootGeo = geometries[this._asset.rootMeshType]();
    this._rootMesh = new THREE.Mesh(rootGeo, rootMaterial.clone());
    this._rootMesh.userData.__componentId = '__root__';
    this._rootMesh.position.set(0, 0.5, 0);
    this._scene.add(this._rootMesh);

    // Child components
    for (const comp of this._asset.components) {
      const geo = geometries[comp.meshType]();
      const mesh = new THREE.Mesh(geo, childMaterial.clone());
      mesh.userData.__componentId = comp.id;
      const toRad = (d: number) => (d * Math.PI) / 180;
      mesh.position.set(comp.offset.x, comp.offset.y, comp.offset.z);
      mesh.rotation.set(toRad(comp.rotation.x), toRad(comp.rotation.y), toRad(comp.rotation.z));
      mesh.scale.set(comp.scale.x, comp.scale.y, comp.scale.z);
      this._scene.add(mesh);
      this._componentMeshes.set(comp.id, mesh);
    }

    // Re-select
    if (this._selectedId) {
      this._selectById(this._selectedId);
    }
  }

  private _startRenderLoop(): void {
    const loop = () => {
      if (this._disposed) return;
      if (this._controls) this._controls.update();
      if (this._renderer) {
        this._renderer.render(this._scene, this._camera);
      }
      this._animFrameId = requestAnimationFrame(loop);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  private _onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._renderer) this._renderer.setSize(w, h);
  }

  dispose(): void {
    this._disposed = true;
    cancelAnimationFrame(this._animFrameId);
    this._resizeObserver.disconnect();
    if (this._keyHandler) this.container.removeEventListener('keydown', this._keyHandler);
    if (this._transformControls) this._transformControls.dispose();
    if (this._renderer) this._renderer.dispose();
    if (this._controls) this._controls.dispose();
    // Dispose geometries
    if (this._rootMesh) this._rootMesh.geometry.dispose();
    for (const m of this._componentMeshes.values()) m.geometry.dispose();
  }
}
