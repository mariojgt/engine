// ============================================================
//  CharacterController  Runtime character movement controller
//  Provides kinematic character movement with gravity, jumping,
//  ground detection, crouching, camera control, and input.
//
//  REFACTORED to match Unreal Engine Character behaviour:
//  - Camera never collides with own character (collision groups)
//  - Always uses capsule collider (never cube)
//  - Proper rotation locking (capsule stays upright)
//  - Camera mode locked by default (blueprint-controlled)
//  - Spring arm collision ignores own pawn (raycasts filter)
//  - Visual capsule wireframe in play mode (optional debug)
//  - Mesh is visual-only, no collision
// ============================================================

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GameObject } from './GameObject';
import type { PhysicsWorld } from './PhysicsWorld';
import type {
  CharacterPawnConfig,
  MovementMode,
  CameraMode,
  SpringArmConfig,
  TopDownCameraConfig,
} from './CharacterPawnData';
import {
  characterCapsuleGroups,
} from './CollisionTypes';
import { CharacterMovementComponent } from './CharacterMovementComponent';
import type { Controller, Pawn } from './Controller';

// ---- Input state tracked per-frame ----

interface CharacterInputState {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  crouch: boolean;
  run: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
}

function emptyInput(): CharacterInputState {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    crouch: false,
    run: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
  };
}

// ---- Key code mapping ----

function keyToCode(key: string): string {
  const map: Record<string, string> = {
    'W': 'KeyW', 'A': 'KeyA', 'S': 'KeyS', 'D': 'KeyD',
    'E': 'KeyE', 'Q': 'KeyQ', 'F': 'KeyF', 'R': 'KeyR',
    'Space': 'Space',
    'ShiftLeft': 'ShiftLeft', 'ShiftRight': 'ShiftRight',
    'ControlLeft': 'ControlLeft', 'ControlRight': 'ControlRight',
    'Tab': 'Tab', 'CapsLock': 'CapsLock',
  };
  return map[key] ?? key;
}

// ============================================================
//  CharacterController class
// ============================================================

export class CharacterController implements Pawn {
  public gameObject: GameObject;
  public config: CharacterPawnConfig;

  /** The controller that currently owns (possesses) this pawn */
  public controller: Controller | null = null;

  /** Extracted movement component — handles gravity, speed, jump, fly, swim */
  public movementComponent: CharacterMovementComponent;

  // ---- State (proxied from movementComponent) ----
  public get movementMode(): MovementMode { return this.movementComponent.movementMode; }
  public set movementMode(v: MovementMode) { this.movementComponent.movementMode = v; }
  public get velocity(): THREE.Vector3 { return this.movementComponent.velocity; }
  public set velocity(v: THREE.Vector3) { this.movementComponent.velocity = v; }
  public get isGrounded(): boolean { return this.movementComponent.isGrounded; }
  public set isGrounded(v: boolean) { this.movementComponent.isGrounded = v; }
  public get isJumping(): boolean { return this.movementComponent.isJumping; }
  public set isJumping(v: boolean) { this.movementComponent.isJumping = v; }
  public get isCrouching(): boolean { return this.movementComponent.isCrouching; }
  public set isCrouching(v: boolean) { this.movementComponent.isCrouching = v; }
  public get isFalling(): boolean { return this.movementComponent.isFalling; }
  public set isFalling(v: boolean) { this.movementComponent.isFalling = v; }

  // ---- Camera ----
  public camera: THREE.PerspectiveCamera;
  public yaw: number = 0;    // horizontal rotation (radians)
  public pitch: number = 0;  // vertical rotation (radians)
  /** Current active camera mode  locked at startup, only changed via blueprint */
  public activeCameraMode: CameraMode;

  // ---- Character mesh yaw (orient to movement) ----
  private _meshYaw: number = 0;

  // ---- Spring Arm state (for camera lag & collision) ----
  private _currentArmLength: number = 4.0;
  private _lagPosition: THREE.Vector3 = new THREE.Vector3();
  private _lagYaw: number = 0;
  private _lagPitch: number = 0;
  private _lagInitialized: boolean = false;

  // ---- Physics (Rapier kinematic character controller) ----
  public rapierController: RAPIER.KinematicCharacterController | null = null;
  public rigidBody: RAPIER.RigidBody | null = null;
  public collider: RAPIER.Collider | null = null;

  /**
   * Vertical offset from body origin to capsule center.
   * Body position = feet; capsule center is at feet + _capsuleCenterY.
   * Like UE where the capsule half-height extends above the root position.
   */
  private _capsuleCenterY: number = 0;

  /** Full capsule half-height (cylinder half + radius) — used for crouch resizing */
  private _standingHalfHeight: number = 0;
  private _standingCapsuleHalfCyl: number = 0;

  /** Coyote time — grace period for jumping after leaving ground (seconds) */
  private _coyoteTimer: number = 0;
  private _coyoteTime: number = 0.12;  // 120ms grace

  /** Horizontal velocity with momentum/friction (replaces instant movement) */
  private _horizontalVelocity: THREE.Vector3 = new THREE.Vector3();

  // ---- Debug capsule wireframe (play mode) ----
  private _debugCapsule: THREE.Group | null = null;

