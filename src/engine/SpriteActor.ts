// ============================================================
//  SpriteActor — 2D actor wrapper around THREE.Mesh sprite
//  with SpriteRenderer, Physics 2D body, and sorting layer.
// ============================================================

import * as THREE from 'three';
import { SpriteRenderer, SpriteAnimator, type SpriteSheetAsset, type SpriteAnimationDef } from './SpriteRenderer';
import { SortingLayerManager } from './SortingLayers';
import type { Physics2DWorld, BodyEntry2D } from './Physics2DWorld';
import type { CharacterMovement2D } from './CharacterMovement2D';
import type { Transform, Vector3Like } from './Transform';

export interface SpriteActorConfig {
  name: string;
  /** Sprite sheet asset for this actor */
  spriteSheetId?: string;
  /** Default sprite name within the sheet */
  defaultSprite?: string;
  /** Sorting layer name */
  sortingLayer?: string;
  /** Order within the sorting layer */
  orderInLayer?: number;
  /** Position in world space */
  position?: { x: number; y: number };
  /** Scale (uniform or per-axis) */
  scale?: { x: number; y: number };
  /** Rotation in degrees */
  rotation?: number;
  /** Physics body type (null = no physics) */
  physicsBodyType?: 'dynamic' | 'static' | 'kinematic' | null;
  /** Collider shape */
  colliderShape?: 'box' | 'circle' | 'capsule';
  colliderSize?: { width: number; height: number };
  colliderRadius?: number;
  /** Is trigger (sensor) */
  isTrigger?: boolean;
  /** Name of this collider component (used as selfComponentName in trigger/collision events) */
  componentName?: string;
  /**
   * Additional colliders to attach to the same rigid body.
   * Allows one actor to have both a solid collider AND a trigger on the same body
   * (e.g. BoxCollider2D for collision + a larger sensor zone for OnTriggerBegin).
   */
  additionalColliders?: Array<{
    shape: 'box' | 'circle' | 'capsule';
    size?: { width: number; height: number };
    radius?: number;
    isTrigger: boolean;
    name?: string;
  }>;
  /** Enable continuous collision detection (prevents tunneling) */
  ccdEnabled?: boolean;
  /** Lock rotation */
  freezeRotation?: boolean;
  /** Gravity scale (0 = no gravity, 1 = normal, 2 = double) */
  gravityScale?: number;
  /** Linear velocity damping */
  linearDamping?: number;
  /** Angular velocity damping */
  angularDamping?: number;
  /** Mass in kg */
  mass?: number;
  /** Surface friction */
  friction?: number;
  /** Restitution / bounciness */
  restitution?: number;
  /** Actor type identifier */
  actorType?: string;
  /** Blueprint asset IDs */
  blueprintId?: string;
  animBlueprintId?: string;
  /** Character movement 2D properties */
  characterMovement2D?: boolean;
}

export class SpriteActor implements Transform {
  public id: number = -1;
  public name: string;
  public mesh: THREE.Mesh;
  public spriteRenderer: SpriteRenderer;
  public animator: SpriteAnimator | null = null;
  public sortingLayer: string = 'Default';
  public orderInLayer: number = 0;
  public physicsBody: BodyEntry2D | null = null;
  public characterMovement2D: CharacterMovement2D | null = null;
  public blueprintId: string | null = null;
  public animBlueprintId: string | null = null;
  public actorType: string = 'sprite';
  public scripts: any[] = [];
  public tags: string[] = [];
  public visible: boolean = true;
  public pixelsPerUnit = 100;

  // Physics2DWorld syncToThreeJS expects actor.group
  public group: THREE.Group;

  // transform2D — used by Camera2D follow system and scene serialization
  public transform2D = {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    sortingLayer: 'Default',
    orderInLayer: 0,
  };

  // Component-style access map for inter-component lookups
  private _components = new Map<string, any>();

