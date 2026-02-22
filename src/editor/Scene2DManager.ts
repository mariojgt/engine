// ============================================================
//  Scene2DManager — Orchestrates 2D scene mode
//  Manages switching between 2D/3D, holding 2D-specific state,
//  and coordinating 2D assets (sprite sheets, tilesets, tilemaps).
// ============================================================

import * as THREE from 'three';
import { Camera2D, type Camera2DSettings } from '../engine/Camera2D';
import { Physics2DWorld, type Physics2DSettings } from '../engine/Physics2DWorld';
import { Physics2DDebugDraw } from '../engine/Physics2DDebugDraw';
import { SortingLayerManager, DEFAULT_SORTING_LAYERS, type SortingLayerData } from '../engine/SortingLayers';
import type { SpriteSheetAsset } from '../engine/SpriteRenderer';
import type { TilesetAsset, TilemapAsset } from '../engine/TilemapData';
import { TilemapCollisionBuilder } from '../engine/TilemapData';
import { SpriteActor, type SpriteActorConfig } from '../engine/SpriteActor';
import { CharacterMovement2D, defaultCharacterMovement2DProps } from '../engine/CharacterMovement2D';
import { ScriptComponent } from '../engine/ScriptComponent';

export type SceneMode = '2D' | '3D';

export interface Scene2DConfig {
  sceneMode: SceneMode;
  renderSettings: {
    cameraType: 'orthographic' | 'perspective';
    pixelsPerUnit: number;
    referenceResolution: { width: number; height: number };
    backgroundColor: string;
  };
  worldSettings: {
    gravity: { x: number; y: number };
    physicsMode: '2D' | '3D';
    pixelsPerUnit: number;
  };
  sortingLayers: SortingLayerData[];
}

export function defaultScene2DConfig(): Scene2DConfig {
  return {
    sceneMode: '2D',
    renderSettings: {
      cameraType: 'orthographic',
      pixelsPerUnit: 100,
      referenceResolution: { width: 1920, height: 1080 },
      backgroundColor: '#1a1a2e',
    },
    worldSettings: {
      gravity: { x: 0, y: -980 },
      physicsMode: '2D',
      pixelsPerUnit: 100,
    },
    sortingLayers: structuredClone(DEFAULT_SORTING_LAYERS),
  };
}

export class Scene2DManager {
  public sceneMode: SceneMode = '3D';
  public camera2D: Camera2D | null = null;
  public physics2D: Physics2DWorld | null = null;
  public debugDraw: Physics2DDebugDraw;
  public sortingLayers: SortingLayerManager;
  public config: Scene2DConfig | null = null;

  // 2D Asset registries
  public spriteSheets = new Map<string, SpriteSheetAsset>();
  public tilesets = new Map<string, TilesetAsset>();
  public tilemaps = new Map<string, TilemapAsset>();

  // Runtime 2D actors (created during play mode)
  public spriteActors: SpriteActor[] = [];
  public isPlaying = false;

  // Edit-mode sprite preview actors — lightweight SpriteActors without physics
  // that visualise characterPawn2D/spriteActor game objects in the editor.
  private _editPreviewActors = new Map<string, SpriteActor>();
  /** Meshes hidden by setupEditPreviews so we can restore them in clearEditPreviews */
  private _editPreviewHiddenMeshes = new Map<string, any>();

  // Track 3D GO meshes that were hidden when their 2D pawn was spawned
  // so they can be made visible again when play stops.
  private _hiddenGoMeshes: Array<{ mesh: any; wasVisible: boolean }> = [];

  // Runtime AnimBP state machine: maps each SpriteActor to its current state
  // and the AnimBP asset so transitions can be evaluated each frame.
  private _actorAnimBPStates = new Map<SpriteActor, { currentStateId: string; abp: any }>();
  /** Per-actor compiled event graph script + run state for 2D AnimBP event graph execution */
  private _actorEventScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
  /** Separate ScriptComponent for each spriteActor's own blueprint (not AnimBP) */
  private _actorBlueprintScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
  /** Actors queued for deferred destruction at end of frame — avoids mutating spriteActors mid-iteration */
  private _pendingDestroy = new Set<SpriteActor>();
  /** Print function for 2D AnimBP event graphs — wire from editor Output Log so Print String nodes appear there */
  public printFn: ((v: any) => void) | null = null;

  // 2D Scene root group — all 2D actors go here
  public root2D: THREE.Group;

  // Grid overlay
  public gridHelper: THREE.GridHelper | null = null;
  private _gridGroup: THREE.Group;
  private _gridVisible = true;
  /** Reference to the THREE.Scene for grid rebuilds that happen after init */
  private _threeScene: THREE.Scene | null = null;
  /** Current tile-grid overlay (shown when pixel-perfect is on) */
  private _tileGridGroup: THREE.Group;
  private _tileGridVisible = false;

  private _onChange: (() => void)[] = [];

  constructor() {
    this.sortingLayers = new SortingLayerManager();
    this.debugDraw = new Physics2DDebugDraw();
    this.root2D = new THREE.Group();
    this.root2D.name = '__2D_Root__';
    this._gridGroup = new THREE.Group();
    this._gridGroup.name = '__2D_Grid__';
    this._tileGridGroup = new THREE.Group();
    this._tileGridGroup.name = '__2D_TileGrid__';
    this._tileGridGroup.visible = false;
  }

  get is2D(): boolean { return this.sceneMode === '2D'; }

  // ---- Mode switching ----

  async switchTo2D(threeScene: THREE.Scene, domElement: HTMLElement, config?: Scene2DConfig): Promise<void> {
    this.sceneMode = '2D';
    // Preserve config restored by fromJSON(); only use default for brand-new scenes
    if (config) {
      this.config = config;
    } else if (!this.config) {
      this.config = defaultScene2DConfig();
    }

    // Initialize Camera2D
    this.camera2D = new Camera2D(domElement, {
      pixelsPerUnit: this.config.renderSettings.pixelsPerUnit,
      referenceResolution: this.config.renderSettings.referenceResolution,
      backgroundColor: this.config.renderSettings.backgroundColor,
    });

    // Initialize Physics2D
    this.physics2D = new Physics2DWorld();
    await this.physics2D.init({
      gravity: this.config.worldSettings.gravity,
      pixelsPerUnit: this.config.worldSettings.pixelsPerUnit,
    });

    // Set sorting layers
    this.sortingLayers.setLayers(this.config.sortingLayers);

    // Add 2D root to scene
    if (!threeScene.children.includes(this.root2D)) {
      threeScene.add(this.root2D);
    }

    // Set background color
    threeScene.background = new THREE.Color(this.config.renderSettings.backgroundColor);

    // Attach debug draw overlay
    this.debugDraw.attach(this.physics2D);
    if (!threeScene.children.includes(this.debugDraw.group)) {
      threeScene.add(this.debugDraw.group);
    }

    // Store scene ref for later grid rebuilds
    this._threeScene = threeScene;

    // Create 2D grid
    this._buildGrid(threeScene);

    // Add tile grid overlay container
    if (!threeScene.children.includes(this._tileGridGroup)) {
      threeScene.add(this._tileGridGroup);
    }

    this._emit();
  }

  switchTo3D(threeScene: THREE.Scene): void {
    this.sceneMode = '3D';

    // Cleanup 2D resources
    if (this.camera2D) {
      this.camera2D.dispose();
      this.camera2D = null;
    }
    if (this.physics2D) {
      this.physics2D.cleanup();
      this.physics2D = null;
    }

    // Remove debug draw overlay
    this.debugDraw.detach();
    threeScene.remove(this.debugDraw.group);

    // Remove 2D root
    threeScene.remove(this.root2D);
    threeScene.remove(this._gridGroup);

    this.config = null;
    this._emit();
  }

  // ---- Grid ----

