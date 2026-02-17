// ============================================================
//  WidgetBlueprintData — UE-style Widget Blueprint Asset (UMG)
//  Defines the data model for UI widgets, their hierarchy,
//  anchoring, styling, animations, and event graphs.
//
//  Pattern: JSON interface + runtime class + Manager,
//  identical to AnimBlueprintData / ActorAsset / StructureAsset.
// ============================================================

import { BlueprintData, type BlueprintGraphData } from './BlueprintData';

// ---- Unique ID helper ----
let _uid = 0;
function widgetUid(): string {
  return 'wbp_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}

// ============================================================
//  Widget Type Definitions
// ============================================================

/** All supported widget types (mirrors UE UMG) */
export type WidgetType =
  | 'CanvasPanel'
  | 'VerticalBox'
  | 'HorizontalBox'
  | 'Overlay'
  | 'GridPanel'
  | 'WrapBox'
  | 'ScrollBox'
  | 'SizeBox'
  | 'ScaleBox'
  | 'Border'
  | 'Spacer'
  | 'Text'
  | 'RichText'
  | 'Image'
  | 'Button'
  | 'CheckBox'
  | 'Slider'
  | 'ProgressBar'
  | 'TextBox'
  | 'ComboBox'
  | 'CircularThrobber'
  | 'WidgetSwitcher';

/** Anchoring presets (like UE anchor presets) */
export interface WidgetAnchor {
  /** Min anchor (0-1 range), top-left of anchor rect */
  minX: number;
  minY: number;
  /** Max anchor (0-1 range), bottom-right of anchor rect */
  maxX: number;
  maxY: number;
}

/** Common anchor presets */
export const AnchorPresets = {
  TopLeft:      { minX: 0,   minY: 0,   maxX: 0,   maxY: 0   },
  TopCenter:    { minX: 0.5, minY: 0,   maxX: 0.5, maxY: 0   },
  TopRight:     { minX: 1,   minY: 0,   maxX: 1,   maxY: 0   },
  CenterLeft:   { minX: 0,   minY: 0.5, maxX: 0,   maxY: 0.5 },
  Center:       { minX: 0.5, minY: 0.5, maxX: 0.5, maxY: 0.5 },
  CenterRight:  { minX: 1,   minY: 0.5, maxX: 1,   maxY: 0.5 },
  BottomLeft:   { minX: 0,   minY: 1,   maxX: 0,   maxY: 1   },
  BottomCenter: { minX: 0.5, minY: 1,   maxX: 0.5, maxY: 1   },
  BottomRight:  { minX: 1,   minY: 1,   maxX: 1,   maxY: 1   },
  StretchTop:   { minX: 0,   minY: 0,   maxX: 1,   maxY: 0   },
  StretchBottom:{ minX: 0,   minY: 1,   maxX: 1,   maxY: 1   },
  StretchLeft:  { minX: 0,   minY: 0,   maxX: 0,   maxY: 1   },
  StretchRight: { minX: 1,   minY: 0,   maxX: 1,   maxY: 1   },
  StretchFull:  { minX: 0,   minY: 0,   maxX: 1,   maxY: 1   },
} as const;

/** Alignment pivot (0-1 range) */
export interface WidgetAlignment {
  x: number;
  y: number;
}

/** Padding (in pixels) */
export interface WidgetPadding {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Size mode for widget dimensions */
export type SizeMode = 'Auto' | 'Fill' | 'Custom';

/** Text alignment */
export type TextJustification = 'Left' | 'Center' | 'Right';

/** Visibility states (like ESlateVisibility) */
export type WidgetVisibility =
  | 'Visible'
  | 'Collapsed'
  | 'Hidden'
  | 'HitTestInvisible'
  | 'SelfHitTestInvisible';

/** Slot data — geometry within parent container */
export interface WidgetSlot {
  /** Anchor rectangle (only for CanvasPanel children) */
  anchor: WidgetAnchor;
  /** Offset from anchor position (pixels) */
  offsetX: number;
  offsetY: number;
  /** Size (used when anchor min == anchor max, i.e. non-stretch) */
  sizeX: number;
  sizeY: number;
  /** Alignment / pivot point */
  alignment: WidgetAlignment;
  /** Auto-size flag */
  autoSize: boolean;
  /** Z-order override */
  zOrder: number;
  /** Padding inside the widget */
  padding: WidgetPadding;
  /** For VerticalBox/HorizontalBox children: fill weight */
  fillWeight: number;
  /** Size mode for layout containers */
  sizeMode: SizeMode;
}

/** Create default slot */
export function defaultSlot(): WidgetSlot {
  return {
    anchor: { ...AnchorPresets.TopLeft },
    offsetX: 0,
    offsetY: 0,
    sizeX: 200,
    sizeY: 50,
    alignment: { x: 0, y: 0 },
    autoSize: false,
    zOrder: 0,
    padding: { left: 0, top: 0, right: 0, bottom: 0 },
    fillWeight: 1,
    sizeMode: 'Auto',
  };
}

// ============================================================
//  Widget-Type-Specific Properties
// ============================================================

export interface TextProperties {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  justification: TextJustification;
  isBold: boolean;
  isItalic: boolean;
  /** Shadow color (empty = no shadow) */
  shadowColor: string;
  shadowOffset: { x: number; y: number };
  /** Enable auto-wrap text */
  autoWrap: boolean;
  /** Font asset ID (from FontLibrary) — overrides fontFamily when set */
  fontAsset?: string;
  /** Font weight (e.g., 'normal', 'bold', '100'-'900') */
  fontWeight?: string;
  /** Font style ('normal', 'italic', 'oblique') */
  fontStyle?: string;
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /** Line height multiplier */
  lineHeight?: number;
  /** Text shadow (enhanced) */
  shadow?: {
    enabled: boolean;
    color: string;
    offset: { x: number; y: number };
    blur: number;
  };
  /** Text outline */
  outline?: {
    enabled: boolean;
    color: string;
    width: number;
  };
  /** Text gradient fill */
  gradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    stops: Array<{ position: number; color: string }>;
  };
  /** Text truncation */
  truncation?: {
    mode: 'none' | 'ellipsis' | 'clip';
    maxLines: number;
    ellipsis: string;
  };
  /** Animated text (typewriter etc.) */
  animated?: {
    enabled: boolean;
    type: 'typewriter' | 'fade' | 'slide';
    speed: number;
  };
}

export interface ImageProperties {
  /** Data URL or texture asset ID */
  imageSource: string;
  /** Tint color */
  tintColor: string;
  /** Scale mode */
  stretch: 'None' | 'Fill' | 'ScaleToFit' | 'ScaleToFill';
  /** Tint blend mode */
  tintMode?: 'multiply' | 'overlay' | 'colorize' | 'screen' | 'add';
  /** Tint strength (0-1) */
  tintStrength?: number;
  /** Flip horizontally */
  flipX?: boolean;
  /** Flip vertically */
  flipY?: boolean;
  /** Rotation in degrees */
  rotation?: number;
  /** 9-slice border support */
  nineSlice?: {
    enabled: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  /** UV rectangle for sprite sheets */
  uvRect?: { x: number; y: number; width: number; height: number };
  /** Gradient overlay (overrides texture if no texture) */
  gradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    stops: Array<{ position: number; color: string; opacity?: number }>;
  };
  /** Visual effects */
  effects?: {
    shadow?: {
      enabled: boolean;
      color: string;
      offset: { x: number; y: number };
      blur: number;
    };
    glow?: {
      enabled: boolean;
      color: string;
      blur: number;
      strength: number;
    };
    outline?: {
      enabled: boolean;
      color: string;
      width: number;
    };
  };
}

export interface ButtonProperties {
  /** Background color (normal state) */
  normalColor: string;
  /** Background color (hovered) */
  hoveredColor: string;
  /** Background color (pressed) */
  pressedColor: string;
  /** Background color (disabled) */
  disabledColor: string;
  /** Border radius */
  borderRadius: number;
  /** Border width */
  borderWidth: number;
  /** Border color */
  borderColor: string;
  /** Texture backgrounds per state (texture asset IDs) */
  stateTextures?: {
    normal?: string;
    hovered?: string;
    pressed?: string;
    disabled?: string;
  };
  /** Tint per state (when using textures) */
  stateTints?: {
    normal?: string;
    hovered?: string;
    pressed?: string;
    disabled?: string;
  };
  /** 9-slice border support */
  nineSlice?: {
    enabled: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  /** Gradient background */
  gradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    stops: Array<{ position: number; color: string }>;
  };
  /** Button content (icon + text composite) */
  content?: {
    type: 'text' | 'image' | 'composite';
    icon?: {
      texture: string;
      size: { width: number; height: number };
      tint: string;
      position: 'left' | 'right' | 'top' | 'bottom';
      padding: number;
    };
    text?: {
      value: string;
      font: string;
      size: number;
      color: string;
    };
    padding?: { top: number; right: number; bottom: number; left: number };
  };
  /** Hover/press animation config */
  animations?: {
    hoverIn?: { duration: number; easing: string };
    hoverOut?: { duration: number; easing: string };
    press?: { duration: number };
    release?: { duration: number };
  };
  /** Scale per state (for hover/press effects) */
  stateScales?: {
    normal?: number;
    hovered?: number;
    pressed?: number;
    disabled?: number;
  };
}

export interface ProgressBarProperties {
  /** Current value (0-1) */
  percent: number;
  /** Fill color */
  fillColor: string;
  /** Background color */
  backgroundColor: string;
  /** Border radius */
  borderRadius: number;
  /** Fill direction */
  fillDirection: 'LeftToRight' | 'RightToLeft' | 'TopToBottom' | 'BottomToTop';
  /** Background texture asset ID */
  backgroundTexture?: string;
  /** Fill texture asset ID */
  fillTexture?: string;
  /** Fill gradient */
  fillGradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    stops: Array<{ position: number; color: string }>;
  };
  /** Background 9-slice */
  backgroundNineSlice?: {
    enabled: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  /** Fill 9-slice */
  fillNineSlice?: {
    enabled: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
  };
}

export interface SliderProperties {
  /** Current value (0-1) */
  value: number;
  /** Min value */
  minValue: number;
  /** Max value */
  maxValue: number;
  /** Step size (0 = continuous) */
  stepSize: number;
  /** Track color */
  trackColor: string;
  /** Fill (active) color */
  fillColor: string;
  /** Handle color */
  handleColor: string;
  /** Orientation */
  orientation: 'Horizontal' | 'Vertical';
}

export interface TextBoxProperties {
  /** Current text */
  text: string;
  /** Placeholder hint text */
  hintText: string;
  /** Font size */
  fontSize: number;
  /** Text color */
  color: string;
  /** Background color */
  backgroundColor: string;
  /** Border color */
  borderColor: string;
  /** Is read-only */
  isReadOnly: boolean;
  /** Is multiline */
  isMultiline: boolean;
}

export interface CheckBoxProperties {
  /** Is checked */
  isChecked: boolean;
  /** Check color */
  checkedColor: string;
  /** Unchecked border color */
  uncheckedColor: string;
  /** Size (pixels) */
  checkSize: number;
}

export interface BorderProperties {
  /** Background color / brush */
  backgroundColor: string;
  /** Background image (data URL or texture asset ID) */
  backgroundImage: string;
  /** Border color */
  borderColor: string;
  /** Border width (per side) */
  borderWidth: number;
  /** Corner radius */
  borderRadius: number;
  /** 9-slice support for background image */
  nineSlice?: {
    enabled: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  /** Gradient background */
  gradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    stops: Array<{ position: number; color: string }>;
  };
}

export interface SizeBoxProperties {
  /** Override width (0 = no override) */
  widthOverride: number;
  /** Override height (0 = no override) */
  heightOverride: number;
  /** Min desired width */
  minDesiredWidth: number;
  /** Min desired height */
  minDesiredHeight: number;
  /** Max desired width */
  maxDesiredWidth: number;
  /** Max desired height */
  maxDesiredHeight: number;
}

export interface ComboBoxProperties {
  /** Options list */
  options: string[];
  /** Selected option index */
  selectedIndex: number;
  /** Font size */
  fontSize: number;
  /** Background color */
  backgroundColor: string;
  /** Text color */
  color: string;
}

export interface ScrollBoxProperties {
  /** Scroll orientation */
  orientation: 'Vertical' | 'Horizontal' | 'Both';
  /** Show scrollbar */
  showScrollbar: boolean;
  /** Scrollbar thickness */
  scrollbarThickness: number;
}

export interface SpacerProperties {
  /** Spacer size */
  spacerWidth: number;
  spacerHeight: number;
}

// ============================================================
//  Widget Node (Hierarchy Tree Node)
// ============================================================

/** Complete widget node in the hierarchy */
export interface WidgetNodeJSON {
  /** Unique widget ID */
  id: string;
  /** Widget type */
  type: WidgetType;
  /** Human-readable name */
  name: string;
  /** Slot (layout) data */
  slot: WidgetSlot;
  /** Visibility */
  visibility: WidgetVisibility;
  /** Render opacity (0-1) */
  renderOpacity: number;
  /** Is this widget interactive / receives input? */
  isEnabled: boolean;
  /** Tooltip text */
  toolTip: string;
  /** Render transform: translate */
  renderTranslation: { x: number; y: number };
  /** Render transform: scale */
  renderScale: { x: number; y: number };
  /** Render transform: angle (degrees) */
  renderAngle: number;
  /** Render transform pivot */
  renderPivot: { x: number; y: number };

  // Type-specific properties (only one is populated based on `type`)
  textProps?: TextProperties;
  imageProps?: ImageProperties;
  buttonProps?: ButtonProperties;
  progressBarProps?: ProgressBarProperties;
  sliderProps?: SliderProperties;
  textBoxProps?: TextBoxProperties;
  checkBoxProps?: CheckBoxProperties;
  borderProps?: BorderProperties;
  sizeBoxProps?: SizeBoxProperties;
  comboBoxProps?: ComboBoxProperties;
  scrollBoxProps?: ScrollBoxProperties;
  spacerProps?: SpacerProperties;

  /** Children widget IDs (ordered) */
  children: string[];
}

/** Create default properties for a given widget type */
export function defaultWidgetProps(type: WidgetType): Partial<WidgetNodeJSON> {
  switch (type) {
    case 'Text':
      return {
        textProps: {
          text: 'Text Block',
          fontSize: 16,
          fontFamily: 'Arial, sans-serif',
          color: '#ffffff',
          justification: 'Left',
          isBold: false,
          isItalic: false,
          shadowColor: '',
          shadowOffset: { x: 0, y: 0 },
          autoWrap: false,
        },
        slot: { ...defaultSlot(), sizeX: 150, sizeY: 30, autoSize: true },
      };
    case 'RichText':
      return {
        textProps: {
          text: '<b>Rich</b> Text',
          fontSize: 16,
          fontFamily: 'Arial, sans-serif',
          color: '#ffffff',
          justification: 'Left',
          isBold: false,
          isItalic: false,
          shadowColor: '',
          shadowOffset: { x: 0, y: 0 },
          autoWrap: true,
        },
        slot: { ...defaultSlot(), sizeX: 200, sizeY: 50 },
      };
    case 'Image':
      return {
        imageProps: {
          imageSource: '',
          tintColor: '#ffffff',
          stretch: 'ScaleToFit',
        },
        slot: { ...defaultSlot(), sizeX: 100, sizeY: 100 },
      };
    case 'Button':
      return {
        buttonProps: {
          normalColor: '#2a5db0',
          hoveredColor: '#3a6dc0',
          pressedColor: '#1a4da0',
          disabledColor: '#555555',
          borderRadius: 4,
          borderWidth: 0,
          borderColor: '#ffffff',
        },
        slot: { ...defaultSlot(), sizeX: 120, sizeY: 40 },
      };
    case 'ProgressBar':
      return {
        progressBarProps: {
          percent: 0.5,
          fillColor: '#2a9d8f',
          backgroundColor: '#333333',
          borderRadius: 2,
          fillDirection: 'LeftToRight',
        },
        slot: { ...defaultSlot(), sizeX: 200, sizeY: 24 },
      };
    case 'Slider':
      return {
        sliderProps: {
          value: 0.5,
          minValue: 0,
          maxValue: 1,
          stepSize: 0,
          trackColor: '#444444',
          fillColor: '#2a9d8f',
          handleColor: '#ffffff',
          orientation: 'Horizontal',
        },
        slot: { ...defaultSlot(), sizeX: 200, sizeY: 24 },
      };
    case 'TextBox':
      return {
        textBoxProps: {
          text: '',
          hintText: 'Enter text...',
          fontSize: 14,
          color: '#ffffff',
          backgroundColor: '#1a1a2e',
          borderColor: '#555555',
          isReadOnly: false,
          isMultiline: false,
        },
        slot: { ...defaultSlot(), sizeX: 200, sizeY: 32 },
      };
    case 'CheckBox':
      return {
        checkBoxProps: {
          isChecked: false,
          checkedColor: '#2a9d8f',
          uncheckedColor: '#666666',
          checkSize: 20,
        },
        slot: { ...defaultSlot(), sizeX: 24, sizeY: 24 },
      };
    case 'Border':
      return {
        borderProps: {
          backgroundColor: '#1a1a2e80',
          backgroundImage: '',
          borderColor: '#555555',
          borderWidth: 1,
          borderRadius: 4,
        },
        slot: { ...defaultSlot(), sizeX: 300, sizeY: 200 },
      };
    case 'SizeBox':
      return {
        sizeBoxProps: {
          widthOverride: 0,
          heightOverride: 0,
          minDesiredWidth: 0,
          minDesiredHeight: 0,
          maxDesiredWidth: 0,
          maxDesiredHeight: 0,
        },
      };
    case 'ComboBox':
      return {
        comboBoxProps: {
          options: ['Option 1', 'Option 2', 'Option 3'],
          selectedIndex: 0,
          fontSize: 14,
          backgroundColor: '#1a1a2e',
          color: '#ffffff',
        },
        slot: { ...defaultSlot(), sizeX: 150, sizeY: 32 },
      };
    case 'ScrollBox':
      return {
        scrollBoxProps: {
          orientation: 'Vertical',
          showScrollbar: true,
          scrollbarThickness: 8,
        },
        slot: { ...defaultSlot(), sizeX: 300, sizeY: 200 },
      };
    case 'Spacer':
      return {
        spacerProps: {
          spacerWidth: 16,
          spacerHeight: 16,
        },
        slot: { ...defaultSlot(), sizeX: 16, sizeY: 16 },
      };
    case 'CircularThrobber':
      return {
        slot: { ...defaultSlot(), sizeX: 40, sizeY: 40 },
      };
    // Containers: CanvasPanel, VerticalBox, HorizontalBox, Overlay, GridPanel, WrapBox, WidgetSwitcher, ScaleBox
    default:
      return {};
  }
}

/** Create a new widget node with defaults */
export function createWidgetNode(type: WidgetType, name?: string): WidgetNodeJSON {
  const defaults = defaultWidgetProps(type);
  return {
    id: widgetUid(),
    type,
    name: name ?? type,
    slot: defaults.slot ?? defaultSlot(),
    visibility: 'Visible',
    renderOpacity: 1,
    isEnabled: true,
    toolTip: '',
    renderTranslation: { x: 0, y: 0 },
    renderScale: { x: 1, y: 1 },
    renderAngle: 0,
    renderPivot: { x: 0.5, y: 0.5 },
    textProps: defaults.textProps,
    imageProps: defaults.imageProps,
    buttonProps: defaults.buttonProps,
    progressBarProps: defaults.progressBarProps,
    sliderProps: defaults.sliderProps,
    textBoxProps: defaults.textBoxProps,
    checkBoxProps: defaults.checkBoxProps,
    borderProps: defaults.borderProps,
    sizeBoxProps: defaults.sizeBoxProps,
    comboBoxProps: defaults.comboBoxProps,
    scrollBoxProps: defaults.scrollBoxProps,
    spacerProps: defaults.spacerProps,
    children: [],
  };
}

// ============================================================
//  Widget Animation (simple keyframe system)
// ============================================================

export interface WidgetAnimationKey {
  time: number; // seconds
  value: number;
  easing: 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut';
}

export interface WidgetAnimationTrack {
  /** Target widget ID */
  targetWidgetId: string;
  /** Property path (e.g., 'renderOpacity', 'renderTranslation.x', 'slot.offsetX') */
  propertyPath: string;
  /** Keyframes */
  keys: WidgetAnimationKey[];
}

export interface WidgetAnimation {
  id: string;
  name: string;
  /** Total duration (seconds) */
  duration: number;
  /** Loop playback */
  isLooping: boolean;
  /** Tracks */
  tracks: WidgetAnimationTrack[];
}

export function defaultWidgetAnimation(name: string): WidgetAnimation {
  return {
    id: widgetUid(),
    name,
    duration: 1.0,
    isLooping: false,
    tracks: [],
  };
}

// ============================================================
//  Widget Blueprint JSON (Persistence)
// ============================================================

export interface WidgetBlueprintJSON {
  widgetBlueprintId: string;
  widgetBlueprintName: string;
  /** Root widget (always a CanvasPanel) */
  rootWidgetId: string;
  /** Flat map of all widgets by id */
  widgets: Record<string, WidgetNodeJSON>;
  /** Animations defined for this widget */
  animations: WidgetAnimation[];
  /** Event graph node data (Rete-style) */
  eventGraph: BlueprintGraphData | null;
  /** Compiled JS code from the event graph */
  compiledCode?: string;
  /** Serialized Rete node graph for the event graph editor */
  blueprintGraphNodeData?: any;
  /** Designer viewport zoom/pan state */
  designerState?: {
    zoom: number;
    panX: number;
    panY: number;
  };
  /** Blueprint variables */
  variables?: import('./BlueprintData').BlueprintVariable[];
  /** Blueprint functions */
  functions?: import('./BlueprintData').BlueprintFunction[];
  /** Blueprint macros */
  macros?: import('./BlueprintData').BlueprintMacro[];
  /** Blueprint custom events */
  customEvents?: import('./BlueprintData').BlueprintCustomEvent[];
  /** Blueprint structs */
  structs?: import('./BlueprintData').BlueprintStruct[];
  /** Serialized node data per function graph */
  functionGraphData?: Record<string, any>;
}

// ============================================================
//  Widget Blueprint Asset Class
// ============================================================

export class WidgetBlueprintAsset {
  public id: string;
  public name: string;
  /** Root widget ID (always a CanvasPanel) */
  public rootWidgetId: string;
  /** All widgets (flat map) */
  public widgets: Map<string, WidgetNodeJSON>;
  /** Animations */
  public animations: WidgetAnimation[];
  /** Event graph (for blueprint visual scripting) */
  public eventGraph: BlueprintGraphData | null;
  /** BlueprintData for the event graph Rete editor */
  public blueprintData: BlueprintData;
  /** Compiled JS code from the event graph */
  public compiledCode: string = '';
  /** Designer viewport state */
  public designerState = { zoom: 1, panX: 0, panY: 0 };

  private _dirty = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;

    // Create root CanvasPanel
    const root = createWidgetNode('CanvasPanel', 'RootCanvas');
    root.slot = {
      ...defaultSlot(),
      anchor: { ...AnchorPresets.StretchFull },
      sizeX: 1920,
      sizeY: 1080,
    };
    this.rootWidgetId = root.id;
    this.widgets = new Map([[root.id, root]]);
    this.animations = [];
    this.eventGraph = null;
    this.blueprintData = new BlueprintData();
  }

  /** Get widget by id */
  getWidget(id: string): WidgetNodeJSON | undefined {
    return this.widgets.get(id);
  }

  /** Get root widget */
  getRootWidget(): WidgetNodeJSON {
    return this.widgets.get(this.rootWidgetId)!;
  }

  /** Add a widget as child of parentId */
  addWidget(type: WidgetType, parentId: string, name?: string): WidgetNodeJSON | null {
    const parent = this.widgets.get(parentId);
    if (!parent) return null;

    // Only containers can have children
    if (!this._isContainer(parent.type)) return null;

    const node = createWidgetNode(type, name);
    this.widgets.set(node.id, node);
    parent.children.push(node.id);
    this._dirty = true;
    return node;
  }

  /** Remove a widget and all its descendants */
  removeWidget(id: string): void {
    if (id === this.rootWidgetId) return; // cannot remove root

    // Remove from parent's children array
    for (const [, w] of this.widgets) {
      const idx = w.children.indexOf(id);
      if (idx >= 0) {
        w.children.splice(idx, 1);
        break;
      }
    }

    // Recursively remove descendants
    const removeRecursive = (wid: string) => {
      const widget = this.widgets.get(wid);
      if (!widget) return;
      for (const childId of widget.children) {
        removeRecursive(childId);
      }
      this.widgets.delete(wid);
    };
    removeRecursive(id);
    this._dirty = true;
  }

  /** Reparent a widget to a new parent */
  reparentWidget(widgetId: string, newParentId: string, insertIndex?: number): boolean {
    if (widgetId === this.rootWidgetId) return false;
    const widget = this.widgets.get(widgetId);
    const newParent = this.widgets.get(newParentId);
    if (!widget || !newParent) return false;
    if (!this._isContainer(newParent.type)) return false;

    // Prevent circular reparenting
    if (this._isDescendant(newParentId, widgetId)) return false;

    // Remove from old parent
    for (const [, w] of this.widgets) {
      const idx = w.children.indexOf(widgetId);
      if (idx >= 0) {
        w.children.splice(idx, 1);
        break;
      }
    }

    // Add to new parent
    if (insertIndex !== undefined && insertIndex >= 0) {
      newParent.children.splice(insertIndex, 0, widgetId);
    } else {
      newParent.children.push(widgetId);
    }
    this._dirty = true;
    return true;
  }

  /** Get parent of a widget */
  getParent(widgetId: string): WidgetNodeJSON | null {
    for (const [, w] of this.widgets) {
      if (w.children.includes(widgetId)) return w;
    }
    return null;
  }

  /** Duplicate a widget (and children) under the same parent */
  duplicateWidget(widgetId: string): WidgetNodeJSON | null {
    const widget = this.widgets.get(widgetId);
    if (!widget || widgetId === this.rootWidgetId) return null;

    const parent = this.getParent(widgetId);
    if (!parent) return null;

    const cloneRecursive = (srcId: string): string => {
      const src = this.widgets.get(srcId)!;
      const newNode: WidgetNodeJSON = {
        ...structuredClone(src),
        id: widgetUid(),
        name: src.name + '_Copy',
        children: [],
      };
      this.widgets.set(newNode.id, newNode);
      for (const childId of src.children) {
        const clonedChildId = cloneRecursive(childId);
        newNode.children.push(clonedChildId);
      }
      return newNode.id;
    };

    const newId = cloneRecursive(widgetId);
    parent.children.push(newId);
    this._dirty = true;
    return this.widgets.get(newId)!;
  }

  /** Check if a widget type is a container */
  private _isContainer(type: WidgetType): boolean {
    return [
      'CanvasPanel', 'VerticalBox', 'HorizontalBox', 'Overlay',
      'GridPanel', 'WrapBox', 'ScrollBox', 'SizeBox', 'ScaleBox',
      'Border', 'Button', 'WidgetSwitcher',
    ].includes(type);
  }

  /** Check if `possibleDescendant` is a descendant of `ancestorId` */
  private _isDescendant(possibleDescendant: string, ancestorId: string): boolean {
    const ancestor = this.widgets.get(ancestorId);
    if (!ancestor) return false;
    for (const childId of ancestor.children) {
      if (childId === possibleDescendant) return true;
      if (this._isDescendant(possibleDescendant, childId)) return true;
    }
    return false;
  }

  /** Check whether type is a container */
  isContainerType(type: WidgetType): boolean {
    return this._isContainer(type);
  }

  touch(): void {
    this._dirty = true;
  }

  // ---- Serialization ----

  toJSON(): WidgetBlueprintJSON {
    const widgetMap: Record<string, WidgetNodeJSON> = {};
    for (const [id, w] of this.widgets) {
      widgetMap[id] = structuredClone(w);
    }
    const bp = this.blueprintData;
    return {
      widgetBlueprintId: this.id,
      widgetBlueprintName: this.name,
      rootWidgetId: this.rootWidgetId,
      widgets: widgetMap,
      animations: structuredClone(this.animations),
      eventGraph: {
        nodeData: bp.eventGraph.nodeData ?? null,
        comments: bp.eventGraph.comments ?? [],
      },
      compiledCode: this.compiledCode,
      blueprintGraphNodeData: this.blueprintData.eventGraph.nodeData ?? null,
      designerState: { ...this.designerState },
      // Save blueprint data (functions, macros, variables, structs)
      variables: structuredClone(bp.variables),
      functions: bp.functions.map(f => ({
        ...structuredClone(f),
        graph: { nodeData: f.graph.nodeData ?? null, comments: f.graph.comments ?? [] },
      })),
      macros: bp.macros.map(m => ({
        ...structuredClone(m),
        graph: { nodeData: m.graph.nodeData ?? null, comments: m.graph.comments ?? [] },
      })),
      customEvents: structuredClone(bp.customEvents),
      structs: structuredClone(bp.structs),
      functionGraphData: Object.fromEntries(
        bp.functions.map(f => [f.id, f.graph.nodeData ?? null]),
      ),
    };
  }

  static fromJSON(json: WidgetBlueprintJSON): WidgetBlueprintAsset {
    const asset = new WidgetBlueprintAsset(json.widgetBlueprintId, json.widgetBlueprintName);
    asset.rootWidgetId = json.rootWidgetId;
    asset.widgets.clear();
    for (const [id, w] of Object.entries(json.widgets)) {
      asset.widgets.set(id, w);
    }
    asset.animations = json.animations ?? [];
    asset.eventGraph = json.eventGraph ?? null;
    asset.compiledCode = json.compiledCode ?? '';

    // Load event graph with comments
    if (json.eventGraph) {
      asset.blueprintData.eventGraph = {
        nodeData: json.eventGraph.nodeData ?? json.blueprintGraphNodeData ?? null,
        comments: json.eventGraph.comments ?? [],
      };
    } else if (json.blueprintGraphNodeData) {
      asset.blueprintData.eventGraph.nodeData = json.blueprintGraphNodeData;
    }

    if (json.designerState) {
      asset.designerState = json.designerState;
    }

    // Load blueprint data (functions, macros, variables, structs)
    const bp = asset.blueprintData;
    bp.variables = json.variables || [];
    bp.functions = (json.functions || []).map(f => ({
      ...f,
      localVariables: f.localVariables || [],
      graph: {
        nodeData: json.functionGraphData?.[f.id] ?? f.graph?.nodeData ?? null,
        comments: f.graph?.comments ?? [],
      },
    }));
    bp.macros = (json.macros || []).map(m => ({
      ...m,
      graph: {
        nodeData: m.graph?.nodeData ?? null,
        comments: m.graph?.comments ?? [],
      },
    }));
    bp.customEvents = (json.customEvents || []).map(e => ({
      ...e,
      params: e.params || [],
    }));
    bp.structs = json.structs || [];

    return asset;
  }
}

