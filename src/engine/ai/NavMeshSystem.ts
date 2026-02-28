// ============================================================
//  NavMeshSystem — Production-grade Navigation Mesh
//  Uses recast-navigation (WebAssembly port of Recast/Detour)
//  for industry-standard pathfinding in both 2D and 3D.
//
//  Features:
//  - Generate NavMesh from Three.js scene geometry
//  - NavMeshQuery for pathfinding (computePath)
//  - Crowd simulation with Detour Crowd (addAgent / requestMoveTarget)
//  - Dynamic obstacles (box / cylinder)
//  - Debug visualization (NavMeshHelper, CrowdHelper)
//  - Export / Import NavMesh for save/load
//  - Configurable generation parameters (UE-style)
//
//  UE parity:
//  - NavMeshBoundsVolume → collectSceneGeometry()
//  - RecastNavMesh → generateNavMesh()
//  - NavMeshQuery → findPath() / findClosestPoint()
//  - Crowd → addAgent() / requestMoveTarget() / update()
//  - NavModifier → addObstacle() / removeObstacle()
// ============================================================

import * as THREE from 'three';
import {
  init as initRecast,
  NavMesh,
  NavMeshQuery,
  Crowd,
  CrowdAgent,
  exportNavMesh,
  importNavMesh,
  type NavMeshQueryParams,
} from '@recast-navigation/core';
import {
  threeToSoloNavMesh,
  threeToTiledNavMesh,
  threeToTileCache,
  NavMeshHelper,
  CrowdHelper,
} from '@recast-navigation/three';
import type {
  GenerateSoloNavMeshResult,
  TileCacheGeneratorResult,
} from '@recast-navigation/generators';

// ── NavMesh Generation Config ────────────────────────────────

/** UE-style NavMesh generation parameters */
export interface NavMeshConfig {
  // ── Cell / Voxelization ──
  /** XZ-plane cell size (lower = more detail, slower) */
  cellSize: number;
  /** Y-axis cell height */
  cellHeight: number;

  // ── Agent ──
  /** Agent capsule height */
  agentHeight: number;
  /** Agent capsule radius */
  agentRadius: number;
  /** Maximum climbable step height */
  agentMaxClimb: number;
  /** Maximum walkable slope in degrees */
  agentMaxSlope: number;

  // ── Region ──
  /** Minimum region area (filters noise) */
  regionMinSize: number;
  /** Region merge threshold */
  regionMergeSize: number;

  // ── Detail ──
  /** Edge max length */
  edgeMaxLen: number;
  /** Edge max error */
  edgeMaxError: number;
  /** Detail sample distance */
  detailSampleDist: number;
  /** Detail sample max error */
  detailSampleMaxError: number;

  // ── Tile ──
  /** Tile size (0 = solo/non-tiled) */
  tileSize: number;

  // ── Bounds (optional, empty = use entire scene) ──
  boundsMin?: { x: number; y: number; z: number };
  boundsMax?: { x: number; y: number; z: number };
}

/** Default NavMesh config comparable to UE5 RecastNavMesh defaults */
export function defaultNavMeshConfig(): NavMeshConfig {
  return {
    cellSize: 0.3,
    cellHeight: 0.2,
    agentHeight: 2.0,
    agentRadius: 0.6,
    agentMaxClimb: 0.9,
    agentMaxSlope: 45,
    regionMinSize: 8,
    regionMergeSize: 20,
    edgeMaxLen: 12,
    edgeMaxError: 1.3,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    tileSize: 0,
  };
}

// ── Crowd Agent Config ───────────────────────────────────────

export interface NavMeshAgentConfig {
  /** Agent radius */
  radius: number;
  /** Agent height */
  height: number;
  /** Maximum speed */
  maxSpeed: number;
  /** Maximum acceleration */
  maxAcceleration: number;
  /** Separation weight (0 = no separation) */
  separationWeight: number;
  /** Path optimization range */
  pathOptimizationRange: number;
}

export function defaultNavMeshAgentConfig(): NavMeshAgentConfig {
  return {
    radius: 0.6,
    height: 2.0,
    maxSpeed: 3.5,
    maxAcceleration: 8.0,
    separationWeight: 2.0,
    pathOptimizationRange: 30.0,
  };
}

