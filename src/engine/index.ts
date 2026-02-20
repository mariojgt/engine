export { Engine } from './Engine';
export { Scene, type MeshType } from './Scene';
export { GameObject } from './GameObject';
export { ScriptComponent, type ScriptContext } from './ScriptComponent';
export { PhysicsWorld } from './PhysicsWorld';
export { Controller, type Pawn, type ControllerType } from './Controller';
export { SpectatorController, SpectatorControllerManager, defaultSpectatorPawnConfig, type SpectatorPawnConfig } from './SpectatorController';
export { PlayerController, PlayerControllerManager, type Possessable } from './PlayerController';
export { AIController, AIControllerManager, type AIControllerConfig, type PatrolPoint, type AIState } from './AIController';
export { MovementComponent } from './MovementComponent';
export { CharacterMovementComponent } from './CharacterMovementComponent';
export { FloatingPawnMovement, defaultFloatingPawnConfig, type FloatingPawnConfig } from './FloatingPawnMovement';
export { AnimationInstance } from './AnimationInstance';
export { UIManager, type RuntimeWidgetBlueprint, type RuntimeWidgetNode } from './UIManager';

// ── 2D Engine Exports ───────────────────────────────────────
export { Physics2DWorld, type Physics2DSettings, type BodyEntry2D } from './Physics2DWorld';
export { Physics2DDebugDraw } from './Physics2DDebugDraw';
export { Camera2D, type Camera2DSettings } from './Camera2D';
export { SpriteRenderer, SpriteAnimator, type SpriteSheetAsset, type SpriteData, type SpriteAnimationDef, type SpriteAnimEvent } from './SpriteRenderer';
export { CharacterMovement2D, defaultCharacterMovement2DProps, type CharacterMovement2DProperties } from './CharacterMovement2D';
export { SortingLayerManager, DEFAULT_SORTING_LAYERS, type SortingLayerData } from './SortingLayers';
export { TilemapCollisionBuilder, createDefaultTilemap, type TilesetAsset, type TilemapAsset, type TilemapLayer, type TileDefData, type MergedRect } from './TilemapData';
export { SpriteActor, type SpriteActorConfig } from './SpriteActor';
