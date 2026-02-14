// ============================================================
//  ActorPreviewViewport — Mini Three.js scene for actor editing
//  Shows the actor's root mesh + child components with
//  orbit controls and transform gizmos.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ActorAsset, ActorComponentData, LightConfig } from './ActorAsset';
import { defaultLightConfig } from './ActorAsset';

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
  private _rootMesh: THREE.Object3D | null = null;
  private _componentMeshes: Map<string, THREE.Object3D> = new Map();
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

    const objects: THREE.Object3D[] = [];
    if (this._rootMesh) objects.push(this._rootMesh);
    for (const m of this._componentMeshes.values()) objects.push(m);

    const hits = this._raycaster.intersectObjects(objects, true);
    if (hits.length > 0) {
      // Walk up the parent chain to find the object with __componentId
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.__componentId) obj = obj.parent;
      if (obj) {
        this._selectById(obj.userData.__componentId as string);
      } else {
        this._selectById(null);
      }
    } else {
      this._selectById(null);
    }
  }

  selectById(id: string | null): void {
    this._selectById(id);
  }

  private _selectById(id: string | null): void {
    // Reset materials — walk all objects and reset __lightIcon or mesh color
    if (this._rootMesh) this._resetObjectColor(this._rootMesh, 0x6c8ebf);
    for (const m of this._componentMeshes.values()) {
      this._resetObjectColor(m, 0x8fbf6c);
    }

    this._selectedId = id;

    let target: THREE.Object3D | null = null;
    if (id === '__root__' && this._rootMesh) {
      target = this._rootMesh;
      this._highlightObject(target, 0xf5a623);
    } else if (id && this._componentMeshes.has(id)) {
      target = this._componentMeshes.get(id)!;
      this._highlightObject(target, 0xf5a623);
    }

    if (this._transformControls) {
      if (target) {
        this._transformControls.attach(target);
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

  /** Set a highlight color on an object or its icon child */
  private _highlightObject(obj: THREE.Object3D, color: number): void {
    if ((obj as THREE.Mesh).isMesh) {
      ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(color);
    } else {
      // Group — find the icon mesh inside
      obj.traverse(child => {
        if (child.userData.__lightIcon && (child as THREE.Mesh).isMesh) {
          ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color);
        }
      });
    }
  }

  /** Reset an object to its default color */
  private _resetObjectColor(obj: THREE.Object3D, defaultColor: number): void {
    if ((obj as THREE.Mesh).isMesh) {
      ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(defaultColor);
    } else {
      // Group — reset icon to light color
      obj.traverse(child => {
        if (child.userData.__lightIcon && (child as THREE.Mesh).isMesh) {
          const lightColor = child.userData.__lightOrigColor ?? 0xffcc00;
          ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(lightColor);
        }
      });
    }
  }

  /** Sync the Three.js object position/rotation/scale back to ActorComponentData */
  private _syncMeshToData(): void {
    if (!this._selectedId) return;

    if (this._selectedId === '__root__' && this._rootMesh) {
      // Root doesn't have offset in the data model — it's always at origin.
      return;
    }

    const comp = this._asset.components.find(c => c.id === this._selectedId);
    if (!comp) return;
    const obj = this._componentMeshes.get(this._selectedId);
    if (!obj) return;

    comp.offset.x = obj.position.x;
    comp.offset.y = obj.position.y;
    comp.offset.z = obj.position.z;

    // Only sync rotation and scale for non-light components
    if (comp.type !== 'light') {
      const toDeg = (r: number) => (r * 180) / Math.PI;
      comp.rotation.x = toDeg(obj.rotation.x);
      comp.rotation.y = toDeg(obj.rotation.y);
      comp.rotation.z = toDeg(obj.rotation.z);
      comp.scale.x = obj.scale.x;
      comp.scale.y = obj.scale.y;
      comp.scale.z = obj.scale.z;
    }

    this._asset.touch();
  }

  /** Rebuild all meshes from the asset data */
  rebuild(): void {
    // Remove old objects
    if (this._rootMesh) {
      this._scene.remove(this._rootMesh);
      this._disposeObject3D(this._rootMesh);
      this._rootMesh = null;
    }
    for (const m of this._componentMeshes.values()) {
      this._scene.remove(m);
      this._disposeObject3D(m);
    }
    this._componentMeshes.clear();

    if (this._transformControls) this._transformControls.detach();

    // Root mesh (or empty scene root if 'none')
    if (this._asset.rootMeshType === 'none') {
      // DefaultSceneRoot — small axis helper with no geometry
      const group = new THREE.Group();
      group.userData.__componentId = '__root__';
      const axes = new THREE.AxesHelper(0.4);
      group.add(axes);
      // Small diamond icon so it's clickable
      const iconGeo = new THREE.OctahedronGeometry(0.08, 0);
      const iconMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, depthTest: false });
      const icon = new THREE.Mesh(iconGeo, iconMat);
      icon.userData.__componentId = '__root__';
      group.add(icon);
      group.position.set(0, 0.5, 0);
      this._scene.add(group);
      this._rootMesh = group;
    } else {
      const rootGeo = geometries[this._asset.rootMeshType]();
      const rm = new THREE.Mesh(rootGeo, rootMaterial.clone());
      rm.userData.__componentId = '__root__';
      rm.position.set(0, 0.5, 0);
      this._scene.add(rm);
      this._rootMesh = rm;
    }

    // Child components
    for (const comp of this._asset.components) {
      if (comp.type === 'light') {
        // Light component — UE-style icon + range helper
        const cfg: LightConfig = comp.light
          ? { ...defaultLightConfig(comp.light.lightType), ...comp.light }
          : defaultLightConfig('point');
        const group = new THREE.Group();
        group.userData.__componentId = comp.id;
        group.position.set(comp.offset.x, comp.offset.y, comp.offset.z);

        // Clickable icon — bright diamond shape
        const iconColor = new THREE.Color(cfg.color);
        const iconGeo = new THREE.OctahedronGeometry(0.12, 0);
        const iconMat = new THREE.MeshBasicMaterial({
          color: iconColor,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        });
        const iconMesh = new THREE.Mesh(iconGeo, iconMat);
        iconMesh.userData.__lightIcon = true;
        iconMesh.userData.__lightOrigColor = iconColor.getHex();
        iconMesh.renderOrder = 999;
        group.add(iconMesh);

        // Outer glow ring
        const ringGeo = new THREE.RingGeometry(0.14, 0.18, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: iconColor,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.renderOrder = 998;
        group.add(ring);

        // Add the actual light so it illuminates the preview
        switch (cfg.lightType) {
          case 'point': {
            const pl = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance);
            group.add(pl);
            // Range wireframe sphere
            if (cfg.distance > 0) {
              const rangeGeo = new THREE.SphereGeometry(cfg.distance, 24, 16);
              const rangeWire = new THREE.Mesh(rangeGeo, new THREE.MeshBasicMaterial({
                color: cfg.color,
                wireframe: true,
                transparent: true,
                opacity: 0.08,
                depthTest: true,
              }));
              rangeWire.userData.__lightRange = true;
              group.add(rangeWire);
            }
            break;
          }
          case 'spot': {
            const toR = (d: number) => (d * Math.PI) / 180;
            const sl = new THREE.SpotLight(cfg.color, cfg.intensity, cfg.distance, toR(cfg.angle), cfg.penumbra);
            sl.target.position.set(cfg.target.x - comp.offset.x, cfg.target.y - comp.offset.y, cfg.target.z - comp.offset.z);
            group.add(sl);
            group.add(sl.target);
            // Range cone wireframe
            const coneHeight = cfg.distance > 0 ? cfg.distance : 5;
            const coneRadius = Math.tan(toR(cfg.angle)) * coneHeight;
            const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 24, 1, true);
            const coneWire = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
              color: cfg.color,
              wireframe: true,
              transparent: true,
              opacity: 0.1,
              depthTest: true,
            }));
            coneWire.position.y = -coneHeight / 2;
            coneWire.userData.__lightRange = true;
            group.add(coneWire);
            break;
          }
          case 'directional': {
            const dl = new THREE.DirectionalLight(cfg.color, cfg.intensity);
            group.add(dl);
            // Direction arrow
            const dir = new THREE.Vector3(
              cfg.target.x - comp.offset.x,
              cfg.target.y - comp.offset.y,
              cfg.target.z - comp.offset.z,
            ).normalize();
            const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 1.5, new THREE.Color(cfg.color).getHex(), 0.3, 0.15);
            group.add(arrow);
            break;
          }
          case 'ambient': {
            group.add(new THREE.AmbientLight(cfg.color, cfg.intensity));
            break;
          }
          case 'hemisphere': {
            group.add(new THREE.HemisphereLight(cfg.color, cfg.groundColor, cfg.intensity));
            break;
          }
        }

        this._scene.add(group);
        this._componentMeshes.set(comp.id, group);
        continue;
      }

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

  /** Recursively dispose geometries in an Object3D tree */
  private _disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse(child => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
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
    if (this._rootMesh) this._disposeObject3D(this._rootMesh);
    for (const m of this._componentMeshes.values()) this._disposeObject3D(m);
  }
}