// ── Obstacle ────────────────────────────────────────────────

export interface NavMeshObstacle {
  id: string;
  type: 'box' | 'cylinder';
  position: THREE.Vector3;
  // Box: halfExtents; Cylinder: radius + height
  halfExtents?: THREE.Vector3;
  radius?: number;
  height?: number;
  /** Internal TileCache obstacle reference */
  _ref?: any;
}

// ── NavMesh System ──────────────────────────────────────────

export class NavMeshSystem {
  // ── State ──
  private _initialized = false;
  private _navMesh: NavMesh | null = null;
  private _navMeshQuery: NavMeshQuery | null = null;
  private _crowd: Crowd | null = null;
  private _tileCache: any = null; // TileCache for dynamic obstacles

  // ── Config ──
  public config: NavMeshConfig;

  // ── Debug visualization ──
  private _debugHelper: THREE.Object3D | null = null;
  private _crowdHelper: THREE.Object3D | null = null;
  private _debugScene: THREE.Scene | null = null;
  public debugVisible = false;

  // ── Agents ──
  private _agents: Map<string, CrowdAgent> = new Map();
  private _agentGameObjects: Map<string, any> = new Map(); // agentId → GameObject

  // ── Obstacles ──
  private _obstacles: Map<string, NavMeshObstacle> = new Map();

  // ── 2D Mode ──
  /** When true, NavMesh operates in 2D (XY plane mapped to XZ for Recast) */
  public is2D = false;

  constructor(config?: NavMeshConfig) {
    this.config = config ?? defaultNavMeshConfig();
  }

  // ──────────────────────────────────────────────────────────
  //  Initialization
  // ──────────────────────────────────────────────────────────

  /** Initialize the WASM recast-navigation module */
  async init(): Promise<void> {
    if (this._initialized) return;
    await initRecast();
    this._initialized = true;
    console.log('[NavMesh] Recast WASM initialized');
  }

  get isReady(): boolean {
    return this._initialized && this._navMesh !== null;
  }

  get navMesh(): NavMesh | null {
    return this._navMesh;
  }

  // ──────────────────────────────────────────────────────────
  //  Geometry Collection
  // ──────────────────────────────────────────────────────────

  /**
   * Collect walkable geometry from a Three.js scene.
   * Filters to meshes with geometry (ignores sprites, helpers, lines, etc.)
   * Optionally limited to a bounding box (NavMeshBoundsVolume).
   */
  collectSceneGeometry(
    scene: THREE.Scene,
    boundsMin?: THREE.Vector3,
    boundsMax?: THREE.Vector3,
    excludeNames?: Set<string>,
  ): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const box = boundsMin && boundsMax ? new THREE.Box3(boundsMin, boundsMax) : null;

