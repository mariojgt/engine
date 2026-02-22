import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Scene } from './Scene';
import type { GameObject } from './GameObject';
import type { PhysicsConfig } from '../editor/ActorAsset';
import { defaultPhysicsConfig } from '../editor/ActorAsset';
import { CollisionSystem } from './CollisionSystem';

export interface PhysicsSettings {
  gravity: { x: number; y: number; z: number };
  fixedTimestep: number;
  maxSubsteps: number;
  solverIterations: number;
  enableInterpolation: boolean;
  debugDraw: boolean;
}

function defaultPhysicsSettings(): PhysicsSettings {
  return {
    gravity: { x: 0, y: -9.81, z: 0 },
    fixedTimestep: 1 / 60,
    maxSubsteps: 4,
    solverIterations: 4,
    enableInterpolation: true,
    debugDraw: false,
  };
}

export class PhysicsWorld {
  public world: RAPIER.World | null = null;
  public isPlaying: boolean = false;
  public collision: CollisionSystem = new CollisionSystem();
  public settings: PhysicsSettings = defaultPhysicsSettings();
  private _initialized = false;

  /** Map Rapier collider handle → GameObject id (for contact/intersection queries) */
  private _colliderToGoId = new Map<number, number>();

  async init(): Promise<void> {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this._initialized = true;

    // Create ground plane collider
    const groundDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0)
      .setTranslation(0, -0.1, 0);
    this.world.createCollider(groundDesc);
  }

  addPhysicsBody(go: GameObject): void {
    if (!this.world || !this._initialized) return;

    // Remove existing if any
    this.removePhysicsBody(go);

    const cfg: PhysicsConfig = go.physicsConfig ?? defaultPhysicsConfig();
    if (!cfg.simulatePhysics) return;

    // Auto-correct: simulatePhysics implies enabled
    if (!cfg.enabled) cfg.enabled = true;

    const pos = go.mesh.position;
    const rot = go.mesh.quaternion;

    // Create rigid body desc based on configured body type
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
      .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      .setGravityScale(cfg.gravityEnabled ? cfg.gravityScale : 0)
      .setLinearDamping(cfg.linearDamping)
      .setAngularDamping(cfg.angularDamping);

    // CCD must be set on the desc BEFORE creating the rigid body
    if (cfg.ccdEnabled) {
      rbDesc.setCcdEnabled(true);
    }

    const rigidBody = this.world.createRigidBody(rbDesc);

    // Mass — Rapier sets mass via additionalMass (on top of collider density)
    rigidBody.setAdditionalMass(Math.max(0, cfg.mass - 1), true);

    // Axis constraints
    rigidBody.setEnabledTranslations(
      !cfg.lockPositionX,
      !cfg.lockPositionY,
      !cfg.lockPositionZ,
      true,
    );
    rigidBody.setEnabledRotations(
      !cfg.lockRotationX,
      !cfg.lockRotationY,
      !cfg.lockRotationZ,
      true,
    );

    // Root collider — use PhysicsConfig shape settings + bounding-box auto-fit
    const rootColDesc = this._buildColliderDesc(go, cfg);
    rootColDesc.setFriction(cfg.friction);
    rootColDesc.setRestitution(cfg.restitution);
    if (!cfg.collisionEnabled) rootColDesc.setSensor(true);
    if (cfg.isTrigger) rootColDesc.setSensor(true);
    // Apply collider offset
    if (cfg.colliderOffset) {
      rootColDesc.setTranslation(cfg.colliderOffset.x, cfg.colliderOffset.y, cfg.colliderOffset.z);
    }
    // Enable collision with ALL body types (so trigger sensors detect dynamic bodies)
    rootColDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    rootColDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = this.world.createCollider(rootColDesc, rigidBody);
    go.rigidBody = rigidBody;
    go.collider = collider;
    go.hasPhysics = true;

    // Register in collider→gameObject lookup
    this._colliderToGoId.set(collider.handle, go.id);

    // Compound colliders for child component meshes
    // Skip non-gameplay children (trigger helpers, light helpers, etc.)
    for (const child of go.mesh.children) {
      if (child.userData?.__isTriggerHelper) continue;
      if (child.userData?.__isLightHelper) continue;
      if (child.userData?.__isComponentHelper) continue;
      if (child.userData?.__lightCompName) continue;
      if (child.userData?.__isSkeletalMesh) continue;
      if (!(child as any).isMesh) continue;
      const mesh = child as THREE.Mesh;
      const childColDesc = this._colliderDescFromGeometry(mesh.geometry);
      // Offset the child collider relative to the root body
      childColDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
      if (mesh.quaternion) {
        childColDesc.setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w });
      }
      childColDesc.setFriction(cfg.friction);
      childColDesc.setRestitution(cfg.restitution);
      if (!cfg.collisionEnabled) childColDesc.setSensor(true);
      childColDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      childColDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const childCol = this.world.createCollider(childColDesc, rigidBody);
      this._colliderToGoId.set(childCol.handle, go.id);
    }
  }

  /**
   * Build a collider desc for a GameObject using its PhysicsConfig settings.
   * Handles imported meshes (THREE.Group) by computing bounding box auto-fit,
   * and respects colliderShape + manual dimension overrides.
   */
  private _buildColliderDesc(go: GameObject, cfg: PhysicsConfig): RAPIER.ColliderDesc {
    const shape = cfg.colliderShape || 'Box';

    // If shape is 'None', return a tiny sensor (no physical response)
    if (shape === 'None') {
      return RAPIER.ColliderDesc.cuboid(0.001, 0.001, 0.001).setSensor(true);
    }

    // Compute bounding box for auto-fit (works for both Mesh and Group)
    const bbox = new THREE.Box3().setFromObject(go.mesh);
    const size = bbox.getSize(new THREE.Vector3());
    // Half-extents from bounding box
    const autoHX = Math.max(size.x / 2, 0.01);
    const autoHY = Math.max(size.y / 2, 0.01);
    const autoHZ = Math.max(size.z / 2, 0.01);
    const autoRadius = Math.max(autoHX, autoHY, autoHZ);
    const autoHeight = Math.max(size.y, 0.02);

    if (cfg.autoFitCollider) {
      // Auto-fit: derive collider dimensions from the mesh bounding box
      switch (shape) {
        case 'Box':
          return RAPIER.ColliderDesc.cuboid(autoHX, autoHY, autoHZ);
        case 'Sphere':
          return RAPIER.ColliderDesc.ball(autoRadius);
        case 'Capsule':
          return RAPIER.ColliderDesc.capsule(autoHeight / 2, Math.max(autoHX, autoHZ));
        case 'Cylinder':
          return RAPIER.ColliderDesc.cylinder(autoHeight / 2, Math.max(autoHX, autoHZ));
        case 'ConvexHull':
          return this._convexHullFromObject(go.mesh) ?? RAPIER.ColliderDesc.cuboid(autoHX, autoHY, autoHZ);
        case 'Trimesh':
          return this._trimeshFromObject(go.mesh) ?? RAPIER.ColliderDesc.cuboid(autoHX, autoHY, autoHZ);
        default:
          return RAPIER.ColliderDesc.cuboid(autoHX, autoHY, autoHZ);
      }
    } else {
      // Manual dimensions from PhysicsConfig
      switch (shape) {
        case 'Box':
          return RAPIER.ColliderDesc.cuboid(cfg.boxHalfExtents.x, cfg.boxHalfExtents.y, cfg.boxHalfExtents.z);
        case 'Sphere':
          return RAPIER.ColliderDesc.ball(cfg.sphereRadius);
        case 'Capsule':
          return RAPIER.ColliderDesc.capsule(cfg.capsuleHalfHeight, cfg.capsuleRadius);
        case 'Cylinder':
          return RAPIER.ColliderDesc.cylinder(cfg.cylinderHalfHeight, cfg.cylinderRadius);
        case 'ConvexHull':
          return this._convexHullFromObject(go.mesh) ?? RAPIER.ColliderDesc.cuboid(cfg.boxHalfExtents.x, cfg.boxHalfExtents.y, cfg.boxHalfExtents.z);
        case 'Trimesh':
          return this._trimeshFromObject(go.mesh) ?? RAPIER.ColliderDesc.cuboid(cfg.boxHalfExtents.x, cfg.boxHalfExtents.y, cfg.boxHalfExtents.z);
        default:
          return RAPIER.ColliderDesc.cuboid(cfg.boxHalfExtents.x, cfg.boxHalfExtents.y, cfg.boxHalfExtents.z);
      }
    }
  }

  /** Collect all vertices from an Object3D tree into a Float32Array */
  private _collectVertices(obj: THREE.Object3D): Float32Array | null {
    const verts: number[] = [];
    obj.updateMatrixWorld(true);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const geo = mesh.geometry;
        const posAttr = geo.getAttribute('position');
        if (!posAttr) return;
        const worldMatrix = mesh.matrixWorld.clone().premultiply(
          new THREE.Matrix4().copy(obj.matrixWorld).invert()
        );
        const v = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          v.applyMatrix4(worldMatrix);
          verts.push(v.x, v.y, v.z);
        }
      }
    });
    return verts.length > 0 ? new Float32Array(verts) : null;
  }

  /** Build a convex hull collider from all meshes in an Object3D */
  private _convexHullFromObject(obj: THREE.Object3D): RAPIER.ColliderDesc | null {
    const verts = this._collectVertices(obj);
    if (!verts) return null;
    return RAPIER.ColliderDesc.convexHull(verts);
  }

  /** Build a trimesh collider from all meshes in an Object3D */
  private _trimeshFromObject(obj: THREE.Object3D): RAPIER.ColliderDesc | null {
    const allVerts: number[] = [];
    const allIndices: number[] = [];
    let vertOffset = 0;
    obj.updateMatrixWorld(true);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const geo = mesh.geometry;
        const posAttr = geo.getAttribute('position');
        if (!posAttr) return;
        const worldMatrix = mesh.matrixWorld.clone().premultiply(
          new THREE.Matrix4().copy(obj.matrixWorld).invert()
        );
        const v = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          v.applyMatrix4(worldMatrix);
          allVerts.push(v.x, v.y, v.z);
        }
        if (geo.index) {
          for (let i = 0; i < geo.index.count; i++) {
            allIndices.push(geo.index.array[i] + vertOffset);
          }
        } else {
          // Non-indexed geometry: sequential indices
          for (let i = 0; i < posAttr.count; i++) {
            allIndices.push(i + vertOffset);
          }
        }
        vertOffset += posAttr.count;
      }
    });
    if (allVerts.length === 0) return null;
    return RAPIER.ColliderDesc.trimesh(
      new Float32Array(allVerts),
      new Uint32Array(allIndices),
    );
  }

  /** Build a RAPIER.ColliderDesc from a Three.js geometry (for child component meshes) */
  private _colliderDescFromGeometry(geo: THREE.BufferGeometry): RAPIER.ColliderDesc {
    if (geo.type === 'BoxGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cuboid(
        params.width / 2,
        params.height / 2,
        params.depth / 2,
      );
    } else if (geo.type === 'SphereGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.ball(params.radius);
    } else if (geo.type === 'CylinderGeometry') {
      const params = (geo as any).parameters;
      return RAPIER.ColliderDesc.cylinder(params.height / 2, params.radiusTop);
    }
    // Fallback for BufferGeometry / unknown: compute bounding box
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const s = geo.boundingBox.getSize(new THREE.Vector3());
      return RAPIER.ColliderDesc.cuboid(
        Math.max(s.x / 2, 0.01),
        Math.max(s.y / 2, 0.01),
        Math.max(s.z / 2, 0.01),
      );
    }
    return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
  }

  removePhysicsBody(go: GameObject): void {
    if (!this.world) return;
    if (go.rigidBody) {
      this.world.removeRigidBody(go.rigidBody);
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
    }
  }

  step(scene: Scene): void {
    if (!this.world || !this.isPlaying) return;

    // Sync trigger sensor positions before the physics step
    this.collision.syncSensorPositions(scene, this);

    // Step the physics world WITH the EventQueue so Rapier feeds
    // collision/intersection events directly into it.  This is far
    // more reliable than polling intersectionPairsWith() — the
    // EventQueue hooks into the narrow-phase and catches ALL
    // events including kinematic↔kinematic sensor pairs.
    if (this.collision.eventQueue) {
      this.world.step(this.collision.eventQueue);
    } else {
      this.world.step();
    }

    // Ensure collider transforms are synchronized with their parent rigid
    // bodies after the step.  Needed for subsequent raycasts / queries.
    this.world.propagateModifiedBodyPositionsToColliders();

    // Sync physics → Three.js
    for (const go of scene.gameObjects) {
      if (go.rigidBody) {
        if (go.rigidBody.isSleeping()) continue;
        const pos = go.rigidBody.translation();
        const rot = go.rigidBody.rotation();
        go.mesh.position.set(pos.x, pos.y, pos.z);
        go.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      }
    }

    // Drain the EventQueue and dispatch overlap / hit callbacks
    this.collision.processEvents(scene, this);
  }

  play(scene: Scene): void {
    if (!this.world) return;

    // Create rigid bodies for objects whose PhysicsConfig has simulate enabled.
    // Always (re)build from current config — a body may already exist from an
    // edit-mode toggle, but its Rapier properties could be stale if the user
    // changed gravity / collision / shape *after* toggling Simulate Physics ON.
    // addPhysicsBody() calls removePhysicsBody() first, so this is safe.
    // Skip CharacterPawn and SpectatorPawn actors — they have their own controllers
    for (const go of scene.gameObjects) {
      if (go.actorType === 'characterPawn' || go.actorType === 'spectatorPawn' || go.actorType === 'characterPawn2D') continue;
      const cfg = go.physicsConfig;
      if (cfg && cfg.simulatePhysics) {
        this.addPhysicsBody(go);
      }
    }

    // Create sensor colliders for all trigger components
    this.collision.createSensors(scene, this);

    console.log(`[PhysicsWorld] play() — sensors created: ${this.collision.getSensorCount()}, world colliders: ${this.world.colliders.len()}, world bodies: ${this.world.bodies.len()}`);

    this.isPlaying = true;
  }

  /**
   * Apply a physics property change at runtime.
   * Called from PropertiesPanel when the user changes gravity, body type,
   * collider shape, or any other physics setting while the game is playing.
   * We simply rebuild the entire body from the (already-updated) PhysicsConfig
   * so all properties stay in sync.
   */
  queueChange(change: { type: string; go: GameObject; [key: string]: any }): void {
    const go = change.go;
    const cfg = go.physicsConfig;
    if (!cfg || !this.world) return;

    if (cfg.enabled && cfg.simulatePhysics) {
      // Rebuild body from scratch with the updated config
      this.addPhysicsBody(go);
    } else {
      this.removePhysicsBody(go);
    }
  }

  stop(scene: Scene): void {
    this.isPlaying = false;

    // Reset collision system
    this.collision.reset();
    this._colliderToGoId.clear();

    // Clear all physics body references from game objects
    for (const go of scene.gameObjects) {
      go.rigidBody = null;
      go.collider = null;
      go.hasPhysics = false;
      // Clean up trigger body references
      (go as any)._triggerBodies = undefined;
    }

    // Recreate a fresh physics world
    if (this.world) {
      this.world.free();
      const g = this.settings.gravity;
      this.world = new RAPIER.World({ x: g.x, y: g.y, z: g.z });

      // Recreate ground plane
      const groundDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0)
        .setTranslation(0, -0.1, 0);
      this.world.createCollider(groundDesc);
    }
  }

  /** Update the Rapier world gravity from current settings */
  setWorldGravity(g: { x: number; y: number; z: number }): void {
    this.settings.gravity = { x: g.x, y: g.y, z: g.z };
    if (this.world) {
      this.world.gravity = { x: g.x, y: g.y, z: g.z };
    }
  }
}
