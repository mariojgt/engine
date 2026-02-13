import { ClassicPreset } from 'rete';

// ============================================================
//  Shared Socket Types
// ============================================================
export const execSocket = new ClassicPreset.Socket('Exec');    // white – execution flow
export const numSocket  = new ClassicPreset.Socket('Number');  // green
export const boolSocket = new ClassicPreset.Socket('Boolean'); // red
export const vec3Socket = new ClassicPreset.Socket('Vector3'); // yellow
export const strSocket  = new ClassicPreset.Socket('String');  // magenta

// ============================================================
//  Struct Socket Cache (one socket per struct type)
// ============================================================
const structSocketCache = new Map<string, ClassicPreset.Socket>();

/** Returns (or creates) a socket for a struct VarType like `Struct:<id>` */
export function getStructSocket(structType: string): ClassicPreset.Socket {
  let s = structSocketCache.get(structType);
  if (!s) {
    s = new ClassicPreset.Socket(`Struct_${structType.replace('Struct:', '')}`);
    structSocketCache.set(structType, s);
  }
  return s;
}

// ============================================================
//  Node Registry  (drives the right-click palette)
// ============================================================
export interface NodeEntry {
  label: string;
  category: string;
  factory: () => ClassicPreset.Node;
}

export const NODE_PALETTE: NodeEntry[] = [];

export function registerNode(
  label: string,
  category: string,
  factory: () => ClassicPreset.Node,
) {
  NODE_PALETTE.push({ label, category, factory });
}
