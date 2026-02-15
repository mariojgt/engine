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
} from './WidgetBlueprintData';
import {
  createWidgetNode,
  defaultSlot,
  AnchorPresets,
} from './WidgetBlueprintData';
import { mountNodeEditorForAsset } from './NodeEditorPanel';

type EditorTab = 'designer' | 'eventGraph';

/** Palette categories for the widget toolbox */
interface PaletteCategory {
  label: string;
  icon: string;
  widgets: Array<{ type: WidgetType; label: string; icon: string }>;
}

const PALETTE: PaletteCategory[] = [
  {
    label: 'Panel', icon: '📐',
    widgets: [
      { type: 'CanvasPanel', label: 'Canvas Panel', icon: '📐' },
      { type: 'VerticalBox', label: 'Vertical Box', icon: '⬇' },
      { type: 'HorizontalBox', label: 'Horizontal Box', icon: '➡' },
      { type: 'Overlay', label: 'Overlay', icon: '🔲' },
      { type: 'GridPanel', label: 'Grid Panel', icon: '▦' },
      { type: 'WrapBox', label: 'Wrap Box', icon: '↩' },
      { type: 'ScrollBox', label: 'Scroll Box', icon: '📜' },
      { type: 'SizeBox', label: 'Size Box', icon: '📏' },
      { type: 'ScaleBox', label: 'Scale Box', icon: '🔎' },
      { type: 'WidgetSwitcher', label: 'Widget Switcher', icon: '🔀' },
    ],
  },
  {
    label: 'Common', icon: '⭐',
    widgets: [
      { type: 'Text', label: 'Text', icon: '📝' },
      { type: 'Image', label: 'Image', icon: '🖼' },
      { type: 'Button', label: 'Button', icon: '🔘' },
      { type: 'Border', label: 'Border', icon: '🔳' },
      { type: 'Spacer', label: 'Spacer', icon: '⬜' },
    ],
  },
  {
    label: 'Input', icon: '✏',
    widgets: [
      { type: 'TextBox', label: 'Text Box', icon: '📋' },
      { type: 'CheckBox', label: 'Check Box', icon: '☑' },
      { type: 'Slider', label: 'Slider', icon: '🎚' },
      { type: 'ComboBox', label: 'Combo Box', icon: '📃' },
    ],
  },
  {
    label: 'Feedback', icon: '📊',
    widgets: [
      { type: 'ProgressBar', label: 'Progress Bar', icon: '📊' },
      { type: 'CircularThrobber', label: 'Throbber', icon: '⏳' },
    ],
  },
];

export class WidgetBlueprintEditorPanel {
  private _container: HTMLElement;
  private _asset: WidgetBlueprintAsset;
  private _onSave?: () => void;
  private _onCompile?: (code: string) => void;

  private _tabBar!: HTMLElement;
  private _contentArea!: HTMLElement;
  private _activeTab: EditorTab = 'designer';

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

  // Hierarchy & properties panels
  private _hierarchyEl!: HTMLElement;
  private _propsEl!: HTMLElement;

