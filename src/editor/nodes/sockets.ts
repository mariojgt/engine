import { ClassicPreset } from 'rete';
import { iconHTML, Icons, ICON_COLORS } from '../icons';

// ============================================================
//  Shared Socket Types
// ============================================================
export const execSocket  = new ClassicPreset.Socket('Exec');    // white – execution flow
export const numSocket   = new ClassicPreset.Socket('Number');  // green
export const boolSocket  = new ClassicPreset.Socket('Boolean'); // red
export const vec3Socket  = new ClassicPreset.Socket('Vector3'); // yellow
export const strSocket   = new ClassicPreset.Socket('String');  // magenta
export const colorSocket = new ClassicPreset.Socket('Color');   // coral – hex colour
export const objectSocket = new ClassicPreset.Socket('ObjectRef'); // blue – generic object reference
export const widgetSocket = new ClassicPreset.Socket('Widget'); // purple – widget reference

// ============================================================
//  Socket Type Colours  (UE-style)
// ============================================================
export const SOCKET_COLORS: Record<string, string> = {
  Exec:    '#ffffff',   // white
  Number:  '#4ecdc4',   // teal-green
  Boolean: '#e74c3c',   // red
  Vector3: '#f5a623',   // yellow-orange
  String:  '#c678dd',   // magenta / purple
  Color:   '#ff6b9d',   // coral / pink – hex colour
  Enum:    '#00bcd4',   // cyan – enum sockets
  ObjectRef: '#0099ff', // bright blue – object references
  Widget:  '#9b59b6',   // purple – widget references
};
const DEFAULT_SOCKET_COLOR = '#8888cc';   // fallback for struct / unknown

/** Get the colour for any socket by its name */
export function socketColor(sock: ClassicPreset.Socket): string {
  if (SOCKET_COLORS[sock.name]) return SOCKET_COLORS[sock.name];
  // Enum sockets are named Enum_<id> — use the Enum colour
  if (sock.name.startsWith('Enum_')) return SOCKET_COLORS['Enum'] ?? DEFAULT_SOCKET_COLOR;
  // Class reference sockets are named ClassRef_<id> — use ObjectRef colour
  if (sock.name.startsWith('ClassRef_')) return SOCKET_COLORS['ObjectRef'] ?? DEFAULT_SOCKET_COLOR;
  return SOCKET_COLORS[sock.name] ?? DEFAULT_SOCKET_COLOR;
}

/**
 * Return true when two sockets are compatible for connection.
 *  – same socket type name → OK
 *  – both are struct sockets with the same struct id → OK
 *  – ObjectRef is compatible with any ClassRef_<id> socket → OK
 *  – everything else → blocked
 */
export function socketsCompatible(
  a: ClassicPreset.Socket,
  b: ClassicPreset.Socket,
): boolean {
  if (a.name === b.name) return true;
  // ObjectRef ↔ ClassRef_<id> compatibility (generic ↔ typed)
  if ((a.name === 'ObjectRef' && b.name.startsWith('ClassRef_')) ||
      (b.name === 'ObjectRef' && a.name.startsWith('ClassRef_'))) return true;
  // ClassRef_<id> ↔ ClassRef_<id> — allow any class ref to connect
  // (the Cast node handles type safety at runtime)
  if (a.name.startsWith('ClassRef_') && b.name.startsWith('ClassRef_')) return true;
  return false;
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
  'Enums':         '#00838F',
  'Collision':     '#C62828',
  'Character':     '#2E7D32',
  'Casting':       '#0D47A1',
  'Animation':     '#E65100',
  // New categories
  'String':        '#9C27B0',
  'Spawning':      '#FF5722',
  'Actor':         '#3F51B5',
  'Timer':         '#009688',
  'World':         '#795548',
  'Player':        '#607D8B',
  // 2D categories
  'Animation 2D':  '#FF8F00',
  'Movement 2D':   '#43A047',
  'Physics 2D':    '#EF6C00',
  'Camera 2D':     '#5C6BC0',
  'Tilemap':       '#8D6E63',
  'Selection':     '#00ACC1',
};

