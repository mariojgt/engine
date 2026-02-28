// ============================================================
//  Controller — UE-style abstract base Controller class
//
//  In Unreal Engine, AController is the base class for both
//  APlayerController and AAIController. It handles:
//  - Possess / Unpossess a Pawn
//  - Bidirectional Pawn ↔ Controller relationship
//  - Abstract tick / update
//
//  The Controller does NOT own the camera or input — those
//  belong to the Pawn (CharacterController / SpectatorController).
//  The Controller wraps the *ownership* relationship.
//
//  Usage:
//    const pc = new PlayerController(0);
//    pc.possess(myPawn);
//    myPawn.getController()   // → pc
//    pc.getPawn()             // → myPawn
// ============================================================

import type { GameObject } from './GameObject';

// ---- Controller Type tag ----
export type ControllerType = 'PlayerController' | 'AIController' | 'None';

/**
 * A Pawn is any runtime wrapper that can be possessed.
 * CharacterController, SpectatorController, etc. all satisfy this.
 */
export interface Pawn {
  gameObject: GameObject;
  /** The controller currently owning this pawn (set by Controller.possess) */
  controller: Controller | null;
  destroy(): void;
}

// ============================================================
//  Controller (abstract base)
// ============================================================

export abstract class Controller {
  /** Unique id for this controller instance */
  public id: string;

  /** Which type of controller this is */
  public abstract readonly controllerType: ControllerType;

  /** Currently possessed pawn */
  protected _pawn: Pawn | null = null;

  /** The blueprint class name this controller was created from (empty = default) */
  public blueprintClassName: string = '';

  /** Human-readable name for this controller (used by blueprint code e.g. Print String) */
  public get name(): string {
    return this.blueprintClassName || this.controllerType || this.id;
  }

  constructor(id?: string) {
    this.id = id ?? Controller._uid();
  }

  // ---- Possession ----

  /**
   * Possess a pawn — take ownership.
   * If the pawn is already possessed by another controller, that controller
   * unpossesses first (just like UE).
   */
  possess(pawn: Pawn): void {
    if (this._pawn === pawn) return;

    // Release our current pawn
    if (this._pawn) {
      this._internalUnpossess();
    }

    // Steal from other controller if needed
    if (pawn.controller && pawn.controller !== this) {
      pawn.controller.unpossess();
    }

    this._pawn = pawn;
    pawn.controller = this;
    this.onPossess(pawn);
  }

  /**
   * Unpossess — release the current pawn.
   */
  unpossess(): Pawn | null {
    return this._internalUnpossess();
  }

  private _internalUnpossess(): Pawn | null {
    const prev = this._pawn;
    if (prev) {
      prev.controller = null;
      this._pawn = null;
      this.onUnpossess(prev);
    }
    return prev;
  }

  // ---- Query ----

  /** Get the currently possessed pawn */
  getPawn(): Pawn | null {
    return this._pawn;
  }

  /** Get the game object of the possessed pawn */
  getPawnGameObject(): GameObject | null {
    return this._pawn?.gameObject ?? null;
  }

  /** Is this controller possessing any pawn? */
  isPossessing(): boolean {
    return this._pawn !== null;
  }

  // ---- Lifecycle hooks (override in subclasses) ----

  /** Called when a pawn is possessed */
  protected onPossess(_pawn: Pawn): void {}

  /** Called when a pawn is unpossessed */
  protected onUnpossess(_pawn: Pawn): void {}

  /** Per-frame update — override in subclasses */
  abstract update(dt: number): void;

  /** Cleanup */
  destroy(): void {
    this.unpossess();
  }

  // ---- Util ----
  private static _nextId = 1;
  private static _uid(): string {
    return 'ctrl_' + (Controller._nextId++) + '_' + Date.now().toString(36);
  }
}