    scene.traverse((obj: any) => {
      // Must be a mesh with geometry
      if (!obj.isMesh) return;
      if (!obj.geometry) return;

      // ── Allow-list: certain objects are explicitly valid walkable geometry ──
      const isExplicitlyWalkable = obj.userData?.__isDevGroundPlane === true;

      // ── Walk the entire parent chain checking for exclusion flags ──
      let current = obj;
      let shouldSkip = false;
      while (current) {
        // Skip invisible branches entirely
        if (current.visible === false) {
          shouldSkip = true;
          break;
        }

        if (current.userData) {
          // Skip all known editor / debug / helper flags
          if (
            current.userData.__navmeshHelper ||
            current.userData.__crowdHelper ||
            current.userData.__gizmo ||
            current.userData.__transformControl ||
            current.userData.__isViewportHelper ||
            current.userData.__isTransformPivot ||
            current.userData.__isTriggerHelper ||
            current.userData.__isLightHelper ||
            current.userData.__isCollisionHelper ||
            current.userData.__lightIcon ||
            current.userData.__lightRange ||
            current.userData.__cameraIcon ||
            current.userData.isGizmo
          ) {
            shouldSkip = true;
            break;
          }

          // Scene composition helpers (grid, axes, sky, fog vol, post-process, etc.)
          // BUT allow explicitly walkable geometry like the DevGroundPlane through
          if (current.userData.__isSceneCompositionHelper && !isExplicitlyWalkable) {
            shouldSkip = true;
            break;
          }
        }

        // Skip by explicit name exclusion set
        if (excludeNames && excludeNames.has(current.name)) {
          shouldSkip = true;
          break;
        }

        // Catch Three.js built-in helpers / controls by type string
        const cType = (current as any).type;
        if (
          cType === 'TransformControlsGizmo' ||
          cType === 'TransformControlsPlane' ||
          cType === 'GridHelper' ||
          cType === 'AxesHelper' ||
          cType === 'ArrowHelper' ||
          cType === 'BoxHelper' ||
          cType === 'DirectionalLightHelper' ||
          cType === 'SpotLightHelper' ||
          cType === 'PointLightHelper'
        ) {
          shouldSkip = true;
          break;
        }

        current = current.parent;
      }

      if (shouldSkip) return;

      // Optional bounding box filter
      if (box) {
        if (!obj.geometry.boundingBox) {
          obj.geometry.computeBoundingBox();
        }
        if (obj.geometry.boundingBox) {
          const objBox = new THREE.Box3().copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          if (!box.intersectsBox(objBox)) return;
        } else {
          // Fallback to center point if bounding box can't be computed
          const worldPos = new THREE.Vector3();
          obj.getWorldPosition(worldPos);
          if (!box.containsPoint(worldPos)) return;
        }
      }

      meshes.push(obj);
    });

