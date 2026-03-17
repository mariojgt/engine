// ============================================================
//  Top-Down 3D Template — Overhead camera character pawn
//
//  Features out of the box:
//    • Top-down camera (bird's-eye view)
//    • 4-directional movement (WASD) with AddMovementInput
//    • Orient-to-movement rotation (character faces move dir)
//    • No jump (top-down doesn't need it by default)
//    • Capsule collider + SpringArm + Camera hierarchy
//    • CharacterMovement component included
// ============================================================

import type { CharacterPawnConfig } from '../../engine/CharacterPawnData';

// ── Blueprint event graph (node + connection data) ──────────

export const topDown3DEventGraph = {
  nodeData: {
    nodes: [
      // ── Core lifecycle events ──
      { id: 'td3_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 },  data: {} },
      { id: 'td3_tick',      type: 'EventTickNode',      position: { x: 80, y: 220 }, data: {} },

      // ── 4-directional movement ──
      { id: 'td3_move',     type: 'AddMovementInputNode', position: { x: 520, y: 220 }, data: {} },
      { id: 'td3_axis_lr',  type: 'InputAxisNode',        position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
      { id: 'td3_axis_fb',  type: 'InputAxisNode',        position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },
    ],
    connections: [
      // Tick → AddMovementInput
      { id: 'td3c1', source: 'td3_tick',     sourceOutput: 'exec',  target: 'td3_move', targetInput: 'exec' },
      // Axis D/A → X
      { id: 'td3c2', source: 'td3_axis_lr',  sourceOutput: 'value', target: 'td3_move', targetInput: 'x' },
      // Axis W/S → Z (forward/back)
      { id: 'td3c3', source: 'td3_axis_fb',  sourceOutput: 'value', target: 'td3_move', targetInput: 'z' },
    ],
  },
};

// ── CharacterPawnConfig overrides for top-down 3D ───────────

export const topDown3DConfigOverrides: Partial<CharacterPawnConfig> = {
  camera: {
    cameraMode: 'topDown' as any,
    fieldOfView: 60,
    offset: { x: 0, y: 0, z: 0 },
    nearClip: 0.1,
    farClip: 1000,
    postProcessEnabled: false,
    mouseSensitivity: 0.15,
    pitchMin: -89,
    pitchMax: 89,
  },
  springArm: {
    targetOffset: { x: 0, y: 0, z: 0 },
    socketOffset: { x: 0, y: 0, z: 0 },
    armLength: 15,             // High-up camera boom
    doCollisionTest: false,    // No collision needed top-down
    probeSize: 0.12,
    collisionProfile: { name: 'CameraDefault', responses: {} } as any,
    enableCameraLag: true,     // Smooth camera follow
    cameraLagSpeed: 8,
    enableCameraRotationLag: false,
    cameraRotationLagSpeed: 10,
    inheritPitch: false,       // Don't inherit mouse rotation
    inheritYaw: false,
    inheritRoll: false,
  },
  rotation: {
    useControllerRotationPitch: false,
    useControllerRotationYaw: false,
    useControllerRotationRoll: false,
    orientRotationToMovement: true,    // Character faces movement direction
    rotationRate: 540,
  },
  cameraSettings: {
    defaultMode: 'topDown',
    allowModeSwitching: false,
  },
  topDownCamera: {
    cameraHeight: 15,
    zoomMin: 5,
    zoomMax: 50,
    zoomSpeed: 2,
    edgeScrollSpeed: 0,        // Disabled by default
    edgeScrollMargin: 20,
    cameraAngle: 0,            // Straight down
    panSpeed: 10,
    clickToMove: false,
  },
  inputBindings: {
    moveForward: 'W',
    moveBackward: 'S',
    moveLeft: 'A',
    moveRight: 'D',
    jump: '',                  // No jump for top-down
    crouch: '',
    run: 'ShiftLeft',
    mouseLook: false,          // No mouse look for top-down
  },
};

// ── Combined export ─────────────────────────────────────────

export const topDown3DTemplate = {
  eventGraph:     topDown3DEventGraph,
  configOverrides: topDown3DConfigOverrides,
};
