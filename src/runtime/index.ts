// ============================================================
//  src/runtime/index.ts — Barrel Export
//
//  Central re-export for the unified FeatherRuntime layer.
//  Import from '@runtime' or '../runtime' everywhere instead
//  of reaching into individual files.
// ============================================================

// ── Core Interfaces ──
export type {
  PlatformAdapter,
  InputEventHandler,
  StorageAdapter,
  LogLevel,
} from './PlatformAdapter';

export type {
  AssetSource,
  AssetCategory,
  AssetIndexEntry,
} from './AssetSource';
export { FileAssetSource, EditorAssetSource } from './AssetSource';

// ── Shared Types ──
export {
  PhysicsConfig,
  defaultPhysicsConfig,
  CollisionConfig,
  LightConfig,
  defaultLightConfig,
  ActorComponentData,
  VarType,
  ActorType,
  GameObjectJSON,
  SceneJSON,
} from './RuntimeTypes';
export type {
  BlueprintVariable,
  AnimStateData,
  AnimTransitionData,
  AnimStateMachineData,
  BlendSpace1D,
  BlendSpaceSample1D,
  TransitionBlendProfile,
  SkeletalMeshConfig,
  WidgetType,
  BTNodeData,
  BehaviorTreeAsset,
  GameInstanceBlueprintJSON,
  AnimTransitionRuleGroup,
} from './RuntimeTypes';

// ── Configuration ──
export type { RuntimeConfig } from './RuntimeConfig';
export { DEFAULT_RUNTIME_CONFIG } from './RuntimeConfig';

// ── Engine Dependency Injection ──
export type {
  EngineDeps,
  IMeshAssetProvider,
  IActorAssetProvider,
  IAnimBlueprintProvider,
  IAIAssetProvider,
  ITextureProvider,
  IFontProvider,
  IGameInstanceManager,
  IGameInstanceAsset,
  IProjectManager,
  IBlueprintData,
  LoadMeshFn,
  BuildMaterialFn,
} from './EngineDeps';
export { setEngineDeps, getEngineDeps, tryGetEngineDeps, resetEngineDeps } from './EngineDeps';

// ── Utilities ──
export { ReadyGate } from './ReadyGate';
export { createCollisionShim2D, applyExposeOnSpawnOverrides } from './CollisionBridge2D';
export { createScriptContext } from './ScriptContextFactory';
export type { UnifiedScriptContext, ScriptContextDeps } from './ScriptContextFactory';

// ── AnimBP 2D ──
export { AnimBP2DRuntime } from './AnimBP2DRuntime';
export type {
  AnimBPActorState,
  AnimBPScriptState,
  AnimBP2DDeps,
} from './AnimBP2DRuntime';

// ── Main Runtime ──
export { FeatherRuntime, getFeatherRuntime, resetFeatherRuntime } from './FeatherRuntime';

// ── BlueprintData (moved from editor) ──
export { BlueprintData } from './BlueprintData';
export type { BlueprintMacro, BlueprintCustomEvent, BlueprintComment } from './BlueprintData';

// ── Platform Adapters ──
export { EditorPlatformAdapter } from './EditorPlatformAdapter';
export { WebPlatformAdapter } from './WebPlatformAdapter';
export { DesktopPlatformAdapter } from './DesktopPlatformAdapter';

// ── Export Runtime (unified game boot for PC + Web builds) ──
export { boot } from './ExportRuntime';
export type { ExportBootConfig } from './ExportRuntime';