  // Event emitter — used by SpriteAnimator frame events
  private _eventListeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor(config: SpriteActorConfig) {
    this.name = config.name;
    this.actorType = config.actorType ?? 'sprite';
    this.blueprintId = config.blueprintId ?? null;
    this.animBlueprintId = config.animBlueprintId ?? null;
    this.sortingLayer = config.sortingLayer ?? 'Default';
    this.orderInLayer = config.orderInLayer ?? 0;

    // Create a group for the actor (physics expects actor.group)
    this.group = new THREE.Group();
    this.group.name = config.name;

    // Create sprite renderer (creates mesh internally)
    this.spriteRenderer = new SpriteRenderer();
    this.mesh = this.spriteRenderer.mesh;
    this.mesh.name = config.name;
    this.group.add(this.mesh);

    // Register sprite renderer as a component
    this._components.set('SpriteRenderer', this.spriteRenderer);

    // Apply initial transform
    if (config.position) {
      this.transform2D.position = { ...config.position };
      this.group.position.set(config.position.x, config.position.y, 0);
    }
    if (config.scale) {
      this.transform2D.scale = { ...config.scale };
      this.group.scale.set(config.scale.x, config.scale.y, 1);
    }
    if (config.rotation !== undefined) {
      this.transform2D.rotation = config.rotation;
      this.group.rotation.z = (config.rotation * Math.PI) / 180;
    }

    this.transform2D.sortingLayer = this.sortingLayer;
    this.transform2D.orderInLayer = this.orderInLayer;
  }

  // ---- Component access (used by CharacterMovement2D, SpriteAnimator, etc.) ----

  getComponent(name: string): any {
    return this._components.get(name) ?? null;
  }

  setComponent(name: string, component: any): void {
    this._components.set(name, component);
  }

  // ---- Event emitter (used by SpriteAnimator frame events) ----

