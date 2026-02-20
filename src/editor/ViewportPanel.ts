import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import type { CameraStateJSON } from './SceneSerializer';
import type { SceneCompositionManager } from './scene/SceneCompositionManager';
import { DirectionalLightActor } from './scene/SceneActors';

/* Viewport sub-systems */
import { ViewportCameraController } from './viewport/ViewportCameraController';
import { SelectionManager } from './viewport/SelectionManager';
import { TransformGizmoSystem, type TransformMode } from './viewport/TransformGizmoSystem';
import { SceneActorGizmoManager } from './viewport/SceneActorGizmoManager';
import { HistoryManager } from './viewport/HistoryManager';
import { ObjectOperationsManager } from './viewport/ObjectOperationsManager';
import { ViewportGrid } from './viewport/ViewportGrid';
import { ViewportToolbar, type ViewportDisplayMode } from './viewport/ViewportToolbar';
import { ViewportContextMenu, buildViewportContextMenuItems } from './viewport/ViewportContextMenu';
import { PhysicsDebugRenderer } from './viewport/PhysicsDebugRenderer';
import { ViewportInputManager } from './viewport/ViewportInputManager';
import { ActorGroupSystem } from './viewport/ActorGroupSystem';
import { ActorAssetManager } from './ActorAsset';

export class ViewportPanel {
  public container: HTMLElement;
  private _renderer: THREE.WebGLRenderer | null = null;
  private _camera!: THREE.PerspectiveCamera;
  private _engine: Engine;
  private _resizeObserver: ResizeObserver;

  /* Sub-systems */
  private _cameraController!: ViewportCameraController;
  private _selectionManager!: SelectionManager;
  private _gizmo!: TransformGizmoSystem;
  private _actorGizmo!: SceneActorGizmoManager;
  private _history: HistoryManager;
  private _operations!: ObjectOperationsManager;
  private _grid!: ViewportGrid;
  private _toolbar!: ViewportToolbar;
  private _contextMenu!: ViewportContextMenu;
  private _physicsDebug!: PhysicsDebugRenderer;
  private _inputManager!: ViewportInputManager;
  private _groupSystem!: ActorGroupSystem;

  /* Composition manager link (set after construction) */
  private _composition: SceneCompositionManager | null = null;

  /* Display mode */
  private _displayMode: ViewportDisplayMode = 'lit';
  private _savedMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

  /* Play-mode camera */
  private _playCamera: THREE.PerspectiveCamera | null = null;

  /* Frame timing */
  private _lastFrameTime = performance.now();

  /* Keyboard handler */
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /* Whether pointer was just released from fly mode; suppress selection click */
  private _wasNavigating = false;

  /* Remove old grid created by Scene constructor */
  private _oldGridRemoved = false;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._history = new HistoryManager(100);

    // Wrapper div for toolbar + canvas
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';

    this._initCamera();

    try {
      this._initRenderer();
      this._initSubSystems();
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

    // Bridge: when sub-system selection changes, sync back to engine.scene
    this._engine.scene.onSelectionChanged((go) => this._onEngineSelectionChanged(go));

    // ResizeObserver for responsive canvas
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(container);
  }

  /* ====================================================================
   *  INIT
   * ==================================================================== */

