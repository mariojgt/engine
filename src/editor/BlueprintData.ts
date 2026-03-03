// ============================================================
//  BlueprintData — Re-exports from src/runtime/BlueprintData.ts
//
//  The canonical implementation has been moved to the runtime
//  layer so engine modules can import it without depending on
//  the editor. This file re-exports everything for backward
//  compatibility with existing editor imports.
// ============================================================

export {
  BlueprintData,
  type VarType,
  type BlueprintVariable,
  type BlueprintGraphData,
  type BlueprintFunction,
  type BlueprintStruct,
  type BlueprintStructField,
  type BlueprintMacro,
  type BlueprintCustomEvent,
  type BlueprintComment,
} from '../runtime/BlueprintData';
