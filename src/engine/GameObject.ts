import * as THREE from 'three';
import type { ScriptComponent } from './ScriptComponent';
import { BlueprintData } from '../editor/BlueprintData';
import type { PhysicsConfig, ActorType } from '../editor/ActorAsset';
import type { CharacterPawnConfig } from './CharacterPawnData';
import type { SpectatorPawnConfig } from './SpectatorController';

let nextId = 1;

export class GameObject {
  public id: number;
  public name: string;
  public mesh: THREE.Mesh;
  public scripts: ScriptComponent[] = [];
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

  /** Owner game object — set when spawned by another actor */
  public owner: GameObject | null = null;

  /** Whether tick is enabled for this actor (Set Actor Tick Enabled node) */
  public __tickEnabled: boolean = true;

  /** True if this actor has been destroyed at runtime */
  public isDestroyed: boolean = false;

  constructor(name: string, mesh: THREE.Mesh) {
    this.id = nextId++;
    this.name = name;
    this.mesh = mesh;
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
}
