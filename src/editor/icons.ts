/**
 * Lucide Icon Utility — centralizes all icon creation for the engine editor.
 * Uses lucide vanilla library to create SVG icon elements with semantic colors.
 *
 * COLOR RULES:
 * - Icons use semantic color tokens from the design system
 * - Panel chrome icons use --color-text-secondary or --color-text-muted
 * - Asset type icons use --icon-* tokens
 * - System state icons (success/warning/error) use --icon-success/warning/error
 */
import {
  createElement,
  // Layout & panels
  Layers,
  GitBranch,
  SlidersHorizontal,
  Grid2x2,
  Workflow,
  Layout,
  CircleDot,
  // Actors & objects
  Box,
  PersonStanding,
  Camera,
  Sun,
  Lamp,
  Flashlight,
  RectangleHorizontal,
  Volume2,
  BoxSelect,
  MapPin,
  Image,
  // Actions
  Play,
  Square,
  Pause,
  Undo2,
  Redo2,
  Save,
  Search,
  Settings,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Pencil,
  PlusCircle,
  RotateCcw,
  Upload,
  Download,
  // Gizmo
  Move,
  Rotate3d,
  Maximize2,
  Focus,
  Grid3x3 as Grid,
  Triangle,
  Activity,
  // Navigation & UI
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  X,
  Ellipsis,
  Command,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  Link,
  Folder,
  FolderOpen,
  // Widget palette
  MousePointerClick,
  Type,
  BarChart2,
  TextCursorInput,
  Paintbrush,
  // Misc
  Zap,
  Printer,
  Hash,
  ToggleLeft,
  FileText,
  Code,
  ArrowRight,
  Minus,
  Divide,
  Percent,
  ChevronLeft,
  ChevronUp,
  ArrowLeft,
  ArrowUp,
  Filter,
  List,
  MoreHorizontal,
  Terminal,
  FolderPlus,
  FilePlus,
  ExternalLink,
  RefreshCw,
  Check,
  Loader2,
  XCircle,
  Gamepad2,
  Palette,
  Clapperboard,
  Target,
  Diamond,
  Circle,
  // Additional icons for UI (replacing emojis)
  Feather,
  Hexagon,
  Globe,
  Film,
  Map,
  Bot,
  ClipboardList,
  Shield,
  Bone,
  Star,
  SkipBack,
  SkipForward,
  Eraser,
  PaintBucket,
  SquareDashed,
  ArrowDown,
  Repeat,
  Clock,
  Sigma,
  Table2,
  Database,
  Hammer,
  Wrench,
  Sparkles,
  Wand2,
  Mountain,
} from 'lucide';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ICON_SIZES: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

/**
 * Create a Lucide SVG icon element
 * @param icon - Lucide icon data array (e.g. Box, Camera, etc.)
 * @param size - Size preset or pixel number
 * @param color - CSS color string (use var(--token) for theme colors)
 */
export function createIcon(
  icon: any[],
  size: IconSize | number = 'sm',
  color?: string,
): SVGElement {
  const px = typeof size === 'number' ? size : ICON_SIZES[size];
  const attrs: Record<string, string> = {
    width: String(px),
    height: String(px),
    'stroke-width': '1.75',
  };
  if (color) {
    attrs.stroke = color;
  }
  const [tag, defaultAttrs, children] = icon;
  const el = createElement(icon) as unknown as SVGElement;
  el.setAttribute('width', String(px));
  el.setAttribute('height', String(px));
  el.setAttribute('stroke-width', '1.75');
  if (color) {
    el.style.color = color;
  }
  el.style.flexShrink = '0';
  return el;
}

/**
 * Create an icon wrapped in a span for inline use
 */
export function createIconSpan(
  icon: any[],
  size: IconSize | number = 'sm',
  color?: string,
): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.style.justifyContent = 'center';
  span.style.flexShrink = '0';
  span.appendChild(createIcon(icon, size, color));
  return span;
}

/**
 * Return an icon as an HTML string for use inside template literals / innerHTML.
 * Wraps the SVG in an inline-flex span.
 */
export function iconHTML(
  icon: any[],
  size: IconSize | number = 'sm',
  color?: string,
): string {
  const el = createIconSpan(icon, size, color);
  return el.outerHTML;
}

/**
 * Replace an element's content with an icon + text label.
 * Used to convert textContent-based emoji labels to proper SVG icons.
 */
export function setTextWithIcon(
  el: HTMLElement,
  icon: any[],
  text: string,
  size: IconSize | number = 'xs',
  color?: string,
): void {
  el.textContent = '';
  el.appendChild(createIconSpan(icon, size, color));
  el.appendChild(document.createTextNode(` ${text}`));
}

// ━━━━ Icon Presets for Asset Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ICON_COLORS = {
  actor:     'var(--icon-actor)',      // #60a5fa blue-400
  widget:    'var(--icon-widget)',     // #67e8f9 cyan-300
  material:  'var(--icon-material)',   // #c084fc purple-400
  blueprint: 'var(--icon-blueprint)', // #c084fc purple-400
  light:     'var(--icon-light)',      // #fbbf24 amber-400
  camera:    'var(--icon-camera)',     // #4ade80 green-400
  folder:    'var(--icon-folder)',     // #a1a1aa zinc-400
  mesh:      'var(--icon-mesh)',       // #60a5fa blue-400
  sound:     'var(--icon-sound)',      // #67e8f9 cyan-300
  warning:   'var(--icon-warning)',    // #fbbf24 amber-400
  error:     'var(--icon-error)',      // #f87171 red-400
  success:   'var(--icon-success)',    // #4ade80 green-400
  muted:     'var(--color-text-muted)',
  secondary: 'var(--color-text-secondary)',
  primary:   'var(--color-text-primary)',
  blue:      'var(--color-blue)',
  green:     'var(--color-green)',
  red:       'var(--color-red)',
} as const;

