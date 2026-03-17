// ============================================================
//  Graph Serialization & Deserialization
//  getNodeTypeName, getNodeSerialData, serializeGraph,
//  createNodeFromData, deserializeGraph, populateWidgetSelectors
// ============================================================

import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin } from 'rete-area-plugin';
import type { VarType } from '../BlueprintData';
import * as N from '../nodes';
import { type Schemes, getStructMgr, getWidgetBPMgr } from './state';
import { resolveStructFields } from './codeGen';

export function getNodeTypeName(node: ClassicPreset.Node): string {
  // Events
  if (node instanceof N.EventTickNode) return 'EventTickNode';
  if (node instanceof N.EventBeginPlayNode) return 'EventBeginPlayNode';
  if (node instanceof N.EventOnDestroyNode) return 'EventOnDestroyNode';
  if (node instanceof N.CustomEventNode) return 'CustomEventNode';
  if (node instanceof N.CallCustomEventNode) return 'CallCustomEventNode';
  if (node instanceof N.InputKeyEventNode) return 'InputKeyEventNode';
  if (node instanceof N.IsKeyDownNode) return 'IsKeyDownNode';
  if (node instanceof N.InputActionMappingEventNode) return 'InputActionMappingEventNode';
  if (node instanceof N.InputAxisMappingEventNode) return 'InputAxisMappingEventNode';
  if (node instanceof N.GetInputActionNode) return 'GetInputActionNode';
  if (node instanceof N.GetInputAxisNode) return 'GetInputAxisNode';
  if (node instanceof N.AddActionMappingKeyNode) return 'AddActionMappingKeyNode';
  if (node instanceof N.RemoveActionMappingKeyNode) return 'RemoveActionMappingKeyNode';
  if (node instanceof N.ClearActionMappingNode) return 'ClearActionMappingNode';
  if (node instanceof N.AddAxisMappingKeyNode) return 'AddAxisMappingKeyNode';
  if (node instanceof N.RemoveAxisMappingKeyNode) return 'RemoveAxisMappingKeyNode';
  if (node instanceof N.ClearAxisMappingNode) return 'ClearAxisMappingNode';
  // Variables & Structs
  if (node instanceof N.GetVariableNode) return 'GetVariableNode';
  if (node instanceof N.SetVariableNode) return 'SetVariableNode';
  if (node instanceof N.MakeStructNode) return 'MakeStructNode';
  if (node instanceof N.BreakStructNode) return 'BreakStructNode';
  // Functions & Macros
  if (node instanceof N.FunctionEntryNode) return 'FunctionEntryNode';
  if (node instanceof N.FunctionReturnNode) return 'FunctionReturnNode';
  if (node instanceof N.FunctionCallNode) return 'FunctionCallNode';
  if (node instanceof N.MacroEntryNode) return 'MacroEntryNode';
  if (node instanceof N.MacroExitNode) return 'MacroExitNode';
  if (node instanceof N.MacroCallNode) return 'MacroCallNode';
  // Math
  if (node instanceof N.MathAddNode) return 'MathAddNode';
  if (node instanceof N.MathSubtractNode) return 'MathSubtractNode';
  if (node instanceof N.MathMultiplyNode) return 'MathMultiplyNode';
  if (node instanceof N.MathDivideNode) return 'MathDivideNode';
  if (node instanceof N.MakeVectorNode) return 'MakeVectorNode';
  if (node instanceof N.BreakVectorNode) return 'BreakVectorNode';
  if (node instanceof N.SineNode) return 'SineNode';
  if (node instanceof N.CosineNode) return 'CosineNode';
  if (node instanceof N.AbsNode) return 'AbsNode';
  if (node instanceof N.ClampNode) return 'ClampNode';
  if (node instanceof N.LerpNode) return 'LerpNode';
  if (node instanceof N.GreaterThanNode) return 'GreaterThanNode';
  // Values
  if (node instanceof N.ColorNode) return 'ColorNode';
  if (node instanceof N.FloatNode) return 'FloatNode';
  if (node instanceof N.IntegerNode) return 'IntegerNode';
  if (node instanceof N.BooleanNode) return 'BooleanNode';
  if (node instanceof N.StringLiteralNode) return 'StringLiteralNode';
  if (node instanceof N.Vector3LiteralNode) return 'Vector3LiteralNode';
  if (node instanceof N.TimeNode) return 'TimeNode';
  if (node instanceof N.DeltaTimeNode) return 'DeltaTimeNode';
  // Transform
  if (node instanceof N.SetPositionNode) return 'SetPositionNode';
  if (node instanceof N.GetPositionNode) return 'GetPositionNode';
  if (node instanceof N.SetRotationNode) return 'SetRotationNode';
  if (node instanceof N.GetRotationNode) return 'GetRotationNode';
  if (node instanceof N.SetScaleNode) return 'SetScaleNode';
  if (node instanceof N.GetScaleNode) return 'GetScaleNode';
  // Flow Control
  if (node instanceof N.BranchNode) return 'BranchNode';
  if (node instanceof N.SequenceNode) return 'SequenceNode';
  if (node instanceof N.ForLoopNode) return 'ForLoopNode';
  if (node instanceof N.DelayNode) return 'DelayNode';
  if (node instanceof N.DoOnceNode) return 'DoOnceNode';
  if (node instanceof N.DoNNode) return 'DoNNode';
  if (node instanceof N.FlipFlopNode) return 'FlipFlopNode';
  if (node instanceof N.GateNode) return 'GateNode';
  if (node instanceof N.MultiGateNode) return 'MultiGateNode';
  if (node instanceof N.ForLoopWithBreakNode) return 'ForLoopWithBreakNode';
  if (node instanceof N.WhileLoopNode) return 'WhileLoopNode';
  if (node instanceof N.SwitchOnIntNode) return 'SwitchOnIntNode';
  if (node instanceof N.SwitchOnStringNode) return 'SwitchOnStringNode';
  // Utility
  if (node instanceof N.PrintStringNode) return 'PrintStringNode';
  // Physics
  if (node instanceof N.AddForceNode) return 'AddForceNode';
  if (node instanceof N.AddImpulseNode) return 'AddImpulseNode';
  if (node instanceof N.SetVelocityNode) return 'SetVelocityNode';
  // Physics (extended)
  if (node instanceof N.GetMassNode) return 'GetMassNode';
  if (node instanceof N.SetMassNode) return 'SetMassNode';
  if (node instanceof N.GetVelocityNode) return 'GetVelocityNode';
  if (node instanceof N.GetAngularVelocityNode) return 'GetAngularVelocityNode';
  if (node instanceof N.SetLinearVelocityNode) return 'SetLinearVelocityNode';
  if (node instanceof N.SetAngularVelocityNode) return 'SetAngularVelocityNode';
  if (node instanceof N.IsSimulatingPhysicsNode) return 'IsSimulatingPhysicsNode';
  if (node instanceof N.SetSimulatePhysicsNode) return 'SetSimulatePhysicsNode';
  if (node instanceof N.IsGravityEnabledNode) return 'IsGravityEnabledNode';
  if (node instanceof N.SetGravityEnabledNode) return 'SetGravityEnabledNode';
  if (node instanceof N.GetGravityScaleNode) return 'GetGravityScaleNode';
  if (node instanceof N.SetGravityScaleNode) return 'SetGravityScaleNode';
  if (node instanceof N.SetLinearDampingNode) return 'SetLinearDampingNode';
  if (node instanceof N.SetAngularDampingNode) return 'SetAngularDampingNode';
  if (node instanceof N.SetPhysicsMaterialNode) return 'SetPhysicsMaterialNode';
  if (node instanceof N.GetPhysicsMaterialNode) return 'GetPhysicsMaterialNode';
  if (node instanceof N.AddTorqueNode) return 'AddTorqueNode';
  if (node instanceof N.AddForceAtLocationNode) return 'AddForceAtLocationNode';
  if (node instanceof N.AddImpulseAtLocationNode) return 'AddImpulseAtLocationNode';
  if (node instanceof N.SetConstraintNode) return 'SetConstraintNode';
  // Physics events
  if (node instanceof N.OnComponentHitNode) return 'OnComponentHitNode';
  if (node instanceof N.OnComponentBeginOverlapNode) return 'OnComponentBeginOverlapNode';
  if (node instanceof N.OnComponentEndOverlapNode) return 'OnComponentEndOverlapNode';
  if (node instanceof N.OnComponentWakeNode) return 'OnComponentWakeNode';
  if (node instanceof N.OnComponentSleepNode) return 'OnComponentSleepNode';
  // Component nodes
  if (node instanceof N.GetComponentLocationNode) return 'GetComponentLocationNode';
  if (node instanceof N.SetComponentLocationNode) return 'SetComponentLocationNode';
  if (node instanceof N.GetComponentRotationNode) return 'GetComponentRotationNode';
  if (node instanceof N.SetComponentRotationNode) return 'SetComponentRotationNode';
  if (node instanceof N.GetComponentScaleNode) return 'GetComponentScaleNode';
  if (node instanceof N.SetComponentScaleNode) return 'SetComponentScaleNode';
  if (node instanceof N.SetComponentVisibilityNode) return 'SetComponentVisibilityNode';
  if (node instanceof N.SetStaticMeshNode) return 'SetStaticMeshNode';
  if (node instanceof N.SetMeshMaterialNode) return 'SetMeshMaterialNode';
  if (node instanceof N.GetMeshMaterialNode) return 'GetMeshMaterialNode';
  // Light component nodes
  if (node instanceof N.SetLightEnabledNode) return 'SetLightEnabledNode';
  if (node instanceof N.GetLightEnabledNode) return 'GetLightEnabledNode';
  if (node instanceof N.SetLightColorNode) return 'SetLightColorNode';
  if (node instanceof N.GetLightColorNode) return 'GetLightColorNode';
  if (node instanceof N.SetLightIntensityNode) return 'SetLightIntensityNode';
  if (node instanceof N.GetLightIntensityNode) return 'GetLightIntensityNode';
  if (node instanceof N.SetLightDistanceNode) return 'SetLightDistanceNode';
  if (node instanceof N.SetLightPositionNode) return 'SetLightPositionNode';
  if (node instanceof N.GetLightPositionNode) return 'GetLightPositionNode';
  if (node instanceof N.SetLightTargetNode) return 'SetLightTargetNode';
  if (node instanceof N.SetCastShadowNode) return 'SetCastShadowNode';
  if (node instanceof N.SetSpotAngleNode) return 'SetSpotAngleNode';
  if (node instanceof N.SetSpotPenumbraNode) return 'SetSpotPenumbraNode';
  // Conversions
  if (node instanceof N.BoolToNumberNode) return 'BoolToNumberNode';
  if (node instanceof N.NumberToBoolNode) return 'NumberToBoolNode';
  if (node instanceof N.BoolToStringNode) return 'BoolToStringNode';
  if (node instanceof N.StringToBoolNode) return 'StringToBoolNode';
  if (node instanceof N.NumberToStringNode) return 'NumberToStringNode';
  if (node instanceof N.StringToNumberNode) return 'StringToNumberNode';
  if (node instanceof N.ColorToStringNode) return 'ColorToStringNode';
  if (node instanceof N.StringToColorNode) return 'StringToColorNode';
  // Collision / Trigger event nodes
  if (node instanceof N.OnTriggerBeginOverlapNode) return 'OnTriggerBeginOverlapNode';
  if (node instanceof N.OnTriggerEndOverlapNode) return 'OnTriggerEndOverlapNode';
  if (node instanceof N.OnActorBeginOverlapNode) return 'OnActorBeginOverlapNode';
  if (node instanceof N.OnActorEndOverlapNode) return 'OnActorEndOverlapNode';
  if (node instanceof N.OnCollisionHitNode) return 'OnCollisionHitNode';
  if (node instanceof N.IsOverlappingActorNode) return 'IsOverlappingActorNode';
  if (node instanceof N.GetOverlapCountNode) return 'GetOverlapCountNode';
  if (node instanceof N.SetCollisionEnabledNode) return 'SetCollisionEnabledNode';
  // Trigger component nodes
  if (node instanceof N.OnTriggerComponentBeginOverlapNode) return 'OnTriggerComponentBeginOverlapNode';
  if (node instanceof N.OnTriggerComponentEndOverlapNode) return 'OnTriggerComponentEndOverlapNode';
  if (node instanceof N.SetTriggerEnabledNode) return 'SetTriggerEnabledNode';
  if (node instanceof N.GetTriggerEnabledNode) return 'GetTriggerEnabledNode';
  if (node instanceof N.SetTriggerSizeNode) return 'SetTriggerSizeNode';
  if (node instanceof N.GetTriggerOverlapCountNode) return 'GetTriggerOverlapCountNode';
  if (node instanceof N.IsTriggerOverlappingNode) return 'IsTriggerOverlappingNode';
  if (node instanceof N.GetTriggerShapeNode) return 'GetTriggerShapeNode';
  // Projectile component nodes
  if (node instanceof N.GetProjectileConfigNode) return 'GetProjectileConfigNode';
  if (node instanceof N.GetProjectileCompVelocityNode) return 'GetProjectileCompVelocityNode';
  if (node instanceof N.IsProjectileActiveNode) return 'IsProjectileActiveNode';
  if (node instanceof N.LaunchProjectileCompNode) return 'LaunchProjectileCompNode';
  if (node instanceof N.SetProjectileSpeedNode) return 'SetProjectileSpeedNode';
  if (node instanceof N.SetProjectileGravityScaleNode) return 'SetProjectileGravityScaleNode';
  if (node instanceof N.SetProjectileBounceNode) return 'SetProjectileBounceNode';
  if (node instanceof N.SetProjectileCompHomingNode) return 'SetProjectileCompHomingNode';
  if (node instanceof N.DestroyProjectileCompNode) return 'DestroyProjectileCompNode';
  if (node instanceof N.SetProjectileLifetimeNode) return 'SetProjectileLifetimeNode';
  // Character Movement nodes
  if (node instanceof N.AddMovementInputNode) return 'AddMovementInputNode';
  if (node instanceof N.JumpNode) return 'JumpNode';
  if (node instanceof N.StopJumpingNode) return 'StopJumpingNode';
  if (node instanceof N.CrouchNode) return 'CrouchNode';
  if (node instanceof N.UncrouchNode) return 'UncrouchNode';
  if (node instanceof N.SetMovementModeNode) return 'SetMovementModeNode';
  if (node instanceof N.SetMaxWalkSpeedNode) return 'SetMaxWalkSpeedNode';
  if (node instanceof N.LaunchCharacterNode) return 'LaunchCharacterNode';
  if (node instanceof N.SetCameraModeNode) return 'SetCameraModeNode';
  if (node instanceof N.SetCameraFOVNode) return 'SetCameraFOVNode';
  if (node instanceof N.AddControllerYawInputNode) return 'AddControllerYawInputNode';
  if (node instanceof N.AddControllerPitchInputNode) return 'AddControllerPitchInputNode';
  if (node instanceof N.GetControllerRotationNode) return 'GetControllerRotationNode';
  if (node instanceof N.SetControllerRotationNode) return 'SetControllerRotationNode';
  if (node instanceof N.SetMouseLockEnabledNode) return 'SetMouseLockEnabledNode';
  if (node instanceof N.GetMouseLockStatusNode) return 'GetMouseLockStatusNode';
  if (node instanceof N.GetPlayerControllerNode) return 'GetPlayerControllerNode';
  if (node instanceof N.SetShowMouseCursorNode) return 'SetShowMouseCursorNode';
  if (node instanceof N.IsMouseCursorVisibleNode) return 'IsMouseCursorVisibleNode';
  if (node instanceof N.SetInputModeGameOnlyNode) return 'SetInputModeGameOnlyNode';
  if (node instanceof N.SetInputModeGameAndUINode) return 'SetInputModeGameAndUINode';
  if (node instanceof N.SetInputModeUIOnlyNode) return 'SetInputModeUIOnlyNode';
  if (node instanceof N.GetCharacterVelocityNode) return 'GetCharacterVelocityNode';
  if (node instanceof N.GetMovementSpeedNode) return 'GetMovementSpeedNode';
  if (node instanceof N.IsGroundedNode) return 'IsGroundedNode';
  if (node instanceof N.IsJumpingNode) return 'IsJumpingNode';
  if (node instanceof N.IsCrouchingNode) return 'IsCrouchingNode';
  if (node instanceof N.IsFallingNode) return 'IsFallingNode';
  if (node instanceof N.IsFlyingNode) return 'IsFlyingNode';
  if (node instanceof N.IsSwimmingNode) return 'IsSwimmingNode';
  if (node instanceof N.StartFlyingNode) return 'StartFlyingNode';
  if (node instanceof N.StopFlyingNode) return 'StopFlyingNode';
  if (node instanceof N.StartSwimmingNode) return 'StartSwimmingNode';
  if (node instanceof N.StopSwimmingNode) return 'StopSwimmingNode';
  if (node instanceof N.IsMovingNode) return 'IsMovingNode';
  if (node instanceof N.GetMovementModeNode) return 'GetMovementModeNode';
  if (node instanceof N.GetCameraLocationNode) return 'GetCameraLocationNode';
  if (node instanceof N.InputAxisNode) return 'InputAxisNode';
  // Camera & Spring Arm nodes
  if (node instanceof N.SetSpringArmLengthNode) return 'SetSpringArmLengthNode';
  if (node instanceof N.SetSpringArmTargetOffsetNode) return 'SetSpringArmTargetOffsetNode';
  if (node instanceof N.SetSpringArmSocketOffsetNode) return 'SetSpringArmSocketOffsetNode';
  if (node instanceof N.SetSpringArmCollisionNode) return 'SetSpringArmCollisionNode';
  if (node instanceof N.SetCameraCollisionEnabledNode) return 'SetCameraCollisionEnabledNode';
  if (node instanceof N.SetCameraLagNode) return 'SetCameraLagNode';
  if (node instanceof N.SetCameraRotationLagNode) return 'SetCameraRotationLagNode';
  if (node instanceof N.GetSpringArmLengthNode) return 'GetSpringArmLengthNode';
  if (node instanceof N.GetSpringArmTargetOffsetNode) return 'GetSpringArmTargetOffsetNode';
  if (node instanceof N.GetSpringArmSocketOffsetNode) return 'GetSpringArmSocketOffsetNode';
  if (node instanceof N.CameraModeLiteralNode) return 'CameraModeLiteralNode';
  if (node instanceof N.MovementModeLiteralNode) return 'MovementModeLiteralNode';
  if (node instanceof N.GetCameraRotationNode) return 'GetCameraRotationNode';
  // Player Controller nodes
  if (node instanceof N.PossessPawnNode) return 'PossessPawnNode';
  if (node instanceof N.UnpossessPawnNode) return 'UnpossessPawnNode';
  if (node instanceof N.GetControlledPawnNode) return 'GetControlledPawnNode';
  if (node instanceof N.IsPossessingNode) return 'IsPossessingNode';
  // AI Controller nodes
  if (node instanceof N.AIMoveToNode) return 'AIMoveToNode';
  if (node instanceof N.AIMoveToVectorNode) return 'AIMoveToVectorNode';
  if (node instanceof N.AIStopMovementNode) return 'AIStopMovementNode';
  if (node instanceof N.AISetFocalPointNode) return 'AISetFocalPointNode';
  if (node instanceof N.AIClearFocalPointNode) return 'AIClearFocalPointNode';
  if (node instanceof N.AIStartPatrolNode) return 'AIStartPatrolNode';
  if (node instanceof N.AIStopPatrolNode) return 'AIStopPatrolNode';
  if (node instanceof N.AIStartFollowingNode) return 'AIStartFollowingNode';
  if (node instanceof N.AIStopFollowingNode) return 'AIStopFollowingNode';
  if (node instanceof N.GetAIStateNode) return 'GetAIStateNode';
  if (node instanceof N.AIHasReachedTargetNode) return 'AIHasReachedTargetNode';
  if (node instanceof N.AIGetDistanceToTargetNode) return 'AIGetDistanceToTargetNode';
  // Controller â†” Pawn nodes
  if (node instanceof N.GetControllerNode) return 'GetControllerNode';
  if (node instanceof N.GetControllerTypeNode) return 'GetControllerTypeNode';
  if (node instanceof N.GetPawnNode) return 'GetPawnNode';
  if (node instanceof N.IsPlayerControlledNode) return 'IsPlayerControlledNode';
  if (node instanceof N.IsAIControlledNode) return 'IsAIControlledNode';
  // Casting & Reference nodes
  if (node instanceof N.CastToNode) return 'CastToNode';
  if (node instanceof N.GetSelfReferenceNode) return 'GetSelfReferenceNode';
  if (node instanceof N.GetPlayerPawnNode) return 'GetPlayerPawnNode';
  if (node instanceof N.GetActorByNameNode) return 'GetActorByNameNode';
  if (node instanceof N.GetAllActorsOfClassNode) return 'GetAllActorsOfClassNode';
  if (node instanceof N.IsValidNode) return 'IsValidNode';
  if (node instanceof N.GetActorNameNode) return 'GetActorNameNode';
  if (node instanceof N.GetActorVariableNode) return 'GetActorVariableNode';
  if (node instanceof N.SetActorVariableNode) return 'SetActorVariableNode';
  if (node instanceof N.GetOwnerNode) return 'GetOwnerNode';
  if (node instanceof N.GetAnimInstanceNode) return 'GetAnimInstanceNode';
  if (node instanceof N.PureCastNode) return 'PureCastNode';
  if (node instanceof N.CallActorFunctionNode) return 'CallActorFunctionNode';
  // Animation BP nodes
  if (node instanceof N.AnimUpdateEventNode) return 'AnimUpdateEventNode';
  if (node instanceof N.TryGetPawnOwnerNode) return 'TryGetPawnOwnerNode';
  if (node instanceof N.SetAnimVarNode) return 'SetAnimVarNode';
  if (node instanceof N.GetAnimVarNode) return 'GetAnimVarNode';
  // Widget / UI nodes
  if (node instanceof N.CreateWidgetNode) return 'CreateWidgetNode';
  if (node instanceof N.AddToViewportNode) return 'AddToViewportNode';
  if (node instanceof N.RemoveFromViewportNode) return 'RemoveFromViewportNode';
  if (node instanceof N.SetWidgetTextNode) return 'SetWidgetTextNode';
  if (node instanceof N.GetWidgetTextNode) return 'GetWidgetTextNode';
  if (node instanceof N.SetWidgetVisibilityNode) return 'SetWidgetVisibilityNode';
  if (node instanceof N.SetWidgetColorNode) return 'SetWidgetColorNode';
  if (node instanceof N.SetWidgetOpacityNode) return 'SetWidgetOpacityNode';
  if (node instanceof N.SetProgressBarPercentNode) return 'SetProgressBarPercentNode';
  if (node instanceof N.GetProgressBarPercentNode) return 'GetProgressBarPercentNode';
  if (node instanceof N.SetSliderValueNode) return 'SetSliderValueNode';
  if (node instanceof N.GetSliderValueNode) return 'GetSliderValueNode';
  if (node instanceof N.SetCheckBoxStateNode) return 'SetCheckBoxStateNode';
  if (node instanceof N.GetCheckBoxStateNode) return 'GetCheckBoxStateNode';
  if (node instanceof N.IsWidgetVisibleNode) return 'IsWidgetVisibleNode';
  if (node instanceof N.PlayWidgetAnimationNode) return 'PlayWidgetAnimationNode';
  if (node instanceof N.SetInputModeNode) return 'SetInputModeNode';
  if (node instanceof N.ShowMouseCursorNode) return 'ShowMouseCursorNode';
  // Widget Instance Interaction Nodes
  if (node instanceof N.GetWidgetVariableNode) return 'GetWidgetVariableNode';
  if (node instanceof N.SetWidgetVariableNode) return 'SetWidgetVariableNode';
  if (node instanceof N.CallWidgetFunctionNode) return 'CallWidgetFunctionNode';
  if (node instanceof N.CallWidgetEventNode) return 'CallWidgetEventNode';
  // Widget Event Nodes
  if (node instanceof N.ButtonOnClickedNode) return 'ButtonOnClickedNode';
  if (node instanceof N.ButtonOnPressedNode) return 'ButtonOnPressedNode';
  if (node instanceof N.ButtonOnReleasedNode) return 'ButtonOnReleasedNode';
  if (node instanceof N.ButtonOnHoveredNode) return 'ButtonOnHoveredNode';
  if (node instanceof N.ButtonOnUnhoveredNode) return 'ButtonOnUnhoveredNode';
  if (node instanceof N.TextBoxOnTextChangedNode) return 'TextBoxOnTextChangedNode';
  if (node instanceof N.TextBoxOnTextCommittedNode) return 'TextBoxOnTextCommittedNode';
  if (node instanceof N.SliderOnValueChangedNode) return 'SliderOnValueChangedNode';
  if (node instanceof N.CheckBoxOnCheckStateChangedNode) return 'CheckBoxOnCheckStateChangedNode';

  // Scene & Game Instance nodes
  if (node instanceof N.OpenSceneNode) return 'OpenSceneNode';
  if (node instanceof N.LoadSceneNode) return 'LoadSceneNode';
  if (node instanceof N.GetGameInstanceNode) return 'GetGameInstanceNode';
  if (node instanceof N.GetGameInstanceVariableNode) return 'GetGameInstanceVariableNode';
  if (node instanceof N.SetGameInstanceVariableNode) return 'SetGameInstanceVariableNode';

  // Character Movement 2D nodes
  if (node instanceof N.AddMovementInput2DNode) return 'AddMovementInput2DNode';
  if (node instanceof N.Jump2DNode) return 'Jump2DNode';
  if (node instanceof N.StopJump2DNode) return 'StopJump2DNode';
  if (node instanceof N.LaunchCharacter2DNode) return 'LaunchCharacter2DNode';
  if (node instanceof N.SetMaxWalkSpeed2DNode) return 'SetMaxWalkSpeed2DNode';
  if (node instanceof N.GetMaxWalkSpeed2DNode) return 'GetMaxWalkSpeed2DNode';
  if (node instanceof N.IsGrounded2DNode) return 'IsGrounded2DNode';
  if (node instanceof N.IsJumping2DNode) return 'IsJumping2DNode';
  if (node instanceof N.IsFalling2DNode) return 'IsFalling2DNode';
  if (node instanceof N.GetCharacterVelocity2DNode) return 'GetCharacterVelocity2DNode';
  if (node instanceof N.AddCharacterImpulse2DNode) return 'AddCharacterImpulse2DNode';
  if (node instanceof N.StopMovement2DNode) return 'StopMovement2DNode';
  if (node instanceof N.SetJumpHeight2DNode) return 'SetJumpHeight2DNode';
  if (node instanceof N.SetMaxJumps2DNode) return 'SetMaxJumps2DNode';
  if (node instanceof N.GetJumpsRemaining2DNode) return 'GetJumpsRemaining2DNode';
  if (node instanceof N.SetGravityMultiplier2DNode) return 'SetGravityMultiplier2DNode';
  if (node instanceof N.FlipSpriteDirection2DNode) return 'FlipSpriteDirection2DNode';
  if (node instanceof N.SetAirControl2DNode) return 'SetAirControl2DNode';
  if (node instanceof N.GetSpriteFacingDirection2DNode) return 'GetSpriteFacingDirection2DNode';
  if (node instanceof N.GetCharacterSpeed2DNode) return 'GetCharacterSpeed2DNode';
  // Spawning nodes
  if (node instanceof N.SpawnActorFromClassNode) return 'SpawnActorFromClassNode';

  // ForEachLoop nodes
  if (node instanceof N.ForEachLoopNode) return 'ForEachLoopNode';
  if (node instanceof N.ForEachLoopWithBreakNode) return 'ForEachLoopWithBreakNode';
  if (node instanceof N.ForEachActorLoopNode) return 'ForEachActorLoopNode';

  // Drag Selection nodes
  if (node instanceof N.EnableDragSelectionNode) return 'EnableDragSelectionNode';
  if (node instanceof N.DisableDragSelectionNode) return 'DisableDragSelectionNode';
  if (node instanceof N.SetDragSelectionEnabledNode) return 'SetDragSelectionEnabledNode';
  if (node instanceof N.OnDragSelectionCompleteNode) return 'OnDragSelectionCompleteNode';
  if (node instanceof N.GetSelectedActorsNode) return 'GetSelectedActorsNode';
  if (node instanceof N.GetSelectedActorAtIndexNode) return 'GetSelectedActorAtIndexNode';
  if (node instanceof N.SetDragSelectionClassFilterNode) return 'SetDragSelectionClassFilterNode';
  if (node instanceof N.AddDragSelectionClassFilterNode) return 'AddDragSelectionClassFilterNode';
  if (node instanceof N.ClearDragSelectionClassFilterNode) return 'ClearDragSelectionClassFilterNode';
  if (node instanceof N.SetDragSelectionStyleNode) return 'SetDragSelectionStyleNode';
  if (node instanceof N.IsDragSelectingNode) return 'IsDragSelectingNode';
  if (node instanceof N.GetDragSelectionCountNode) return 'GetDragSelectionCountNode';

  // Event Bus nodes
  if (node instanceof N.EmitEventNode) return 'EmitEventNode';
  if (node instanceof N.OnEventNode) return 'N.OnEventNode';

  // AI Blueprint nodes
  if (node instanceof N.AIReceiveExecuteNode) return 'AIReceiveExecuteNode';
  if (node instanceof N.AIReceiveTickNode) return 'AIReceiveTickNode';
  if (node instanceof N.AIReceiveAbortNode) return 'AIReceiveAbortNode';
  if (node instanceof N.FinishExecuteNode) return 'FinishExecuteNode';
  if (node instanceof N.AIPerformConditionCheckNode) return 'AIPerformConditionCheckNode';
  if (node instanceof N.AIObserverActivatedNode) return 'AIObserverActivatedNode';
  if (node instanceof N.AIObserverDeactivatedNode) return 'AIObserverDeactivatedNode';
  if (node instanceof N.ReturnNode) return 'ReturnNode';
  if (node instanceof N.AIServiceActivatedNode) return 'AIServiceActivatedNode';
  if (node instanceof N.AIServiceTickNode) return 'AIServiceTickNode';
  if (node instanceof N.AIServiceDeactivatedNode) return 'AIServiceDeactivatedNode';
  if (node instanceof N.OnPossessNode) return 'OnPossessNode';
  if (node instanceof N.OnUnpossessNode) return 'OnUnpossessNode';
  if (node instanceof N.OnMoveCompletedNode) return 'OnMoveCompletedNode';
  if (node instanceof N.OnPerceptionUpdatedNode) return 'OnPerceptionUpdatedNode';
  if (node instanceof N.RunBehaviorTreeNode) return 'RunBehaviorTreeNode';
  if (node instanceof N.MoveToLocationNode) return 'MoveToLocationNode';
  if (node instanceof N.GetBlackboardValueNode) return 'GetBlackboardValueNode';
  if (node instanceof N.SetBlackboardValueNode) return 'SetBlackboardValueNode';
  if (node instanceof N.ClearBlackboardValueNode) return 'ClearBlackboardValueNode';
  if (node instanceof N.GetBlackboardValueAsBoolNode) return 'GetBlackboardValueAsBoolNode';
  if (node instanceof N.GetBlackboardValueAsFloatNode) return 'GetBlackboardValueAsFloatNode';
  if (node instanceof N.GetBlackboardValueAsVectorNode) return 'GetBlackboardValueAsVectorNode';
  if (node instanceof N.SetBlackboardValueAsBoolNode) return 'SetBlackboardValueAsBoolNode';
  if (node instanceof N.SetBlackboardValueAsFloatNode) return 'SetBlackboardValueAsFloatNode';
  if (node instanceof N.SetBlackboardValueAsVectorNode) return 'SetBlackboardValueAsVectorNode';
  if (node instanceof N.RotateToFaceNode) return 'RotateToFaceNode';

  // DataTable nodes
  if (node instanceof N.GetDataTableRowNode) return 'GetDataTableRowNode';
  if (node instanceof N.GetDataTableRowPureNode) return 'GetDataTableRowPureNode';
  if (node instanceof N.GetAllDataTableRowsNode) return 'GetAllDataTableRowsNode';
  if (node instanceof N.GetDataTableRowNamesNode) return 'GetDataTableRowNamesNode';
  if (node instanceof N.DoesDataTableRowExistNode) return 'DoesDataTableRowExistNode';
  if (node instanceof N.GetDataTableRowCountNode) return 'GetDataTableRowCountNode';
  if (node instanceof N.ForEachDataTableRowNode) return 'ForEachDataTableRowNode';
  if (node instanceof N.MakeDataTableRowHandleNode) return 'MakeDataTableRowHandleNode';
  if (node instanceof N.ResolveDataTableRowHandleNode) return 'ResolveDataTableRowHandleNode';
  if (node instanceof N.IsDataTableRowHandleValidNode) return 'IsDataTableRowHandleValidNode';
  if (node instanceof N.AddDataTableRowRuntimeNode) return 'AddDataTableRowRuntimeNode';
  if (node instanceof N.RemoveDataTableRowRuntimeNode) return 'RemoveDataTableRowRuntimeNode';
  if (node instanceof N.UpdateDataTableRowRuntimeNode) return 'UpdateDataTableRowRuntimeNode';
  if (node instanceof N.GetDataTableFieldNode) return 'GetDataTableFieldNode';
  if (node instanceof N.FindRowsByPredicateNode) return 'FindRowsByPredicateNode';

  // Fallback: use the node label for any N.NODE_PALETTE-registered node
  const paletteEntry = N.NODE_PALETTE.find(e => e.label === (node as any).label);
  if (paletteEntry) return (node as any).label;

  return 'Unknown';
}

