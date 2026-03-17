// ============================================================
//  First Person 3D Template — FPS character pawn
//
//  Features out of the box:
//    • First-person camera (useControllerRotationYaw)
//    • Directional movement (WASD) with AddMovementInput
//    • Jump (Space) with StopJumping on release
//    • Crosshair widget creation (user selects their Widget BP)
//    • Left-click shooting: SpawnActorFromClass → LaunchProjectileSimple
//      using camera location + actor forward vector
//    • Capsule collider + Camera (no spring arm boom)
//    • CharacterMovement component included
// ============================================================

import type { CharacterPawnConfig } from '../../engine/CharacterPawnData';

// ── Blueprint event graph (node + connection data) ──────────

export const firstPerson3DEventGraph = {
  nodeData: {
    nodes: [
      // ═══════════════════════════════════════════════
      //  SECTION 1 — Lifecycle & Crosshair UI
      // ═══════════════════════════════════════════════

      // BeginPlay → Create Widget → Add to Viewport
      { id: 'fp_beginplay', type: 'EventBeginPlayNode', position: { x: 80,  y: 40 },  data: {} },
      { id: 'fp_createwidget', type: 'CreateWidgetNode', position: { x: 380, y: 40 },  data: { widgetBPId: '', widgetBPName: '(select crosshair)' } },
      { id: 'fp_addviewport',  type: 'AddToViewportNode', position: { x: 720, y: 40 },  data: {} },

      // ═══════════════════════════════════════════════
      //  SECTION 2 — WASD Movement (every Tick)
      // ═══════════════════════════════════════════════

      { id: 'fp_tick',      type: 'EventTickNode',        position: { x: 80,  y: 260 }, data: {} },
      { id: 'fp_move',      type: 'AddMovementInputNode', position: { x: 520, y: 260 }, data: {} },
      { id: 'fp_axis_lr',   type: 'InputAxisNode',        position: { x: 200, y: 440 }, data: { positiveKey: 'D', negativeKey: 'A' } },
      { id: 'fp_axis_fb',   type: 'InputAxisNode',        position: { x: 200, y: 570 }, data: { positiveKey: 'W', negativeKey: 'S' } },

      // ═══════════════════════════════════════════════
      //  SECTION 3 — Jump (Space)
      // ═══════════════════════════════════════════════

      { id: 'fp_jump_key',  type: 'InputKeyEventNode',  position: { x: 80,  y: 720 }, data: { selectedKey: 'Space' } },
      { id: 'fp_jump',      type: 'JumpNode',           position: { x: 460, y: 700 }, data: {} },
      { id: 'fp_stopjump',  type: 'StopJumpingNode',    position: { x: 460, y: 800 }, data: {} },

      // ═══════════════════════════════════════════════
      //  SECTION 4 — Shooting (Left Mouse Click)
      // ═══════════════════════════════════════════════

      // Mouse click event
      { id: 'fp_shoot_key', type: 'InputKeyEventNode', position: { x: 80,   y: 960 },  data: { selectedKey: 'LeftMouse' } },

      // Spawn the bullet actor (user selects their bullet actor class)
      { id: 'fp_spawn',     type: 'SpawnActorFromClassNode', position: { x: 460, y: 940 },  data: { targetClassId: '', targetClassName: '(select bullet class)' } },

      // Get camera location for bullet spawn position
      { id: 'fp_camloc',    type: 'GetCameraLocationNode',  position: { x: 200, y: 1140 }, data: {} },

      // Get actor forward vector for bullet direction
      { id: 'fp_fwd',       type: 'GetActorForwardVectorNode', position: { x: 200, y: 1300 }, data: {} },

      // Launch the spawned actor as a projectile
      { id: 'fp_launch',    type: 'LaunchProjectileSimpleNode', position: { x: 860, y: 940 }, data: {} },

      // Bullet speed constant
      { id: 'fp_speed',     type: 'FloatNode',  position: { x: 620, y: 1200 }, data: { value: 50 } },
    ],
    connections: [
      // ── Crosshair UI ──
      // BeginPlay → Create Widget → Add to Viewport
      { id: 'fpc1', source: 'fp_beginplay',    sourceOutput: 'exec',    target: 'fp_createwidget', targetInput: 'exec' },
      { id: 'fpc2', source: 'fp_createwidget', sourceOutput: 'exec',    target: 'fp_addviewport',  targetInput: 'exec' },
      { id: 'fpc3', source: 'fp_createwidget', sourceOutput: 'widget',  target: 'fp_addviewport',  targetInput: 'widget' },

      // ── Movement ──
      // Tick → AddMovementInput
      { id: 'fpc4', source: 'fp_tick',     sourceOutput: 'exec',  target: 'fp_move',  targetInput: 'exec' },
      // Axis D/A → X
      { id: 'fpc5', source: 'fp_axis_lr', sourceOutput: 'value', target: 'fp_move',  targetInput: 'x' },
      // Axis W/S → Z (forward/back)
      { id: 'fpc6', source: 'fp_axis_fb', sourceOutput: 'value', target: 'fp_move',  targetInput: 'z' },

      // ── Jump ──
      // Space pressed → Jump
      { id: 'fpc7', source: 'fp_jump_key', sourceOutput: 'pressed',  target: 'fp_jump',     targetInput: 'exec' },
      // Space released → StopJumping
      { id: 'fpc8', source: 'fp_jump_key', sourceOutput: 'released', target: 'fp_stopjump', targetInput: 'exec' },

      // ── Shooting ──
      // LeftMouse pressed → Spawn Actor
      { id: 'fpc9',  source: 'fp_shoot_key', sourceOutput: 'pressed', target: 'fp_spawn',  targetInput: 'exec' },
      // Spawn Actor → Launch Projectile
      { id: 'fpc10', source: 'fp_spawn',     sourceOutput: 'exec',    target: 'fp_launch', targetInput: 'exec' },

      // Camera location → Spawn Actor position
      { id: 'fpc11', source: 'fp_camloc', sourceOutput: 'x', target: 'fp_spawn', targetInput: 'locX' },
      { id: 'fpc12', source: 'fp_camloc', sourceOutput: 'y', target: 'fp_spawn', targetInput: 'locY' },
      { id: 'fpc13', source: 'fp_camloc', sourceOutput: 'z', target: 'fp_spawn', targetInput: 'locZ' },

      // Actor forward vector → Launch Projectile direction
      { id: 'fpc14', source: 'fp_fwd', sourceOutput: 'x', target: 'fp_launch', targetInput: 'dirX' },
      { id: 'fpc15', source: 'fp_fwd', sourceOutput: 'y', target: 'fp_launch', targetInput: 'dirY' },
      { id: 'fpc16', source: 'fp_fwd', sourceOutput: 'z', target: 'fp_launch', targetInput: 'dirZ' },

      // Speed constant → Launch Projectile speed
      { id: 'fpc17', source: 'fp_speed', sourceOutput: 'value', target: 'fp_launch', targetInput: 'speed' },
    ],
  },
};

