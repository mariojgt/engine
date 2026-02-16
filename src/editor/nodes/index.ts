// ============================================================
//  Barrel file — importing each node file triggers registerNode()
//  which populates NODE_PALETTE for the right-click context menu.
// ============================================================

// Shared types & registry
export { NODE_PALETTE, registerNode, socketColor, socketsCompatible, SOCKET_COLORS, NODE_CATEGORY_COLORS, getCategoryIcon, getConversion } from './sockets';
export type { NodeEntry, ConversionEntry } from './sockets';
export {
  execSocket,
  numSocket,
  boolSocket,
  vec3Socket,
  strSocket,
  colorSocket,
} from './sockets';

// ── Events ──────────────────────────────────────────────────
export { EventBeginPlayNode } from './events/EventBeginPlayNode';
export { EventTickNode }      from './events/EventTickNode';
export { EventOnDestroyNode } from './events/EventOnDestroyNode';
export { CustomEventNode, CallCustomEventNode } from './events/CustomEventNodes';
export { InputKeyEventNode, IsKeyDownNode, INPUT_KEYS, keyEventCode, inputType, KeySelectControl } from './events/InputKeyNodes';

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
export { ColorNode, ColorPickerControl } from './values/ColorNode';

// ── Conversions ─────────────────────────────────────────────
export { BoolToNumberNode }   from './conversions/BoolToNumber';
export { NumberToBoolNode }   from './conversions/NumberToBool';
export { BoolToStringNode }   from './conversions/BoolToString';
export { StringToBoolNode }   from './conversions/StringToBool';
export { NumberToStringNode } from './conversions/NumberToString';
export { StringToNumberNode } from './conversions/StringToNumber';
export { ColorToStringNode } from './conversions/ColorToString';
export { StringToColorNode } from './conversions/StringToColor';

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
  OnTriggerComponentBeginOverlapNode,
  OnTriggerComponentEndOverlapNode,
  SetTriggerEnabledNode,
  GetTriggerEnabledNode,
  IsTriggerOverlappingNode,
  // Deprecated — kept for backwards-compat deserialization
  SetTriggerSizeNode,
  GetTriggerOverlapCountNode,
  GetTriggerShapeNode,
} from './components/TriggerComponentNodes';
export {
  SetLightEnabledNode,
  GetLightEnabledNode,
  SetLightColorNode,
  GetLightColorNode,
  SetLightIntensityNode,
  GetLightIntensityNode,
  SetLightDistanceNode,
  SetLightPositionNode,
  GetLightPositionNode,
  SetLightTargetNode,
  SetCastShadowNode,
  SetSpotAngleNode,
  SetSpotPenumbraNode,
} from './components/LightComponentNodes';
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

// ── Character Movement ──────────────────────────────────────
export {
  AddMovementInputNode,
  JumpNode,
  StopJumpingNode,
  CrouchNode,
  UncrouchNode,
  SetMovementModeNode,
  SetMaxWalkSpeedNode,
  LaunchCharacterNode,
  SetCameraModeNode,
  SetCameraFOVNode,
  GetCharacterVelocityNode,
  GetMovementSpeedNode,
  IsGroundedNode,
  IsJumpingNode,
  IsCrouchingNode,
  IsFallingNode,
  IsFlyingNode,
  IsSwimmingNode,
  IsMovingNode,
  GetMovementModeNode,
  GetCameraLocationNode,
  InputAxisNode,
  StartFlyingNode,
  StopFlyingNode,
  StartSwimmingNode,
  StopSwimmingNode,
  MovementModeSelectControl,
  MOVEMENT_MODES,
} from './character/CharacterMovementNodes';

// ── Player Controller ───────────────────────────────────────
export {
  PossessPawnNode,
  UnpossessPawnNode,
  GetControlledPawnNode,
  IsPossessingNode,
} from './character/PlayerControllerNodes';