/** Extract custom data from a node for serialization */
export function getNodeSerialData(node: ClassicPreset.Node): any {
  const data: any = {};

  // Always save the label so palette-based deserialization can find the factory
  if ((node as any).label) data.label = (node as any).label;

  // Save InputControl values
  const controls: any = {};
  for (const [key, ctrl] of Object.entries(node.controls)) {
    if (ctrl instanceof N.BoolSelectControl) {
      controls[key] = (ctrl as N.BoolSelectControl).value;
    } else if (ctrl instanceof N.WidgetBPSelectControl) {
      controls[key] = { id: (ctrl as N.WidgetBPSelectControl).value, name: (ctrl as N.WidgetBPSelectControl).displayName };
    } else if (ctrl instanceof N.SaveGameSelectControl) {
      controls[key] = { id: (ctrl as N.SaveGameSelectControl).value, name: (ctrl as N.SaveGameSelectControl).displayName };
    } else if (ctrl instanceof N.DataTableSelectControl) {
      controls[key] = {
        dtId: (ctrl as N.DataTableSelectControl).dataTableId,
        dtName: (ctrl as N.DataTableSelectControl).dataTableName,
        structId: (ctrl as N.DataTableSelectControl).structId,
        structName: (ctrl as N.DataTableSelectControl).structName,
      };
    } else if (ctrl instanceof N.WidgetSelectorControl) {
      const value = (ctrl as N.WidgetSelectorControl).value;
      controls[key] = value;
      console.log(`[Serialize] Node "${(node as any).label}" (${node.id}) control "${key}" = "${value}"`, ctrl);
    } else if (ctrl instanceof N.MovementModeSelectControl) {
      controls[key] = (ctrl as N.MovementModeSelectControl).value;
    } else if (ctrl instanceof N.KeySelectControl) {
      controls[key] = (ctrl as N.KeySelectControl).value;
    } else if (ctrl instanceof N.ActionMappingSelectControl) {
      controls[key] = (ctrl as N.ActionMappingSelectControl).value;
    } else if (ctrl instanceof N.AxisMappingSelectControl) {
      controls[key] = (ctrl as N.AxisMappingSelectControl).value;
    } else if (ctrl instanceof N.EventSelectControl) {
      controls[key] = (ctrl as N.EventSelectControl).value;
    } else if (ctrl instanceof N.BTSelectControl) {
      controls[key] = { id: (ctrl as N.BTSelectControl).value, name: (ctrl as N.BTSelectControl).displayName };
    } else if (ctrl instanceof N.ColorPickerControl) {
      controls[key] = (ctrl as N.ColorPickerControl).value;
    } else if (ctrl instanceof N.TextureSelectControl) {
      controls[key] = { id: (ctrl as N.TextureSelectControl).value, name: (ctrl as N.TextureSelectControl).displayName };
    } else if (ctrl instanceof N.SoundCueSelectControl) {
      controls[key] = { id: (ctrl as N.SoundCueSelectControl).value, name: (ctrl as N.SoundCueSelectControl).displayName };
    } else if (ctrl instanceof N.ActorClassSelectControl) {
      controls[key] = { id: (ctrl as N.ActorClassSelectControl).value, name: (ctrl as N.ActorClassSelectControl).displayName };
    } else if (ctrl instanceof ClassicPreset.InputControl) {
      controls[key] = (ctrl as ClassicPreset.InputControl<'number' | 'text'>).value;
    }
  }
  if (Object.keys(controls).length > 0) data.controls = controls;

  // Save controls on input pins (e.g. drawDebug N.BoolSelectControl)
  const inputControls: any = {};
  for (const [key, inp] of Object.entries(node.inputs)) {
    const ctrl = (inp as any)?.control;
    if (ctrl instanceof N.BoolSelectControl) {
      inputControls[key] = ctrl.value;
    } else if (ctrl instanceof ClassicPreset.InputControl) {
      inputControls[key] = ctrl.value;
    }
  }
  if (Object.keys(inputControls).length > 0) data.inputControls = inputControls;

  // Custom fields per node type
  if (node instanceof N.GetVariableNode || node instanceof N.SetVariableNode) {
    data.varId = node.varId;
    data.varName = node.varName;
    data.varType = node.varType;
    if (node.structFields) data.structFields = node.structFields;
    if ((node as any).__isLocal) data.isLocal = true;
  } else if (node instanceof N.CustomEventNode) {
    data.eventId = node.eventId;
    data.eventName = node.eventName;
    data.eventParams = node.eventParams;
  } else if (node instanceof N.CallCustomEventNode) {
    data.eventId = node.eventId;
    data.eventName = node.eventName;
    data.eventParams = node.eventParams;
    if ((node as N.CallCustomEventNode).targetActorId) {
      data.targetActorId = (node as N.CallCustomEventNode).targetActorId;
    }
  } else if (node instanceof N.InputKeyEventNode) {
    const keyCtrl = (node as N.InputKeyEventNode).controls['key'] as N.KeySelectControl | undefined;
    data.selectedKey = keyCtrl?.value ?? (node as N.InputKeyEventNode).selectedKey;
  } else if (node instanceof N.IsKeyDownNode) {
    const keyCtrl = (node as N.IsKeyDownNode).controls['key'] as N.KeySelectControl | undefined;
    data.selectedKey = keyCtrl?.value ?? (node as N.IsKeyDownNode).selectedKey;
  } else if (node instanceof N.InputActionMappingEventNode) {
    const ctrl = (node as N.InputActionMappingEventNode).controls['action'] as N.ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as N.InputActionMappingEventNode).selectedAction;
  } else if (node instanceof N.InputAxisMappingEventNode) {
    const ctrl = (node as N.InputAxisMappingEventNode).controls['axis'] as N.AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as N.InputAxisMappingEventNode).selectedAxis;
  } else if (node instanceof N.GetInputActionNode) {
    const ctrl = (node as N.GetInputActionNode).controls['action'] as N.ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as N.GetInputActionNode).selectedAction;
  } else if (node instanceof N.GetInputAxisNode) {
    const ctrl = (node as N.GetInputAxisNode).controls['axis'] as N.AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as N.GetInputAxisNode).selectedAxis;
  } else if (node instanceof N.AddActionMappingKeyNode) {
    const ctrl = (node as N.AddActionMappingKeyNode).controls['action'] as N.ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as N.AddActionMappingKeyNode).selectedAction;
  } else if (node instanceof N.RemoveActionMappingKeyNode) {
    const ctrl = (node as N.RemoveActionMappingKeyNode).controls['action'] as N.ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as N.RemoveActionMappingKeyNode).selectedAction;
  } else if (node instanceof N.ClearActionMappingNode) {
    const ctrl = (node as N.ClearActionMappingNode).controls['action'] as N.ActionMappingSelectControl | undefined;
    data.selectedAction = ctrl?.value ?? (node as N.ClearActionMappingNode).selectedAction;
  } else if (node instanceof N.AddAxisMappingKeyNode) {
    const ctrl = (node as N.AddAxisMappingKeyNode).controls['axis'] as N.AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as N.AddAxisMappingKeyNode).selectedAxis;
  } else if (node instanceof N.RemoveAxisMappingKeyNode) {
    const ctrl = (node as N.RemoveAxisMappingKeyNode).controls['axis'] as N.AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as N.RemoveAxisMappingKeyNode).selectedAxis;
  } else if (node instanceof N.ClearAxisMappingNode) {
    const ctrl = (node as N.ClearAxisMappingNode).controls['axis'] as N.AxisMappingSelectControl | undefined;
    data.selectedAxis = ctrl?.value ?? (node as N.ClearAxisMappingNode).selectedAxis;
  } else if (node instanceof N.InputAxisNode) {
    const ia = node as N.InputAxisNode;
    const posCtrl = ia.controls['posKey'] as N.KeySelectControl | undefined;
    const negCtrl = ia.controls['negKey'] as N.KeySelectControl | undefined;
    data.positiveKey = posCtrl?.value ?? ia.positiveKey;
    data.negativeKey = negCtrl?.value ?? ia.negativeKey;
  } else if (node instanceof N.RunBehaviorTreeNode) {
    const btCtrl = node.controls['btSelect'] as N.BTSelectControl | undefined;
    data.selectedBTId = btCtrl?.value ?? (node as N.RunBehaviorTreeNode).selectedBTId;
    data.selectedBTName = btCtrl?.displayName ?? (node as N.RunBehaviorTreeNode).selectedBTName;
  } else if (node instanceof N.FunctionEntryNode) {
    data.funcId = node.funcId;
  } else if (node instanceof N.FunctionReturnNode) {
    data.funcId = node.funcId;
  } else if (node instanceof N.FunctionCallNode) {
    data.funcId = node.funcId;
    data.funcName = node.funcName;
  } else if (node instanceof N.MacroEntryNode) {
    data.macroId = node.macroId;
  } else if (node instanceof N.MacroExitNode) {
    data.macroId = node.macroId;
  } else if (node instanceof N.MacroCallNode) {
    data.macroId = node.macroId;
    data.macroName = node.macroName;
  } else if (node instanceof N.MakeStructNode) {
    data.structId = node.structId;
    data.structName = node.structName;
    data.structFields = node.structFields;
  } else if (node instanceof N.BreakStructNode) {
    data.structId = node.structId;
    data.structName = node.structName;
    data.structFields = node.structFields;
  } else if (
    node instanceof N.GetComponentLocationNode || node instanceof N.SetComponentLocationNode ||
    node instanceof N.GetComponentRotationNode || node instanceof N.SetComponentRotationNode ||
    node instanceof N.GetComponentScaleNode || node instanceof N.SetComponentScaleNode ||
    node instanceof N.SetComponentVisibilityNode ||
    node instanceof N.SetStaticMeshNode || node instanceof N.SetMeshMaterialNode ||
    node instanceof N.GetMeshMaterialNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  } else if (
    node instanceof N.SetLightEnabledNode || node instanceof N.GetLightEnabledNode ||
    node instanceof N.SetLightColorNode || node instanceof N.GetLightColorNode ||
    node instanceof N.SetLightIntensityNode || node instanceof N.GetLightIntensityNode ||
    node instanceof N.SetLightDistanceNode || node instanceof N.SetLightPositionNode ||
    node instanceof N.GetLightPositionNode || node instanceof N.SetLightTargetNode ||
    node instanceof N.SetCastShadowNode || node instanceof N.SetSpotAngleNode ||
    node instanceof N.SetSpotPenumbraNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  } else if (
    node instanceof N.OnTriggerComponentBeginOverlapNode || node instanceof N.OnTriggerComponentEndOverlapNode ||
    node instanceof N.SetTriggerEnabledNode || node instanceof N.GetTriggerEnabledNode ||
    node instanceof N.SetTriggerSizeNode || node instanceof N.GetTriggerOverlapCountNode ||
    node instanceof N.IsTriggerOverlappingNode || node instanceof N.GetTriggerShapeNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  } else if (
    node instanceof N.GetProjectileConfigNode || node instanceof N.GetProjectileCompVelocityNode ||
    node instanceof N.IsProjectileActiveNode || node instanceof N.LaunchProjectileCompNode ||
    node instanceof N.SetProjectileSpeedNode || node instanceof N.SetProjectileGravityScaleNode ||
    node instanceof N.SetProjectileBounceNode || node instanceof N.SetProjectileCompHomingNode ||
    node instanceof N.DestroyProjectileCompNode || node instanceof N.SetProjectileLifetimeNode
  ) {
    data.compName = (node as any).compName;
    data.compIndex = (node as any).compIndex;
  }
  // Casting & Reference nodes â€” dynamic data
  if (node instanceof N.CastToNode || node instanceof N.PureCastNode) {
    data.targetClassId = (node as any).targetClassId;
    data.targetClassName = (node as any).targetClassName;
  } else if (node instanceof N.GetAllActorsOfClassNode) {
    data.targetClassId = (node as any).targetClassId;
    data.targetClassName = (node as any).targetClassName;
  } else if (node instanceof N.GetActorVariableNode || node instanceof N.SetActorVariableNode) {
    data.varName = (node as any).varName;
    data.varType = (node as any).varType;
    data.targetActorId = (node as any).targetActorId;
  } else if (node instanceof N.CallActorFunctionNode) {
    data.funcId = (node as any).funcId;
    data.funcName = (node as any).funcName;
    data.targetActorId = (node as any).targetActorId;
    // Serialize input/output definitions so we can reconstruct with correct sockets
    const inputs: { name: string; type: string }[] = [];
    const outputs: { name: string; type: string }[] = [];
    for (const [key, inp] of Object.entries(node.inputs)) {
      if (key === 'exec' || key === 'target') continue;
      inputs.push({ name: key, type: (inp as any)?.socket?.name ?? 'Number' });
    }
    for (const [key, out] of Object.entries(node.outputs)) {
      if (key === 'exec') continue;
      outputs.push({ name: key, type: (out as any)?.socket?.name ?? 'Number' });
    }
    data.fnInputs = inputs;
    data.fnOutputs = outputs;
  }

  // Animation BP nodes
  if (node instanceof N.SetAnimVarNode || node instanceof N.GetAnimVarNode) {
    data.varName = (node as any).varName;
    data.varType = (node as any).varType;
  }

  // Widget nodes
  if (node instanceof N.CreateWidgetNode) {
    data.widgetBPId = (node as N.CreateWidgetNode).widgetBPId;
    data.widgetBPName = (node as N.CreateWidgetNode).widgetBPName;
  }
  // SaveGame nodes
  if (node instanceof N.CreateSaveGameObjectNode) {
    data.saveGameId = (node as N.CreateSaveGameObjectNode).saveGameId;
    data.saveGameName = (node as N.CreateSaveGameObjectNode).saveGameName;
  }
  // DataTable nodes
  if (
    node instanceof N.GetDataTableRowNode || node instanceof N.GetDataTableRowPureNode ||
    node instanceof N.GetAllDataTableRowsNode || node instanceof N.GetDataTableRowNamesNode ||
    node instanceof N.DoesDataTableRowExistNode || node instanceof N.GetDataTableRowCountNode ||
    node instanceof N.ForEachDataTableRowNode || node instanceof N.MakeDataTableRowHandleNode ||
    node instanceof N.ResolveDataTableRowHandleNode || node instanceof N.IsDataTableRowHandleValidNode ||
    node instanceof N.AddDataTableRowRuntimeNode || node instanceof N.RemoveDataTableRowRuntimeNode ||
    node instanceof N.UpdateDataTableRowRuntimeNode
  ) {
    data.dtId   = (node as any).dataTableId ?? '';
    data.dtName = (node as any).dataTableName ?? '';
    data.dtStructId   = (node as any).structId ?? '';
    data.dtStructName = (node as any).structName ?? '';
  }
  // GetDataTableField — also save chosen field
  if (node instanceof N.GetDataTableFieldNode) {
    data.dtId         = node.dataTableId;
    data.dtName       = node.dataTableName;
    data.dtStructId   = node.structId;
    data.dtStructName = node.structName;
    data.dtFieldName  = node.fieldName;
    data.dtFieldType  = node.fieldType;
  }
  // Spawning nodes
  if (node instanceof N.SpawnActorFromClassNode) {
    data.targetClassId = (node as N.SpawnActorFromClassNode).targetClassId;
    data.targetClassName = (node as N.SpawnActorFromClassNode).targetClassName;
    data.exposedVars = (node as N.SpawnActorFromClassNode).exposedVars;
  }

  // Widget instance interaction nodes
  if (node instanceof N.GetWidgetVariableNode) {
    data.widgetBPId = (node as N.GetWidgetVariableNode).widgetBPId;
    data.widgetBPName = (node as N.GetWidgetVariableNode).widgetBPName;
    data.variableName = (node as N.GetWidgetVariableNode).getVariableName();
  }
  if (node instanceof N.SetWidgetVariableNode) {
    data.widgetBPId = (node as N.SetWidgetVariableNode).widgetBPId;
    data.widgetBPName = (node as N.SetWidgetVariableNode).widgetBPName;
    data.variableName = (node as N.SetWidgetVariableNode).getVariableName();
  }

  // Scene & Game Instance nodes
  if (node instanceof N.OpenSceneNode || node instanceof N.LoadSceneNode) {
    const sceneCtrl = node.controls['scene'] as N.SceneSelectControl;
    if (sceneCtrl) data.sceneName = sceneCtrl.value;
  }
  if (node instanceof N.GetGameInstanceVariableNode || node instanceof N.SetGameInstanceVariableNode) {
    const varCtrl = node.controls['varName'] as N.GameInstanceVarNameControl;
    if (varCtrl) data.varName = varCtrl.value;
  }
  if (node instanceof N.CallWidgetFunctionNode) {
    const n = node as N.CallWidgetFunctionNode;
    data.widgetBPId = n.widgetBPId;
    data.widgetBPName = n.widgetBPName;
    data.functionName = n.getFunctionName();
    data.functionInputs = n.functionInputs;
    data.functionOutputs = n.functionOutputs;
  }
  if (node instanceof N.CallWidgetEventNode) {
    const n = node as N.CallWidgetEventNode;
    data.widgetBPId = n.widgetBPId;
    data.widgetBPName = n.widgetBPName;
    data.eventName = n.getEventName();
    data.eventParams = n.eventParams;
  }

  // SwitchOnString custom case values
  if (node instanceof N.SwitchOnStringNode) {
    data.caseValues = (node as N.SwitchOnStringNode).caseValues;
  }

  return data;
}

