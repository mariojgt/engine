// ============================================================
//  WidgetBlueprintEditorPanel — Visual editor for Widget Blueprints
//  Tabs: Designer (visual canvas) | Event Graph (Rete nodes)
//  Designer: drag-and-drop widget hierarchy, property editing,
//            WYSIWYG canvas preview with anchors and slots
// ============================================================

import type {
  WidgetBlueprintAsset,
  WidgetNodeJSON,
  WidgetType,
  WidgetVisibility,
  TextJustification,
  SizeMode,
} from './WidgetBlueprintData';
import {
  createWidgetNode,
  defaultSlot,
  AnchorPresets,
} from './WidgetBlueprintData';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import { TextureLibrary } from './TextureLibrary';
import { FontLibrary } from './FontLibrary';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import { createClassInfoBar, inheritanceBadgeHTML } from './InheritanceDialogsUI';
import { iconHTML, Icons, ICON_COLORS } from './icons';
import { WidgetLayoutEngine, type LayoutRect } from './WidgetLayoutEngine';
import { WidgetAnimationTimeline } from './WidgetAnimationTimeline';

type EditorTab = 'designer' | 'eventGraph';

/** Palette categories for the widget toolbox */
interface PaletteCategory {
  label: string;
  icon: string;
  widgets: Array<{ type: WidgetType; label: string; icon: string }>;
}

const PALETTE: PaletteCategory[] = [
  {
    label: 'COMMON', icon: iconHTML(Icons.Target, 'sm', ICON_COLORS.warning),
    widgets: [
      { type: 'Border', label: 'Border', icon: iconHTML(Icons.BoxSelect, 'sm') },
      { type: 'Button', label: 'Button', icon: iconHTML(Icons.MousePointerClick, 'sm') },
      { type: 'CheckBox', label: 'Check Box', icon: iconHTML(Icons.ToggleLeft, 'sm') },
      { type: 'Image', label: 'Image', icon: iconHTML(Icons.Image, 'sm') },
      { type: 'ProgressBar', label: 'Progress Bar', icon: iconHTML(Icons.BarChart2, 'sm') },
      { type: 'Slider', label: 'Slider', icon: iconHTML(Icons.SlidersHorizontal, 'sm') },
      { type: 'Text', label: 'Text', icon: iconHTML(Icons.Type, 'sm') },
      { type: 'TextBox', label: 'Text Box', icon: iconHTML(Icons.TextCursorInput, 'sm') },
    ],
  },
  {
    label: 'INPUT', icon: iconHTML(Icons.Pencil, 'sm', ICON_COLORS.muted),
    widgets: [
      { type: 'CheckBox', label: 'Check Box', icon: iconHTML(Icons.ToggleLeft, 'sm') },
      { type: 'ComboBox', label: 'Combo Box', icon: iconHTML(Icons.ChevronsUpDown, 'sm') },
      { type: 'Slider', label: 'Slider', icon: iconHTML(Icons.SlidersHorizontal, 'sm') },
      { type: 'TextBox', label: 'Text Box', icon: iconHTML(Icons.TextCursorInput, 'sm') },
    ],
  },
  {
    label: 'PANEL', icon: iconHTML(Icons.Layout, 'sm', ICON_COLORS.muted),
    widgets: [
      { type: 'CanvasPanel', label: 'Canvas Panel', icon: iconHTML(Icons.Layout, 'sm') },
      { type: 'GridPanel', label: 'Grid Panel', icon: iconHTML(Icons.Grid2x2, 'sm') },
      { type: 'HorizontalBox', label: 'Horizontal Box', icon: iconHTML(Icons.Grid, 'sm') },
      { type: 'Overlay', label: 'Overlay', icon: iconHTML(Icons.Layers, 'sm') },
      { type: 'ScaleBox', label: 'Scale Box', icon: iconHTML(Icons.Maximize2, 'sm') },
      { type: 'ScrollBox', label: 'Scroll Box', icon: iconHTML(Icons.ChevronsUpDown, 'sm') },
      { type: 'SizeBox', label: 'Size Box', icon: iconHTML(Icons.Square, 'sm') },
      { type: 'VerticalBox', label: 'Vertical Box', icon: iconHTML(Icons.Grid2x2, 'sm') },
      { type: 'WidgetSwitcher', label: 'Widget Switcher', icon: iconHTML(Icons.RefreshCw, 'sm') },
      { type: 'WrapBox', label: 'Wrap Box', icon: iconHTML(Icons.Grid, 'sm') },
      { type: 'NamedSlot', label: 'Named Slot', icon: iconHTML(Icons.BoxSelect, 'sm') },
    ],
  },
  {
    label: 'PRIMITIVE', icon: iconHTML(Icons.Diamond, 'sm', ICON_COLORS.muted),
    widgets: [
      { type: 'Border', label: 'Border', icon: iconHTML(Icons.BoxSelect, 'sm') },
      { type: 'Image', label: 'Image', icon: iconHTML(Icons.Image, 'sm') },
      { type: 'Spacer', label: 'Spacer', icon: iconHTML(Icons.Minus, 'sm') },
    ],
  },
  {
    label: 'SPECIAL EFFECTS', icon: iconHTML(Icons.Zap, 'sm', ICON_COLORS.warning),
    widgets: [
      { type: 'CircularThrobber', label: 'Throbber', icon: iconHTML(Icons.Loader2, 'sm') },
      { type: 'ProgressBar', label: 'Progress Bar', icon: iconHTML(Icons.BarChart2, 'sm') },
    ],
  },
  {
    label: 'LISTS', icon: iconHTML(Icons.List, 'sm', ICON_COLORS.muted),
    widgets: [] as Array<{ type: WidgetType; label: string; icon: string }>,
  },
  {
    label: 'UNCATEGORIZED', icon: iconHTML(Icons.Ellipsis, 'sm', ICON_COLORS.muted),
    widgets: [] as Array<{ type: WidgetType; label: string; icon: string }>,
  },
  {
    label: 'USER CREATED', icon: iconHTML(Icons.Plus, 'sm', ICON_COLORS.blue),
    widgets: [] as Array<{ type: WidgetType; label: string; icon: string }>,
  },
];

/** Screen size presets matching UE */
const SCREEN_SIZES: Array<{ label: string; width: number; height: number }> = [
  { label: '1920×1080 (Full HD)', width: 1920, height: 1080 },
  { label: '2560×1440 (QHD)', width: 2560, height: 1440 },
  { label: '3840×2160 (4K)', width: 3840, height: 2160 },
  { label: '1280×720 (720p)', width: 1280, height: 720 },
  { label: '1024×768', width: 1024, height: 768 },
  { label: '800×600', width: 800, height: 600 },
  { label: 'Custom...', width: 0, height: 0 },
];

export class WidgetBlueprintEditorPanel {
  private _container: HTMLElement;
  private _asset: WidgetBlueprintAsset;
  private _onSave?: () => void;
  private _onCompile?: (code: string) => void;

  private _tabBar!: HTMLElement;
  private _contentArea!: HTMLElement;
  private _activeTab: EditorTab = 'designer';

  // Compile / Save state
  private _compileStatus: 'compiled' | 'dirty' | 'error' = 'compiled';
  private _compileStatusEl: HTMLElement | null = null;
  private _compileBtnEl: HTMLElement | null = null;
  private _lastCompileTime: number = 0;

  // Designer state
  private _selectedWidgetId: string | null = null;
  private _canvas!: HTMLCanvasElement;
  private _ctx!: CanvasRenderingContext2D;
  private _designerZoom = 0.5;
  private _designerPanX = 0;
  private _designerPanY = 0;
  private _isPanning = false;
  private _panStartX = 0;
  private _panStartY = 0;
  private _isDraggingWidget = false;
  private _dragWidgetId: string | null = null;
  private _dragOffsetX = 0;
  private _dragOffsetY = 0;
  private _animFrame = 0;
  // Layout engine
  private _layoutEngine!: WidgetLayoutEngine;
  // Animation timeline
  private _animTimeline: WidgetAnimationTimeline | null = null;
  private _animTimelineVisible = false;
  // Play-mode preview state
  private _isPlayMode = false;
  private _playModeOverlay: HTMLElement | null = null;
  private _playModeStartTime = 0;
  private _playModeLastTick = 0;
  private _playModeHovered: string | null = null;
  private _playModePressed: string | null = null;
  private _playModeWidgetStates: Map<string, Record<string, any>> = new Map();
  // Snap / Grid / Multi-select state
  private _snapToGrid = false;
  private _snapGridSize = 8;
  private _snapToEdges = true;
  private _snapGuideLines: Array<{ axis: 'x' | 'y'; pos: number }> = [];
  private _multiSelection: Set<string> = new Set();
  private _isMarqueeSelecting = false;
  private _marqueeStartX = 0;
  private _marqueeStartY = 0;
  private _marqueeEndX = 0;
  private _marqueeEndY = 0;
  // Resize handle state
  private _isResizing = false;
  private _resizeWidgetId: string | null = null;
  private _resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' | null = null;
  private _resizeStartX = 0;
  private _resizeStartY = 0;
  private _resizeStartWidth = 0;
  private _resizeStartHeight = 0;
  private _resizeStartOffsetX = 0;
  private _resizeStartOffsetY = 0;

  // Hierarchy & properties panels
  private _hierarchyEl!: HTMLElement;
  private _propsEl!: HTMLElement;

  // Event graph cleanup
  private _eventGraphCleanup: (() => void) | null = null;

