// ============================================================
//  CharacterMovement2D — 2D side-scroller / top-down character
//  movement with coyote time, jump buffering, jump cut, air control.
// ============================================================

import * as THREE from 'three';

export interface CharacterMovement2DProperties {
  moveSpeed: number;       // px/s
  runSpeed: number;        // px/s
  acceleration: number;    // px/s²
  deceleration: number;    // px/s²
  airControl: number;      // 0–1
  jumpForce: number;       // px/s
  maxJumps: number;
  coyoteTime: number;      // seconds
  jumpBufferTime: number;  // seconds
  maxFallSpeed: number;    // px/s (negative)
  jumpCut: boolean;
  gravityScale: number;
  linearDrag: number;
  freezeRotation: boolean;
}

export function defaultCharacterMovement2DProps(): CharacterMovement2DProperties {
  return {
    moveSpeed: 300,
    runSpeed: 600,
    acceleration: 2000,
    deceleration: 2000,
    airControl: 0.8,
    jumpForce: 600,
    maxJumps: 2,
    coyoteTime: 0.10,
    jumpBufferTime: 0.10,
    maxFallSpeed: -1200,
    jumpCut: true,
    gravityScale: 1.0,
    linearDrag: 0.0,
    freezeRotation: true,
  };
}

export class CharacterMovement2D {
  public properties: CharacterMovement2DProperties;
  public actor: any = null;
  public isGrounded = false;
  public wasGrounded = false;
  public jumpsRemaining: number;
  public coyoteTimer = 0;
  public jumpBufferTimer = 0;
  public facingRight = true;

  constructor(properties?: Partial<CharacterMovement2DProperties>) {
    this.properties = { ...defaultCharacterMovement2DProps(), ...properties };
    this.jumpsRemaining = this.properties.maxJumps;
  }

  attach(actor: any): void {
    this.actor = actor;
  }

  update(deltaTime: number): void {
    const rb = this._getRigidBody();
    if (!rb) return;

    // Ground check
    this.wasGrounded = this.isGrounded;
    this.isGrounded = this._checkGrounded();

    // Coyote time: start counting when leaving ground
    if (this.wasGrounded && !this.isGrounded) {
      this.coyoteTimer = this.properties.coyoteTime;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= deltaTime;

    // Jump buffer: try to jump if buffered and now grounded
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= deltaTime;
      if (this.isGrounded || this.coyoteTimer > 0) {
        this._doJump(rb);
      }
    }

    // Reset jumps on landing
    if (this.isGrounded && !this.wasGrounded) {
      this.jumpsRemaining = this.properties.maxJumps;
    }

    // Clamp fall speed
    const vel = rb.linvel();
    const ppu = this._getPPU();
    const maxFallPhys = this.properties.maxFallSpeed / ppu;
    if (vel.y < maxFallPhys) {
      rb.setLinvel({ x: vel.x, y: maxFallPhys }, true);
    }
  }

  moveHorizontal(direction: number, deltaTime: number, isRunning = false): void {
    const rb = this._getRigidBody();
    if (!rb) return;

    const ppu = this._getPPU();
    const targetSpeed = direction * ((isRunning ? this.properties.runSpeed : this.properties.moveSpeed) / ppu);
    const accel = (this.properties.acceleration / ppu) * (this.isGrounded ? 1.0 : this.properties.airControl);
    const vel = rb.linvel();

    const newVelX = THREE.MathUtils.lerp(
      vel.x,
      targetSpeed,
      Math.min(1, (accel * deltaTime) / Math.max(1, Math.abs(targetSpeed) / ppu))
    );
    rb.setLinvel({ x: newVelX, y: vel.y }, true);

    // Flip sprite
    if (Math.abs(direction) > 0.01) {
      this.facingRight = direction > 0;
      const sr = this.actor?.getComponent?.('SpriteRenderer');
      sr?.setFlipX?.(!this.facingRight);
    }
  }

  jump(): void {
    const rb = this._getRigidBody();
    if (!rb) return;

    if (this.jumpsRemaining > 0 || this.coyoteTimer > 0) {
      this._doJump(rb);
    } else {
      this.jumpBufferTimer = this.properties.jumpBufferTime;
    }
  }

  stopJump(): void {
    if (!this.properties.jumpCut) return;
    const rb = this._getRigidBody();
    if (!rb) return;
    const vel = rb.linvel();
    if (vel.y > 0) {
      rb.setLinvel({ x: vel.x, y: vel.y * 0.4 }, true);
    }
  }

  private _doJump(rb: any): void {
    const ppu = this._getPPU();
    const vel = rb.linvel();
    rb.setLinvel({ x: vel.x, y: this.properties.jumpForce / ppu }, true);
    this.jumpsRemaining = Math.max(0, this.jumpsRemaining - 1);
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  private _getRigidBody(): any {
    return this.actor?.getComponent?.('RigidBody2D')?.rigidBody ?? null;
  }

  private _getPPU(): number {
    return this.actor?.pixelsPerUnit ?? 100;
  }

  private _checkGrounded(): boolean {
    // Delegate to RigidBody2D component's ground check
    const rb2d = this.actor?.getComponent?.('RigidBody2D');
    return rb2d?.isGrounded ?? false;
  }
}
