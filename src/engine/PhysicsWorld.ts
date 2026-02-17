import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Scene } from './Scene';
import type { GameObject } from './GameObject';
import type { PhysicsConfig } from '../editor/ActorAsset';
import { defaultPhysicsConfig } from '../editor/ActorAsset';
import { CollisionSystem } from './CollisionSystem';
import type { CollisionConfig, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from './CollisionTypes';

export class PhysicsWorld {
  public world: RAPIER.World | null = null;
  public isPlaying: boolean = false;
  public collision: CollisionSystem = new CollisionSystem();
  private _initialized = false;
  private _groundCollider: RAPIER.Collider | null = null;
  private _groundHalfExtent = 100.0;

  /** Map Rapier collider handle → GameObject id (for contact/intersection queries) */
  private _colliderToGoId = new Map<number, number>();

  async init(): Promise<void> {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    this._initialized = true;

    // Create ground plane collider (matches DevGroundPlane default size)
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
    // Only recreate if currently exists
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

  addPhysicsBody(go: GameObject): void {
    if (!this.world || !this._initialized) return;

    // Remove existing if any
    this.removePhysicsBody(go);

    const cfg: PhysicsConfig = go.physicsConfig ?? defaultPhysicsConfig();
    if (!cfg.enabled || !cfg.simulatePhysics) return;

    const pos = go.mesh.position;
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setGravityScale(cfg.gravityEnabled ? cfg.gravityScale : 0)
      .setLinearDamping(cfg.linearDamping)
      .setAngularDamping(cfg.angularDamping);

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

    // Root collider
    const rootColDesc = this._colliderDescFromGeometry(go.mesh.geometry);
    rootColDesc.setFriction(cfg.friction);
    rootColDesc.setRestitution(cfg.restitution);
    if (!cfg.collisionEnabled) rootColDesc.setSensor(true);
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

      // Handle static mesh component Groups — use collision data or traverse sub-meshes
      if (child.userData?.__isStaticMesh) {
        this._addStaticMeshColliders(child as THREE.Group, rigidBody, go.id, cfg);
        continue;
      }

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

  /** Build a RAPIER.ColliderDesc from a Three.js geometry */
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

    // For imported mesh BufferGeometry — compute bounding box and use a cuboid
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

  /**
   * Create compound colliders for a static mesh component Group.
   * Reads per-component collision config (__compCollision) to determine
   * shape, dimensions, enabled state, and mode.
   * Falls back to MeshAsset collision data or bounding-box sub-mesh colliders.
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

    // Per-component collision disabled → skip entirely
    if (compCollision && !compCollision.enabled) return;
    if (compCollision && compCollision.collisionMode === 'none') return;

    // Resolve physics material properties: prefer per-component, fall back to root cfg
    const friction = compPhysics?.friction ?? cfg.friction;
    const restitution = compPhysics?.restitution ?? cfg.restitution;
    const collisionEnabled = compCollision ? compCollision.enabled : cfg.collisionEnabled;
    const isSensor = compCollision
      ? compCollision.collisionMode === 'trigger'
      : !collisionEnabled;

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
        // Apply collision offset on top of the component group position
        const colOff = compCollision.offset ?? { x: 0, y: 0, z: 0 };
        const colRot = compCollision.rotationOffset ?? { x: 0, y: 0, z: 0 };
        const toRad = (d: number) => (d * Math.PI) / 180;
        const offsetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(toRad(colRot.x), toRad(colRot.y), toRad(colRot.z)),
        );
        const finalQuat = groupQuat.clone().multiply(offsetQuat);
        colDesc.setTranslation(
          groupPos.x + colOff.x,
          groupPos.y + colOff.y,
          groupPos.z + colOff.z,
        );
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

    // Otherwise use pre-generated collision data from the MeshAsset
    const collisionData = group.userData.__collisionData;

    if (collisionData && collisionData.hulls && collisionData.hulls.length > 0) {
      for (const hull of collisionData.hulls) {
        let colDesc: RAPIER.ColliderDesc | null = null;

        if (hull.type === 'box' && hull.halfExtents) {
          colDesc = RAPIER.ColliderDesc.cuboid(
            hull.halfExtents.x, hull.halfExtents.y, hull.halfExtents.z,
          );
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
          colDesc = RAPIER.ColliderDesc.cuboid(
            hull.halfExtents.x, hull.halfExtents.y, hull.halfExtents.z,
          );
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

    // Create rigid bodies for objects whose PhysicsConfig has simulate enabled
    // Skip CharacterPawn and SpectatorPawn actors — they have their own controllers
    for (const go of scene.gameObjects) {
      if (go.actorType === 'characterPawn' || go.actorType === 'spectatorPawn') continue;
      const cfg = go.physicsConfig;
      if (cfg && cfg.enabled && cfg.simulatePhysics && !go.rigidBody) {
        this.addPhysicsBody(go);
      }
    }

    // Create sensor colliders for all trigger components
    this.collision.createSensors(scene, this);

    console.log(`[PhysicsWorld] play() — sensors created: ${this.collision.getSensorCount()}, world colliders: ${this.world.colliders.len()}, world bodies: ${this.world.bodies.len()}`);

    this.isPlaying = true;
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
      const gravity = { x: 0.0, y: -9.81, z: 0.0 };
      this.world = new RAPIER.World(gravity);
      this._groundCollider = null;

      // Recreate ground plane (matches DevGroundPlane default size)
      this._createGroundCollider();
    }
  }
}