// ── CharacterPawnConfig overrides for first-person ──────────

export const firstPerson3DConfigOverrides: Partial<CharacterPawnConfig> = {
  camera: {
    cameraMode: 'firstPerson',
    fieldOfView: 90,
    offset: { x: 0, y: 0.8, z: 0 },
    nearClip: 0.1,
    farClip: 1000,
    postProcessEnabled: false,
    mouseSensitivity: 0.15,
    pitchMin: -89,
    pitchMax: 89,
  },
  springArm: {
    targetOffset: { x: 0, y: 0.9, z: 0 },
    socketOffset: { x: 0, y: 0, z: 0 },
    armLength: 0,              // No boom for FPS
    doCollisionTest: false,    // No collision test for FPS
    probeSize: 0.12,
    collisionProfile: { name: 'CameraDefault', responses: {} } as any,
    enableCameraLag: false,
    cameraLagSpeed: 10,
    enableCameraRotationLag: false,
    cameraRotationLagSpeed: 10,
    inheritPitch: true,
    inheritYaw: true,
    inheritRoll: false,
  },
  rotation: {
    useControllerRotationPitch: false,
    useControllerRotationYaw: true,   // FPS: character yaw follows mouse
    useControllerRotationRoll: false,
    orientRotationToMovement: false,  // FPS: don't turn to face movement
    rotationRate: 540,
  },
  cameraSettings: {
    defaultMode: 'firstPerson',
    allowModeSwitching: false,
  },
};

// ── Combined export ─────────────────────────────────────────

export const firstPerson3DTemplate = {
  eventGraph:     firstPerson3DEventGraph,
  configOverrides: firstPerson3DConfigOverrides,
};