// ── AI Controller ───────────────────────────────────────────
export {
  AIMoveToNode,
  AIStopMovementNode,
  AISetFocalPointNode,
  AIClearFocalPointNode,
  AIStartPatrolNode,
  AIStopPatrolNode,
  AIStartFollowingNode,
  AIStopFollowingNode,
  GetAIStateNode,
  AIHasReachedTargetNode,
  AIGetDistanceToTargetNode,
} from './character/AIControllerNodes';

// ── Controller (bidirectional Pawn ↔ Controller) ────────────
export {
  GetControllerNode,
  GetControllerTypeNode,
  GetPawnNode,
  IsPlayerControlledNode,
  IsAIControlledNode,
} from './character/ControllerNodes';

// ── Camera & Spring Arm ─────────────────────────────────────
export {
  SetSpringArmLengthNode,
  SetSpringArmTargetOffsetNode,
  SetSpringArmSocketOffsetNode,
  SetSpringArmCollisionNode,
  SetCameraCollisionEnabledNode,
  SetCameraLagNode,
  SetCameraRotationLagNode,
  GetSpringArmLengthNode,
  GetSpringArmTargetOffsetNode,
  GetSpringArmSocketOffsetNode,
  CameraModeLiteralNode,
  MovementModeLiteralNode,
  GetCameraRotationNode,
} from './character/CameraSpringArmNodes';

// ── Camera Control ──────────────────────────────────────────
export {
  AddControllerYawInputNode,
  AddControllerPitchInputNode,
  GetControllerRotationNode,
  SetControllerRotationNode,
  SetMouseLockEnabledNode,
  GetMouseLockStatusNode,
} from './character/CameraControlNodes';

// ── Player Controller ───────────────────────────────────────
export {
  GetPlayerControllerNode,
  SetShowMouseCursorNode,
  IsMouseCursorVisibleNode,
  SetInputModeGameOnlyNode,
  SetInputModeGameAndUINode,
  SetInputModeUIOnlyNode,
} from './player/PlayerControllerNodes';

// ── Casting & References ────────────────────────────────────
export {
  CastToNode,
  GetSelfReferenceNode,
  GetPlayerPawnNode,
  GetActorByNameNode,
  GetAllActorsOfClassNode,
  IsValidNode,
  GetActorNameNode,
  GetActorVariableNode,
  SetActorVariableNode,
  GetOwnerNode,
  GetAnimInstanceNode,
  PureCastNode,
  CallActorFunctionNode,
} from './casting/CastingNodes';
export { objectSocket, getClassRefSocket } from './sockets';

// ── Animation BP Nodes ──────────────────────────────────────
export {
  AnimUpdateEventNode,
  TryGetPawnOwnerNode,
  SetAnimVarNode,
  GetAnimVarNode,
} from './animation/AnimBPNodes';

// ── UI / Widget Nodes ───────────────────────────────────────
export {
  WidgetBPSelectControl,
  WidgetSelectorControl,
  CreateWidgetNode,
  AddToViewportNode,
  RemoveFromViewportNode,
  SetWidgetTextNode,
  GetWidgetTextNode,
  SetWidgetVisibilityNode,
  SetWidgetColorNode,
  SetWidgetOpacityNode,
  SetProgressBarPercentNode,
  GetProgressBarPercentNode,
  SetSliderValueNode,
  GetSliderValueNode,
  SetCheckBoxStateNode,
  GetCheckBoxStateNode,
  IsWidgetVisibleNode,
  PlayWidgetAnimationNode,
  SetInputModeNode,
  ShowMouseCursorNode,
  // Widget Event Nodes
  ButtonOnClickedNode,
  ButtonOnPressedNode,
  ButtonOnReleasedNode,
  ButtonOnHoveredNode,
  ButtonOnUnhoveredNode,
  TextBoxOnTextChangedNode,
  TextBoxOnTextCommittedNode,
  SliderOnValueChangedNode,
  CheckBoxOnCheckStateChangedNode,
} from './ui/WidgetNodes';