  private _buildGrid(scene: THREE.Scene): void {
    // Remove old
    scene.remove(this._gridGroup);
    this._gridGroup.clear();

    if (!this.config) return;

    const ppu = this.config.renderSettings.pixelsPerUnit;
    const gridSize = 100; // 100 units
    const gridLines = gridSize * 2;

    // Create line grid at z=-1 (behind all sprites)
    const material = new THREE.LineBasicMaterial({ color: 0x333366, transparent: true, opacity: 0.3, depthTest: false });
    const points: THREE.Vector3[] = [];

    for (let i = -gridSize; i <= gridSize; i++) {
      points.push(new THREE.Vector3(i, -gridSize, -1), new THREE.Vector3(i, gridSize, -1));
      points.push(new THREE.Vector3(-gridSize, i, -1), new THREE.Vector3(gridSize, i, -1));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const grid = new THREE.LineSegments(geometry, material);
    grid.name = '__2DGrid__';
    this._gridGroup.add(grid);

    // Axis lines
    const axisMat = new THREE.LineBasicMaterial({ color: 0x666688, depthTest: false });
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-gridSize, 0, -0.5), new THREE.Vector3(gridSize, 0, -0.5),
      new THREE.Vector3(0, -gridSize, -0.5), new THREE.Vector3(0, gridSize, -0.5),
    ]);
    const axisLines = new THREE.LineSegments(axisGeo, axisMat);
    axisLines.name = '__2DAxisLines__';
    this._gridGroup.add(axisLines);

    this._gridGroup.visible = this._gridVisible;
    scene.add(this._gridGroup);
  }

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    this._gridGroup.visible = this._gridVisible;
  }

  // ---- Pixel-perfect helpers ----

  /**
   * Change the scene and camera PPU to match a tileset, then
   * reconfigure the camera frustum so tiles render pixel-perfect.
   */
  setPixelsPerUnit(ppu: number): void {
    if (this.config) {
      this.config.renderSettings.pixelsPerUnit = ppu;
      this.config.worldSettings.pixelsPerUnit = ppu;
    }
    if (this.camera2D) {
      this.camera2D.setPixelsPerUnit(ppu);
    }
  }

  /**
   * Build (or rebuild) a tile-aligned grid overlay so the user can
   * clearly see cell boundaries while painting.
   *
   * @param tileWorldW  Tile width in world-units (tileWidth / ppu)
   * @param tileWorldH  Tile height in world-units (tileHeight / ppu)
   * @param visible     Whether to show the grid immediately
   */
  rebuildTileGrid(tileWorldW: number, tileWorldH: number, visible: boolean): void {
    this._tileGridGroup.clear();
    this._tileGridVisible = visible;
    this._tileGridGroup.visible = visible;

    if (!visible || tileWorldW <= 0 || tileWorldH <= 0) return;

    // Cover a generous area (±50 world-units) with tile-sized grid lines
    const extent = 60;
    const halfCols = Math.ceil(extent / tileWorldW);
    const halfRows = Math.ceil(extent / tileWorldH);

    const points: THREE.Vector3[] = [];

    // Vertical lines (along X axis at each tile column boundary)
    for (let c = -halfCols; c <= halfCols; c++) {
      const x = c * tileWorldW;
      points.push(
        new THREE.Vector3(x, -halfRows * tileWorldH, -0.9),
        new THREE.Vector3(x, halfRows * tileWorldH, -0.9),
      );
    }
    // Horizontal lines (along Y axis at each tile row boundary)
    for (let r = -halfRows; r <= halfRows; r++) {
      const y = r * tileWorldH;
      points.push(
        new THREE.Vector3(-halfCols * tileWorldW, y, -0.9),
        new THREE.Vector3(halfCols * tileWorldW, y, -0.9),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x89b4fa,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = '__TileGrid__';
    this._tileGridGroup.add(lines);
  }

  /** Show / hide the tile grid overlay */
  setTileGridVisible(visible: boolean): void {
    this._tileGridVisible = visible;
    this._tileGridGroup.visible = visible;
  }

  // ---- Asset management ----

  addSpriteSheet(asset: SpriteSheetAsset): void {
    this.spriteSheets.set(asset.assetId, asset);
    this._emit();
  }

  removeSpriteSheet(id: string): void {
    this.spriteSheets.delete(id);
    this._emit();
  }

  addTileset(asset: TilesetAsset): void {
    this.tilesets.set(asset.assetId, asset);
    this._emit();
  }

  removeTileset(id: string): void {
    this.tilesets.delete(id);
    this._emit();
  }

  addTilemap(asset: TilemapAsset): void {
    this.tilemaps.set(asset.assetId, asset);
    this._emit();
  }

  removeTilemap(id: string): void {
    this.tilemaps.delete(id);
    this._emit();
  }

  // ---- Update (called each frame) ----

  update(deltaTime: number): void {
    if (!this.is2D) return;
    this.camera2D?.update(deltaTime);
    this.physics2D?.step(deltaTime);
    // Update runtime 2D actors (physics sync, character movement, animations)
    if (this.isPlaying) {
      for (const actor of this.spriteActors) {
        if (this._pendingDestroy.has(actor)) continue; // skip actors queued for destruction
        actor.update(deltaTime);
        // Sync physics-derived variables and run the AnimBP 2D event graph
        // (BeginPlay + Tick nodes, Set/Get Anim Var, etc.)
        this._syncAnimBPVars(actor, deltaTime);
        // Evaluate AnimBP state machine transitions using synced variables
        this._evalAnimBPTransitions(actor);
        // Run the actor's own blueprint event graph (BeginPlay, Tick, overlap events)
        this._runActorBlueprintScript(actor, deltaTime);
      }
      // Flush any actors that were queued for destruction during this frame
      this._flushPendingDestroys();
    }
    this.debugDraw.update(deltaTime);
  }

  // ---- 2D Play mode ----

  /**
   * Spawn a SpriteActor from a character pawn 2D game object and
   * attach physics body + CharacterMovement2D.
   * Returns the created SpriteActor, or null on failure.
   */
  spawnCharacterPawn2D(
    go: any, /* GameObject */
    movementConfig?: any,
    assetManager?: any,
    animBPManager?: any,
  ): SpriteActor | null {
    if (!this.physics2D) return null;

    // ── FIX: Hide the source 3D GameObject mesh so the original cube/sphere
    //   is not rendered on top of the 2D sprite actor during play mode.
    if (go.mesh) {
      this._hiddenGoMeshes.push({ mesh: go.mesh, wasVisible: go.mesh.visible });
      go.mesh.visible = false;
    }

    // Use the game object's position (map 3D → 2D: x stays, y from 3D-y)
    const rawPos = go.mesh?.position ?? { x: 0, y: 0 };

    // ── Read all relevant component data from the actor asset upfront ──
    const _actorAssetForSize = assetManager?.getAsset?.(go.actorAssetId);
    const _collider2dComp    = _actorAssetForSize?.components?.find((c: any) => c.type === 'collider2d');
    const _sprRendComp       = _actorAssetForSize?.components?.find((c: any) => c.type === 'spriteRenderer');

    const colliderShape: 'box' | 'circle' | 'capsule' =
      (_collider2dComp?.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule';
    const w = _collider2dComp?.collider2dSize?.width  ?? 0.8;
    const h = _collider2dComp?.collider2dSize?.height ?? 1.0;

    // ── Safe spawn position ──
    // Place the pawn above the highest solid tile so it falls onto the map
    // rather than spawning inside it. We scan all tilemaps for the highest
    // tile Y (in world units) and add the pawn's half-height as margin.
    let spawnX = rawPos.x;
    let spawnY = rawPos.y;
    const topY = this._getTopMostTileWorldY();
    if (topY !== null) {
      // topY is the top edge of the highest tile — spawn half-height + small gap above it
      spawnY = topY + h / 2 + 0.05;
    }

    const config: SpriteActorConfig = {
      name: go.name,
      actorType: 'characterPawn2D',
      position: { x: spawnX, y: spawnY },
      physicsBodyType: 'dynamic',
      colliderShape,
      colliderSize: { width: w, height: h },
      colliderRadius: _collider2dComp?.collider2dRadius,
      componentName: _collider2dComp?.name || 'Collider2D',
      sortingLayer: _sprRendComp?.sortingLayer ?? 'Default',
      orderInLayer: _sprRendComp?.orderInLayer ?? 0,
      freezeRotation: movementConfig?.freezeRotation !== false, // default true
      characterMovement2D: true,
      blueprintId: go.actorAssetId ?? undefined,
    };

    const actor = new SpriteActor(config);
    actor.id = go.id;

    // Start with a transparent white placeholder (correct sprite will be loaded below).
    // Keep the default PlaneGeometry(1,1) — SpriteRenderer.setSprite() resizes via
    // mesh.scale, so replacing the geometry would double-scale the visual.
    actor.spriteRenderer.material.color.setHex(0xffffff);
    actor.spriteRenderer.material.transparent = true;

    this.root2D.add(actor.group);

    const gravityScale = movementConfig?.gravityScale ?? 1.0;
    actor.attachPhysicsBody(this.physics2D, {
      ...config,
      physicsBodyType: 'dynamic',
      ccdEnabled: true,
    });

    const rbComp = actor.getComponent('RigidBody2D');
    if (rbComp?.rigidBody) {
      rbComp.rigidBody.setGravityScale(gravityScale, true);
    }

    const props = { ...defaultCharacterMovement2DProps(), ...movementConfig };
    const cm2d = new CharacterMovement2D(props);
    cm2d.attach(actor);
    actor.characterMovement2D = cm2d;
    // Also register in actor._components so getComponent('CharacterMovement2D') works from event graph codegen
    actor.setComponent('CharacterMovement2D', cm2d);

    go._runtimeComponents.set('CharacterMovement2D', cm2d);
    go._runtimeComponents.set('RigidBody2D', rbComp);
    go._runtimeComponents.set('SpriteRenderer', actor.getComponent('SpriteRenderer'));

    this.spriteActors.push(actor);

    // ── Wire Animation Blueprint SYNCHRONOUSLY ──────────────────────────────
    // This MUST happen before the async sprite-sheet block below so that
    // _syncAnimBPVars() fires from the very first update frame regardless of
    // whether the image has finished decoding.
    //
    // Previously the ABP was only registered inside the async block, guarded
    // behind `if (!sheet) return` and `if (sheet.animations.length > 0)`.
    // Both guards silently killed the registration when the sprite sheet
    // wasn't yet loaded or had no animations, meaning the Event Graph never
    // ran and all variables (speed, isInAir, …) stayed at default.
    {
      const abpId: string | undefined = _sprRendComp?.animBlueprint2dId;
      const abp = abpId
        ? (animBPManager?.assets ?? []).find((a: any) => a.id === abpId)
        : null;

      if (abp) {
        actor.animBlueprintId = abp.id;
        // FIX: Register the ABP regardless of whether an entryStateId exists so
        // that the Event Graph (BeginPlay / Tick nodes) always runs even when the
        // state machine has no states.  The state-machine evaluator handles an
        // empty currentStateId gracefully — it just finds no transitions to fire.
        this._actorAnimBPStates.set(actor, {
          currentStateId: abp.stateMachine?.entryStateId ?? '',
          abp,
        });
        console.log(`[Scene2DManager] AnimBP 2D "${abp.name}" registered for "${go.name}" [entryState="${abp.stateMachine?.entryStateId ?? '(none)'}"] [hasCompiledCode=${!!abp.compiledCode}]`);
        if (!abp.compiledCode) {
          console.warn(`[Scene2DManager] AnimBP 2D "${abp.name}" has no compiled code — open the AnimBP 2D editor, add your nodes (BeginPlay / Tick), press "Compile Graph", then save the project.`);
        }
      } else if (abpId) {
        console.warn(`[Scene2DManager] AnimBP ID "${abpId}" not found in manager for actor "${go.name}" — make sure the project is saved and reloaded.`);
      }
    }

    // ── Load sprite sheet asynchronously ────────────────────────────────────
    // Only responsible for visual setup (texture, sprites, animator init).
    // ABP state registration is already done synchronously above.
    (async () => {
      const actorAsset = assetManager?.getAsset?.(go.actorAssetId);
      const sprComp = actorAsset?.components?.find((c: any) => c.type === 'spriteRenderer');
      const sheetId: string | undefined = sprComp?.spriteSheetId;
      const sheet = sheetId ? this.spriteSheets.get(sheetId) : null;
      if (!sheet) {
        if (sheetId) console.warn(`[Scene2DManager] Sprite sheet "${sheetId}" not found for actor "${go.name}" — visuals will not render.`);
        return;
      }

      // Ensure the image is decoded before building a Three.js Texture
      if (!sheet.image || !(sheet.image as HTMLImageElement).complete || (sheet.image as HTMLImageElement).naturalWidth === 0) {
        if (sheet.imageDataUrl) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => { sheet.image = img; resolve(); };
            img.onerror = () => resolve();
            img.src = sheet.imageDataUrl!;
          });
        }
      }

      // Build THREE.Texture from image if not already present.
      // flipY must be FALSE — SpriteRenderer.setSprite() UV math expects image-space Y
      // (v = 1 - y/texH), which only works correctly when the texture is NOT flipped by WebGL.
      if (sheet.image && !sheet.texture) {
        const tex = new THREE.Texture(sheet.image as HTMLImageElement);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;   // ← must match UV math in SpriteRenderer.setSprite
        tex.needsUpdate = true;
        sheet.texture = tex;
      }

      // Assign sheet + texture to the actor's SpriteRenderer
      actor.setSpriteSheet(sheet);

      // Apply sprite-renderer component settings
      if (_sprRendComp?.flipX) actor.spriteRenderer.flipX = true;
      if (_sprRendComp?.flipY) actor.spriteRenderer.flipY = true;
      actor.sortingLayer  = _sprRendComp?.sortingLayer  ?? 'Default';
      actor.orderInLayer  = _sprRendComp?.orderInLayer  ?? 0;
      actor.applySorting(this.sortingLayers);

      // Pin the default sprite frame immediately so the mesh has the right
      // size/UVs before the animator starts (avoids the full-texture strip on first frame).
      const defaultSpriteData = _sprRendComp?.defaultSprite
        ? sheet.sprites.find((s: any) => s.name === _sprRendComp.defaultSprite || s.spriteId === _sprRendComp.defaultSprite)
        : sheet.sprites[0];
      if (defaultSpriteData && sheet.texture) {
        actor.spriteRenderer.setSprite(defaultSpriteData, sheet.texture);
      }

      // Init animator with all available animations.
      // Use the ABP entry state's spriteAnimationName as the default clip so
      // the first frame shows the correct animation immediately.
      if (sheet.animations && sheet.animations.length > 0) {
        // Re-resolve ABP from the already-registered state (avoids a second manager lookup)
        const registeredEntry = this._actorAnimBPStates.get(actor);
        const abpForAnim = registeredEntry?.abp ?? null;

        const entryState = abpForAnim?.stateMachine?.states?.find(
          (s: any) => s.id === abpForAnim.stateMachine.entryStateId,
        );
        const defaultAnim: string | undefined =
          entryState?.spriteAnimationName ?? sheet.animations[0]?.animName;
        actor.initAnimator(sheet.animations, defaultAnim);
      }
    })();

    console.log(`[Scene2DManager] Spawned 2D pawn "${go.name}" at (${spawnX.toFixed(3)}, ${spawnY.toFixed(3)}) size (${w.toFixed(2)}, ${h.toFixed(2)}) [topY=${topY?.toFixed(3) ?? 'n/a'}]`);
    return actor;
  }

  /**
   * Spawn a SpriteActor from a spriteActor game object.
   * Attaches optional Rapier2D body + collider from the actor's rigidbody2d /
   * collider2d components and runs the actor blueprint compiled code each tick.
   */
  spawnSpriteActor2D(
    go: any, /* GameObject */
    assetManager?: any,
    animBPManager?: any,
  ): SpriteActor | null {
    if (!this.physics2D) return null;

    // Hide the source 3D mesh so the cube/sphere is not rendered over the sprite.
    if (go.mesh) {
      this._hiddenGoMeshes.push({ mesh: go.mesh, wasVisible: go.mesh.visible });
      go.mesh.visible = false;
    }

    const rawPos = go.mesh?.position ?? { x: 0, y: 0 };

    const actorAsset          = assetManager?.getAsset?.(go.actorAssetId);
    const collider2dComp      = actorAsset?.components?.find((c: any) => c.type === 'collider2d');
    const rigidbody2dComp     = actorAsset?.components?.find((c: any) => c.type === 'rigidbody2d');
    const sprRendComp         = actorAsset?.components?.find((c: any) => c.type === 'spriteRenderer');

    // Determine physics body type: explicit rigidbody2d wins; if only a collider
    // exists default to 'static'; if neither exists → no physics body.
    const physicsBodyType: 'dynamic' | 'kinematic' | 'static' | undefined =
      rigidbody2dComp?.rigidbody2dType ?? (collider2dComp ? 'static' : undefined);

    const colliderShape: 'box' | 'circle' | 'capsule' =
      (collider2dComp?.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule';
    const w        = collider2dComp?.collider2dSize?.width  ?? 1.0;
    const h        = collider2dComp?.collider2dSize?.height ?? 1.0;
    const isTrigger = collider2dComp?.isTrigger ?? false;

    const config: SpriteActorConfig = {
      name:         go.name,
      actorType:    'spriteActor',
      position:     { x: rawPos.x, y: rawPos.y },
      physicsBodyType,
      colliderShape,
      colliderSize: { width: w, height: h },
      colliderRadius: collider2dComp?.collider2dRadius,
      isTrigger,
      componentName: collider2dComp?.name || 'Collider2D',
      sortingLayer:  sprRendComp?.sortingLayer  ?? 'Default',
      orderInLayer:  sprRendComp?.orderInLayer  ?? 0,
      blueprintId:   go.actorAssetId ?? undefined,
    };

    const actor = new SpriteActor(config);
    actor.id = go.id;
    actor.spriteRenderer.material.color.setHex(0xffffff);
    actor.spriteRenderer.material.transparent = true;
    this.root2D.add(actor.group);

    // Attach physics body + collider if a body type was resolved
    if (physicsBodyType) {
      actor.attachPhysicsBody(this.physics2D, config);
    }

    const rbComp = actor.getComponent('RigidBody2D');
    if (!go._runtimeComponents) go._runtimeComponents = new Map();
    if (rbComp) go._runtimeComponents.set('RigidBody2D', rbComp);
    go._runtimeComponents.set('SpriteRenderer', actor.getComponent('SpriteRenderer'));

    // Store the actor blueprint compiled code so _runActorBlueprintScript can pick it up
    if (actorAsset?.compiledCode) {
      (actor as any).__actorBlueprintCode = actorAsset.compiledCode;
    }

    // Register AnimBP if the sprite renderer references one
    {
      const abpId: string | undefined = sprRendComp?.animBlueprint2dId;
      const abp = abpId
        ? (animBPManager?.assets ?? []).find((a: any) => a.id === abpId)
        : null;
      if (abp) {
        actor.animBlueprintId = abp.id;
        this._actorAnimBPStates.set(actor, {
          currentStateId: abp.stateMachine?.entryStateId ?? '',
          abp,
        });
      }
    }

    this.spriteActors.push(actor);

    // ── Load sprite sheet asynchronously (same pattern as spawnCharacterPawn2D) ──
    (async () => {
      const sheetId: string | undefined = sprRendComp?.spriteSheetId;
      const sheet = sheetId ? this.spriteSheets.get(sheetId) : null;
      if (!sheet) return;

      if (!sheet.image || !(sheet.image as HTMLImageElement).complete || (sheet.image as HTMLImageElement).naturalWidth === 0) {
        if (sheet.imageDataUrl) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => { sheet.image = img; resolve(); };
            img.onerror = () => resolve();
            img.src = sheet.imageDataUrl!;
          });
        }
      }

      if (sheet.image && !sheet.texture) {
        const tex = new THREE.Texture(sheet.image as HTMLImageElement);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        sheet.texture = tex;
      }

      if (!this.spriteActors.includes(actor)) return; // stale — play stopped

      actor.setSpriteSheet(sheet);
      if (sprRendComp?.flipX) actor.spriteRenderer.flipX = true;
      if (sprRendComp?.flipY) actor.spriteRenderer.flipY = true;
      actor.sortingLayer = sprRendComp?.sortingLayer ?? 'Default';
      actor.orderInLayer = sprRendComp?.orderInLayer ?? 0;
      actor.applySorting(this.sortingLayers);

      // Always render the default/first sprite frame immediately so the mesh
      // is correctly sized and UV'd before the animator takes over.
      // Without this the sprite sits at scale(1,1,1) with no UVs set, which
      // shows a full-texture strip instead of the actual sprite frame.
      const defaultSpriteData = sprRendComp?.defaultSprite
        ? sheet.sprites.find((s: any) => s.name === sprRendComp.defaultSprite || s.spriteId === sprRendComp.defaultSprite)
        : sheet.sprites[0];
      if (defaultSpriteData && sheet.texture) {
        actor.spriteRenderer.setSprite(defaultSpriteData, sheet.texture);
      }

      if (sheet.animations && sheet.animations.length > 0) {
        const registeredEntry = this._actorAnimBPStates.get(actor);
        const abpForAnim = registeredEntry?.abp ?? null;
        const entryState = abpForAnim?.stateMachine?.states?.find(
          (s: any) => s.id === abpForAnim.stateMachine.entryStateId,
        );
        const defaultAnim: string | undefined =
          entryState?.spriteAnimationName ?? sheet.animations[0]?.animName;
        actor.initAnimator(sheet.animations, defaultAnim);
      }
    })();

    console.log(`[Scene2DManager] Spawned spriteActor "${go.name}" at (${rawPos.x.toFixed(3)}, ${rawPos.y.toFixed(3)}) physicsType=${physicsBodyType ?? 'none'} isTrigger=${isTrigger}`);
    return actor;
  }

  /**
   * Scan all tilemaps and return the world-Y of the TOP edge of the
   * highest solid tile across all layers.  Returns null if no solid
   * tiles are found (caller falls back to the GO's raw 3D Y).
   */
  private _getTopMostTileWorldY(): number | null {
    let maxWorldY: number | null = null;
    for (const tilemap of this.tilemaps.values()) {
      const tileset = this.tilesets.get(tilemap.tilesetId);
      if (!tileset) continue;
      const ppu = tileset.pixelsPerUnit || 100;
      const tileH = tileset.tileHeight / ppu;
      for (const layer of tilemap.layers) {
        for (const key of Object.keys(layer.tiles)) {
          const tileId = layer.tiles[key];
          // Determine if this tile is solid
          const solid = layer.hasCollision || (() => {
            const td = tileset.tiles.find(t => t.tileId === tileId) ?? tileset.tiles[tileId];
            return td ? td.collision !== 'none' : false;
          })();
          if (!solid) continue;
          const [, cy] = key.split(',').map(Number);
          // Top edge of this tile in world units
          const topEdge = (cy + 1) * tileH;
          if (maxWorldY === null || topEdge > maxWorldY) maxWorldY = topEdge;
        }
      }
    }
    return maxWorldY;
  }

  /** Start 2D play mode.
   *  Async because it reinitialises the Rapier2D world before every play
   *  session. This gives a completely clean physics state and eliminates
   *  stale rigid-body handles in bodyMap from the previous session (which
   *  would cause WASM panics in syncToThreeJS on the second play).
   */
  async startPlay(): Promise<void> {
    // Remove edit-mode sprite previews before spawning real actors
    this.clearEditPreviews();
    // ── Reinitialise physics world for a clean session ──
    // init() frees the old Rapier world (releasing WASM memory), creates a
    // fresh one, and clears bodyMap + layerBodies.  The _rapier module itself
    // is cached after the first import so this is synchronous after the first play.
    if (this.physics2D && this.config) {
      await this.physics2D.init({
        gravity: this.config.worldSettings.gravity,
        pixelsPerUnit: this.config.worldSettings.pixelsPerUnit,
      });
    }

    this.isPlaying = true;
    // Rebuild tilemap collision bodies into the fresh world
    this.rebuildAllTileCollision();
    this.physics2D?.play();
  }

  /**
   * Rebuild Rapier2D static collision bodies for every tilemap layer
   * that has `hasCollision === true`.  Called automatically at play start
   * so collision is always up-to-date even after save/load.
   */
  rebuildAllTileCollision(): void {
    if (!this.physics2D) {
      console.warn('[Scene2DManager] rebuildAllTileCollision — no physics2D!');
      return;
    }
    if (!this.physics2D.world) {
      console.warn('[Scene2DManager] rebuildAllTileCollision — physics2D has no Rapier world!');
      return;
    }
    const builder = new TilemapCollisionBuilder();
    let totalBodies = 0;
    console.log('[Scene2DManager] rebuildAllTileCollision — tilemaps=%d, tilesets=%d, worldExists=%s',
      this.tilemaps.size, this.tilesets.size, !!this.physics2D.world);
    for (const [tmId, tilemap] of this.tilemaps) {
      const tileset = this.tilesets.get(tilemap.tilesetId);
      if (!tileset) {
        console.warn('[Scene2DManager] Tilemap "%s" references tilesetId="%s" but tileset not found! Available:', tilemap.assetName, tilemap.tilesetId, [...this.tilesets.keys()]);
        continue;
      }
      console.log('[Scene2DManager]   tileset "%s" tiles.length=%d tileWidth=%d tileHeight=%d ppu=%d',
        tileset.assetName, tileset.tiles?.length ?? 0, tileset.tileWidth, tileset.tileHeight, tileset.pixelsPerUnit);
      if (!tileset.tiles || tileset.tiles.length === 0) {
        console.warn('[Scene2DManager] Tileset "%s" has NO tile definitions! Collision will not work.', tileset.assetName);
      }
      for (const layer of tilemap.layers) {
        const tileCount = Object.keys(layer.tiles).length;
        // TilemapCollisionBuilder.rebuild() now passes forceFullCollision=true
        // for layers where hasCollision is set, so we no longer need to mutate
        // TileDefData.collision here — doing so was a destructive side-effect
        // that corrupted per-tile collision rules across the whole tileset.
        builder.rebuild(layer, this.physics2D, tileset);
        const layerBodies = (this.physics2D as any)._layerBodies?.get(layer.layerId);
        const bodyCount = layerBodies?.length ?? 0;
        totalBodies += bodyCount;
        console.log('[Scene2DManager]   layer "%s" hasCollision=%s tiles=%d → bodies=%d',
          layer.name, layer.hasCollision, tileCount, bodyCount);
      }
    }
    const stats = this.physics2D.getWorldStats();
    console.log('[Scene2DManager] Rebuilt tile collision — total static bodies: %d | World stats: bodies=%d, dynamic=%d, fixed=%d, colliders=%d',
      totalBodies, stats.bodies, stats.dynamicBodies, stats.fixedBodies, stats.colliders);
  }

  // ---- Edit-mode sprite previews ----

  /**
   * Remove all existing edit-mode preview actors from root2D and restore
   * any hidden 3D meshes so they are visible again in edit mode.
   */
  clearEditPreviews(): void {
    for (const [, actor] of this._editPreviewActors) {
      this.root2D.remove(actor.group);
      actor.dispose(undefined);
    }
    this._editPreviewActors.clear();

    // Restore 3D mesh visibility so spawnCharacterPawn2D records the correct
    // wasVisible=true when it re-hides them at play start.
    for (const [, mesh] of this._editPreviewHiddenMeshes) {
      mesh.visible = true;
    }
    this._editPreviewHiddenMeshes.clear();
  }

  /**
   * Create lightweight SpriteActors (no physics) for every characterPawn2D /
   * spriteActor game object so the editor 2D viewport shows the sprite instead
   * of the black 3D mesh box.  Safe to call repeatedly — clears old previews first.
   */
  setupEditPreviews(gameObjects: any[], assetManager?: any): void {
    if (this.isPlaying) return; // real actors are used during play
    this.clearEditPreviews();

    for (const go of gameObjects) {
      if (go.actorType !== 'characterPawn2D' && go.actorType !== 'spriteActor') continue;

      // Hide the 3D mesh that would otherwise appear as a black box
      if (go.mesh) {
        go.mesh.visible = false;
        this._editPreviewHiddenMeshes.set(go.id, go.mesh);
      }

      const rawPos = go.mesh?.position ?? { x: 0, y: 0 };

      const actor = new SpriteActor({
        name: go.name + '__editPreview',
        actorType: 'spriteActor',
        position: { x: rawPos.x, y: rawPos.y },
      });
      actor.spriteRenderer.material.color.setHex(0xffffff);
      actor.spriteRenderer.material.transparent = true;
      this.root2D.add(actor.group);
      this._editPreviewActors.set(go.id, actor);

      // Load the sprite sheet and show the first / default sprite asynchronously
      (async () => {
        const actorAsset = assetManager?.getAsset?.(go.actorAssetId);
        const sprComp = actorAsset?.components?.find((c: any) => c.type === 'spriteRenderer');
        const sheetId: string | undefined = sprComp?.spriteSheetId;
        const sheet = sheetId ? this.spriteSheets.get(sheetId) : null;
        if (!sheet) return;

        // Decode image if needed
        if (!sheet.image || !(sheet.image as HTMLImageElement).complete || (sheet.image as HTMLImageElement).naturalWidth === 0) {
          if (sheet.imageDataUrl) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => { sheet.image = img; resolve(); };
              img.onerror = () => resolve();
              img.src = sheet.imageDataUrl!;
            });
          }
        }

        // Build texture (flipY=false so UV math is consistent with play mode)
        if (sheet.image && !sheet.texture) {
          const tex = new THREE.Texture(sheet.image as HTMLImageElement);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false;
          tex.needsUpdate = true;
          sheet.texture = tex;
        }

        // Don't apply to a stale actor (may have been cleared by stopPlay / clearEditPreviews)
        if (!this._editPreviewActors.has(go.id)) return;

        actor.setSpriteSheet(sheet);

        const spriteData = sprComp?.defaultSprite
          ? sheet.sprites.find((s: any) => s.name === sprComp.defaultSprite || s.spriteId === sprComp.defaultSprite)
          : sheet.sprites[0];
        if (spriteData && sheet.texture) {
          actor.spriteRenderer.setSprite(spriteData, sheet.texture);
        }
      })();
    }
  }

  // ---- AnimBP runtime state machine evaluator ----

  /** Evaluate AnimBP transitions for one actor and switch animation if a rule fires. */
  /**
   * Auto-populate animator.variables with physics/character state so AnimBP
   * blend spaces and transition rules can read speed, isGrounded, etc. without
   * requiring manual event-graph wiring.
   */
  private _syncAnimBPVars(actor: SpriteActor, deltaTime = 0): void {
    const animator = actor.animator; // may be null until sprite sheet async-loads — do NOT bail early

    // ── Step 1: Ensure a per-actor variable store exists ─────────────────────
    // We keep variables on actor.__animVars so the event graph can read/write
    // them even before the SpriteAnimator is created (which happens async, after
    // the sprite sheet finishes loading).  Once the animator IS created we keep
    // both in sync so transitions driven by animator.variables still work.
    const actorAsAny = actor as any;
    if (!actorAsAny.__animVars) {
      // Bootstrap default physics-driven variables
      actorAsAny.__animVars = {
        speed: 0,
        velocityX: 0,
        velocityY: 0,
        isGrounded: false,
        isJumping: false,
        isFalling: false,
        facingRight: true,
      };
      // Also copy any blueprint-declared variable defaults so Set/Get Anim Var
      // nodes can read them on the very first tick (before the user sets them).
      const entryForVars = this._actorAnimBPStates.get(actor);
      const abpForVars = entryForVars?.abp;
      if (abpForVars?.blueprintData?.variables) {
        for (const v of abpForVars.blueprintData.variables as any[]) {
          const key: string = v.name;
          if (!(key in actorAsAny.__animVars)) {
            let def: any = v.defaultValue ?? null;
            if (v.type === 'Float')   def = typeof def === 'number' ? def : 0;
            if (v.type === 'Boolean') def = def === true || def === 'true';
            actorAsAny.__animVars[key] = def;
          }
        }
      }
    }

    // ── Step 2: Sync physics-driven variables into __animVars ────────────────
    const cm = actor.characterMovement2D;
    if (animator) {
      // Prefer the animator's built-in sync (reads RigidBody2D linvel)
      animator.syncAutoVariables(actor);
      // Mirror into our shared store so event-graph reads are consistent
      actorAsAny.__animVars['speed']      = animator.variables['speed']      ?? 0;
      actorAsAny.__animVars['velocityX']  = animator.variables['velocityX']  ?? 0;
      actorAsAny.__animVars['velocityY']  = animator.variables['velocityY']  ?? 0;
      actorAsAny.__animVars['isGrounded'] = animator.variables['isGrounded'] ?? false;
      actorAsAny.__animVars['isJumping']  = animator.variables['isJumping']  ?? false;
      actorAsAny.__animVars['isFalling']  = animator.variables['isFalling']  ?? false;
    } else {
      // No animator yet — read physics directly
      const rb = actor.getComponent('RigidBody2D');
      if (rb?.rigidBody) {
        const vel = rb.rigidBody.linvel();
        actorAsAny.__animVars['speed']      = Math.abs(vel.x);
        actorAsAny.__animVars['velocityX']  = vel.x;
        actorAsAny.__animVars['velocityY']  = vel.y;
        actorAsAny.__animVars['isGrounded'] = rb.isGrounded ?? false;
        actorAsAny.__animVars['isJumping']  = vel.y >  0.01 && !(rb.isGrounded ?? false);
        actorAsAny.__animVars['isFalling']  = vel.y < -0.01 && !(rb.isGrounded ?? false);
      }
    }

    // Override with CharacterMovement2D values (more accurate than raw physics)
    if (cm) {
      const rb = actor.getComponent('RigidBody2D');
      const vy = rb?.rigidBody?.linvel()?.y ?? 0;
      actorAsAny.__animVars['isGrounded']  = cm.isGrounded;
      actorAsAny.__animVars['isJumping']   = !cm.isGrounded && vy > 0.01;
      actorAsAny.__animVars['isFalling']   = !cm.isGrounded && vy < -0.01;
      actorAsAny.__animVars['facingRight'] = cm.facingRight;
      if (animator) {
        animator.variables['isGrounded']  = cm.isGrounded;
        animator.variables['isJumping']   = !cm.isGrounded && vy > 0.01;
        animator.variables['isFalling']   = !cm.isGrounded && vy < -0.01;
        animator.variables['facingRight'] = cm.facingRight;
      }
    }

    // ── Step 3: Execute the compiled AnimBP 2D event graph ───────────────────
    // The varShim bridges __animInstance.variables.set/get to __animVars so
    // Set/Get Anim Var nodes always work — even before animator is created.
    // When the animator is present we also write through to animator.variables
    // so the transition system (which reads animator.variables) sees the values.
    const entry = this._actorAnimBPStates.get(actor);
    const abp = entry?.abp;
    if (!entry) {
      // ABP not registered for this actor — nothing to run
      return;
    }
    if (!abp?.compiledCode) {
      // ABP has no compiled event-graph code yet; warn once per actor to avoid log spam
      const actorAny = actor as any;
      if (!actorAny.__warnedNoAnimBPCode) {
        actorAny.__warnedNoAnimBPCode = true;
        console.warn(`[AnimBP2D] "${actor.name}" → AnimBP "${abp?.name ?? '(unknown)'}" has no compiled code.`,
          'Open the AnimBP editor → Event Graph tab → add BeginPlay/Tick nodes → press "Compile Graph" → save the project.');
      }
      return;
    }

    let ev = this._actorEventScripts.get(actor);
    if (!ev) {
      const sc = new ScriptComponent();
      sc.code = abp.compiledCode;
      const ok = sc.compile();
      ev = { script: ok ? sc : null, started: false, elapsed: 0 };
      this._actorEventScripts.set(actor, ev);
      if (!ok) console.warn('[Scene2DManager] Failed to compile AnimBP2D event graph for', abp.name);
    }
    if (!ev.script) return;

    // varShim reads/writes __animVars and also mirrors into animator.variables when present
    const vars: Record<string, any> = actorAsAny.__animVars;
    const varShim = {
      get: (k: string) => vars[k],
      set: (k: string, v: any) => {
        vars[k] = v;
        if (animator) animator.variables[k] = v; // keep animator in sync for transition rules
      },
      has: (k: string) => k in vars,
    };

    // ── Shim controller / characterController / actorAssetId on the SpriteActor ──
    // In 2D, the SpriteActor IS the pawn — there is no separate AController object.
    // Blueprint nodes like "Get Controller", "Get Pawn", and "Cast To <Class>" expect
    // these properties on `gameObject`, so we attach lightweight shims.
    if (!actorAsAny.__2dControllerShim) {
      actorAsAny.__2dControllerShim = {
        controllerType: 'PlayerController',
        getPawn:        () => ({ gameObject: actor }),
        isPossessing:   () => true,
      };
    }
    if (actorAsAny.controller          == null) actorAsAny.controller          = actorAsAny.__2dControllerShim;
    if (actorAsAny.characterController == null) actorAsAny.characterController = { gameObject: actor };
    if (actorAsAny.actorAssetId        == null && actorAsAny.blueprintId) {
      actorAsAny.actorAssetId = actorAsAny.blueprintId;
    }

    // ── Scene shim so "Get Actor By Name" / "Get Player Pawn" can find 2D actors ──
    const self = this;
    const sceneShim = {
      get gameObjects() { return self.spriteActors as any[]; },
      findById: (id: number) => self.spriteActors.find(a => (a as any).id === id) ?? null,
    };

    const ctx = {
      gameObject:   actor as any,
      deltaTime,
      elapsedTime:  ev.elapsed,
      // Use the wired-in printFn so output appears in the editor Output Log.
      // Falls back to console.log if not yet wired (e.g. preview mode).
      print:        this.printFn ?? ((v: any) => console.log('[AnimBP2D]', v)),
      physics:      null,
      scene:        sceneShim,
      animInstance: { variables: varShim, asset: abp },
      // Expose a minimal engine shim so that Camera 2D blueprint nodes
      // (which use __engine.scene2DManager.camera2D) work at runtime.
      engine:       { scene2DManager: this },
      gameInstance: null,
    };

    if (!ev.started) {
      console.log(`[AnimBP2D] ▶ BeginPlay firing for "${actor.name}" (ABP: "${abp.name}")`);
      ev.script.beginPlay(ctx);
      ev.started = true;
    }
    ev.script.tick(ctx);
    ev.elapsed += deltaTime;

    // ── Step 4: Mirror any vars the event-graph just wrote back into animator ──
    // The transition evaluator reads animator.variables directly so we always
    // need them in sync after the event graph runs.
    if (animator) {
      for (const k of Object.keys(vars)) {
        animator.variables[k] = vars[k];
      }
    }
  }

  private _evalAnimBPTransitions(actor: SpriteActor): void {
    const entry = this._actorAnimBPStates.get(actor);
    if (!entry) return;
    const { abp } = entry;
    const sm = abp?.stateMachine;
    if (!sm) return;
    const animator = actor.animator;
    if (!animator) return;
    // Use the shared __animVars store (written by the event graph) so transition
    // rules see values set by Set Anim Var nodes.  Fall back to animator.variables
    // if __animVars hasn't been initialised yet (should not happen in practice).
    const vars: Record<string, any> = (actor as any).__animVars ?? animator.variables ?? {};

    // Collect eligible transitions: from current state OR Any-State (*), sorted by priority
    const transitions: any[] = (sm.transitions ?? [])
      .filter((t: any) => t.fromStateId === entry.currentStateId || t.fromStateId === '*')
      .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const t of transitions) {
      // Skip self-transitions
      if (t.toStateId === entry.currentStateId) continue;

      const hasRules = t.rules && t.rules.length > 0;
      if (!hasRules) {
        // No rules: only fire when the current (non-looping) animation finishes
        if (animator.currentAnim?.loop) continue;
        if (animator.isPlaying) continue;
      } else {
        if (!this._evalAnimBPTransition(t, vars)) continue;
      }

      // Transition fires — look up target state
      const targetState = sm.states.find((s: any) => s.id === t.toStateId);
      if (!targetState) continue;

      entry.currentStateId = t.toStateId;

      // Play the right animation for the target state
      if (targetState.outputType === 'blendSprite1D') {
        this._applyBlendSprite1DState(targetState, abp, vars, animator);
      } else {
        const newAnimName: string | undefined = targetState.spriteAnimationName;
        if (newAnimName) animator.play(newAnimName);
      }
      return; // fire one transition per frame
    }

    // ── Continuous blend space update ──
    // If the current state is a blendSprite1D, re-evaluate every frame so the
    // animation updates as the driving variable changes (e.g. speed 0→600).
    const currentState = sm.states.find((s: any) => s.id === entry.currentStateId);
    if (currentState?.outputType === 'blendSprite1D') {
      this._applyBlendSprite1DState(currentState, abp, vars, animator);
    }
  }

  /** Evaluate a blendSprite1D state and play the matching animation on the animator */
  private _applyBlendSprite1DState(state: any, abp: any, vars: Record<string, any>, animator: any): void {
    const blendSprites1D: any[] = abp.blendSprites1D ?? [];
    const bs = blendSprites1D.find((b: any) => b.id === state.blendSprite1DId);
    if (!bs || !bs.samples?.length) {
      // Fallback: play spriteAnimationName if set
      if (state.spriteAnimationName) animator.play(state.spriteAnimationName);
      return;
    }

    const drivingVar = state.blendSpriteAxisVar || bs.drivingVariable;
    const axisValue: number = typeof vars[drivingVar] === 'number' ? vars[drivingVar] : 0;

    // Find the sample whose range contains axisValue; or the closest one
    const sorted = [...bs.samples].sort((a: any, b: any) => a.rangeMin - b.rangeMin);
    let best = sorted.find((s: any) => axisValue >= s.rangeMin && axisValue <= s.rangeMax);
    if (!best) {
      // Closest by range midpoint
      best = sorted.reduce((prev: any, cur: any) => {
        const prevMid = (prev.rangeMin + prev.rangeMax) / 2;
        const curMid = (cur.rangeMin + cur.rangeMax) / 2;
        return Math.abs(axisValue - curMid) < Math.abs(axisValue - prevMid) ? cur : prev;
      });
    }

    if (!best?.spriteAnimationName) return;

    // Only switch animation if it changed (avoids restarting same clip every frame)
    if (animator.currentAnim?.animName !== best.spriteAnimationName) {
      animator.play(best.spriteAnimationName);
    }
  }

  private _evalAnimBPTransition(t: any, vars: Record<string, any>): boolean {
    const groups: any[] = t.rules ?? [];
    if (groups.length === 0) return true;
    const logic: string = t.ruleLogic ?? 'AND';
    if (logic === 'AND') return groups.every((g: any) => this._evalAnimBPRuleGroup(g, vars));
    return groups.some((g: any) => this._evalAnimBPRuleGroup(g, vars));
  }

  private _evalAnimBPRuleGroup(group: any, vars: Record<string, any>): boolean {
    const rules: any[] = group.rules ?? [];
    if (rules.length === 0) return true;
    if (group.op === 'AND') return rules.every((r: any) => this._evalAnimBPRule(r, vars));
    return rules.some((r: any) => this._evalAnimBPRule(r, vars));
  }

  private _evalAnimBPRule(rule: any, vars: Record<string, any>): boolean {
    if (rule.kind === 'expr') {
      try {
        // eslint-disable-next-line no-new-func
        return !!new Function('vars', `with(vars){return!!(${rule.expr})}`)(vars);
      } catch { return false; }
    }
    const val = vars[rule.varName];
    const cmp = rule.value;
    switch (rule.op) {
      case '==':       return val == cmp;  // loose: bool vs number
      case '!=':       return val != cmp;
      case '>':        return val > cmp;
      case '<':        return val < cmp;
      case '>=':       return val >= cmp;
      case '<=':       return val <= cmp;
      case 'contains': return String(val).includes(String(cmp));
      default:         return false;
    }
  }

  /**
   * Run the actor's own blueprint compiled code (BeginPlay / Tick / overlap events).
   * This is separate from the AnimBP 2D event graph — it executes the actor blueprint
   * that the user builds in the "Event Graph" tab of the Actor Editor.
   * `gameObject` in the script context is the SpriteActor itself so that
   * `gameObject.on('triggerBegin2D', ...)` registrations reach the physics event emitter.
   */
  private _runActorBlueprintScript(actor: SpriteActor, deltaTime: number): void {
    const actorAny = actor as any;
    const code: string | undefined = actorAny.__actorBlueprintCode;
    if (!code) return;

    let ev = this._actorBlueprintScripts.get(actor);
    if (!ev) {
      const sc = new ScriptComponent();
      sc.code = code;
      const ok = sc.compile();
      ev = { script: ok ? sc : null, started: false, elapsed: 0 };
      this._actorBlueprintScripts.set(actor, ev);
      if (!ok) {
        console.warn(`[Scene2DManager] Failed to compile actor blueprint for "${actor.name}".`);
      }
    }
    if (!ev.script) return;

    const self = this;
    const sceneShim = {
      get gameObjects() { return self.spriteActors as any[]; },
      findById: (id: number) => self.spriteActors.find(a => (a as any).id === id) ?? null,
    };

    const ctx = {
      gameObject:   actor as any,
      deltaTime,
      elapsedTime:  ev.elapsed,
      print:        this.printFn ?? ((v: any) => console.log('[Actor2D]', v)),
      physics:      null,
      scene:        sceneShim,
      animInstance: null,
      engine:       { scene2DManager: this },
      gameInstance: null,
    };

    if (!ev.started) {
      console.log(`[Scene2DManager] ▶ BeginPlay (actor blueprint) for "${actor.name}"`);
      ev.script.beginPlay(ctx);
      ev.started = true;
    }
    ev.script.tick(ctx);
    ev.elapsed += deltaTime;
  }

  /** Destroy a single SpriteActor at runtime (called by Destroy Actor blueprint node).
   * Destruction is deferred to the end of the current frame so it is safe to call
   * from inside physics event callbacks or blueprint tick code. */
  despawnSpriteActor2D(actor: any): void {
    if (!actor) return;
    // Only queue actors that are actually managed at runtime
    if (!this.spriteActors.includes(actor)) return;
    this._pendingDestroy.add(actor as SpriteActor);
  }

  /** Execute all queued destructions — called once per frame after iteration completes. */
  private _flushPendingDestroys(): void {
    if (this._pendingDestroy.size === 0) return;
    for (const actor of this._pendingDestroy) {
      const idx = this.spriteActors.indexOf(actor);
      if (idx !== -1) this.spriteActors.splice(idx, 1);
      this.root2D.remove(actor.group);
      actor.dispose(this.physics2D ?? undefined);
      this._actorAnimBPStates.delete(actor);
      this._actorEventScripts.delete(actor);
      this._actorBlueprintScripts.delete(actor);
    }
    this._pendingDestroy.clear();
  }

  /** Stop 2D play mode and clean up all runtime actors */
  stopPlay(): void {
    this.isPlaying = false;
    this.physics2D?.stop();
    this.camera2D?.stopFollow();
    // Discard pending deferred destructions — stopPlay cleans everything up below
    this._pendingDestroy.clear();

    // Remove sprite actor groups from scene
    for (const actor of this.spriteActors) {
      this.root2D.remove(actor.group);
      actor.dispose(this.physics2D ?? undefined);
    }
    this.spriteActors = [];
    this._actorAnimBPStates.clear();
    this._actorEventScripts.clear();
    this._actorBlueprintScripts.clear();

    // Restore 3D GO meshes that were hidden when their 2D pawns were spawned
    for (const entry of this._hiddenGoMeshes) {
      entry.mesh.visible = entry.wasVisible;
    }
    this._hiddenGoMeshes = [];

    // Clear runtime physics bodies
    // (Physics2DWorld.stop() resets accumulator; bodies persist until cleanup)
  }

  togglePhysicsDebug(): void {
    this.debugDraw.enabled = !this.debugDraw.enabled;
    if (this.debugDraw.enabled) this.debugDraw.markDirty();
  }

  // ---- Serialization ----

  toJSON(): any {
    const tilesetArr = Array.from(this.tilesets.values());
    const tilemapArr = Array.from(this.tilemaps.values());
    console.log(`[Scene2DManager.toJSON] mode=${this.sceneMode}, tilesets=${tilesetArr.length}, tilemaps=${tilemapArr.length}`);
    for (const ts of tilesetArr) {
      console.log(`  tileset "${ts.assetName}" id=${ts.assetId} hasImage=${!!ts.image} hasDataUrl=${!!ts.imageDataUrl} dataUrlLen=${ts.imageDataUrl?.length ?? 0}`);
    }
    for (const tm of tilemapArr) {
      const totalTiles = tm.layers.reduce((sum: number, l: any) => sum + Object.keys(l.tiles).length, 0);
      console.log(`  tilemap "${tm.assetName}" id=${tm.assetId} tilesetId=${tm.tilesetId} layers=${tm.layers.length} totalTiles=${totalTiles}`);
    }
    return {
      sceneMode: this.sceneMode,
      config: this.config ? structuredClone(this.config) : null,
      spriteSheets: Array.from(this.spriteSheets.values()).map(ss => ({
        ...ss,
        image: undefined, // Don't serialize HTMLImageElement
        texture: undefined, // Don't serialize THREE.Texture
      })),
      tilesets: tilesetArr.map(ts => ({
        ...ts,
        image: undefined,
      })),
      tilemaps: tilemapArr,
    };
  }

  fromJSON(data: any): void {
    if (!data) { console.warn('[Scene2DManager.fromJSON] No data provided!'); return; }
    console.log(`[Scene2DManager.fromJSON] mode=${data.sceneMode}, tilesets=${data.tilesets?.length ?? 0}, tilemaps=${data.tilemaps?.length ?? 0}, spriteSheets=${data.spriteSheets?.length ?? 0}, hasConfig=${!!data.config}`);
    this.sceneMode = data.sceneMode ?? '3D';
    this.config = data.config ?? null;
    if (this.config?.sortingLayers) {
      this.sortingLayers.setLayers(this.config.sortingLayers);
    }

    // Clear existing data before restoring (prevents stale data from previous scene)
    this.spriteSheets.clear();
    this.tilesets.clear();
    this.tilemaps.clear();

    // Track pending image loads so we can fire a second _emit() once
    // every image is ready (renderers need the HTMLImageElement).
    let pendingImages = 0;
    const onImageReady = () => {
      pendingImages--;
      if (pendingImages === 0) {
        console.log('[Scene2DManager] All tileset/spritesheet images restored');
        this._emit(); // re-notify — renderers can now build textures
      }
    };

    // Restore sprite sheets
    if (data.spriteSheets) {
      for (const ss of data.spriteSheets) {
        this.spriteSheets.set(ss.assetId, ss);
        if (ss.imageDataUrl && !ss.image) {
          pendingImages++;
          const img = new Image();
          img.onload = () => { ss.image = img; onImageReady(); };
          img.onerror = () => { console.warn(`[Scene2DManager] Failed to load spritesheet image: ${ss.assetName}`); onImageReady(); };
          img.src = ss.imageDataUrl;
        }
      }
    }

    // Restore tilesets
    if (data.tilesets) {
      for (const ts of data.tilesets) {
        console.log(`[Scene2DManager.fromJSON]   tileset "${ts.assetName}" id=${ts.assetId} hasImage=${!!ts.image} hasDataUrl=${!!ts.imageDataUrl} dataUrlLen=${ts.imageDataUrl?.length ?? 0}`);
        // Preserve existing HTMLImageElement if we already have one in memory
        const existing = this.tilesets.get(ts.assetId);
        if (existing?.image && !ts.image) {
          ts.image = existing.image;
        }
        this.tilesets.set(ts.assetId, ts);
        // If tileset still has no image but has a persisted data URL, restore it
        if (ts.imageDataUrl && !ts.image) {
          pendingImages++;
          const img = new Image();
          img.onload = () => { console.log(`[Scene2DManager] Tileset image loaded: "${ts.assetName}"`); ts.image = img; onImageReady(); };
          img.onerror = () => { console.warn(`[Scene2DManager] Failed to load tileset image: ${ts.assetName}`); onImageReady(); };
          img.src = ts.imageDataUrl;
        }
      }
    }

    if (data.tilemaps) {
      for (const tm of data.tilemaps) {
        const totalTiles = tm.layers?.reduce((sum: number, l: any) => sum + Object.keys(l.tiles || {}).length, 0) ?? 0;
        console.log(`[Scene2DManager.fromJSON]   tilemap "${tm.assetName}" id=${tm.assetId} tilesetId=${tm.tilesetId} layers=${tm.layers?.length ?? 0} totalTiles=${totalTiles}`);
        this.tilemaps.set(tm.assetId, tm);
      }
    }

    console.log(`[Scene2DManager.fromJSON] Restore complete: ${this.tilesets.size} tilesets, ${this.tilemaps.size} tilemaps, ${pendingImages} images pending`);
    // Emit immediately so panels receive structural data (names, layers, tile records).
    // A second _emit() fires after all images finish loading.
    this._emit();
  }

  // ---- Cleanup ----

  cleanup(): void {
    this.camera2D?.dispose();
    this.camera2D = null;
    this.physics2D?.cleanup();
    this.physics2D = null;
    this.debugDraw.dispose();
    this.root2D.clear();
    this._gridGroup.clear();
    this._tileGridGroup.clear();
    this.spriteSheets.clear();
    this.tilesets.clear();
    this.tilemaps.clear();
  }

  // ---- Events ----

  onChange(cb: () => void): void { this._onChange.push(cb); }

  private _emit(): void {
    for (const cb of this._onChange) cb();
  }
}
