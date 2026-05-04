import * as THREE from 'three';
import { Component } from './Component';
import type { ScriptComponent } from './ScriptComponent';
import { BlueprintData } from '../runtime/BlueprintData';
import type { PhysicsConfig, ActorType } from '../runtime/RuntimeTypes';
import type { CharacterPawnConfig } from './CharacterPawnData';
import type { SpectatorPawnConfig } from './SpectatorController';
import type { Transform, Vector3Like } from './Transform';

let nextId = 1;

export class GameObject implements Transform {
  public id: number;
  public name: string;
  public mesh: THREE.Mesh;
  public scripts: ScriptComponent[] = [];
  public components: Component[] = [];
  public rigidBody: any = null; // Rapier rigid body (set by physics system)
  public collider: any = null;
  public hasPhysics: boolean = false;
  public blueprintData: BlueprintData = new BlueprintData();
  /** Per-object physics configuration (from ActorAsset rootPhysics) */
  public physicsConfig: PhysicsConfig | null = null;

  /**
   * If this GameObject was spawned from an ActorAsset, this holds the asset ID.
   * Used to look up and re-sync blueprint data when the asset changes.
   */
  public actorAssetId: string | null = null;

  /**
   * If this GameObject has a hand-written script assigned from the content browser,
   * this holds the ScriptCodeAsset ID. The merged code is compiled at play time.
   */
  public scriptAssetId: string | null = null;

  /**
   * If this GameObject uses an imported mesh asset, this holds the mesh asset ID.
   * Used for serialization and to reload the mesh from GLB data.
   */
  public customMeshAssetId: string | null = null;

  /** Actor type — 'actor' (default) or 'characterPawn' */
  public actorType: ActorType = 'actor';

  /** Character Pawn config (set when actorType === 'characterPawn') */
  public characterPawnConfig: CharacterPawnConfig | null = null;

  /** Spectator Pawn config (set when actorType === 'spectatorPawn') */
  public spectatorPawnConfig: SpectatorPawnConfig | null = null;

  /** Runtime character controller (set during play) */
  public characterController: any = null;

  /** Runtime AI controller (set during play) */
  public aiController: any = null;

  /**
   * Controller class to use for this pawn at play time.
   * 'PlayerController' (default for player pawns), 'AIController', or 'None'.
   * Set from the actor asset's controllerClass property.
   */
  public controllerClass: import('./Controller').ControllerType = 'None';

  /** Runtime controller reference (PlayerController or AIController) — set during play */
  public controller: import('./Controller').Controller | null = null;

  /**
   * ID of the controller blueprint asset to instantiate at play time.
   * When set, the controller's blueprint script runs alongside the pawn.
   */
  public controllerBlueprintId: string = '';

  /** Tags for gameplay tagging (Actor Has Tag, Add Tag, Remove Tag nodes) */
  public tags: string[] = [];

  /** String-keyed runtime component map (used by 2D systems: CharacterMovement2D, RigidBody2D) */
  public _runtimeComponents = new Map<string, any>();

  /** Owner game object — set when spawned by another actor */
  public owner: GameObject | null = null;

  /** Whether tick is enabled for this actor (Set Actor Tick Enabled node) */
  public __tickEnabled: boolean = true;

  /** Whether this actor has been destroyed at runtime (DestroyActor node) */
  public isDestroyed: boolean = false;

  constructor(name: string, mesh: THREE.Mesh) {
    this.id = nextId++;
    this.name = name;
    this.mesh = mesh;
  }
  public addComponent<T extends Component>(component: T): T {
    this.components.push(component);
    component.onAttach(this);
    return component;
  }

  public getComponent<T extends Component>(type: { new(...args: any[]): T } | string): T | any | null {
    // String-based lookup for runtime 2D components (CharacterMovement2D, RigidBody2D, etc.)
    if (typeof type === 'string') {
      return this._runtimeComponents.get(type) ?? null;
    }
    return (this.components.find(c => c instanceof type) as T) || null;
  }

  public removeComponent(component: Component): void {
    const index = this.components.indexOf(component);
    if (index !== -1) {
      component.onDetach();
      this.components.splice(index, 1);
    }
  }
  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  get rotation(): THREE.Euler {
    return this.mesh.rotation;
  }

  get scale(): THREE.Vector3 {
    return this.mesh.scale;
  }

  setPosition(x: number, y: number, z: number = 0): void {
    this.mesh.position.set(x, y, z);
    if (this.rigidBody) {
      this.rigidBody.setTranslation({ x, y, z }, true);
    }
  }

  setRotation(x: number, y: number, z: number = 0): void {
    this.mesh.rotation.set(x, y, z);
    if (this.rigidBody) {
      const q = new THREE.Quaternion().setFromEuler(this.mesh.rotation);
      this.rigidBody.setRotation(q, true);
    }
  }

  setScale(x: number, y: number, z: number = 1): void {
    this.mesh.scale.set(x, y, z);
  }

  getPosition(): Vector3Like {
    return { x: this.mesh.position.x, y: this.mesh.position.y, z: this.mesh.position.z };
  }

  getRotation(): Vector3Like {
    return { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
  }

  getScale(): Vector3Like {
    return { x: this.mesh.scale.x, y: this.mesh.scale.y, z: this.mesh.scale.z };
  }
}
