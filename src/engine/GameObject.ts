import * as THREE from 'three';
import type { ScriptComponent } from './ScriptComponent';
import { BlueprintData } from '../editor/BlueprintData';
import type { PhysicsConfig } from '../editor/ActorAsset';

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
