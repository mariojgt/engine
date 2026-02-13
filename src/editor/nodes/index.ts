// ============================================================
//  Barrel file — importing each node file triggers registerNode()
//  which populates NODE_PALETTE for the right-click context menu.
// ============================================================

// Shared types & registry
export { NODE_PALETTE, registerNode } from './sockets';
export type { NodeEntry } from './sockets';
export {
  execSocket,
  numSocket,
  boolSocket,
  vec3Socket,
  strSocket,
} from './sockets';

// ── Events ──────────────────────────────────────────────────
export { EventBeginPlayNode } from './events/EventBeginPlayNode';
export { EventTickNode }      from './events/EventTickNode';
export { EventOnDestroyNode } from './events/EventOnDestroyNode';
export { CustomEventNode, CallCustomEventNode } from './events/CustomEventNodes';
export { InputKeyEventNode, IsKeyDownNode, INPUT_KEYS, keyEventCode } from './events/InputKeyNodes';

// ── Flow Control ────────────────────────────────────────────
export { BranchNode }   from './flow-control/BranchNode';
export { SequenceNode } from './flow-control/SequenceNode';
export { ForLoopNode }  from './flow-control/ForLoopNode';
export { DelayNode }    from './flow-control/DelayNode';

// ── Math ────────────────────────────────────────────────────
export { MathAddNode }      from './math/MathAddNode';
export { MathSubtractNode } from './math/MathSubtractNode';
export { MathMultiplyNode } from './math/MathMultiplyNode';
export { MathDivideNode }   from './math/MathDivideNode';
export { SineNode }         from './math/SineNode';
export { CosineNode }       from './math/CosineNode';
export { AbsNode }          from './math/AbsNode';
export { ClampNode }        from './math/ClampNode';
export { LerpNode }         from './math/LerpNode';
export { GreaterThanNode }  from './math/GreaterThanNode';

// ── Values ──────────────────────────────────────────────────
export { FloatNode }     from './values/FloatNode';
export { BooleanNode }   from './values/BooleanNode';
export { TimeNode }      from './values/TimeNode';
export { DeltaTimeNode } from './values/DeltaTimeNode';
export { StringLiteralNode } from './values/StringLiteralNode';
export { Vector3LiteralNode } from './values/Vector3LiteralNode';

// ── Transform ───────────────────────────────────────────────
export { GetPositionNode } from './transform/GetPositionNode';
export { SetPositionNode } from './transform/SetPositionNode';
export { GetRotationNode } from './transform/GetRotationNode';
export { SetRotationNode } from './transform/SetRotationNode';
export { GetScaleNode }    from './transform/GetScaleNode';
export { SetScaleNode }    from './transform/SetScaleNode';

// ── Utility ─────────────────────────────────────────────────
export { PrintStringNode } from './utility/PrintStringNode';

// ── Physics ─────────────────────────────────────────────────
export { AddForceNode }   from './physics/AddForceNode';
export { AddImpulseNode } from './physics/AddImpulseNode';
export { SetVelocityNode } from './physics/SetVelocityNode';

// ── Variables (dynamic) ─────────────────────────────────────
export { GetVariableNode, SetVariableNode, socketForType } from './variables/VariableNodes';
export { MakeStructNode, BreakStructNode } from './variables/StructNodes';

// ── Functions & Macros (dynamic) ────────────────────────────
export {
  FunctionEntryNode,
  FunctionReturnNode,
  FunctionCallNode,
  MacroEntryNode,
  MacroExitNode,
  MacroCallNode,
} from './functions/FunctionNodes';
