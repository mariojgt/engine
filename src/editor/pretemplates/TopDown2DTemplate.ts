// ============================================================
//  Top-Down 2D Template — 4-directional overhead character pawn
//
//  Features out of the box:
//    • 4-directional movement (WASD) with acceleration/deceleration
//    • Gravity disabled (gravityScale 0) — no falling
//    • Vertical deceleration when no Y input (stops naturally)
//    • Camera 2D follow with pixel-perfect option
//    • No jump (maxJumps = 0)
// ============================================================

import type { CharacterMovement2DProperties } from '../../engine/CharacterMovement2D';

// ── Blueprint event graph (node + connection data) ──────────

export const topDown2DEventGraph = {
  nodeData: {
    nodes: [
      // ── Core lifecycle events ──
      { id: 'td_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 },  data: {} },
      { id: 'td_tick',      type: 'EventTickNode',      position: { x: 80, y: 220 }, data: {} },

      // ── 4-directional movement ──
      { id: 'td_move',     type: 'AddMovementInput2DNode', position: { x: 520, y: 220 }, data: {} },
      { id: 'td_axis_lr',  type: 'InputAxisNode',          position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
      { id: 'td_axis_ud',  type: 'InputAxisNode',          position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },
    ],
    connections: [
      // Tick → AddMovementInput2D
      { id: 'tc1', source: 'td_tick',     sourceOutput: 'exec',  target: 'td_move', targetInput: 'exec' },
      // Axis D/A → X
      { id: 'tc2', source: 'td_axis_lr',  sourceOutput: 'value', target: 'td_move', targetInput: 'x' },
      // Axis W/S → Y
      { id: 'tc3', source: 'td_axis_ud',  sourceOutput: 'value', target: 'td_move', targetInput: 'y' },
    ],
  },
};

// ── Character Movement 2D configuration ─────────────────────

export const topDown2DMovementConfig: Partial<CharacterMovement2DProperties> = {
  moveSpeed:       300,
  runSpeed:        600,
  acceleration:    2000,
  deceleration:    2000,
  airControl:      1.0,
  jumpForce:       0,
  maxJumps:        0,
  coyoteTime:      0,
  jumpBufferTime:  0,
  maxFallSpeed:    0,       // 0 = no limit (no gravity means no falling)
  jumpCut:         false,
  gravityScale:    0.0,     // ← KEY: disables gravity at spawn time
  linearDrag:      0.0,
  freezeRotation:  true,
};

// ── Combined export ─────────────────────────────────────────

export const topDown2DTemplate = {
  eventGraph:       topDown2DEventGraph,
  movementConfig:   topDown2DMovementConfig,
};