  // ---- Input ----
  public input: CharacterInputState = emptyInput();
  private _keysDown: Set<string> = new Set();
  private _pointerLocked = false;

  // ---- Bound event handlers (for cleanup) ----
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onPointerLockChange: () => void;
  private _onClick: (e: MouseEvent) => void;
  private _canvas: HTMLCanvasElement | null = null;

  // ---- Blueprint-accessible addMovementInput accumulator ----
  public pendingMovement: THREE.Vector3 = new THREE.Vector3();

  // ---- Top-Down / RTS camera state ----
  private _topDownZoom: number = 15;
  private _topDownPanOffset: THREE.Vector3 = new THREE.Vector3();
  private _isPanning: boolean = false;
  private _lastPanX: number = 0;
  private _lastPanY: number = 0;
  private _mouseScreenX: number = 0;
  private _mouseScreenY: number = 0;
  private _onWheel: (e: WheelEvent) => void;
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onRawMouseMove: (e: MouseEvent) => void;

  constructor(go: GameObject, config: CharacterPawnConfig, canvas: HTMLCanvasElement) {
    this.gameObject = go;
    this.config = config;
    this._canvas = canvas;

    // Create the extracted movement component
    this.movementComponent = new CharacterMovementComponent(config.movement);

    // Lock camera mode at startup (from cameraSettings or camera config)
    this.activeCameraMode = config.cameraSettings?.defaultMode ?? config.camera.cameraMode;

    // Create play-mode camera
    this.camera = new THREE.PerspectiveCamera(
      config.camera.fieldOfView,
      canvas.clientWidth / canvas.clientHeight,
      config.camera.nearClip ?? 0.1,
      config.camera.farClip ?? 1000,
    );

    // Initialize spring arm length
    this._currentArmLength = config.springArm?.armLength ?? 4.0;

    // Initialize yaw from the game object's current Y rotation
    this.yaw = go.mesh.rotation.y;
    this._meshYaw = this.yaw;

    // Initialize top-down zoom
    this._topDownZoom = config.topDownCamera?.cameraHeight ?? 15;

    // ---- Determine if this is a top-down/RTS mode (no pointer lock) ----
    const isTopDownMode = this.activeCameraMode === 'topDown' || this.activeCameraMode === 'isometric' || this.activeCameraMode === 'rts';

    // ---- Bind input handlers ----
    this._onKeyDown = (e: KeyboardEvent) => {
      this._keysDown.add(e.code);
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      this._keysDown.delete(e.code);
    };
    this._onMouseMove = (e: MouseEvent) => {
      if (!this._pointerLocked) return;
      this.input.mouseDeltaX += e.movementX;
      this.input.mouseDeltaY += e.movementY;
    };
    this._onPointerLockChange = () => {
      this._pointerLocked = document.pointerLockElement === canvas;
    };
    this._onClick = () => {
      if (!isTopDownMode && !this._pointerLocked && config.inputBindings.mouseLook) {
        canvas.requestPointerLock();
      }
    };

    // ---- Top-Down / RTS handlers ----
    this._onWheel = (e: WheelEvent) => {
      if (!isTopDownMode) return;
      const td = config.topDownCamera;
      if (!td) return;
      const zoomDelta = e.deltaY > 0 ? td.zoomSpeed : -td.zoomSpeed;
      this._topDownZoom = Math.max(td.zoomMin, Math.min(td.zoomMax, this._topDownZoom + zoomDelta));
    };
    this._onMouseDown = (e: MouseEvent) => {
      // Middle mouse = pan (RTS mode)
      if (isTopDownMode && e.button === 1) {
        this._isPanning = true;
        this._lastPanX = e.clientX;
        this._lastPanY = e.clientY;
        e.preventDefault();
      }
    };
    this._onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        this._isPanning = false;
      }
    };
    this._onRawMouseMove = (e: MouseEvent) => {
      this._mouseScreenX = e.clientX;
      this._mouseScreenY = e.clientY;
      if (this._isPanning && isTopDownMode) {
        const td = config.topDownCamera;
        if (!td) return;
        const dx = (e.clientX - this._lastPanX) * td.panSpeed * 0.01;
        const dy = (e.clientY - this._lastPanY) * td.panSpeed * 0.01;
        this._topDownPanOffset.x -= dx;
        this._topDownPanOffset.z -= dy;
        this._lastPanX = e.clientX;
        this._lastPanY = e.clientY;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    canvas.addEventListener('click', this._onClick);
    canvas.addEventListener('wheel', this._onWheel, { passive: true });
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onRawMouseMove);
  }

  // ---- Physics initialization ----

  initPhysics(physics: PhysicsWorld): void {
    const world = physics.world;
    if (!world) return;

    const cap = this.config.capsule;
    const pos = this.gameObject.mesh.position;

    // ── Capsule geometry ──
    // Rapier capsule: half_height = half of cylindrical middle, radius = hemisphere.
    // Total height = 2 * halfCyl + 2 * radius = cap.height
    const halfCyl = Math.max(0.01, (cap.height - cap.radius * 2) / 2);
    this._standingHalfHeight = cap.height / 2;
    this._standingCapsuleHalfCyl = halfCyl;

    // ── UE-style offset: body position = character feet ──
    // The capsule collider is offset upward so its bottom is at the body origin.
    // This means the character's position in the world = their foot position.
    this._capsuleCenterY = cap.height / 2;

    // Create kinematic rigid body at the actor's placed position
    const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z)
      .setCcdEnabled(true);  // Continuous collision detection — prevent tunneling
    this.rigidBody = world.createRigidBody(rbDesc);

    // ALWAYS use capsule collider — offset upward so body pos = feet
    const colDesc = RAPIER.ColliderDesc.capsule(halfCyl, cap.radius)
      .setTranslation(0, this._capsuleCenterY, 0);

    // Collision groups: camera raycasts ignore this collider
    colDesc.setCollisionGroups(characterCapsuleGroups());

    // Higher friction for ground contact stability
    colDesc.setFriction(1.0);
    colDesc.setRestitution(0.0);

    this.collider = world.createCollider(colDesc, this.rigidBody);

    // ── Kinematic Character Controller ──
    // Skin width (offset) — larger value = more reliable but characters float slightly.
    // UE uses ~2.4 units (scaled). 0.05 is a good balance at this scale.
    const skinWidth = 0.05;
    this.rapierController = world.createCharacterController(skinWidth);

    // Auto-step: step over small obstacles (stairs, curbs)
    // (maxStepHeight, minStepWidth, stepOnDynamic)
    const stepHeight = this.config.movement.maxStepHeight;
    this.rapierController.enableAutostep(stepHeight, stepHeight * 0.5, true);

    // Snap to ground: keep character grounded on slopes and small drops
    // Distance = 1.5x step height for reliable snapping on uneven terrain
    this.rapierController.enableSnapToGround(stepHeight * 1.5);

    // Slope limits — prevent climbing steep slopes, allow sliding on them
    const maxSlopeRad = this.config.movement.maxSlopeAngle * Math.PI / 180;
    this.rapierController.setMaxSlopeClimbAngle(maxSlopeRad);
    this.rapierController.setMinSlopeSlideAngle(maxSlopeRad);
    this.rapierController.setSlideEnabled(true);

    // Apply Rapier's built-in force on slopes beyond max angle
    this.rapierController.setApplyImpulsesToDynamicBodies(true);
  }

  // ---- Create debug capsule wireframe for play mode ----

  createDebugCapsule(scene: THREE.Scene): void {
    if (!this.config.capsule.showInPlay) return;

    const cap = this.config.capsule;
    const group = new THREE.Group();
    group.userData.__debugCapsule = true;

    const bodyHeight = Math.max(0, cap.height - cap.radius * 2);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      depthTest: true,
    });

    const cylGeo = new THREE.CylinderGeometry(cap.radius, cap.radius, bodyHeight, 16, 1, true);
    const cyl = new THREE.Mesh(cylGeo, wireMat.clone());
    // Offset upward to match the capsule center offset
    cyl.position.y = this._capsuleCenterY;
    group.add(cyl);

    const topGeo = new THREE.SphereGeometry(cap.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = new THREE.Mesh(topGeo, wireMat.clone());
    top.position.y = this._capsuleCenterY + bodyHeight / 2;
    group.add(top);

    const botGeo = new THREE.SphereGeometry(cap.radius, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const bot = new THREE.Mesh(botGeo, wireMat.clone());
    bot.position.y = this._capsuleCenterY - bodyHeight / 2;
    group.add(bot);

    this._debugCapsule = group;
    scene.add(group);
  }

  // ---- Setup play-mode visuals ----

  setupPlayModeVisuals(): void {
    // In first person, hide the character mesh entirely
    if (this.activeCameraMode === 'firstPerson') {
      this.gameObject.mesh.visible = false;
    }
  }

  // ---- Per-frame update ----

  update(dt: number, physics: PhysicsWorld): void {
    if (!this.rigidBody || !this.collider || !this.rapierController || !physics.world) return;

    // 1. Read keyboard input (only for built-in movement)
    if (this.config.useBuiltInMovement) {
      this._readInput();
    }

    // 2. Mouse look (camera rotation) — skip for top-down/RTS modes
    if (this.activeCameraMode !== 'topDown' && this.activeCameraMode !== 'isometric' && this.activeCameraMode !== 'rts') {
      this._updateMouseLook(dt);
    }

    // 3. Calculate desired movement direction
    const moveDir = this.config.useBuiltInMovement
      ? this._calculateMovementDirection()
      : new THREE.Vector3();

    // 4. Coyote time — allow jumping for a short grace period after leaving ground
    if (this.isGrounded) {
      this._coyoteTimer = this._coyoteTime;
    } else {
      this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
    }

    // 5. Allow coyote-time jumps
    const canCoyoteJump = this._coyoteTimer > 0 && !this.isJumping;
    const jumpInput = this.config.useBuiltInMovement && this.input.jump;
    const effectiveGroundedForJump = this.isGrounded || canCoyoteJump;

    // 6. Crouch capsule resizing
    this._updateCrouchCapsule(physics, dt);

    const isRunning = this.config.useBuiltInMovement ? this.input.run : this.movementMode === 'running';
    const isCrouching = this.config.useBuiltInMovement && this.input.crouch;

    // 7–9. Build displacement differently for ground-based vs flying/swimming
    let displacement: THREE.Vector3;

    if (this.movementMode === 'flying' || this.movementMode === 'swimming') {
      // Flying/Swimming: use full 3D displacement from movement component (no momentum override)
      displacement = this.movementComponent.computeDisplacement(
        dt, moveDir, this.pendingMovement,
        jumpInput && effectiveGroundedForJump, isCrouching, isRunning,
      );
      // Track horizontal velocity for orient-to-movement
      this._horizontalVelocity.set(displacement.x / (dt || 0.016), 0, displacement.z / (dt || 0.016));
    } else {
      // Walking/Running/Crouching/Falling/Jumping: momentum-based horizontal velocity
      // Feed pendingMovement into the velocity system so addMovementInput works
      this._applyHorizontalPhysics(moveDir, this.pendingMovement, dt, isRunning);

      // Vertical-only from movement component (gravity, jump)
      const zeroDir = new THREE.Vector3();
      const zeroPending = new THREE.Vector3();
      displacement = this.movementComponent.computeDisplacement(
        dt, zeroDir, zeroPending,
        jumpInput && effectiveGroundedForJump, isCrouching, isRunning,
      );

      // Override horizontal with momentum-based velocity
      displacement.x = this._horizontalVelocity.x * dt;
      displacement.z = this._horizontalVelocity.z * dt;
    }

    this.pendingMovement.set(0, 0, 0);

    // Reset coyote timer if jump was consumed
    if (jumpInput && canCoyoteJump && !this.isGrounded) {
      this._coyoteTimer = 0;
    }

    // 10. Move via Rapier kinematic character controller
    this.rapierController.computeColliderMovement(
      this.collider,
      { x: displacement.x, y: displacement.y, z: displacement.z },
    );

    const corr = this.rapierController.computedMovement();
    const rbPos = this.rigidBody.translation();
    const nextPos = {
      x: rbPos.x + corr.x,
      y: rbPos.y + corr.y,
      z: rbPos.z + corr.z,
    };
    this.rigidBody.setNextKinematicTranslation(nextPos);

    // 11. Ground detection — delegate to movement component
    const grounded = this.rapierController.computedGrounded();
    this.movementComponent.onGroundResult(grounded, this.input.run);

    // 12. Orient mesh rotation to movement direction
    const moveVel = new THREE.Vector3(this._horizontalVelocity.x, 0, this._horizontalVelocity.z);
    this._updateMeshRotation(moveVel, dt);

    // 13. Sync mesh to physics body position (body pos = feet position)
    this.gameObject.mesh.position.set(nextPos.x, nextPos.y, nextPos.z);

    // 14. Update debug capsule position
    if (this._debugCapsule) {
      this._debugCapsule.position.set(nextPos.x, nextPos.y, nextPos.z);
    }

    // 15. Update camera
    this._updateCamera(dt, physics);

    // 16. Clear mouse deltas for next frame
    this.input.mouseDeltaX = 0;
    this.input.mouseDeltaY = 0;
  }

  // ---- Horizontal velocity with ground friction and braking (UE-style) ----

  private _applyHorizontalPhysics(
    moveDir: THREE.Vector3,
    pending: THREE.Vector3,
    dt: number,
    isRunning: boolean,
  ): void {
    const m = this.config.movement;

    // Speed based on actual run/crouch state
    const speed = this._currentSpeedForRun(isRunning);

    // Target horizontal velocity from WASD input direction
    let targetVelX = moveDir.x * speed;
    let targetVelZ = moveDir.z * speed;

    // Add blueprint pendingMovement (addMovementInput already has speed baked in)
    targetVelX += pending.x;
    targetVelZ += pending.z;

    const hasInput = Math.abs(targetVelX) > 0.001 || Math.abs(targetVelZ) > 0.001;

    if (this.isGrounded) {
      if (hasInput) {
        // Accelerate toward target velocity — fast response like UE
        const accelRate = m.groundFriction * speed;
        const interpFactor = Math.min(1, accelRate * dt);
        this._horizontalVelocity.x += (targetVelX - this._horizontalVelocity.x) * interpFactor;
        this._horizontalVelocity.z += (targetVelZ - this._horizontalVelocity.z) * interpFactor;
      } else {
        // Braking deceleration — character slows to a stop
        const brakingForce = m.brakingDeceleration * dt;
        const currentSpeed = Math.sqrt(this._horizontalVelocity.x ** 2 + this._horizontalVelocity.z ** 2);
        if (currentSpeed > 0.01) {
          const newSpeed = Math.max(0, currentSpeed - brakingForce);
          const scale = newSpeed / currentSpeed;
          this._horizontalVelocity.x *= scale;
          this._horizontalVelocity.z *= scale;
        } else {
          this._horizontalVelocity.x = 0;
          this._horizontalVelocity.z = 0;
        }
      }
    } else {
      // Airborne — apply air control (reduced influence)
      const airAccel = speed * m.airControl;
      this._horizontalVelocity.x += (targetVelX - this._horizontalVelocity.x) * Math.min(1, airAccel * dt);
      this._horizontalVelocity.z += (targetVelZ - this._horizontalVelocity.z) * Math.min(1, airAccel * dt);
    }
  }

  // ---- Crouch capsule resizing ----

  private _updateCrouchCapsule(physics: PhysicsWorld, _dt: number): void {
    if (!this.collider || !physics.world) return;

    const wantCrouch = this.isCrouching;
    const cap = this.config.capsule;

    // Capsule during crouch: 60% of standing height (UE default ratio)
    const crouchRatio = 0.6;
    const targetHalfCyl = wantCrouch
      ? Math.max(0.01, this._standingCapsuleHalfCyl * crouchRatio)
      : this._standingCapsuleHalfCyl;

    const targetCenterY = wantCrouch
      ? (targetHalfCyl + cap.radius)          // shorter capsule
      : this._capsuleCenterY;

    // Replace the collider with the new capsule dimensions
    const currentShape = this.collider.shape;
    const currentHalfCyl = (currentShape as any).halfHeight ?? this._standingCapsuleHalfCyl;

    if (Math.abs(currentHalfCyl - targetHalfCyl) > 0.01) {
      // Remove old collider and create new one with updated dimensions
      const groups = this.collider.collisionGroups();
      physics.world.removeCollider(this.collider, false);

      const colDesc = RAPIER.ColliderDesc.capsule(targetHalfCyl, cap.radius)
        .setTranslation(0, targetCenterY, 0)
        .setCollisionGroups(groups)
        .setFriction(1.0)
        .setRestitution(0.0);

      this.collider = physics.world.createCollider(colDesc, this.rigidBody!);
    }
  }

  // ---- Input reading ----

  private _readInput(): void {
    const bindings = this.config.inputBindings;
    this.input.moveForward = this._keysDown.has(keyToCode(bindings.moveForward));
    this.input.moveBackward = this._keysDown.has(keyToCode(bindings.moveBackward));
    this.input.moveLeft = this._keysDown.has(keyToCode(bindings.moveLeft));
    this.input.moveRight = this._keysDown.has(keyToCode(bindings.moveRight));
    this.input.jump = this._keysDown.has(keyToCode(bindings.jump));
    this.input.crouch = this._keysDown.has(keyToCode(bindings.crouch));
    this.input.run = this._keysDown.has(keyToCode(bindings.run));
  }

  // ---- Mouse look ----

  private _updateMouseLook(_dt: number): void {
    if (!this.config.inputBindings.mouseLook) return;
    const sens = this.config.camera.mouseSensitivity * 0.01;
    this.yaw -= this.input.mouseDeltaX * sens;
    this.pitch -= this.input.mouseDeltaY * sens;

    const pMin = this.config.camera.pitchMin * Math.PI / 180;
    const pMax = this.config.camera.pitchMax * Math.PI / 180;
    this.pitch = Math.max(pMin, Math.min(pMax, this.pitch));
  }

  // ---- Mesh rotation: orient to movement (UE-style) ----

  private _updateMeshRotation(moveVel: THREE.Vector3, dt: number): void {
    const rot = this.config.rotation;
    if (!rot) {
      // Fallback: just apply yaw directly
      this.gameObject.mesh.rotation.set(0, this.yaw, 0);
      return;
    }

    // In first-person, mesh rotation follows camera yaw
    if (this.activeCameraMode === 'firstPerson' || rot.useControllerRotationYaw) {
      this._meshYaw = this.yaw;
      this.gameObject.mesh.rotation.set(0, this._meshYaw, 0);
      return;
    }

    // Orient to movement direction (third-person)
    if (rot.orientRotationToMovement) {
      const flatVel = new THREE.Vector2(moveVel.x, moveVel.z);
      if (flatVel.lengthSq() > 0.001) {
        const targetYaw = Math.atan2(moveVel.x, moveVel.z);
        const maxRotation = (rot.rotationRate * Math.PI / 180) * dt;
        let diff = targetYaw - this._meshYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < maxRotation) {
          this._meshYaw = targetYaw;
        } else {
          this._meshYaw += Math.sign(diff) * maxRotation;
        }
      }
    }

    // Fix 7: Rotation X/Z always locked  capsule stays upright
    this.gameObject.mesh.rotation.set(0, this._meshYaw, 0);
  }

  // ---- Movement direction (WASD -> world-space) ----

  private _calculateMovementDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    if (this.input.moveForward) dir.z -= 1;
    if (this.input.moveBackward) dir.z += 1;
    if (this.input.moveLeft) dir.x -= 1;
    if (this.input.moveRight) dir.x += 1;

    // ---- Flying mode: full 3D movement ----
    if (this.movementMode === 'flying') {
      if (dir.lengthSq() > 0) dir.normalize();
      // Rotate by camera yaw + pitch for 3D flight direction
      const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
      dir.applyEuler(euler);
      // Jump = ascend, Crouch = descend (world Y)
      if (this.input.jump) dir.y += 1;
      if (this.input.crouch) dir.y -= 1;
      if (dir.lengthSq() > 1) dir.normalize();
      return dir;
    }

    // ---- Swimming mode: 3D with slight pitch influence ----
    if (this.movementMode === 'swimming') {
      if (dir.lengthSq() > 0) dir.normalize();
      const euler = new THREE.Euler(this.pitch * 0.5, this.yaw, 0, 'YXZ');
      dir.applyEuler(euler);
      if (this.input.jump) dir.y += 1;
      if (this.input.crouch) dir.y -= 1;
      if (dir.lengthSq() > 1) dir.normalize();
      return dir;
    }

    if (dir.lengthSq() === 0) return dir;
    dir.normalize();

    // Rotate direction by camera yaw
    const euler = new THREE.Euler(0, this.yaw, 0, 'YXZ');
    dir.applyEuler(euler);

    // Air control is now handled in _applyHorizontalPhysics —
    // just return the raw direction for the velocity system.
    return dir;
  }

  // ---- Current movement speed (delegates to movement component) ----

  private _currentSpeed(): number {
    return this.movementComponent.getSpeed();
  }

  /** Speed that respects the actual run state (used by momentum system) */
  private _currentSpeedForRun(isRunning: boolean): number {
    const m = this.config.movement;
    if (this.movementMode === 'flying') return m.flySpeed;
    if (this.movementMode === 'swimming') return m.swimSpeed;
    if (this.isCrouching) return m.crouchSpeed;
    if (isRunning && m.canRun) return m.runSpeed;
    return m.walkSpeed;
  }

  // ---- Camera update ----
  // Fix 1: Camera raycasts IGNORE own character capsule
  // Fix 3: Camera mode is locked; only changes via setCameraMode() blueprint node

  private _updateCamera(dt: number, physics: PhysicsWorld): void {
    const cam = this.config.camera;
    const sa = this.config.springArm;
    const charPos = this.gameObject.mesh.position;

    // ---- Top-Down / Isometric / RTS camera modes ----
    if (this.activeCameraMode === 'topDown' || this.activeCameraMode === 'isometric' || this.activeCameraMode === 'rts') {
      this._updateTopDownCamera(dt);
      return;
    }

    if (this.activeCameraMode === 'firstPerson') {
      this.camera.position.set(
        charPos.x + cam.offset.x,
        charPos.y + cam.offset.y,
        charPos.z + cam.offset.z,
      );
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

      // Hide mesh in first person
      if (this.gameObject.mesh.visible) {
        this.gameObject.mesh.visible = false;
      }
    } else if (sa) {
      // Show mesh in third person
      if (!this.gameObject.mesh.visible) {
        this.gameObject.mesh.visible = true;
      }

      // -- 1. Compute boom origin --
      const boomOrigin = new THREE.Vector3(
        charPos.x + sa.targetOffset.x,
        charPos.y + sa.targetOffset.y,
        charPos.z + sa.targetOffset.z,
      );

      // -- 2. Effective yaw/pitch (with optional rotation lag) --
      let effectiveYaw = this.yaw;
      let effectivePitch = this.pitch;

      if (sa.enableCameraRotationLag && this._lagInitialized) {
        const rotLerpFactor = Math.min(1, sa.cameraRotationLagSpeed * dt);
        this._lagYaw += (this.yaw - this._lagYaw) * rotLerpFactor;
        this._lagPitch += (this.pitch - this._lagPitch) * rotLerpFactor;
        effectiveYaw = this._lagYaw;
        effectivePitch = this._lagPitch;
      } else {
        this._lagYaw = this.yaw;
        this._lagPitch = this.pitch;
      }

      // -- 3. Arm direction --
      const armDir = new THREE.Vector3(
        Math.sin(effectiveYaw) * Math.cos(effectivePitch),
        -Math.sin(effectivePitch),
        Math.cos(effectiveYaw) * Math.cos(effectivePitch),
      );

      let effectiveArmLength = sa.armLength;

      // -- 4. Spring Arm collision test (Fix 1: ignores own character) --
      if (sa.doCollisionTest && physics.world) {
        const ray = new RAPIER.Ray(
          { x: boomOrigin.x, y: boomOrigin.y, z: boomOrigin.z },
          { x: armDir.x, y: armDir.y, z: armDir.z },
        );

        // Use predicate to exclude own character's collider
        const ownCollider = this.collider;
        const hit = physics.world.castRay(
          ray,
          sa.armLength + sa.probeSize,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          (collider: RAPIER.Collider) => {
            return collider.handle !== ownCollider?.handle;
          },
        );
        if (hit) {
          const hitDist = hit.timeOfImpact;
          if (hitDist < sa.armLength) {
            effectiveArmLength = Math.max(sa.probeSize, hitDist - sa.probeSize);
          }
        }
      }

      // Smooth arm retraction
      const lerpSpeed = effectiveArmLength < this._currentArmLength ? 15 : 5;
      this._currentArmLength += (effectiveArmLength - this._currentArmLength) * Math.min(1, lerpSpeed * dt);

      // -- 5. Compute camera position --
      const idealCamPos = new THREE.Vector3(
        boomOrigin.x + armDir.x * this._currentArmLength + sa.socketOffset.x,
        boomOrigin.y + armDir.y * this._currentArmLength + sa.socketOffset.y,
        boomOrigin.z + armDir.z * this._currentArmLength + sa.socketOffset.z,
      );

      // -- 6. Optional position lag --
      if (sa.enableCameraLag && this._lagInitialized) {
        const lagFactor = Math.min(1, sa.cameraLagSpeed * dt);
        this._lagPosition.lerp(idealCamPos, lagFactor);
        this.camera.position.copy(this._lagPosition);
      } else {
        this.camera.position.copy(idealCamPos);
        this._lagPosition.copy(idealCamPos);
      }

      this._lagInitialized = true;

      // -- 7. Look at the boom origin --
      this.camera.lookAt(boomOrigin);
    } else {
      // Fallback: simple third-person orbit
      const dist = 5;
      const height = 2;
      const camX = charPos.x - Math.sin(this.yaw) * dist;
      const camZ = charPos.z - Math.cos(this.yaw) * dist;
      const camY = charPos.y + height;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(charPos.x, charPos.y + 1, charPos.z);
    }
  }

  // ---- Top-Down / Isometric / RTS camera ----

  private _updateTopDownCamera(dt: number): void {
    const charPos = this.gameObject.mesh.position;
    const td = this.config.topDownCamera;
    if (!td) return;

    // Ensure mesh is visible
    if (!this.gameObject.mesh.visible) {
      this.gameObject.mesh.visible = true;
    }

    // Edge scrolling (RTS mode only)
    if (this.activeCameraMode === 'rts' && td.edgeScrollSpeed > 0 && this._canvas) {
      const rect = this._canvas.getBoundingClientRect();
      const mx = this._mouseScreenX - rect.left;
      const my = this._mouseScreenY - rect.top;
      const margin = td.edgeScrollMargin;
      if (mx < margin) this._topDownPanOffset.x -= td.edgeScrollSpeed * dt;
      if (mx > rect.width - margin) this._topDownPanOffset.x += td.edgeScrollSpeed * dt;
      if (my < margin) this._topDownPanOffset.z -= td.edgeScrollSpeed * dt;
      if (my > rect.height - margin) this._topDownPanOffset.z += td.edgeScrollSpeed * dt;
    }

    // Compute look-at target
    let lookTarget: THREE.Vector3;
    if (this.activeCameraMode === 'rts') {
      // RTS: camera is free-panning, centered on panOffset
      lookTarget = new THREE.Vector3(
        charPos.x + this._topDownPanOffset.x,
        charPos.y,
        charPos.z + this._topDownPanOffset.z,
      );
    } else {
      // topDown / isometric: camera follows character
      lookTarget = charPos.clone();
    }

    // Camera angle (0 = straight down, 45 = isometric)
    let angle = td.cameraAngle * Math.PI / 180;
    if (this.activeCameraMode === 'isometric') {
      angle = Math.max(angle, 30 * Math.PI / 180); // At least 30° for isometric
    }

    // Position camera above and behind based on angle
    const height = this._topDownZoom * Math.cos(angle);
    const offset = this._topDownZoom * Math.sin(angle);
    this.camera.position.set(
      lookTarget.x,
      lookTarget.y + height,
      lookTarget.z + offset,
    );
    this.camera.lookAt(lookTarget);
  }

  // ---- Blueprint API ----

  addMovementInput(dir: {x: number; y: number; z: number}, scale: number): void {
    const localDir = new THREE.Vector3(dir.x, dir.y, -dir.z);
    const euler = new THREE.Euler(0, this.yaw, 0, 'YXZ');
    localDir.applyEuler(euler);

    const speed = this._currentSpeed();
    this.pendingMovement.x += localDir.x * scale * speed;
    this.pendingMovement.y += localDir.y * scale * speed;
    this.pendingMovement.z += localDir.z * scale * speed;
  }

  jump(): void {
    this.movementComponent.jump();
  }

  stopJumping(): void {
    this.movementComponent.stopJumping();
  }

  crouch(): void {
    this.movementComponent.crouch();
  }

  uncrouch(): void {
    this.movementComponent.uncrouch();
  }

  /** Start flying — zero gravity, 6-axis movement */
  startFlying(): void {
    this.movementComponent.startFlying();
  }

  /** Stop flying — resume normal gravity (will fall) */
  stopFlying(): void {
    this.movementComponent.stopFlying();
  }

  /** Start swimming — buoyancy physics, 3D movement */
  startSwimming(): void {
    this.movementComponent.startSwimming();
  }

  /** Stop swimming — resume normal gravity */
  stopSwimming(): void {
    this.movementComponent.stopSwimming();
  }

  setMovementMode(mode: MovementMode): void {
    this.movementComponent.setMovementMode(mode);
  }

  setMaxWalkSpeed(speed: number): void {
    this.movementComponent.setMaxWalkSpeed(speed);
  }

  getVelocity(): THREE.Vector3 {
    return this.movementComponent.getVelocity();
  }

  getSpeed(): number {
    return this.movementComponent.getHorizontalSpeed();
  }

  isMoving(): boolean {
    return this.movementComponent.isMoving();
  }

  launchCharacter(launchVelocity: {x: number; y: number; z: number}, overrideXY: boolean, overrideZ: boolean): void {
    this.movementComponent.launch(launchVelocity, overrideXY, overrideZ);
  }

  /**
   * Set Camera Mode  Fix 6: only changes via blueprint (force=true).
   * If force=false, checks cameraSettings.allowModeSwitching.
   */
  setCameraMode(mode: CameraMode, force: boolean = true): void {
    if (!force && !this.config.cameraSettings?.allowModeSwitching) return;
    this.activeCameraMode = mode;
    if (mode === 'firstPerson') {
      this.gameObject.mesh.visible = false;
    } else {
      this.gameObject.mesh.visible = true;
    }
  }

  setFOV(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  getCameraLocation(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  getCameraRotation(): THREE.Euler {
    return this.camera.rotation.clone();
  }

  // ---- Spring Arm Blueprint API ----

  getSpringArmLength(): number {
    return this.config.springArm?.armLength ?? 0;
  }

  setSpringArmLength(length: number): void {
    if (this.config.springArm) this.config.springArm.armLength = length;
  }

  getSpringArmTargetOffset(): { x: number; y: number; z: number } {
    return this.config.springArm?.targetOffset ?? { x: 0, y: 0, z: 0 };
  }

  setSpringArmTargetOffset(x: number, y: number, z: number): void {
    if (this.config.springArm) {
      this.config.springArm.targetOffset = { x, y, z };
    }
  }

  getSpringArmSocketOffset(): { x: number; y: number; z: number } {
    return this.config.springArm?.socketOffset ?? { x: 0, y: 0, z: 0 };
  }

  setSpringArmSocketOffset(x: number, y: number, z: number): void {
    if (this.config.springArm) {
      this.config.springArm.socketOffset = { x, y, z };
    }
  }

  setSpringArmCollision(enabled: boolean): void {
    if (this.config.springArm) this.config.springArm.doCollisionTest = enabled;
  }

  setCameraLag(enabled: boolean, speed?: number): void {
    if (this.config.springArm) {
      this.config.springArm.enableCameraLag = enabled;
      if (speed !== undefined) this.config.springArm.cameraLagSpeed = speed;
    }
  }

  setCameraRotationLag(enabled: boolean, speed?: number): void {
    if (this.config.springArm) {
      this.config.springArm.enableCameraRotationLag = enabled;
      if (speed !== undefined) this.config.springArm.cameraRotationLagSpeed = speed;
    }
  }

  // ---- Top-Down / RTS Blueprint API ----

  /** Get current zoom level for top-down/RTS camera */
  getTopDownZoom(): number {
    return this._topDownZoom;
  }

  /** Set zoom level for top-down/RTS camera */
  setTopDownZoom(zoom: number): void {
    const td = this.config.topDownCamera;
    if (td) {
      this._topDownZoom = Math.max(td.zoomMin, Math.min(td.zoomMax, zoom));
    }
  }

  /** Get RTS camera pan offset */
  getTopDownPanOffset(): { x: number; y: number; z: number } {
    return { x: this._topDownPanOffset.x, y: this._topDownPanOffset.y, z: this._topDownPanOffset.z };
  }

  /** Set RTS camera pan offset */
  setTopDownPanOffset(x: number, y: number, z: number): void {
    this._topDownPanOffset.set(x, y, z);
  }

  /** Reset RTS camera pan to center on character */
  resetTopDownPan(): void {
    this._topDownPanOffset.set(0, 0, 0);
  }

  // ---- Cleanup ----

  destroy(): void {
    this.movementComponent.destroy();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onRawMouseMove);
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onClick);
      this._canvas.removeEventListener('wheel', this._onWheel);
      this._canvas.removeEventListener('mousedown', this._onMouseDown);
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this._keysDown.clear();

    // Remove debug capsule from scene
    if (this._debugCapsule && this._debugCapsule.parent) {
      this._debugCapsule.parent.remove(this._debugCapsule);
      this._debugCapsule.traverse(child => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      this._debugCapsule = null;
    }
  }
}