  on(event: string, cb: (...args: any[]) => void): void {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, new Set());
    this._eventListeners.get(event)!.add(cb);
  }

  off(event: string, cb: (...args: any[]) => void): void {
    this._eventListeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      for (const cb of listeners) cb(...args);
    }
  }

  // ---- Position (updates group, NOT mesh — mesh is child of group) ----
  get x(): number { return this.transform2D.position.x; }
  set x(v: number) {
    this.transform2D.position.x = v;
    this.group.position.x = v;
  }

  get y(): number { return this.transform2D.position.y; }
  set y(v: number) {
    this.transform2D.position.y = v;
    this.group.position.y = v;
  }

  setPosition(x: number, y: number): void {
    this.transform2D.position.x = x;
    this.transform2D.position.y = y;
    // Always enforce Z=0 — 2D actors must stay locked in the XY plane.
    // Using this.group.position.z here would preserve any drift that
    // accumulated from sorting layers, editor operations, or prior 3D state.
    this.group.position.set(x, y, 0);
  }

  // ---- Rotation ----
  get rotation(): number { return this.transform2D.rotation; }
  set rotation(deg: number) {
    this.transform2D.rotation = deg;
    this.group.rotation.z = (deg * Math.PI) / 180;
  }

  // ---- Scale ----
  get scaleX(): number { return this.transform2D.scale.x; }
  set scaleX(v: number) { this.transform2D.scale.x = v; this.group.scale.x = v; }

  get scaleY(): number { return this.transform2D.scale.y; }
  set scaleY(v: number) { this.transform2D.scale.y = v; this.group.scale.y = v; }

  // ---- Sprite Sheet ----

  setSpriteSheet(sheet: SpriteSheetAsset): void {
    this.spriteRenderer.spriteSheet = sheet;
    // Always sync pixelsPerUnit from the sprite sheet so setSprite() scales correctly.
    // The actor's default of 100 is only a fallback when the sheet has no ppu.
    if (sheet.pixelsPerUnit && sheet.pixelsPerUnit > 0) {
      this.pixelsPerUnit = sheet.pixelsPerUnit;
    }
    this.spriteRenderer.pixelsPerUnit = this.pixelsPerUnit;
    if (sheet.texture) {
      this.spriteRenderer.setTexture(sheet.texture);
    }
  }

  setSprite(spriteName: string): void {
    if (!this.spriteRenderer.spriteSheet) return;
    const sprite = this.spriteRenderer.spriteSheet.sprites.find(s => s.name === spriteName || s.spriteId === spriteName);
    if (sprite) {
      this.spriteRenderer.setSprite(sprite);
    }
  }

  // ---- Animator ----

  initAnimator(animations: SpriteAnimationDef[], defaultAnim?: string): void {
    if (!this.spriteRenderer) return;
    this.animator = new SpriteAnimator(this.spriteRenderer);
    this._components.set('SpriteAnimator', this.animator);
    if (this.spriteRenderer.spriteSheet) {
      this.animator.setSpriteSheet(this.spriteRenderer.spriteSheet);
    }
    // Wire animation events to the actor event emitter
    this.animator.onAnimEvent((eventName: string) => {
      this.emit('animEvent_' + eventName);
    });
    this.animator.onAnimFinished((animName: string) => {
      this.emit('animFinished_' + animName);
      this.emit('animFinished');
    });
    if (defaultAnim) {
      this.animator.play(defaultAnim);
    }
  }

  // ---- Sorting ----

  applySorting(layerManager: SortingLayerManager): void {
    const layer = layerManager.getLayer(this.sortingLayer);
    if (layer) {
      this.mesh.position.z = layer.z + this.orderInLayer * 0.01;
      this.mesh.renderOrder = layer.z + this.orderInLayer;
      this.mesh.visible = layer.visible && this.visible;
    }
  }

  // ---- Physics ----

  attachPhysicsBody(physics: Physics2DWorld, config: SpriteActorConfig): void {
    if (!config.physicsBodyType) return;

    const pos = this.transform2D.position;
    const bodyType = config.physicsBodyType;

    let rigidBody: any;
    if (bodyType === 'dynamic') {
      rigidBody = physics.addDynamicBody(this, pos.x, pos.y, {
        ccdEnabled:      config.ccdEnabled      ?? false,
        freezeRotation:  config.freezeRotation  ?? false,
        gravityScale:    config.gravityScale     ?? 1.0,
        linearDamping:   config.linearDamping    ?? 0.0,
        angularDamping:  config.angularDamping   ?? 0.05,
        mass:            config.mass             ?? 1.0,
      });
    } else if (bodyType === 'kinematic') {
      rigidBody = physics.addKinematicBody(this, pos.x, pos.y);
    } else {
      // Static body — pass `this` so bodyMap registers the actor for event resolution
      rigidBody = physics.addStaticBody(pos.x, pos.y, this);
    }

    if (!rigidBody) {
      console.warn('[SpriteActor] attachPhysicsBody failed to create rigidBody! type=%s pos=(%s,%s)', bodyType, pos.x, pos.y);
      return;
    }

    const colliderName = config.componentName || '';
    // Add primary collider
    if (config.colliderShape === 'circle') {
      const radius = config.colliderRadius ?? 0.5;
      physics.addCircleCollider(rigidBody, radius, { isTrigger: config.isTrigger, name: colliderName });
    } else if (config.colliderShape === 'capsule') {
      const w = config.colliderSize?.width ?? 0.5;
      const h = config.colliderSize?.height ?? 1;
      physics.addCapsuleCollider(rigidBody, h / 2, w / 2, { isTrigger: config.isTrigger, name: colliderName });
    } else {
      const w = config.colliderSize?.width ?? 1;
      const h = config.colliderSize?.height ?? 1;
      physics.addBoxCollider(rigidBody, w / 2, h / 2, { isTrigger: config.isTrigger, name: colliderName });
    }

    // Add any additional colliders (e.g. a trigger zone on the same body as a solid collider)
    for (const extra of config.additionalColliders ?? []) {
      const eName = extra.name ?? '';
      if (extra.shape === 'circle') {
        physics.addCircleCollider(rigidBody, extra.radius ?? 0.5, { isTrigger: extra.isTrigger, name: eName });
      } else if (extra.shape === 'capsule') {
        const w = extra.size?.width ?? 0.5;
        const h = extra.size?.height ?? 1;
        physics.addCapsuleCollider(rigidBody, h / 2, w / 2, { isTrigger: extra.isTrigger, name: eName });
      } else {
        const w = extra.size?.width ?? 1;
        const h = extra.size?.height ?? 1;
        physics.addBoxCollider(rigidBody, w / 2, h / 2, { isTrigger: extra.isTrigger, name: eName });
      }
    }

    this.physicsBody = physics.bodyMap.get(rigidBody.handle) ?? null;

    // Register as a component so CharacterMovement2D can find it via getComponent('RigidBody2D')
    if (this.physicsBody) {
      this._components.set('RigidBody2D', {
        rigidBody,
        isGrounded: false,
        _groundCheckTimer: 0,
        // Sync position back to Rapier (used when setting position programmatically)
        syncToRapier: () => {
          if (rigidBody) {
            rigidBody.setTranslation({ x: this.transform2D.position.x, y: this.transform2D.position.y }, true);
          }
        },
      });
    }
  }

  // ---- Per-frame sync ----

  syncFromPhysics(): void {
    if (!this.physicsBody) return;
    const rb = this.physicsBody.rigidBody;
    if (!rb) return;
    const t = rb.translation();
    // Update transform2D (canonical source of truth)
    this.transform2D.position.x = t.x;
    this.transform2D.position.y = t.y;
    this.transform2D.rotation = rb.rotation() * (180 / Math.PI);
    // Update group (Three.js visual)
    // Z is always forced to 0 — Rapier2D only simulates X/Y and must
    // never allow the group to drift onto the Z-axis (which would pull
    // the sprite out of the orthographic camera's visible XY plane).
    this.group.position.x = t.x;
    this.group.position.y = t.y;
    this.group.position.z = 0;
    this.group.rotation.z = rb.rotation();
  }

  update(deltaTime: number): void {
    // Sync physics → transform
    this.syncFromPhysics();

    // Update ground check for RigidBody2D component
    this._updateGroundCheck();

    // Update character movement
    if (this.characterMovement2D) {
      this.characterMovement2D.update(deltaTime);
    }

    // Sync auto-variables from physics to animation
    if (this.animator) {
      this.animator.syncAutoVariables(this);
      this.animator.update(deltaTime);
    }
  }

  /** Raycast downward to check if character is standing on ground */
  private _updateGroundCheck(): void {
    const rb2dComp = this._components.get('RigidBody2D');
    if (!rb2dComp?.rigidBody) return;

    // Simple ground check: cast a short ray downward from the actor's position
    const pos = rb2dComp.rigidBody.translation();
    const colliders = this.physicsBody?.colliders;
    if (!colliders || colliders.length === 0) return;

    // Get the bottom of the collider (approximate)
    const halfH = 0.05; // small raycast distance below feet
    // Use the physics world's ground check if available
    rb2dComp.isGrounded = this._checkGroundedViaContacts(rb2dComp.rigidBody);
  }

  /** Check if any contact normal points upward (ground contact) */
  private _checkGroundedViaContacts(rigidBody: any): boolean {
    // Iterate over contact pairs — if any contact normal has Y > 0.5, we're grounded
    // This is a simplified check; a proper implementation would use the physics world
    // For now, we rely on the physics world's contact iteration
    const rb2dComp = this._components.get('RigidBody2D');
    return rb2dComp?._isGroundedByPhysics ?? false;
  }

  // ---- Transform Interface ----

  get position(): Vector3Like {
    return { x: this.transform2D.position.x, y: this.transform2D.position.y, z: 0 };
  }

  get rotation(): Vector3Like {
    return { x: 0, y: 0, z: this.transform2D.rotation };
  }

  get scale(): Vector3Like {
    return { x: this.transform2D.scale.x, y: this.transform2D.scale.y, z: 1 };
  }

  setPosition(x: number, y: number, z: number = 0): void {
    this.transform2D.position.x = x;
    this.transform2D.position.y = y;
    this.group.position.set(x, y, z);
    if (this.physicsBody) {
      this.physicsBody.rigidBody.setTranslation({ x, y }, true);
    }
  }

  setRotation(x: number, y: number, z: number = 0): void {
    this.transform2D.rotation = z;
    this.group.rotation.z = THREE.MathUtils.degToRad(z);
    if (this.physicsBody) {
      this.physicsBody.rigidBody.setRotation(THREE.MathUtils.degToRad(z), true);
    }
  }

  setScale(x: number, y: number, z: number = 1): void {
    this.transform2D.scale.x = x;
    this.transform2D.scale.y = y;
    this.group.scale.set(x, y, z);
  }

  getPosition(): Vector3Like {
    return this.position;
  }

  getRotation(): Vector3Like {
    return this.rotation;
  }

  getScale(): Vector3Like {
    return this.scale;
  }

  // ---- Serialization ----

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      actorType: this.actorType,
      sortingLayer: this.sortingLayer,
      orderInLayer: this.orderInLayer,
      position: { ...this.transform2D.position },
      scale: { ...this.transform2D.scale },
      rotation: this.transform2D.rotation,
      visible: this.visible,
      blueprintId: this.blueprintId,
      animBlueprintId: this.animBlueprintId,
      pixelsPerUnit: this.pixelsPerUnit,
      spriteSheetId: this.spriteRenderer.spriteSheet?.assetId ?? null,
      tags: [...this.tags],
    };
  }

  // ---- Cleanup ----

  dispose(physics?: Physics2DWorld): void {
    if (this.physicsBody && physics) {
      // Use removeActorBody so bodyMap is cleaned up too — skipping this caused
      // syncToThreeJS() to call .translation() on a freed WASM handle → FREEZE.
      physics.removeActorBody(this);
    }
    this.spriteRenderer.dispose();
    this.animator = null;
    this.physicsBody = null;
    this.characterMovement2D = null;
    this._components.clear();
    this._eventListeners.clear();
    this.scripts = [];
  }
}
