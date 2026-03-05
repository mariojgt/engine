// ============================================================
//  Node Editor — barrel export
//  Re-exports everything consumers need from the sub-modules.
// ============================================================

// ── Shared state, types & manager setters ────────────────────
export {
  type Schemes,
  type GraphType,
  type GraphTab,
  type NodeMap,
  type SrcMap,
  type DstMap,
  type CommentBox,
  type HistoryState,
  UndoManager,
  commentUid,
  // Manager setters (public API for main.ts)
  setProjectManager,
  setStructureAssetManager,
  setActorAssetManager,
  setWidgetBPManager,
  setSaveGameManager,
  setDataTableAssetManager,
  setGameInstanceBPManager,
  // Manager getters (for sub-modules)
  getProjectMgr,
  getStructMgr,
  getActorAssetMgr,
  getWidgetBPMgr,
  getSaveGameMgr,
  getDataTableMgr,
  getGameInstanceBPMgr,
  getIsAnimBlueprint,
  setIsAnimBlueprint,
} from './state';

// ── Code generation ──────────────────────────────────────────
export {
  sanitizeName,
  varDefaultStr,
  resolveStructFields,
  buildMaps,
  fieldDefault,
  generateFullCode,
} from './codeGen';

// ── Serialization / deserialization ──────────────────────────
export {
  getNodeTypeName,
  getNodeSerialData,
  serializeGraph,
  createNodeFromData,
  deserializeGraph,
  populateWidgetSelectors,
} from './serialization';

// ── UI helpers & dialogs ─────────────────────────────────────
export {
  getNodeCategory,
  buildMyBlueprintPanel,
  addSection,
  makeDeletableItem,
  buildGraphTabBar,
  showDragPinContextMenu,
  showContextMenu,
  buildTypeOptions,
  typeDisplayName,
  typeDotClass,
  showAddVariableDialog,
  showAddNameDialog,
  showKeySelectDialog,
  showParamEditorDialog,
  showVariableEditor,
  showStructDialog,
} from './ui';

// ── Graph editor factory ─────────────────────────────────────
export { createGraphEditor } from './graphFactory';
