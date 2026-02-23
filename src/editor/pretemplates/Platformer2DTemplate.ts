// ============================================================
//  Platformer 2D Template — Side-scrolling character pawn
//
//  Features out of the box:
//    • Horizontal movement (A/D) with acceleration/deceleration
//    • Double jump (Space) with coyote time & jump buffering
//    • Jump cut (release Space to shorten jump height)
//    • Sprite flip to face movement direction
//    • Gravity enabled (scale 1.0)
//    • Camera 2D follow with pixel-perfect option
// ============================================================

import type { CharacterMovement2DProperties } from '../../engine/CharacterMovement2D';

// ── Blueprint event graph (node + connection data) ──────────

export const platformer2DEventGraph = {
  nodeData: {
    nodes: [
      // ── Core lifecycle events ──
      { id: 'p_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 },  data: {} },
      { id: 'p_tick',      type: 'EventTickNode',      position: { x: 80, y: 220 }, data: {} },

      // ── Horizontal movement ──
      { id: 'p_move',     type: 'AddMovementInput2DNode', position: { x: 520, y: 220 }, data: {} },
      { id: 'p_axis_lr',  type: 'InputAxisNode',          position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },

      // ── Jump (Space) ──
      { id: 'p_jump_key',  type: 'InputKeyEventNode',  position: { x: 80,  y: 560 }, data: { selectedKey: 'Space' } },
      { id: 'p_jump',      type: 'Jump2DNode',         position: { x: 460, y: 540 }, data: {} },
      { id: 'p_stopjump',  type: 'StopJump2DNode',     position: { x: 460, y: 640 }, data: {} },

      // ── Flip sprite to face direction ──
      { id: 'p_flip', type: 'FlipSpriteDirection2DNode', position: { x: 820, y: 220 }, data: {} },
    ],
    connections: [
      // Tick → Move → Flip
      { id: 'pc1', source: 'p_tick',     sourceOutput: 'exec',     target: 'p_move',     targetInput: 'exec' },
      { id: 'pc2', source: 'p_move',     sourceOutput: 'exec',     target: 'p_flip',     targetInput: 'exec' },
      // Axis D/A → X input
      { id: 'pc3', source: 'p_axis_lr',  sourceOutput: 'value',    target: 'p_move',     targetInput: 'x' },
      // Space pressed → Jump
      { id: 'pc4', source: 'p_jump_key', sourceOutput: 'pressed',  target: 'p_jump',     targetInput: 'exec' },
      // Space released → Stop Jump (jump cut)
      { id: 'pc5', source: 'p_jump_key', sourceOutput: 'released', target: 'p_stopjump', targetInput: 'exec' },
    ],
  },
};

// ── Character Movement 2D configuration ─────────────────────

export const platformer2DMovementConfig: Partial<CharacterMovement2DProperties> = {
  moveSpeed:       300,
  runSpeed:        600,
  acceleration:    2000,
  deceleration:    2000,
  airControl:      0.8,
  jumpForce:       600,
  maxJumps:        2,
  coyoteTime:      0.10,
  jumpBufferTime:  0.10,
  maxFallSpeed:    -1200,
  jumpCut:         true,
  gravityScale:    1.0,
  linearDrag:      0.0,
  freezeRotation:  true,
};

// ── Combined export ─────────────────────────────────────────

export const platformer2DTemplate = {
  eventGraph:       platformer2DEventGraph,
  movementConfig:   platformer2DMovementConfig,
};
