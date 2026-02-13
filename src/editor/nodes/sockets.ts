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