  // Event graph cleanup
  private _eventGraphCleanup: (() => void) | null = null;

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
    this._build();
  }

  dispose(): void {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }
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

    // Tab bar
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'anim-bp-tab-bar'; // reuse anim-bp styling
    this._container.appendChild(this._tabBar);

    // Content area
    this._contentArea = document.createElement('div');
    this._contentArea.style.flex = '1';
    this._contentArea.style.display = 'flex';
    this._contentArea.style.overflow = 'hidden';
    this._container.appendChild(this._contentArea);

    this._rebuildTabBar();
    this._switchTab(this._activeTab);
  }

  private _rebuildTabBar(): void {
    this._tabBar.innerHTML = '';

    const tabs: Array<{ key: EditorTab; label: string; icon: string }> = [
      { key: 'designer', label: 'Designer', icon: '🎨' },
      { key: 'eventGraph', label: 'Event Graph', icon: '📊' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('div');
      btn.className = `anim-bp-tab${this._activeTab === tab.key ? ' active' : ''}`;
      btn.textContent = `${tab.icon} ${tab.label}`;
      btn.addEventListener('click', () => {
        this._activeTab = tab.key;
        this._rebuildTabBar();
        this._switchTab(tab.key);
      });
      this._tabBar.appendChild(btn);
    }

    // Save button
    const toolbar = document.createElement('div');
    toolbar.className = 'anim-bp-toolbar';

    if (this._onSave) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'toolbar-btn';
      saveBtn.textContent = '💾 Save';
      saveBtn.addEventListener('click', () => {
        this._asset.touch();
        this._onSave?.();
      });
      toolbar.appendChild(saveBtn);
    }

    this._tabBar.appendChild(toolbar);
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

  private _buildEventGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    const editorContainer = document.createElement('div');
    editorContainer.style.flex = '1';
    editorContainer.style.position = 'relative';
    editorContainer.style.overflow = 'hidden';
    editorContainer.style.minHeight = '300px';
    wrapper.appendChild(editorContainer);

    this._contentArea.appendChild(wrapper);

    const bp = this._asset.blueprintData;
    this._eventGraphCleanup = mountNodeEditorForAsset(
      editorContainer,
      bp,
      `${this._asset.name} Event Graph`,
      (code: string) => {
        this._asset.compiledCode = code;
        this._asset.touch();
        this._onCompile?.(code);
        this._onSave?.();
      },
    );
  }

  // ============================================================
  //  Designer Tab — Visual Widget Editor
  // ============================================================

  private _buildDesignerTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    // ── Left: Palette + Hierarchy ──
    const leftPanel = document.createElement('div');
    leftPanel.style.width = '220px';
    leftPanel.style.minWidth = '180px';
    leftPanel.style.borderRight = '1px solid #333';
    leftPanel.style.display = 'flex';
    leftPanel.style.flexDirection = 'column';
    leftPanel.style.background = '#1a1a2e';
    leftPanel.style.overflowY = 'auto';

    // Palette
    const paletteSection = document.createElement('div');
    paletteSection.style.padding = '8px';
    paletteSection.style.borderBottom = '1px solid #333';

    const paletteHeader = document.createElement('div');
    paletteHeader.style.cssText = 'font-weight:bold;font-size:12px;color:#ccc;margin-bottom:6px;';
    paletteHeader.textContent = '🧩 Palette';
    paletteSection.appendChild(paletteHeader);

    for (const cat of PALETTE) {
      const catEl = document.createElement('div');
      catEl.style.marginBottom = '4px';

      const catHeader = document.createElement('div');
      catHeader.style.cssText = 'font-size:11px;color:#888;cursor:pointer;padding:2px 4px;';
      catHeader.textContent = `${cat.icon} ${cat.label}`;
      let collapsed = false;
      const catBody = document.createElement('div');
      catBody.style.cssText = 'padding-left:8px;';
      catHeader.addEventListener('click', () => {
        collapsed = !collapsed;
        catBody.style.display = collapsed ? 'none' : '';
      });
      catEl.appendChild(catHeader);

      for (const w of cat.widgets) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:3px 6px;font-size:11px;color:#ddd;cursor:pointer;border-radius:3px;';
        item.textContent = `${w.icon} ${w.label}`;
        item.addEventListener('mouseenter', () => { item.style.background = '#2a2a4e'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => {
          this._addWidgetToSelected(w.type, w.label);
        });
        catBody.appendChild(item);
      }
      catEl.appendChild(catBody);
      paletteSection.appendChild(catEl);
    }
    leftPanel.appendChild(paletteSection);

    // Hierarchy
    const hierarchySection = document.createElement('div');
    hierarchySection.style.padding = '8px';
    hierarchySection.style.flex = '1';

    const hierarchyHeader = document.createElement('div');
    hierarchyHeader.style.cssText = 'font-weight:bold;font-size:12px;color:#ccc;margin-bottom:6px;';
    hierarchyHeader.textContent = '🌳 Hierarchy';
    hierarchySection.appendChild(hierarchyHeader);

    this._hierarchyEl = document.createElement('div');
    hierarchySection.appendChild(this._hierarchyEl);
    leftPanel.appendChild(hierarchySection);

    wrapper.appendChild(leftPanel);

    // ── Center: Canvas ──
    const canvasContainer = document.createElement('div');
    canvasContainer.style.flex = '1';
    canvasContainer.style.position = 'relative';
    canvasContainer.style.overflow = 'hidden';
    canvasContainer.style.background = '#0d0d1a';

    this._canvas = document.createElement('canvas');
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    canvasContainer.appendChild(this._canvas);
    wrapper.appendChild(canvasContainer);

    // ── Right: Properties ──
    const rightPanel = document.createElement('div');
    rightPanel.style.width = '260px';
    rightPanel.style.minWidth = '220px';
    rightPanel.style.borderLeft = '1px solid #333';
    rightPanel.style.overflowY = 'auto';
    rightPanel.style.background = '#1a1a2e';
    rightPanel.style.padding = '8px';

    const propsHeader = document.createElement('div');
    propsHeader.style.cssText = 'font-weight:bold;font-size:12px;color:#ccc;margin-bottom:6px;';
    propsHeader.textContent = '⚙ Properties';
    rightPanel.appendChild(propsHeader);

    this._propsEl = document.createElement('div');
    rightPanel.appendChild(this._propsEl);
    wrapper.appendChild(rightPanel);

    this._contentArea.appendChild(wrapper);

    // Initialize canvas
    this._initDesignerCanvas(canvasContainer);
    this._rebuildHierarchy();
    this._rebuildProperties();
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
      this._saveDesignerState();
    });

    this._canvas.addEventListener('mousedown', (e) => {
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
        const hit = this._hitTestCanvas(mx, my);

        if (hit && hit !== this._asset.rootWidgetId) {
          this._selectedWidgetId = hit;
          this._isDraggingWidget = true;
          this._dragWidgetId = hit;
          const widget = this._asset.getWidget(hit)!;
          const worldPos = this._widgetToScreen(widget.slot.offsetX, widget.slot.offsetY);
          this._dragOffsetX = mx - worldPos.x;
          this._dragOffsetY = my - worldPos.y;
        } else {
          this._selectedWidgetId = hit;
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

      if (this._isDraggingWidget && this._dragWidgetId) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * window.devicePixelRatio;
        const my = (e.clientY - rect.top) * window.devicePixelRatio;
        const worldPos = this._screenToWidget(mx - this._dragOffsetX, my - this._dragOffsetY);
        const widget = this._asset.getWidget(this._dragWidgetId);
        if (widget) {
          widget.slot.offsetX = Math.round(worldPos.x);
          widget.slot.offsetY = Math.round(worldPos.y);
          this._asset.touch();
          this._rebuildProperties();
        }
      }
    });

    const onMouseUp = () => {
      this._isPanning = false;
      this._isDraggingWidget = false;
      this._dragWidgetId = null;
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

  /** Save designer viewport state */
  private _saveDesignerState(): void {
    this._asset.designerState = {
      zoom: this._designerZoom,
      panX: this._designerPanX,
      panY: this._designerPanY,
    };
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

    // Background grid
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, w, h);

    const zoom = this._designerZoom;
    const panX = this._designerPanX * dpr;
    const panY = this._designerPanY * dpr;
    const centerX = w / 2 + panX;
    const centerY = h / 2 + panY;

    // Draw grid
    const gridSize = 50 * zoom * dpr;
    if (gridSize > 4) {
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = centerX % gridSize;
      const startY = centerY % gridSize;
      for (let x = startX; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = startY; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    // Draw widget tree
    this._renderWidgetNode(ctx, this._asset.rootWidgetId, centerX, centerY, zoom * dpr);
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

    const x = parentX + widget.slot.offsetX * scale;
    const y = parentY + widget.slot.offsetY * scale;
    const w = widget.slot.sizeX * scale;
    const h = widget.slot.sizeY * scale;
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
          ctx.fillStyle = tp.color;
          ctx.font = `${tp.isBold ? 'bold ' : ''}${tp.isItalic ? 'italic ' : ''}${fontSize}px ${tp.fontFamily}`;
          ctx.textBaseline = 'top';
          ctx.fillText(tp.text, x + 2, y + 2, w);
        }
        break;
      }

      case 'Image': {
        const ip = widget.imageProps;
        ctx.fillStyle = ip?.tintColor ?? '#333';
        ctx.fillRect(x, y, w, h);
        // Placeholder icon
        ctx.fillStyle = '#666';
        ctx.font = `${Math.min(w, h) * 0.4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🖼', x + w / 2, y + h / 2);
        ctx.textAlign = 'start';
        break;
      }

      case 'Button': {
        const bp = widget.buttonProps;
        ctx.fillStyle = bp?.normalColor ?? '#2a5db0';
        const r = (bp?.borderRadius ?? 4) * scale / this._designerZoom / window.devicePixelRatio;
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        if (bp?.borderWidth) {
          ctx.strokeStyle = bp.borderColor;
          ctx.lineWidth = bp.borderWidth;
          this._roundRect(ctx, x, y, w, h, r);
          ctx.stroke();
        }
        break;
      }

      case 'ProgressBar': {
        const pp = widget.progressBarProps;
        ctx.fillStyle = pp?.backgroundColor ?? '#333';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = pp?.fillColor ?? '#2a9d8f';
        const pct = pp?.percent ?? 0.5;
        ctx.fillRect(x, y, w * pct, h);
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
        ctx.fillStyle = br?.backgroundColor ?? '#1a1a2e80';
        const rad = (br?.borderRadius ?? 4) * scale / this._designerZoom / window.devicePixelRatio;
        this._roundRect(ctx, x, y, w, h, rad);
        ctx.fill();
        if (br?.borderWidth) {
          ctx.strokeStyle = br.borderColor ?? '#555';
          ctx.lineWidth = br.borderWidth;
          this._roundRect(ctx, x, y, w, h, rad);
          ctx.stroke();
        }
        break;
      }

      case 'VerticalBox':
      case 'HorizontalBox':
      case 'Overlay':
      case 'GridPanel':
      case 'WrapBox':
      case 'ScrollBox':
      case 'SizeBox':
      case 'ScaleBox':
      case 'WidgetSwitcher':
        // Container outline
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#555';
        ctx.font = '10px Arial';
        ctx.fillText(widget.name, x + 4, y + 12);
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

      // Resize handles
      const hs = 6;
      ctx.fillStyle = '#4a9eff';
      const corners = [
        [x - hs / 2, y - hs / 2],
        [x + w - hs / 2, y - hs / 2],
        [x - hs / 2, y + h - hs / 2],
        [x + w - hs / 2, y + h - hs / 2],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx, cy, hs, hs);
      }
      ctx.restore();
    }

    // Render children
    for (const childId of widget.children) {
      this._renderWidgetNode(ctx, childId, x, y, scale);
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

  // ============================================================
  //  Hierarchy Tree
  // ============================================================

  private _rebuildHierarchy(): void {
    if (!this._hierarchyEl) return;
    this._hierarchyEl.innerHTML = '';
    this._renderHierarchyNode(this._hierarchyEl, this._asset.rootWidgetId, 0);
  }

  private _renderHierarchyNode(container: HTMLElement, widgetId: string, depth: number): void {
    const widget = this._asset.getWidget(widgetId);
    if (!widget) return;

    const row = document.createElement('div');
    row.style.cssText = `
      padding: 3px 4px 3px ${8 + depth * 14}px;
      font-size: 11px;
      cursor: pointer;
      border-radius: 3px;
      color: ${widgetId === this._selectedWidgetId ? '#fff' : '#ccc'};
      background: ${widgetId === this._selectedWidgetId ? '#2a5db044' : 'transparent'};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    const icon = this._getWidgetIcon(widget.type);
    row.textContent = `${icon} ${widget.name}`;

    row.addEventListener('click', () => {
      this._selectedWidgetId = widgetId;
      this._rebuildHierarchy();
      this._rebuildProperties();
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectedWidgetId = widgetId;
      this._rebuildHierarchy();
      this._rebuildProperties();
      this._showWidgetContextMenu(e.clientX, e.clientY, widgetId);
    });

    container.appendChild(row);

    // Children
    for (const childId of widget.children) {
      this._renderHierarchyNode(container, childId, depth + 1);
    }
  }

  private _getWidgetIcon(type: WidgetType): string {
    const icons: Partial<Record<WidgetType, string>> = {
      CanvasPanel: '📐', VerticalBox: '⬇', HorizontalBox: '➡', Overlay: '🔲',
      GridPanel: '▦', WrapBox: '↩', ScrollBox: '📜', SizeBox: '📏', ScaleBox: '🔎',
      Border: '🔳', Spacer: '⬜', Text: '📝', RichText: '📝', Image: '🖼',
      Button: '🔘', CheckBox: '☑', Slider: '🎚', ProgressBar: '📊',
      TextBox: '📋', ComboBox: '📃', CircularThrobber: '⏳', WidgetSwitcher: '🔀',
    };
    return icons[type] ?? '▪';
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
      item.textContent = label;
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
      addItem('➕ Add Child Widget...', () => this._showAddWidgetSubmenu(mx, my, widgetId));
    }

    addSep();
    addItem('✏ Rename', () => {
      const name = prompt('New name:', widget.name);
      if (name) {
        widget.name = name.trim();
        this._asset.touch();
        this._rebuildHierarchy();
        this._rebuildProperties();
      }
    });
    addItem('📋 Duplicate', () => {
      this._asset.duplicateWidget(widgetId);
      this._rebuildHierarchy();
    }, widgetId === this._asset.rootWidgetId);
    addItem('🗑 Delete', () => {
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
    if (!this._propsEl) return;
    this._propsEl.innerHTML = '';

    if (!this._selectedWidgetId) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#666;font-size:11px;padding:12px 0;';
      empty.textContent = 'Select a widget to edit its properties.';
      this._propsEl.appendChild(empty);
      return;
    }

    const widget = this._asset.getWidget(this._selectedWidgetId);
    if (!widget) return;

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

    // ── Slot / Layout ──
    this._addPropHeader('Slot');
    this._addPropRow('Offset X', this._makeNumberInput(widget.slot.offsetX, -9999, 9999, 1, (v) => {
      widget.slot.offsetX = v;
      this._asset.touch();
    }));
    this._addPropRow('Offset Y', this._makeNumberInput(widget.slot.offsetY, -9999, 9999, 1, (v) => {
      widget.slot.offsetY = v;
      this._asset.touch();
    }));
    this._addPropRow('Size X', this._makeNumberInput(widget.slot.sizeX, 0, 9999, 1, (v) => {
      widget.slot.sizeX = v;
      this._asset.touch();
    }));
    this._addPropRow('Size Y', this._makeNumberInput(widget.slot.sizeY, 0, 9999, 1, (v) => {
      widget.slot.sizeY = v;
      this._asset.touch();
    }));
    this._addPropRow('Z-Order', this._makeNumberInput(widget.slot.zOrder, -999, 999, 1, (v) => {
      widget.slot.zOrder = v;
      this._asset.touch();
    }));

    // ── Anchor Presets ──
    this._addPropHeader('Anchor');
    const anchorPresetNames = Object.keys(AnchorPresets) as Array<keyof typeof AnchorPresets>;
    const currentPreset = anchorPresetNames.find(name => {
      const p = AnchorPresets[name];
      return p.minX === widget.slot.anchor.minX && p.minY === widget.slot.anchor.minY &&
             p.maxX === widget.slot.anchor.maxX && p.maxY === widget.slot.anchor.maxY;
    }) ?? 'Custom';
    this._addPropRow('Preset', this._makeSelect(
      [...anchorPresetNames, 'Custom'],
      currentPreset,
      (v) => {
        if (v !== 'Custom' && v in AnchorPresets) {
          widget.slot.anchor = { ...AnchorPresets[v as keyof typeof AnchorPresets] };
          this._asset.touch();
          this._rebuildProperties();
        }
      },
    ));

    // ── Render Transform ──
    this._addPropHeader('Transform');
    this._addPropRow('Translate X', this._makeNumberInput(widget.renderTranslation.x, -9999, 9999, 1, (v) => {
      widget.renderTranslation.x = v;
      this._asset.touch();
    }));
    this._addPropRow('Translate Y', this._makeNumberInput(widget.renderTranslation.y, -9999, 9999, 1, (v) => {
      widget.renderTranslation.y = v;
      this._asset.touch();
    }));
    this._addPropRow('Angle', this._makeNumberInput(widget.renderAngle, -360, 360, 1, (v) => {
      widget.renderAngle = v;
      this._asset.touch();
    }));

    // ── Type-specific properties ──
    this._buildTypeSpecificProps(widget);
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
        }
        break;

      case 'Image':
        if (widget.imageProps) {
          this._addPropHeader('Image');
          this._addPropRow('Tint', this._makeColorInput(widget.imageProps.tintColor, (v) => {
            widget.imageProps!.tintColor = v;
            this._asset.touch();
          }));
          this._addPropRow('Stretch', this._makeSelect(
            ['None', 'Fill', 'ScaleToFit', 'ScaleToFill'],
            widget.imageProps.stretch,
            (v) => { widget.imageProps!.stretch = v as any; this._asset.touch(); },
          ));
        }
        break;

      case 'Button':
        if (widget.buttonProps) {
          this._addPropHeader('Button');
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
          }));
          this._addPropRow('Height Override', this._makeNumberInput(widget.sizeBoxProps.heightOverride, 0, 9999, 1, (v) => {
            widget.sizeBoxProps!.heightOverride = v;
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
    el.style.cssText = 'font-weight:bold;font-size:11px;color:#aaa;margin-top:10px;margin-bottom:4px;padding-bottom:2px;border-bottom:1px solid #333;';
    el.textContent = label;
    this._propsEl.appendChild(el);
  }

  private _addPropRow(label: string, input: HTMLElement): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;margin-bottom:3px;gap:4px;';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:11px;color:#999;width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
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
    input.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:2px 4px;border-radius:3px;font-size:11px;min-width:0;';
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
    input.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:2px 4px;border-radius:3px;font-size:11px;min-width:0;width:60px;';
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    return input;
  }

  private _makeColorInput(value: string, onChange: (v: string) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:2px;flex:1;align-items:center;';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = value.startsWith('#') ? value.slice(0, 7) : '#ffffff';
    colorInput.style.cssText = 'width:24px;height:20px;border:none;padding:0;cursor:pointer;background:none;';
    colorInput.addEventListener('input', () => onChange(colorInput.value));

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = value;
    textInput.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:2px 4px;border-radius:3px;font-size:11px;min-width:0;';
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
    input.style.cssText = 'cursor:pointer;';
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  private _makeSelect(options: string[], current: string, onChange: (v: string) => void): HTMLElement {
    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:2px 4px;border-radius:3px;font-size:11px;min-width:0;';
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
    el.style.cssText = 'font-size:11px;color:#888;';
    el.textContent = text;
    return el;
  }
}
