// ============================================================
//  Character Pawn 3D Template — Third-person character pawn
//
//  Features out of the box:
//    • Directional movement (WASD) with AddMovementInput
//    • Jump (Space) with StopJumping on release
//    • Capsule collider + SpringArm + Camera default hierarchy
//    • CharacterMovement component included
// ============================================================

// ── Blueprint event graph (node + connection data) ──────────

export const characterPawn3DEventGraph = {
  nodeData: {
    nodes: [
      // ── Core lifecycle events ──
      { id: 'def_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 },  data: {} },
      { id: 'def_tick',      type: 'EventTickNode',      position: { x: 80, y: 220 }, data: {} },

      // ── Movement ──
      { id: 'def_move',     type: 'AddMovementInputNode', position: { x: 520, y: 220 }, data: {} },
      { id: 'def_axis_lr',  type: 'InputAxisNode',        position: { x: 200, y: 400 }, data: { positiveKey: 'D', negativeKey: 'A' } },
      { id: 'def_axis_fb',  type: 'InputAxisNode',        position: { x: 200, y: 530 }, data: { positiveKey: 'W', negativeKey: 'S' } },

      // ── Jump (Space) ──
      { id: 'def_jump_key',  type: 'InputKeyEventNode',  position: { x: 80,  y: 700 }, data: { selectedKey: 'Space' } },
      { id: 'def_jump',      type: 'JumpNode',           position: { x: 460, y: 680 }, data: {} },
      { id: 'def_stopjump',  type: 'StopJumpingNode',    position: { x: 460, y: 780 }, data: {} },
    ],
    connections: [
      // Tick → AddMovementInput
      { id: 'c1', source: 'def_tick',     sourceOutput: 'exec',     target: 'def_move',     targetInput: 'exec' },
      // Axis D/A → X
      { id: 'c2', source: 'def_axis_lr',  sourceOutput: 'value',    target: 'def_move',     targetInput: 'x' },
      // Axis W/S → Z (forward/back)
      { id: 'c3', source: 'def_axis_fb',  sourceOutput: 'value',    target: 'def_move',     targetInput: 'z' },
      // Space pressed → Jump
      { id: 'c4', source: 'def_jump_key', sourceOutput: 'pressed',  target: 'def_jump',     targetInput: 'exec' },
      // Space released → StopJumping
      { id: 'c5', source: 'def_jump_key', sourceOutput: 'released', target: 'def_stopjump', targetInput: 'exec' },
    ],
  },
};

// ── Combined export ─────────────────────────────────────────

export const characterPawn3DTemplate = {
  eventGraph: characterPawn3DEventGraph,
};