    return meshes;
  }

  // ──────────────────────────────────────────────────────────
  //  NavMesh Generation
  // ──────────────────────────────────────────────────────────

  /**
   * Generate a NavMesh from the given Three.js scene.
   * Collects geometry and builds the navigation mesh.
   *
   * @param scene The Three.js scene to build from
   * @param config Optional override config
   * @returns true if generation succeeded
   */
  async generateFromScene(scene: THREE.Scene, config?: Partial<NavMeshConfig>): Promise<boolean> {
    if (!this._initialized) {
      await this.init();
    }

    scene.updateMatrixWorld(true);

    const cfg = { ...this.config, ...config };

    // If no bounds provided, auto-detect from scene geometry to prevent
    // Recast from trying to voxelize an enormous area (e.g. 1000×1000 plane)
    let boundsMin: THREE.Vector3 | undefined;
    let boundsMax: THREE.Vector3 | undefined;

    if (cfg.boundsMin && cfg.boundsMax) {
      boundsMin = new THREE.Vector3(cfg.boundsMin.x, cfg.boundsMin.y, cfg.boundsMin.z);
      boundsMax = new THREE.Vector3(cfg.boundsMax.x, cfg.boundsMax.y, cfg.boundsMax.z);
    } else {
      // Auto-detect bounds from properly filtered walkable meshes only
      const walkable = this.collectSceneGeometry(scene);
      if (walkable.length > 0) {
        const autoBox = new THREE.Box3();
        const tmpBox = new THREE.Box3();
        for (const mesh of walkable) {
          mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingBox) {
            tmpBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
            autoBox.union(tmpBox);
          }
        }
        boundsMin = autoBox.min.clone();
        boundsMax = autoBox.max.clone();
        console.log(`[NavMesh] Auto-detected bounds: (${boundsMin.x.toFixed(1)}, ${boundsMin.y.toFixed(1)}, ${boundsMin.z.toFixed(1)}) → (${boundsMax.x.toFixed(1)}, ${boundsMax.y.toFixed(1)}, ${boundsMax.z.toFixed(1)})`);
      }
    }

    // ── Safety clamp: prevent Recast WASM from allocating absurd heightfields ──
    // With cellSize 0.2 a 1000-unit span is 5000 cells/axis → ~25M cells, safe.
    // Anything beyond that risks WASM OOM.
    const MAX_NAVMESH_EXTENT = 500;
    if (boundsMin && boundsMax) {
      boundsMin.x = Math.max(boundsMin.x, -MAX_NAVMESH_EXTENT);
      boundsMin.y = Math.max(boundsMin.y, -MAX_NAVMESH_EXTENT);
      boundsMin.z = Math.max(boundsMin.z, -MAX_NAVMESH_EXTENT);
      boundsMax.x = Math.min(boundsMax.x, MAX_NAVMESH_EXTENT);
      boundsMax.y = Math.min(boundsMax.y, MAX_NAVMESH_EXTENT);
      boundsMax.z = Math.min(boundsMax.z, MAX_NAVMESH_EXTENT);
    }

    const meshes = this.collectSceneGeometry(scene, boundsMin, boundsMax);

    if (meshes.length === 0) {
      console.warn('[NavMesh] No walkable geometry found in scene');
      return false;
    }

    console.log(`[NavMesh] Generating from ${meshes.length} meshes: ${meshes.map(m => m.name || '<unnamed>').join(', ')}`);

    // Build the recast config object
    const recastConfig: any = {
      cs: cfg.cellSize,
      ch: cfg.cellHeight,
      walkableHeight: Math.ceil(cfg.agentHeight / cfg.cellHeight),
      walkableClimb: Math.ceil(cfg.agentMaxClimb / cfg.cellHeight),
      walkableRadius: Math.ceil(cfg.agentRadius / cfg.cellSize),
      walkableSlopeAngle: cfg.agentMaxSlope,
      minRegionArea: cfg.regionMinSize,
      mergeRegionArea: cfg.regionMergeSize,
      maxEdgeLen: cfg.edgeMaxLen,
      maxSimplificationError: cfg.edgeMaxError,
      detailSampleDist: cfg.detailSampleDist,
      detailSampleMaxError: cfg.detailSampleMaxError,
      tileSize: cfg.tileSize,
    };

    if (boundsMin && boundsMax) {
        // Essential FIX for flat surfaces (e.g. perfectly flat dev ground planes).
        // Recast voxelizer fails/ignores bounds if the Y extent is exactly 0.
        // We enforce a minimum height so flat floors always process properly.
        if (Math.abs(boundsMax.y - boundsMin.y) < 1) {
          boundsMin.y -= 1;
          boundsMax.y += 1;
        }

        recastConfig.bounds = [
          [boundsMin.x, boundsMin.y, boundsMin.z],
          [boundsMax.x, boundsMax.y, boundsMax.z]
        ];
      }

    // Clean up any existing navmesh
    this._destroyNavMesh();

    try {
      if (cfg.tileSize > 0) {
        // Use TileCache for dynamic obstacles support
        const result = threeToTileCache(meshes, { ...recastConfig, tileSize: cfg.tileSize, expectedLayersPerTile: 4, maxObstacles: 128 });
        if (!result.success || !result.navMesh) {
          console.error('[NavMesh] TileCache generation failed:', result);
          return false;
        }
        this._navMesh = result.navMesh;
        this._tileCache = result.tileCache;
      } else {
        // Use solo (non-tiled) navmesh — simpler and faster for small scenes
        const result = threeToSoloNavMesh(meshes, recastConfig);
        if (!result.success || !result.navMesh) {
          console.error('[NavMesh] Solo generation failed:', result);
          return false;
        }
        this._navMesh = result.navMesh;
        this._tileCache = null;
      }

      // Create NavMeshQuery for pathfinding
      this._navMeshQuery = new NavMeshQuery(this._navMesh!);

      // Create Crowd for agent management
      this._crowd = new Crowd(this._navMesh!, {
        maxAgents: 128,
        maxAgentRadius: cfg.agentRadius * 2,
      });

      this._debugScene = scene;
      this.config = cfg;

      console.log('[NavMesh] Generation successful');
      return true;
    } catch (err) {
      console.error('[NavMesh] Generation error:', err);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  Pathfinding
  // ──────────────────────────────────────────────────────────

  /**
   * Compute a path from start to end position.
   * Returns array of waypoints (THREE.Vector3), or null if no path found.
   */
  findPath(
    start: THREE.Vector3,
    end: THREE.Vector3,
    halfExtents?: THREE.Vector3,
  ): THREE.Vector3[] | null {
    if (!this._navMeshQuery) return null;

    const extents = halfExtents ?? new THREE.Vector3(2, 4, 2);

    // Find closest points on navmesh
    const startResult = this._navMeshQuery.findClosestPoint(
      { x: start.x, y: start.y, z: start.z },
      { halfExtents: { x: extents.x, y: extents.y, z: extents.z } },
    );
    const endResult = this._navMeshQuery.findClosestPoint(
      { x: end.x, y: end.y, z: end.z },
      { halfExtents: { x: extents.x, y: extents.y, z: extents.z } },
    );

    if (!startResult.success || !endResult.success) return null;

    // Compute path
    const pathResult = this._navMeshQuery.computePath(
      startResult.point,
      endResult.point,
    );

    if (!pathResult.success || pathResult.path.length === 0) return null;

    // Convert to THREE.Vector3 array
    return pathResult.path.map(
      (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z)
    );
  }

  /**
   * Find the closest point on the NavMesh to a given position.
   */
  findClosestPoint(
    position: THREE.Vector3,
    halfExtents?: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (!this._navMeshQuery) return null;
    const ext = halfExtents ?? new THREE.Vector3(2, 4, 2);
    const result = this._navMeshQuery.findClosestPoint(
      { x: position.x, y: position.y, z: position.z },
      { halfExtents: { x: ext.x, y: ext.y, z: ext.z } },
    );
    if (!result.success) return null;
    return new THREE.Vector3(result.point.x, result.point.y, result.point.z);
  }

  /**
   * Find a random navigable point around a given position.
   */
  findRandomPoint(
    center: THREE.Vector3,
    radius: number,
  ): THREE.Vector3 | null {
    if (!this._navMeshQuery) return null;
    const result = this._navMeshQuery.findRandomPointAroundCircle(
      { x: center.x, y: center.y, z: center.z },
      radius,
      { halfExtents: { x: 500, y: 500, z: 500 } }
    );
    if (!result.success) return null;
    return new THREE.Vector3(result.randomPoint.x, result.randomPoint.y, result.randomPoint.z);
  }

  // ──────────────────────────────────────────────────────────
  //  Crowd Agent Management
  // ──────────────────────────────────────────────────────────

  /**
   * Add an agent to the crowd at the given position.
   * Returns agent ID string for future reference.
   */
  addAgent(
    id: string,
    position: THREE.Vector3,
    gameObject?: any,
    config?: Partial<NavMeshAgentConfig>,
  ): CrowdAgent | null {
    if (!this._crowd) return null;

    const agentConfig = { ...defaultNavMeshAgentConfig(), ...config };

    const agent = this._crowd.addAgent(
      { x: position.x, y: position.y, z: position.z },
      {
        radius: agentConfig.radius,
        height: agentConfig.height,
        maxSpeed: agentConfig.maxSpeed,
        maxAcceleration: agentConfig.maxAcceleration,
        separationWeight: agentConfig.separationWeight,
        pathOptimizationRange: agentConfig.pathOptimizationRange,
      },
    );

    this._agents.set(id, agent);
    if (gameObject) {
      this._agentGameObjects.set(id, gameObject);
    }

    return agent;
  }

  /**
   * Remove an agent from the crowd.
   */
  removeAgent(id: string): void {
    const agent = this._agents.get(id);
    if (agent && this._crowd) {
      this._crowd.removeAgent(agent);
    }
    this._agents.delete(id);
    this._agentGameObjects.delete(id);
  }

  /**
   * Request an agent to move to a target position.
   * The Detour Crowd will handle pathfinding and steering automatically.
   */
  requestMoveTarget(id: string, target: THREE.Vector3): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    agent.requestMoveTarget({ x: target.x, y: target.y, z: target.z });
    return true;
  }

  /**
   * Request an agent to move in a given velocity direction.
   */
  requestMoveVelocity(id: string, velocity: THREE.Vector3): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    agent.requestMoveVelocity({ x: velocity.x, y: velocity.y, z: velocity.z });
    return true;
  }

  /**
   * Reset an agent's move target (stop moving).
   */
  resetMoveTarget(id: string): boolean {
    const agent = this._agents.get(id);
    if (!agent) return false;
    agent.resetMoveTarget();
    return true;
  }

  /**
   * Get an agent's current position as reported by the crowd.
   */
  getAgentPosition(id: string): THREE.Vector3 | null {
    const agent = this._agents.get(id);
    if (!agent) return null;
    const pos = agent.position();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  /**
   * Get an agent's current velocity.
   */
  getAgentVelocity(id: string): THREE.Vector3 | null {
    const agent = this._agents.get(id);
    if (!agent) return null;
    const vel = agent.velocity();
    return new THREE.Vector3(vel.x, vel.y, vel.z);
  }

  /**
   * Check if an agent has reached its target (velocity near zero).
   */
  hasAgentReachedTarget(id: string, threshold: number = 0.1): boolean {
    const vel = this.getAgentVelocity(id);
    if (!vel) return true;
    return vel.lengthSq() < threshold * threshold;
  }

  /**
   * Get the CrowdAgent directly for advanced usage.
   */
  getAgent(id: string): CrowdAgent | null {
    return this._agents.get(id) ?? null;
  }

  // ──────────────────────────────────────────────────────────
  //  Dynamic Obstacles (requires TileCache)
  // ──────────────────────────────────────────────────────────

  /**
   * Add a box obstacle. Requires NavMesh to be generated with tileSize > 0.
   */
  addBoxObstacle(
    id: string,
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
  ): boolean {
    if (!this._tileCache) {
      console.warn('[NavMesh] Dynamic obstacles require tileSize > 0');
      return false;
    }

    const ref = this._tileCache.addBoxObstacle(
      { x: position.x, y: position.y, z: position.z },
      { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z },
      0, // angle
    );

    this._obstacles.set(id, {
      id,
      type: 'box',
      position: new THREE.Vector3(position.x, position.y, position.z),
      halfExtents: new THREE.Vector3(halfExtents.x, halfExtents.y, halfExtents.z),
      _ref: ref,
    });

    // Update tileCache
    this._tileCache.update(this._navMesh);
    return true;
  }

  /**
   * Add a cylinder obstacle. Requires NavMesh to be generated with tileSize > 0.
   */
  addCylinderObstacle(
    id: string,
    position: THREE.Vector3,
    radius: number,
    height: number,
  ): boolean {
    if (!this._tileCache) {
      console.warn('[NavMesh] Dynamic obstacles require tileSize > 0');
      return false;
    }

    const ref = this._tileCache.addCylinderObstacle(
      { x: position.x, y: position.y, z: position.z },
      radius,
      height,
    );

    this._obstacles.set(id, {
      id,
      type: 'cylinder',
      position: new THREE.Vector3(position.x, position.y, position.z),
      radius,
      height,
      _ref: ref,
    });

    // Update tileCache
    this._tileCache.update(this._navMesh);
    return true;
  }

  /**
   * Remove a dynamic obstacle.
   */
  removeObstacle(id: string): boolean {
    const obs = this._obstacles.get(id);
    if (!obs || !this._tileCache || !obs._ref) return false;

    this._tileCache.removeObstacle(obs._ref);
    this._obstacles.delete(id);

    // Update tileCache
    this._tileCache.update(this._navMesh);
    return true;
  }

  // ──────────────────────────────────────────────────────────
  //  Per-Frame Update
  // ──────────────────────────────────────────────────────────

  /**
   * Update the crowd simulation. Call each frame during play mode.
   * Also syncs agent positions to their associated GameObjects.
   */
  update(dt: number): void {
    if (!this._crowd) return;

    // Tick crowd
    this._crowd.update(dt);

    // Sync agent positions to game objects
    for (const [id, agent] of this._agents) {
      const go = this._agentGameObjects.get(id);
      if (!go || !go.mesh) continue;

      const pos = agent.position();
      const vel = agent.velocity();

      if (this.is2D) {
        // 2D mode: NavMesh XZ → engine XY
        const nx = pos.x;
        const ny = pos.z; // Z in recast → Y in 2D
        go.mesh.position.x = nx;
        go.mesh.position.y = ny;
        // Also sync group + transform2D for SpriteActor compatibility
        if (go.group) {
          go.group.position.x = nx;
          go.group.position.y = ny;
          go.group.position.z = 0;
        }
        if (go.transform2D) {
          go.transform2D.position.x = nx;
          go.transform2D.position.y = ny;
        }
      } else {
        // 3D mode: direct mapping
        go.mesh.position.x = pos.x;
        go.mesh.position.y = pos.y;
        go.mesh.position.z = pos.z;

        // Rotate agent to face movement direction
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (speed > 0.1) {
          const targetYaw = Math.atan2(vel.x, vel.z);
          go.mesh.rotation.y = targetYaw;
        }
      }
    }

    // Update debug helpers if visible
    if (this.debugVisible && this._crowdHelper) {
      // CrowdHelper auto-updates from crowd reference
    }
  }

  // ──────────────────────────────────────────────────────────
  //  Debug Visualization
  // ──────────────────────────────────────────────────────────

  /**
   * Show debug visualization of the NavMesh on the scene.
   */
  showDebug(scene: THREE.Scene): void {
    this.hideDebug();

    if (!this._navMesh) return;

    // NavMesh wireframe
    const helper = new NavMeshHelper(this._navMesh, {
      navMeshMaterial: new THREE.MeshBasicMaterial({
        color: 0x00cc00,
        transparent: true,
        opacity: 0.35,
        wireframe: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    });
    (helper as any).userData = { __navmeshHelper: true };
    scene.add(helper);
    this._debugHelper = helper;

    // Crowd agents visualization
    if (this._crowd && this._agents.size > 0) {
      const crowdHelper = new CrowdHelper(this._crowd, {
        agentMaterial: new THREE.MeshBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 0.6,
        }),
      });
      (crowdHelper as any).userData = { __crowdHelper: true };
      scene.add(crowdHelper);
      this._crowdHelper = crowdHelper;
    }

    this._debugScene = scene;
    this.debugVisible = true;
  }

  /**
   * Hide debug visualization.
   */
  hideDebug(): void {
    if (this._debugHelper && this._debugScene) {
      this._debugScene.remove(this._debugHelper);
      // Dispose geometry and materials
      this._debugHelper.traverse((child) => {
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) {
          const mat = (child as any).material;
          if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
          else mat.dispose();
        }
      });
    }
    if (this._crowdHelper && this._debugScene) {
      this._debugScene.remove(this._crowdHelper);
      this._crowdHelper.traverse((child) => {
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) {
          const mat = (child as any).material;
          if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
          else mat.dispose();
        }
      });
    }
    this._debugHelper = null;
    this._crowdHelper = null;
    this.debugVisible = false;
  }

  toggleDebug(scene: THREE.Scene): void {
    if (this.debugVisible) {
      this.hideDebug();
    } else {
      this.showDebug(scene);
    }
  }

  /**
   * Show debug visualization rotated for 2D scenes.
   * The NavMesh is internally on XZ but 2D uses XY, so we rotate
   * the helper group by -90° around X to lay it on the XY plane.
   */
  showDebug2D(scene: THREE.Scene): void {
    this.hideDebug();
    if (!this._navMesh) return;

    // Wrap everything in a group so we can rotate it to XY
    const group = new THREE.Group();
    group.name = '__navmesh_debug_2d__';
    group.rotation.x = -Math.PI / 2;  // XZ → XY

    const helper = new NavMeshHelper(this._navMesh, {
      navMeshMaterial: new THREE.MeshBasicMaterial({
        color: 0x00cc00,
        transparent: true,
        opacity: 0.35,
        wireframe: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    });

    group.add(helper);

    if (this._crowd && this._agents.size > 0) {
      const crowdHelper = new CrowdHelper(this._crowd, {
        agentMaterial: new THREE.MeshBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 0.6,
        }),
      });
      group.add(crowdHelper);
      this._crowdHelper = crowdHelper;
    }

    (group as any).userData = { __navmeshHelper: true };
    scene.add(group);
    this._debugHelper = group;
    this._debugScene = scene;
    this.debugVisible = true;
  }

  toggleDebug2D(scene: THREE.Scene): void {
    if (this.debugVisible) {
      this.hideDebug();
    } else {
      this.showDebug2D(scene);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  Export / Import (Serialization)
  // ──────────────────────────────────────────────────────────

  /**
   * Export the current NavMesh to a Uint8Array for saving.
   */
  exportNavMesh(): Uint8Array | null {
    if (!this._navMesh) return null;
    return exportNavMesh(this._navMesh);
  }

  /**
   * Import a NavMesh from a previously exported Uint8Array.
   */
  async importNavMeshData(data: Uint8Array): Promise<boolean> {
    if (!this._initialized) {
      await this.init();
    }

    this._destroyNavMesh();

    try {
      const result = importNavMesh(data);
      if (!result.navMesh) return false;

      this._navMesh = result.navMesh;
      this._navMeshQuery = new NavMeshQuery(this._navMesh);
      this._crowd = new Crowd(this._navMesh, {
        maxAgents: 128,
        maxAgentRadius: this.config.agentRadius * 2,
      });

      console.log('[NavMesh] Import successful');
      return true;
    } catch (err) {
      console.error('[NavMesh] Import error:', err);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  2D Support
  // ──────────────────────────────────────────────────────────

  /**
   * Generate NavMesh for a 2D scene.
   * 2D scenes use XY coordinates; we create a thin 3D floor mesh
   * from the 2D walkable area (tilemap or bounds) and generate
   * a NavMesh on the XZ plane. Agent positions are then mapped
   * XZ → XY at runtime.
   */
  async generateFrom2DBounds(
    boundsMin: { x: number; y: number },
    boundsMax: { x: number; y: number },
    obstacles?: Array<{ min: { x: number; y: number }; max: { x: number; y: number } }>,
    config?: Partial<NavMeshConfig>,
  ): Promise<boolean> {
    if (!this._initialized) {
      await this.init();
    }

    this.is2D = true;

    // Create a floor plane on XZ from 2D XY bounds
    const width = boundsMax.x - boundsMin.x;
    const depth = boundsMax.y - boundsMin.y;
    const centerX = (boundsMin.x + boundsMax.x) / 2;
    const centerZ = (boundsMin.y + boundsMax.y) / 2;

    // Create a temporary scene with floor + obstacle geometry
    const tempScene = new THREE.Scene();

    // Floor
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    floorGeo.rotateX(-Math.PI / 2); // XY → XZ
    const floorMat = new THREE.MeshBasicMaterial();
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(centerX, 0, centerZ);
    tempScene.add(floor);

    // Add obstacle boxes (carved out of walkable area)
    if (obstacles) {
      for (const obs of obstacles) {
        const w = obs.max.x - obs.min.x;
        const d = obs.max.y - obs.min.y;
        const cx = (obs.min.x + obs.max.x) / 2;
        const cz = (obs.min.y + obs.max.y) / 2;
        const boxGeo = new THREE.BoxGeometry(w, 4, d); // tall enough to block
        const boxMat = new THREE.MeshBasicMaterial();
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(cx, 2, cz);
        tempScene.add(box);
      }
    }

    const result = await this.generateFromScene(tempScene, config);

    // Dispose temp geometry
    tempScene.traverse((obj) => {
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) (obj as any).material.dispose();
    });

    return result;
  }

  /**
   * Convert 2D position (x, y) → NavMesh position (x, 0, y)
   */
  to3DPosition(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x, 0, y);
  }

  /**
   * Convert NavMesh position (x, y, z) → 2D position (x, z)
   */
  to2DPosition(pos: THREE.Vector3): { x: number; y: number } {
    return { x: pos.x, y: pos.z };
  }

  // ──────────────────────────────────────────────────────────
  //  Cleanup
  // ──────────────────────────────────────────────────────────

  private _destroyNavMesh(): void {
    this.hideDebug();

    if (this._crowd) {
      // Remove all agents
      for (const [id, agent] of this._agents) {
        try { this._crowd.removeAgent(agent); } catch (_e) {}
      }
      this._crowd.destroy();
      this._crowd = null;
    }

    if (this._navMeshQuery) {
      this._navMeshQuery.destroy();
      this._navMeshQuery = null;
    }

    if (this._tileCache) {
      this._tileCache.destroy();
      this._tileCache = null;
    }

    if (this._navMesh) {
      this._navMesh.destroy();
      this._navMesh = null;
    }

    this._agents.clear();
    this._agentGameObjects.clear();
    this._obstacles.clear();
  }

  /**
   * Full cleanup — call when play mode ends.
   */
  destroy(): void {
    this._destroyNavMesh();
    this._initialized = false;
    console.log('[NavMesh] System destroyed');
  }
}
