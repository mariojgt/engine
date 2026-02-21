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
        actor.update(deltaTime);
        // Evaluate AnimBP state machine transitions using synced variables
        this._evalAnimBPTransitions(actor);
      }
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

    go._runtimeComponents.set('CharacterMovement2D', cm2d);
    go._runtimeComponents.set('RigidBody2D', rbComp);

    this.spriteActors.push(actor);

    // ── Load sprite sheet + wire animation blueprint asynchronously ──
    // Runs after physics body is attached so the actor is already in the scene.
    (async () => {
      const actorAsset = assetManager?.getAsset?.(go.actorAssetId);
      const sprComp = actorAsset?.components?.find((c: any) => c.type === 'spriteRenderer');
      const sheetId: string | undefined = sprComp?.spriteSheetId;
      const sheet = sheetId ? this.spriteSheets.get(sheetId) : null;
      if (!sheet) return;

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

      // Resolve the entry animation from the assigned AnimBP (if any)
      const abpId: string | undefined = sprComp?.animBlueprint2dId;
      const abp = abpId
        ? (animBPManager?.assets ?? []).find((a: any) => a.id === abpId)
        : null;

      if (sheet.animations && sheet.animations.length > 0) {
        const entryState = abp?.stateMachine?.states?.find(
          (s: any) => s.id === abp.stateMachine.entryStateId,
        );
        const defaultAnim: string | undefined =
          entryState?.spriteAnimationName ?? sheet.animations[0]?.animName;
        actor.initAnimator(sheet.animations, defaultAnim);
        if (abp) {
          actor.animBlueprintId = abp.id;
          // Register actor for per-frame AnimBP state machine evaluation
          if (abp.stateMachine?.entryStateId) {
            this._actorAnimBPStates.set(actor, {
              currentStateId: abp.stateMachine.entryStateId,
              abp,
            });
          }
        }
      }
    })();

    console.log(`[Scene2DManager] Spawned 2D pawn "${go.name}" at (${spawnX.toFixed(3)}, ${spawnY.toFixed(3)}) size (${w.toFixed(2)}, ${h.toFixed(2)}) [topY=${topY?.toFixed(3) ?? 'n/a'}]`);
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
  private _evalAnimBPTransitions(actor: SpriteActor): void {
    const entry = this._actorAnimBPStates.get(actor);
    if (!entry) return;
    const { abp } = entry;
    const sm = abp?.stateMachine;
    if (!sm) return;
    const animator = actor.animator;
    if (!animator) return;
    const vars = animator.variables ?? {};

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
      const newAnimName: string | undefined = targetState.spriteAnimationName;
      if (!newAnimName) continue;

      entry.currentStateId = t.toStateId;
      animator.play(newAnimName);
      return; // fire one transition per frame
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

  /** Stop 2D play mode and clean up all runtime actors */
  stopPlay(): void {
    this.isPlaying = false;
    this.physics2D?.stop();
    this.camera2D?.stopFollow();

    // Remove sprite actor groups from scene
    for (const actor of this.spriteActors) {
      this.root2D.remove(actor.group);
      actor.dispose(this.physics2D ?? undefined);
    }
    this.spriteActors = [];
    this._actorAnimBPStates.clear();

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