/** Get the appropriate Lucide icon + color for an actor type */
export function getActorTypeIcon(actorType: string): { icon: any[]; color: string } {
  switch (actorType) {
    case 'character':
    case 'characterPawn':
      return { icon: PersonStanding, color: ICON_COLORS.actor };
    case 'camera':
      return { icon: Camera, color: ICON_COLORS.camera };
    case 'directionalLight':
      return { icon: Sun, color: ICON_COLORS.light };
    case 'pointLight':
      return { icon: Lamp, color: ICON_COLORS.light };
    case 'spotLight':
      return { icon: Flashlight, color: ICON_COLORS.light };
    case 'areaLight':
      return { icon: RectangleHorizontal, color: ICON_COLORS.light };
    case 'audio':
    case 'sound':
      return { icon: Volume2, color: ICON_COLORS.sound };
    case 'postProcess':
      return { icon: Layers, color: ICON_COLORS.blueprint };
    case 'trigger':
      return { icon: BoxSelect, color: ICON_COLORS.secondary };
    case 'spawnPoint':
      return { icon: MapPin, color: ICON_COLORS.actor };
    case 'widget':
      return { icon: Layout, color: ICON_COLORS.widget };
    case 'material':
      return { icon: CircleDot, color: ICON_COLORS.material };
    case 'blueprint':
      return { icon: GitBranch, color: ICON_COLORS.blueprint };
    case 'playerController':
    case 'aiController':
      return { icon: Workflow, color: ICON_COLORS.blueprint };
    case 'texture':
    case 'image':
      return { icon: Image, color: ICON_COLORS.success };
    default:
      return { icon: Box, color: ICON_COLORS.actor };
  }
}

/** Get icon for content browser asset type */
export function getAssetTypeIcon(type: string): { icon: any[]; color: string } {
  switch (type.toLowerCase()) {
    case 'actor':
      return { icon: Box, color: ICON_COLORS.actor };
    case 'widget':
      return { icon: Layout, color: ICON_COLORS.widget };
    case 'material':
      return { icon: CircleDot, color: ICON_COLORS.material };
    case 'blueprint':
    case 'animblueprint':
      return { icon: GitBranch, color: ICON_COLORS.blueprint };
    case 'mesh':
    case 'staticmesh':
      return { icon: Box, color: ICON_COLORS.mesh };
    case 'texture':
      return { icon: Image, color: ICON_COLORS.success };
    case 'sound':
    case 'audio':
      return { icon: Volume2, color: ICON_COLORS.sound };
    case 'structure':
    case 'struct':
      return { icon: FileText, color: ICON_COLORS.secondary };
    case 'enum':
      return { icon: List, color: ICON_COLORS.secondary };
    case 'folder':
      return { icon: Folder, color: ICON_COLORS.folder };
    case 'gameinstance':
      return { icon: Workflow, color: ICON_COLORS.blueprint };
    default:
      return { icon: Box, color: ICON_COLORS.secondary };
  }
}

/** Get mesh type icon for geometry primitives */
export function getMeshTypeIcon(meshType: string): { icon: any[]; color: string } {
  // All geometry uses the actor blue icon
  return { icon: Box, color: ICON_COLORS.actor };
}

// ━━━━ Re-export commonly used icons ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Icons = {
  // Panels
  Layers,
  GitBranch,
  SlidersHorizontal,
  Grid2x2,
  Workflow,
  Layout,
  CircleDot,

  // Actors
  Box,
  PersonStanding,
  Camera,
  Sun,
  Lamp,
  Flashlight,
  RectangleHorizontal,
  Volume2,
  BoxSelect,
  MapPin,
  Image,

  // Actions
  Play,
  Square,
  Pause,
  Undo2,
  Redo2,
  Save,
  Search,
  Settings,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Pencil,
  PlusCircle,
  RotateCcw,
  Upload,
  Download,

  // Gizmo/Viewport
  Move,
  Rotate3d,
  Maximize2,
  Focus,
  Grid,
  Triangle,
  Activity,

  // Navigation
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  X,
  Ellipsis,
  Command,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Filter,
  MoreHorizontal,

  // Status
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  Link,
  Check,
  Loader2,
  XCircle,

  // Folders
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,

  // Widget palette
  MousePointerClick,
  Type,
  BarChart2,
  TextCursorInput,
  Paintbrush,

  // Misc
  Zap,
  Printer,
  Hash,
  ToggleLeft,
  FileText,
  Code,
  Minus,
  Divide,
  Percent,
  Terminal,
  ExternalLink,
  RefreshCw,
  List,
  Gamepad2,
  Palette,
  Clapperboard,
  Target,
  Diamond,
  Circle,

  // Additional (replacing emojis)
  Feather,
  Hexagon,
  Globe,
  Film,
  Map,
  Bot,
  ClipboardList,
  Shield,
  Bone,
  Star,
  SkipBack,
  SkipForward,
  Eraser,
  PaintBucket,
  SquareDashed,
  ArrowDown,
  Repeat,
  Clock,
  Sigma,
  Table2,
  Database,
  Hammer,
  Wrench,
  Sparkles,
  Wand2,
  Mountain,
};
