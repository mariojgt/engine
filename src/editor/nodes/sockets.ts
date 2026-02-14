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
//  Node Category Header Colours (UE Blueprint-style)
// ============================================================
export const NODE_CATEGORY_COLORS: Record<string, string> = {
  'Events':        '#8B0000',
  'Flow Control':  '#555555',
  'Math':          '#00786E',
  'Values':        '#1B6B38',
  'Variables':     '#0E8A0E',
  'Physics':       '#B85C00',
  'Transform':     '#1565C0',
  'Utility':       '#546E7A',
  'Conversions':   '#5D4037',
  'Components':    '#6A1B9A',
  'Functions':     '#1565C0',
  'Macros':        '#7B1FA2',
  'Custom Events': '#B71C1C',
  'Input':         '#880E4F',
  'Structs':       '#00695C',
};

export function getCategoryIcon(cat: string): string {
  switch (cat) {
    case 'Events':        return '⚡';
    case 'Flow Control':  return '⑂';
    case 'Math':          return '∑';
    case 'Values':        return '◆';
    case 'Variables':     return '◉';
    case 'Physics':       return '☄';
    case 'Transform':     return '↕';
    case 'Utility':       return '⚙';
    case 'Conversions':   return '⇄';
    case 'Components':    return '⬡';
    case 'Functions':     return 'ƒ';
    case 'Macros':        return '⚡';
    case 'Custom Events': return '🎯';
    case 'Input':         return '🎮';
    case 'Structs':       return '🔷';
    default:              return '●';
  }
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
