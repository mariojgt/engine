// ============================================================
//  Barrel file — importing each node file triggers registerNode()
//  which populates NODE_PALETTE for the right-click context menu.
// ============================================================

// Shared types & registry
export { NODE_PALETTE, registerNode, socketColor, socketsCompatible, SOCKET_COLORS, NODE_CATEGORY_COLORS, getCategoryIcon } from './sockets';
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
export { InputKeyEventNode, IsKeyDownNode, INPUT_KEYS, keyEventCode, inputType } from './events/InputKeyNodes';

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
export { BooleanNode, BoolSelectControl }   from './values/BooleanNode';
export { TimeNode }      from './values/TimeNode';
export { DeltaTimeNode } from './values/DeltaTimeNode';
export { StringLiteralNode } from './values/StringLiteralNode';
export { Vector3LiteralNode } from './values/Vector3LiteralNode';

// ── Conversions ─────────────────────────────────────────────
export { BoolToNumberNode }   from './conversions/BoolToNumber';
export { NumberToBoolNode }   from './conversions/NumberToBool';
export { BoolToStringNode }   from './conversions/BoolToString';
export { StringToBoolNode }   from './conversions/StringToBool';
export { NumberToStringNode } from './conversions/NumberToString';
export { StringToNumberNode } from './conversions/StringToNumber';

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

// ── Physics (extended) ──────────────────────────────────────
export { GetMassNode }              from './physics/GetMassNode';
export { SetMassNode }              from './physics/SetMassNode';
export { GetVelocityNode }          from './physics/GetVelocityNode';
export { GetAngularVelocityNode }   from './physics/GetAngularVelocityNode';
export { SetLinearVelocityNode }    from './physics/SetLinearVelocityNode';
export { SetAngularVelocityNode }   from './physics/SetAngularVelocityNode';
export { IsSimulatingPhysicsNode }  from './physics/IsSimulatingPhysicsNode';
export { SetSimulatePhysicsNode }   from './physics/SetSimulatePhysicsNode';
export { IsGravityEnabledNode }     from './physics/IsGravityEnabledNode';
export { SetGravityEnabledNode }    from './physics/SetGravityEnabledNode';
export { GetGravityScaleNode }      from './physics/GetGravityScaleNode';
export { SetGravityScaleNode }      from './physics/SetGravityScaleNode';
export { SetLinearDampingNode }     from './physics/SetLinearDampingNode';
export { SetAngularDampingNode }    from './physics/SetAngularDampingNode';
export { SetPhysicsMaterialNode }   from './physics/SetPhysicsMaterialNode';
export { GetPhysicsMaterialNode }   from './physics/GetPhysicsMaterialNode';
export { AddTorqueNode }            from './physics/AddTorqueNode';
export { AddForceAtLocationNode }   from './physics/AddForceAtLocationNode';
export { AddImpulseAtLocationNode } from './physics/AddImpulseAtLocationNode';
export { SetConstraintNode }        from './physics/SetConstraintNode';
export {
  OnComponentHitNode,
  OnComponentBeginOverlapNode,
  OnComponentEndOverlapNode,
  OnComponentWakeNode,
  OnComponentSleepNode,
} from './physics/PhysicsEventNodes';

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

// ── Component Nodes ─────────────────────────────────────────
export {
  GetComponentLocationNode,
  SetComponentLocationNode,
  GetComponentRotationNode,
  SetComponentRotationNode,
  GetComponentScaleNode,
  SetComponentScaleNode,
  SetComponentVisibilityNode,
} from './components/MeshComponentNodes';
export {
  SetTriggerEnabledNode,
  GetTriggerEnabledNode,
  SetTriggerSizeNode,
  GetTriggerOverlapCountNode,
  IsTriggerOverlappingNode,
  GetTriggerShapeNode,
} from './components/TriggerComponentNodes';
export { getComponentNodeEntries, registerComponentRule } from './components/ComponentNodeRules';
export type { ComponentNodeEntry, ComponentRule } from './components/ComponentNodeRules';

// ── Collision / Trigger Events ──────────────────────────────
export {
  OnTriggerBeginOverlapNode,
  OnTriggerEndOverlapNode,
  OnActorBeginOverlapNode,
  OnActorEndOverlapNode,
  OnCollisionHitNode,
  IsOverlappingActorNode,
  GetOverlapCountNode,
  SetCollisionEnabledNode,
} from './collision/CollisionEventNodes';