// ============================================================
//  CharacterControllerManager  Manages all active controllers
// ============================================================

export class CharacterControllerManager {
  public controllers: CharacterController[] = [];
  /** The currently "possessed" (active) character controller */
  public activePawn: CharacterController | null = null;

  createController(go: GameObject, config: CharacterPawnConfig, canvas: HTMLCanvasElement, physics: PhysicsWorld, threeScene?: THREE.Scene): CharacterController {
    const ctrl = new CharacterController(go, config, canvas);
    ctrl.initPhysics(physics);
    go.characterController = ctrl;
    this.controllers.push(ctrl);

    // Setup play-mode visuals
    ctrl.setupPlayModeVisuals();

    // Create debug capsule wireframe if configured
    if (threeScene) {
      ctrl.createDebugCapsule(threeScene);
    }

    // Auto-possess the first pawn
    if (!this.activePawn) {
      this.activePawn = ctrl;
    }

    return ctrl;
  }

  update(dt: number, physics: PhysicsWorld): void {
    for (const ctrl of this.controllers) {
      ctrl.update(dt, physics);
    }
  }

  /** Get the camera of the active pawn (for rendering) */
  getActiveCamera(): THREE.PerspectiveCamera | null {
    return this.activePawn?.camera ?? null;
  }

  destroyAll(): void {
    for (const ctrl of this.controllers) {
      ctrl.destroy();
    }
    this.controllers = [];
    this.activePawn = null;
  }
}
