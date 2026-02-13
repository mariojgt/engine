import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import type { CameraStateJSON } from './SceneSerializer';

export class ViewportPanel {
  public container: HTMLElement;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _camera!: THREE.PerspectiveCamera;
  private _controls: OrbitControls | null = null;
  private _transformControls: TransformControls | null = null;
  private _engine: Engine;
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _resizeObserver: ResizeObserver;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;

    this._initCamera();

    try {
      this._initRenderer();
      this._initControls();
      this._initTransformControls();
      this._setupEvents();
    } catch (err) {
      console.warn('WebGL not available:', err);
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#888;font-size:14px;text-align:center;padding:20px;">
        <div>
          <div style="font-size:40px;margin-bottom:12px;">🎮</div>
          <div>3D Viewport requires WebGL</div>
          <div style="font-size:12px;margin-top:8px;color:#666;">Run in Tauri or a WebGL-capable browser</div>
        </div>
      </div>`;
    }

    // Listen for selection changes to attach/detach gizmo
    this._engine.scene.onSelectionChanged((go) => this._onSelectionChanged(go));

    // ResizeObserver for responsive canvas
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(container);
  }

  private _initRenderer(): void {
    this._renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this._renderer.setSize(w, h);

    this.container.innerHTML = '';
    this.container.appendChild(this._renderer.domElement);
  }

  private _initCamera(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this._camera.position.set(5, 4, 5);
    this._camera.lookAt(0, 0, 0);
  }

  private _initControls(): void {
    if (!this._renderer) return;
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.08;
    this._controls.target.set(0, 0.5, 0);
  }

  private _setupEvents(): void {
    if (!this._renderer) return;
    this._renderer.domElement.addEventListener('click', (e) => this._onClick(e));

    // Keyboard shortcuts for gizmo mode: W=translate, S=scale, R=rotate
    this._keyHandler = (e: KeyboardEvent) => {
      if (!this._transformControls) return;
      // Ignore if user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'w':
          this._transformControls.setMode('translate');
          break;
        case 'r':
          this._transformControls.setMode('rotate');
          break;
        case 's':
          this._transformControls.setMode('scale');
          break;
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  private _initTransformControls(): void {
    if (!this._renderer || !this._controls) return;

    this._transformControls = new TransformControls(this._camera, this._renderer.domElement);
    this._transformControls.setSize(0.75);
    this._transformControls.setSpace('world');

    // Disable orbit controls while dragging the gizmo
    this._transformControls.addEventListener('dragging-changed', (event: any) => {
      if (this._controls) {
        this._controls.enabled = !event.value;
      }
    });

    this._engine.scene.threeScene.add(this._transformControls.getHelper());
  }

  private _onSelectionChanged(go: GameObject | null): void {
    if (!this._transformControls) return;

    if (go) {
      this._transformControls.attach(go.mesh);
    } else {
      this._transformControls.detach();
    }
  }

  private _onClick(e: MouseEvent): void {
    if (!this._renderer) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);

    // Only raycast against game object meshes
    const meshes = this._engine.scene.gameObjects.map((go) => go.mesh);
    const hits = this._raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const id = hits[0].object.userData.gameObjectId;
      const go = this._engine.scene.findById(id);
      if (go) {
        this._engine.scene.selectObject(go);
      }
    } else {
      this._engine.scene.selectObject(null);
    }
  }

  private _onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._renderer) this._renderer.setSize(w, h);
  }

  render(): void {
    if (this._controls) this._controls.update();
    if (this._renderer) {
      this._renderer.render(this._engine.scene.threeScene, this._camera);
    }
  }

  dispose(): void {
    this._resizeObserver.disconnect();
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._transformControls) this._transformControls.dispose();
    if (this._renderer) this._renderer.dispose();
    if (this._controls) this._controls.dispose();
  }

  // ---- Camera state for project save/load ----

  getCameraState(): CameraStateJSON | undefined {
    if (!this._controls) return undefined;
    return {
      position: {
        x: this._camera.position.x,
        y: this._camera.position.y,
        z: this._camera.position.z,
      },
      target: {
        x: this._controls.target.x,
        y: this._controls.target.y,
        z: this._controls.target.z,
      },
    };
  }

  applyCameraState(state: CameraStateJSON): void {
    this._camera.position.set(state.position.x, state.position.y, state.position.z);
    if (this._controls) {
      this._controls.target.set(state.target.x, state.target.y, state.target.z);
      this._controls.update();
    }
  }
}
