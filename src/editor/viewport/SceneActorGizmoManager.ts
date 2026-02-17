/**
 * SceneActorGizmoManager — Manages transform gizmo interaction for
 * scene composition actors (lights, PlayerStart, fog volumes, etc.).
 *
 * Reuses the existing TransformGizmoSystem by attaching gizmos to
 * actor groups, while respecting each actor's allowed gizmo capabilities.
 */

import * as THREE from 'three';
import type { SceneCompositionManager } from '../scene/SceneCompositionManager';
import type { TransformGizmoSystem, TransformMode } from './TransformGizmoSystem';
import type { GizmoCapability } from '../scene/SceneActors';

export class SceneActorGizmoManager {
  private _composition: SceneCompositionManager;
  private _gizmo: TransformGizmoSystem;

  /** Currently attached actor id */
  private _attachedActorId: string | null = null;

  /** Allowed modes for the currently attached actor */
  private _allowedModes: GizmoCapability[] = [];

  constructor(
    composition: SceneCompositionManager,
    gizmo: TransformGizmoSystem,
  ) {
    this._composition = composition;
    this._gizmo = gizmo;

    // Listen for actor selection changes
    this._composition.on('actorSelected', (id: string | null) => {
      this._onActorSelected(id);
    });

    // Listen for gizmo transform changes — forward to actor
    const origOnTransformChanged = this._gizmo.onTransformChanged;
    this._gizmo.onTransformChanged = (obj: THREE.Object3D) => {
      // Call original callback first
      if (origOnTransformChanged) origOnTransformChanged(obj);

      // If the object is a scene actor group, notify the actor
      if (this._attachedActorId && obj.userData.__sceneActorId === this._attachedActorId) {
        this._composition.notifyActorTransformChanged(this._attachedActorId);
      }
    };
  }

  /** Called when a composition actor is selected in the outliner */
  private _onActorSelected(actorId: string | null): void {
    if (!actorId) {
      this.detach();
      return;
    }

    const caps = this._composition.getActorGizmoCapabilities(actorId);
    const group = this._composition.getActorGroup(actorId);

    if (!group || caps.length === 0) {
      this.detach();
      this._attachedActorId = actorId; // Track for properties but no gizmo
      return;
    }

    this._attachedActorId = actorId;
    this._allowedModes = caps;

    // Set gizmo mode to the first allowed mode if current mode isn't allowed
    const currentMode = this._gizmo.mode;
    if (!caps.includes(currentMode as GizmoCapability)) {
      this._gizmo.setMode(caps[0] as TransformMode);
    }

    // Attach gizmo to the actor's group
    this._gizmo.attachToObjects([group]);

    // Show direction arrow for lights when selected
    const entry = this._composition.getActor(actorId);
    if (entry && entry.type === 'DirectionalLight') {
      const actor = entry.actor as any;
      if (actor.directionArrow) {
        actor.directionArrow.visible = true;
      }
    }
  }

  /** Detach gizmo from any actor */
  detach(): void {
    // Hide direction arrows from previous selection
    if (this._attachedActorId) {
      const entry = this._composition.getActor(this._attachedActorId);
      if (entry && entry.type === 'DirectionalLight') {
        const actor = entry.actor as any;
        if (actor.directionArrow) {
          actor.directionArrow.visible = false;
        }
      }
    }

    this._attachedActorId = null;
    this._allowedModes = [];

    // Actually detach the TransformControls from the Three.js scene
    this._gizmo.detach();
  }

  /** Whether this manager currently has an actor attached */
  get hasAttachedActor(): boolean {
    return this._attachedActorId !== null && this._allowedModes.length > 0;
  }

  /** Get the currently attached actor id */
  get attachedActorId(): string | null {
    return this._attachedActorId;
  }

  /** Check if a given gizmo mode is allowed for the current actor */
  isModeAllowed(mode: TransformMode): boolean {
    return this._allowedModes.includes(mode as GizmoCapability);
  }

  /** Get allowed modes for current actor */
  get allowedModes(): GizmoCapability[] {
    return this._allowedModes;
  }

  dispose(): void {
    this.detach();
  }
}