  private _initRenderer(): void {
    this._renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.VSMShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 0.75;
    // EffectComposer renders through render targets; the GammaCorrectionShader
    // at the end of the pipeline handles sRGB encoding.  If the renderer ALSO
    // encodes to sRGB (the default since r152) we get double-gamma → white.
    this._renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this._renderer.setSize(w, h);

    this.container.innerHTML = '';
    this.container.appendChild(this._renderer.domElement);

    // ── WebGL context loss recovery ──────────────────────────────
    // When the canvas is reparented (e.g. floating a panel) some GPU
    // drivers drop the context.  Prevent the default behaviour and
    // force a resize once the context is restored.
    const canvas = this._renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[Viewport] WebGL context lost — waiting for restore');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.log('[Viewport] WebGL context restored');
      this._onResize();
    });
  }

  private _initCamera(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 10000);
    this._camera.position.set(5, 4, 5);
    this._camera.lookAt(0, 0, 0);
  }

  private _initSubSystems(): void {
    if (!this._renderer) return;
    const canvas = this._renderer.domElement;
    const scene3 = this._engine.scene.threeScene;

    // ---- Camera controller ----
    this._cameraController = new ViewportCameraController(this._camera, canvas);
    this._cameraController.orbitTarget.set(0, 0.5, 0);

    // ---- Selection manager (with post-processing) ----
    this._selectionManager = new SelectionManager(
      scene3,
      this._camera,
      this._renderer,
      (obj) => this._findGameObjectRoot(obj),
      () => this._getSelectableObjects(),
    );

    this._selectionManager.on('selectionChanged', (selected) => {
      // Check if a scene actor was selected via viewport click
      if (selected.length === 1 && selected[0].userData.__sceneActorId) {
        const actorId = selected[0].userData.__sceneActorId as string;
        // Clear GO selection — this is a scene actor, not a game object
        this._selectionManager.clearSelection();
        // Route to composition manager for actor selection + gizmo
        if (this._composition) {
          this._composition.selectActor(actorId);
          this._engine.scene.selectObject(null);
        }
        return;
      }

      // Normal game object selection
      this._syncSelectionToEngine(selected);
      this._gizmo.attachToObjects(selected);
      this._toolbar.updateStats(
        this._engine.scene.gameObjects.length,
        this._selectionManager.selectedCount,
        0,
      );
    });

    // ---- Transform gizmo ----
    this._gizmo = new TransformGizmoSystem(scene3, this._camera, this._renderer, this._history);

    this._gizmo.onDraggingChanged = (dragging) => {
      this._cameraController.gizmoDragging = dragging;
      // The InputManager already tracks this via its own dragging-changed
      // listener, but we also set navigationActive on SelectionManager
      // as a safety net to suppress any stale selection processing.
      this._selectionManager.navigationActive = dragging;
    };

    this._gizmo.onModeChanged = (mode) => {
      this._toolbar.updateMode(mode);
    };

    this._gizmo.onSpaceChanged = (space) => {
      this._toolbar.updateSpace(space);
    };

    this._gizmo.onSnapChanged = (snap) => {
      this._toolbar.updateSnap(snap);
    };

    // ---- Actor Group System ----
    this._groupSystem = new ActorGroupSystem(this._engine.scene, this._history);

    // Wire group-aware selection: clicking a grouped object selects all members
    this._selectionManager.groupMembersProvider = (obj: THREE.Object3D) => {
      return this._groupSystem.expandSelectionToGroup(obj);
    };

    // ---- Object operations ----
    const actorAssetMgr = this._engine.assetManager ?? new ActorAssetManager();
    this._operations = new ObjectOperationsManager(this._engine.scene, this._selectionManager, this._history, actorAssetMgr, this._groupSystem);

    this._operations.onNotification = (notification) => {
      this._toolbar.pushNotification(notification);
    };

    // ---- Grid ----
    this._grid = new ViewportGrid(scene3);
    // Remove old grid helper that Scene constructor created
    this._removeOldSceneGrid();

    // ---- Context menu ----
    this._contextMenu = new ViewportContextMenu();

    // ---- Toolbar ----
    this._toolbar = new ViewportToolbar(this.container, {
      onTransformMode: (mode) => this._gizmo.setMode(mode),
      onSpaceToggle: () => this._gizmo.toggleSpace(),
      onSnapToggle: () => this._gizmo.toggleSnap(),
      onViewMode: (mode) => this._cameraController.setViewMode(mode),
      onDisplayMode: (mode) => this._setDisplayMode(mode),
      onToggleGrid: () => { this._grid.enabled = !this._grid.enabled; },
      onToggleAxes: () => { this._grid.showAxes = !this._grid.showAxes; },
      onToggleCollision: () => {
        // Toggle collision visualization in the scene
        const scene = this._engine.scene;
        const current = (scene as any).__collisionVisible ?? false;
        (scene as any).__collisionVisible = !current;
        scene.setTriggerHelpersVisible(!current);
      },
      onToggleBounds: () => { /* bounds toggle — can be implemented later */ },
      onToggleStats: () => { /* handled internally by toolbar */ },
      onTogglePhysicsDebug: () => { this._physicsDebug.toggle(); },
      onGroup: () => { this._operations.groupSelected(); },
      onUngroup: () => { this._operations.ungroupSelected(); },
    });

    // ---- Physics Debug ----
    this._physicsDebug = new PhysicsDebugRenderer(this._engine);

    // ---- Input State Machine ----
    this._inputManager = new ViewportInputManager(
      this._gizmo,
      this._selectionManager,
      this._cameraController,
    );

    // ---- Events ----
    this._setupEvents();
  }

  private _setupEvents(): void {
    if (!this._renderer) return;
    const canvas = this._renderer.domElement;

    // Mouse events — coordinate between camera controller and selection
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));

    // Right-click context menu
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Only show after RMB fly mode is released if we didn't move much
    });

    // Global keyboard shortcuts
    this._keyHandler = (e: KeyboardEvent) => this._onKeyDown(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  /* ====================================================================
   *  EVENT HANDLERS
   * ==================================================================== */

  private _onMouseDown(e: MouseEvent): void {
    if (this._playCamera) return; // No editing during play

    // Hide context menu on any click
    this._contextMenu.hide();

    // ── Route through the input state machine ──
    // The InputManager determines whether this event should go to the
    // gizmo, camera, or selection system — they are mutually exclusive.
    this._inputManager.onPointerDown(e);

    // Track navigation for camera fly / context menu logic
    const isNavigating =
      e.button === 2 ||
      e.button === 1 ||
      (e.button === 0 && e.altKey);

    if (isNavigating) {
      this._wasNavigating = true;
    }
  }

  private _onMouseMove(e: MouseEvent): void {
    if (this._playCamera) return;

    // ── Route through the input state machine ──
    this._inputManager.onPointerMove(e);
  }

  private _onMouseUp(e: MouseEvent): void {
    if (this._playCamera) return;

    // Right-click with no drag → show context menu
    if (e.button === 2 && this._wasNavigating) {
      this._wasNavigating = false;
    }

    if (e.button === 2 || e.button === 1) {
      this._wasNavigating = false;
    }

    // ── Route through the input state machine ──
    // The InputManager ensures that if a gizmo drag just finished,
    // the selection system will NOT process this pointer-up.
    this._inputManager.onPointerUp(e);
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (this._playCamera) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Don't capture WASD etc. when in fly mode — camera controller handles them
    const inFlyMode = this._cameraController.isFlyMode;

    switch (e.key.toLowerCase()) {
      // Transform mode
      case 'w':
        if (!inFlyMode) this._gizmo.setMode('translate');
        break;
      case 'e':
        if (!inFlyMode) this._gizmo.setMode('rotate');
        break;
      case 'r':
        if (!inFlyMode) this._gizmo.setMode('scale');
        break;

      // Backtick → toggle World/Local space (UE5 shortcut)
      case '`':
        if (!inFlyMode) this._gizmo.toggleSpace();
        break;

      // Focus on selection
      case 'f':
        if (!inFlyMode) {
          const selected = this._selectionManager.selectedObjects;
          if (selected.length > 0) {
            this._cameraController.focusOnObjects(selected);
          }
        }
        break;

      // Delete
      case 'delete':
      case 'backspace':
        // If a scene actor is selected, delete it via composition manager
        if (this._composition) {
          const actorId = this._actorGizmo?.attachedActorId ?? this._composition.selectedActorId;
          if (actorId) {
            this._composition.deleteActor(actorId);
            break;
          }
        }
        this._operations.deleteSelected();
        break;

      // Escape → deselect
      case 'escape':
        this._selectionManager.clearSelection();
        break;

      // Hide
      case 'h':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this._operations.showAll();
        } else {
          this._operations.hideSelected();
        }
        break;
    }

    // Ctrl/Cmd combinations
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          this._operations.duplicateSelected();
          break;
        case 'c':
          this._operations.copySelected();
          break;
        case 'v':
          this._operations.paste();
          break;
        case 'a':
          e.preventDefault();
          this._selectionManager.selectAll();
          break;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            this._history.redo();
          } else {
            this._history.undo();
          }
          break;
        case 'y':
          e.preventDefault();
          this._history.redo();
          break;
        case 'g':
          e.preventDefault();
          if (e.shiftKey) {
            this._operations.ungroupSelected();
          } else {
            this._operations.groupSelected();
          }
          break;
      }
    }

    // Ctrl+Shift+I → invert selection
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
      this._selectionManager.invertSelection();
    }
  }

  /* ====================================================================
   *  CONTEXT MENU
   * ==================================================================== */

  private _showContextMenu(e: MouseEvent): void {
    const hasSelection = this._selectionManager.selectedCount > 0;
    const selected = this._selectionManager.selectedObjects;
    const isGroup = selected.length === 1 && selected[0].userData.isGroup;

    const items = buildViewportContextMenuItems({
      hasSelection,
      selectionCount: this._selectionManager.selectedCount,
      isGroup,
      onResetLocation: () => this._operations.resetLocation(),
      onResetRotation: () => this._operations.resetRotation(),
      onResetScale: () => this._operations.resetScale(),
      onResetAll: () => this._operations.resetAllTransforms(),
      onSelectAll: () => this._selectionManager.selectAll(),
      onInvertSelection: () => this._selectionManager.invertSelection(),
      onDeselectAll: () => this._selectionManager.clearSelection(),
      onGroup: () => this._operations.groupSelected(),
      onUngroup: () => this._operations.ungroupSelected(),
      onHide: () => this._operations.hideSelected(),
      onShowAll: () => this._operations.showAll(),
      onHideUnselected: () => this._operations.hideUnselected(),
      onCut: () => { this._operations.copySelected(); this._operations.deleteSelected(); },
      onCopy: () => this._operations.copySelected(),
      onPaste: () => this._operations.paste(),
      onDuplicate: () => this._operations.duplicateSelected(),
      onDelete: () => this._operations.deleteSelected(),
      onFocus: () => this._cameraController.focusOnObjects(this._selectionManager.selectedObjects),
    });

    this._contextMenu.show(e.clientX, e.clientY, items);
  }

  /* ====================================================================
   *  DISPLAY MODE
   * ==================================================================== */

  private _setDisplayMode(mode: ViewportDisplayMode): void {
    if (!this._renderer) return;

    // Restore saved materials first
    if (this._displayMode === 'wireframe') {
      this._restoreMaterials();
    }

    this._displayMode = mode;

    switch (mode) {
      case 'lit':
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 1.0;
        break;

      case 'unlit':
        this._renderer.toneMapping = THREE.NoToneMapping;
        break;

      case 'wireframe':
        this._applyWireframe();
        break;

      case 'detail-lighting':
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 0.5;
        break;
    }
  }

  private _applyWireframe(): void {
    this._savedMaterials.clear();
    this._engine.scene.threeScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        this._savedMaterials.set(mesh, mesh.material);
        const wireframeMat = new THREE.MeshBasicMaterial({
          color: 0x44ffaa,
          wireframe: true,
        });
        mesh.material = wireframeMat;
      }
    });
  }

  private _restoreMaterials(): void {
    this._savedMaterials.forEach((mat, obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).material = mat;
      }
    });
    this._savedMaterials.clear();
  }

  /* ====================================================================
   *  SELECTION ↔ ENGINE BRIDGE
   * ==================================================================== */

  /** When viewport selection changes → update engine.scene.selectedObject */
  private _syncSelectionToEngine(selected: THREE.Object3D[]): void {
    if (selected.length === 0) {
      this._engine.scene.selectObject(null);
    } else {
      // Primary selection → find the corresponding GameObject
      const primary = selected[0];
      const id = primary.userData.gameObjectId;
      if (id != null) {
        const go = this._engine.scene.findById(id);
        if (go) {
          // Directly set without triggering the observer loop
          this._engine.scene.selectedObject = go;
          // Fire engine's selection callbacks manually
          (this._engine.scene as any)._onSelectionChanged.forEach((cb: Function) => cb(go));
        }
      }
    }
  }

  /** When engine selection changes externally → sync to our selection */
  private _onEngineSelectionChanged(go: GameObject | null): void {
    // Only sync if it wasn't caused by us
    if (!go) {
      if (this._selectionManager && this._selectionManager.selectedCount > 0) {
        // Check if we're the ones who cleared it
        const currentPrimary = this._selectionManager.primarySelection;
        if (currentPrimary && !currentPrimary.userData.gameObjectId) {
          this._selectionManager.clearSelection();
        }
      }
      this._gizmo?.detach();
      return;
    }

    // Attach gizmo to the mesh
    if (this._gizmo) {
      this._gizmo.attachToObjects([go.mesh]);
    }
  }

  /* ====================================================================
   *  HELPERS
   * ==================================================================== */

  /** Walk up hierarchy to find the root game object mesh or scene actor group */
  private _findGameObjectRoot(obj: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.userData.gameObjectId != null) return current;
      if (current.userData.__sceneActorId != null) return current;
      current = current.parent;
    }
    return null;
  }

  /** Get all meshes that can be selected (game objects + scene actor groups) */
  private _getSelectableObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = this._engine.scene.gameObjects
      .filter((go) => go.mesh.visible)
      .map((go) => go.mesh);

    // Include scene composition actor groups so they can be clicked in the viewport
    if (this._composition) {
      this._composition.actors.forEach((entry) => {
        if (entry.visible && !entry.locked) {
          objects.push(entry.actor.group);
        }
      });
    }

    return objects;
  }

  /** Remove the old GridHelper that Scene constructor created */
  private _removeOldSceneGrid(): void {
    if (this._oldGridRemoved) return;
    const scene3 = this._engine.scene.threeScene;
    const toRemove: THREE.Object3D[] = [];
    scene3.children.forEach((child) => {
      if (child instanceof THREE.GridHelper && !child.userData.__isViewportHelper) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => scene3.remove(obj));
    this._oldGridRemoved = true;
  }

  /* ====================================================================
   *  RENDER
   * ==================================================================== */

  render(): void {
    const now = performance.now();
    const deltaTime = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    // Play mode → simple render
    if (this._playCamera) {
      if (this._renderer) {
        const sceneBackground = this._engine.scene.threeScene.background;
        const sceneEnv = this._engine.scene.threeScene.environment;
        
        // Log sky object info
        let skySphereMesh: THREE.Object3D | null = null;
        this._engine.scene.threeScene.children.forEach(child => {
          if ((child as any).__isSceneCompositionHelper) {
            skySphereMesh = child;
            console.log('[Viewport] Found sky mesh:', child.type, 'visible:', child.visible, 'renderOrder:', (child as any).renderOrder);
          }
        });
        if (!skySphereMesh) {
          console.log('[Viewport] WARNING: No sky sphere mesh found in scene!');
        }
        
        const bgStr = sceneBackground ? ((sceneBackground as any).isColor ? 'Color: ' + (sceneBackground as THREE.Color).getHexString() : 'Texture') : 'null';
        console.log('[Viewport] Play render - background:', bgStr);
        console.log('[Viewport] Play render - environment:', sceneEnv ? 'SET' : 'null');
        this._renderer.render(this._engine.scene.threeScene, this._playCamera);
      }
      return;
    }

    // Update camera controller
    this._cameraController.update(deltaTime);

    // Update camera speed display
    if (this._cameraController.isFlyMode) {
      this._toolbar.showCameraSpeed(this._cameraController.settings.flySpeed);
    } else {
      this._toolbar.hideCameraSpeed();
    }

    // Update grid (adaptive density)
    const camDist = this._camera.position.distanceTo(this._cameraController.orbitTarget);
    this._grid.update(camDist);

    // Update stats
    this._toolbar.updateStats(
      this._engine.scene.gameObjects.length,
      this._selectionManager.selectedCount,
      0,
    );
    this._toolbar.tick();

    // Update volumetric effects from composition
    this._updateVolumetricEffects();

    // Update physics debug overlay
    this._physicsDebug.update();

    // Render scene with post-processing (selection outlines)
    if (this._selectionManager) {
      this._selectionManager.render();
    }
  }

  /** Update sun screen position for god rays and animate dust particles */
  private _updateVolumetricEffects(): void {
    if (!this._composition || !this._selectionManager) return;

    const sunEntry = this._composition.getActor('default-sun');
    if (!sunEntry) return;
    const sunActor = sunEntry.actor as DirectionalLightActor;

    // Animate dust particles
    const time = performance.now() * 0.001;
    sunActor.update(time);

    // Project sun position to screen space for god rays
    const lightDir = sunActor.getLightDirection();
    // Sun is "infinitely far" in opposite direction of light
    const sunWorldPos = lightDir.clone().multiplyScalar(-1000);
    const sunScreen = sunWorldPos.clone().project(this._camera);

    // Convert from NDC [-1,1] to UV [0,1]
    const sx = sunScreen.x * 0.5 + 0.5;
    const sy = 1.0 - (sunScreen.y * 0.5 + 0.5); // flip Y for shader
    this._selectionManager.setSunScreenPosition(sx, sy);
  }

  private _lastValidWidth = 0;
  private _lastValidHeight = 0;

  private _onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    if (w === 0 || h === 0) {
      // Container temporarily collapsed (DOM reparent / floating transition).
      // Schedule a retry so we don't miss the real dimensions.
      if (this._lastValidWidth > 0) {
        setTimeout(() => this._onResize(), 100);
      }
      return;
    }

    // Avoid redundant work if dimensions haven't actually changed
    if (w === this._lastValidWidth && h === this._lastValidHeight) return;
    this._lastValidWidth = w;
    this._lastValidHeight = h;

    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._renderer) this._renderer.setSize(w, h);
    if (this._selectionManager) this._selectionManager.resize(w, h);
  }

  /* ====================================================================
   *  PUBLIC API (preserved for EditorLayout compatibility)
   * ==================================================================== */

  setPlayCamera(cam: THREE.PerspectiveCamera | null): void {
    this._playCamera = cam;
    if (cam) {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      // Play mode renders directly (no EffectComposer) → need sRGB output
      if (this._renderer) this._renderer.outputColorSpace = THREE.SRGBColorSpace;
      // Disable camera controls + gizmo during play
      this._cameraController.setEnabled(false);
      this._gizmo.detach();
    } else {
      // Back to editor → EffectComposer handles gamma via GammaCorrectionShader
      if (this._renderer) this._renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this._cameraController.setEnabled(true);
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this._renderer?.domElement ?? null;
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this._renderer;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this._camera;
  }

  /** Public accessor for the actor group system */
  get groupSystem(): ActorGroupSystem {
    return this._groupSystem;
  }

  /** Connect the composition manager for actor gizmo support */
  setCompositionManager(composition: SceneCompositionManager): void {
    this._composition = composition;
    if (this._gizmo) {
      this._actorGizmo = new SceneActorGizmoManager(composition, this._gizmo);
    }

    // When any composition actor is deleted / changed, make sure viewport
    // selection and gizmo state are clean so nothing stales on screen.
    composition.on('changed', () => {
      // If the previously selected actor is gone, ensure gizmo + outline are cleared
      if (this._actorGizmo && this._actorGizmo.attachedActorId) {
        const still = composition.getActor(this._actorGizmo.attachedActorId);
        if (!still) {
          this._actorGizmo.detach();
          this._selectionManager?.clearSelection();
        }
      }
    });

    // Forward PostProcessVolume settings to the SelectionManager's composer
    composition.on('actorPropertyChanged', (actorId: string, key: string) => {
      const entry = composition.getActor(actorId);
      if (!entry || !this._selectionManager) return;

      if (entry.type === 'PostProcessVolume') {
        this._selectionManager.updatePostProcessSettings(entry.actor.properties);
      }

      // DirectionalLight godRaysEnabled toggles the PP god rays
      if (entry.type === 'DirectionalLight' && key === 'godRaysEnabled') {
        this._selectionManager.updatePostProcessSettings({ godRaysEnabled: entry.actor.properties.godRaysEnabled });
      }
    });

    // Also sync initial post-process settings from the existing PostProcessVolume
    composition.actors.forEach((entry) => {
      if (entry.type === 'PostProcessVolume' && this._selectionManager) {
        this._selectionManager.updatePostProcessSettings(entry.actor.properties);
      }
    });
  }

  /** Get the SelectionManager (for external post-process settings sync) */
  getSelectionManager(): SelectionManager | null {
    return this._selectionManager ?? null;
  }

  getCameraState(): CameraStateJSON | undefined {
    if (!this._cameraController) return undefined;
    return this._cameraController.getCameraState() as CameraStateJSON;
  }

  applyCameraState(state: CameraStateJSON): void {
    if (this._cameraController) {
      this._cameraController.applyCameraState(state);
    }
  }

  dispose(): void {
    this._resizeObserver.disconnect();
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    this._cameraController?.dispose();
    this._selectionManager?.dispose();
    this._gizmo?.dispose();
    this._actorGizmo?.dispose();
    this._grid?.dispose();
    this._toolbar?.dispose();
    this._contextMenu?.dispose();
    if (this._renderer) this._renderer.dispose();
  }
}