// ============================================================
//  Widget Blueprint Manager (Singleton)
// ============================================================

export class WidgetBlueprintManager {
  private _assets: Map<string, WidgetBlueprintAsset> = new Map();
  private _listeners: Array<() => void> = [];

  /** Global singleton */
  private static _instance: WidgetBlueprintManager | null = null;

  constructor() {
    WidgetBlueprintManager._instance = this;
  }

  static get instance(): WidgetBlueprintManager | null {
    return WidgetBlueprintManager._instance;
  }

  static getAsset(id: string): WidgetBlueprintAsset | undefined {
    return WidgetBlueprintManager._instance?.getAsset(id);
  }

  get assets(): WidgetBlueprintAsset[] {
    return Array.from(this._assets.values());
  }

  getAsset(id: string): WidgetBlueprintAsset | undefined {
    return this._assets.get(id);
  }

  createAsset(name: string): WidgetBlueprintAsset {
    const id = widgetUid();
    const asset = new WidgetBlueprintAsset(id, name);
    this._assets.set(id, asset);
    this._notify();
    return asset;
  }

  removeAsset(id: string): void {
    this._assets.delete(id);
    this._notify();
  }

  renameAsset(id: string, newName: string): void {
    const asset = this._assets.get(id);
    if (asset) {
      asset.name = newName;
      asset.touch();
      this._notify();
    }
  }

  notifyAssetChanged(id?: string): void {
    this._notify();
  }

  exportAll(): WidgetBlueprintJSON[] {
    return this.assets.map(a => a.toJSON());
  }

  importAll(jsonArr: WidgetBlueprintJSON[]): void {
    this._assets.clear();
    for (const json of jsonArr) {
      const asset = WidgetBlueprintAsset.fromJSON(json);
      this._assets.set(asset.id, asset);
    }
    this._notify();
  }

  clear(): void {
    this._assets.clear();
    this._notify();
  }

  onChanged(cb: () => void): void {
    this._listeners.push(cb);
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[WidgetBlueprintManager] listener error:', e); }
    }
  }
}