export function getCategoryIcon(cat: string): string {
  switch (cat) {
    case 'Events':        return iconHTML(Icons.Zap, 10, ICON_COLORS.warning);
    case 'Flow Control':  return iconHTML(Icons.GitBranch, 10, ICON_COLORS.secondary);
    case 'Math':          return iconHTML(Icons.Sigma, 10, ICON_COLORS.secondary);
    case 'Values':        return iconHTML(Icons.Diamond, 10, ICON_COLORS.blue);
    case 'Variables':     return iconHTML(Icons.CircleDot, 10, ICON_COLORS.secondary);
    case 'Physics':       return iconHTML(Icons.Circle, 10, ICON_COLORS.secondary);
    case 'Transform':     return iconHTML(Icons.Move, 10, ICON_COLORS.secondary);
    case 'Utility':       return iconHTML(Icons.Settings, 10, ICON_COLORS.muted);
    case 'Conversions':   return iconHTML(Icons.ArrowRight, 10, ICON_COLORS.secondary);
    case 'Components':    return iconHTML(Icons.Circle, 10, ICON_COLORS.secondary);
    case 'Functions':     return iconHTML(Icons.Code, 10, ICON_COLORS.blueprint);
    case 'Macros':        return iconHTML(Icons.Diamond, 10, ICON_COLORS.secondary);
    case 'Custom Events': return iconHTML(Icons.Zap, 10, ICON_COLORS.warning);
    case 'Input':         return iconHTML(Icons.ChevronRight, 10, ICON_COLORS.secondary);
    case 'Structs':       return iconHTML(Icons.Diamond, 10, ICON_COLORS.blue);
    case 'Enums':         return iconHTML(Icons.List, 10, ICON_COLORS.secondary);
    case 'Collision':     return iconHTML(Icons.Circle, 10, ICON_COLORS.secondary);
    case 'Character':     return iconHTML(Icons.PersonStanding, 10, ICON_COLORS.actor);
    case 'Casting':       return iconHTML(Icons.Diamond, 10, ICON_COLORS.secondary);
    case 'Animation':     return iconHTML(Icons.Play, 10, ICON_COLORS.secondary);
    // New categories
    case 'String':        return iconHTML(Icons.Type, 10, ICON_COLORS.secondary);
    case 'Spawning':      return iconHTML(Icons.Plus, 10, ICON_COLORS.blue);
    case 'Actor':         return iconHTML(Icons.Box, 10, ICON_COLORS.actor);
    case 'Timer':         return iconHTML(Icons.Clock, 10, ICON_COLORS.secondary);
    case 'World':         return iconHTML(Icons.Globe, 10, ICON_COLORS.secondary);
    case 'Player':        return iconHTML(Icons.Gamepad2, 10, ICON_COLORS.actor);
    // 2D categories
    case 'Animation 2D':  return iconHTML(Icons.Film, 10, ICON_COLORS.secondary);
    case 'Movement 2D':   return iconHTML(Icons.Move, 10, ICON_COLORS.secondary);
    case 'Physics 2D':    return iconHTML(Icons.Circle, 10, ICON_COLORS.secondary);
    case 'Camera 2D':     return iconHTML(Icons.Camera, 10, ICON_COLORS.camera);
    case 'Tilemap':       return iconHTML(Icons.Grid, 10, ICON_COLORS.secondary);
    case 'Selection':     return iconHTML(Icons.Box, 10, '#00ACC1');
    // Phase 1 categories
    case 'Audio':          return iconHTML(Icons.Circle, 10, '#E91E63');
    case 'Gamepad':        return iconHTML(Icons.Gamepad2, 10, '#00BFA5');
    case 'Save/Load':      return iconHTML(Icons.Circle, 10, '#FF7043');
    default:              return iconHTML(Icons.Circle, 10, ICON_COLORS.muted);
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
//  Enum Socket Cache (one socket per enum type)
// ============================================================
const enumSocketCache = new Map<string, ClassicPreset.Socket>();

/** Returns (or creates) a socket for an enum VarType like `Enum:<id>` */
export function getEnumSocket(enumType: string): ClassicPreset.Socket {
  let s = enumSocketCache.get(enumType);
  if (!s) {
    s = new ClassicPreset.Socket(`Enum_${enumType.replace('Enum:', '')}`);
    enumSocketCache.set(enumType, s);
  }
  return s;
}

// ============================================================
//  Class Reference Socket Cache (one per class/actor type)
// ============================================================
const classRefSocketCache = new Map<string, ClassicPreset.Socket>();

/** Returns (or creates) a typed socket for a ClassRef VarType like `ClassRef:<actorId>` */
export function getClassRefSocket(classRefType: string): ClassicPreset.Socket {
  // Accept either "ClassRef:<id>" or just the raw actorId
  const key = classRefType.startsWith('ClassRef:') ? classRefType : `ClassRef:${classRefType}`;
  let s = classRefSocketCache.get(key);
  if (!s) {
    s = new ClassicPreset.Socket(`ClassRef_${key.replace('ClassRef:', '')}`);
    classRefSocketCache.set(key, s);
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

// ============================================================
//  Auto-Conversion Registry
//  Maps sourceSocketName → targetSocketName → factory that
//  creates the conversion node.  Used by the connection pipe to
//  automatically insert a conversion node when the user drags a
//  wire between two incompatible (but convertible) socket types.
// ============================================================
export interface ConversionEntry {
  factory: () => ClassicPreset.Node;
  /** If true the conversion is lossy / may fail at runtime (show warning). */
  unsafe?: boolean;
}

/**
 * Outer key = source socket name, inner key = target socket name.
 * Populated by calling `registerConversion()` inside each conversion node file.
 */
export const CONVERSION_MAP = new Map<string, Map<string, ConversionEntry>>();

/** Register an auto-conversion (called once per conversion node at import time). */
export function registerConversion(
  fromSocket: string,
  toSocket: string,
  factory: () => ClassicPreset.Node,
  unsafe = false,
): void {
  let inner = CONVERSION_MAP.get(fromSocket);
  if (!inner) { inner = new Map(); CONVERSION_MAP.set(fromSocket, inner); }
  inner.set(toSocket, { factory, unsafe });
}

/** Look up a conversion entry (or undefined if impossible). */
export function getConversion(from: string, to: string): ConversionEntry | undefined {
  return CONVERSION_MAP.get(from)?.get(to);
}