/** Serialize the entire graph (nodes + connections + positions) */
export function serializeGraph(editor: NodeEditor<Schemes>, area: AreaPlugin<Schemes, any>): any {
  const nodes = editor.getNodes();
  const connections = editor.getConnections();

  const serializedNodes = nodes.map(node => {
    const view = area.nodeViews.get(node.id);
    const position = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };
    return {
      id: node.id,
      type: getNodeTypeName(node),
      position,
      data: getNodeSerialData(node),
    };
  });

  const serializedConnections = connections.map(c => ({
    id: c.id,
    source: c.source,
    sourceOutput: c.sourceOutput,
    target: c.target,
    targetInput: c.targetInput,
  }));

  return { nodes: serializedNodes, connections: serializedConnections };
}

/** Create a node instance from serialized data */
export function createNodeFromData(
  nd: { type: string; data: any },
  bp: import('../BlueprintData').BlueprintData,
): ClassicPreset.Node | null {
  const d = nd.data || {};

  switch (nd.type) {
    // Events
    case 'EventTickNode':      return new N.EventTickNode();
    case 'EventBeginPlayNode': return new N.EventBeginPlayNode();
    case 'EventOnDestroyNode': return new N.EventOnDestroyNode();
    case 'CustomEventNode':
      return new N.CustomEventNode(d.eventId, d.eventName, d.eventParams || []);
    case 'CallCustomEventNode':
      return new N.CallCustomEventNode(d.eventId, d.eventName, d.eventParams || [], d.targetActorId);
    case 'InputKeyEventNode':
      return new N.InputKeyEventNode(d.selectedKey || 'Space');
    case 'IsKeyDownNode':
      return new N.IsKeyDownNode(d.selectedKey || 'Space');
    case 'InputActionMappingEventNode':
      return new N.InputActionMappingEventNode(d.selectedAction || '');
    case 'InputAxisMappingEventNode':
      return new N.InputAxisMappingEventNode(d.selectedAxis || '');
    case 'GetInputActionNode':
      return new N.GetInputActionNode(d.selectedAction || '');
    case 'GetInputAxisNode':
      return new N.GetInputAxisNode(d.selectedAxis || '');
    case 'AddActionMappingKeyNode':
      return new N.AddActionMappingKeyNode(d.selectedAction || '');
    case 'RemoveActionMappingKeyNode':
      return new N.RemoveActionMappingKeyNode(d.selectedAction || '');
    case 'ClearActionMappingNode':
      return new N.ClearActionMappingNode(d.selectedAction || '');
    case 'AddAxisMappingKeyNode':
      return new N.AddAxisMappingKeyNode(d.selectedAxis || '');
    case 'RemoveAxisMappingKeyNode':
      return new N.RemoveAxisMappingKeyNode(d.selectedAxis || '');
    case 'ClearAxisMappingNode':
      return new N.ClearAxisMappingNode(d.selectedAxis || '');
    case 'InputAxisNode':
      return new N.InputAxisNode(d.positiveKey || 'D', d.negativeKey || 'A');

    // Variables
    case 'GetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? resolveStructFields(d.varType.slice(7), bp) : undefined);
      const n = new N.GetVariableNode(d.varId, d.varName, d.varType, sf);
      if (d.isLocal) (n as any).__isLocal = true;
      return n;
    }
    case 'SetVariableNode': {
      const sf = d.structFields || (d.varType?.startsWith('Struct:') ? resolveStructFields(d.varType.slice(7), bp) : undefined);
      const n = new N.SetVariableNode(d.varId, d.varName, d.varType, sf);
      if (d.isLocal) (n as any).__isLocal = true;
      return n;
    }
    case 'MakeStructNode':
      return new N.MakeStructNode(d.structId, d.structName, d.structFields || []);
    case 'BreakStructNode':
      return new N.BreakStructNode(d.structId, d.structName, d.structFields || []);

    // Functions
    case 'FunctionEntryNode': {
      const fn = bp.getFunction(d.funcId);
      return new N.FunctionEntryNode(d.funcId, fn?.name || 'Function', fn?.inputs || []);
    }
    case 'FunctionReturnNode': {
      const fn = bp.getFunction(d.funcId);
      return new N.FunctionReturnNode(d.funcId, fn?.name || 'Function', fn?.outputs || []);
    }
    case 'FunctionCallNode': {
      const fn = bp.getFunction(d.funcId);
      return new N.FunctionCallNode(d.funcId, d.funcName || fn?.name || 'Function', fn?.inputs || [], fn?.outputs || []);
    }

    // Macros
    case 'MacroEntryNode': {
      const m = bp.getMacro(d.macroId);
      return new N.MacroEntryNode(d.macroId, m?.name || 'Macro', m?.inputs || []);
    }
    case 'MacroExitNode': {
      const m = bp.getMacro(d.macroId);
      return new N.MacroExitNode(d.macroId, m?.name || 'Macro', m?.outputs || []);
    }
    case 'MacroCallNode': {
      const m = bp.getMacro(d.macroId);
      return new N.MacroCallNode(d.macroId, d.macroName || m?.name || 'Macro', m?.inputs || [], m?.outputs || []);
    }

    // Math
    case 'MathAddNode':      return new N.MathAddNode();
    case 'MathSubtractNode': return new N.MathSubtractNode();
    case 'MathMultiplyNode': return new N.MathMultiplyNode();
    case 'MathDivideNode':   return new N.MathDivideNode();
    case 'MakeVectorNode':
    case 'Make Vector': {
      const n = new N.MakeVectorNode();
      if (d.inputControls) {
        for (const [key, val] of Object.entries(d.inputControls)) {
          const ctrl = (n.inputs as any)?.[key]?.control;
          if (ctrl && 'value' in ctrl) ctrl.value = val;
        }
      }
      return n;
    }
    case 'BreakVectorNode':
    case 'Break Vector':     return new N.BreakVectorNode();
    case 'SineNode':         return new N.SineNode();
    case 'CosineNode':       return new N.CosineNode();
    case 'AbsNode':          return new N.AbsNode();
    case 'ClampNode':        return new N.ClampNode();
    case 'LerpNode':         return new N.LerpNode();
    case 'GreaterThanNode':  return new N.GreaterThanNode();

    // Values
    case 'FloatNode':           return new N.FloatNode(d.controls?.value ?? 0);
    case 'IntegerNode':          return new N.IntegerNode(d.controls?.value ?? 0);
    case 'BooleanNode': {
      const n = new N.BooleanNode();
      if (d.controls?.value != null) {
        const ctrl = n.controls['value'] as N.BoolSelectControl;
        if (ctrl) ctrl.setValue(d.controls.value);
      }
      return n;
    }
    case 'ColorNode':           return new N.ColorNode(d.controls?.value ?? '#ffffff');
    case 'StringLiteralNode':   return new N.StringLiteralNode(d.controls?.value ?? '');
    case 'Vector3LiteralNode':  return new N.Vector3LiteralNode(d.controls?.x ?? 0, d.controls?.y ?? 0, d.controls?.z ?? 0);
    case 'TimeNode':            return new N.TimeNode();
    case 'DeltaTimeNode':       return new N.DeltaTimeNode();

    // Conversions
    case 'BoolToNumberNode':    return new N.BoolToNumberNode();
    case 'NumberToBoolNode':    return new N.NumberToBoolNode();
    case 'BoolToStringNode':    return new N.BoolToStringNode();
    case 'StringToBoolNode':    return new N.StringToBoolNode();
    case 'NumberToStringNode':  return new N.NumberToStringNode();
    case 'StringToNumberNode':  return new N.StringToNumberNode();
    case 'ColorToStringNode':   return new N.ColorToStringNode();
    case 'StringToColorNode':   return new N.StringToColorNode();

    // Transform
    case 'SetPositionNode': return new N.SetPositionNode();
    case 'GetPositionNode': return new N.GetPositionNode();
    case 'SetRotationNode': return new N.SetRotationNode();
    case 'GetRotationNode': return new N.GetRotationNode();
    case 'SetScaleNode':    return new N.SetScaleNode();
    case 'GetScaleNode':    return new N.GetScaleNode();

    // Flow Control
    case 'BranchNode':   return new N.BranchNode();
    case 'SequenceNode': return new N.SequenceNode();
    case 'ForLoopNode':  return new N.ForLoopNode();
    case 'DelayNode':    return new N.DelayNode();
    case 'DoOnceNode':   return new N.DoOnceNode();
    case 'DoNNode':      return new N.DoNNode();
    case 'FlipFlopNode': return new N.FlipFlopNode();
    case 'GateNode':     return new N.GateNode();
    case 'MultiGateNode': return new N.MultiGateNode();
    case 'ForLoopWithBreakNode': return new N.ForLoopWithBreakNode();
    case 'WhileLoopNode': return new N.WhileLoopNode();
    case 'SwitchOnIntNode': return new N.SwitchOnIntNode();
    case 'SwitchOnStringNode': {
      const n = new N.SwitchOnStringNode();
      if (d.caseValues) n.caseValues = d.caseValues;
      return n;
    }

    // Utility
    case 'PrintStringNode': {
      const n = new N.PrintStringNode();
      if (d.controls?.text != null) {
        const ctrl = n.controls['text'] as ClassicPreset.InputControl<'text'>;
        if (ctrl) ctrl.setValue(d.controls.text);
      }
      return n;
    }

    // Physics
    case 'AddForceNode':    return new N.AddForceNode();
    case 'AddImpulseNode':  return new N.AddImpulseNode();
    case 'SetVelocityNode': return new N.SetVelocityNode();
    // Physics (extended)
    case 'GetMassNode':              return new N.GetMassNode();
    case 'SetMassNode':              return new N.SetMassNode();
    case 'GetVelocityNode':          return new N.GetVelocityNode();
    case 'GetAngularVelocityNode':   return new N.GetAngularVelocityNode();
    case 'SetLinearVelocityNode':    return new N.SetLinearVelocityNode();
    case 'SetAngularVelocityNode':   return new N.SetAngularVelocityNode();
    case 'IsSimulatingPhysicsNode':  return new N.IsSimulatingPhysicsNode();
    case 'SetSimulatePhysicsNode':   return new N.SetSimulatePhysicsNode();
    case 'IsGravityEnabledNode':     return new N.IsGravityEnabledNode();
    case 'SetGravityEnabledNode':    return new N.SetGravityEnabledNode();
    case 'GetGravityScaleNode':      return new N.GetGravityScaleNode();
    case 'SetGravityScaleNode':      return new N.SetGravityScaleNode();
    case 'SetLinearDampingNode':     return new N.SetLinearDampingNode();
    case 'SetAngularDampingNode':    return new N.SetAngularDampingNode();
    case 'SetPhysicsMaterialNode':   return new N.SetPhysicsMaterialNode();
    case 'GetPhysicsMaterialNode':   return new N.GetPhysicsMaterialNode();
    case 'AddTorqueNode':            return new N.AddTorqueNode();
    case 'AddForceAtLocationNode':   return new N.AddForceAtLocationNode();
    case 'AddImpulseAtLocationNode': return new N.AddImpulseAtLocationNode();
    case 'SetConstraintNode':        return new N.SetConstraintNode();
    // Physics events
    case 'OnComponentHitNode':          return new N.OnComponentHitNode();
    case 'OnComponentBeginOverlapNode': return new N.OnComponentBeginOverlapNode();
    case 'OnComponentEndOverlapNode':   return new N.OnComponentEndOverlapNode();
    case 'OnComponentWakeNode':         return new N.OnComponentWakeNode();
    case 'OnComponentSleepNode':        return new N.OnComponentSleepNode();

    // Component nodes
    case 'GetComponentLocationNode':  return new N.GetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentLocationNode':  return new N.SetComponentLocationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentRotationNode':  return new N.GetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentRotationNode':  return new N.SetComponentRotationNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetComponentScaleNode':     return new N.GetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentScaleNode':     return new N.SetComponentScaleNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetComponentVisibilityNode': return new N.SetComponentVisibilityNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetStaticMeshNode':          return new N.SetStaticMeshNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'SetMeshMaterialNode':        return new N.SetMeshMaterialNode(d.compName || 'Root', d.compIndex ?? -1);
    case 'GetMeshMaterialNode':        return new N.GetMeshMaterialNode(d.compName || 'Root', d.compIndex ?? -1);

    // Light component nodes
    case 'SetLightEnabledNode':    return new N.SetLightEnabledNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightEnabledNode':    return new N.GetLightEnabledNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightColorNode':      return new N.SetLightColorNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightColorNode':      return new N.GetLightColorNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightIntensityNode':  return new N.SetLightIntensityNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightIntensityNode':  return new N.GetLightIntensityNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightDistanceNode':   return new N.SetLightDistanceNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightPositionNode':   return new N.SetLightPositionNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'GetLightPositionNode':   return new N.GetLightPositionNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetLightTargetNode':     return new N.SetLightTargetNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetCastShadowNode':      return new N.SetCastShadowNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetSpotAngleNode':       return new N.SetSpotAngleNode(d.compName || 'Light', d.compIndex ?? 0);
    case 'SetSpotPenumbraNode':    return new N.SetSpotPenumbraNode(d.compName || 'Light', d.compIndex ?? 0);

    // Trigger component nodes
    case 'OnTriggerComponentBeginOverlapNode': return new N.OnTriggerComponentBeginOverlapNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'OnTriggerComponentEndOverlapNode':   return new N.OnTriggerComponentEndOverlapNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'SetTriggerEnabledNode':       return new N.SetTriggerEnabledNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerEnabledNode':       return new N.GetTriggerEnabledNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'SetTriggerSizeNode':          return new N.SetTriggerSizeNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerOverlapCountNode':  return new N.GetTriggerOverlapCountNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'IsTriggerOverlappingNode':    return new N.IsTriggerOverlappingNode(d.compName || 'Trigger', d.compIndex ?? 0);
    case 'GetTriggerShapeNode':         return new N.GetTriggerShapeNode(d.compName || 'Trigger', d.compIndex ?? 0);

    // Projectile component nodes
    case 'GetProjectileConfigNode':         return new N.GetProjectileConfigNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'GetProjectileCompVelocityNode':   return new N.GetProjectileCompVelocityNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'IsProjectileActiveNode':          return new N.IsProjectileActiveNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'LaunchProjectileCompNode':        return new N.LaunchProjectileCompNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'SetProjectileSpeedNode':          return new N.SetProjectileSpeedNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'SetProjectileGravityScaleNode':   return new N.SetProjectileGravityScaleNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'SetProjectileBounceNode':         return new N.SetProjectileBounceNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'SetProjectileCompHomingNode':     return new N.SetProjectileCompHomingNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'DestroyProjectileCompNode':       return new N.DestroyProjectileCompNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);
    case 'SetProjectileLifetimeNode':       return new N.SetProjectileLifetimeNode(d.compName || 'ProjectileMovement', d.compIndex ?? 0);

    // Collision / Trigger event nodes
    case 'OnTriggerBeginOverlapNode':   return new N.OnTriggerBeginOverlapNode();
    case 'OnTriggerEndOverlapNode':     return new N.OnTriggerEndOverlapNode();
    case 'OnActorBeginOverlapNode':     return new N.OnActorBeginOverlapNode();
    case 'OnActorEndOverlapNode':       return new N.OnActorEndOverlapNode();
    case 'OnCollisionHitNode':          return new N.OnCollisionHitNode();
    case 'IsOverlappingActorNode':      return new N.IsOverlappingActorNode();
    case 'GetOverlapCountNode':         return new N.GetOverlapCountNode();
    case 'SetCollisionEnabledNode':     return new N.SetCollisionEnabledNode();

    // Character Movement nodes
    case 'AddMovementInputNode':        return new N.AddMovementInputNode();
    case 'JumpNode':                    return new N.JumpNode();
    case 'StopJumpingNode':             return new N.StopJumpingNode();
    case 'CrouchNode':                  return new N.CrouchNode();
    case 'UncrouchNode':                return new N.UncrouchNode();
    case 'SetMovementModeNode':         return new N.SetMovementModeNode(d.controls?.mode ?? 'walking');
    case 'SetMaxWalkSpeedNode':         return new N.SetMaxWalkSpeedNode();
    case 'LaunchCharacterNode':         return new N.LaunchCharacterNode();
    case 'SetCameraModeNode':           return new N.SetCameraModeNode();
    case 'SetCameraFOVNode':            return new N.SetCameraFOVNode();
    case 'AddControllerYawInputNode':   return new N.AddControllerYawInputNode();
    case 'AddControllerPitchInputNode': return new N.AddControllerPitchInputNode();
    case 'GetControllerRotationNode':   return new N.GetControllerRotationNode();
    case 'SetControllerRotationNode':   return new N.SetControllerRotationNode();
    case 'SetMouseLockEnabledNode':     return new N.SetMouseLockEnabledNode();
    case 'GetMouseLockStatusNode':      return new N.GetMouseLockStatusNode();
    case 'GetPlayerControllerNode':     return new N.GetPlayerControllerNode();
    case 'SetShowMouseCursorNode':      return new N.SetShowMouseCursorNode();
    case 'IsMouseCursorVisibleNode':    return new N.IsMouseCursorVisibleNode();
    case 'SetInputModeGameOnlyNode':    return new N.SetInputModeGameOnlyNode();
    case 'SetInputModeGameAndUINode':   return new N.SetInputModeGameAndUINode();
    case 'SetInputModeUIOnlyNode':      return new N.SetInputModeUIOnlyNode();
    case 'GetCharacterVelocityNode':    return new N.GetCharacterVelocityNode();
    case 'GetMovementSpeedNode':        return new N.GetMovementSpeedNode();
    case 'IsGroundedNode':              return new N.IsGroundedNode();
    case 'IsJumpingNode':               return new N.IsJumpingNode();
    case 'IsCrouchingNode':             return new N.IsCrouchingNode();
    case 'IsFallingNode':               return new N.IsFallingNode();
    case 'IsFlyingNode':                 return new N.IsFlyingNode();
    case 'IsSwimmingNode':               return new N.IsSwimmingNode();
    case 'StartFlyingNode':              return new N.StartFlyingNode();
    case 'StopFlyingNode':               return new N.StopFlyingNode();
    case 'StartSwimmingNode':            return new N.StartSwimmingNode();
    case 'StopSwimmingNode':             return new N.StopSwimmingNode();
    case 'IsMovingNode':                 return new N.IsMovingNode();
    case 'GetMovementModeNode':         return new N.GetMovementModeNode();
    case 'GetCameraLocationNode':       return new N.GetCameraLocationNode();
    // Camera & Spring Arm nodes
    case 'SetSpringArmLengthNode':          return new N.SetSpringArmLengthNode();
    case 'SetSpringArmTargetOffsetNode':    return new N.SetSpringArmTargetOffsetNode();
    case 'SetSpringArmSocketOffsetNode':    return new N.SetSpringArmSocketOffsetNode();
    case 'SetSpringArmCollisionNode':       return new N.SetSpringArmCollisionNode();
    case 'SetCameraCollisionEnabledNode':    return new N.SetCameraCollisionEnabledNode();
    case 'SetCameraLagNode':                return new N.SetCameraLagNode();
    case 'SetCameraRotationLagNode':        return new N.SetCameraRotationLagNode();
    case 'GetSpringArmLengthNode':          return new N.GetSpringArmLengthNode();
    case 'GetSpringArmTargetOffsetNode':    return new N.GetSpringArmTargetOffsetNode();
    case 'GetSpringArmSocketOffsetNode':    return new N.GetSpringArmSocketOffsetNode();
    case 'CameraModeLiteralNode':           return new N.CameraModeLiteralNode();
    case 'MovementModeLiteralNode':         return new N.MovementModeLiteralNode(d.controls?.mode ?? 'walking');
    case 'GetCameraRotationNode':           return new N.GetCameraRotationNode();
    // Player Controller nodes
    case 'PossessPawnNode':                 return new N.PossessPawnNode();
    case 'UnpossessPawnNode':               return new N.UnpossessPawnNode();
    case 'GetControlledPawnNode':           return new N.GetControlledPawnNode();
    case 'IsPossessingNode':                return new N.IsPossessingNode();
    // AI Controller nodes
    case 'AIMoveToNode':                    return new N.AIMoveToNode();
    case 'AIMoveToVectorNode':
    case 'AI Move To (Vector)':             return new N.AIMoveToVectorNode();
    case 'AIStopMovementNode':              return new N.AIStopMovementNode();
    case 'AISetFocalPointNode':             return new N.AISetFocalPointNode();
    case 'AIClearFocalPointNode':           return new N.AIClearFocalPointNode();
    case 'AIStartPatrolNode':               return new N.AIStartPatrolNode();
    case 'AIStopPatrolNode':                return new N.AIStopPatrolNode();
    case 'AIStartFollowingNode':            return new N.AIStartFollowingNode();
    case 'AIStopFollowingNode':             return new N.AIStopFollowingNode();
    case 'GetAIStateNode':                  return new N.GetAIStateNode();
    case 'AIHasReachedTargetNode':          return new N.AIHasReachedTargetNode();
    case 'AIGetDistanceToTargetNode':       return new N.AIGetDistanceToTargetNode();
    // Controller â†” Pawn
    case 'GetControllerNode':               return new N.GetControllerNode();
    case 'GetControllerTypeNode':           return new N.GetControllerTypeNode();
    case 'GetPawnNode':                     return new N.GetPawnNode();
    case 'IsPlayerControlledNode':          return new N.IsPlayerControlledNode();
    case 'IsAIControlledNode':              return new N.IsAIControlledNode();

    // Casting & Reference nodes
    case 'CastToNode':                      return new N.CastToNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'GetSelfReferenceNode':            return new N.GetSelfReferenceNode();
    case 'GetPlayerPawnNode':               return new N.GetPlayerPawnNode();
    case 'GetActorByNameNode':              return new N.GetActorByNameNode();
    case 'GetAllActorsOfClassNode':         return new N.GetAllActorsOfClassNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'IsValidNode':                     return new N.IsValidNode();
    case 'GetActorNameNode':                return new N.GetActorNameNode();
    case 'GetActorVariableNode':            return new N.GetActorVariableNode(d.varName || 'Unknown', d.varType || 'Float', d.targetActorId || '');
    case 'SetActorVariableNode':            return new N.SetActorVariableNode(d.varName || 'Unknown', d.varType || 'Float', d.targetActorId || '');
    case 'GetOwnerNode':                    return new N.GetOwnerNode();
    case 'GetAnimInstanceNode':             return new N.GetAnimInstanceNode();
    case 'PureCastNode':                    return new N.PureCastNode(d.targetClassId || '', d.targetClassName || 'Unknown');
    case 'CallActorFunctionNode': {
      // Reconstruct inputs/outputs from serialized data
      const fnInputs = (d.fnInputs || []).map((i: any) => ({ name: i.name, type: i.type as VarType }));
      const fnOutputs = (d.fnOutputs || []).map((o: any) => ({ name: o.name, type: o.type as VarType }));
      return new N.CallActorFunctionNode(d.funcId || '', d.funcName || 'Unknown', d.targetActorId || '', fnInputs, fnOutputs);
    }

    // Animation BP nodes
    case 'AnimUpdateEventNode':             return new N.AnimUpdateEventNode();
    case 'TryGetPawnOwnerNode':             return new N.TryGetPawnOwnerNode();
    case 'SetAnimVarNode':                  return new N.SetAnimVarNode(d.varName || 'speed', d.varType || 'number');
    case 'GetAnimVarNode':                  return new N.GetAnimVarNode(d.varName || 'speed', d.varType || 'number');
    // Widget / UI nodes
    case 'CreateWidgetNode':                return new N.CreateWidgetNode(d.widgetBPId || '', d.widgetBPName || '(none)');
    case 'AddToViewportNode':               return new N.AddToViewportNode();
    case 'RemoveFromViewportNode':          return new N.RemoveFromViewportNode();
    case 'SetWidgetTextNode': {
      const n = new N.SetWidgetTextNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetTextNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetWidgetTextNode': {
      const n = new N.GetWidgetTextNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetWidgetTextNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetVisibilityNode': {
      const n = new N.SetWidgetVisibilityNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetVisibilityNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetColorNode': {
      const n = new N.SetWidgetColorNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetColorNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetWidgetOpacityNode': {
      const n = new N.SetWidgetOpacityNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetWidgetOpacityNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetProgressBarPercentNode': {
      const n = new N.SetProgressBarPercentNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetProgressBarPercentNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetProgressBarPercentNode': {
      const n = new N.GetProgressBarPercentNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetProgressBarPercentNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetSliderValueNode': {
      const n = new N.SetSliderValueNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetSliderValueNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetSliderValueNode': {
      const n = new N.GetSliderValueNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetSliderValueNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'SetCheckBoxStateNode': {
      const n = new N.SetCheckBoxStateNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] SetCheckBoxStateNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'GetCheckBoxStateNode': {
      const n = new N.GetCheckBoxStateNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] GetCheckBoxStateNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'IsWidgetVisibleNode': {
      const n = new N.IsWidgetVisibleNode();
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        const val = d.controls.widgetSelector;
        n.widgetSelector.setValue(val);
        console.log(`[Deserialize] IsWidgetVisibleNode restored widgetSelector = "${val}"`);
      }
      return n;
    }
    case 'PlayWidgetAnimationNode':         return new N.PlayWidgetAnimationNode();
    case 'SetInputModeNode':                return new N.SetInputModeNode();
    case 'ShowMouseCursorNode':             return new N.ShowMouseCursorNode();
    // Widget Instance Interaction Nodes
    case 'GetWidgetVariableNode': {
      const n = new N.GetWidgetVariableNode(d.widgetBPId || '', d.widgetBPName || '(none)', d.variableName || '');
      // Populate available variables from widget blueprint
      if (d.widgetBPId && getWidgetBPMgr()) {
        const widgetBP = getWidgetBPMgr()!.getAsset(d.widgetBPId);
        if (widgetBP && n.variableControl) {
          const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
            name: v.name,
            type: v.type,
          }));
          n.variableControl.setAvailableVariables(variables);
        }
      }
      return n;
    }
    case 'SetWidgetVariableNode': {
      const n = new N.SetWidgetVariableNode(d.widgetBPId || '', d.widgetBPName || '(none)', d.variableName || '');
      // Populate available variables from widget blueprint
      if (d.widgetBPId && getWidgetBPMgr()) {
        const widgetBP = getWidgetBPMgr()!.getAsset(d.widgetBPId);
        if (widgetBP && n.variableControl) {
          const variables = (widgetBP.blueprintData.variables || []).map((v: any) => ({
            name: v.name,
            type: v.type,
          }));
          n.variableControl.setAvailableVariables(variables);
        }
      }
      return n;
    }
    case 'CallWidgetFunctionNode': {
      const n = new N.CallWidgetFunctionNode(
        d.widgetBPId || '',
        d.widgetBPName || '(none)',
        d.functionName || '',
        d.functionInputs || [],
        d.functionOutputs || []
      );
      // Populate available functions from widget blueprint
      if (d.widgetBPId && getWidgetBPMgr()) {
        const widgetBP = getWidgetBPMgr()!.getAsset(d.widgetBPId);
        if (widgetBP && n.functionControl) {
          const functions = (widgetBP.blueprintData.functions || []).map((f: any) => ({
            name: f.name,
            inputs: f.inputs || [],
            outputs: f.outputs || [],
          }));
          n.functionControl.setAvailableFunctions(functions);
        }
      }
      return n;
    }
    case 'CallWidgetEventNode': {
      const n = new N.CallWidgetEventNode(
        d.widgetBPId || '',
        d.widgetBPName || '(none)',
        d.eventName || '',
        d.eventParams || []
      );
      // Populate available events from widget blueprint
      if (d.widgetBPId && getWidgetBPMgr()) {
        const widgetBP = getWidgetBPMgr()!.getAsset(d.widgetBPId);
        if (widgetBP && n.eventControl) {
          const events = (widgetBP.blueprintData.customEvents || []).map((e: any) => ({
            name: e.name,
            params: e.params || [],
          }));
          n.eventControl.setAvailableEvents(events);
        }
      }
      return n;
    }
    // Widget Event Nodes
    case 'ButtonOnClickedNode': {
      const widgetValue = d.controls?.widgetSelector || '';
      console.log(`[Deserialize] ButtonOnClickedNode widgetSelector from saved data: "${widgetValue}"`);
      const n = new N.ButtonOnClickedNode(widgetValue);
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
        console.log(`[Deserialize] Set widgetSelector to: "${d.controls.widgetSelector}"`);
      }
      return n;
    }
    case 'ButtonOnPressedNode': {
      const n = new N.ButtonOnPressedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnReleasedNode': {
      const n = new N.ButtonOnReleasedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnHoveredNode': {
      const n = new N.ButtonOnHoveredNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'ButtonOnUnhoveredNode': {
      const n = new N.ButtonOnUnhoveredNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'TextBoxOnTextChangedNode': {
      const n = new N.TextBoxOnTextChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'TextBoxOnTextCommittedNode': {
      const n = new N.TextBoxOnTextCommittedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'SliderOnValueChangedNode': {
      const n = new N.SliderOnValueChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'CheckBoxOnCheckStateChangedNode': {
      const n = new N.CheckBoxOnCheckStateChangedNode(d.controls?.widgetSelector || '');
      if (d.controls?.widgetSelector && (n as any).widgetSelector) {
        (n as any).widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }

    // Scene & Game Instance nodes
    case 'OpenSceneNode': {
      const n = new N.OpenSceneNode();
      if (d.sceneName) (n.controls['scene'] as N.SceneSelectControl)?.setValue(d.sceneName);
      return n;
    }
    case 'LoadSceneNode': {
      const n = new N.LoadSceneNode();
      if (d.sceneName) (n.controls['scene'] as N.SceneSelectControl)?.setValue(d.sceneName);
      return n;
    }
    case 'GetGameInstanceNode':              return new N.GetGameInstanceNode();
    case 'GetGameInstanceVariableNode': {
      const n = new N.GetGameInstanceVariableNode();
      if (d.varName) (n.controls['varName'] as N.GameInstanceVarNameControl)?.setValue(d.varName);
      return n;
    }
    case 'SetGameInstanceVariableNode': {
      const n = new N.SetGameInstanceVariableNode();
      if (d.varName) (n.controls['varName'] as N.GameInstanceVarNameControl)?.setValue(d.varName);
      return n;
    }

    // Texture reference nodes
    case 'GetTextureIDNode': {
      const n = new N.GetTextureIDNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      return n;
    }
    case 'FindTextureByNameNode':            return new N.FindTextureByNameNode();
    case 'GetTextureInfoNode':               return new N.GetTextureInfoNode();
    case 'LoadTextureNode':                  return new N.LoadTextureNode();

    // Widget enhanced nodes with texture pickers
    case 'SetImageTextureNode': {
      const n = new N.SetImageTextureNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        n.widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }
    case 'SetButtonTextureNode': {
      const n = new N.SetButtonTextureNode(
        d.controls?.textureSelect?.id || '',
        d.controls?.textureSelect?.name || '(none)'
      );
      if (d.controls?.widgetSelector !== undefined && n.widgetSelector) {
        n.widgetSelector.setValue(d.controls.widgetSelector);
      }
      return n;
    }

    // Spawning nodes
    case 'SpawnActorFromClassNode': {
      const n = new N.SpawnActorFromClassNode(d.targetClassId || '', d.targetClassName || '');
      if (Array.isArray(d.exposedVars) && d.exposedVars.length > 0) {
        n.setExposedVars(d.exposedVars);
      }
      return n;
    }

    // Character Movement 2D nodes
    case 'AddMovementInput2DNode':           return new N.AddMovementInput2DNode();
    case 'Jump2DNode':                       return new N.Jump2DNode();
    case 'StopJump2DNode':                   return new N.StopJump2DNode();
    case 'LaunchCharacter2DNode':            return new N.LaunchCharacter2DNode();
    case 'SetMaxWalkSpeed2DNode':            return new N.SetMaxWalkSpeed2DNode();
    case 'GetMaxWalkSpeed2DNode':            return new N.GetMaxWalkSpeed2DNode();
    case 'IsGrounded2DNode':                 return new N.IsGrounded2DNode();
    case 'IsJumping2DNode':                  return new N.IsJumping2DNode();
    case 'IsFalling2DNode':                  return new N.IsFalling2DNode();
    case 'GetCharacterVelocity2DNode':       return new N.GetCharacterVelocity2DNode();
    case 'AddCharacterImpulse2DNode':        return new N.AddCharacterImpulse2DNode();
    case 'StopMovement2DNode':               return new N.StopMovement2DNode();
    case 'SetJumpHeight2DNode':              return new N.SetJumpHeight2DNode();
    case 'SetMaxJumps2DNode':                return new N.SetMaxJumps2DNode();
    case 'GetJumpsRemaining2DNode':          return new N.GetJumpsRemaining2DNode();
    case 'SetGravityMultiplier2DNode':       return new N.SetGravityMultiplier2DNode();
    case 'FlipSpriteDirection2DNode':        return new N.FlipSpriteDirection2DNode();
    case 'SetAirControl2DNode':              return new N.SetAirControl2DNode();
    case 'GetSpriteFacingDirection2DNode':   return new N.GetSpriteFacingDirection2DNode();
    case 'GetCharacterSpeed2DNode':          return new N.GetCharacterSpeed2DNode();

    // Save/Load nodes (UE-style)
    case 'CreateSaveGameObjectNode': {
      const n = new N.CreateSaveGameObjectNode(d.saveGameId || '', d.saveGameName || '(none)');
      return n;
    }
    case 'SaveGameToSlotNode':               return new N.SaveGameToSlotNode();
    case 'LoadGameFromSlotNode':             return new N.LoadGameFromSlotNode();
    case 'DeleteGameInSlotNode':             return new N.DeleteGameInSlotNode();

    // ForEachLoop nodes
    case 'ForEachLoopNode':                    return new N.ForEachLoopNode();
    case 'ForEachLoopWithBreakNode':           return new N.ForEachLoopWithBreakNode();
    case 'ForEachActorLoopNode':               return new N.ForEachActorLoopNode();

    // Drag Selection nodes
    case 'EnableDragSelectionNode':            return new N.EnableDragSelectionNode();
    case 'DisableDragSelectionNode':           return new N.DisableDragSelectionNode();
    case 'SetDragSelectionEnabledNode':        return new N.SetDragSelectionEnabledNode();
    case 'OnDragSelectionCompleteNode':        return new N.OnDragSelectionCompleteNode();
    case 'GetSelectedActorsNode':              return new N.GetSelectedActorsNode();
    case 'GetSelectedActorAtIndexNode':        return new N.GetSelectedActorAtIndexNode();
    case 'SetDragSelectionClassFilterNode': {
      const n = new N.SetDragSelectionClassFilterNode();
      const ac = n.controls['actorClass'] as N.ActorClassSelectControl | undefined;
      if (ac && d.controls?.actorClass) { ac.setValue(d.controls.actorClass.id || '', d.controls.actorClass.name || ''); }
      return n;
    }
    case 'AddDragSelectionClassFilterNode': {
      const n = new N.AddDragSelectionClassFilterNode();
      const ac = n.controls['actorClass'] as N.ActorClassSelectControl | undefined;
      if (ac && d.controls?.actorClass) { ac.setValue(d.controls.actorClass.id || '', d.controls.actorClass.name || ''); }
      return n;
    }
    case 'ClearDragSelectionClassFilterNode':  return new N.ClearDragSelectionClassFilterNode();
    case 'SetDragSelectionStyleNode':          return new N.SetDragSelectionStyleNode();
    case 'IsDragSelectingNode':                return new N.IsDragSelectingNode();
    case 'GetDragSelectionCountNode':          return new N.GetDragSelectionCountNode();

    // Event Bus nodes
    case 'EmitEventNode': {
      const n = new N.EmitEventNode();
      if (d.controls?.eventId) {
        const ctrl = n.controls['eventId'] as N.EventSelectControl | undefined;
        if (ctrl) ctrl.setValue(d.controls.eventId);
      }
      n.syncPayloadPins();
      return n;
    }
    case 'N.OnEventNode': {
      const n = new N.OnEventNode();
      if (d.controls?.eventId) {
        const ctrl = n.controls['eventId'] as N.EventSelectControl | undefined;
        if (ctrl) ctrl.setValue(d.controls.eventId);
      }
      n.syncPayloadPins();
      return n;
    }

    // â”€â”€ AI Blueprint Nodes (explicit entries for deserialization) â”€â”€
    case 'AIReceiveExecuteNode':
    case 'AI Receive Execute':              return new N.AIReceiveExecuteNode();
    case 'AIReceiveTickNode':
    case 'AI Receive Tick':                 return new N.AIReceiveTickNode();
    case 'AIReceiveAbortNode':
    case 'AI Receive Abort':                return new N.AIReceiveAbortNode();
    case 'FinishExecuteNode':
    case 'Finish Execute':                  return new N.FinishExecuteNode();
    case 'AIPerformConditionCheckNode':
    case 'AI Perform Condition Check':      return new N.AIPerformConditionCheckNode();
    case 'AIObserverActivatedNode':
    case 'AI Observer Activated':           return new N.AIObserverActivatedNode();
    case 'AIObserverDeactivatedNode':
    case 'AI Observer Deactivated':         return new N.AIObserverDeactivatedNode();
    case 'ReturnNode':
    case 'Return':                          return new N.ReturnNode();
    case 'AIServiceActivatedNode':
    case 'AI Service Activated':            return new N.AIServiceActivatedNode();
    case 'AIServiceTickNode':
    case 'AI Service Tick':                 return new N.AIServiceTickNode();
    case 'AIServiceDeactivatedNode':
    case 'AI Service Deactivated':          return new N.AIServiceDeactivatedNode();
    case 'OnPossessNode':
    case 'On Possess':                      return new N.OnPossessNode();
    case 'OnUnpossessNode':
    case 'On Unpossess':                    return new N.OnUnpossessNode();
    case 'OnMoveCompletedNode':
    case 'On Move Completed':               return new N.OnMoveCompletedNode();
    case 'OnPerceptionUpdatedNode':
    case 'On Perception Updated':           return new N.OnPerceptionUpdatedNode();
    case 'RunBehaviorTreeNode':
    case 'Run Behavior Tree': {
      const n = new N.RunBehaviorTreeNode();
      if (d.selectedBTId) {
        const btCtrl = n.controls['btSelect'] as N.BTSelectControl | undefined;
        if (btCtrl) btCtrl.setValue(d.selectedBTId);
        n.selectedBTId = d.selectedBTId;
        n.selectedBTName = d.selectedBTName || '';
      }
      return n;
    }
    case 'MoveToLocationNode':
    case 'Move To Location':                return new N.MoveToLocationNode();
    case 'GetBlackboardValueNode':
    case 'Get Blackboard Value': {
      const n = new N.GetBlackboardValueNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'SetBlackboardValueNode':
    case 'Set Blackboard Value': {
      const n = new N.SetBlackboardValueNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'ClearBlackboardValueNode':
    case 'Clear Blackboard Value': {
      const n = new N.ClearBlackboardValueNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'GetBlackboardValueAsBoolNode':
    case 'Get Blackboard Value as Bool': {
      const n = new N.GetBlackboardValueAsBoolNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'GetBlackboardValueAsFloatNode':
    case 'Get Blackboard Value as Float': {
      const n = new N.GetBlackboardValueAsFloatNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'GetBlackboardValueAsVectorNode':
    case 'Get Blackboard Value as Vector': {
      const n = new N.GetBlackboardValueAsVectorNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'SetBlackboardValueAsBoolNode':
    case 'Set Blackboard Value as Bool': {
      const n = new N.SetBlackboardValueAsBoolNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'SetBlackboardValueAsFloatNode':
    case 'Set Blackboard Value as Float': {
      const n = new N.SetBlackboardValueAsFloatNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'SetBlackboardValueAsVectorNode':
    case 'Set Blackboard Value as Vector': {
      const n = new N.SetBlackboardValueAsVectorNode();
      if (d.inputControls?.key != null) { const c = (n.inputs as any)?.key?.control; if (c && 'value' in c) c.value = d.inputControls.key; }
      return n;
    }
    case 'RotateToFaceNode':
    case 'Rotate To Face':                  return new N.RotateToFaceNode();

    // DataTable nodes
    case 'GetDataTableRowNode': {
      const n = new N.GetDataTableRowNode(d.dtId||'', d.dtName||'(none)', d.dtStructId||'', d.dtStructName||'');
      if (d.dtStructId && getStructMgr()) {
        const sa = getStructMgr()!.getStructure(d.dtStructId);
        if (sa) n.updateFields(sa.fields.map((f: any) => ({ name: f.name, type: f.type })), d.dtStructId, d.dtStructName||'');
      }
      return n;
    }
    case 'GetDataTableRowPureNode': {
      const n = new N.GetDataTableRowPureNode(d.dtId||'', d.dtName||'(none)', d.dtStructId||'', d.dtStructName||'');
      if (d.dtStructId && getStructMgr()) {
        const sa = getStructMgr()!.getStructure(d.dtStructId);
        if (sa) n.updateFields(sa.fields.map((f: any) => ({ name: f.name, type: f.type })), d.dtStructId, d.dtStructName||'');
      }
      return n;
    }
    case 'GetAllDataTableRowsNode':         return new N.GetAllDataTableRowsNode(d.dtId||'', d.dtName||'(none)', d.dtStructId||'', d.dtStructName||'');
    case 'GetDataTableRowNamesNode':        return new N.GetDataTableRowNamesNode(d.dtId||'', d.dtName||'(none)');
    case 'DoesDataTableRowExistNode':       return new N.DoesDataTableRowExistNode(d.dtId||'', d.dtName||'(none)');
    case 'GetDataTableRowCountNode':        return new N.GetDataTableRowCountNode(d.dtId||'', d.dtName||'(none)');
    case 'ForEachDataTableRowNode':         return new N.ForEachDataTableRowNode(d.dtId||'', d.dtName||'(none)', d.dtStructId||'', d.dtStructName||'');
    case 'MakeDataTableRowHandleNode':      return new N.MakeDataTableRowHandleNode(d.dtId||'', d.dtName||'(none)');
    case 'ResolveDataTableRowHandleNode':   return new N.ResolveDataTableRowHandleNode(d.dtStructId||'', d.dtStructName||'');
    case 'IsDataTableRowHandleValidNode':   return new N.IsDataTableRowHandleValidNode();
    case 'AddDataTableRowRuntimeNode':      return new N.AddDataTableRowRuntimeNode(d.dtId||'', d.dtName||'(none)');
    case 'RemoveDataTableRowRuntimeNode':   return new N.RemoveDataTableRowRuntimeNode(d.dtId||'', d.dtName||'(none)');
    case 'UpdateDataTableRowRuntimeNode':   return new N.UpdateDataTableRowRuntimeNode(d.dtId||'', d.dtName||'(none)');
    case 'FindRowsByPredicateNode':         return new N.FindRowsByPredicateNode(d.dtId||'', d.dtName||'(none)', d.dtStructId||'', d.dtStructName||'');
    case 'GetDataTableFieldNode': {
      const n = new N.GetDataTableFieldNode(
        d.dtId||'', d.dtName||'(none)',
        d.dtStructId||'', d.dtStructName||'',
        d.dtFieldName||'', d.dtFieldType||'',
      );
      return n;
    }

    default: {
      // Fallback: try N.NODE_PALETTE factory for registered nodes (trace nodes, physics 2D, etc.)
      const paletteEntry = N.NODE_PALETTE.find(e => e.label === nd.type || e.label === d.label);
      if (paletteEntry && paletteEntry.factory) {
        const n = paletteEntry.factory();
        // Restore input-level controls (e.g. drawDebug N.BoolSelectControl)
        if (d.inputControls) {
          for (const [key, val] of Object.entries(d.inputControls)) {
            const ctrl = (n.inputs as any)?.[key]?.control;
            if (ctrl && typeof ctrl.setValue === 'function') ctrl.setValue(val as number);
            else if (ctrl && 'value' in ctrl) ctrl.value = val;
          }
        }
        // Restore N.BTSelectControl values (e.g. RunBehaviorTreeNode)
        if (n instanceof N.RunBehaviorTreeNode && d.selectedBTId) {
          const btCtrl = n.controls['btSelect'] as N.BTSelectControl | undefined;
          if (btCtrl) btCtrl.setValue(d.selectedBTId);
          n.selectedBTId = d.selectedBTId;
          n.selectedBTName = d.selectedBTName || '';
        }
        // Restore general controls saved as { id, name } or simple values
        if (d.controls) {
          for (const [key, val] of Object.entries(d.controls)) {
            const ctrl = n.controls[key];
            if (ctrl instanceof N.BTSelectControl && val && typeof val === 'object' && 'id' in (val as any)) {
              ctrl.setValue((val as any).id);
            } else if (ctrl && typeof (ctrl as any).setValue === 'function' && typeof val !== 'object') {
              (ctrl as any).setValue(val);
            }
          }
        }
        return n;
      }
      console.warn(`[deserialize] Unknown node type: ${nd.type}`);
      return null;
    }
  }
}

/** Populate widget selectors in all event nodes with available widgets */
export async function populateWidgetSelectors(
  editor: NodeEditor<Schemes>,
  widgetList: Array<{ name: string; type: string }>,
  area?: AreaPlugin<Schemes, any>,
): Promise<void> {
  console.log('[NodeEditor] populateWidgetSelectors called with', widgetList.length, 'widgets:', widgetList);
  let populated = 0;
  for (const node of editor.getNodes()) {
    // Check if the node has a widgetSelector control
    if ((node as any).widgetSelector && (node as any).widgetSelector instanceof N.WidgetSelectorControl) {
      const selector = (node as any).widgetSelector as N.WidgetSelectorControl;
      console.log(`[NodeEditor] Populating widget selector for node "${node.label}"`);
      selector.setAvailableWidgets(widgetList);
      console.log(`[NodeEditor] After setAvailableWidgets, selector has ${selector.availableWidgets.length} widgets`);
      populated++;
      // Trigger re-render of the node
      if (area) {
        await area.update('node', node.id);
      }
    }
  }
  console.log(`[NodeEditor] Populated ${populated} widget selectors out of ${editor.getNodes().length} total nodes`);
}

/** Restore a graph from serialized data */
export async function deserializeGraph(
  editor: NodeEditor<Schemes>,
  area: AreaPlugin<Schemes, any>,
  graphData: any,
  bp: import('../BlueprintData').BlueprintData,
): Promise<void> {
  if (!graphData || !Array.isArray(graphData.nodes)) return;

  // Map old serialized IDs â†’ new Rete node IDs
  const idMap = new Map<string, string>();

  for (const nd of graphData.nodes) {
    const node = createNodeFromData(nd, bp);
    if (!node) continue;

    await editor.addNode(node);
    idMap.set(nd.id, node.id);

    if (nd.position) {
      await area.translate(node.id, { x: nd.position.x, y: nd.position.y });
    }
  }

  // Restore connections (remapping IDs)
  for (const conn of graphData.connections || []) {
    const newSource = idMap.get(conn.source);
    const newTarget = idMap.get(conn.target);
    if (!newSource || !newTarget) continue;

    const sourceNode = editor.getNode(newSource);
    const targetNode = editor.getNode(newTarget);
    if (!sourceNode || !targetNode) continue;

    try {
      await editor.addConnection(
        new ClassicPreset.Connection(sourceNode, conn.sourceOutput, targetNode, conn.targetInput),
      );
    } catch { /* skip invalid connections */ }
  }
}

// ============================================================
//  Rete editor factory â€” sets up a single graph editor in a container
// ============================================================
