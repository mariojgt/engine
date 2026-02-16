// ============================================================
//  PlayerController — UE-style Player Controller
//  Extends Controller base class. Handles:
//  - Player index (local multiplayer)
//  - Pawn possession with pawn stack (so you can switch back)
//  - Camera delegation to the possessed pawn
//  - Input routing (future: input mapping context)
//
//  In UE, every player has exactly one APlayerController that
//  persists for the session. The controller possesses different
//  pawns (Character, Spectator, Vehicle, etc.) over time.
// ============================================================

import * as THREE from 'three';
import type { GameObject } from './GameObject';
import { Controller, type Pawn, type ControllerType } from './Controller';
import type { CharacterController } from './CharacterController';
import type { SpectatorController } from './SpectatorController';

// Re-export for backwards compatibility
export type { Pawn as Possessable } from './Controller';

// ============================================================
//  PlayerController class
// ============================================================

export class PlayerController extends Controller {
  public readonly controllerType: ControllerType = 'PlayerController';

  /** Player index (0 = first player, like UE's GetPlayerController(0)) */
  public playerIndex: number;

  /** Stack of previously possessed pawns for quick switching back */
  private _pawnStack: Pawn[] = [];

  /** Cursor visibility state (UE-style) */
  private _showMouseCursor: boolean = true;

  /** Canvas element for cursor control */
  private _canvas: HTMLCanvasElement | null = null;

  constructor(playerIndex: number = 0) {
    super();
    this.playerIndex = playerIndex;
  }

  // ---- Override possess to support pawn stack ----

  possess(pawn: Pawn): void {
    if (this._pawn === pawn) return;

    // Push current pawn to stack before switching
    if (this._pawn) {
      this._pawnStack.push(this._pawn);
    }

    // Use base class possess (handles bidirectional link + steal)
    super.possess(pawn);

    console.log(`[PlayerController ${this.playerIndex}] Possessed: ${pawn.gameObject.name}`);
  }

  /**
   * Unpossess — release current pawn, pop previous from stack.
   */
  unpossess(): Pawn | null {
    const released = super.unpossess();

    // Pop from stack if available
    if (this._pawnStack.length > 0) {
      const prev = this._pawnStack.pop()!;
      super.possess(prev);
      console.log(`[PlayerController ${this.playerIndex}] Returned to: ${prev.gameObject.name}`);
    } else {
      console.log(`[PlayerController ${this.playerIndex}] Unpossessed all`);
    }

    return released;
  }

  /**
   * Set the canvas for cursor control (called during play mode initialization)
   */
  setCanvas(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
  }

  // ---- Camera ----

  /** Get the camera of the currently possessed pawn (if it has one) */
  getActiveCamera(): THREE.PerspectiveCamera | null {
    const pawn = this._pawn as any;
    return pawn?.camera ?? null;
  }

  // ---- Query API ----

  /** Get the GameObject of the currently possessed pawn */
  getControlledPawn(): GameObject | null {
    return this.getPawnGameObject();
  }

  /** Check if we're possessing any pawn (alias) */
  hasPawn(): boolean {
    return this.isPossessing();
  }

  /** Get the CharacterController if the possessed pawn is one */
  getCharacterController(): CharacterController | null {
    const pawn = this._pawn;
    if (!pawn) return null;
    if ('movementMode' in pawn) return pawn as unknown as CharacterController;
    return null;
  }

  /** Get the SpectatorController if the possessed pawn is one */
  getSpectatorController(): SpectatorController | null {
    const pawn = this._pawn;
    if (!pawn) return null;
    if ('teleportTo' in pawn) return pawn as unknown as SpectatorController;
    return null;
  }

  // ---- Cursor Control (UE-style) ----

  /**
   * Show or hide the mouse cursor (UE's SetShowMouseCursor).
   * When hidden, the cursor is invisible but still functional.
   * @param show - True to show cursor, false to hide
   */
  setShowMouseCursor(show: boolean): void {
    this._showMouseCursor = show;
    if (this._canvas) {
      this._canvas.style.cursor = show ? 'default' : 'none';
    }
  }

  /**
   * Check if the mouse cursor is currently visible.
   * @returns True if cursor is visible
   */
  isMouseCursorVisible(): boolean {
    return this._showMouseCursor;
  }

  /**
   * Enable input to the game only (hides cursor and captures input).
   * Like UE's SetInputMode(GameOnly).
   */
  setInputModeGameOnly(): void {
    this.setShowMouseCursor(false);
    // If we have a character controller, try to enable pointer lock
    const charCtrl = this.getCharacterController();
    if (charCtrl && this._canvas) {
      this._canvas.requestPointerLock?.();
    }
  }

  /**
   * Enable input to both game and UI (shows cursor).
   * Like UE's SetInputMode(GameAndUI).
   */
  setInputModeGameAndUI(): void {
    this.setShowMouseCursor(true);
    // Exit pointer lock if active
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /**
   * Enable input to UI only (shows cursor, disables game input).
   * Like UE's SetInputMode(UIOnly).
   */
  setInputModeUIOnly(): void {
    this.setShowMouseCursor(true);
    // Exit pointer lock if active
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    // TODO: Disable game input (would require input manager)
  }

  // ---- Per-frame update (player controllers don't need per-frame logic) ----
  update(_dt: number): void {
    // Player controllers delegate everything to the possessed pawn.
    // Input is handled by the pawn's own input bindings.
  }

  // ---- Cleanup ----
  destroy(): void {
    super.destroy();
    this._pawnStack = [];
  }
}

// ============================================================
//  PlayerControllerManager — creates and tracks PlayerControllers
// ============================================================

export class PlayerControllerManager {
  public controllers: PlayerController[] = [];

  /** Get or create the player controller for the given index */
  getOrCreate(playerIndex: number = 0): PlayerController {
    let pc = this.controllers.find(c => c.playerIndex === playerIndex);
    if (!pc) {
      pc = new PlayerController(playerIndex);
      this.controllers.push(pc);
    }
    return pc;
  }

  /** Get player controller by index */
  get(playerIndex: number = 0): PlayerController | null {
    return this.controllers.find(c => c.playerIndex === playerIndex) ?? null;
  }

  /** Get the active camera from player 0 */
  getActiveCamera(): THREE.PerspectiveCamera | null {
    return this.get(0)?.getActiveCamera() ?? null;
  }

  destroyAll(): void {
    for (const pc of this.controllers) {
      pc.destroy();
    }
    this.controllers = [];
  }
}
