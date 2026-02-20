// ============================================================
//  SpriteActor — 2D actor wrapper around THREE.Mesh sprite
//  with SpriteRenderer, Physics 2D body, and sorting layer.
// ============================================================

import * as THREE from 'three';
import { SpriteRenderer, SpriteAnimator, type SpriteSheetAsset, type SpriteAnimationDef } from './SpriteRenderer';
import { SortingLayerManager } from './SortingLayers';
import type { Physics2DWorld, BodyEntry2D } from './Physics2DWorld';
import type { CharacterMovement2D } from './CharacterMovement2D';

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
  /** Actor type identifier */
  actorType?: string;
  /** Blueprint asset IDs */
  blueprintId?: string;
  animBlueprintId?: string;
  /** Character movement 2D properties */
  characterMovement2D?: boolean;
}

export class SpriteActor {
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

  // Physics2DWorld syncToThreeJS expects actor.group
  public group: THREE.Group;

  // Transform shorthand
  private _position = { x: 0, y: 0 };
  private _rotation = 0; // degrees
  private _scale = { x: 1, y: 1 };

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

    // Apply initial transform
    if (config.position) {
      this._position = { ...config.position };
      this.group.position.set(config.position.x, config.position.y, 0);
    }
    if (config.scale) {
      this._scale = { ...config.scale };
      this.group.scale.set(config.scale.x, config.scale.y, 1);
    }
    if (config.rotation !== undefined) {
      this._rotation = config.rotation;
      this.group.rotation.z = (config.rotation * Math.PI) / 180;
    }
  }

  // ---- Position ----
  get x(): number { return this._position.x; }
  set x(v: number) { this._position.x = v; this.mesh.position.x = v; }

  get y(): number { return this._position.y; }
  set y(v: number) { this._position.y = v; this.mesh.position.y = v; }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  // ---- Rotation ----
  get rotation(): number { return this._rotation; }
  set rotation(deg: number) {
    this._rotation = deg;
    this.mesh.rotation.z = (deg * Math.PI) / 180;
  }

  // ---- Scale ----
  get scaleX(): number { return this._scale.x; }
  set scaleX(v: number) { this._scale.x = v; this.mesh.scale.x = v; }

  get scaleY(): number { return this._scale.y; }
  set scaleY(v: number) { this._scale.y = v; this.mesh.scale.y = v; }

  // ---- Sprite Sheet ----

  setSpriteSheet(sheet: SpriteSheetAsset): void {
    this.spriteRenderer.spriteSheet = sheet;
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
    if (this.spriteRenderer.spriteSheet) {
      this.animator.setSpriteSheet(this.spriteRenderer.spriteSheet);
    }
    if (defaultAnim) {
      this.animator.play(defaultAnim);
    }
  }

  // ---- Sorting ----

  applySorting(layerManager: SortingLayerManager): void {
    const layer = layerManager.getLayer(this.sortingLayer);
    if (layer) {
      this.mesh.position.z = layer.z + this.orderInLayer * 0.01;
      this.mesh.visible = layer.visible && this.visible;
    }
  }

  // ---- Physics ----

  attachPhysicsBody(physics: Physics2DWorld, config: SpriteActorConfig): void {
    if (!config.physicsBodyType) return;

    const pos = this._position;
    const bodyType = config.physicsBodyType;

    let rigidBody: any;
    if (bodyType === 'dynamic') {
      rigidBody = physics.addDynamicBody(this, pos.x, pos.y);
    } else if (bodyType === 'kinematic') {
      rigidBody = physics.addKinematicBody(this, pos.x, pos.y);
    } else {
      rigidBody = physics.addStaticBody(pos.x, pos.y);
    }

    if (!rigidBody) return;

    // Add collider
    if (config.colliderShape === 'circle') {
      const radius = config.colliderRadius ?? 0.5;
      physics.addCircleCollider(rigidBody, radius, { isTrigger: config.isTrigger });
    } else if (config.colliderShape === 'capsule') {
      const w = config.colliderSize?.width ?? 0.5;
      const h = config.colliderSize?.height ?? 1;
      physics.addCapsuleCollider(rigidBody, h / 2, w / 2, { isTrigger: config.isTrigger });
    } else {
      const w = config.colliderSize?.width ?? 1;
      const h = config.colliderSize?.height ?? 1;
      physics.addBoxCollider(rigidBody, w / 2, h / 2, { isTrigger: config.isTrigger });
    }

    this.physicsBody = physics.bodyMap.get(rigidBody.handle) ?? null;
  }

  // ---- Per-frame sync ----

  syncFromPhysics(): void {
    if (!this.physicsBody) return;
    const rb = this.physicsBody.rigidBody;
    if (!rb) return;
    const t = rb.translation();
    this._position.x = t.x;
    this._position.y = t.y;
    this.mesh.position.x = t.x;
    this.mesh.position.y = t.y;
    this._rotation = rb.rotation() * (180 / Math.PI);
    this.mesh.rotation.z = rb.rotation();
  }

  update(deltaTime: number): void {
    // Sync physics → transform
    this.syncFromPhysics();
    // Update animation
    if (this.animator) {
      this.animator.update(deltaTime);
    }
  }

  // ---- Serialization ----

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      actorType: this.actorType,
      sortingLayer: this.sortingLayer,
      orderInLayer: this.orderInLayer,
      position: { ...this._position },
      scale: { ...this._scale },
      rotation: this._rotation,
      visible: this.visible,
      blueprintId: this.blueprintId,
      animBlueprintId: this.animBlueprintId,
      tags: [...this.tags],
    };
  }

  // ---- Cleanup ----

  dispose(physics?: Physics2DWorld): void {
    if (this.physicsBody && physics && physics.world) {
      physics.world.removeRigidBody(this.physicsBody.rigidBody);
    }
    this.spriteRenderer.dispose();
    this.animator = null;
    this.physicsBody = null;
    this.characterMovement2D = null;
    this.scripts = [];
  }
}
