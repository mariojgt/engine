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
//  Socket Type Colours  (UE-style)
// ============================================================
export const SOCKET_COLORS: Record<string, string> = {
  Exec:    '#ffffff',   // white
  Number:  '#4ecdc4',   // teal-green
  Boolean: '#e74c3c',   // red
  Vector3: '#f5a623',   // yellow-orange
  String:  '#c678dd',   // magenta / purple
};
const DEFAULT_SOCKET_COLOR = '#8888cc';   // fallback for struct / unknown

/** Get the colour for any socket by its name */
export function socketColor(sock: ClassicPreset.Socket): string {
  return SOCKET_COLORS[sock.name] ?? DEFAULT_SOCKET_COLOR;
}

/**
 * Return true when two sockets are compatible for connection.
 *  – same socket type name → OK
 *  – both are struct sockets with the same struct id → OK
 *  – everything else → blocked
 */
export function socketsCompatible(
  a: ClassicPreset.Socket,
  b: ClassicPreset.Socket,
): boolean {
  return a.name === b.name;
}

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
