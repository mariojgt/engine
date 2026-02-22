// ============================================================
//  CharacterPawnData — Data types for Character Pawn actors
//  Defines movement, camera, and input binding configuration.
// ============================================================

// ---- Character Movement Configuration ----

export type MovementMode = 'walking' | 'falling' | 'jumping' | 'crouching' | 'running' | 'swimming' | 'flying';

export interface CharacterMovementConfig {
  walkSpeed: number;
  runSpeed: number;
  crouchSpeed: number;
  jumpVelocity: number;
  airControl: number;
  groundFriction: number;
  brakingDeceleration: number;
  gravity: number;
  maxStepHeight: number;
  maxSlopeAngle: number;
  canWalk: boolean;
  canRun: boolean;
  canJump: boolean;
  canCrouch: boolean;
  canSwim: boolean;
  canFly: boolean;
  /** Speed when flying (units/sec) */
  flySpeed: number;
  /** Speed when swimming (units/sec) */
  swimSpeed: number;
  /** Buoyancy force multiplier (1.0 = neutrally buoyant) */
  buoyancy: number;
}

export function defaultCharacterMovementConfig(): CharacterMovementConfig {
  return {
    walkSpeed: 6,
    runSpeed: 10,
    crouchSpeed: 3,
    jumpVelocity: 8,
    airControl: 0.2,
    groundFriction: 8.0,
    brakingDeceleration: 20,
    gravity: -20,
    maxStepHeight: 0.3,
    maxSlopeAngle: 45,
    canWalk: true,
    canRun: true,
    canJump: true,
    canCrouch: true,
    canSwim: false,
    canFly: false,
    flySpeed: 8,
    swimSpeed: 4,
    buoyancy: 1.0,
  };
}

// ---- Camera Component Configuration ----

export type CameraMode = 'firstPerson' | 'thirdPerson' | 'topDown' | 'isometric' | 'rts';

export interface CameraComponentConfig {
  cameraMode: CameraMode;
  fieldOfView: number;
  /** Camera offset from character root (eye height in first-person) */
  offset: { x: number; y: number; z: number };
  /** Near clip plane */
  nearClip: number;
  /** Far clip plane */
  farClip: number;
  /** Post process enabled (for future use) */
  postProcessEnabled: boolean;
  /** Sensitivity */
  mouseSensitivity: number;
  /** Pitch clamp (degrees) */
  pitchMin: number;
  pitchMax: number;
}

export function defaultCameraConfig(mode: CameraMode = 'firstPerson'): CameraComponentConfig {
  return {
    cameraMode: mode,
    fieldOfView: 75,
    offset: mode === 'firstPerson'
      ? { x: 0, y: 0.8, z: 0 }
      : { x: 0, y: 1.0, z: 0 },
    nearClip: 0.1,
    farClip: 1000,
    postProcessEnabled: false,
    mouseSensitivity: 0.15,
    pitchMin: -89,
    pitchMax: 89,
  };
}

// ---- 2D Orthographic Camera Configuration ----

/**
 * Camera configuration for 2D orthographic (side-scroller / top-down) pawns.
 * "Field of View" in 2D is controlled by zoom: lower zoom = wider view.
 */
export interface Camera2DConfig {
  /**
   * Default zoom level at play start (1.0 = 1:1 view).
   * Works as the 2D equivalent of FOV — decrease to widen the view,
   * increase to zoom in.
   */
  defaultZoom: number;
  /** Pixels per world unit — determines how many screen pixels equal 1 unit. */
  pixelsPerUnit: number;
  /** Camera lag smoothing applied when following the pawn (0 = instant snap, values near 1 = heavy lag). */
  followSmoothing: number;
  /** Dead zone half-width (world units) — camera won't move until pawn leaves this region horizontally. */
  deadZoneX: number;
  /** Dead zone half-height (world units) — camera won't move until pawn leaves this region vertically. */
  deadZoneY: number;
  /** When true, zoom is constrained to integer multiples to prevent sub-pixel blurring. */
  pixelPerfect: boolean;
}

export function defaultCamera2DConfig(): Camera2DConfig {
  return {
    defaultZoom: 1.0,
    pixelsPerUnit: 100,
    followSmoothing: 0.15,
    deadZoneX: 0.5,
    deadZoneY: 0.5,
    pixelPerfect: false,
  };
}

// ---- Spring Arm (Camera Boom) Configuration ----

export interface SpringArmConfig {
  /** Target offset from the character root (where the boom starts) */
  targetOffset: { x: number; y: number; z: number };
  /** Socket offset (final camera offset from the end of the arm) */
  socketOffset: { x: number; y: number; z: number };
  /** Length of the arm */
  armLength: number;
  /** Enable camera collision — arm retracts to avoid clipping through geometry */
  doCollisionTest: boolean;
  /** Probe size for collision test (sphere radius) */
  probeSize: number;
  /** UE-style collision profile for the camera boom ray.
   *  Controls which channels the camera ray blocks against (retracts)
   *  and which it ignores (passes through). */
  collisionProfile: CollisionProfile;
  /** Camera lag — smooth follow (0 = instant, higher = more lag) */
  enableCameraLag: boolean;
  cameraLagSpeed: number;
  /** Camera rotation lag */
  enableCameraRotationLag: boolean;
  cameraRotationLagSpeed: number;
  /** Inherit control rotation (yaw/pitch from mouse) */
  inheritPitch: boolean;
  inheritYaw: boolean;
  inheritRoll: boolean;
}