  // Designer toolbar state
  private _screenSizeIdx = 0;
  private _dpiScale = 1.0;
  private _showRulers = true;
  private _leftPanelTab: 'palette' | 'library' = 'palette';
  private _paletteSearch = '';
  private _designerToolbarEl: HTMLElement | null = null;
  private _zoomLabelEl: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    asset: WidgetBlueprintAsset,
    onCompile?: (code: string) => void,
    onSave?: () => void,
  ) {
    this._container = container;
    this._asset = asset;
    this._onCompile = onCompile;
    this._onSave = onSave;
    this._designerZoom = asset.designerState?.zoom ?? 0.5;
    this._designerPanX = asset.designerState?.panX ?? 0;
    this._designerPanY = asset.designerState?.panY ?? 0;
    this._layoutEngine = new WidgetLayoutEngine((id) => this._asset.getWidget(id));
    this._build();
  }

  dispose(): void {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._isPlayMode) this._stopPlayMode();
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }
    if (this._animTimeline) {
      this._animTimeline.dispose();
      this._animTimeline = null;
    }
  }

  // ============================================================
  //  Play-Mode Preview
  // ============================================================

  private _togglePlayMode(): void {
    if (this._isPlayMode) {
      this._stopPlayMode();
    } else {
      this._startPlayMode();
    }
    this._rebuildTabBar();
  }

  private _startPlayMode(): void {
    this._isPlayMode = true;
    this._playModeStartTime = performance.now();
    this._playModeLastTick = this._playModeStartTime;
    this._playModeHovered = null;
    this._playModePressed = null;
    this._playModeWidgetStates.clear();

    // Snapshot widget property values so we can restore on stop
    const allIds = Array.from(this._asset.widgets.keys());
    for (const id of allIds) {
      const w = this._asset.getWidget(id);
      if (w) {
        this._playModeWidgetStates.set(id, {
          renderOpacity: w.renderOpacity,
          visibility: w.visibility,
          text: w.textProps?.text,
        });
      }
    }

    // Create play-mode overlay banner
    const overlay = document.createElement('div');
    overlay.className = 'wbp-playmode-overlay';
    overlay.innerHTML = `
      <div class="wbp-playmode-banner">
        <span style="color:#2ecc71;font-weight:700">▶ SIMULATION</span>
        <span style="margin-left:12px;color:#aaa;font-size:11px">Press Esc or click Stop to end</span>
      </div>`;
    overlay.style.cssText = `
      position:absolute;top:0;left:0;right:0;pointer-events:none;z-index:50;
      display:flex;justify-content:center;padding:8px;`;
    const canvasWrapper = this._canvas.parentElement;
    if (canvasWrapper) {
      canvasWrapper.style.position = 'relative';
      canvasWrapper.appendChild(overlay);
      // Green border glow to indicate play mode
      canvasWrapper.style.boxShadow = 'inset 0 0 12px rgba(46,204,113,0.35)';
    }
    this._playModeOverlay = overlay;

    // Listen for Escape to stop
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this._isPlayMode) {
        this._togglePlayMode();
      }
    };
    document.addEventListener('keydown', escHandler);
    (this as any)._playModeEscHandler = escHandler;

    // Intercept canvas clicks for Button presses
    const clickHandler = (e: MouseEvent) => {
      if (!this._isPlayMode) return;
      const rect = this._canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * window.devicePixelRatio;
      const my = (e.clientY - rect.top) * window.devicePixelRatio;
      const hit = this._hitTestCanvas(mx, my);
      if (hit) {
        const w = this._asset.getWidget(hit);
        if (w && w.type === 'Button') {
          this._playModePressed = hit;
          // Flash the button briefly
          setTimeout(() => { this._playModePressed = null; }, 150);
        }
      }
    };
    this._canvas.addEventListener('click', clickHandler);
    (this as any)._playModeClickHandler = clickHandler;

    // Hover tracking for Buttons
    const hoverHandler = (e: MouseEvent) => {
      if (!this._isPlayMode) return;
      const rect = this._canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * window.devicePixelRatio;
      const my = (e.clientY - rect.top) * window.devicePixelRatio;
      const hit = this._hitTestCanvas(mx, my);
      if (hit) {
        const w = this._asset.getWidget(hit);
        this._playModeHovered = (w && (w.type === 'Button' || w.type === 'TextBox' || w.type === 'CheckBox' || w.type === 'Slider')) ? hit : null;
        this._canvas.style.cursor = this._playModeHovered ? 'pointer' : 'default';
      } else {
        this._playModeHovered = null;
        this._canvas.style.cursor = 'default';
      }
    };
    this._canvas.addEventListener('mousemove', hoverHandler);
    (this as any)._playModeHoverHandler = hoverHandler;
  }

  private _stopPlayMode(): void {
    this._isPlayMode = false;

    // Remove overlay
    if (this._playModeOverlay && this._playModeOverlay.parentElement) {
      this._playModeOverlay.parentElement.removeChild(this._playModeOverlay);
      const canvasWrapper = this._canvas.parentElement;
      if (canvasWrapper) canvasWrapper.style.boxShadow = '';
    }
    this._playModeOverlay = null;

    // Remove event listeners
    const escHandler = (this as any)._playModeEscHandler;
    if (escHandler) document.removeEventListener('keydown', escHandler);
    const clickHandler = (this as any)._playModeClickHandler;
    if (clickHandler) this._canvas.removeEventListener('click', clickHandler);
    const hoverHandler = (this as any)._playModeHoverHandler;
    if (hoverHandler) this._canvas.removeEventListener('mousemove', hoverHandler);

    // Restore original widget states
    for (const [id, snapshot] of this._playModeWidgetStates) {
      const w = this._asset.getWidget(id);
      if (w) {
        w.renderOpacity = snapshot.renderOpacity;
        w.visibility = snapshot.visibility;
        if (w.textProps && snapshot.text !== undefined) w.textProps.text = snapshot.text;
      }
    }
    this._playModeWidgetStates.clear();
    this._playModeHovered = null;
    this._playModePressed = null;
    this._canvas.style.cursor = 'default';
  }

  /** Called each frame from the render loop during play mode */
  private _tickPlayMode(): void {
    if (!this._isPlayMode) return;
    const now = performance.now();
    const _deltaMs = now - this._playModeLastTick;
    this._playModeLastTick = now;
    const _elapsedS = (now - this._playModeStartTime) / 1000;

    // Tick widget animations if the timeline is available
    if (this._animTimeline) {
      this._animTimeline.tickPlayMode?.();
    }
  }

  /** Mark the blueprint as needing recompilation (called externally when graph changes) */
  markDirty(): void {
    this._setCompileStatus('dirty');
  }

  // ============================================================
  //  Build UI
  // ============================================================

  private _build(): void {
    this._container.innerHTML = '';
    this._container.style.display = 'flex';
    this._container.style.flexDirection = 'column';
    this._container.style.height = '100%';
    this._container.style.overflow = 'hidden';
    this._container.classList.add('wbp-root');

    // Class Inheritance Info Bar (if this widget has inheritance metadata)
    const inh = ClassInheritanceSystem.instance;
    const entry = inh.getWidgetEntry(this._asset.id);
    if (entry) {
      const inhData = (this._asset as any)._inheritance;
      const parentId = inhData?.parentWidgetId ?? null;
      const parentName = parentId ? (inh.getWidgetEntry(parentId)?.name ?? 'Unknown') : null;
      const childCount = inhData?.childWidgetIds?.length ?? 0;

      const infoBarContainer = document.createElement('div');
      this._container.appendChild(infoBarContainer);

      createClassInfoBar(infoBarContainer, {
        className: this._asset.name,
        classId: this._asset.id,
        kind: 'widget',
        parentName,
        parentId,
        childCount,
        isOutOfSync: inh.isOutOfSync(this._asset.id),
        onOpenParent: parentId ? () => {
          document.dispatchEvent(new CustomEvent('open-widget-editor', { detail: { assetId: parentId } }));
        } : undefined,
        onShowInHierarchy: () => {
          document.dispatchEvent(new CustomEvent('show-in-hierarchy', { detail: { id: this._asset.id, kind: 'widget' } }));
        },
      });
    }

    // Top toolbar (UE style)
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'wbp-toolbar';
    this._container.appendChild(this._tabBar);

    // Content area
    this._contentArea = document.createElement('div');
    this._contentArea.className = 'wbp-content';
    this._container.appendChild(this._contentArea);

    this._rebuildTabBar();
    this._switchTab(this._activeTab);
  }

  private _rebuildTabBar(): void {
    this._tabBar.innerHTML = '';

    // ── Left: Compile + Diff + Play controls ──
    const leftGroup = document.createElement('div');
    leftGroup.className = 'wbp-toolbar-group';

    // Compile button
    const compileBtn = document.createElement('button');
    compileBtn.className = 'wbp-tb-btn';
    compileBtn.title = 'Compile this widget blueprint (Ctrl+F7)';
    this._compileBtnEl = compileBtn;
    this._updateCompileButton();
    compileBtn.addEventListener('click', () => this._doCompile());
    leftGroup.appendChild(compileBtn);

    // Compile status
    const statusEl = document.createElement('span');
    statusEl.className = 'wbp-compile-status';
    this._compileStatusEl = statusEl;
    this._updateCompileStatus();
    leftGroup.appendChild(statusEl);

    // Separator
    leftGroup.appendChild(this._makeTbSep());

    // Diff button (placeholder)
    const diffBtn = document.createElement('button');
    diffBtn.className = 'wbp-tb-btn wbp-tb-secondary';
    diffBtn.innerHTML = '<span class="wbp-tb-icon">' + iconHTML(Icons.GitBranch, 'sm') + '</span> Diff';
    diffBtn.title = 'Diff against previous version';
    leftGroup.appendChild(diffBtn);

    leftGroup.appendChild(this._makeTbSep());

    // Play controls
    const playBtn = document.createElement('button');
    playBtn.className = 'wbp-tb-btn wbp-tb-play';
    playBtn.innerHTML = this._isPlayMode
      ? iconHTML(Icons.Square, 'sm')
      : iconHTML(Icons.Play, 'sm');
    playBtn.title = this._isPlayMode ? 'Stop preview (Esc)' : 'Play in viewport';
    if (this._isPlayMode) playBtn.style.background = '#c0392b';
    playBtn.addEventListener('click', () => this._togglePlayMode());
    leftGroup.appendChild(playBtn);

    const playDropdown = document.createElement('button');
    playDropdown.className = 'wbp-tb-btn wbp-tb-play-dd';
    playDropdown.innerHTML = iconHTML(Icons.ChevronDown, 'sm');
    leftGroup.appendChild(playDropdown);

    leftGroup.appendChild(this._makeTbSep());

    // Debug object selector (placeholder)
    const debugSel = document.createElement('select');
    debugSel.className = 'wbp-tb-select';
    const opt = document.createElement('option');
    opt.textContent = 'No debug object selected';
    debugSel.appendChild(opt);
    leftGroup.appendChild(debugSel);

    this._tabBar.appendChild(leftGroup);

    // ── Center: Widget Reflector (placeholder) ──
    const centerGroup = document.createElement('div');
    centerGroup.className = 'wbp-toolbar-center';
    const reflectorBtn = document.createElement('button');
    reflectorBtn.className = 'wbp-tb-btn wbp-tb-secondary';
    reflectorBtn.textContent = 'Widget Reflector';
    centerGroup.appendChild(reflectorBtn);
    this._tabBar.appendChild(centerGroup);

    // ── Right: Designer / Graph toggle + Save ──
    const rightGroup = document.createElement('div');
    rightGroup.className = 'wbp-toolbar-group';

    // Save button
    if (this._onSave) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'wbp-tb-btn wbp-tb-secondary';
      saveBtn.innerHTML = iconHTML(Icons.Save, 'sm');
      saveBtn.title = 'Save all (Ctrl+S)';
      saveBtn.addEventListener('click', () => this._doSave());
      rightGroup.appendChild(saveBtn);
      rightGroup.appendChild(this._makeTbSep());
    }

    // Designer tab
    const designerBtn = document.createElement('button');
    designerBtn.className = `wbp-tb-mode${this._activeTab === 'designer' ? ' wbp-tb-mode-active wbp-tb-mode-designer' : ''}`;
    designerBtn.innerHTML = iconHTML(Icons.Pencil, 'sm') + ' Designer';
    designerBtn.addEventListener('click', () => {
      if (this._activeTab !== 'designer') {
        this._activeTab = 'designer';
        this._rebuildTabBar();
        this._switchTab('designer');
      }
    });
    rightGroup.appendChild(designerBtn);

    // Graph tab
    const graphBtn = document.createElement('button');
    graphBtn.className = `wbp-tb-mode${this._activeTab === 'eventGraph' ? ' wbp-tb-mode-active wbp-tb-mode-graph' : ''}`;
    graphBtn.innerHTML = iconHTML(Icons.Grid2x2, 'sm') + ' Graph';
    graphBtn.addEventListener('click', () => {
      if (this._activeTab !== 'eventGraph') {
        this._activeTab = 'eventGraph';
        this._rebuildTabBar();
        this._switchTab('eventGraph');
      }
    });
    rightGroup.appendChild(graphBtn);

    this._tabBar.appendChild(rightGroup);
  }

  private _makeTbSep(): HTMLElement {
    const s = document.createElement('div');
    s.className = 'wbp-tb-sep';
    return s;
  }

  private _setCompileStatus(status: 'compiled' | 'dirty' | 'error'): void {
    this._compileStatus = status;
    if (status === 'compiled') this._lastCompileTime = Date.now();
    this._updateCompileButton();
    this._updateCompileStatus();
  }

  private _updateCompileButton(): void {
    if (!this._compileBtnEl) return;
    const btn = this._compileBtnEl;
    switch (this._compileStatus) {
      case 'compiled':
        btn.innerHTML = '<span class="wbp-tb-icon">' + iconHTML(Icons.Check, 'sm', ICON_COLORS.success) + '</span> Compile';
        btn.className = 'wbp-tb-btn wbp-compile-ok';
        break;
      case 'dirty':
        btn.innerHTML = '<span class="wbp-tb-icon">' + iconHTML(Icons.Loader2, 'sm', ICON_COLORS.warning) + '</span> Compile';
        btn.className = 'wbp-tb-btn wbp-compile-dirty';
        break;
      case 'error':
        btn.innerHTML = '<span class="wbp-tb-icon">' + iconHTML(Icons.XCircle, 'sm', ICON_COLORS.error) + '</span> Compile';
        btn.className = 'wbp-tb-btn wbp-compile-error';
        break;
    }
  }

  private _updateCompileStatus(): void {
    if (!this._compileStatusEl) return;
    switch (this._compileStatus) {
      case 'compiled': {
        const ago = this._lastCompileTime ? this._timeSince(this._lastCompileTime) : '';
        this._compileStatusEl.textContent = ago ? `Compiled ${ago}` : 'Up to date';
        this._compileStatusEl.className = 'wbp-compile-status wbp-status-ok';
        break;
      }
      case 'dirty':
        this._compileStatusEl.textContent = 'Needs recompile';
        this._compileStatusEl.className = 'wbp-compile-status wbp-status-dirty';
        break;
      case 'error':
        this._compileStatusEl.textContent = 'Compile error!';
        this._compileStatusEl.className = 'wbp-compile-status wbp-status-error';
        break;
    }
  }

  private _timeSince(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ago`;
  }

  /** Trigger manual compile — calls the live node editor's compileAndSave without destroying the graph */
  private _doCompile(): void {
    // Find the event graph container and trigger compile
    const wrapper = this._contentArea.querySelector('div');
    if (wrapper) {
      const editorContainer = wrapper.querySelector('div') as any;
      // Try the direct ref first (set by NodeEditorView)
      if (editorContainer && typeof editorContainer.__compileAndSave === 'function') {
        editorContainer.__compileAndSave();
        return;
      }
      // Fallback: walk children
      const children = wrapper.querySelectorAll('div');
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as any;
        if (child && typeof child.__compileAndSave === 'function') {
          child.__compileAndSave();
          return;
        }
      }
    }
    // Last resort: just fire the onCompile with existing code (no-op recompile)
    if (this._asset.compiledCode) {
      this._onCompile?.(this._asset.compiledCode);
      this._setCompileStatus('compiled');
    }
  }

  /** Trigger save with asset touch */
  private _doSave(): void {
    this._asset.touch();
    this._onSave?.();
  }

  private _switchTab(tab: EditorTab): void {
    this._contentArea.innerHTML = '';
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = 0;
    }
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }

    switch (tab) {
      case 'designer':
        this._buildDesignerTab();
        break;
      case 'eventGraph':
        this._buildEventGraphTab();
        break;
    }
  }

  // ============================================================
  //  Event Graph Tab (Rete Node Editor)
  // ============================================================

  /**
   * Collect all widgets from the asset hierarchy for widget selector dropdowns
   */
  private _getAllWidgetsForSelector(): Array<{ name: string; type: string }> {
    const widgets: Array<{ name: string; type: string }> = [];
    console.log('[WidgetBP] Collecting widgets. Total widgets in asset:', this._asset.widgets.size);
    for (const [id, widget] of this._asset.widgets) {
      console.log(`[WidgetBP] Widget ${id}: name="${widget.name}", type="${widget.type}"`);
      if (widget.name && id !== this._asset.rootWidgetId) {
        widgets.push({ name: widget.name, type: widget.type });
      }
    }
    console.log('[WidgetBP] Collected widgets for selector:', widgets);
    return widgets;
  }

  private _buildEventGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.height = '100%';
    wrapper.style.overflow = 'hidden';

    const editorContainer = document.createElement('div');
    editorContainer.style.flex = '1';
    editorContainer.style.position = 'relative';
    editorContainer.style.overflow = 'hidden';
    editorContainer.style.minHeight = '300px';
    wrapper.appendChild(editorContainer);

    this._contentArea.appendChild(wrapper);

    const bp = this._asset.blueprintData;
    const widgetList = this._getAllWidgetsForSelector();
    this._eventGraphCleanup = mountNodeEditorForAsset(
      editorContainer,
      bp,
      `${this._asset.name} Event Graph`,
      (code: string) => {
        console.log(`[WidgetBP] Compiled "${this._asset.name}" - Code length: ${code.length} chars`);
        console.log(`[WidgetBP] Has __setupWidgetEvents: ${code.includes('__setupWidgetEvents')}`);
        this._asset.compiledCode = code;
        this._asset.touch();
        this._onCompile?.(code);
        this._setCompileStatus('compiled');
        this._onSave?.();
      },
      undefined, // components
      undefined, // rootMeshType
      widgetList,
    );
  }

  // ============================================================
  //  Designer Tab — Visual Widget Editor
  // ============================================================

  private _buildDesignerTab(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'wbp-designer-layout';

    // ══════════════ LEFT PANEL: Palette tabs + Hierarchy ══════════════
    const leftPanel = document.createElement('div');
    leftPanel.className = 'wbp-left-panel';

    // ── Top section: Palette / Library tabs ──
    const leftTopSection = document.createElement('div');
    leftTopSection.className = 'wbp-left-top';

    // Tab row
    const leftTabRow = document.createElement('div');
    leftTabRow.className = 'wbp-panel-tabs';

    const paletteTab = document.createElement('button');
    paletteTab.className = `wbp-panel-tab${this._leftPanelTab === 'palette' ? ' active' : ''}`;
    paletteTab.textContent = 'Palette';
    paletteTab.addEventListener('click', () => { this._leftPanelTab = 'palette'; this._rebuildLeftPanel(leftTopSection); });

    const libraryTab = document.createElement('button');
    libraryTab.className = `wbp-panel-tab${this._leftPanelTab === 'library' ? ' active' : ''}`;
    libraryTab.textContent = 'Library';
    libraryTab.addEventListener('click', () => { this._leftPanelTab = 'library'; this._rebuildLeftPanel(leftTopSection); });

    // Close button for left panel
    const closeLeftBtn = document.createElement('button');
    closeLeftBtn.className = 'wbp-panel-close';
    closeLeftBtn.innerHTML = iconHTML(Icons.X, 'xs');

    leftTabRow.appendChild(paletteTab);
    leftTabRow.appendChild(libraryTab);
    leftTabRow.appendChild(closeLeftBtn);
    leftTopSection.appendChild(leftTabRow);

    // Panel content area
    const leftContent = document.createElement('div');
    leftContent.className = 'wbp-panel-content';
    leftTopSection.appendChild(leftContent);
    this._rebuildLeftPanelContent(leftContent);

    leftPanel.appendChild(leftTopSection);

    // ── Bottom section: Hierarchy ──
    const leftBottomSection = document.createElement('div');
    leftBottomSection.className = 'wbp-left-bottom';

    const hierTabRow = document.createElement('div');
    hierTabRow.className = 'wbp-panel-tabs';
    const hierTab = document.createElement('button');
    hierTab.className = 'wbp-panel-tab active';
    hierTab.textContent = 'Hierarchy';
    hierTabRow.appendChild(hierTab);

    const bindBtn = document.createElement('button');
    bindBtn.className = 'wbp-panel-tab-action';
    bindBtn.innerHTML = iconHTML(Icons.Grid2x2, 'sm') + ' Bind Widgets';
    hierTabRow.appendChild(bindBtn);

    const closeHierBtn = document.createElement('button');
    closeHierBtn.className = 'wbp-panel-close';
    closeHierBtn.innerHTML = iconHTML(Icons.X, 'xs');
    hierTabRow.appendChild(closeHierBtn);

    leftBottomSection.appendChild(hierTabRow);

    // Search widgets box
    const hierSearch = document.createElement('div');
    hierSearch.className = 'wbp-search-box';
    const hierSearchIcon = document.createElement('span');
    hierSearchIcon.className = 'wbp-search-icon';
    hierSearchIcon.innerHTML = iconHTML(Icons.Search, 'xs');
    const hierSearchInput = document.createElement('input');
    hierSearchInput.className = 'wbp-search-input';
    hierSearchInput.placeholder = 'Search Widgets';
    hierSearch.appendChild(hierSearchIcon);
    hierSearch.appendChild(hierSearchInput);
    leftBottomSection.appendChild(hierSearch);

    // Hierarchy tree
    this._hierarchyEl = document.createElement('div');
    this._hierarchyEl.className = 'wbp-hierarchy-tree';
    leftBottomSection.appendChild(this._hierarchyEl);

    leftPanel.appendChild(leftBottomSection);
    wrapper.appendChild(leftPanel);

    // ══════════════ CENTER: Designer Canvas ══════════════
    const centerArea = document.createElement('div');
    centerArea.className = 'wbp-center-area';

    // Designer toolbar (alignment, screen size, etc.)
    const designerToolbar = document.createElement('div');
    designerToolbar.className = 'wbp-designer-toolbar';
    this._designerToolbarEl = designerToolbar;
    this._buildDesignerToolbar(designerToolbar);
    centerArea.appendChild(designerToolbar);

    // Canvas container with rulers
    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'wbp-canvas-wrapper';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'wbp-canvas';
    canvasWrapper.appendChild(this._canvas);

    // Zoom indicator
    const zoomLabel = document.createElement('div');
    zoomLabel.className = 'wbp-zoom-label';
    zoomLabel.textContent = `Zoom ${Math.round(this._designerZoom * 100)}%`;
    this._zoomLabelEl = zoomLabel;
    canvasWrapper.appendChild(zoomLabel);

    // DPI Scale indicator (bottom-right)
    const dpiLabel = document.createElement('div');
    dpiLabel.className = 'wbp-dpi-label';
    dpiLabel.innerHTML = `DPI Scale ${this._dpiScale.toFixed(1)} <span class="wbp-dpi-gear">${iconHTML(Icons.Settings, 'sm')}</span>`;
    canvasWrapper.appendChild(dpiLabel);

    centerArea.appendChild(canvasWrapper);

    // ── Animation Timeline Panel (collapsible) ──
    const timelineToggle = document.createElement('div');
    timelineToggle.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 8px;background:#1a1a2e;border-top:1px solid #333;border-bottom:1px solid #333;cursor:pointer;font-size:10px;color:#888;user-select:none;';
    timelineToggle.innerHTML = iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted) + ' <span>Animations</span>';
    timelineToggle.addEventListener('click', () => {
      this._animTimelineVisible = !this._animTimelineVisible;
      timelineContainer.style.display = this._animTimelineVisible ? 'flex' : 'none';
      timelineToggle.innerHTML = (this._animTimelineVisible ? iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted) : iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted)) + ' <span>Animations</span>';
    });
    centerArea.appendChild(timelineToggle);

    const timelineContainer = document.createElement('div');
    timelineContainer.style.cssText = 'height:200px;min-height:100px;display:none;flex-shrink:0;';
    centerArea.appendChild(timelineContainer);

    // Create timeline instance (deferred until first show)
    const initTimeline = () => {
      if (!this._animTimeline) {
        this._animTimeline = new WidgetAnimationTimeline(timelineContainer, this._asset, () => {
          this._asset.touch();
          this._setCompileStatus('dirty');
        });
      }
    };
    timelineToggle.addEventListener('click', initTimeline, { once: true });

    wrapper.appendChild(centerArea);

    // ══════════════ RIGHT PANEL: Details ══════════════
    const rightPanel = document.createElement('div');
    rightPanel.className = 'wbp-right-panel';

    const detailsTabRow = document.createElement('div');
    detailsTabRow.className = 'wbp-panel-tabs';
    const detailsTab = document.createElement('button');
    detailsTab.className = 'wbp-panel-tab active';
    detailsTab.innerHTML = iconHTML(Icons.Pencil, 'sm') + ' Details';
    detailsTabRow.appendChild(detailsTab);
    const closeDetailsBtn = document.createElement('button');
    closeDetailsBtn.className = 'wbp-panel-close';
    closeDetailsBtn.innerHTML = iconHTML(Icons.X, 'xs');
    detailsTabRow.appendChild(closeDetailsBtn);
    rightPanel.appendChild(detailsTabRow);

    this._propsEl = document.createElement('div');
    this._propsEl.className = 'wbp-details-content';
    rightPanel.appendChild(this._propsEl);
    wrapper.appendChild(rightPanel);

    this._contentArea.appendChild(wrapper);

    // Initialize canvas
    this._initDesignerCanvas(canvasWrapper);
    this._rebuildHierarchy();
    this._rebuildProperties();
  }

  /** Build the left panel content (palette or library) */
  private _rebuildLeftPanel(container: HTMLElement): void {
    // Rebuild tabs + content
    const tabRow = container.querySelector('.wbp-panel-tabs');
    if (tabRow) {
      const tabs = tabRow.querySelectorAll('.wbp-panel-tab');
      tabs.forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && this._leftPanelTab === 'palette') || (i === 1 && this._leftPanelTab === 'library'));
      });
    }
    const content = container.querySelector('.wbp-panel-content');
    if (content) this._rebuildLeftPanelContent(content as HTMLElement);
  }

  private _rebuildLeftPanelContent(container: HTMLElement): void {
    container.innerHTML = '';
    if (this._leftPanelTab === 'palette') {
      this._buildPalette(container);
    } else {
      const lib = document.createElement('div');
      lib.className = 'wbp-library-placeholder';
      lib.textContent = 'Widget Library — user-created widgets will appear here.';
      container.appendChild(lib);
    }
  }

  /** Build the UE-style widget palette with search */
  private _buildPalette(container: HTMLElement): void {
    // Search box
    const searchBox = document.createElement('div');
    searchBox.className = 'wbp-search-box';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'wbp-search-icon';
    searchIcon.innerHTML = iconHTML(Icons.Search, 'xs');
    const searchInput = document.createElement('input');
    searchInput.className = 'wbp-search-input';
    searchInput.placeholder = 'Search Palette';
    searchInput.value = this._paletteSearch;
    searchInput.addEventListener('input', () => {
      this._paletteSearch = searchInput.value;
      this._rebuildPaletteItems(itemsContainer);
    });
    searchBox.appendChild(searchIcon);
    searchBox.appendChild(searchInput);
    container.appendChild(searchBox);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'wbp-palette-items';
    this._rebuildPaletteItems(itemsContainer);
    container.appendChild(itemsContainer);
  }

  private _rebuildPaletteItems(container: HTMLElement): void {
    container.innerHTML = '';
    const filter = this._paletteSearch.toLowerCase();

    for (const cat of PALETTE) {
      const matchingWidgets = cat.widgets.filter(w =>
        !filter || w.label.toLowerCase().includes(filter) || cat.label.toLowerCase().includes(filter)
      );
      if (matchingWidgets.length === 0 && filter) continue;

      const catEl = document.createElement('div');
      catEl.className = 'wbp-palette-cat';

      const catHeader = document.createElement('div');
      catHeader.className = 'wbp-palette-cat-header';
      const arrow = document.createElement('span');
      arrow.className = 'wbp-palette-arrow';
      arrow.innerHTML = iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted);
      catHeader.appendChild(arrow);
      const catLabel = document.createElement('span');
      catLabel.textContent = cat.label;
      catHeader.appendChild(catLabel);

      let collapsed = matchingWidgets.length === 0;
      const catBody = document.createElement('div');
      catBody.className = 'wbp-palette-cat-body';
      if (collapsed) {
        catBody.style.display = 'none';
        arrow.innerHTML = iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted);
      } else {
        arrow.innerHTML = iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
      }

      catHeader.addEventListener('click', () => {
        collapsed = !collapsed;
        catBody.style.display = collapsed ? 'none' : '';
        arrow.innerHTML = collapsed ? iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted) : iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
      });

      for (const w of matchingWidgets) {
        const item = document.createElement('div');
        item.className = 'wbp-palette-item';
        const icon = document.createElement('span');
        icon.className = 'wbp-palette-item-icon';
        icon.innerHTML = w.icon;
        const label = document.createElement('span');
        label.textContent = w.label;
        item.appendChild(icon);
        item.appendChild(label);

        item.addEventListener('click', () => this._addWidgetToSelected(w.type, w.label));
        catBody.appendChild(item);
      }

      catEl.appendChild(catHeader);
      catEl.appendChild(catBody);
      container.appendChild(catEl);
    }
  }

  /** Build designer toolbar (alignment tools, screen size, etc) */
  private _buildDesignerToolbar(toolbar: HTMLElement): void {
    toolbar.innerHTML = '';

    // ── Snap controls ──
    const snapGroup = document.createElement('div');
    snapGroup.className = 'wbp-dt-group';

    const snapGridBtn = document.createElement('button');
    snapGridBtn.className = `wbp-dt-btn${this._snapToGrid ? ' wbp-dt-btn-active' : ''}`;
    snapGridBtn.innerHTML = iconHTML(Icons.Grid, 'sm');
    snapGridBtn.title = `Snap to grid (${this._snapGridSize}px)`;
    snapGridBtn.addEventListener('click', () => {
      this._snapToGrid = !this._snapToGrid;
      this._buildDesignerToolbar(toolbar);
    });
    snapGroup.appendChild(snapGridBtn);

    const snapEdgeBtn = document.createElement('button');
    snapEdgeBtn.className = `wbp-dt-btn${this._snapToEdges ? ' wbp-dt-btn-active' : ''}`;
    snapEdgeBtn.innerHTML = iconHTML(Icons.Grid2x2, 'sm');
    snapEdgeBtn.title = 'Snap to widget edges';
    snapEdgeBtn.addEventListener('click', () => {
      this._snapToEdges = !this._snapToEdges;
      this._buildDesignerToolbar(toolbar);
    });
    snapGroup.appendChild(snapEdgeBtn);

    // Grid size selector
    if (this._snapToGrid) {
      const gridSizeSel = document.createElement('select');
      gridSizeSel.className = 'wbp-dt-select';
      gridSizeSel.style.width = '52px';
      for (const sz of [4, 8, 16, 32, 64]) {
        const o = document.createElement('option');
        o.value = String(sz);
        o.textContent = `${sz}px`;
        if (sz === this._snapGridSize) o.selected = true;
        gridSizeSel.appendChild(o);
      }
      gridSizeSel.addEventListener('change', () => {
        this._snapGridSize = parseInt(gridSizeSel.value, 10);
      });
      snapGroup.appendChild(gridSizeSel);
    }

    toolbar.appendChild(snapGroup);
    toolbar.appendChild(this._makeDtSep());

    // ── Alignment group ──
    const alignGroup = document.createElement('div');
    alignGroup.className = 'wbp-dt-group';

    const alignActions: Array<{ icon: string; title: string; action: string; rotate?: boolean }> = [
      { icon: iconHTML(Icons.ChevronLeft, 'sm'), title: 'Align left edges', action: 'left' },
      { icon: iconHTML(Icons.Minus, 'sm'), title: 'Center horizontally', action: 'center-h' },
      { icon: iconHTML(Icons.ChevronRight, 'sm'), title: 'Align right edges', action: 'right' },
      { icon: iconHTML(Icons.ChevronLeft, 'sm'), title: 'Align top edges', action: 'top', rotate: true },
      { icon: iconHTML(Icons.Minus, 'sm'), title: 'Center vertically', action: 'center-v' },
      { icon: iconHTML(Icons.ChevronRight, 'sm'), title: 'Align bottom edges', action: 'bottom', rotate: true },
    ];

    for (const a of alignActions) {
      const btn = document.createElement('button');
      btn.className = 'wbp-dt-btn';
      btn.innerHTML = a.icon;
      btn.title = a.title;
      if (a.rotate) btn.style.transform = 'rotate(90deg)';
      btn.addEventListener('click', () => this._alignWidgets(a.action));
      alignGroup.appendChild(btn);
    }

    toolbar.appendChild(alignGroup);
    toolbar.appendChild(this._makeDtSep());

    // ── Distribute group ──
    const distGroup = document.createElement('div');
    distGroup.className = 'wbp-dt-group';
    const distH = document.createElement('button');
    distH.className = 'wbp-dt-btn';
    distH.innerHTML = iconHTML(Icons.GripVertical, 'sm');
    distH.title = 'Distribute horizontal spacing';
    distH.addEventListener('click', () => this._distributeWidgets('horizontal'));
    distGroup.appendChild(distH);
    const distV = document.createElement('button');
    distV.className = 'wbp-dt-btn';
    distV.innerHTML = iconHTML(Icons.GripVertical, 'sm');
    distV.title = 'Distribute vertical spacing';
    distV.style.transform = 'rotate(90deg)';
    distV.addEventListener('click', () => this._distributeWidgets('vertical'));
    distGroup.appendChild(distV);
    toolbar.appendChild(distGroup);
    toolbar.appendChild(this._makeDtSep());

    // ── Screen size selector ──
    const screenGroup = document.createElement('div');
    screenGroup.className = 'wbp-dt-group';

    const screenIcon = document.createElement('span');
    screenIcon.className = 'wbp-dt-screen-icon';
    screenIcon.innerHTML = iconHTML(Icons.Grid, 'sm');
    screenGroup.appendChild(screenIcon);

    const screenSel = document.createElement('select');
    screenSel.className = 'wbp-dt-select';
    for (let i = 0; i < SCREEN_SIZES.length; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = SCREEN_SIZES[i].label;
      if (i === this._screenSizeIdx) o.selected = true;
      screenSel.appendChild(o);
    }
    screenSel.addEventListener('change', () => {
      this._screenSizeIdx = parseInt(screenSel.value, 10);
    });
    screenGroup.appendChild(screenSel);

    toolbar.appendChild(screenGroup);
  }

  // ── Alignment helpers ──

  private _getSelectedIds(): string[] {
    if (this._multiSelection.size > 0) return Array.from(this._multiSelection);
    if (this._selectedWidgetId && this._selectedWidgetId !== this._asset.rootWidgetId) return [this._selectedWidgetId];
    return [];
  }

  private _alignWidgets(action: string): void {
    const ids = this._getSelectedIds();
    if (ids.length < 2) return;

    const rects = ids.map(id => {
      const w = this._asset.getWidget(id);
      const lr = this._layoutEngine.getRect(id);
      return { id, x: lr?.x ?? w!.slot.offsetX, y: lr?.y ?? w!.slot.offsetY, w: lr?.width ?? w!.slot.sizeX, h: lr?.height ?? w!.slot.sizeY };
    });

    switch (action) {
      case 'left': {
        const minX = Math.min(...rects.map(r => r.x));
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetX += minX - r.x; }
        break;
      }
      case 'right': {
        const maxR = Math.max(...rects.map(r => r.x + r.w));
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetX += (maxR - r.w) - r.x; }
        break;
      }
      case 'center-h': {
        const minX = Math.min(...rects.map(r => r.x));
        const maxR = Math.max(...rects.map(r => r.x + r.w));
        const cx = (minX + maxR) / 2;
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetX += (cx - r.w / 2) - r.x; }
        break;
      }
      case 'top': {
        const minY = Math.min(...rects.map(r => r.y));
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetY += minY - r.y; }
        break;
      }
      case 'bottom': {
        const maxB = Math.max(...rects.map(r => r.y + r.h));
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetY += (maxB - r.h) - r.y; }
        break;
      }
      case 'center-v': {
        const minY = Math.min(...rects.map(r => r.y));
        const maxB = Math.max(...rects.map(r => r.y + r.h));
        const cy = (minY + maxB) / 2;
        for (const r of rects) { const w = this._asset.getWidget(r.id)!; w.slot.offsetY += (cy - r.h / 2) - r.y; }
        break;
      }
    }
    this._asset.touch();
    this._layoutEngine.clearCache();
    this._rebuildProperties();
  }

  private _distributeWidgets(axis: 'horizontal' | 'vertical'): void {
    const ids = this._getSelectedIds();
    if (ids.length < 3) return;

    const rects = ids.map(id => {
      const w = this._asset.getWidget(id);
      const lr = this._layoutEngine.getRect(id);
      return { id, x: lr?.x ?? w!.slot.offsetX, y: lr?.y ?? w!.slot.offsetY, w: lr?.width ?? w!.slot.sizeX, h: lr?.height ?? w!.slot.sizeY };
    });

    if (axis === 'horizontal') {
      rects.sort((a, b) => a.x - b.x);
      const totalSpan = rects[rects.length - 1].x + rects[rects.length - 1].w - rects[0].x;
      const totalWidgetW = rects.reduce((s, r) => s + r.w, 0);
      const gap = (totalSpan - totalWidgetW) / (rects.length - 1);
      let cx = rects[0].x;
      for (const r of rects) {
        const w = this._asset.getWidget(r.id)!;
        w.slot.offsetX += cx - r.x;
        cx += r.w + gap;
      }
    } else {
      rects.sort((a, b) => a.y - b.y);
      const totalSpan = rects[rects.length - 1].y + rects[rects.length - 1].h - rects[0].y;
      const totalWidgetH = rects.reduce((s, r) => s + r.h, 0);
      const gap = (totalSpan - totalWidgetH) / (rects.length - 1);
      let cy = rects[0].y;
      for (const r of rects) {
        const w = this._asset.getWidget(r.id)!;
        w.slot.offsetY += cy - r.y;
        cy += r.h + gap;
      }
    }
    this._asset.touch();
    this._layoutEngine.clearCache();
    this._rebuildProperties();
  }

  /** Apply snap-to-grid rounding to a value */
  private _snapValue(v: number): number {
    if (!this._snapToGrid) return Math.round(v);
    return Math.round(v / this._snapGridSize) * this._snapGridSize;
  }

  /** Compute snap-to-edges guide lines for the currently dragged widget.
   *  Returns adjusted position (x, y) snapped to nearby widget edges. */
  private _computeEdgeSnap(dragId: string, rawX: number, rawY: number, dragW: number, dragH: number): { x: number; y: number } {
    if (!this._snapToEdges) return { x: rawX, y: rawY };
    const THRESH = 6; // pixel threshold in widget-space
    this._snapGuideLines = [];
    let bestX = rawX, bestY = rawY;
    let bestDx = THRESH + 1, bestDy = THRESH + 1;

    // Collect all sibling widget rects
    const siblings: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const [id] of this._asset.widgets) {
      if (id === dragId || id === this._asset.rootWidgetId) continue;
      const lr = this._layoutEngine.getRect(id);
      const w = this._asset.getWidget(id);
      if (lr) siblings.push({ x: lr.x, y: lr.y, w: lr.width, h: lr.height });
      else if (w) siblings.push({ x: w.slot.offsetX, y: w.slot.offsetY, w: w.slot.sizeX, h: w.slot.sizeY });
    }

    const dragEdges = {
      left: rawX, right: rawX + dragW, cx: rawX + dragW / 2,
      top: rawY, bottom: rawY + dragH, cy: rawY + dragH / 2,
    };

    for (const sib of siblings) {
      const sibEdges = {
        left: sib.x, right: sib.x + sib.w, cx: sib.x + sib.w / 2,
        top: sib.y, bottom: sib.y + sib.h, cy: sib.y + sib.h / 2,
      };

      // X snaps: left-left, right-right, left-right, right-left, center-center
      const xTests: Array<[number, number, number]> = [
        [dragEdges.left, sibEdges.left, sibEdges.left],
        [dragEdges.right, sibEdges.right, sibEdges.right - dragW],
        [dragEdges.left, sibEdges.right, sibEdges.right],
        [dragEdges.right, sibEdges.left, sibEdges.left - dragW],
        [dragEdges.cx, sibEdges.cx, sibEdges.cx - dragW / 2],
      ];
      for (const [from, to, snapPos] of xTests) {
        const d = Math.abs(from - to);
        if (d < bestDx) {
          bestDx = d;
          bestX = snapPos;
          this._snapGuideLines = this._snapGuideLines.filter(g => g.axis !== 'x');
          this._snapGuideLines.push({ axis: 'x', pos: to });
        }
      }

      // Y snaps
      const yTests: Array<[number, number, number]> = [
        [dragEdges.top, sibEdges.top, sibEdges.top],
        [dragEdges.bottom, sibEdges.bottom, sibEdges.bottom - dragH],
        [dragEdges.top, sibEdges.bottom, sibEdges.bottom],
        [dragEdges.bottom, sibEdges.top, sibEdges.top - dragH],
        [dragEdges.cy, sibEdges.cy, sibEdges.cy - dragH / 2],
      ];
      for (const [from, to, snapPos] of yTests) {
        const d = Math.abs(from - to);
        if (d < bestDy) {
          bestDy = d;
          bestY = snapPos;
          this._snapGuideLines = this._snapGuideLines.filter(g => g.axis !== 'y');
          this._snapGuideLines.push({ axis: 'y', pos: to });
        }
      }
    }

    if (bestDx > THRESH) { bestX = rawX; this._snapGuideLines = this._snapGuideLines.filter(g => g.axis !== 'x'); }
    if (bestDy > THRESH) { bestY = rawY; this._snapGuideLines = this._snapGuideLines.filter(g => g.axis !== 'y'); }
    return { x: bestX, y: bestY };
  }

  /** Finalize marquee selection — select all widgets whose screen rects overlap the marquee. */
  private _finalizeMarqueeSelection(): void {
    const x1 = Math.min(this._marqueeStartX, this._marqueeEndX);
    const y1 = Math.min(this._marqueeStartY, this._marqueeEndY);
    const x2 = Math.max(this._marqueeStartX, this._marqueeEndX);
    const y2 = Math.max(this._marqueeStartY, this._marqueeEndY);

    // Only count as marquee if dragged more than ~4px
    if (x2 - x1 < 4 && y2 - y1 < 4) return;

    for (const [id] of this._asset.widgets) {
      if (id === this._asset.rootWidgetId) continue;
      const lr = this._layoutEngine.getRect(id);
      const w = this._asset.getWidget(id);
      if (!w) continue;
      const wx = lr?.x ?? w.slot.offsetX;
      const wy = lr?.y ?? w.slot.offsetY;
      const ww = lr?.width ?? w.slot.sizeX;
      const wh = lr?.height ?? w.slot.sizeY;

      // Convert to screen coords
      const s = this._widgetToScreen(wx, wy);
      const dpr = window.devicePixelRatio;
      const sw = ww * this._designerZoom * dpr;
      const sh = wh * this._designerZoom * dpr;

      // AABB overlap test
      if (s.x < x2 && s.x + sw > x1 && s.y < y2 && s.y + sh > y1) {
        this._multiSelection.add(id);
      }
    }
    if (this._multiSelection.size > 0) {
      this._selectedWidgetId = Array.from(this._multiSelection)[0];
    }
    this._rebuildHierarchy();
    this._rebuildProperties();
  }

  private _makeDtSep(): HTMLElement {
    const s = document.createElement('div');
    s.className = 'wbp-dt-sep';
    return s;
  }

  // ============================================================
  //  Designer Canvas (WYSIWYG Preview)
  // ============================================================

  private _initDesignerCanvas(container: HTMLElement): void {
    const resize = () => {
      const rect = container.getBoundingClientRect();
      this._canvas.width = rect.width * window.devicePixelRatio;
      this._canvas.height = rect.height * window.devicePixelRatio;
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(container);

    this._ctx = this._canvas.getContext('2d')!;

    // Mouse events
    this._canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this._designerZoom = Math.max(0.1, Math.min(3, this._designerZoom * factor));
      if (this._zoomLabelEl) this._zoomLabelEl.textContent = `Zoom ${Math.round(this._designerZoom * 100)}%`;
      this._saveDesignerState();
    });

    this._canvas.addEventListener('mousedown', (e) => {
      // In play mode, only allow panning (middle-click / alt+click); skip widget drag/select
      if (this._isPlayMode) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
          this._isPanning = true;
          this._panStartX = e.clientX - this._designerPanX;
          this._panStartY = e.clientY - this._designerPanY;
        }
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._isPanning = true;
        this._panStartX = e.clientX - this._designerPanX;
        this._panStartY = e.clientY - this._designerPanY;
        return;
      }

      if (e.button === 0) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * window.devicePixelRatio;
        const my = (e.clientY - rect.top) * window.devicePixelRatio;

        // Check for resize handle first
        const resizeHandle = this._hitTestResizeHandle(mx, my);
        if (resizeHandle && this._selectedWidgetId) {
          this._isResizing = true;
          this._resizeHandle = resizeHandle;
          this._resizeWidgetId = this._selectedWidgetId;
          const widget = this._asset.getWidget(this._selectedWidgetId)!;
          this._resizeStartX = mx;
          this._resizeStartY = my;
          this._resizeStartWidth = widget.slot.sizeX;
          this._resizeStartHeight = widget.slot.sizeY;
          this._resizeStartOffsetX = widget.slot.offsetX;
          this._resizeStartOffsetY = widget.slot.offsetY;
          this._canvas.style.cursor = this._getCursorForHandle(resizeHandle);
          return;
        }

        const hit = this._hitTestCanvas(mx, my);

        if (hit && hit !== this._asset.rootWidgetId) {
          // Shift+click = toggle in multi-selection
          if (e.shiftKey) {
            if (this._multiSelection.has(hit)) {
              this._multiSelection.delete(hit);
            } else {
              this._multiSelection.add(hit);
            }
            this._selectedWidgetId = hit;
          } else {
            // Clear multi-selection unless clicking on an already-selected item in a group
            if (!this._multiSelection.has(hit)) {
              this._multiSelection.clear();
            }
            this._selectedWidgetId = hit;
          }
          this._isDraggingWidget = true;
          this._dragWidgetId = hit;
          const widget = this._asset.getWidget(hit)!;
          const worldPos = this._widgetToScreen(widget.slot.offsetX, widget.slot.offsetY);
          this._dragOffsetX = mx - worldPos.x;
          this._dragOffsetY = my - worldPos.y;
        } else if (!hit || hit === this._asset.rootWidgetId) {
          // Start marquee selection (drag on empty area)
          if (!e.shiftKey) this._multiSelection.clear();
          this._selectedWidgetId = hit ?? null;
          this._isMarqueeSelecting = true;
          this._marqueeStartX = mx;
          this._marqueeStartY = my;
          this._marqueeEndX = mx;
          this._marqueeEndY = my;
        }
        this._rebuildHierarchy();
        this._rebuildProperties();
      }
    });

    this._canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this._designerPanX = e.clientX - this._panStartX;
        this._designerPanY = e.clientY - this._panStartY;
        this._saveDesignerState();
        return;
      }

      const rect = this._canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * window.devicePixelRatio;
      const my = (e.clientY - rect.top) * window.devicePixelRatio;

      // Handle resizing
      if (this._isResizing && this._resizeWidgetId && this._resizeHandle) {
        const widget = this._asset.getWidget(this._resizeWidgetId);
        if (widget) {
          const worldPos = this._screenToWidget(mx, my);
          const startWorld = this._screenToWidget(this._resizeStartX, this._resizeStartY);
          const dx = worldPos.x - startWorld.x;
          const dy = worldPos.y - startWorld.y;

          const handle = this._resizeHandle;
          let newWidth = this._resizeStartWidth;
          let newHeight = this._resizeStartHeight;
          let newOffsetX = this._resizeStartOffsetX;
          let newOffsetY = this._resizeStartOffsetY;

          // Apply resize based on handle
          if (handle.includes('e')) newWidth = Math.max(10, this._resizeStartWidth + dx);
          if (handle.includes('w')) {
            newWidth = Math.max(10, this._resizeStartWidth - dx);
            newOffsetX = this._resizeStartOffsetX + (this._resizeStartWidth - newWidth);
          }
          if (handle.includes('s')) newHeight = Math.max(10, this._resizeStartHeight + dy);
          if (handle.includes('n')) {
            newHeight = Math.max(10, this._resizeStartHeight - dy);
            newOffsetY = this._resizeStartOffsetY + (this._resizeStartHeight - newHeight);
          }

          widget.slot.sizeX = Math.round(newWidth);
          widget.slot.sizeY = Math.round(newHeight);
          widget.slot.offsetX = Math.round(newOffsetX);
          widget.slot.offsetY = Math.round(newOffsetY);
          this._asset.touch();
          this._rebuildProperties();
        }
        return;
      }

      // Handle widget dragging
      if (this._isDraggingWidget && this._dragWidgetId) {
        const worldPos = this._screenToWidget(mx - this._dragOffsetX, my - this._dragOffsetY);
        const widget = this._asset.getWidget(this._dragWidgetId);
        if (widget) {
          let newX = worldPos.x;
          let newY = worldPos.y;

          // Snap to grid
          newX = this._snapValue(newX);
          newY = this._snapValue(newY);

          // Snap to edges of sibling widgets
          if (this._snapToEdges) {
            const snapped = this._computeEdgeSnap(this._dragWidgetId, newX, newY, widget.slot.sizeX, widget.slot.sizeY);
            newX = snapped.x;
            newY = snapped.y;
          } else {
            this._snapGuideLines = [];
          }

          widget.slot.offsetX = Math.round(newX);
          widget.slot.offsetY = Math.round(newY);

          // Move all other multi-selected widgets by same delta
          if (this._multiSelection.size > 1 && this._multiSelection.has(this._dragWidgetId)) {
            const dx = widget.slot.offsetX - (this._resizeStartOffsetX ?? 0);
            const dy = widget.slot.offsetY - (this._resizeStartOffsetY ?? 0);
            // delta is implicit from single-frame movement; use stored start values
          }

          this._asset.touch();
          this._rebuildProperties();
        }
        return;
      }

      // Handle marquee selection
      if (this._isMarqueeSelecting) {
        this._marqueeEndX = mx;
        this._marqueeEndY = my;
        return;
      }

      // Update cursor based on hover
      const resizeHandle = this._hitTestResizeHandle(mx, my);
      if (resizeHandle) {
        this._canvas.style.cursor = this._getCursorForHandle(resizeHandle);
      } else {
        this._canvas.style.cursor = 'default';
      }
    });

    const onMouseUp = () => {
      // Finalize marquee selection
      if (this._isMarqueeSelecting) {
        this._finalizeMarqueeSelection();
        this._isMarqueeSelecting = false;
      }
      this._isPanning = false;
      this._isDraggingWidget = false;
      this._dragWidgetId = null;
      this._isResizing = false;
      this._resizeWidgetId = null;
      this._resizeHandle = null;
      this._snapGuideLines = [];
      this._canvas.style.cursor = 'default';
    };
    this._canvas.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);

    // Context menu for canvas
    this._canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = this._canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * window.devicePixelRatio;
      const my = (e.clientY - rect.top) * window.devicePixelRatio;
      const hit = this._hitTestCanvas(mx, my);
      if (hit) {
        this._selectedWidgetId = hit;
        this._rebuildHierarchy();
        this._rebuildProperties();
        this._showWidgetContextMenu(e.clientX, e.clientY, hit);
      }
    });

    // Start rendering loop
    const render = () => {
      if (this._isPlayMode) this._tickPlayMode();
      this._renderDesigner();
      this._animFrame = requestAnimationFrame(render);
    };
    this._animFrame = requestAnimationFrame(render);
  }

  /** Convert widget-space coords to screen-space */
  private _widgetToScreen(wx: number, wy: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio;
    return {
      x: (wx * this._designerZoom + this._designerPanX) * dpr + this._canvas.width / 2,
      y: (wy * this._designerZoom + this._designerPanY) * dpr + this._canvas.height / 2,
    };
  }

  /** Convert screen-space coords to widget-space */
  private _screenToWidget(sx: number, sy: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio;
    return {
      x: ((sx / dpr - this._canvas.width / (2 * dpr)) - this._designerPanX) / this._designerZoom,
      y: ((sy / dpr - this._canvas.height / (2 * dpr)) - this._designerPanY) / this._designerZoom,
    };
  }

  /** Hit-test a screen-space point against all rendered widgets */
  private _hitTestCanvas(sx: number, sy: number): string | null {
    const worldPos = this._screenToWidget(sx, sy);
    // Walk tree bottom-up (deepest first)
    const hits: string[] = [];
    const testRecursive = (widgetId: string, parentOffX: number, parentOffY: number) => {
      const widget = this._asset.getWidget(widgetId);
      if (!widget) return;
      const x = parentOffX + widget.slot.offsetX;
      const y = parentOffY + widget.slot.offsetY;
      const w = widget.slot.sizeX;
      const h = widget.slot.sizeY;

      if (worldPos.x >= x && worldPos.x <= x + w &&
          worldPos.y >= y && worldPos.y <= y + h) {
        hits.push(widgetId);
      }

      for (const childId of widget.children) {
        testRecursive(childId, x, y);
      }
    };
    testRecursive(this._asset.rootWidgetId, 0, 0);
    return hits.length > 0 ? hits[hits.length - 1] : null;
  }

  /** Check if mouse is over a resize handle of the selected widget */
  private _hitTestResizeHandle(sx: number, sy: number): 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' | null {
    if (!this._selectedWidgetId) return null;

    const widget = this._asset.getWidget(this._selectedWidgetId);
    if (!widget) return null;

    const worldPos = this._screenToWidget(sx, sy);
    const x = widget.slot.offsetX;
    const y = widget.slot.offsetY;
    const w = widget.slot.sizeX;
    const h = widget.slot.sizeY;

    const handleSize = 8 / this._designerZoom; // Handle size in widget space
    const tolerance = handleSize;

    // Check corners first (priority over edges)
    if (Math.abs(worldPos.x - x) < tolerance && Math.abs(worldPos.y - y) < tolerance) return 'nw';
    if (Math.abs(worldPos.x - (x + w)) < tolerance && Math.abs(worldPos.y - y) < tolerance) return 'ne';
    if (Math.abs(worldPos.x - x) < tolerance && Math.abs(worldPos.y - (y + h)) < tolerance) return 'sw';
    if (Math.abs(worldPos.x - (x + w)) < tolerance && Math.abs(worldPos.y - (y + h)) < tolerance) return 'se';

    // Check edges
    if (Math.abs(worldPos.y - y) < tolerance && worldPos.x > x && worldPos.x < x + w) return 'n';
    if (Math.abs(worldPos.y - (y + h)) < tolerance && worldPos.x > x && worldPos.x < x + w) return 's';
    if (Math.abs(worldPos.x - x) < tolerance && worldPos.y > y && worldPos.y < y + h) return 'w';
    if (Math.abs(worldPos.x - (x + w)) < tolerance && worldPos.y > y && worldPos.y < y + h) return 'e';

    return null;
  }

  /** Save designer viewport state */
  private _saveDesignerState(): void {
    this._asset.designerState = {
      zoom: this._designerZoom,
      panX: this._designerPanX,
      panY: this._designerPanY,
    };
  }

  /** Get CSS cursor for a resize handle */
  private _getCursorForHandle(handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w'): string {
    const cursors = {
      'nw': 'nw-resize',
      'ne': 'ne-resize',
      'sw': 'sw-resize',
      'se': 'se-resize',
      'n': 'n-resize',
      's': 's-resize',
      'e': 'e-resize',
      'w': 'w-resize',
    };
    return cursors[handle];
  }

  // ============================================================
  //  Canvas Rendering
  // ============================================================

  private _renderDesigner(): void {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const dpr = window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    // Background — deep dark like UE designer
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, w, h);

    const zoom = this._designerZoom;
    const panX = this._designerPanX * dpr;
    const panY = this._designerPanY * dpr;
    const centerX = w / 2 + panX;
    const centerY = h / 2 + panY;

    // Minor grid (small squares)
    const minorGrid = 10 * zoom * dpr;
    if (minorGrid > 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = centerX % minorGrid;
      const startY = centerY % minorGrid;
      for (let x = startX; x < w; x += minorGrid) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = startY; y < h; y += minorGrid) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }

    // Major grid
    const majorGrid = 50 * zoom * dpr;
    if (majorGrid > 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = centerX % majorGrid;
      const startY = centerY % majorGrid;
      for (let x = startX; x < w; x += majorGrid) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = startY; y < h; y += majorGrid) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }

    // Center axes (origin crosshair)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h);
    ctx.moveTo(0, centerY); ctx.lineTo(w, centerY);
    ctx.stroke();

    // Rulers –– top and left (only if _showRulers)
    if (this._showRulers) {
      this._drawRulers(ctx, w, h, dpr, zoom, centerX, centerY);
    }

    // Draw widget tree — compute layout then render
    const screenSize = SCREEN_SIZES[this._screenSizeIdx];
    const canvasW = screenSize.width || 1920;
    const canvasH = screenSize.height || 1080;
    this._layoutEngine.clearCache();
    this._layoutEngine.computeLayout(this._asset.rootWidgetId, canvasW, canvasH);
    this._renderWidgetNode(ctx, this._asset.rootWidgetId, centerX, centerY, zoom * dpr);

    // ── Play-mode overlays ──
    if (this._isPlayMode) {
      const s = zoom * dpr;

      // Highlight hovered interactive widget
      if (this._playModeHovered) {
        const rr = this._layoutEngine.getRect(this._playModeHovered);
        if (rr) {
          const hx = centerX + rr.x * s;
          const hy = centerY + rr.y * s;
          const hw = rr.width * s;
          const hh = rr.height * s;
          ctx.save();
          ctx.strokeStyle = 'rgba(46,204,113,0.7)';
          ctx.lineWidth = 2;
          ctx.strokeRect(hx, hy, hw, hh);
          ctx.fillStyle = 'rgba(46,204,113,0.06)';
          ctx.fillRect(hx, hy, hw, hh);
          ctx.restore();
        }
      }

      // Flash pressed button
      if (this._playModePressed) {
        const rr = this._layoutEngine.getRect(this._playModePressed);
        if (rr) {
          const px = centerX + rr.x * s;
          const py = centerY + rr.y * s;
          const pw = rr.width * s;
          const ph = rr.height * s;
          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(px, py, pw, ph);
          ctx.restore();
        }
      }

      // Play-mode border pulse
      const elapsed = (performance.now() - this._playModeStartTime) / 1000;
      const pulse = 0.3 + Math.sin(elapsed * 2) * 0.15;
      ctx.save();
      ctx.strokeStyle = `rgba(46,204,113,${pulse})`;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(0, 0, w, h);
      ctx.restore();
    }

    // ── Snap guide lines ──
    if (this._snapGuideLines.length > 0 && this._isDraggingWidget) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,100,100,0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const g of this._snapGuideLines) {
        ctx.beginPath();
        if (g.axis === 'x') {
          const sx = centerX + g.pos * zoom * dpr;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, h);
        } else {
          const sy = centerY + g.pos * zoom * dpr;
          ctx.moveTo(0, sy);
          ctx.lineTo(w, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Multi-selection highlights ──
    if (this._multiSelection.size > 0 && !this._isPlayMode) {
      ctx.save();
      const s = zoom * dpr;
      for (const id of this._multiSelection) {
        if (id === this._selectedWidgetId) continue; // primary selection drawn elsewhere
        const lr = this._layoutEngine.getRect(id);
        const wg = this._asset.getWidget(id);
        if (!wg) continue;
        const rx = centerX + (lr?.x ?? wg.slot.offsetX) * s;
        const ry = centerY + (lr?.y ?? wg.slot.offsetY) * s;
        const rw = (lr?.width ?? wg.slot.sizeX) * s;
        const rh = (lr?.height ?? wg.slot.sizeY) * s;
        ctx.strokeStyle = 'rgba(100,180,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }

    // ── Marquee selection rectangle ──
    if (this._isMarqueeSelecting) {
      ctx.save();
      const mx1 = Math.min(this._marqueeStartX, this._marqueeEndX);
      const my1 = Math.min(this._marqueeStartY, this._marqueeEndY);
      const mw = Math.abs(this._marqueeEndX - this._marqueeStartX);
      const mh = Math.abs(this._marqueeEndY - this._marqueeStartY);
      ctx.fillStyle = 'rgba(100,180,255,0.1)';
      ctx.fillRect(mx1, my1, mw, mh);
      ctx.strokeStyle = 'rgba(100,180,255,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(mx1, my1, mw, mh);
      ctx.restore();
    }

    // ── Snap-to-grid overlay (dot grid) ──
    if (this._snapToGrid && !this._isPlayMode) {
      const gridPx = this._snapGridSize * zoom * dpr;
      if (gridPx > 4) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,0,0.12)';
        const startX = centerX % gridPx;
        const startY = centerY % gridPx;
        for (let gx = startX; gx < w; gx += gridPx) {
          for (let gy = startY; gy < h; gy += gridPx) {
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
        ctx.restore();
      }
    }
  }

  /** Draw UE-style rulers along top and left edges */
  private _drawRulers(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, dpr: number,
    zoom: number, centerX: number, centerY: number,
  ): void {
    const rulerSize = 20 * dpr;

    // Ruler background
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, w, rulerSize); // top
    ctx.fillRect(0, 0, rulerSize, h); // left

    // Corner square
    ctx.fillStyle = '#222238';
    ctx.fillRect(0, 0, rulerSize, rulerSize);

    // Divider line
    ctx.strokeStyle = '#2d2d44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerSize); ctx.lineTo(w, rulerSize);
    ctx.moveTo(rulerSize, 0); ctx.lineTo(rulerSize, h);
    ctx.stroke();

    // Tick marks & labels — top ruler
    ctx.fillStyle = '#888';
    ctx.font = `${9 * dpr}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const step = this._rulerStep(zoom * dpr);
    const minorStep = step / 5;

    // Top ruler ticks
    {
      const origin = centerX;
      const startVal = -Math.ceil((origin - rulerSize) / (step)) * step;
      const endVal = Math.ceil((w - origin) / step) * step;
      for (let v = startVal; v <= endVal; v += minorStep) {
        const x = origin + v;
        if (x < rulerSize || x > w) continue;
        const isMajor = Math.abs(v % step) < 0.01;
        const tickH = isMajor ? rulerSize * 0.6 : rulerSize * 0.25;
        ctx.strokeStyle = isMajor ? '#888' : '#555';
        ctx.beginPath();
        ctx.moveTo(x, rulerSize - tickH);
        ctx.lineTo(x, rulerSize);
        ctx.stroke();
        if (isMajor) {
          ctx.fillText(String(Math.round(v / (zoom * dpr))), x, 2 * dpr);
        }
      }
    }

    // Left ruler ticks
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    {
      const origin = centerY;
      const startVal = -Math.ceil((origin - rulerSize) / step) * step;
      const endVal = Math.ceil((h - origin) / step) * step;
      for (let v = startVal; v <= endVal; v += minorStep) {
        const y = origin + v;
        if (y < rulerSize || y > h) continue;
        const isMajor = Math.abs(v % step) < 0.01;
        const tickW = isMajor ? rulerSize * 0.6 : rulerSize * 0.25;
        ctx.strokeStyle = isMajor ? '#888' : '#555';
        ctx.beginPath();
        ctx.moveTo(rulerSize - tickW, y);
        ctx.lineTo(rulerSize, y);
        ctx.stroke();
        if (isMajor) {
          ctx.save();
          ctx.translate(rulerSize * 0.35, y);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(Math.round(v / (zoom * dpr))), 0, 0);
          ctx.restore();
        }
      }
    }
  }

  /** Choose a nice ruler tick step based on current zoom */
  private _rulerStep(pixelPerUnit: number): number {
    const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    const idealPx = 80; // roughly 80px between major ticks
    for (const t of targets) {
      if (t * pixelPerUnit >= idealPx) return t * pixelPerUnit;
    }
    return 2000 * pixelPerUnit;
  }

  /** Recursively render a widget and its children */
  private _renderWidgetNode(
    ctx: CanvasRenderingContext2D,
    widgetId: string,
    parentX: number,
    parentY: number,
    scale: number,
  ): void {
    const widget = this._asset.getWidget(widgetId);
    if (!widget) return;
    if (widget.visibility === 'Collapsed') return;

    // Use layout engine rects for positioned layout
    const layoutRect = this._layoutEngine.getRect(widgetId);
    let x: number, y: number, w: number, h: number;
    if (layoutRect) {
      // Convert layout engine widget-space coords to screen-space
      x = parentX + layoutRect.x * scale;
      y = parentY + layoutRect.y * scale;
      w = layoutRect.width * scale;
      h = layoutRect.height * scale;
    } else {
      x = parentX + widget.slot.offsetX * scale;
      y = parentY + widget.slot.offsetY * scale;
      w = widget.slot.sizeX * scale;
      h = widget.slot.sizeY * scale;
    }
    const isSelected = widgetId === this._selectedWidgetId;
    const opacity = widget.renderOpacity;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Widget type-specific rendering
    switch (widget.type) {
      case 'CanvasPanel':
        // Draw as a framed area
        ctx.fillStyle = '#16162580';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        // Label
        ctx.fillStyle = '#555';
        ctx.font = `${10 * scale / this._designerZoom / window.devicePixelRatio}px Arial`;
        ctx.fillText(widget.name, x + 4, y + 14);
        break;

      case 'Text':
      case 'RichText': {
        const tp = widget.textProps;
        if (tp) {
          const fontSize = tp.fontSize * scale / this._designerZoom / window.devicePixelRatio;
          // Resolve font: use fontAsset if available, otherwise fontFamily
          let fontFam = tp.fontFamily;
          if (tp.fontAsset) {
            const fontLib = FontLibrary.instance;
            if (fontLib) fontFam = fontLib.resolveFontFamily(tp.fontAsset);
          }
          ctx.fillStyle = tp.color;
          ctx.font = `${tp.isBold ? 'bold ' : ''}${tp.isItalic ? 'italic ' : ''}${fontSize}px ${fontFam}`;
          ctx.textBaseline = 'top';

          // Shadow
          if (tp.shadow?.enabled) {
            ctx.shadowColor = tp.shadow.color || '#000';
            ctx.shadowOffsetX = (tp.shadow.offset?.x || 0) * scale / this._designerZoom / window.devicePixelRatio;
            ctx.shadowOffsetY = (tp.shadow.offset?.y || 0) * scale / this._designerZoom / window.devicePixelRatio;
            ctx.shadowBlur = (tp.shadow.blur || 0) * scale / this._designerZoom / window.devicePixelRatio;
          } else if (tp.shadowColor) {
            ctx.shadowColor = tp.shadowColor;
            ctx.shadowOffsetX = (tp.shadowOffset?.x || 0) * scale / this._designerZoom / window.devicePixelRatio;
            ctx.shadowOffsetY = (tp.shadowOffset?.y || 0) * scale / this._designerZoom / window.devicePixelRatio;
          }

          // Outline (drawn first)
          if (tp.outline?.enabled) {
            ctx.strokeStyle = tp.outline.color || '#000';
            ctx.lineWidth = (tp.outline.width || 2) * 2 * scale / this._designerZoom / window.devicePixelRatio;
            ctx.lineJoin = 'round';
            ctx.strokeText(tp.text, x + 2, y + 2, w);
          }

          // Gradient text fill
          if (tp.gradient?.enabled && tp.gradient.stops?.length >= 2) {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            for (const stop of tp.gradient.stops) {
              grad.addColorStop(stop.position, stop.color);
            }
            ctx.fillStyle = grad;
          }

          ctx.fillText(tp.text, x + 2, y + 2, w);

          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.shadowBlur = 0;
        }
        break;
      }

      case 'Image': {
        const ip = widget.imageProps;
        // Try to render actual texture
        let imageRendered = false;
        if (ip?.imageSource) {
          const img = this._getCachedImage(ip.imageSource);
          if (img && img.complete && img.naturalWidth > 0) {
            // Apply tint via canvas compositing
            if (ip.tintColor && ip.tintColor !== '#ffffff' && ip.tintColor !== '#FFFFFF') {
              ctx.drawImage(img, x, y, w, h);
              ctx.globalCompositeOperation = 'multiply';
              ctx.fillStyle = ip.tintColor;
              ctx.fillRect(x, y, w, h);
              ctx.globalCompositeOperation = 'destination-in';
              ctx.drawImage(img, x, y, w, h);
              ctx.globalCompositeOperation = 'source-over';
            } else {
              ctx.drawImage(img, x, y, w, h);
            }
            imageRendered = true;
          }
        }
        // Gradient background
        if (!imageRendered && ip?.gradient?.enabled && ip.gradient.stops?.length >= 2) {
          const grad = ctx.createLinearGradient(x, y, x + w, y + h);
          for (const stop of ip.gradient.stops) {
            grad.addColorStop(stop.position, stop.color);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, w, h);
          imageRendered = true;
        }
        if (!imageRendered) {
          ctx.fillStyle = ip?.tintColor ?? '#333';
          ctx.fillRect(x, y, w, h);
          // Placeholder icon
          ctx.fillStyle = '#666';
          ctx.font = `${Math.min(w, h) * 0.4}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('IMG', x + w / 2, y + h / 2);
          ctx.textAlign = 'start';
        }
        break;
      }

      case 'Button': {
        const bp = widget.buttonProps;
        const r = (bp?.borderRadius ?? 4) * scale / this._designerZoom / window.devicePixelRatio;
        // Check for texture background
        const texId = bp?.stateTextures?.normal;
        let buttonRendered = false;
        if (texId) {
          const img = this._getCachedImage(texId);
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            this._roundRect(ctx, x, y, w, h, r);
            ctx.clip();
            ctx.drawImage(img, x, y, w, h);
            // Apply tint
            const tint = bp?.stateTints?.normal;
            if (tint && tint !== '#ffffff' && tint !== '#FFFFFF') {
              ctx.globalCompositeOperation = 'multiply';
              ctx.fillStyle = tint;
              ctx.fillRect(x, y, w, h);
              ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
            buttonRendered = true;
          }
        }
        // Gradient background
        if (!buttonRendered && bp?.gradient?.enabled && bp.gradient.stops?.length >= 2) {
          const grad = ctx.createLinearGradient(x, y, x + w, y + h);
          for (const stop of bp.gradient.stops) {
            grad.addColorStop(stop.position, stop.color);
          }
          this._roundRect(ctx, x, y, w, h, r);
          ctx.fillStyle = grad;
          ctx.fill();
          buttonRendered = true;
        }
        if (!buttonRendered) {
          ctx.fillStyle = bp?.normalColor ?? '#2a5db0';
          this._roundRect(ctx, x, y, w, h, r);
          ctx.fill();
        }
        if (bp?.borderWidth) {
          ctx.strokeStyle = bp.borderColor;
          ctx.lineWidth = bp.borderWidth;
          this._roundRect(ctx, x, y, w, h, r);
          ctx.stroke();
        }
        // Render button content if present
        if (bp?.content?.text) {
          let fontFam = 'Arial, sans-serif';
          if (bp.content.text.font) {
            const fontLib = FontLibrary.instance;
            if (fontLib) fontFam = fontLib.resolveFontFamily(bp.content.text.font);
          }
          const fs = (bp.content.text.size || 14) * scale / this._designerZoom / window.devicePixelRatio;
          ctx.font = `${fs}px ${fontFam}`;
          ctx.fillStyle = bp.content.text.color || '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bp.content.text.value || '', x + w / 2, y + h / 2, w);
          ctx.textAlign = 'start';
        }
        break;
      }

      case 'ProgressBar': {
        const pp = widget.progressBarProps;
        // Background - try texture first, then gradient, then solid
        let bgRendered = false;
        if (pp?.backgroundTexture) {
          const bgImg = this._getCachedImage(pp.backgroundTexture);
          if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            ctx.drawImage(bgImg, x, y, w, h);
            bgRendered = true;
          }
        }
        if (!bgRendered) {
          ctx.fillStyle = pp?.backgroundColor ?? '#333';
          ctx.fillRect(x, y, w, h);
        }
        // Fill - try texture, gradient, then solid
        const pct = pp?.percent ?? 0.5;
        const fillW = w * pct;
        let fillRendered = false;
        if (pp?.fillTexture) {
          const fillImg = this._getCachedImage(pp.fillTexture);
          if (fillImg && fillImg.complete && fillImg.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, fillW, h);
            ctx.clip();
            ctx.drawImage(fillImg, x, y, w, h);
            ctx.restore();
            fillRendered = true;
          }
        }
        if (!fillRendered && pp?.fillGradient?.enabled && pp.fillGradient.stops?.length >= 2) {
          const grad = ctx.createLinearGradient(x, y, x + fillW, y);
          for (const stop of pp.fillGradient.stops) {
            grad.addColorStop(stop.position, stop.color);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, fillW, h);
          fillRendered = true;
        }
        if (!fillRendered) {
          ctx.fillStyle = pp?.fillColor ?? '#2a9d8f';
          ctx.fillRect(x, y, fillW, h);
        }
        break;
      }

      case 'Slider': {
        const sp = widget.sliderProps;
        const trackH = Math.max(4, h * 0.3);
        const trackY = y + (h - trackH) / 2;
        ctx.fillStyle = sp?.trackColor ?? '#444';
        ctx.fillRect(x, trackY, w, trackH);
        const val = sp?.value ?? 0.5;
        ctx.fillStyle = sp?.fillColor ?? '#2a9d8f';
        ctx.fillRect(x, trackY, w * val, trackH);
        // Handle
        ctx.fillStyle = sp?.handleColor ?? '#fff';
        const hx = x + w * val;
        ctx.beginPath();
        ctx.arc(hx, y + h / 2, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'TextBox': {
        const tb = widget.textBoxProps;
        ctx.fillStyle = tb?.backgroundColor ?? '#1a1a2e';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = tb?.borderColor ?? '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        const text = tb?.text || tb?.hintText || '';
        ctx.fillStyle = tb?.text ? (tb.color ?? '#fff') : '#666';
        const fs = (tb?.fontSize ?? 14) * scale / this._designerZoom / window.devicePixelRatio;
        ctx.font = `${fs}px Arial`;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 4, y + h / 2, w - 8);
        break;
      }

      case 'CheckBox': {
        const cb = widget.checkBoxProps;
        const sz = (cb?.checkSize ?? 20) * scale / this._designerZoom / window.devicePixelRatio;
        ctx.strokeStyle = cb?.uncheckedColor ?? '#666';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, sz, sz);
        if (cb?.isChecked) {
          ctx.fillStyle = cb.checkedColor ?? '#2a9d8f';
          ctx.fillRect(x + 3, y + 3, sz - 6, sz - 6);
        }
        break;
      }

      case 'Border': {
        const br = widget.borderProps;
        const rad = (br?.borderRadius ?? 4) * scale / this._designerZoom / window.devicePixelRatio;
        // Texture or gradient background
        let borderRendered = false;
        if (br?.backgroundImage) {
          const bgImg = this._getCachedImage(br.backgroundImage);
          if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            ctx.save();
            this._roundRect(ctx, x, y, w, h, rad);
            ctx.clip();
            ctx.drawImage(bgImg, x, y, w, h);
            ctx.restore();
            borderRendered = true;
          }
        }
        if (!borderRendered && br?.gradient?.enabled && br.gradient.stops?.length >= 2) {
          const angle = (br.gradient.angle ?? 0) * Math.PI / 180;
          const cx = x + w / 2, cy = y + h / 2;
          const len = Math.max(w, h);
          const grad = ctx.createLinearGradient(
            cx - Math.cos(angle) * len / 2, cy - Math.sin(angle) * len / 2,
            cx + Math.cos(angle) * len / 2, cy + Math.sin(angle) * len / 2
          );
          for (const stop of br.gradient.stops) {
            grad.addColorStop(stop.position, stop.color);
          }
          this._roundRect(ctx, x, y, w, h, rad);
          ctx.fillStyle = grad;
          ctx.fill();
          borderRendered = true;
        }
        if (!borderRendered) {
          ctx.fillStyle = br?.backgroundColor ?? '#1a1a2e80';
          this._roundRect(ctx, x, y, w, h, rad);
          ctx.fill();
        }
        if (br?.borderWidth) {
          ctx.strokeStyle = br.borderColor ?? '#555';
          ctx.lineWidth = br.borderWidth;
          this._roundRect(ctx, x, y, w, h, rad);
          ctx.stroke();
        }
        break;
      }

      case 'VerticalBox':
        // Vertical box: show stacking direction indicator
        ctx.strokeStyle = '#447a';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#5a5a7a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
        // Direction arrow (vertical)
        ctx.strokeStyle = '#6a6a9a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w - 12, y + 8);
        ctx.lineTo(x + w - 12, y + h - 8);
        ctx.lineTo(x + w - 16, y + h - 14);
        ctx.moveTo(x + w - 12, y + h - 8);
        ctx.lineTo(x + w - 8, y + h - 14);
        ctx.stroke();
        break;

      case 'HorizontalBox':
        // Horizontal box: show stacking direction indicator
        ctx.strokeStyle = '#4a7a44';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#5a7a5a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
        // Direction arrow (horizontal)
        ctx.strokeStyle = '#6a9a6a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + h - 12);
        ctx.lineTo(x + w - 8, y + h - 12);
        ctx.lineTo(x + w - 14, y + h - 16);
        ctx.moveTo(x + w - 8, y + h - 12);
        ctx.lineTo(x + w - 14, y + h - 8);
        ctx.stroke();
        break;

      case 'Overlay':
        // Overlay: stacked layers indicator
        ctx.strokeStyle = '#7a4a7a';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7a5a7a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
        // Layer icon
        ctx.strokeStyle = '#9a6a9a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + w - 22, y + 4, 10, 8);
        ctx.strokeRect(x + w - 19, y + 7, 10, 8);
        break;

      case 'GridPanel':
        // Grid: show grid lines
        ctx.strokeStyle = '#7a7a44';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7a7a5a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
        // Grid lines
        {
          const gp = widget.gridPanelProps;
          const rows = gp?.rows || 2;
          const cols = gp?.columns || 2;
          ctx.strokeStyle = '#7a7a4466';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 2]);
          for (let r = 1; r < rows; r++) {
            const ly = y + (h / rows) * r;
            ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
          }
          for (let c = 1; c < cols; c++) {
            const lx = x + (w / cols) * c;
            ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + h); ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        break;

      case 'ScrollBox':
        // Scroll box: show scrollbar indicator
        ctx.strokeStyle = '#44447a';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#5a5a7a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
        // Scrollbar indicator
        {
          const sbThickness = 6;
          const sbOrient = widget.scrollBoxProps?.orientation ?? 'Vertical';
          ctx.fillStyle = '#ffffff18';
          if (sbOrient === 'Horizontal' || sbOrient === 'Both') {
            ctx.fillRect(x, y + h - sbThickness, w, sbThickness);
            ctx.fillStyle = '#ffffff40';
            ctx.fillRect(x + 4, y + h - sbThickness + 1, w * 0.3, sbThickness - 2);
          }
          if (sbOrient === 'Vertical' || sbOrient === 'Both') {
            ctx.fillStyle = '#ffffff18';
            ctx.fillRect(x + w - sbThickness, y, sbThickness, h);
            ctx.fillStyle = '#ffffff40';
            ctx.fillRect(x + w - sbThickness + 1, y + 4, sbThickness - 2, h * 0.3);
          }
        }
        break;

      case 'SizeBox':
        // Size box: show constraints
        ctx.strokeStyle = '#447a7a';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#5a7a7a';
        ctx.font = '10px Arial';
        {
          const sb = widget.sizeBoxProps;
          const label = sb ? `${widget.name} [${sb.widthOverride || '?'}×${sb.heightOverride || '?'}]` : widget.name;
          ctx.fillText(label, x + 4, y + 12);
        }
        break;

      case 'ScaleBox':
        // Scale box: show stretch mode
        ctx.strokeStyle = '#7a4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7a5a5a';
        ctx.font = '10px Arial';
        {
          const sc = (widget as any).scaleBoxProps;
          const label = sc ? `${widget.name} [${sc.stretch}]` : widget.name;
          ctx.fillText(label, x + 4, y + 12);
        }
        break;

      case 'WrapBox':
        // Wrap box indicator
        ctx.strokeStyle = '#4a7a4a';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#5a7a5a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name + ' (Wrap)', x + 4, y + 12);
        break;

      case 'WidgetSwitcher':
        // Widget switcher indicator
        ctx.strokeStyle = '#7a7a44';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7a7a5a';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name + ' (Switcher)', x + 4, y + 12);
        break;

      case 'NamedSlot':
        // Named slot: dashed border with slot name
        ctx.strokeStyle = '#9a6a0a';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#9a8a5a';
        ctx.font = '10px Arial';
        {
          const ns = widget.namedSlotProps;
          const label = ns?.slotName ? `[Slot: ${ns.slotName}]` : widget.name;
          ctx.fillText(label, x + 4, y + 12);
        }
        break;

      case 'ComboBox': {
        const cb = widget.comboBoxProps;
        ctx.fillStyle = cb?.backgroundColor ?? '#1a1a2e';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        const txt = cb?.options?.[cb.selectedIndex] ?? 'Select...';
        ctx.fillStyle = cb?.color ?? '#fff';
        ctx.font = `${(cb?.fontSize ?? 14) * scale / this._designerZoom / window.devicePixelRatio}px Arial`;
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 6, y + h / 2, w - 24);
        // Dropdown arrow
        ctx.fillText('▾', x + w - 16, y + h / 2);
        break;
      }

      case 'Spacer':
        ctx.strokeStyle = '#3338';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        break;

      case 'CircularThrobber':
        ctx.strokeStyle = '#2a9d8f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, 0, Math.PI * 1.5);
        ctx.stroke();
        break;
    }

    ctx.restore();

    // Selection highlight
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

      // Resize handles (UE-style: corners + edges)
      const hs = 6;
      ctx.fillStyle = '#4a9eff';

      // Corner handles
      const corners = [
        [x - hs / 2, y - hs / 2],                    // nw
        [x + w - hs / 2, y - hs / 2],                // ne
        [x - hs / 2, y + h - hs / 2],                // sw
        [x + w - hs / 2, y + h - hs / 2],            // se
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx, cy, hs, hs);
      }

      // Edge handles (only for larger widgets)
      if (w > 40 && h > 40) {
        const edges = [
          [x + w / 2 - hs / 2, y - hs / 2],          // n
          [x + w / 2 - hs / 2, y + h - hs / 2],      // s
          [x - hs / 2, y + h / 2 - hs / 2],          // w
          [x + w - hs / 2, y + h / 2 - hs / 2],      // e
        ];
        for (const [ex, ey] of edges) {
          ctx.fillRect(ex, ey, hs, hs);
        }
      }

      // ── Anchor Medallion (UE-style 4-arrow crosshair) ──
      // Show anchor position in parent space
      const parentWidget = this._asset.getParent(widgetId);
      if (parentWidget && parentWidget.type === 'CanvasPanel') {
        const parentRect = this._layoutEngine.getRect(parentWidget.id);
        if (parentRect) {
          const anchor = widget.slot.anchor;

          // Compute anchor anchor lines in screen space
          const anchorMinSX = parentX + (parentRect.x + anchor.minX * parentRect.width) * scale;
          const anchorMinSY = parentY + (parentRect.y + anchor.minY * parentRect.height) * scale;
          const anchorMaxSX = parentX + (parentRect.x + anchor.maxX * parentRect.width) * scale;
          const anchorMaxSY = parentY + (parentRect.y + anchor.maxY * parentRect.height) * scale;

          // Anchor point vs stretch
          const isPointAnchorH = anchor.minX === anchor.maxX;
          const isPointAnchorV = anchor.minY === anchor.maxY;

          if (isPointAnchorH && isPointAnchorV) {
            // Point anchor — draw a crosshair medallion
            const acx = anchorMinSX;
            const acy = anchorMinSY;
            const armLen = 14;

            // Draw diamond background
            ctx.fillStyle = 'rgba(255, 180, 0, 0.85)';
            ctx.beginPath();
            ctx.moveTo(acx, acy - armLen);
            ctx.lineTo(acx + armLen, acy);
            ctx.lineTo(acx, acy + armLen);
            ctx.lineTo(acx - armLen, acy);
            ctx.closePath();
            ctx.fill();

            // Draw crosshair lines
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            // Horizontal arrow
            ctx.moveTo(acx - armLen + 3, acy);
            ctx.lineTo(acx + armLen - 3, acy);
            // Vertical arrow
            ctx.moveTo(acx, acy - armLen + 3);
            ctx.lineTo(acx, acy + armLen - 3);
            ctx.stroke();

            // Arrow heads
            const arrSz = 3;
            ctx.fillStyle = '#000';
            // Right arrow
            ctx.beginPath();
            ctx.moveTo(acx + armLen - 3, acy);
            ctx.lineTo(acx + armLen - 3 - arrSz, acy - arrSz);
            ctx.lineTo(acx + armLen - 3 - arrSz, acy + arrSz);
            ctx.fill();
            // Left arrow
            ctx.beginPath();
            ctx.moveTo(acx - armLen + 3, acy);
            ctx.lineTo(acx - armLen + 3 + arrSz, acy - arrSz);
            ctx.lineTo(acx - armLen + 3 + arrSz, acy + arrSz);
            ctx.fill();
            // Down arrow
            ctx.beginPath();
            ctx.moveTo(acx, acy + armLen - 3);
            ctx.lineTo(acx - arrSz, acy + armLen - 3 - arrSz);
            ctx.lineTo(acx + arrSz, acy + armLen - 3 - arrSz);
            ctx.fill();
            // Up arrow
            ctx.beginPath();
            ctx.moveTo(acx, acy - armLen + 3);
            ctx.lineTo(acx - arrSz, acy - armLen + 3 + arrSz);
            ctx.lineTo(acx + arrSz, acy - armLen + 3 + arrSz);
            ctx.fill();
          } else {
            // Stretch anchor — draw the anchor region with lines/handles
            ctx.strokeStyle = 'rgba(255, 180, 0, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);

            if (!isPointAnchorH) {
              // Horizontal stretch lines
              ctx.beginPath();
              ctx.moveTo(anchorMinSX, anchorMinSY);
              ctx.lineTo(anchorMinSX, anchorMaxSY);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(anchorMaxSX, anchorMinSY);
              ctx.lineTo(anchorMaxSX, anchorMaxSY);
              ctx.stroke();
            }
            if (!isPointAnchorV) {
              // Vertical stretch lines
              ctx.beginPath();
              ctx.moveTo(anchorMinSX, anchorMinSY);
              ctx.lineTo(anchorMaxSX, anchorMinSY);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(anchorMinSX, anchorMaxSY);
              ctx.lineTo(anchorMaxSX, anchorMaxSY);
              ctx.stroke();
            }

            ctx.setLineDash([]);

            // Draw anchor handles at corners of anchor region
            const anchorHandleSize = 5;
            ctx.fillStyle = 'rgba(255, 180, 0, 0.9)';
            const anchorCorners = [
              [anchorMinSX, anchorMinSY],
              [anchorMaxSX, anchorMinSY],
              [anchorMinSX, anchorMaxSY],
              [anchorMaxSX, anchorMaxSY],
            ];
            for (const [ahx, ahy] of anchorCorners) {
              ctx.beginPath();
              ctx.arc(ahx, ahy, anchorHandleSize, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Draw dashed line from anchor to widget center
          ctx.strokeStyle = 'rgba(255, 180, 0, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          const anchorCenterX = (anchorMinSX + anchorMaxSX) / 2;
          const anchorCenterY = (anchorMinSY + anchorMaxSY) / 2;
          const widgetCenterX = x + w / 2;
          const widgetCenterY = y + h / 2;
          ctx.beginPath();
          ctx.moveTo(anchorCenterX, anchorCenterY);
          ctx.lineTo(widgetCenterX, widgetCenterY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    }

    // Render children — use the canvas origin for layout-engine positioned children
    const isLayoutContainer = ['VerticalBox', 'HorizontalBox', 'Overlay', 'GridPanel',
      'SizeBox', 'ScaleBox', 'ScrollBox', 'WrapBox', 'NamedSlot', 'WidgetSwitcher',
      'Border', 'Button'].includes(widget.type);
    for (const childId of widget.children) {
      if (isLayoutContainer && this._layoutEngine.getRect(childId)) {
        // Layout engine computes absolute widget-space coords; pass canvas origin
        const dpr = window.devicePixelRatio;
        const originX = this._canvas.width / 2 + this._designerPanX * dpr;
        const originY = this._canvas.height / 2 + this._designerPanY * dpr;
        this._renderWidgetNode(ctx, childId, originX, originY, scale);
      } else {
        this._renderWidgetNode(ctx, childId, x, y, scale);
      }
    }
  }

  /** Draw a rounded rectangle path */
  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Cache for loaded HTMLImageElements keyed by texture asset ID */
  private _imageCache = new Map<string, HTMLImageElement>();

  /** Get or create a cached HTMLImageElement for a texture asset */
  private _getCachedImage(textureId: string): HTMLImageElement | null {
    if (!textureId) return null;
    const existing = this._imageCache.get(textureId);
    if (existing) return existing;
    const texLib = TextureLibrary.instance;
    if (!texLib) return null;
    const asset = texLib.getAsset(textureId);
    if (!asset?.storedData) return null;
    const img = new Image();
    img.src = asset.storedData;
    // No need to manually trigger redraw — the requestAnimationFrame loop
    // continuously calls _renderDesigner() which will pick up the loaded image
    this._imageCache.set(textureId, img);
    return img;
  }

  // ============================================================
  //  Hierarchy Tree
  // ============================================================

  /** Select a widget by ID and rebuild the UI */
  private _selectWidget(widgetId: string | null): void {
    this._selectedWidgetId = widgetId;
    this._rebuildHierarchy();
    this._rebuildProperties();
  }

  private _rebuildHierarchy(): void {
    if (!this._hierarchyEl) return;
    this._hierarchyEl.innerHTML = '';
    this._renderHierarchyNode(this._hierarchyEl, this._asset.rootWidgetId, 0);
  }

  private _renderHierarchyNode(container: HTMLElement, widgetId: string, depth: number): void {
    const widget = this._asset.getWidget(widgetId);
    if (!widget) return;

    const row = document.createElement('div');
    row.className = `wbp-hier-row${widgetId === this._selectedWidgetId ? ' selected' : ''}`;
    row.style.paddingLeft = `${4 + depth * 16}px`;

    // Expand arrow (for containers with children)
    const hasChildren = widget.children.length > 0;
    const arrow = document.createElement('span');
    arrow.className = 'wbp-hier-arrow';
    if (hasChildren) {
      arrow.innerHTML = iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
      arrow.style.cursor = 'pointer';
    } else {
      arrow.textContent = ' ';
    }
    row.appendChild(arrow);

    // Checkbox
    const check = document.createElement('span');
    check.className = 'wbp-hier-check';
    check.innerHTML = iconHTML(Icons.Square, 'sm', ICON_COLORS.muted);
    row.appendChild(check);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'wbp-hier-icon';
    icon.innerHTML = this._getWidgetIcon(widget.type);
    row.appendChild(icon);

    // Name
    const name = document.createElement('span');
    name.className = 'wbp-hier-name';
    name.textContent = widget.name;
    row.appendChild(name);

    // Inheritance badge — show if this widget element is inherited/overridden
    const inhData = (this._asset as any)._inheritance;
    if (inhData) {
      const elemOverrides: any[] = inhData.elementOverrides ?? [];
      const override = elemOverrides.find((o: any) => o.elementId === widgetId);
      if (override) {
        const badgeSpan = document.createElement('span');
        badgeSpan.style.cssText = 'margin-left:4px;';
        badgeSpan.innerHTML = inheritanceBadgeHTML(
          !!override.isInherited,
          !!override.overridden,
          !!override.addedInChild,
        );
        if (badgeSpan.innerHTML) row.appendChild(badgeSpan);
      }
    }

    // Spacer
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    row.appendChild(spacer);

    // Reparent / navigation buttons (UE style)
    const navBtn = document.createElement('span');
    navBtn.className = 'wbp-hier-actions';
    navBtn.innerHTML = iconHTML(Icons.ChevronsUpDown, 'sm') + ' ' + iconHTML(Icons.Settings, 'sm');
    row.appendChild(navBtn);

    // Click to select
    row.addEventListener('click', (e) => {
      if (e.target === arrow) return; // Don't select on arrow click
      this._selectedWidgetId = widgetId;
      this._rebuildHierarchy();
      this._rebuildProperties();
    });

    // Right-click context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedWidgetId = widgetId;
      this._rebuildHierarchy();
      this._rebuildProperties();
      this._showWidgetContextMenu(e.clientX, e.clientY, widgetId);
    });

    // Arrow click to collapse/expand
    let childrenVisible = true;
    const childContainer = document.createElement('div');

    if (hasChildren) {
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        childrenVisible = !childrenVisible;
        childContainer.style.display = childrenVisible ? '' : 'none';
        arrow.innerHTML = childrenVisible ? iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted) : iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted);
      });
    }

    container.appendChild(row);

    // Children
    for (const childId of widget.children) {
      this._renderHierarchyNode(childContainer, childId, depth + 1);
    }
    if (widget.children.length > 0) {
      container.appendChild(childContainer);
    }
  }

  private _getWidgetIcon(type: WidgetType): string {
    const icons: Partial<Record<WidgetType, string>> = {
      CanvasPanel: iconHTML(Icons.Layout, 'sm'), VerticalBox: iconHTML(Icons.Grid2x2, 'sm'), HorizontalBox: iconHTML(Icons.Grid, 'sm'), Overlay: iconHTML(Icons.Layers, 'sm'),
      GridPanel: iconHTML(Icons.Grid2x2, 'sm'), WrapBox: iconHTML(Icons.Grid, 'sm'), ScrollBox: iconHTML(Icons.ChevronsUpDown, 'sm'), SizeBox: iconHTML(Icons.Square, 'sm'), ScaleBox: iconHTML(Icons.Maximize2, 'sm'),
      Border: iconHTML(Icons.BoxSelect, 'sm'), Spacer: iconHTML(Icons.Minus, 'sm'), Text: iconHTML(Icons.Type, 'sm'), RichText: iconHTML(Icons.Type, 'sm'), Image: iconHTML(Icons.Image, 'sm'),
      Button: iconHTML(Icons.MousePointerClick, 'sm'), CheckBox: iconHTML(Icons.ToggleLeft, 'sm'), Slider: iconHTML(Icons.SlidersHorizontal, 'sm'), ProgressBar: iconHTML(Icons.BarChart2, 'sm'),
      TextBox: iconHTML(Icons.TextCursorInput, 'sm'), ComboBox: iconHTML(Icons.ChevronsUpDown, 'sm'), CircularThrobber: iconHTML(Icons.Loader2, 'sm'), WidgetSwitcher: iconHTML(Icons.RefreshCw, 'sm'),
      NamedSlot: iconHTML(Icons.BoxSelect, 'sm'),
    };
    return icons[type] ?? iconHTML(Icons.Box, 'sm');
  }

  // ============================================================
  //  Context Menu
  // ============================================================

  private _showWidgetContextMenu(mx: number, my: number, widgetId: string): void {
    // Remove any existing context menu
    document.querySelectorAll('.widget-ctx-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'widget-ctx-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${mx}px;
      top: ${my}px;
      background: #1e1e3a;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 4px 0;
      z-index: 10000;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      font-size: 12px;
      color: #ddd;
    `;

    const widget = this._asset.getWidget(widgetId);
    if (!widget) return;

    const addItem = (label: string, action: () => void, disabled = false) => {
      const item = document.createElement('div');
      item.style.cssText = `padding:5px 12px;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? '0.4' : '1'};`;
      item.innerHTML = label;
      if (!disabled) {
        item.addEventListener('mouseenter', () => { item.style.background = '#2a5db0'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
          menu.remove();
          action();
        });
      }
      menu.appendChild(item);
    };

    const addSep = () => {
      const sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid #333;margin:4px 0;';
      menu.appendChild(sep);
    };

    // Add child (only for containers)
    if (this._asset.isContainerType(widget.type)) {
      addItem(iconHTML(Icons.PlusCircle, 'sm', ICON_COLORS.blue) + ' Add Child Widget...', () => this._showAddWidgetSubmenu(mx, my, widgetId));
    }

    addSep();
    addItem(iconHTML(Icons.Pencil, 'sm') + ' Rename', () => {
      const name = prompt('New name:', widget.name);
      if (name) {
        widget.name = name.trim();
        this._asset.touch();
        this._rebuildHierarchy();
        this._rebuildProperties();
      }
    });
    addItem(iconHTML(Icons.Copy, 'sm') + ' Duplicate', () => {
      this._asset.duplicateWidget(widgetId);
      this._rebuildHierarchy();
    }, widgetId === this._asset.rootWidgetId);
    addItem(iconHTML(Icons.Trash2, 'sm', ICON_COLORS.error) + ' Delete', () => {
      this._asset.removeWidget(widgetId);
      if (this._selectedWidgetId === widgetId) this._selectedWidgetId = null;
      this._rebuildHierarchy();
      this._rebuildProperties();
    }, widgetId === this._asset.rootWidgetId);

    document.body.appendChild(menu);
    const dismiss = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  private _showAddWidgetSubmenu(mx: number, my: number, parentId: string): void {
    document.querySelectorAll('.widget-ctx-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'widget-ctx-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${mx}px;
      top: ${my}px;
      background: #1e1e3a;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 4px 0;
      z-index: 10000;
      min-width: 180px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      font-size: 12px;
      color: #ddd;
    `;

    for (const cat of PALETTE) {
      const catHeader = document.createElement('div');
      catHeader.style.cssText = 'padding:4px 12px;color:#888;font-size:10px;font-weight:bold;';
      catHeader.textContent = `${cat.icon} ${cat.label}`;
      menu.appendChild(catHeader);

      for (const w of cat.widgets) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:4px 16px;cursor:pointer;';
        item.textContent = `${w.icon} ${w.label}`;
        item.addEventListener('mouseenter', () => { item.style.background = '#2a5db0'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
          menu.remove();
          const added = this._asset.addWidget(w.type, parentId, w.label);
          if (added) {
            this._selectedWidgetId = added.id;
            this._asset.touch();
            this._rebuildHierarchy();
            this._rebuildProperties();
          }
        });
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    const dismiss = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  /** Add a widget to the currently selected container (from palette click) */
  private _addWidgetToSelected(type: WidgetType, label: string): void {
    let parentId = this._selectedWidgetId ?? this._asset.rootWidgetId;
    const parent = this._asset.getWidget(parentId);
    if (!parent || !this._asset.isContainerType(parent.type)) {
      // Try the parent of the selected widget
      if (this._selectedWidgetId) {
        const p = this._asset.getParent(this._selectedWidgetId);
        if (p) parentId = p.id;
        else parentId = this._asset.rootWidgetId;
      } else {
        parentId = this._asset.rootWidgetId;
      }
    }

    const added = this._asset.addWidget(type, parentId, label);
    if (added) {
      this._selectedWidgetId = added.id;
      this._asset.touch();
      this._rebuildHierarchy();
      this._rebuildProperties();
    }
  }

  // ============================================================
  //  Properties Panel
  // ============================================================

  private _rebuildProperties(): void {
    if (!this._propsEl) { console.warn('[WBP] No _propsEl'); return; }
    this._propsEl.innerHTML = '';

    if (!this._selectedWidgetId) {
      const empty = document.createElement('div');
      empty.className = 'wbp-prop-empty';
      empty.textContent = 'Select a widget to edit its properties.';
      this._propsEl.appendChild(empty);
      return;
    }

    const widget = this._asset.getWidget(this._selectedWidgetId);
    if (!widget) {
      console.warn('[WBP] getWidget returned null for id:', this._selectedWidgetId);
      const errEl = document.createElement('div');
      errEl.style.cssText = 'color:#ff5555;font-size:11px;padding:8px;';
      errEl.textContent = `Widget not found: ${this._selectedWidgetId}`;
      this._propsEl.appendChild(errEl);
      return;
    }

    console.log('[WBP] Building props for widget:', widget.name, widget.type);

    try {
    // ── Widget info ──
    this._addPropHeader('Widget');
    this._addPropRow('Name', this._makeTextInput(widget.name, (v) => {
      widget.name = v;
      this._asset.touch();
      this._rebuildHierarchy();
    }));
    this._addPropRow('Type', this._makeLabel(widget.type));
    this._addPropRow('Visibility', this._makeSelect(
      ['Visible', 'Collapsed', 'Hidden', 'HitTestInvisible', 'SelfHitTestInvisible'] as WidgetVisibility[],
      widget.visibility,
      (v) => { widget.visibility = v as WidgetVisibility; this._asset.touch(); },
    ));
    this._addPropRow('Opacity', this._makeNumberInput(widget.renderOpacity, 0, 1, 0.05, (v) => {
      widget.renderOpacity = v;
      this._asset.touch();
    }));
    this._addPropRow('Enabled', this._makeCheckbox(widget.isEnabled, (v) => {
      widget.isEnabled = v;
      this._asset.touch();
    }));

    // ══════════════════════════════════════════════════════
    //  TYPE-SPECIFIC PROPERTIES (shown first, like UE)
    // ══════════════════════════════════════════════════════
    this._buildTypeSpecificProps(widget);

    // ── Events ──
    const supportedEvents = this._getSupportedEvents(widget.type);
    if (supportedEvents.length > 0) {
      this._addPropHeader('Events');
      for (const evt of supportedEvents) {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const label = document.createElement('span');
        label.className = 'prop-label';
        label.textContent = evt.label;

        const btn = document.createElement('button');
        btn.textContent = 'View / Bind';
        btn.className = 'wbp-prop-btn';
        btn.style.cssText = 'flex:1;min-width:0;padding:2px 8px;font-size:11px;background:#2a2a2a;border:1px solid #444;border-radius:3px;color:#ddd;cursor:pointer;';
        btn.addEventListener('click', () => {
          this._switchTab('eventGraph');
          console.log(`[WBP] User wants to bind event: ${evt.label} for widget ${widget.name}`);
        });

        row.appendChild(label);
        row.appendChild(btn);
        this._propsEl.appendChild(row);
      }
    }

    // ══════════════════════════════════════════════════════
    //  LAYOUT (collapsible section)
    // ══════════════════════════════════════════════════════
    this._addCollapsibleSection('Slot', true, (container) => {
      this._addPropRowTo(container, 'Offset X', this._makeNumberInput(widget.slot.offsetX, -9999, 9999, 1, (v) => {
        widget.slot.offsetX = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Offset Y', this._makeNumberInput(widget.slot.offsetY, -9999, 9999, 1, (v) => {
        widget.slot.offsetY = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Size X', this._makeNumberInput(widget.slot.sizeX, 0, 9999, 1, (v) => {
        widget.slot.sizeX = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Size Y', this._makeNumberInput(widget.slot.sizeY, 0, 9999, 1, (v) => {
        widget.slot.sizeY = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Z-Order', this._makeNumberInput(widget.slot.zOrder, -999, 999, 1, (v) => {
        widget.slot.zOrder = v; this._asset.touch();
      }));
    });

    // ── Parent-specific slot properties ──
    const parentWidget = this._asset.getParent(this._selectedWidgetId!);
    if (parentWidget) {
      const parentType = parentWidget.type;

      // Padding (applicable to all container children)
      this._addCollapsibleSection('Padding', true, (container) => {
        this._addPropRowTo(container, 'Left', this._makeNumberInput(widget.slot.padding.left, 0, 999, 1, (v) => {
          widget.slot.padding.left = v; this._asset.touch(); this._layoutEngine.clearCache();
        }));
        this._addPropRowTo(container, 'Top', this._makeNumberInput(widget.slot.padding.top, 0, 999, 1, (v) => {
          widget.slot.padding.top = v; this._asset.touch(); this._layoutEngine.clearCache();
        }));
        this._addPropRowTo(container, 'Right', this._makeNumberInput(widget.slot.padding.right, 0, 999, 1, (v) => {
          widget.slot.padding.right = v; this._asset.touch(); this._layoutEngine.clearCache();
        }));
        this._addPropRowTo(container, 'Bottom', this._makeNumberInput(widget.slot.padding.bottom, 0, 999, 1, (v) => {
          widget.slot.padding.bottom = v; this._asset.touch(); this._layoutEngine.clearCache();
        }));
      });

      if (parentType === 'VerticalBox' || parentType === 'HorizontalBox') {
        this._addCollapsibleSection('Box Slot', true, (container) => {
          this._addPropRowTo(container, 'Size Mode', this._makeSelect(
            ['Auto', 'Fill', 'Custom'] as SizeMode[],
            widget.slot.sizeMode,
            (v) => { widget.slot.sizeMode = v as SizeMode; this._asset.touch(); this._layoutEngine.clearCache(); this._rebuildProperties(); },
          ));
          if (widget.slot.sizeMode === 'Fill') {
            this._addPropRowTo(container, 'Fill Weight', this._makeNumberInput(widget.slot.fillWeight, 0, 10, 0.1, (v) => {
              widget.slot.fillWeight = v; this._asset.touch(); this._layoutEngine.clearCache();
            }));
          }
          this._addPropRowTo(container, 'H Align', this._makeSelect(
            ['Left', 'Center', 'Right', 'Fill'],
            widget.slot.hAlign ?? 'Left',
            (v) => { widget.slot.hAlign = v as any; this._asset.touch(); this._layoutEngine.clearCache(); },
          ));
          this._addPropRowTo(container, 'V Align', this._makeSelect(
            ['Top', 'Center', 'Bottom', 'Fill'],
            widget.slot.vAlign ?? 'Top',
            (v) => { widget.slot.vAlign = v as any; this._asset.touch(); this._layoutEngine.clearCache(); },
          ));
        });
      }

      if (parentType === 'Overlay') {
        this._addCollapsibleSection('Overlay Slot', true, (container) => {
          this._addPropRowTo(container, 'H Align', this._makeSelect(
            ['Left', 'Center', 'Right', 'Fill'],
            widget.slot.hAlign ?? 'Fill',
            (v) => { widget.slot.hAlign = v as any; this._asset.touch(); this._layoutEngine.clearCache(); },
          ));
          this._addPropRowTo(container, 'V Align', this._makeSelect(
            ['Top', 'Center', 'Bottom', 'Fill'],
            widget.slot.vAlign ?? 'Fill',
            (v) => { widget.slot.vAlign = v as any; this._asset.touch(); this._layoutEngine.clearCache(); },
          ));
        });
      }

      if (parentType === 'GridPanel') {
        this._addCollapsibleSection('Grid Slot', true, (container) => {
          this._addPropRowTo(container, 'Row', this._makeNumberInput((widget.slot as any).gridRow ?? 0, 0, 99, 1, (v) => {
            (widget.slot as any).gridRow = v; this._asset.touch(); this._layoutEngine.clearCache();
          }));
          this._addPropRowTo(container, 'Column', this._makeNumberInput((widget.slot as any).gridCol ?? 0, 0, 99, 1, (v) => {
            (widget.slot as any).gridCol = v; this._asset.touch(); this._layoutEngine.clearCache();
          }));
          this._addPropRowTo(container, 'Row Span', this._makeNumberInput((widget.slot as any).gridRowSpan ?? 1, 1, 20, 1, (v) => {
            (widget.slot as any).gridRowSpan = v; this._asset.touch(); this._layoutEngine.clearCache();
          }));
          this._addPropRowTo(container, 'Col Span', this._makeNumberInput((widget.slot as any).gridColSpan ?? 1, 1, 20, 1, (v) => {
            (widget.slot as any).gridColSpan = v; this._asset.touch(); this._layoutEngine.clearCache();
          }));
        });
      }

      if (parentType === 'CanvasPanel') {
        this._addCollapsibleSection('Canvas Slot', true, (container) => {
          this._addPropRowTo(container, 'Alignment X', this._makeNumberInput(widget.slot.alignment.x, 0, 1, 0.1, (v) => {
            widget.slot.alignment.x = v; this._asset.touch();
          }));
          this._addPropRowTo(container, 'Alignment Y', this._makeNumberInput(widget.slot.alignment.y, 0, 1, 0.1, (v) => {
            widget.slot.alignment.y = v; this._asset.touch();
          }));
          this._addPropRowTo(container, 'Auto Size', this._makeCheckbox(widget.slot.autoSize, (v) => {
            widget.slot.autoSize = v; this._asset.touch();
          }));
        });
      }
    }

    // ── Anchor Presets (Visual 9-Point Grid + Stretch Presets) ──
    this._addCollapsibleSection('Anchor', true, (anchorContainer) => {

      // Build visual anchor preset grid
      const anchorGridContainer = document.createElement('div');
      anchorGridContainer.style.cssText = 'display:flex;gap:8px;padding:4px;flex:1;';

      // 9-Point Anchor Grid
      const pointGrid = document.createElement('div');
      pointGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,20px);grid-template-rows:repeat(3,20px);gap:2px;background:#111;border:1px solid #333;border-radius:3px;padding:3px;';

      const pointPresets = [
        { key: 'TopLeft',     row: 0, col: 0 },
        { key: 'TopCenter',   row: 0, col: 1 },
        { key: 'TopRight',    row: 0, col: 2 },
        { key: 'CenterLeft',  row: 1, col: 0 },
        { key: 'Center',      row: 1, col: 1 },
        { key: 'CenterRight', row: 1, col: 2 },
        { key: 'BottomLeft',  row: 2, col: 0 },
        { key: 'BottomCenter',row: 2, col: 1 },
        { key: 'BottomRight', row: 2, col: 2 },
      ];

      const anchorPresetNames = Object.keys(AnchorPresets) as Array<keyof typeof AnchorPresets>;
      const currentPreset = anchorPresetNames.find(name => {
        const p = AnchorPresets[name];
        return p.minX === widget.slot.anchor.minX && p.minY === widget.slot.anchor.minY &&
               p.maxX === widget.slot.anchor.maxX && p.maxY === widget.slot.anchor.maxY;
      }) ?? 'Custom';

      for (const pp of pointPresets) {
        const cell = document.createElement('div');
        const isActive = currentPreset === pp.key;
        cell.style.cssText = `width:20px;height:20px;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;background:${isActive ? '#ffb400' : '#222'};border:1px solid ${isActive ? '#ffb400' : '#444'};transition:background 0.1s;`;
        const dot = document.createElement('div');
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${isActive ? '#000' : '#888'};`;
        cell.appendChild(dot);
        cell.title = pp.key;
        cell.addEventListener('mouseenter', () => { if (!isActive) cell.style.background = '#333'; });
        cell.addEventListener('mouseleave', () => { if (!isActive) cell.style.background = '#222'; });
        cell.addEventListener('click', () => {
          if (pp.key in AnchorPresets) {
            widget.slot.anchor = { ...AnchorPresets[pp.key as keyof typeof AnchorPresets] };
            this._asset.touch();
            this._rebuildProperties();
          }
        });
        pointGrid.appendChild(cell);
      }

      // Stretch presets
      const stretchCol = document.createElement('div');
      stretchCol.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

      const stretchPresets = [
        { key: 'StretchTop',    label: '↔ Top',    icon: '─' },
        { key: 'StretchBottom', label: '↔ Bottom', icon: '─' },
        { key: 'StretchLeft',   label: '↕ Left',   icon: '│' },
        { key: 'StretchRight',  label: '↕ Right',  icon: '│' },
        { key: 'StretchFull',   label: '⬚ Full',   icon: '☐' },
      ];

      for (const sp of stretchPresets) {
        const btn = document.createElement('div');
        const isActive = currentPreset === sp.key;
        btn.style.cssText = `padding:2px 6px;font-size:9px;border-radius:3px;cursor:pointer;text-align:center;background:${isActive ? '#ffb400' : '#222'};color:${isActive ? '#000' : '#aaa'};border:1px solid ${isActive ? '#ffb400' : '#444'};white-space:nowrap;`;
        btn.textContent = sp.label;
        btn.title = sp.key;
        btn.addEventListener('mouseenter', () => { if (!isActive) btn.style.background = '#333'; });
        btn.addEventListener('mouseleave', () => { if (!isActive) btn.style.background = '#222'; });
        btn.addEventListener('click', () => {
          if (sp.key in AnchorPresets) {
            widget.slot.anchor = { ...AnchorPresets[sp.key as keyof typeof AnchorPresets] };
            this._asset.touch();
            this._rebuildProperties();
          }
        });
        stretchCol.appendChild(btn);
      }

      anchorGridContainer.appendChild(pointGrid);
      anchorGridContainer.appendChild(stretchCol);
      anchorContainer.appendChild(anchorGridContainer);

      // Manual anchor values
      this._addPropRowTo(anchorContainer, 'Min X', this._makeNumberInput(widget.slot.anchor.minX, 0, 1, 0.05, (v) => {
        widget.slot.anchor.minX = v; this._asset.touch(); this._layoutEngine.clearCache();
      }));
      this._addPropRowTo(anchorContainer, 'Min Y', this._makeNumberInput(widget.slot.anchor.minY, 0, 1, 0.05, (v) => {
        widget.slot.anchor.minY = v; this._asset.touch(); this._layoutEngine.clearCache();
      }));
      this._addPropRowTo(anchorContainer, 'Max X', this._makeNumberInput(widget.slot.anchor.maxX, 0, 1, 0.05, (v) => {
        widget.slot.anchor.maxX = v; this._asset.touch(); this._layoutEngine.clearCache();
      }));
      this._addPropRowTo(anchorContainer, 'Max Y', this._makeNumberInput(widget.slot.anchor.maxY, 0, 1, 0.05, (v) => {
        widget.slot.anchor.maxY = v; this._asset.touch(); this._layoutEngine.clearCache();
      }));
    });

    // ── Render Transform ──
    this._addCollapsibleSection('Transform', true, (container) => {
      this._addPropRowTo(container, 'Translate X', this._makeNumberInput(widget.renderTranslation.x, -9999, 9999, 1, (v) => {
        widget.renderTranslation.x = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Translate Y', this._makeNumberInput(widget.renderTranslation.y, -9999, 9999, 1, (v) => {
        widget.renderTranslation.y = v; this._asset.touch();
      }));
      this._addPropRowTo(container, 'Angle', this._makeNumberInput(widget.renderAngle, -360, 360, 1, (v) => {
        widget.renderAngle = v; this._asset.touch();
      }));
    });

    } catch (e: any) {
      console.error('[WidgetBlueprintEditor] Error building props:', e);
      const errEl = document.createElement('div');
      errEl.style.cssText = 'color:#ff5555;font-size:11px;padding:8px;white-space:pre-wrap;background:#2a1010;border:1px solid #a33;border-radius:4px;margin:4px;';
      errEl.textContent = `Error: ${e?.message ?? e}\n${e?.stack ?? ''}`;
      this._propsEl?.appendChild(errEl);
    }
  }

  private _getSupportedEvents(type: WidgetType): Array<{ label: string; nodeType: string }> {
    const events: Array<{ label: string; nodeType: string }> = [];
    switch (type) {
      case 'Button':
        events.push({ label: 'On Clicked', nodeType: 'Button OnClicked' });
        events.push({ label: 'On Pressed', nodeType: 'Button OnPressed' });
        events.push({ label: 'On Released', nodeType: 'Button OnReleased' });
        events.push({ label: 'On Hovered', nodeType: 'Button OnHovered' });
        events.push({ label: 'On Unhovered', nodeType: 'Button OnUnhovered' });
        break;
      case 'CheckBox':
        events.push({ label: 'On Check State Changed', nodeType: 'CheckBox OnCheckStateChanged' });
        break;
      case 'Slider':
        events.push({ label: 'On Value Changed', nodeType: 'Slider OnValueChanged' });
        break;
      case 'TextBox':
        events.push({ label: 'On Text Changed', nodeType: 'TextBox OnTextChanged' });
        events.push({ label: 'On Text Committed', nodeType: 'TextBox OnTextCommitted' });
        break;
    }
    return events;
  }

  private _buildTypeSpecificProps(widget: WidgetNodeJSON): void {
    switch (widget.type) {
      case 'Text':
      case 'RichText':
        if (widget.textProps) {
          this._addPropHeader('Text');
          this._addPropRow('Text', this._makeTextInput(widget.textProps.text, (v) => {
            widget.textProps!.text = v;
            this._asset.touch();
          }));
          this._addPropRow('Font Size', this._makeNumberInput(widget.textProps.fontSize, 1, 200, 1, (v) => {
            widget.textProps!.fontSize = v;
            this._asset.touch();
          }));
          this._addPropRow('Color', this._makeColorInput(widget.textProps.color, (v) => {
            widget.textProps!.color = v;
            this._asset.touch();
          }));
          this._addPropRow('Justify', this._makeSelect(
            ['Left', 'Center', 'Right'] as TextJustification[],
            widget.textProps.justification,
            (v) => { widget.textProps!.justification = v as TextJustification; this._asset.touch(); },
          ));
          this._addPropRow('Bold', this._makeCheckbox(widget.textProps.isBold, (v) => {
            widget.textProps!.isBold = v;
            this._asset.touch();
          }));
          this._addPropRow('Italic', this._makeCheckbox(widget.textProps.isItalic, (v) => {
            widget.textProps!.isItalic = v;
            this._asset.touch();
          }));
          this._addPropRow('Auto Wrap', this._makeCheckbox(widget.textProps.autoWrap, (v) => {
            widget.textProps!.autoWrap = v;
            this._asset.touch();
          }));

          // --- Enhanced Text Properties ---
          this._addPropHeader('Font');
          this._addPropRow('Font Asset', this._makeFontPicker(widget.textProps.fontAsset, (id) => {
            widget.textProps!.fontAsset = id;
            this._asset.touch();
          }));
          this._addPropRow('Weight', this._makeSelect(
            ['normal', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            widget.textProps.fontWeight ?? 'normal',
            (v) => { widget.textProps!.fontWeight = v; this._asset.touch(); },
          ));
          this._addPropRow('Letter Sp.', this._makeNumberInput(widget.textProps.letterSpacing ?? 0, -10, 50, 0.5, (v) => {
            widget.textProps!.letterSpacing = v;
            this._asset.touch();
          }));
          this._addPropRow('Line Height', this._makeNumberInput(widget.textProps.lineHeight ?? 1.2, 0.5, 5, 0.1, (v) => {
            widget.textProps!.lineHeight = v;
            this._asset.touch();
          }));

          // Shadow
          this._addPropHeader('Text Shadow');
          const ts = widget.textProps.shadow ?? { enabled: false, color: '#000000', offset: { x: 2, y: 2 }, blur: 2 };
          this._addPropRow('Enable', this._makeCheckbox(ts.enabled, (v) => {
            ts.enabled = v;
            widget.textProps!.shadow = ts;
            this._asset.touch();
            this._selectWidget(this._selectedWidgetId);
          }));
          if (ts.enabled) {
            this._addPropRow('  Color', this._makeColorInput(ts.color, (v) => {
              ts.color = v; widget.textProps!.shadow = ts; this._asset.touch();
            }));
            this._addPropRow('  Offset X', this._makeNumberInput(ts.offset.x, -50, 50, 1, (v) => {
              ts.offset.x = v; widget.textProps!.shadow = ts; this._asset.touch();
            }));
            this._addPropRow('  Offset Y', this._makeNumberInput(ts.offset.y, -50, 50, 1, (v) => {
              ts.offset.y = v; widget.textProps!.shadow = ts; this._asset.touch();
            }));
            this._addPropRow('  Blur', this._makeNumberInput(ts.blur, 0, 50, 1, (v) => {
              ts.blur = v; widget.textProps!.shadow = ts; this._asset.touch();
            }));
          }

          // Outline
          this._addPropHeader('Text Outline');
          const to = widget.textProps.outline ?? { enabled: false, color: '#000000', width: 1 };
          this._addPropRow('Enable', this._makeCheckbox(to.enabled, (v) => {
            to.enabled = v;
            widget.textProps!.outline = to;
            this._asset.touch();
            this._selectWidget(this._selectedWidgetId);
          }));
          if (to.enabled) {
            this._addPropRow('  Color', this._makeColorInput(to.color, (v) => {
              to.color = v; widget.textProps!.outline = to; this._asset.touch();
            }));
            this._addPropRow('  Width', this._makeNumberInput(to.width, 0, 20, 1, (v) => {
              to.width = v; widget.textProps!.outline = to; this._asset.touch();
            }));
          }

          // Gradient
          this._addPropHeader('Text Gradient');
          this._makeGradientEditor(widget.textProps.gradient, (g) => {
            widget.textProps!.gradient = g;
          });

          // Truncation
          this._addPropHeader('Truncation');
          this._addPropRow('Mode', this._makeSelect(
            ['none', 'ellipsis', 'clip'],
            widget.textProps.truncation?.mode ?? 'none',
            (v) => {
              if (!widget.textProps!.truncation) widget.textProps!.truncation = { mode: 'none', maxLines: 1, ellipsis: '...' };
              widget.textProps!.truncation.mode = v as any;
              this._asset.touch();
            },
          ));
          this._addPropRow('Max Lines', this._makeNumberInput(widget.textProps.truncation?.maxLines ?? 1, 1, 100, 1, (v) => {
            if (!widget.textProps!.truncation) widget.textProps!.truncation = { mode: 'ellipsis', maxLines: 1, ellipsis: '...' };
            widget.textProps!.truncation.maxLines = v;
            this._asset.touch();
          }));
        }
        break;

      case 'Image':
        if (widget.imageProps) {
          this._addPropHeader('Image');
          this._addPropRow('Texture', this._makeTexturePicker(widget.imageProps.imageSource, (id) => {
            widget.imageProps!.imageSource = id ?? '';
            this._imageCache.delete(id ?? '');
            this._asset.touch();
          }));
          this._addPropRow('Tint', this._makeColorInput(widget.imageProps.tintColor, (v) => {
            widget.imageProps!.tintColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Tint Mode', this._makeSelect(
            ['multiply', 'overlay', 'colorize', 'screen', 'add'],
            widget.imageProps.tintMode ?? 'multiply',
            (v) => { widget.imageProps!.tintMode = v as any; this._asset.touch(); },
          ));
          this._addPropRow('Tint Strength', this._makeNumberInput(widget.imageProps.tintStrength ?? 1, 0, 1, 0.01, (v) => {
            widget.imageProps!.tintStrength = v;
            this._asset.touch();
          }));
          this._addPropRow('Stretch', this._makeSelect(
            ['None', 'Fill', 'ScaleToFit', 'ScaleToFill'],
            widget.imageProps.stretch,
            (v) => { widget.imageProps!.stretch = v as any; this._asset.touch(); },
          ));
          this._addPropRow('Flip X', this._makeCheckbox(widget.imageProps.flipX ?? false, (v) => {
            widget.imageProps!.flipX = v;
            this._asset.touch();
          }));
          this._addPropRow('Flip Y', this._makeCheckbox(widget.imageProps.flipY ?? false, (v) => {
            widget.imageProps!.flipY = v;
            this._asset.touch();
          }));
          this._addPropRow('Rotation', this._makeNumberInput(widget.imageProps.rotation ?? 0, 0, 360, 1, (v) => {
            widget.imageProps!.rotation = v;
            this._asset.touch();
          }));

          // 9-Slice
          this._addPropHeader('9-Slice');
          this._makeNineSliceEditor(widget.imageProps.nineSlice, (s) => {
            widget.imageProps!.nineSlice = s;
          });

          // UV Rect (sprite sheet region)
          this._addPropHeader('UV Rect');
          const uv = widget.imageProps.uvRect ?? { x: 0, y: 0, width: 1, height: 1 };
          this._addPropRow('U', this._makeNumberInput(uv.x, 0, 1, 0.01, (v) => {
            if (!widget.imageProps!.uvRect) widget.imageProps!.uvRect = { x: 0, y: 0, width: 1, height: 1 };
            widget.imageProps!.uvRect.x = v;
            this._asset.touch();
          }));
          this._addPropRow('V', this._makeNumberInput(uv.y, 0, 1, 0.01, (v) => {
            if (!widget.imageProps!.uvRect) widget.imageProps!.uvRect = { x: 0, y: 0, width: 1, height: 1 };
            widget.imageProps!.uvRect.y = v;
            this._asset.touch();
          }));
          this._addPropRow('UV W', this._makeNumberInput(uv.width, 0, 1, 0.01, (v) => {
            if (!widget.imageProps!.uvRect) widget.imageProps!.uvRect = { x: 0, y: 0, width: 1, height: 1 };
            widget.imageProps!.uvRect.width = v;
            this._asset.touch();
          }));
          this._addPropRow('UV H', this._makeNumberInput(uv.height, 0, 1, 0.01, (v) => {
            if (!widget.imageProps!.uvRect) widget.imageProps!.uvRect = { x: 0, y: 0, width: 1, height: 1 };
            widget.imageProps!.uvRect.height = v;
            this._asset.touch();
          }));

          // Gradient overlay
          this._addPropHeader('Gradient Overlay');
          this._makeGradientEditor(widget.imageProps.gradient, (g) => {
            widget.imageProps!.gradient = g;
          });

          // Effects
          this._addPropHeader('Effects');
          this._makeEffectsEditor(widget.imageProps.effects, (e) => {
            widget.imageProps!.effects = e;
          });
        }
        break;

      case 'Button':
        if (widget.buttonProps) {
          this._addPropHeader('Button Colors');
          this._addPropRow('Normal', this._makeColorInput(widget.buttonProps.normalColor, (v) => {
            widget.buttonProps!.normalColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Hovered', this._makeColorInput(widget.buttonProps.hoveredColor, (v) => {
            widget.buttonProps!.hoveredColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Pressed', this._makeColorInput(widget.buttonProps.pressedColor, (v) => {
            widget.buttonProps!.pressedColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Disabled', this._makeColorInput(widget.buttonProps.disabledColor, (v) => {
            widget.buttonProps!.disabledColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Radius', this._makeNumberInput(widget.buttonProps.borderRadius, 0, 100, 1, (v) => {
            widget.buttonProps!.borderRadius = v;
            this._asset.touch();
          }));
          this._addPropRow('Border', this._makeNumberInput(widget.buttonProps.borderWidth, 0, 20, 1, (v) => {
            widget.buttonProps!.borderWidth = v;
            this._asset.touch();
          }));
          this._addPropRow('Border Color', this._makeColorInput(widget.buttonProps.borderColor, (v) => {
            widget.buttonProps!.borderColor = v;
            this._asset.touch();
          }));

          // --- State Textures ---
          this._addPropHeader('State Textures');
          const st = widget.buttonProps.stateTextures ?? {};
          this._addPropRow('Normal Tex', this._makeTexturePicker(st.normal, (id) => {
            if (!widget.buttonProps!.stateTextures) widget.buttonProps!.stateTextures = {};
            widget.buttonProps!.stateTextures.normal = id;
            this._asset.touch();
          }));
          this._addPropRow('Hover Tex', this._makeTexturePicker(st.hovered, (id) => {
            if (!widget.buttonProps!.stateTextures) widget.buttonProps!.stateTextures = {};
            widget.buttonProps!.stateTextures.hovered = id;
            this._asset.touch();
          }));
          this._addPropRow('Press Tex', this._makeTexturePicker(st.pressed, (id) => {
            if (!widget.buttonProps!.stateTextures) widget.buttonProps!.stateTextures = {};
            widget.buttonProps!.stateTextures.pressed = id;
            this._asset.touch();
          }));
          this._addPropRow('Disabled Tex', this._makeTexturePicker(st.disabled, (id) => {
            if (!widget.buttonProps!.stateTextures) widget.buttonProps!.stateTextures = {};
            widget.buttonProps!.stateTextures.disabled = id;
            this._asset.touch();
          }));

          // --- State Tints ---
          this._addPropHeader('State Tints');
          const sTints = widget.buttonProps.stateTints ?? {};
          this._addPropRow('Normal Tint', this._makeColorInput(sTints.normal ?? '#ffffff', (v) => {
            if (!widget.buttonProps!.stateTints) widget.buttonProps!.stateTints = {};
            widget.buttonProps!.stateTints.normal = v;
            this._asset.touch();
          }));
          this._addPropRow('Hover Tint', this._makeColorInput(sTints.hovered ?? '#ffffff', (v) => {
            if (!widget.buttonProps!.stateTints) widget.buttonProps!.stateTints = {};
            widget.buttonProps!.stateTints.hovered = v;
            this._asset.touch();
          }));
          this._addPropRow('Press Tint', this._makeColorInput(sTints.pressed ?? '#ffffff', (v) => {
            if (!widget.buttonProps!.stateTints) widget.buttonProps!.stateTints = {};
            widget.buttonProps!.stateTints.pressed = v;
            this._asset.touch();
          }));
          this._addPropRow('Disabled Tint', this._makeColorInput(sTints.disabled ?? '#ffffff', (v) => {
            if (!widget.buttonProps!.stateTints) widget.buttonProps!.stateTints = {};
            widget.buttonProps!.stateTints.disabled = v;
            this._asset.touch();
          }));

          // --- Content ---
          this._addPropHeader('Button Content');
          const content = widget.buttonProps.content ?? { type: 'text' as const };
          this._addPropRow('Type', this._makeSelect(
            ['text', 'image', 'composite'],
            content.type ?? 'text',
            (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
              widget.buttonProps!.content.type = v as any;
              this._asset.touch();
              this._selectWidget(this._selectedWidgetId);
            },
          ));
          if (content.type === 'text' || content.type === 'composite') {
            const ct = content.text ?? { value: '', font: '', size: 14, color: '#ffffff' };
            this._addPropRow('Text', this._makeTextInput(ct.value ?? '', (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
              if (!widget.buttonProps!.content.text) widget.buttonProps!.content.text = { value: '', font: '', size: 14, color: '#fff' };
              widget.buttonProps!.content.text.value = v;
              this._asset.touch();
            }));
            this._addPropRow('Text Size', this._makeNumberInput(ct.size ?? 14, 1, 200, 1, (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
              if (!widget.buttonProps!.content.text) widget.buttonProps!.content.text = { value: '', font: '', size: 14, color: '#fff' };
              widget.buttonProps!.content.text.size = v;
              this._asset.touch();
            }));
            this._addPropRow('Text Color', this._makeColorInput(ct.color ?? '#ffffff', (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
              if (!widget.buttonProps!.content.text) widget.buttonProps!.content.text = { value: '', font: '', size: 14, color: '#fff' };
              widget.buttonProps!.content.text.color = v;
              this._asset.touch();
            }));
            this._addPropRow('Text Font', this._makeFontPicker(ct.font, (id) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
              if (!widget.buttonProps!.content.text) widget.buttonProps!.content.text = { value: '', font: '', size: 14, color: '#fff' };
              widget.buttonProps!.content.text.font = id ?? '';
              this._asset.touch();
            }));
          }

          // Icon (for image / composite content)
          if (content.type === 'image' || content.type === 'composite') {
            this._addPropHeader('Icon');
            const icon = content.icon ?? { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left' as const, padding: 8 };
            this._addPropRow('Texture', this._makeTexturePicker(icon.texture, (id) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
              if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
              widget.buttonProps!.content.icon.texture = id ?? '';
              this._asset.touch();
            }));
            this._addPropRow('Icon W', this._makeNumberInput(icon.size?.width ?? 24, 1, 512, 1, (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
              if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
              widget.buttonProps!.content.icon.size.width = v;
              this._asset.touch();
            }));
            this._addPropRow('Icon H', this._makeNumberInput(icon.size?.height ?? 24, 1, 512, 1, (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
              if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
              widget.buttonProps!.content.icon.size.height = v;
              this._asset.touch();
            }));
            this._addPropRow('Icon Tint', this._makeColorInput(icon.tint ?? '#ffffff', (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
              if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
              widget.buttonProps!.content.icon.tint = v;
              this._asset.touch();
            }));
            this._addPropRow('Position', this._makeSelect(
              ['left', 'right', 'top', 'bottom'],
              icon.position ?? 'left',
              (v) => {
                if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
                if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
                widget.buttonProps!.content.icon.position = v as any;
                this._asset.touch();
                this._selectWidget(this._selectedWidgetId);
              },
            ));
            this._addPropRow('Icon Gap', this._makeNumberInput(icon.padding ?? 8, 0, 100, 1, (v) => {
              if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'image' };
              if (!widget.buttonProps!.content.icon) widget.buttonProps!.content.icon = { texture: '', size: { width: 24, height: 24 }, tint: '#ffffff', position: 'left', padding: 8 };
              widget.buttonProps!.content.icon.padding = v;
              this._asset.touch();
            }));
          }

          // Content padding
          this._addPropHeader('Content Padding');
          const cPad = content.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
          this._addPropRow('Top', this._makeNumberInput(cPad.top ?? 0, 0, 200, 1, (v) => {
            if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
            if (!widget.buttonProps!.content.padding) widget.buttonProps!.content.padding = { top: 0, right: 0, bottom: 0, left: 0 };
            widget.buttonProps!.content.padding.top = v;
            this._asset.touch();
          }));
          this._addPropRow('Right', this._makeNumberInput(cPad.right ?? 0, 0, 200, 1, (v) => {
            if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
            if (!widget.buttonProps!.content.padding) widget.buttonProps!.content.padding = { top: 0, right: 0, bottom: 0, left: 0 };
            widget.buttonProps!.content.padding.right = v;
            this._asset.touch();
          }));
          this._addPropRow('Bottom', this._makeNumberInput(cPad.bottom ?? 0, 0, 200, 1, (v) => {
            if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
            if (!widget.buttonProps!.content.padding) widget.buttonProps!.content.padding = { top: 0, right: 0, bottom: 0, left: 0 };
            widget.buttonProps!.content.padding.bottom = v;
            this._asset.touch();
          }));
          this._addPropRow('Left', this._makeNumberInput(cPad.left ?? 0, 0, 200, 1, (v) => {
            if (!widget.buttonProps!.content) widget.buttonProps!.content = { type: 'text' };
            if (!widget.buttonProps!.content.padding) widget.buttonProps!.content.padding = { top: 0, right: 0, bottom: 0, left: 0 };
            widget.buttonProps!.content.padding.left = v;
            this._asset.touch();
          }));

          // Animations
          this._addPropHeader('Animations');
          const anims = widget.buttonProps.animations ?? {};
          this._addPropRow('Hover In ms', this._makeNumberInput(anims.hoverIn?.duration ?? 150, 0, 5000, 10, (v) => {
            if (!widget.buttonProps!.animations) widget.buttonProps!.animations = {};
            if (!widget.buttonProps!.animations.hoverIn) widget.buttonProps!.animations.hoverIn = { duration: 150, easing: 'ease' };
            widget.buttonProps!.animations.hoverIn.duration = v;
            this._asset.touch();
          }));
          this._addPropRow('Hover Out ms', this._makeNumberInput(anims.hoverOut?.duration ?? 150, 0, 5000, 10, (v) => {
            if (!widget.buttonProps!.animations) widget.buttonProps!.animations = {};
            if (!widget.buttonProps!.animations.hoverOut) widget.buttonProps!.animations.hoverOut = { duration: 150, easing: 'ease' };
            widget.buttonProps!.animations.hoverOut.duration = v;
            this._asset.touch();
          }));
          this._addPropRow('Press ms', this._makeNumberInput(anims.press?.duration ?? 50, 0, 5000, 10, (v) => {
            if (!widget.buttonProps!.animations) widget.buttonProps!.animations = {};
            if (!widget.buttonProps!.animations.press) widget.buttonProps!.animations.press = { duration: 50 };
            widget.buttonProps!.animations.press.duration = v;
            this._asset.touch();
          }));
          this._addPropRow('Release ms', this._makeNumberInput(anims.release?.duration ?? 100, 0, 5000, 10, (v) => {
            if (!widget.buttonProps!.animations) widget.buttonProps!.animations = {};
            if (!widget.buttonProps!.animations.release) widget.buttonProps!.animations.release = { duration: 100 };
            widget.buttonProps!.animations.release.duration = v;
            this._asset.touch();
          }));

          // State Scales
          this._addPropHeader('State Scales');
          const scales = widget.buttonProps.stateScales ?? {};
          this._addPropRow('Normal', this._makeNumberInput(scales.normal ?? 1, 0.1, 3, 0.01, (v) => {
            if (!widget.buttonProps!.stateScales) widget.buttonProps!.stateScales = {};
            widget.buttonProps!.stateScales.normal = v;
            this._asset.touch();
          }));
          this._addPropRow('Hovered', this._makeNumberInput(scales.hovered ?? 1, 0.1, 3, 0.01, (v) => {
            if (!widget.buttonProps!.stateScales) widget.buttonProps!.stateScales = {};
            widget.buttonProps!.stateScales.hovered = v;
            this._asset.touch();
          }));
          this._addPropRow('Pressed', this._makeNumberInput(scales.pressed ?? 1, 0.1, 3, 0.01, (v) => {
            if (!widget.buttonProps!.stateScales) widget.buttonProps!.stateScales = {};
            widget.buttonProps!.stateScales.pressed = v;
            this._asset.touch();
          }));
          this._addPropRow('Disabled', this._makeNumberInput(scales.disabled ?? 1, 0.1, 3, 0.01, (v) => {
            if (!widget.buttonProps!.stateScales) widget.buttonProps!.stateScales = {};
            widget.buttonProps!.stateScales.disabled = v;
            this._asset.touch();
          }));

          // 9-Slice
          this._addPropHeader('9-Slice');
          this._makeNineSliceEditor(widget.buttonProps.nineSlice, (s) => {
            widget.buttonProps!.nineSlice = s;
          });

          // Gradient
          this._addPropHeader('Button Gradient');
          this._makeGradientEditor(widget.buttonProps.gradient, (g) => {
            widget.buttonProps!.gradient = g;
          });
        }
        break;

      case 'ProgressBar':
        if (widget.progressBarProps) {
          this._addPropHeader('Progress Bar');
          this._addPropRow('Percent', this._makeNumberInput(widget.progressBarProps.percent, 0, 1, 0.01, (v) => {
            widget.progressBarProps!.percent = v;
            this._asset.touch();
          }));
          this._addPropRow('Fill Color', this._makeColorInput(widget.progressBarProps.fillColor, (v) => {
            widget.progressBarProps!.fillColor = v;
            this._asset.touch();
          }));
          this._addPropRow('BG Color', this._makeColorInput(widget.progressBarProps.backgroundColor, (v) => {
            widget.progressBarProps!.backgroundColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Direction', this._makeSelect(
            ['LeftToRight', 'RightToLeft', 'TopToBottom', 'BottomToTop'],
            widget.progressBarProps.fillDirection,
            (v) => { widget.progressBarProps!.fillDirection = v as any; this._asset.touch(); },
          ));
          this._addPropRow('Radius', this._makeNumberInput(widget.progressBarProps.borderRadius ?? 0, 0, 100, 1, (v) => {
            widget.progressBarProps!.borderRadius = v;
            this._asset.touch();
          }));

          // --- Texture slots ---
          this._addPropHeader('Textures');
          this._addPropRow('BG Texture', this._makeTexturePicker(widget.progressBarProps.backgroundTexture, (id) => {
            widget.progressBarProps!.backgroundTexture = id;
            this._asset.touch();
          }));
          this._addPropRow('Fill Texture', this._makeTexturePicker(widget.progressBarProps.fillTexture, (id) => {
            widget.progressBarProps!.fillTexture = id;
            this._asset.touch();
          }));

          // Fill gradient
          this._addPropHeader('Fill Gradient');
          this._makeGradientEditor(widget.progressBarProps.fillGradient, (g) => {
            widget.progressBarProps!.fillGradient = g;
          });

          // 9-Slice for background
          this._addPropHeader('BG 9-Slice');
          this._makeNineSliceEditor(widget.progressBarProps.backgroundNineSlice, (s) => {
            widget.progressBarProps!.backgroundNineSlice = s;
          });

          // 9-Slice for fill
          this._addPropHeader('Fill 9-Slice');
          this._makeNineSliceEditor(widget.progressBarProps.fillNineSlice, (s) => {
            widget.progressBarProps!.fillNineSlice = s;
          });
        }
        break;

      case 'Slider':
        if (widget.sliderProps) {
          this._addPropHeader('Slider');
          this._addPropRow('Value', this._makeNumberInput(widget.sliderProps.value, 0, 1, 0.01, (v) => {
            widget.sliderProps!.value = v;
            this._asset.touch();
          }));
          this._addPropRow('Min', this._makeNumberInput(widget.sliderProps.minValue, -9999, 9999, 0.1, (v) => {
            widget.sliderProps!.minValue = v;
            this._asset.touch();
          }));
          this._addPropRow('Max', this._makeNumberInput(widget.sliderProps.maxValue, -9999, 9999, 0.1, (v) => {
            widget.sliderProps!.maxValue = v;
            this._asset.touch();
          }));
          this._addPropRow('Track', this._makeColorInput(widget.sliderProps.trackColor, (v) => {
            widget.sliderProps!.trackColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Fill', this._makeColorInput(widget.sliderProps.fillColor, (v) => {
            widget.sliderProps!.fillColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Handle', this._makeColorInput(widget.sliderProps.handleColor, (v) => {
            widget.sliderProps!.handleColor = v;
            this._asset.touch();
          }));

          // --- Slider Images ---
          this._addPropHeader('Slider Images');
          this._addPropRow('Track Image', this._makeTexturePicker(widget.sliderProps.trackTexture, (id) => {
            widget.sliderProps!.trackTexture = id;
            this._asset.touch();
          }));
          this._addPropRow('Fill Image', this._makeTexturePicker(widget.sliderProps.fillTexture, (id) => {
            widget.sliderProps!.fillTexture = id;
            this._asset.touch();
          }));
          this._addPropRow('Handle Image', this._makeTexturePicker(widget.sliderProps.handleTexture, (id) => {
            widget.sliderProps!.handleTexture = id;
            this._asset.touch();
          }));

          // --- Handle Size ---
          this._addPropHeader('Handle Size');
          const hSize = widget.sliderProps.handleSize ?? { width: 24, height: 24 };
          this._addPropRow('Width', this._makeNumberInput(hSize.width, 1, 200, 1, (v) => {
            if (!widget.sliderProps!.handleSize) widget.sliderProps!.handleSize = { width: 24, height: 24 };
            widget.sliderProps!.handleSize.width = v;
            this._asset.touch();
          }));
          this._addPropRow('Height', this._makeNumberInput(hSize.height, 1, 200, 1, (v) => {
            if (!widget.sliderProps!.handleSize) widget.sliderProps!.handleSize = { width: 24, height: 24 };
            widget.sliderProps!.handleSize.height = v;
            this._asset.touch();
          }));

          // --- 9-Slice ---
          this._addPropHeader('Track 9-Slice');
          this._makeNineSliceEditor(widget.sliderProps.trackNineSlice, (s) => {
            widget.sliderProps!.trackNineSlice = s;
          });
          this._addPropHeader('Fill 9-Slice');
          this._makeNineSliceEditor(widget.sliderProps.fillNineSlice, (s) => {
            widget.sliderProps!.fillNineSlice = s;
          });
        }
        break;

      case 'TextBox':
        if (widget.textBoxProps) {
          this._addPropHeader('Text Box');
          this._addPropRow('Text', this._makeTextInput(widget.textBoxProps.text, (v) => {
            widget.textBoxProps!.text = v;
            this._asset.touch();
          }));
          this._addPropRow('Hint', this._makeTextInput(widget.textBoxProps.hintText, (v) => {
            widget.textBoxProps!.hintText = v;
            this._asset.touch();
          }));
          this._addPropRow('Font Size', this._makeNumberInput(widget.textBoxProps.fontSize, 1, 200, 1, (v) => {
            widget.textBoxProps!.fontSize = v;
            this._asset.touch();
          }));
          this._addPropRow('Color', this._makeColorInput(widget.textBoxProps.color, (v) => {
            widget.textBoxProps!.color = v;
            this._asset.touch();
          }));
          this._addPropRow('BG', this._makeColorInput(widget.textBoxProps.backgroundColor, (v) => {
            widget.textBoxProps!.backgroundColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Read Only', this._makeCheckbox(widget.textBoxProps.isReadOnly, (v) => {
            widget.textBoxProps!.isReadOnly = v;
            this._asset.touch();
          }));
          this._addPropRow('Multiline', this._makeCheckbox(widget.textBoxProps.isMultiline, (v) => {
            widget.textBoxProps!.isMultiline = v;
            this._asset.touch();
          }));
        }
        break;

      case 'CheckBox':
        if (widget.checkBoxProps) {
          this._addPropHeader('Check Box');
          this._addPropRow('Checked', this._makeCheckbox(widget.checkBoxProps.isChecked, (v) => {
            widget.checkBoxProps!.isChecked = v;
            this._asset.touch();
          }));
          this._addPropRow('Checked Color', this._makeColorInput(widget.checkBoxProps.checkedColor, (v) => {
            widget.checkBoxProps!.checkedColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Unchecked', this._makeColorInput(widget.checkBoxProps.uncheckedColor, (v) => {
            widget.checkBoxProps!.uncheckedColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Size', this._makeNumberInput(widget.checkBoxProps.checkSize, 8, 100, 1, (v) => {
            widget.checkBoxProps!.checkSize = v;
            this._asset.touch();
          }));
        }
        break;

      case 'Border':
        if (widget.borderProps) {
          this._addPropHeader('Border');
          this._addPropRow('BG Color', this._makeColorInput(widget.borderProps.backgroundColor, (v) => {
            widget.borderProps!.backgroundColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Border Color', this._makeColorInput(widget.borderProps.borderColor, (v) => {
            widget.borderProps!.borderColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Border Width', this._makeNumberInput(widget.borderProps.borderWidth, 0, 20, 1, (v) => {
            widget.borderProps!.borderWidth = v;
            this._asset.touch();
          }));
          this._addPropRow('Radius', this._makeNumberInput(widget.borderProps.borderRadius, 0, 100, 1, (v) => {
            widget.borderProps!.borderRadius = v;
            this._asset.touch();
          }));

          // --- Background Texture ---
          this._addPropHeader('Background');
          this._addPropRow('BG Texture', this._makeTexturePicker(widget.borderProps.backgroundImage || undefined, (id) => {
            widget.borderProps!.backgroundImage = id ?? '';
            this._asset.touch();
          }));

          // 9-Slice
          this._addPropHeader('9-Slice');
          this._makeNineSliceEditor(widget.borderProps.nineSlice, (s) => {
            widget.borderProps!.nineSlice = s;
          });

          // Gradient
          this._addPropHeader('Gradient');
          this._makeGradientEditor(widget.borderProps.gradient, (g) => {
            widget.borderProps!.gradient = g;
          });
        }
        break;

      case 'ComboBox':
        if (widget.comboBoxProps) {
          this._addPropHeader('Combo Box');
          this._addPropRow('Options', this._makeTextInput(widget.comboBoxProps.options.join(', '), (v) => {
            widget.comboBoxProps!.options = v.split(',').map(s => s.trim()).filter(Boolean);
            this._asset.touch();
          }));
          this._addPropRow('Selected', this._makeNumberInput(widget.comboBoxProps.selectedIndex, 0, 99, 1, (v) => {
            widget.comboBoxProps!.selectedIndex = v;
            this._asset.touch();
          }));
          this._addPropRow('Font Size', this._makeNumberInput(widget.comboBoxProps.fontSize, 1, 200, 1, (v) => {
            widget.comboBoxProps!.fontSize = v;
            this._asset.touch();
          }));
          this._addPropRow('BG', this._makeColorInput(widget.comboBoxProps.backgroundColor, (v) => {
            widget.comboBoxProps!.backgroundColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Color', this._makeColorInput(widget.comboBoxProps.color, (v) => {
            widget.comboBoxProps!.color = v;
            this._asset.touch();
          }));
        }
        break;

      case 'ScrollBox':
        if (widget.scrollBoxProps) {
          this._addPropHeader('Scroll Box');
          this._addPropRow('Orientation', this._makeSelect(
            ['Vertical', 'Horizontal', 'Both'],
            widget.scrollBoxProps.orientation,
            (v) => { widget.scrollBoxProps!.orientation = v as any; this._asset.touch(); },
          ));
          this._addPropRow('Scrollbar', this._makeCheckbox(widget.scrollBoxProps.showScrollbar, (v) => {
            widget.scrollBoxProps!.showScrollbar = v;
            this._asset.touch();
          }));
        }
        break;

      case 'Spacer':
        if (widget.spacerProps) {
          this._addPropHeader('Spacer');
          this._addPropRow('Width', this._makeNumberInput(widget.spacerProps.spacerWidth, 0, 9999, 1, (v) => {
            widget.spacerProps!.spacerWidth = v;
            this._asset.touch();
          }));
          this._addPropRow('Height', this._makeNumberInput(widget.spacerProps.spacerHeight, 0, 9999, 1, (v) => {
            widget.spacerProps!.spacerHeight = v;
            this._asset.touch();
          }));
        }
        break;

      case 'SizeBox':
        if (widget.sizeBoxProps) {
          this._addPropHeader('Size Box');
          this._addPropRow('Width Override', this._makeNumberInput(widget.sizeBoxProps.widthOverride, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.widthOverride = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Height Override', this._makeNumberInput(widget.sizeBoxProps.heightOverride, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.heightOverride = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Min Width', this._makeNumberInput(widget.sizeBoxProps.minDesiredWidth, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.minDesiredWidth = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Min Height', this._makeNumberInput(widget.sizeBoxProps.minDesiredHeight, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.minDesiredHeight = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Max Width', this._makeNumberInput(widget.sizeBoxProps.maxDesiredWidth, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.maxDesiredWidth = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Max Height', this._makeNumberInput(widget.sizeBoxProps.maxDesiredHeight, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.maxDesiredHeight = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
        }
        break;

      case 'ScaleBox':
        {
          const sp = widget.scaleBoxProps ?? { stretch: 'ScaleToFit' as const, userSpecifiedScale: 1 };
          this._addPropHeader('Scale Box');
          this._addPropRow('Stretch', this._makeSelect(
            ['None', 'Fill', 'ScaleToFit', 'ScaleToFitX', 'ScaleToFitY', 'ScaleToFill', 'UserSpecified'],
            sp.stretch,
            (v) => {
              if (!widget.scaleBoxProps) widget.scaleBoxProps = { stretch: 'ScaleToFit', userSpecifiedScale: 1 };
              widget.scaleBoxProps.stretch = v as any;
              this._asset.touch();
              this._layoutEngine.clearCache();
              this._rebuildProperties();
            },
          ));
          if (sp.stretch === 'UserSpecified') {
            this._addPropRow('Scale', this._makeNumberInput(sp.userSpecifiedScale, 0.1, 10, 0.1, (v) => {
              if (!widget.scaleBoxProps) widget.scaleBoxProps = { stretch: 'UserSpecified', userSpecifiedScale: 1 };
              widget.scaleBoxProps.userSpecifiedScale = v;
              this._asset.touch();
              this._layoutEngine.clearCache();
            }));
          }
        }
        break;

      case 'GridPanel':
        {
          const gp = widget.gridPanelProps ?? { rows: 2, columns: 2, rowFill: [1, 1], columnFill: [1, 1] };
          this._addPropHeader('Grid Panel');
          this._addPropRow('Rows', this._makeNumberInput(gp.rows, 1, 20, 1, (v) => {
            if (!widget.gridPanelProps) widget.gridPanelProps = { rows: 2, columns: 2, rowFill: [1, 1], columnFill: [1, 1] };
            widget.gridPanelProps.rows = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
          this._addPropRow('Columns', this._makeNumberInput(gp.columns, 1, 20, 1, (v) => {
            if (!widget.gridPanelProps) widget.gridPanelProps = { rows: 2, columns: 2, rowFill: [1, 1], columnFill: [1, 1] };
            widget.gridPanelProps.columns = v;
            this._asset.touch();
            this._layoutEngine.clearCache();
          }));
        }
        break;

      case 'NamedSlot':
        {
          const ns = widget.namedSlotProps ?? { slotName: 'DefaultSlot', isExposed: true };
          this._addPropHeader('Named Slot');
          this._addPropRow('Slot Name', this._makeTextInput(ns.slotName, (v) => {
            if (!widget.namedSlotProps) widget.namedSlotProps = { slotName: 'DefaultSlot', isExposed: true };
            widget.namedSlotProps.slotName = v;
            this._asset.touch();
          }));
          this._addPropRow('Exposed', this._makeCheckbox(ns.isExposed, (v) => {
            if (!widget.namedSlotProps) widget.namedSlotProps = { slotName: 'DefaultSlot', isExposed: true };
            widget.namedSlotProps.isExposed = v;
            this._asset.touch();
          }));
        }
        break;
    }
  }

  // ============================================================
  //  Property Input Helpers
  // ============================================================

  private _addPropHeader(label: string): void {
    const el = document.createElement('div');
    el.className = 'wbp-prop-header';

    const arrow = document.createElement('span');
    arrow.className = 'wbp-prop-header-arrow';
    arrow.innerHTML = iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
    el.appendChild(arrow);

    const txt = document.createElement('span');
    txt.textContent = label;
    el.appendChild(txt);

    this._propsEl.appendChild(el);
  }

  /**
   * Creates a collapsible section with a toggle header.
   * The `builder` callback receives the content container to populate with rows.
   */
  private _addCollapsibleSection(label: string, startCollapsed: boolean, builder: (container: HTMLElement) => void): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'wbp-collapsible-section';

    const header = document.createElement('div');
    header.className = 'wbp-prop-header';
    header.style.cursor = 'pointer';
    header.style.userSelect = 'none';

    const arrow = document.createElement('span');
    arrow.className = 'wbp-prop-header-arrow';
    arrow.innerHTML = startCollapsed
      ? iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted)
      : iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
    header.appendChild(arrow);

    const txt = document.createElement('span');
    txt.textContent = label;
    header.appendChild(txt);

    const content = document.createElement('div');
    content.style.display = startCollapsed ? 'none' : '';

    // Build the content right away so properties are always in DOM
    builder(content);

    let collapsed = startCollapsed;
    header.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : '';
      arrow.innerHTML = collapsed
        ? iconHTML(Icons.ChevronRight, 'sm', ICON_COLORS.muted)
        : iconHTML(Icons.ChevronDown, 'sm', ICON_COLORS.muted);
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    this._propsEl.appendChild(wrapper);
  }

  /** Add a prop row to a specific container (used by collapsible sections) */
  private _addPropRowTo(container: HTMLElement, label: string, input: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'wbp-prop-row';

    const lbl = document.createElement('div');
    lbl.className = 'wbp-prop-label';
    lbl.textContent = label;
    lbl.title = label;

    row.appendChild(lbl);
    row.appendChild(input);
    container.appendChild(row);
  }

  private _addPropRow(label: string, input: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'wbp-prop-row';

    const lbl = document.createElement('div');
    lbl.className = 'wbp-prop-label';
    lbl.textContent = label;
    lbl.title = label;

    row.appendChild(lbl);
    row.appendChild(input);
    this._propsEl.appendChild(row);
  }

  private _makeTextInput(value: string, onChange: (v: string) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.className = 'wbp-prop-input';
    input.addEventListener('change', () => onChange(input.value));
    return input;
  }

  private _makeNumberInput(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.className = 'wbp-prop-input wbp-prop-num';
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    return input;
  }

  private _makeColorInput(value: string, onChange: (v: string) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wbp-prop-color-wrap';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = value.startsWith('#') ? value.slice(0, 7) : '#ffffff';
    colorInput.className = 'wbp-prop-color-swatch';
    colorInput.addEventListener('input', () => onChange(colorInput.value));

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = value;
    textInput.className = 'wbp-prop-input';
    textInput.addEventListener('change', () => {
      onChange(textInput.value);
      if (textInput.value.startsWith('#')) colorInput.value = textInput.value.slice(0, 7);
    });

    wrapper.appendChild(colorInput);
    wrapper.appendChild(textInput);
    return wrapper;
  }

  private _makeCheckbox(value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'wbp-prop-check';
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  private _makeSelect(options: string[], current: string, onChange: (v: string) => void): HTMLElement {
    const sel = document.createElement('select');
    sel.className = 'wbp-prop-select';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === current) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  private _makeLabel(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'wbp-prop-label-static';
    el.textContent = text;
    return el;
  }

  // ============================================================
  //  Enhanced Property Helpers (Texture, Font, Gradient, etc.)
  // ============================================================

  /** Create a texture picker row with thumbnail + Browse + Clear */
  private _makeTexturePicker(currentId: string | undefined, onChange: (id: string | undefined) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;';

    const thumb = document.createElement('div');
    thumb.style.cssText = 'width:32px;height:32px;border:1px solid #444;border-radius:3px;background:#111;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;';

    if (currentId) {
      const texLib = TextureLibrary.instance;
      if (texLib) {
        const asset = texLib.getAsset(currentId);
        if (asset?.thumbnail) {
          const img = document.createElement('img');
          img.src = asset.thumbnail;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          thumb.appendChild(img);
        } else {
          thumb.innerHTML = iconHTML(Icons.Image, 'sm', ICON_COLORS.muted);
          thumb.style.fontSize = '14px';
        }
      }
    } else {
      thumb.textContent = '—';
      thumb.style.color = '#555';
      thumb.style.fontSize = '12px';
    }

    const nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-size:10px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;';
    if (currentId) {
      const texLib = TextureLibrary.instance;
      const asset = texLib?.getAsset(currentId);
      nameEl.textContent = asset?.assetName ?? currentId.slice(0, 8);
    } else {
      nameEl.textContent = 'None';
    }

    const browseBtn = document.createElement('button');
    browseBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;';
    browseBtn.textContent = '...';
    browseBtn.title = 'Browse Textures';
    browseBtn.addEventListener('click', () => {
      const texLib = TextureLibrary.instance;
      if (!texLib) return;
      // Open a simple texture picker popup
      this._openTexturePicker((id) => {
        onChange(id);
        this._asset.touch();
        this._selectWidget(this._selectedWidgetId);
      });
    });

    const clearBtn = document.createElement('button');
    clearBtn.style.cssText = 'background:#444;color:#ccc;border:none;border-radius:3px;padding:2px 5px;font-size:10px;cursor:pointer;';
    clearBtn.innerHTML = iconHTML(Icons.X, 'xs');
    clearBtn.title = 'Clear';
    clearBtn.addEventListener('click', () => {
      onChange(undefined);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(nameEl);
    wrapper.appendChild(browseBtn);
    wrapper.appendChild(clearBtn);
    return wrapper;
  }

  /** Open a modal texture picker popup */
  private _openTexturePicker(onSelect: (id: string) => void): void {
    const texLib = TextureLibrary.instance;
    if (!texLib) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:6px;padding:16px;min-width:300px;max-width:500px;max-height:400px;display:flex;flex-direction:column;gap:8px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:bold;color:#ddd;';
    title.textContent = 'Select Texture';

    // Import button
    const importBtn = document.createElement('button');
    importBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;align-self:flex-start;';
    importBtn.textContent = '+ Import Texture';
    importBtn.addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        await texLib.importFromFile(file);
        overlay.remove();
        this._openTexturePicker(onSelect);
      });
      input.click();
    });

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;overflow-y:auto;max-height:280px;padding:4px;';

    const assets = texLib.exportAll();
    for (const asset of assets) {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:#222;border:1px solid #333;border-radius:4px;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:4px;';
      cell.title = asset.assetName;

      if (asset.thumbnail) {
        const img = document.createElement('img');
        img.src = asset.thumbnail;
        img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:3px;';
        cell.appendChild(img);
      }

      const name = document.createElement('div');
      name.style.cssText = 'font-size:9px;color:#aaa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;text-align:center;';
      name.textContent = asset.assetName;
      cell.appendChild(name);

      cell.addEventListener('click', () => {
        onSelect(asset.assetId);
        overlay.remove();
      });
      cell.addEventListener('mouseenter', () => { cell.style.borderColor = '#2a5db0'; });
      cell.addEventListener('mouseleave', () => { cell.style.borderColor = '#333'; });

      grid.appendChild(cell);
    }

    if (assets.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#666;font-size:11px;padding:20px;text-align:center;';
      empty.textContent = 'No textures imported. Click "+ Import Texture" to add one.';
      grid.appendChild(empty);
    }

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:4px 12px;font-size:11px;cursor:pointer;align-self:flex-end;';
    closeBtn.textContent = 'Cancel';
    closeBtn.addEventListener('click', () => overlay.remove());

    dialog.appendChild(title);
    dialog.appendChild(importBtn);
    dialog.appendChild(grid);
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /** Create a font picker dropdown */
  private _makeFontPicker(currentFontId: string | undefined, onChange: (fontId: string | undefined) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:4px;flex:1;align-items:center;';

    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:2px 4px;border-radius:3px;font-size:11px;min-width:0;';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(Default)';
    sel.appendChild(noneOpt);

    const fontLib = FontLibrary.instance;
    if (fontLib) {
      const entries = fontLib.getAllFontEntries();
      let hasGroup = false;
      // System fonts
      const systemFonts = entries.filter(e => e.isSystem);
      if (systemFonts.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'System Fonts';
        for (const f of systemFonts) {
          const o = document.createElement('option');
          o.value = f.id;
          o.textContent = f.name;
          if (f.id === currentFontId) o.selected = true;
          grp.appendChild(o);
        }
        sel.appendChild(grp);
        hasGroup = true;
      }
      // Imported fonts
      const imported = entries.filter(e => !e.isSystem);
      if (imported.length > 0) {
        const grp = document.createElement('optgroup');
        grp.label = 'Imported Fonts';
        for (const f of imported) {
          const o = document.createElement('option');
          o.value = f.id;
          o.textContent = f.name;
          if (f.id === currentFontId) o.selected = true;
          grp.appendChild(o);
        }
        sel.appendChild(grp);
      }
      if (!hasGroup && imported.length === 0) {
        // Fallback - just list system fonts flat
        for (const f of entries) {
          const o = document.createElement('option');
          o.value = f.id;
          o.textContent = f.name;
          if (f.id === currentFontId) o.selected = true;
          sel.appendChild(o);
        }
      }
    }

    sel.addEventListener('change', () => {
      onChange(sel.value || undefined);
      this._asset.touch();
    });

    const importBtn = document.createElement('button');
    importBtn.style.cssText = 'background:#444;color:#ccc;border:none;border-radius:3px;padding:2px 5px;font-size:10px;cursor:pointer;white-space:nowrap;';
    importBtn.textContent = '+';
    importBtn.title = 'Import Font';
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ttf,.otf,.woff,.woff2';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file || !fontLib) return;
        await fontLib.importFont(file);
        this._selectWidget(this._selectedWidgetId);
      });
      input.click();
    });

    wrapper.appendChild(sel);
    wrapper.appendChild(importBtn);
    return wrapper;
  }

  /** Create a gradient editor section */
  private _makeGradientEditor(
    gradient: { enabled: boolean; type: 'linear' | 'radial'; angle: number; stops: Array<{ position: number; color: string }> } | undefined,
    onUpdate: (g: { enabled: boolean; type: 'linear' | 'radial'; angle: number; stops: Array<{ position: number; color: string }> }) => void,
  ): void {
    const g = gradient ?? { enabled: false, type: 'linear' as const, angle: 0, stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000' }] };

    this._addPropRow('Gradient', this._makeCheckbox(g.enabled, (v) => {
      g.enabled = v;
      onUpdate(g);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    }));

    if (g.enabled) {
      this._addPropRow('  Type', this._makeSelect(
        ['linear', 'radial'], g.type,
        (v) => { g.type = v as any; onUpdate(g); this._asset.touch(); },
      ));
      this._addPropRow('  Angle', this._makeNumberInput(g.angle, 0, 360, 1, (v) => {
        g.angle = v;
        onUpdate(g);
        this._asset.touch();
      }));

      // Show stops
      for (let i = 0; i < g.stops.length; i++) {
        const stop = g.stops[i];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:2px;flex:1;align-items:center;';

        const colorIn = document.createElement('input');
        colorIn.type = 'color';
        colorIn.value = stop.color.slice(0, 7);
        colorIn.style.cssText = 'width:20px;height:18px;border:none;padding:0;cursor:pointer;background:none;';
        colorIn.addEventListener('input', () => {
          stop.color = colorIn.value;
          onUpdate(g);
          this._asset.touch();
        });

        const posIn = document.createElement('input');
        posIn.type = 'number';
        posIn.value = String(stop.position);
        posIn.min = '0';
        posIn.max = '1';
        posIn.step = '0.01';
        posIn.style.cssText = 'width:45px;background:#111;border:1px solid #333;color:#ddd;padding:1px 3px;border-radius:3px;font-size:10px;';
        posIn.addEventListener('change', () => {
          stop.position = parseFloat(posIn.value) || 0;
          onUpdate(g);
          this._asset.touch();
        });

        const delBtn = document.createElement('button');
        delBtn.style.cssText = 'background:none;border:none;color:#888;font-size:10px;cursor:pointer;padding:0 2px;';
        delBtn.innerHTML = iconHTML(Icons.X, 'xs');
        delBtn.addEventListener('click', () => {
          if (g.stops.length > 2) {
            g.stops.splice(i, 1);
            onUpdate(g);
            this._asset.touch();
            this._selectWidget(this._selectedWidgetId);
          }
        });

        row.appendChild(colorIn);
        row.appendChild(posIn);
        row.appendChild(delBtn);
        this._addPropRow(`  Stop ${i + 1}`, row);
      }

      const addStopBtn = document.createElement('button');
      addStopBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:3px;padding:2px 8px;font-size:10px;cursor:pointer;margin-top:2px;';
      addStopBtn.textContent = '+ Stop';
      addStopBtn.addEventListener('click', () => {
        g.stops.push({ position: 0.5, color: '#888888' });
        onUpdate(g);
        this._asset.touch();
        this._selectWidget(this._selectedWidgetId);
      });
      this._addPropRow('', addStopBtn);
    }
  }

  /** Create a 9-slice editor section */
  private _makeNineSliceEditor(
    slice: { enabled: boolean; margins: { top: number; right: number; bottom: number; left: number } } | undefined,
    onUpdate: (s: { enabled: boolean; margins: { top: number; right: number; bottom: number; left: number } }) => void,
  ): void {
    const s = slice ?? { enabled: false, margins: { top: 16, right: 16, bottom: 16, left: 16 } };

    this._addPropRow('9-Slice', this._makeCheckbox(s.enabled, (v) => {
      s.enabled = v;
      onUpdate(s);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    }));

    if (s.enabled) {
      this._addPropRow('  Top', this._makeNumberInput(s.margins.top, 0, 512, 1, (v) => {
        s.margins.top = v; onUpdate(s); this._asset.touch();
      }));
      this._addPropRow('  Right', this._makeNumberInput(s.margins.right, 0, 512, 1, (v) => {
        s.margins.right = v; onUpdate(s); this._asset.touch();
      }));
      this._addPropRow('  Bottom', this._makeNumberInput(s.margins.bottom, 0, 512, 1, (v) => {
        s.margins.bottom = v; onUpdate(s); this._asset.touch();
      }));
      this._addPropRow('  Left', this._makeNumberInput(s.margins.left, 0, 512, 1, (v) => {
        s.margins.left = v; onUpdate(s); this._asset.touch();
      }));
    }
  }

  /** Create shadow/glow/outline effects editor */
  private _makeEffectsEditor(
    effects: { shadow?: { enabled: boolean; color: string; offset: { x: number; y: number }; blur: number }; glow?: { enabled: boolean; color: string; blur: number; strength: number }; outline?: { enabled: boolean; color: string; width: number } } | undefined,
    onUpdate: (e: any) => void,
  ): void {
    const e = effects ?? {};

    // Shadow
    const sh = e.shadow ?? { enabled: false, color: '#000000', offset: { x: 2, y: 2 }, blur: 4 };
    this._addPropRow('Shadow', this._makeCheckbox(sh.enabled, (v) => {
      sh.enabled = v;
      e.shadow = sh;
      onUpdate(e);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    }));
    if (sh.enabled) {
      this._addPropRow('  Sh Color', this._makeColorInput(sh.color, (v) => {
        sh.color = v; e.shadow = sh; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Sh X', this._makeNumberInput(sh.offset.x, -50, 50, 1, (v) => {
        sh.offset.x = v; e.shadow = sh; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Sh Y', this._makeNumberInput(sh.offset.y, -50, 50, 1, (v) => {
        sh.offset.y = v; e.shadow = sh; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Sh Blur', this._makeNumberInput(sh.blur, 0, 100, 1, (v) => {
        sh.blur = v; e.shadow = sh; onUpdate(e); this._asset.touch();
      }));
    }

    // Glow
    const gl = e.glow ?? { enabled: false, color: '#ffffff', blur: 10, strength: 1 };
    this._addPropRow('Glow', this._makeCheckbox(gl.enabled, (v) => {
      gl.enabled = v;
      e.glow = gl;
      onUpdate(e);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    }));
    if (gl.enabled) {
      this._addPropRow('  Gl Color', this._makeColorInput(gl.color, (v) => {
        gl.color = v; e.glow = gl; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Gl Blur', this._makeNumberInput(gl.blur, 0, 100, 1, (v) => {
        gl.blur = v; e.glow = gl; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Gl Strength', this._makeNumberInput(gl.strength, 0, 10, 0.1, (v) => {
        gl.strength = v; e.glow = gl; onUpdate(e); this._asset.touch();
      }));
    }

    // Outline
    const ol = e.outline ?? { enabled: false, color: '#000000', width: 1 };
    this._addPropRow('Outline', this._makeCheckbox(ol.enabled, (v) => {
      ol.enabled = v;
      e.outline = ol;
      onUpdate(e);
      this._asset.touch();
      this._selectWidget(this._selectedWidgetId);
    }));
    if (ol.enabled) {
      this._addPropRow('  Ol Color', this._makeColorInput(ol.color, (v) => {
        ol.color = v; e.outline = ol; onUpdate(e); this._asset.touch();
      }));
      this._addPropRow('  Ol Width', this._makeNumberInput(ol.width, 0, 20, 1, (v) => {
        ol.width = v; e.outline = ol; onUpdate(e); this._asset.touch();
      }));
    }
  }
}
