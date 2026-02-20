import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Scene } from './Scene';
import type { GameObject } from './GameObject';
import type { PhysicsConfig, PhysicsBodyType, ColliderShapeType, CombineMode } from '../editor/ActorAsset';
import { defaultPhysicsConfig } from '../editor/ActorAsset';
import { CollisionSystem } from './CollisionSystem';
import type { CollisionConfig, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from './CollisionTypes';

// ─── Physics Settings ────────────────────────────────────────────
export interface PhysicsSettings {
  gravity: { x: number; y: number; z: number };
  fixedTimestep: number;   // seconds, default 1/60
  maxSubsteps: number;     // default 8
  enableInterpolation: boolean;
  /** Default solver iterations */
  solverIterations: number;
  /** Enable debug draw helpers */
  debugDraw: boolean;
}

export function defaultPhysicsSettings(): PhysicsSettings {
  return {
    gravity: { x: 0, y: -9.81, z: 0 },
    fixedTimestep: 1 / 60,
    maxSubsteps: 8,
    enableInterpolation: true,
    solverIterations: 4,
    debugDraw: false,
  };
}

// ─── Interpolation state stored per-body ─────────────────────────
interface BodyInterpolation {
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currQuat: THREE.Quaternion;
}

// ─── Deferred change queue ───────────────────────────────────────
export interface PhysicsChange {
  type: 'changeBodyType' | 'changeShape' | 'updateProperty';
  go: GameObject;
  newType?: string;
  prop?: string;
  value?: unknown;
}

// ══════════════════════════════════════════════════════════════════
//  PhysicsWorld — Rapier wrapper with fixed timestep, interpolation,
//  body-type support, hot-reload, forces, queries and more.
// ══════════════════════════════════════════════════════════════════
export class PhysicsWorld {
  public world: RAPIER.World | null = null;
  public isPlaying = false;
  public collision: CollisionSystem = new CollisionSystem();
  public settings: PhysicsSettings = defaultPhysicsSettings();

  private _initialized = false;
  private _groundCollider: RAPIER.Collider | null = null;
  private _groundHalfExtent = 100.0;

  /** Map Rapier collider handle -> GameObject id */
  private _colliderToGoId = new Map<number, number>();

  /** Interpolation state keyed by go.id */
  private _interpState = new Map<number, BodyInterpolation>();

  /** Fixed-timestep accumulator */
  private _accumulator = 0;

  /** Deferred changes applied before next step */
  private _changeQueue: PhysicsChange[] = [];

  // ────────── Lifecycle ──────────────────────────────────────────

  async init(): Promise<void> {
    await RAPIER.init();
    const g = this.settings.gravity;
    this.world = new RAPIER.World({ x: g.x, y: g.y, z: g.z });
    this._initialized = true;
    this._createGroundCollider();
  }

  /** Enable or disable the ground plane collider (called by DevGroundPlane hasCollision) */
  setGroundCollisionEnabled(enabled: boolean): void {
    if (!this.world || !this._initialized) return;
    if (enabled && !this._groundCollider) {
      this._createGroundCollider();
    } else if (!enabled && this._groundCollider) {
      this.world.removeCollider(this._groundCollider, false);
      this._groundCollider = null;
    }
  }

  /** Update the ground plane size to match a DevGroundPlane planeSize */
  setGroundPlaneSize(halfExtent: number): void {
    this._groundHalfExtent = halfExtent;
    if (this._groundCollider && this.world) {
      this.world.removeCollider(this._groundCollider, false);
      this._createGroundCollider();
    }
  }

  private _createGroundCollider(): void {
    if (!this.world) return;
    const groundDesc = RAPIER.ColliderDesc.cuboid(this._groundHalfExtent, 0.1, this._groundHalfExtent)
      .setTranslation(0, -0.1, 0);
    this._groundCollider = this.world.createCollider(groundDesc);
  }

  // ────────── Body creation / removal ────────────────────────────

  addPhysicsBody(go: GameObject): void {
    if (!this.world || !this._initialized) return;
    this.removePhysicsBody(go);

    const cfg: PhysicsConfig = go.physicsConfig ?? defaultPhysicsConfig();
    if (!cfg.enabled || !cfg.simulatePhysics) return;

    const pos = go.mesh.position;
    const quat = go.mesh.quaternion;

    // Build rigid-body desc from bodyType
    let rbDesc: RAPIER.RigidBodyDesc;
    switch (cfg.bodyType) {
      case 'Static':
        rbDesc = RAPIER.RigidBodyDesc.fixed();
        break;
      case 'Kinematic':
        rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        break;
      case 'Dynamic':
      default:
        rbDesc = RAPIER.RigidBodyDesc.dynamic();
        break;
    }

    rbDesc
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setGravityScale(cfg.gravityEnabled ? cfg.gravityScale : 0)
      .setLinearDamping(cfg.linearDamping)
      .setAngularDamping(cfg.angularDamping);

    if (cfg.ccdEnabled) rbDesc.setCcdEnabled(true);

    const rigidBody = this.world.createRigidBody(rbDesc);

    // Mass — Rapier sets mass via additionalMass (on top of collider density)
    if (cfg.bodyType === 'Dynamic') {
      rigidBody.setAdditionalMass(Math.max(0, cfg.mass - 1), true);
    }

    // Axis constraints (only meaningful on dynamic bodies)
    rigidBody.setEnabledTranslations(!cfg.lockPositionX, !cfg.lockPositionY, !cfg.lockPositionZ, true);
    rigidBody.setEnabledRotations(!cfg.lockRotationX, !cfg.lockRotationY, !cfg.lockRotationZ, true);

    // Root collider
    const rootColDesc = this._colliderDescFromConfig(cfg, go.mesh.geometry);
    if (rootColDesc) {
      // Apply collider offset
      if (cfg.colliderOffset) {
        rootColDesc.setTranslation(cfg.colliderOffset.x, cfg.colliderOffset.y, cfg.colliderOffset.z);
      }
      rootColDesc.setFriction(cfg.friction);
      rootColDesc.setRestitution(cfg.restitution);
      rootColDesc.setFrictionCombineRule(this._combineModeToRapier(cfg.frictionCombine));
      rootColDesc.setRestitutionCombineRule(this._combineModeToRapier(cfg.restitutionCombine));
      if (cfg.isTrigger || !cfg.collisionEnabled) rootColDesc.setSensor(true);
      rootColDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      rootColDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const collider = this.world.createCollider(rootColDesc, rigidBody);
      go.collider = collider;
      this._colliderToGoId.set(collider.handle, go.id);
    }

    go.rigidBody = rigidBody;
    go.hasPhysics = true;

    // Initialise interpolation state
    this._interpState.set(go.id, {
      prevPos: pos.clone(),
      currPos: pos.clone(),
      prevQuat: quat.clone(),
      currQuat: quat.clone(),
    });

    // Compound colliders for child component meshes
    this._addChildColliders(go, rigidBody, cfg);
  }

  /** Traverse child meshes and add compound colliders */
  private _addChildColliders(go: GameObject, rigidBody: RAPIER.RigidBody, cfg: PhysicsConfig): void {
    if (!this.world) return;
    for (const child of go.mesh.children) {
      if (child.userData?.__isTriggerHelper) continue;
      if (child.userData?.__isLightHelper) continue;
      if (child.userData?.__isComponentHelper) continue;
      if (child.userData?.__lightCompName) continue;
      if (child.userData?.__isSkeletalMesh) continue;

      if (child.userData?.__isStaticMesh) {
        this._addStaticMeshColliders(child as THREE.Group, rigidBody, go.id, cfg);
        continue;
      }

      if (!(child as any).isMesh) continue;
      const mesh = child as THREE.Mesh;
      const childColDesc = this._colliderDescFromGeometry(mesh.geometry);
      childColDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
      if (mesh.quaternion) {
        childColDesc.setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w });
      }
      childColDesc.setFriction(cfg.friction);
      childColDesc.setRestitution(cfg.restitution);
      if (cfg.isTrigger || !cfg.collisionEnabled) childColDesc.setSensor(true);
      childColDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      childColDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const childCol = this.world.createCollider(childColDesc, rigidBody);
      this._colliderToGoId.set(childCol.handle, go.id);
    }
  }

  removePhysicsBody(go: GameObject): void {
    if (!this.world) return;
    if (go.rigidBody) {
      this.world.removeRigidBody(go.rigidBody);
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
      this._interpState.delete(go.id);
    }
  }

  // ────────── Collider creation helpers ──────────────────────────

  /** Build ColliderDesc from PhysicsConfig shape settings, with autoFit fallback */
  private _colliderDescFromConfig(cfg: PhysicsConfig, geo: THREE.BufferGeometry): RAPIER.ColliderDesc | null {
    const shape: ColliderShapeType = cfg.colliderShape ?? 'Box';
    if (shape === 'None') return null;

    if (!cfg.autoFitCollider) {
      // Use manual dimensions
      switch (shape) {
        case 'Box':
          return RAPIER.ColliderDesc.cuboid(
            cfg.boxHalfExtents?.x ?? 0.5,
            cfg.boxHalfExtents?.y ?? 0.5,
            cfg.boxHalfExtents?.z ?? 0.5,
          );
        case 'Sphere':
          return RAPIER.ColliderDesc.ball(cfg.sphereRadius ?? 0.5);
        case 'Capsule':
          return RAPIER.ColliderDesc.capsule(cfg.capsuleHalfHeight ?? 0.5, cfg.capsuleRadius ?? 0.25);
        case 'Cylinder':
          return RAPIER.ColliderDesc.cylinder(cfg.cylinderHalfHeight ?? 0.5, cfg.cylinderRadius ?? 0.25);
        case 'ConvexHull':
        case 'Trimesh':
          return this._meshShapeFromGeometry(geo, shape);
        default:
          return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
      }
    }

    // Auto-fit: derive from geometry
    return this._colliderDescFromGeometry(geo);
  }

  /** Build a convex hull or trimesh collider from BufferGeometry */
  private _meshShapeFromGeometry(geo: THREE.BufferGeometry, shape: 'ConvexHull' | 'Trimesh'): RAPIER.ColliderDesc {
    if (geo.isBufferGeometry && geo.attributes?.position) {
      const posAttr = geo.attributes.position;
      const verts = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        verts[i * 3] = posAttr.getX(i);
        verts[i * 3 + 1] = posAttr.getY(i);
        verts[i * 3 + 2] = posAttr.getZ(i);
      }
      if (shape === 'ConvexHull' && verts.length >= 9) {
        const desc = RAPIER.ColliderDesc.convexHull(verts);
        if (desc) return desc;
      }
      if (shape === 'Trimesh') {
        const idx = geo.index;
        if (idx) {
          const indices = new Uint32Array(idx.count);
          for (let i = 0; i < idx.count; i++) indices[i] = idx.getX(i);
          return RAPIER.ColliderDesc.trimesh(verts, indices);
        }
        // No index — generate trivial index
        const trivIdx = new Uint32Array(posAttr.count);
        for (let i = 0; i < posAttr.count; i++) trivIdx[i] = i;
        return RAPIER.ColliderDesc.trimesh(verts, trivIdx);
      }
    }
    // Fallback
    return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
  }

  /** Build a ColliderDesc from a Three.js geometry (auto-fit) */
  private _colliderDescFromGeometry(geo: THREE.BufferGeometry): RAPIER.ColliderDesc {
    if (geo.type === 'BoxGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cuboid(params.width / 2, params.height / 2, params.depth / 2);
    } else if (geo.type === 'SphereGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.ball(params.radius);
    } else if (geo.type === 'CylinderGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cylinder(params.height / 2, params.radiusTop);
    }
    // For imported mesh geometry — compute bounding box and use cuboid
    if (geo.isBufferGeometry && geo.attributes?.position) {
      geo.computeBoundingBox();
      if (geo.boundingBox) {
        const size = new THREE.Vector3();
        geo.boundingBox.getSize(size);
        if (size.x > 0.001 && size.y > 0.001 && size.z > 0.001) {
          return RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        }
      }
    }
    return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
  }

  /** Map CombineMode string to Rapier CoefficientCombineRule */
  private _combineModeToRapier(mode: CombineMode | undefined): RAPIER.CoefficientCombineRule {
    switch (mode) {
      case 'Min':      return RAPIER.CoefficientCombineRule.Min;
      case 'Max':      return RAPIER.CoefficientCombineRule.Max;
      case 'Multiply': return RAPIER.CoefficientCombineRule.Multiply;
      case 'Average':
      default:         return RAPIER.CoefficientCombineRule.Average;
    }
  }

  /**
   * Create compound colliders for a static mesh component Group.
   * Reads per-component collision config to determine shape, dimensions, etc.
   */
  private _addStaticMeshColliders(
    group: THREE.Group,
    rigidBody: RAPIER.RigidBody,
    goId: number,
    cfg: PhysicsConfig,
  ): void {
    if (!this.world) return;

    const compCollision: CollisionConfig | null = group.userData.__compCollision || null;
    const compPhysics: PhysicsConfig | null = group.userData.__compPhysics || null;

    if (compCollision && !compCollision.enabled) return;
    if (compCollision && compCollision.collisionMode === 'none') return;

    const friction = compPhysics?.friction ?? cfg.friction;
    const restitution = compPhysics?.restitution ?? cfg.restitution;
    const collisionEnabled = compCollision ? compCollision.enabled : cfg.collisionEnabled;
    const isSensor = compCollision
      ? compCollision.collisionMode === 'trigger'
      : (!collisionEnabled || cfg.isTrigger);

    const groupPos = group.position;
    const groupQuat = group.quaternion;

    // If per-component collision config specifies a simple shape, use it directly
    if (compCollision && (compCollision.shape === 'box' || compCollision.shape === 'sphere' || compCollision.shape === 'capsule')) {
      let colDesc: RAPIER.ColliderDesc | null = null;
      const dim = compCollision.dimensions;

      if (compCollision.shape === 'box') {
        const d = dim as BoxShapeDimensions;
        colDesc = RAPIER.ColliderDesc.cuboid(d.width / 2, d.height / 2, d.depth / 2);
      } else if (compCollision.shape === 'sphere') {
        const d = dim as SphereShapeDimensions;
        colDesc = RAPIER.ColliderDesc.ball(d.radius);
      } else if (compCollision.shape === 'capsule') {
        const d = dim as CapsuleShapeDimensions;
        colDesc = RAPIER.ColliderDesc.capsule(d.height / 2, d.radius);
      }

      if (colDesc) {
        const colOff = compCollision.offset ?? { x: 0, y: 0, z: 0 };
        const colRot = compCollision.rotationOffset ?? { x: 0, y: 0, z: 0 };
        const toRad = (d: number) => (d * Math.PI) / 180;
        const offsetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(toRad(colRot.x), toRad(colRot.y), toRad(colRot.z)),
        );
        const finalQuat = groupQuat.clone().multiply(offsetQuat);
        colDesc.setTranslation(groupPos.x + colOff.x, groupPos.y + colOff.y, groupPos.z + colOff.z);
        colDesc.setRotation({ x: finalQuat.x, y: finalQuat.y, z: finalQuat.z, w: finalQuat.w });
        colDesc.setFriction(friction);
        colDesc.setRestitution(restitution);
        if (isSensor) colDesc.setSensor(true);
        colDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
        colDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        const col = this.world.createCollider(colDesc, rigidBody);
        this._colliderToGoId.set(col.handle, goId);
      }
      return;
    }

    // Pre-generated collision data from MeshAsset
    const collisionData = group.userData.__collisionData;
    if (collisionData && collisionData.hulls && collisionData.hulls.length > 0) {
      for (const hull of collisionData.hulls) {
        let colDesc: RAPIER.ColliderDesc | null = null;
        if (hull.type === 'box' && hull.halfExtents) {
          colDesc = RAPIER.ColliderDesc.cuboid(hull.halfExtents.x, hull.halfExtents.y, hull.halfExtents.z);
        } else if (hull.type === 'sphere' && hull.radius != null) {
          colDesc = RAPIER.ColliderDesc.ball(hull.radius);
        } else if (hull.type === 'capsule' && hull.radius != null && hull.height != null) {
          colDesc = RAPIER.ColliderDesc.capsule(hull.height / 2, hull.radius);
        } else if ((hull.type === 'convexHull' || hull.type === 'autoConvex') && hull.vertices.length >= 9) {
          const verts = new Float32Array(hull.vertices);
          const desc = RAPIER.ColliderDesc.convexHull(verts);
          if (desc) colDesc = desc;
        }
        if (!colDesc && hull.halfExtents) {
          colDesc = RAPIER.ColliderDesc.cuboid(hull.halfExtents.x, hull.halfExtents.y, hull.halfExtents.z);
        }
        if (colDesc) {
          const cx = groupPos.x + (hull.center?.x ?? 0);
          const cy = groupPos.y + (hull.center?.y ?? 0);
          const cz = groupPos.z + (hull.center?.z ?? 0);
          colDesc.setTranslation(cx, cy, cz);
          colDesc.setRotation({ x: groupQuat.x, y: groupQuat.y, z: groupQuat.z, w: groupQuat.w });
          colDesc.setFriction(friction);
          colDesc.setRestitution(restitution);
          if (isSensor) colDesc.setSensor(true);
          colDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
          colDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const col = this.world.createCollider(colDesc, rigidBody);
          this._colliderToGoId.set(col.handle, goId);
        }
      }
      return;
    }

    // Fallback: traverse sub-meshes and create bounding-box colliders
    group.traverse((child) => {
      if (!(child as any).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) return;
      const colDesc = this._colliderDescFromGeometry(mesh.geometry);
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const rootInv = new THREE.Matrix4();
      if (group.parent) {
        rootInv.copy(group.parent.matrixWorld).invert();
        worldPos.applyMatrix4(rootInv);
      }
      const worldQuat = new THREE.Quaternion();
      mesh.getWorldQuaternion(worldQuat);
      colDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z);
      colDesc.setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
      colDesc.setFriction(friction);
      colDesc.setRestitution(restitution);
      if (isSensor) colDesc.setSensor(true);
      colDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      colDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = this.world!.createCollider(colDesc, rigidBody);
      this._colliderToGoId.set(col.handle, goId);
    });
  }

  // ────────── Change queue (hot-reload from Properties panel) ────

  queueChange(change: PhysicsChange): void {
    this._changeQueue.push(change);
  }

  private _applyPendingChanges(scene: Scene): void {
    while (this._changeQueue.length > 0) {
      const c = this._changeQueue.shift()!;
      switch (c.type) {
        case 'changeBodyType':
          this._changeBodyType(c.go, (c.newType as PhysicsBodyType) ?? 'Dynamic');
          break;
        case 'changeShape':
          // Rebuild the body entirely to pick up new shape
          this.removePhysicsBody(c.go);
          this.addPhysicsBody(c.go);
          break;
        case 'updateProperty':
          this._applyPropertyChange(c.go, c.prop as string, c.value);
          break;
      }
    }
  }

  private _changeBodyType(go: GameObject, newType: PhysicsBodyType): void {
    if (!go.rigidBody || !this.world) return;
    switch (newType) {
      case 'Static':
        go.rigidBody.setBodyType(RAPIER.RigidBodyType.Fixed, true);
        break;
      case 'Kinematic':
        go.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        break;
      case 'Dynamic':
      default:
        go.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        break;
    }
    if (go.physicsConfig) go.physicsConfig.bodyType = newType;
  }

  private _applyPropertyChange(go: GameObject, prop: string, value: unknown): void {
    if (!go.rigidBody) return;
    const cfg = go.physicsConfig;
    if (!cfg) return;

    switch (prop) {
      case 'mass':
        go.rigidBody.setAdditionalMass(Math.max(0, (value as number) - 1), true);
        break;
      case 'linearDamping':
        go.rigidBody.setLinearDamping(value as number);
        break;
      case 'angularDamping':
        go.rigidBody.setAngularDamping(value as number);
        break;
      case 'gravityEnabled':
        go.rigidBody.setGravityScale(value ? cfg.gravityScale : 0, true);
        break;
      case 'gravityScale':
        if (cfg.gravityEnabled) go.rigidBody.setGravityScale(value as number, true);
        break;
      case 'friction':
        if (go.collider) go.collider.setFriction(value as number);
        break;
      case 'restitution':
        if (go.collider) go.collider.setRestitution(value as number);
        break;
      case 'ccdEnabled':
        go.rigidBody.enableCcd(!!value);
        break;
      case 'lockPositionX': case 'lockPositionY': case 'lockPositionZ':
        go.rigidBody.setEnabledTranslations(!cfg.lockPositionX, !cfg.lockPositionY, !cfg.lockPositionZ, true);
        break;
      case 'lockRotationX': case 'lockRotationY': case 'lockRotationZ':
        go.rigidBody.setEnabledRotations(!cfg.lockRotationX, !cfg.lockRotationY, !cfg.lockRotationZ, true);
        break;
      case 'collisionEnabled':
        if (go.collider) go.collider.setSensor(!(value as boolean));
        break;
      case 'isTrigger':
        if (go.collider) go.collider.setSensor(!!(value as boolean));
        break;
    }
  }

  // ────────── Step (fixed timestep + interpolation) ──────────────

  step(scene: Scene, dt?: number): void {
    if (!this.world || !this.isPlaying) return;

    // Apply deferred property changes
    this._applyPendingChanges(scene);

    // Sync trigger sensor positions
    this.collision.syncSensorPositions(scene, this);

    const fixedDt = this.settings.fixedTimestep;
    const maxSub = this.settings.maxSubsteps;
    
    // Clamp dt to avoid spiral of death (e.g. max 0.1s)
    const useDt = Math.min(dt ?? fixedDt, 0.1);

    this._accumulator += useDt;

    let substeps = 0;
    while (this._accumulator >= fixedDt && substeps < maxSub) {
      // Save previous positions for interpolation
      if (this.settings.enableInterpolation) {
        for (const go of scene.gameObjects) {
          if (!go.rigidBody) continue;
          const interp = this._interpState.get(go.id);
          if (interp) {
            interp.prevPos.copy(interp.currPos);
            interp.prevQuat.copy(interp.currQuat);
          }
        }
      }

      // Step world
      if (this.collision.eventQueue) {
        this.world.step(this.collision.eventQueue);
      } else {
        this.world.step();
      }

      // Read back current positions
      for (const go of scene.gameObjects) {
        if (!go.rigidBody) continue;
        const p = go.rigidBody.translation();
        const r = go.rigidBody.rotation();
        const interp = this._interpState.get(go.id);
        if (interp) {
          interp.currPos.set(p.x, p.y, p.z);
          interp.currQuat.set(r.x, r.y, r.z, r.w);
        }
      }

      this._accumulator -= fixedDt;
      substeps++;
    }

    // If we hit maxSubsteps, we are lagging hard. Discard the remaining accumulator to prevent permanent desync.
    if (substeps >= maxSub) {
      this._accumulator = 0;
    }

    // Ensure collider transforms are propagated
    this.world.propagateModifiedBodyPositionsToColliders();

    // Interpolate or snap mesh positions
    const alpha = this.settings.enableInterpolation
      ? Math.min(this._accumulator / fixedDt, 1)
      : 1;

    for (const go of scene.gameObjects) {
      if (!go.rigidBody) continue;
      const interp = this._interpState.get(go.id);
      if (interp && this.settings.enableInterpolation && alpha < 1) {
        go.mesh.position.lerpVectors(interp.prevPos, interp.currPos, alpha);
        go.mesh.quaternion.slerpQuaternions(interp.prevQuat, interp.currQuat, alpha);
      } else if (interp) {
        go.mesh.position.copy(interp.currPos);
        go.mesh.quaternion.copy(interp.currQuat);
      } else {
        const p = go.rigidBody.translation();
        const r = go.rigidBody.rotation();
        go.mesh.position.set(p.x, p.y, p.z);
        go.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }

    // Drain EventQueue and dispatch overlap / hit callbacks
    this.collision.processEvents(scene, this);
  }

  // ────────── Play / Stop ────────────────────────────────────────

  play(scene: Scene): void {
    if (!this.world) return;
    this._accumulator = 0;
    this._interpState.clear();
    this._changeQueue.length = 0;

    // Apply world gravity
    const g = this.settings.gravity;
    this.world.gravity = { x: g.x, y: g.y, z: g.z };

    // Create rigid bodies for eligible objects
    for (const go of scene.gameObjects) {
      if (go.actorType === 'characterPawn' || go.actorType === 'spectatorPawn') continue;
      const cfg = go.physicsConfig;
      if (cfg && cfg.enabled && cfg.simulatePhysics && !go.rigidBody) {
        this.addPhysicsBody(go);
      }
    }

    this.collision.createSensors(scene, this);

    console.log(
      `[PhysicsWorld] play() — sensors: ${this.collision.getSensorCount()}, ` +
      `colliders: ${this.world.colliders.len()}, bodies: ${this.world.bodies.len()}`,
    );

    this.isPlaying = true;
  }

  stop(scene: Scene): void {
    this.isPlaying = false;
    this._accumulator = 0;
    this._interpState.clear();
    this._changeQueue.length = 0;

    this.collision.reset();
    this._colliderToGoId.clear();

    for (const go of scene.gameObjects) {
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
      (go as any)._triggerBodies = undefined;
    }

    if (this.world) {
      this.world.free();
      const g = this.settings.gravity;
      this.world = new RAPIER.World({ x: g.x, y: g.y, z: g.z });
      this._groundCollider = null;
      this._createGroundCollider();
    }
  }

  // ────────── Force / Impulse / Torque helpers ───────────────────

  addForce(go: GameObject, force: { x: number; y: number; z: number }, accelChange = false): void {
    if (!go.rigidBody) return;
    if (accelChange) {
      const m = go.rigidBody.mass();
      go.rigidBody.addForce({ x: force.x * m, y: force.y * m, z: force.z * m }, true);
    } else {
      go.rigidBody.addForce(force, true);
    }
  }

  addForceAtLocation(
    go: GameObject,
    force: { x: number; y: number; z: number },
    point: { x: number; y: number; z: number },
  ): void {
    if (!go.rigidBody) return;
    go.rigidBody.addForceAtPoint(force, point, true);
  }

  addTorque(go: GameObject, torque: { x: number; y: number; z: number }): void {
    if (!go.rigidBody) return;
    go.rigidBody.addTorque(torque, true);
  }

  addImpulse(go: GameObject, impulse: { x: number; y: number; z: number }, velChange = false): void {
    if (!go.rigidBody) return;
    if (velChange) {
      // Apply directly as velocity change (ignore mass)
      const lv = go.rigidBody.linvel();
      go.rigidBody.setLinvel({ x: lv.x + impulse.x, y: lv.y + impulse.y, z: lv.z + impulse.z }, true);
    } else {
      go.rigidBody.applyImpulse(impulse, true);
    }
  }

  addImpulseAtLocation(
    go: GameObject,
    impulse: { x: number; y: number; z: number },
    point: { x: number; y: number; z: number },
  ): void {
    if (!go.rigidBody) return;
    go.rigidBody.applyImpulseAtPoint(impulse, point, true);
  }

  addAngularImpulse(go: GameObject, impulse: { x: number; y: number; z: number }, accelChange = false): void {
    if (!go.rigidBody) return;
    if (accelChange) {
      // Scale by inertia (approximate: use mass)
      const m = go.rigidBody.mass();
      go.rigidBody.applyTorqueImpulse({ x: impulse.x * m, y: impulse.y * m, z: impulse.z * m }, true);
    } else {
      go.rigidBody.applyTorqueImpulse(impulse, true);
    }
  }

  addRadialForce(
    origin: { x: number; y: number; z: number },
    radius: number,
    strength: number,
    falloff: string,
    scene: Scene,
  ): void {
    if (!this.world) return;
    for (const go of scene.gameObjects) {
      if (!go.rigidBody) continue;
      const p = go.rigidBody.translation();
      const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius || dist < 0.001) continue;
      const factor = falloff === 'Linear' ? 1 - dist / radius : 1;
      const s = strength * factor / dist;
      go.rigidBody.addForce({ x: dx * s, y: dy * s, z: dz * s }, true);
    }
  }

  addRadialImpulse(
    origin: { x: number; y: number; z: number },
    radius: number,
    strength: number,
    falloff: string,
    velChange: boolean,
    scene: Scene,
  ): void {
    if (!this.world) return;
    for (const go of scene.gameObjects) {
      if (!go.rigidBody) continue;
      const p = go.rigidBody.translation();
      const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius || dist < 0.001) continue;
      const factor = falloff === 'Linear' ? 1 - dist / radius : 1;
      const s = strength * factor / dist;
      const imp = { x: dx * s, y: dy * s, z: dz * s };
      if (velChange) {
        const lv = go.rigidBody.linvel();
        go.rigidBody.setLinvel({ x: lv.x + imp.x, y: lv.y + imp.y, z: lv.z + imp.z }, true);
      } else {
        go.rigidBody.applyImpulse(imp, true);
      }
    }
  }

  // ────────── Velocity get/set ───────────────────────────────────

  getLinearVelocity(go: GameObject): { x: number; y: number; z: number } {
    if (!go.rigidBody) return { x: 0, y: 0, z: 0 };
    const v = go.rigidBody.linvel();
    return { x: v.x, y: v.y, z: v.z };
  }

  setLinearVelocity(go: GameObject, vel: { x: number; y: number; z: number }): void {
    if (!go.rigidBody) return;
    go.rigidBody.setLinvel(vel, true);
  }

  getAngularVelocity(go: GameObject): { x: number; y: number; z: number } {
    if (!go.rigidBody) return { x: 0, y: 0, z: 0 };
    const v = go.rigidBody.angvel();
    return { x: v.x, y: v.y, z: v.z };
  }

  setAngularVelocity(go: GameObject, vel: { x: number; y: number; z: number }): void {
    if (!go.rigidBody) return;
    go.rigidBody.setAngvel(vel, true);
  }

  getVelocityAtPoint(go: GameObject, point: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    if (!go.rigidBody) return { x: 0, y: 0, z: 0 };
    const v = go.rigidBody.velocityAtPoint(point);
    return { x: v.x, y: v.y, z: v.z };
  }

  getSpeed(go: GameObject): number {
    if (!go.rigidBody) return 0;
    const v = go.rigidBody.linvel();
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  // ────────── Mass helpers ───────────────────────────────────────

  getMass(go: GameObject): number {
    return go.rigidBody?.mass() ?? 0;
  }

  setMass(go: GameObject, mass: number): void {
    if (!go.rigidBody) return;
    go.rigidBody.setAdditionalMass(Math.max(0, mass - 1), true);
    if (go.physicsConfig) go.physicsConfig.mass = mass;
  }

  getCenterOfMass(go: GameObject): { x: number; y: number; z: number } {
    if (!go.rigidBody) return { x: 0, y: 0, z: 0 };
    const c = go.rigidBody.centerOfMass();
    return { x: c.x, y: c.y, z: c.z };
  }

  // ────────── Sleep / Wake ───────────────────────────────────────

  wakeBody(go: GameObject): void {
    go.rigidBody?.wakeUp();
  }

  sleepBody(go: GameObject): void {
    go.rigidBody?.sleep();
  }

  isBodySleeping(go: GameObject): boolean {
    return go.rigidBody?.isSleeping() ?? false;
  }

  // ────────── Teleport / Transform ───────────────────────────────

  setPhysicsTransform(
    go: GameObject,
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number } | null,
    teleport: boolean,
  ): void {
    if (!go.rigidBody) return;
    go.rigidBody.setTranslation(pos, true);

    if (rot) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          rot.x * Math.PI / 180,
          rot.y * Math.PI / 180,
          rot.z * Math.PI / 180,
        ),
      );
      go.rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    }

    if (teleport) {
      // Reset velocities and interpolation
      go.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      go.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const interp = this._interpState.get(go.id);
      if (interp) {
        interp.prevPos.set(pos.x, pos.y, pos.z);
        interp.currPos.set(pos.x, pos.y, pos.z);
        if (rot) {
          const q2 = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rot.x * Math.PI / 180, rot.y * Math.PI / 180, rot.z * Math.PI / 180),
          );
          interp.prevQuat.copy(q2);
          interp.currQuat.copy(q2);
        }
      }
    }
  }

  // ────────── World gravity ──────────────────────────────────────

  getWorldGravity(): { x: number; y: number; z: number } {
    if (!this.world) return { x: 0, y: -9.81, z: 0 };
    const g = this.world.gravity;
    return { x: g.x, y: g.y, z: g.z };
  }

  setWorldGravity(g: { x: number; y: number; z: number }): void {
    if (!this.world) return;
    this.world.gravity = { x: g.x, y: g.y, z: g.z };
    this.settings.gravity = { ...g };
  }

  // ────────── Raycasting / Queries ───────────────────────────────

  /** Single raycast — returns first hit { objectId, hitX,hitY,hitZ, normalX,normalY,normalZ, distance } or null */
  castRay(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDist: number,
    scene: Scene,
  ): { objectId: number; hitX: number; hitY: number; hitZ: number; normalX: number; normalY: number; normalZ: number; distance: number } | null {
    if (!this.world) return null;
    const ray = new RAPIER.Ray(origin, direction);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return null;
    const hitPoint = ray.pointAt(hit.timeOfImpact);
    const goId = this._colliderToGoId.get(hit.collider.handle) ?? -1;
    return {
      objectId: goId,
      hitX: hitPoint.x, hitY: hitPoint.y, hitZ: hitPoint.z,
      normalX: hit.normal.x, normalY: hit.normal.y, normalZ: hit.normal.z,
      distance: hit.timeOfImpact,
    };
  }

  /** Multi raycast — returns all hits sorted by distance */
  castRayMulti(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDist: number,
    scene: Scene,
  ): Array<{ objectId: number; hitX: number; hitY: number; hitZ: number; distance: number }> {
    if (!this.world) return [];
    const ray = new RAPIER.Ray(origin, direction);
    const results: Array<{ objectId: number; hitX: number; hitY: number; hitZ: number; distance: number }> = [];
    this.world.intersectionsWithRay(ray, maxDist, true, (hit) => {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      const goId = this._colliderToGoId.get(hit.collider.handle) ?? -1;
      results.push({
        objectId: goId,
        hitX: hitPoint.x, hitY: hitPoint.y, hitZ: hitPoint.z,
        distance: hit.timeOfImpact,
      });
      return true; // continue
    });
    return results.sort((a, b) => a.distance - b.distance);
  }

  /** Shape cast (sphere or box) — returns first hit or null */
  castShape(
    type: string,
    params: any,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDist: number,
    scene: Scene,
  ): { objectId: number; hitX: number; hitY: number; hitZ: number; normalX: number; normalY: number; normalZ: number; distance: number } | null {
    if (!this.world) return null;
    let shape: RAPIER.Shape;
    if (type === 'sphere') {
      shape = new RAPIER.Ball(params.radius ?? 0.5);
    } else if (type === 'box') {
      const he = params.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
      shape = new RAPIER.Cuboid(he.x, he.y, he.z);
    } else {
      return null;
    }
    const shapePos = origin;
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };
    const shapeVel = direction;
    const hit = this.world.castShape(shapePos, shapeRot, shapeVel, shape, 0, maxDist, true);
    if (!hit) return null;
    const goId = this._colliderToGoId.get(hit.collider.handle) ?? -1;
    const toi = hit.time_of_impact;
    return {
      objectId: goId,
      hitX: origin.x + direction.x * toi,
      hitY: origin.y + direction.y * toi,
      hitZ: origin.z + direction.z * toi,
      normalX: hit.normal1?.x ?? 0,
      normalY: hit.normal1?.y ?? 0,
      normalZ: hit.normal1?.z ?? 0,
      distance: toi,
    };
  }

  /** Overlap sphere — returns list of game object IDs whose colliders overlap the sphere */
  overlapSphere(
    center: { x: number; y: number; z: number },
    radius: number,
  ): number[] {
    if (!this.world) return [];
    const shape = new RAPIER.Ball(radius);
    const shapePos = center;
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };
    const ids: number[] = [];
    this.world.intersectionsWithShape(shapePos, shapeRot, shape, (collider) => {
      const goId = this._colliderToGoId.get(collider.handle);
      if (goId !== undefined && !ids.includes(goId)) ids.push(goId);
      return true;
    });
    return ids;
  }

  /** Overlap box — returns list of game object IDs */
  overlapBox(
    center: { x: number; y: number; z: number },
    halfExtents: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
  ): number[] {
    if (!this.world) return [];
    const shape = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        rotation.x * Math.PI / 180,
        rotation.y * Math.PI / 180,
        rotation.z * Math.PI / 180,
      ),
    );
    const ids: number[] = [];
    this.world.intersectionsWithShape(center, { x: q.x, y: q.y, z: q.z, w: q.w }, shape, (collider) => {
      const goId = this._colliderToGoId.get(collider.handle);
      if (goId !== undefined && !ids.includes(goId)) ids.push(goId);
      return true;
    });
    return ids;
  }

  /** Check if a point is inside a game object's collider */
  pointIsInside(
    point: { x: number; y: number; z: number },
    go: GameObject,
  ): boolean {
    if (!go.collider) return false;
    return go.collider.containsPoint(point);
  }

  // ────────── Collider→GO lookup (used by CollisionSystem) ──────

  getGameObjectIdForCollider(handle: number): number | undefined {
    return this._colliderToGoId.get(handle);
  }
}