export function defaultSpringArmConfig(): SpringArmConfig {
  return {
    targetOffset: { x: 0, y: 0.9, z: 0 },
    socketOffset: { x: 0, y: 0, z: 0 },
    armLength: 4.0,
    doCollisionTest: true,
    probeSize: 0.12,
    collisionProfile: defaultCameraCollisionProfile(),
    enableCameraLag: false,
    cameraLagSpeed: 10,
    enableCameraRotationLag: false,
    cameraRotationLagSpeed: 10,
    inheritPitch: true,
    inheritYaw: true,
    inheritRoll: false,
  };
}

// ---- Rotation Settings ----

export interface CharacterRotationConfig {
  /** Controller rotation → character yaw (first-person style) */
  useControllerRotationPitch: boolean;
  useControllerRotationYaw: boolean;
  useControllerRotationRoll: boolean;
  /** Character mesh faces the movement direction (third-person style) */
  orientRotationToMovement: boolean;
  /** Degrees per second for orient-to-movement rotation */
  rotationRate: number;
}

export function defaultRotationConfig(): CharacterRotationConfig {
  return {
    useControllerRotationPitch: false,
    useControllerRotationYaw: false,
    useControllerRotationRoll: false,
    orientRotationToMovement: true,
    rotationRate: 540,
  };
}

import {
  type CollisionProfile,
  defaultPawnCollisionProfile,
  defaultCameraCollisionProfile,
} from './CollisionTypes';

// ---- Capsule Collision Configuration ----

export interface CharacterCapsuleConfig {
  radius: number;
  height: number;
  /** Show wireframe capsule in editor */
  showInEditor: boolean;
  /** Show debug wireframe capsule during play */
  showInPlay: boolean;
  /** UE-style collision profile — per-channel Block/Overlap/Ignore responses */
  collisionProfile: CollisionProfile;
}

export function defaultCapsuleConfig(): CharacterCapsuleConfig {
  return {
    radius: 0.35,
    height: 1.8,
    showInEditor: true,
    showInPlay: false,
    collisionProfile: defaultPawnCollisionProfile(),
  };
}

// ---- Camera Mode Lock Settings ----

export interface CameraModeSettings {
  /** Default camera mode at play start */
  defaultMode: CameraMode;
  /** Whether switching is allowed at runtime (blueprint only) */
  allowModeSwitching: boolean;
}

export function defaultCameraModeSettings(): CameraModeSettings {
  return {
    defaultMode: 'thirdPerson',
    allowModeSwitching: false,
  };
}

// ---- Top-Down / RTS Camera Config ----

export interface TopDownCameraConfig {
  /** Camera height above the pawn (or ground for RTS) */
  cameraHeight: number;
  /** Minimum zoom distance */
  zoomMin: number;
  /** Maximum zoom distance */
  zoomMax: number;
  /** Zoom speed (scroll wheel) */
  zoomSpeed: number;
  /** Edge scroll speed (pixels/sec) — 0 disables edge scrolling */
  edgeScrollSpeed: number;
  /** Edge scroll margin (pixels from screen edge) */
  edgeScrollMargin: number;
  /** Camera angle in degrees from vertical (0 = straight down, 45 = isometric) */
  cameraAngle: number;
  /** Pan speed for middle-mouse drag */
  panSpeed: number;
  /** Enable click-to-move (left click raycasts to ground) */
  clickToMove: boolean;
}

export function defaultTopDownCameraConfig(): TopDownCameraConfig {
  return {
    cameraHeight: 15,
    zoomMin: 5,
    zoomMax: 50,
    zoomSpeed: 2,
    edgeScrollSpeed: 15,
    edgeScrollMargin: 20,
    cameraAngle: 0,
    panSpeed: 10,
    clickToMove: false,
  };
}

// ---- Input Bindings ----

export interface CharacterInputBindings {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  jump: string;
  crouch: string;
  run: string;
  mouseLook: boolean;
}

export function defaultInputBindings(): CharacterInputBindings {
  return {
    moveForward: 'W',
    moveBackward: 'S',
    moveLeft: 'A',
    moveRight: 'D',
    jump: 'Space',
    crouch: 'ControlLeft',
    run: 'ShiftLeft',
    mouseLook: true,
  };
}

// ---- Full Character Pawn Config (stored on ActorAsset) ----

export interface CharacterPawnConfig {
  capsule: CharacterCapsuleConfig;
  movement: CharacterMovementConfig;
  camera: CameraComponentConfig;
  springArm: SpringArmConfig;
  inputBindings: CharacterInputBindings;
  rotation: CharacterRotationConfig;
  cameraSettings: CameraModeSettings;
  /** Top-down / RTS camera configuration */
  topDownCamera: TopDownCameraConfig;
  /**
   * When false, movement is driven entirely by Blueprint nodes (AddMovementInput, Jump, etc.).
   * When true, the built-in WASD/jump/crouch input handling is used.
   * Default: false — new pawns have pre-populated movement nodes.
   */
  useBuiltInMovement: boolean;
  /** Default movement mode at spawn — like UE's DefaultLandMovementMode */
  defaultMovementMode: MovementMode;
}

export function defaultCharacterPawnConfig(): CharacterPawnConfig {
  return {
    capsule: defaultCapsuleConfig(),
    movement: defaultCharacterMovementConfig(),
    camera: defaultCameraConfig('thirdPerson'),
    springArm: defaultSpringArmConfig(),
    inputBindings: defaultInputBindings(),
    rotation: defaultRotationConfig(),
    cameraSettings: defaultCameraModeSettings(),
    topDownCamera: defaultTopDownCameraConfig(),
    useBuiltInMovement: false,
    defaultMovementMode: 'walking',
  };
}
