// ============================================================
//  UIManager — Runtime Widget/UI system for Feather Engine
//  Renders Widget Blueprints as HTML/CSS overlays on top of
//  the Three.js canvas during Play mode.
//
//  API surface (called from compiled blueprint code):
//    createWidget(blueprintId) → widgetHandle
//    addToViewport(handle)
//    removeFromViewport(handle)
//    setText(handle, widgetName, text)
//    getText(handle, widgetName) → string
//    setVisibility(handle, widgetName, visible)
//    isVisible(handle, widgetName) → boolean
//    setColor(handle, widgetName, color)
//    setOpacity(handle, widgetName, opacity)
//    setProgressBarPercent(handle, widgetName, percent)
//    getProgressBarPercent(handle, widgetName) → number
//    setSliderValue(handle, widgetName, value)
//    getSliderValue(handle, widgetName) → number
//    setCheckBoxState(handle, widgetName, checked)
//    getCheckBoxState(handle, widgetName) → boolean
//    playAnimation(handle, animName)
//    setInputMode(uiOnly)
//    showMouseCursor(show)
//    destroy()  — called on Play stop
// ============================================================

/** Minimal widget data needed at runtime (mirrors WidgetBlueprintData types) */
export interface RuntimeWidgetNode {
  id: string;
  type: string;
  name: string;
  slot: {
    anchor: { minX: number; minY: number; maxX: number; maxY: number };
    offsetX: number; offsetY: number;
    sizeX: number; sizeY: number;
    alignment: { x: number; y: number };
    autoSize: boolean;
    zOrder: number;
    padding: { left: number; top: number; right: number; bottom: number };
    fillWeight: number;
    sizeMode: string;
  };
  visibility: string;
  renderOpacity: number;
  isEnabled: boolean;
  renderTranslation: { x: number; y: number };
  renderScale: { x: number; y: number };
  renderAngle: number;
  renderPivot: { x: number; y: number };
  textProps?: any;
  imageProps?: any;
  buttonProps?: any;
  progressBarProps?: any;
  sliderProps?: any;
  textBoxProps?: any;
  checkBoxProps?: any;
  borderProps?: any;
  sizeBoxProps?: any;
  comboBoxProps?: any;
  scrollBoxProps?: any;
  spacerProps?: any;
  children: string[];
}

export interface RuntimeWidgetBlueprint {
  id: string;
  name: string;
  rootWidgetId: string;
  widgets: Record<string, RuntimeWidgetNode>;
  compiledCode?: string;
}

/** Widget event handler callback */
export type WidgetEventHandler = (...args: any[]) => void;

/** A live widget instance */
interface WidgetInstance {
  handle: string;
  blueprintId: string;
  blueprint: RuntimeWidgetBlueprint;
  /** Root DOM element for this widget tree */
  rootEl: HTMLDivElement;
  /** Map widget name → DOM element (for quick lookup) */
  elementsByName: Map<string, HTMLElement>;
  /** Map widget id → DOM element */
  elementsById: Map<string, HTMLElement>;
  /** Whether currently added to the viewport */
  isInViewport: boolean;
  /** Event handlers: `widgetName:eventType` → handler function */
  eventHandlers: Map<string, WidgetEventHandler>;
  /** Widget blueprint state: variables and functions accessible from outside */
  state: any;
}

let _handleCounter = 0;

/**
 * UIManager — Creates and manages HTML/CSS widget overlays.
 */
export class UIManager {
  /** Overlay container that sits on top of the canvas */
  private _overlay: HTMLDivElement | null = null;
  /** All widget instances created this session */
  private _instances = new Map<string, WidgetInstance>();
  /** Blueprint data lookup — set by the editor before Play */
  private _blueprintResolver: ((id: string) => RuntimeWidgetBlueprint | null) | null = null;
  /** Whether input is UI-only mode */
  private _uiOnlyMode = false;
  /** Print function for widget blueprint print nodes - uses engine's print system */
  private _printFn: ((value: any) => void) | null = null;

  /**
   * Set the function that resolves a widget blueprint ID to its data.
   * Called by the editor/main before Play.
   */
  setBlueprintResolver(resolver: (id: string) => RuntimeWidgetBlueprint | null): void {
    this._blueprintResolver = resolver;
  }

  /**
   * Set the print function for widget blueprint print nodes.
   * This should be wired to the engine's onPrint callback.
   */
  setPrintFunction(printFn: (value: any) => void): void {
    this._printFn = printFn;
  }

  /**
   * Initialize the overlay container.
   * Should be called when Play starts.
   */
  init(canvas: HTMLCanvasElement): void {
    // Create overlay div that perfectly matches the canvas
    const overlay = document.createElement('div');
    overlay.id = '__feather_ui_overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 100;
      font-family: Arial, sans-serif;
    `;
    // Position relative to canvas parent
    const parent = canvas.parentElement;
    if (parent) {
      parent.style.position = 'relative';
      parent.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }
    this._overlay = overlay;
  }

  /**
   * Destroy all widgets and remove the overlay.
   * Called when Play stops.
   */
  destroy(): void {
    for (const inst of this._instances.values()) {
      if (inst.rootEl.parentElement) {
        inst.rootEl.parentElement.removeChild(inst.rootEl);
      }
    }
    this._instances.clear();
    if (this._overlay && this._overlay.parentElement) {
      this._overlay.parentElement.removeChild(this._overlay);
    }
    this._overlay = null;
    this._uiOnlyMode = false;
    _handleCounter = 0;
  }

  // ── Blueprint API ─────────────────────────────────────────

  /**
   * Create a widget instance from a blueprint ID.
   * Returns a handle string used by all other API calls.
   */
  createWidget(blueprintId: string): string {
    const bp = this._blueprintResolver?.(blueprintId);
    if (!bp) {
      console.warn(`[UIManager] Widget blueprint "${blueprintId}" not found`);
      return '';
    }

    const handle = '__widget_' + (++_handleCounter);

    // Build DOM tree from blueprint data
    const rootEl = document.createElement('div');
    rootEl.dataset.widgetHandle = handle;
    rootEl.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;';

    const elementsByName = new Map<string, HTMLElement>();
    const elementsById = new Map<string, HTMLElement>();

    // Build recursively from root
    if (bp.rootWidgetId && bp.widgets[bp.rootWidgetId]) {
      this._buildWidgetDOM(bp.widgets[bp.rootWidgetId], bp.widgets, rootEl, elementsByName, elementsById);
    }

    // Create widget state object to store variables, functions, and custom events
    const state: any = {
      __variables: {}, // Stores widget variables
      __functions: {}, // Stores widget functions
      __events: {},    // Stores widget custom events
    };

    const inst: WidgetInstance = {
      handle,
      blueprintId,
      blueprint: bp,
      rootEl,
      elementsByName,
      elementsById,
      isInViewport: false,
      eventHandlers: new Map(),
      state,
    };
    this._instances.set(handle, inst);

    // Bind DOM events after widget is created
    this._bindWidgetEvents(inst);

    // Execute widget blueprint compiled code to register event handlers
    if ((bp as any).compiledCode) {
      try {
        console.log(`[UIManager] Executing widget blueprint code for "${bp.name || bp.id}"`);
        // The compiled code defines variables and functions.
        // We execute it in a context that stores them in the state object.
        // Use engine's print function if available, otherwise fall back to console.log
        const print = this._printFn || ((msg: any) => console.log('[Widget BP]', msg));

        // Wrap the compiled code to capture variables, functions, and events in the state object
        const wrappedCode = `
          ${(bp as any).compiledCode}
          // Store all variables, functions, and events in state for external access
          __widgetState.__variables = {};
          __widgetState.__functions = {};
          __widgetState.__events = {};
          // Capture variables starting with __var_
          ${this._generateVariableCaptureCode((bp as any).compiledCode)}
          // Capture functions starting with __fn_
          ${this._generateFunctionCaptureCode((bp as any).compiledCode)}
          // Capture custom events starting with __custom_evt_
          ${this._generateEventCaptureCode((bp as any).compiledCode)}
          // Run setup
          if (typeof __setupWidgetEvents === "function") __setupWidgetEvents(__widgetHandle, __uiManager);
        `;

        const setupFn = new Function('__widgetHandle', '__uiManager', 'print', '__widgetState', wrappedCode);
        setupFn(handle, this, print, state);
        console.log(`[UIManager] Widget event handlers registered for "${bp.name || bp.id}"`);
        console.log(`[UIManager] Widget state:`, state);
      } catch (err) {
        console.error(`[UIManager] Error executing widget blueprint code:`, err);
      }
    }

    return handle;
  }

  /**
   * Add a widget to the viewport (make it visible on screen).
   */
  addToViewport(handle: string): void {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] addToViewport: widget handle "${handle}" not found`);
      return;
    }
    if (inst.isInViewport) {
      console.log(`[UIManager] Widget "${inst.blueprint.name}" already in viewport`);
      return;
    }
    if (!this._overlay) {
      console.warn(`[UIManager] addToViewport: overlay not initialized`);
      return;
    }
    this._overlay.appendChild(inst.rootEl);
    inst.isInViewport = true;
    console.log(`[UIManager] Widget "${inst.blueprint.name}" added to viewport`);
  }

  /**
   * Remove a widget from the viewport.
   */
  removeFromViewport(handle: string): void {
    const inst = this._instances.get(handle);
    if (!inst || !inst.isInViewport) return;
    if (inst.rootEl.parentElement) {
      inst.rootEl.parentElement.removeChild(inst.rootEl);
    }
    inst.isInViewport = false;
  }

  // ── Mutation API ──────────────────────────────────────────

  setText(handle: string, widgetName: string, text: string): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    const textEl = el.querySelector('[data-widget-text]') as HTMLElement || el;
    textEl.textContent = text;
  }

  getText(handle: string, widgetName: string): string {
    const el = this._findByName(handle, widgetName);
    if (!el) return '';
    const textEl = el.querySelector('[data-widget-text]') as HTMLElement || el;
    if (textEl instanceof HTMLInputElement || textEl instanceof HTMLTextAreaElement) {
      return textEl.value;
    }
    return textEl.textContent || '';
  }

  setVisibility(handle: string, widgetName: string, visible: boolean): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    el.style.display = visible ? '' : 'none';
    el.dataset.widgetVisible = visible ? 'true' : 'false';
  }

  isVisible(handle: string, widgetName: string): boolean {
    const el = this._findByName(handle, widgetName);
    if (!el) return false;
    return el.style.display !== 'none';
  }

  setColor(handle: string, widgetName: string, color: string): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    el.style.color = color;
  }

  setOpacity(handle: string, widgetName: string, opacity: number): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  }

  setProgressBarPercent(handle: string, widgetName: string, percent: number): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    const fill = el.querySelector('[data-progress-fill]') as HTMLElement;
    if (fill) {
      const p = Math.max(0, Math.min(1, percent));
      fill.style.width = `${p * 100}%`;
      el.dataset.progressPercent = String(p);
    }
  }

  getProgressBarPercent(handle: string, widgetName: string): number {
    const el = this._findByName(handle, widgetName);
    if (!el) return 0;
    return parseFloat(el.dataset.progressPercent || '0');
  }

  setSliderValue(handle: string, widgetName: string, value: number): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    const input = el.querySelector('input[type="range"]') as HTMLInputElement;
    if (input) {
      input.value = String(value);
      el.dataset.sliderValue = String(value);
    }
  }

  getSliderValue(handle: string, widgetName: string): number {
    const el = this._findByName(handle, widgetName);
    if (!el) return 0;
    const input = el.querySelector('input[type="range"]') as HTMLInputElement;
    if (input) return parseFloat(input.value) || 0;
    return parseFloat(el.dataset.sliderValue || '0');
  }

  setCheckBoxState(handle: string, widgetName: string, checked: boolean): void {
    const el = this._findByName(handle, widgetName);
    if (!el) return;
    const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (input) {
      input.checked = checked;
      el.dataset.checkboxChecked = String(checked);
    }
  }

  getCheckBoxState(handle: string, widgetName: string): boolean {
    const el = this._findByName(handle, widgetName);
    if (!el) return false;
    const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (input) return input.checked;
    return el.dataset.checkboxChecked === 'true';
  }

  playAnimation(_handle: string, _animName: string): void {
    // TODO: implement CSS keyframe animation playback
    console.log(`[UIManager] playAnimation not yet implemented for "${_animName}"`);
  }

  setInputMode(uiOnly: boolean): void {
    this._uiOnlyMode = uiOnly;
    if (this._overlay) {
      this._overlay.style.pointerEvents = uiOnly ? 'auto' : 'none';
    }
  }

  showMouseCursor(show: boolean): void {
    document.body.style.cursor = show ? 'default' : 'none';
  }

  // ── Event System API ──────────────────────────────────────

  /**
   * Register an event handler for a specific widget event.
   * Called from blueprint code.
   * @param handle Widget instance handle
   * @param widgetName Name of the widget (e.g., "PlayButton")
   * @param eventType Event type (e.g., "OnClicked", "OnValueChanged")
   * @param handler Callback function
   */
  registerEventHandler(
    handle: string,
    widgetName: string,
    eventType: string,
    handler: WidgetEventHandler
  ): void {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] Cannot register event: widget handle "${handle}" not found`);
      return;
    }
    const key = `${widgetName}:${eventType}`;
    inst.eventHandlers.set(key, handler);
  }

  /**
   * Trigger an event handler (called internally when DOM events fire).
   */
  private _triggerEvent(inst: WidgetInstance, widgetName: string, eventType: string, ...args: any[]): void {
    const key = `${widgetName}:${eventType}`;
    const handler = inst.eventHandlers.get(key);
    if (handler) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[UIManager] Error in ${key} handler:`, err);
      }
    }
  }

  /**
   * Bind DOM events to widgets after creation.
   * This connects HTML events (click, input, etc.) to blueprint event handlers.
   */
  private _bindWidgetEvents(inst: WidgetInstance): void {
    for (const [widgetName, el] of inst.elementsByName) {
      const widgetType = el.dataset.widgetType;

      // Button events
      if (widgetType === 'Button') {
        el.addEventListener('click', () => {
          this._triggerEvent(inst, widgetName, 'OnClicked');
        });
        el.addEventListener('mousedown', () => {
          this._triggerEvent(inst, widgetName, 'OnPressed');
        });
        el.addEventListener('mouseup', () => {
          this._triggerEvent(inst, widgetName, 'OnReleased');
        });
        el.addEventListener('mouseenter', () => {
          this._triggerEvent(inst, widgetName, 'OnHovered');
        });
        el.addEventListener('mouseleave', () => {
          this._triggerEvent(inst, widgetName, 'OnUnhovered');
        });
      }

      // TextBox events
      if (widgetType === 'TextBox') {
        const input = el.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
        if (input) {
          input.addEventListener('input', () => {
            this._triggerEvent(inst, widgetName, 'OnTextChanged', input.value);
          });
          input.addEventListener('change', () => {
            this._triggerEvent(inst, widgetName, 'OnTextCommitted', input.value);
          });
          input.addEventListener('blur', () => {
            this._triggerEvent(inst, widgetName, 'OnTextCommitted', input.value);
          });
        }
      }

      // Slider events
      if (widgetType === 'Slider') {
        const input = el.querySelector('input[type="range"]') as HTMLInputElement;
        if (input) {
          input.addEventListener('input', () => {
            const value = parseFloat(input.value) || 0;
            this._triggerEvent(inst, widgetName, 'OnValueChanged', value);
          });
        }
      }

      // CheckBox events
      if (widgetType === 'CheckBox') {
        const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (input) {
          input.addEventListener('change', () => {
            this._triggerEvent(inst, widgetName, 'OnCheckStateChanged', input.checked);
          });
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────

  private _findByName(handle: string, widgetName: string): HTMLElement | null {
    const inst = this._instances.get(handle);
    if (!inst) return null;
    return inst.elementsByName.get(widgetName) || null;
  }

  /**
   * Recursively build DOM elements from widget hierarchy data.
   */
  private _buildWidgetDOM(
    widget: RuntimeWidgetNode,
    allWidgets: Record<string, RuntimeWidgetNode>,
    parentEl: HTMLElement,
    nameMap: Map<string, HTMLElement>,
    idMap: Map<string, HTMLElement>,
  ): void {
    const el = this._createWidgetElement(widget);
    el.dataset.widgetId = widget.id;
    el.dataset.widgetName = widget.name;
    el.dataset.widgetType = widget.type;

    nameMap.set(widget.name, el);
    idMap.set(widget.id, el);

    // Apply common styles
    this._applySlotStyles(el, widget, parentEl);
    this._applyVisibility(el, widget);
    this._applyRenderTransform(el, widget);

    el.style.opacity = String(widget.renderOpacity);

    // Recurse into children
    for (const childId of widget.children) {
      const child = allWidgets[childId];
      if (child) {
        this._buildWidgetDOM(child, allWidgets, el, nameMap, idMap);
      }
    }

    parentEl.appendChild(el);
  }

  /**
   * Create an HTML element based on widget type.
   */
  private _createWidgetElement(widget: RuntimeWidgetNode): HTMLDivElement {
    const el = document.createElement('div');

    switch (widget.type) {
      // ── Layout containers ──
      // NOTE: Containers inherit pointer-events:none from root, allowing clicks to pass through
      // Only interactive elements (buttons, inputs) should have pointer-events:auto
      case 'CanvasPanel':
        el.style.cssText = 'position:relative; width:100%; height:100%;';
        break;
      case 'VerticalBox':
        el.style.cssText = 'display:flex; flex-direction:column;';
        break;
      case 'HorizontalBox':
        el.style.cssText = 'display:flex; flex-direction:row;';
        break;
      case 'Overlay':
        el.style.cssText = 'position:relative;';
        break;
      case 'GridPanel':
        el.style.cssText = 'display:grid;';
        break;
      case 'WrapBox':
        el.style.cssText = 'display:flex; flex-wrap:wrap;';
        break;
      case 'ScrollBox': {
        const sp = widget.scrollBoxProps;
        const dir = sp?.orientation === 'Horizontal' ? 'overflow-x:auto;overflow-y:hidden;'
          : sp?.orientation === 'Both' ? 'overflow:auto;'
          : 'overflow-x:hidden;overflow-y:auto;';
        el.style.cssText = `${dir} position:relative;`;
        if (sp && !sp.showScrollbar) {
          el.style.cssText += 'scrollbar-width:none;';
        }
        break;
      }
      case 'SizeBox': {
        const sb = widget.sizeBoxProps;
        if (sb) {
          if (sb.widthOverride > 0) el.style.width = `${sb.widthOverride}px`;
          if (sb.heightOverride > 0) el.style.height = `${sb.heightOverride}px`;
          if (sb.minDesiredWidth > 0) el.style.minWidth = `${sb.minDesiredWidth}px`;
          if (sb.minDesiredHeight > 0) el.style.minHeight = `${sb.minDesiredHeight}px`;
          if (sb.maxDesiredWidth > 0) el.style.maxWidth = `${sb.maxDesiredWidth}px`;
          if (sb.maxDesiredHeight > 0) el.style.maxHeight = `${sb.maxDesiredHeight}px`;
        }
        break;
      }
      case 'ScaleBox':
        el.style.cssText = 'position:relative; overflow:hidden;';
        break;
      case 'Border': {
        const bp = widget.borderProps;
        if (bp) {
          el.style.backgroundColor = bp.backgroundColor || 'transparent';
          if (bp.borderWidth > 0) {
            el.style.border = `${bp.borderWidth}px solid ${bp.borderColor || '#888'}`;
          }
          if (bp.borderRadius > 0) el.style.borderRadius = `${bp.borderRadius}px`;
          if (bp.backgroundImage) {
            el.style.backgroundImage = `url(${bp.backgroundImage})`;
            el.style.backgroundSize = 'cover';
          }
        }
        break;
      }
      case 'Spacer': {
        const sp = widget.spacerProps;
        if (sp) {
          el.style.width = `${sp.spacerWidth}px`;
          el.style.height = `${sp.spacerHeight}px`;
        }
        break;
      }

      // ── Content widgets ──
      case 'Text':
      case 'RichText': {
        const tp = widget.textProps;
        if (tp) {
          const textSpan = document.createElement('span');
          textSpan.dataset.widgetText = 'true';
          textSpan.textContent = tp.text;
          textSpan.style.fontSize = `${tp.fontSize}px`;
          textSpan.style.fontFamily = tp.fontFamily;
          textSpan.style.color = tp.color;
          textSpan.style.textAlign = tp.justification.toLowerCase();
          if (tp.isBold) textSpan.style.fontWeight = 'bold';
          if (tp.isItalic) textSpan.style.fontStyle = 'italic';
          if (tp.shadowColor) {
            textSpan.style.textShadow = `${tp.shadowOffset.x}px ${tp.shadowOffset.y}px 2px ${tp.shadowColor}`;
          }
          if (tp.autoWrap) {
            textSpan.style.wordWrap = 'break-word';
            textSpan.style.whiteSpace = 'normal';
          } else {
            textSpan.style.whiteSpace = 'nowrap';
          }
          el.appendChild(textSpan);
        }
        break;
      }
      case 'Image': {
        const ip = widget.imageProps;
        if (ip && ip.imageSource) {
          const img = document.createElement('img');
          img.src = ip.imageSource;
          img.style.width = '100%';
          img.style.height = '100%';
          if (ip.stretch === 'ScaleToFit') img.style.objectFit = 'contain';
          else if (ip.stretch === 'ScaleToFill') img.style.objectFit = 'cover';
          else if (ip.stretch === 'Fill') img.style.objectFit = 'fill';
          else img.style.objectFit = 'none';
          if (ip.tintColor && ip.tintColor !== '#ffffff') {
            // Use CSS filter for tint approximation
            el.style.backgroundColor = ip.tintColor;
            img.style.mixBlendMode = 'multiply';
          }
          el.appendChild(img);
        } else {
          el.style.backgroundColor = ip?.tintColor || '#444';
        }
        break;
      }
      case 'Button': {
        const bp = widget.buttonProps;
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'auto';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        if (bp) {
          el.style.backgroundColor = bp.normalColor;
          if (bp.borderRadius > 0) el.style.borderRadius = `${bp.borderRadius}px`;
          if (bp.borderWidth > 0) {
            el.style.border = `${bp.borderWidth}px solid ${bp.borderColor || '#888'}`;
          }
          // Hover / active states via mouseover/mouseout
          const normal = bp.normalColor;
          const hovered = bp.hoveredColor;
          const pressed = bp.pressedColor;
          el.addEventListener('mouseenter', () => { el.style.backgroundColor = hovered; });
          el.addEventListener('mouseleave', () => { el.style.backgroundColor = normal; });
          el.addEventListener('mousedown', () => { el.style.backgroundColor = pressed; });
          el.addEventListener('mouseup', () => { el.style.backgroundColor = hovered; });
        }
        break;
      }
      case 'ProgressBar': {
        const pp = widget.progressBarProps;
        el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.style.backgroundColor = pp?.backgroundColor || '#333';
        if (pp?.borderRadius) el.style.borderRadius = `${pp.borderRadius}px`;
        // Fill bar
        const fill = document.createElement('div');
        fill.dataset.progressFill = 'true';
        const pct = Math.max(0, Math.min(1, pp?.percent ?? 0));
        fill.style.cssText = `position:absolute; top:0; left:0; height:100%; width:${pct * 100}%; background:${pp?.fillColor || '#4a9eff'}; transition:width 0.2s;`;
        if (pp?.borderRadius) fill.style.borderRadius = `${pp.borderRadius}px`;
        el.appendChild(fill);
        el.dataset.progressPercent = String(pct);
        break;
      }
      case 'Slider': {
        const sp = widget.sliderProps;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.pointerEvents = 'auto';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(sp?.minValue ?? 0);
        input.max = String(sp?.maxValue ?? 1);
        input.step = String(sp?.stepSize || 0.01);
        input.value = String(sp?.value ?? 0.5);
        input.style.width = '100%';
        input.style.accentColor = sp?.fillColor || '#4a9eff';
        el.appendChild(input);
        el.dataset.sliderValue = String(sp?.value ?? 0.5);
        input.addEventListener('input', () => {
          el.dataset.sliderValue = input.value;
        });
        break;
      }
      case 'TextBox': {
        const tp = widget.textBoxProps;
        el.style.pointerEvents = 'auto';
        const isMulti = tp?.isMultiline;
        const inputEl = isMulti
          ? document.createElement('textarea')
          : document.createElement('input');
        if (!isMulti && inputEl instanceof HTMLInputElement) inputEl.type = 'text';
        inputEl.dataset.widgetText = 'true';
        inputEl.value = tp?.text || '';
        if (tp?.hintText && 'placeholder' in inputEl) (inputEl as any).placeholder = tp.hintText;
        inputEl.style.cssText = `width:100%;height:100%;box-sizing:border-box;font-size:${tp?.fontSize || 14}px;color:${tp?.color || '#fff'};background:${tp?.backgroundColor || '#222'};border:1px solid ${tp?.borderColor || '#555'};padding:4px 8px;resize:none;`;
        if (tp?.isReadOnly) inputEl.readOnly = true;
        el.appendChild(inputEl);
        break;
      }
      case 'CheckBox': {
        const cp = widget.checkBoxProps;
        el.style.pointerEvents = 'auto';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = cp?.isChecked || false;
        const size = cp?.checkSize || 20;
        input.style.cssText = `width:${size}px;height:${size}px;accent-color:${cp?.checkedColor || '#4a9eff'};cursor:pointer;`;
        el.appendChild(input);
        el.dataset.checkboxChecked = String(input.checked);
        input.addEventListener('change', () => {
          el.dataset.checkboxChecked = String(input.checked);
        });
        break;
      }
      case 'ComboBox': {
        const cp = widget.comboBoxProps;
        el.style.pointerEvents = 'auto';
        const select = document.createElement('select');
        select.style.cssText = `width:100%;height:100%;font-size:${cp?.fontSize || 14}px;color:${cp?.color || '#fff'};background:${cp?.backgroundColor || '#222'};border:1px solid #555;padding:4px;`;
        if (cp?.options) {
          for (const opt of cp.options) {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
          }
          if (cp.selectedIndex >= 0 && cp.selectedIndex < cp.options.length) {
            select.selectedIndex = cp.selectedIndex;
          }
        }
        select.dataset.widgetText = 'true';
        el.appendChild(select);
        break;
      }
      case 'CircularThrobber': {
        el.style.cssText = 'display:flex;align-items:center;justify-content:center;';
        const spinner = document.createElement('div');
        spinner.style.cssText = `
          width:24px; height:24px; border:3px solid #555;
          border-top-color:#4a9eff; border-radius:50%;
          animation: __feather_spin 0.8s linear infinite;
        `;
        el.appendChild(spinner);
        // Inject keyframes if not already present
        if (!document.getElementById('__feather_ui_keyframes')) {
          const style = document.createElement('style');
          style.id = '__feather_ui_keyframes';
          style.textContent = '@keyframes __feather_spin { to { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
        break;
      }
      case 'WidgetSwitcher':
        el.style.position = 'relative';
        // Only first child visible by default — handled when children are appended
        break;
    }

    return el;
  }

  /**
   * Apply slot positioning (CanvasPanel absolute positioning, or flex sizing).
   */
  private _applySlotStyles(el: HTMLElement, widget: RuntimeWidgetNode, parentEl: HTMLElement): void {
    const slot = widget.slot;
    const parentType = parentEl.dataset.widgetType;

    if (parentType === 'CanvasPanel' || parentEl.style.position === 'relative') {
      // Absolute positioning within canvas panel
      const anchor = slot.anchor;
      const isStretchX = anchor.minX !== anchor.maxX;
      const isStretchY = anchor.minY !== anchor.maxY;

      el.style.position = 'absolute';

      if (isStretchX) {
        el.style.left = `calc(${anchor.minX * 100}% + ${slot.offsetX}px)`;
        el.style.right = `calc(${(1 - anchor.maxX) * 100}% - ${slot.offsetX}px)`;
      } else {
        el.style.left = `calc(${anchor.minX * 100}% + ${slot.offsetX}px - ${slot.alignment.x * slot.sizeX}px)`;
        el.style.width = `${slot.sizeX}px`;
      }

      if (isStretchY) {
        el.style.top = `calc(${anchor.minY * 100}% + ${slot.offsetY}px)`;
        el.style.bottom = `calc(${(1 - anchor.maxY) * 100}% - ${slot.offsetY}px)`;
      } else {
        el.style.top = `calc(${anchor.minY * 100}% + ${slot.offsetY}px - ${slot.alignment.y * slot.sizeY}px)`;
        el.style.height = `${slot.sizeY}px`;
      }

      el.style.zIndex = String(slot.zOrder);
    } else if (parentType === 'VerticalBox' || parentType === 'HorizontalBox') {
      // Flex child
      if (slot.sizeMode === 'Fill') {
        el.style.flex = String(slot.fillWeight);
      } else if (slot.sizeMode === 'Auto') {
        el.style.flex = '0 0 auto';
      } else {
        // Custom
        if (parentType === 'HorizontalBox') {
          el.style.width = `${slot.sizeX}px`;
        } else {
          el.style.height = `${slot.sizeY}px`;
        }
      }
    }

    // Apply padding
    if (slot.padding) {
      el.style.paddingLeft = `${slot.padding.left}px`;
      el.style.paddingTop = `${slot.padding.top}px`;
      el.style.paddingRight = `${slot.padding.right}px`;
      el.style.paddingBottom = `${slot.padding.bottom}px`;
    }
  }

  /**
   * Apply visibility state.
   */
  private _applyVisibility(el: HTMLElement, widget: RuntimeWidgetNode): void {
    switch (widget.visibility) {
      case 'Visible':
        el.style.display = '';
        // Don't reset pointer-events - preserve what was set in _createWidgetElement
        // (interactive elements like buttons need pointer-events: auto)
        break;
      case 'Collapsed':
        el.style.display = 'none';
        break;
      case 'Hidden':
        el.style.visibility = 'hidden';
        break;
      case 'HitTestInvisible':
        el.style.pointerEvents = 'none';
        break;
      case 'SelfHitTestInvisible':
        el.style.pointerEvents = 'none';
        break;
    }
    el.dataset.widgetVisible = widget.visibility === 'Visible' ? 'true' : 'false';
  }

  /**
   * Apply render transform (translate, scale, rotate with pivot).
   */
  private _applyRenderTransform(el: HTMLElement, widget: RuntimeWidgetNode): void {
    const parts: string[] = [];
    if (widget.renderTranslation.x !== 0 || widget.renderTranslation.y !== 0) {
      parts.push(`translate(${widget.renderTranslation.x}px, ${widget.renderTranslation.y}px)`);
    }
    if (widget.renderAngle !== 0) {
      parts.push(`rotate(${widget.renderAngle}deg)`);
    }
    if (widget.renderScale.x !== 1 || widget.renderScale.y !== 1) {
      parts.push(`scale(${widget.renderScale.x}, ${widget.renderScale.y})`);
    }
    if (parts.length > 0) {
      el.style.transform = parts.join(' ');
      el.style.transformOrigin = `${widget.renderPivot.x * 100}% ${widget.renderPivot.y * 100}%`;
    }
  }

  // ── Widget State Access API ────────────────────────────────

  /**
   * Generate code to capture variables from compiled widget code.
   * Extracts all __var_* variable declarations and stores them in state.
   */
  private _generateVariableCaptureCode(compiledCode: string): string {
    const varMatches = compiledCode.match(/let __var_(\w+)/g);
    if (!varMatches) return '';

    const captures: string[] = [];
    for (const match of varMatches) {
      const varName = match.replace('let __var_', '');
      captures.push(`__widgetState.__variables['${varName}'] = { get: () => __var_${varName}, set: (v) => { __var_${varName} = v; } };`);
    }
    return captures.join('\n');
  }

  /**
   * Generate code to capture functions from compiled widget code.
   * Extracts all __fn_* function declarations and stores them in state.
   */
  private _generateFunctionCaptureCode(compiledCode: string): string {
    const funcMatches = compiledCode.match(/function __fn_(\w+)/g);
    if (!funcMatches) return '';

    const captures: string[] = [];
    for (const match of funcMatches) {
      const funcName = match.replace('function __fn_', '');
      captures.push(`__widgetState.__functions['${funcName}'] = __fn_${funcName};`);
    }
    return captures.join('\n');
  }

  /**
   * Generate code to capture custom events from compiled widget code.
   * Extracts all __custom_evt_* function declarations and stores them in state.
   */
  private _generateEventCaptureCode(compiledCode: string): string {
    const eventMatches = compiledCode.match(/function __custom_evt_(\w+)/g);
    if (!eventMatches) return '';

    const captures: string[] = [];
    for (const match of eventMatches) {
      const eventName = match.replace('function __custom_evt_', '');
      // Store the event function using its sanitized name as the key
      captures.push(`__widgetState.__events['${eventName}'] = __custom_evt_${eventName};`);
    }
    return captures.join('\n');
  }

  /**
   * Get a variable value from a widget instance.
   * Usage from compiled code: __uiManager.getWidgetVariable(widgetHandle, 'Counter')
   */
  getWidgetVariable(handle: string, varName: string): any {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] getWidgetVariable: widget handle "${handle}" not found`);
      return undefined;
    }
    const varAccessor = inst.state.__variables?.[varName];
    if (!varAccessor) {
      console.warn(`[UIManager] getWidgetVariable: variable "${varName}" not found in widget "${inst.blueprint.name}"`);
      return undefined;
    }
    return varAccessor.get();
  }

  /**
   * Set a variable value on a widget instance.
   * Usage from compiled code: __uiManager.setWidgetVariable(widgetHandle, 'Counter', 42)
   */
  setWidgetVariable(handle: string, varName: string, value: any): void {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] setWidgetVariable: widget handle "${handle}" not found`);
      return;
    }
    const varAccessor = inst.state.__variables?.[varName];
    if (!varAccessor) {
      console.warn(`[UIManager] setWidgetVariable: variable "${varName}" not found in widget "${inst.blueprint.name}"`);
      return;
    }
    varAccessor.set(value);
    console.log(`[UIManager] Set widget "${inst.blueprint.name}" variable "${varName}" = ${value}`);
  }

  /**
   * Call a function on a widget instance.
   * Usage from compiled code: __uiManager.callWidgetFunction(widgetHandle, 'MyFunction', arg1, arg2, ...)
   */
  callWidgetFunction(handle: string, funcName: string, ...args: any[]): any {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] callWidgetFunction: widget handle "${handle}" not found`);
      return undefined;
    }
    const func = inst.state.__functions?.[funcName];
    if (!func || typeof func !== 'function') {
      console.warn(`[UIManager] callWidgetFunction: function "${funcName}" not found in widget "${inst.blueprint.name}"`);
      return undefined;
    }
    console.log(`[UIManager] Calling widget "${inst.blueprint.name}" function "${funcName}" with args:`, args);
    return func(...args);
  }

  /**
   * Call a custom event on a widget instance.
   * Events are similar to functions but are meant to be triggered from external code.
   * Usage from compiled code: __uiManager.callWidgetEvent(widgetHandle, 'OnPlayerDied', ...eventParams)
   */
  callWidgetEvent(handle: string, eventName: string, ...args: any[]): void {
    const inst = this._instances.get(handle);
    if (!inst) {
      console.warn(`[UIManager] callWidgetEvent: widget handle "${handle}" not found`);
      return;
    }
    // Sanitize the event name to match the compiled function name
    const sanitizedName = eventName.replace(/[^a-zA-Z0-9_]/g, '_');
    const eventFunc = inst.state.__events?.[sanitizedName];
    if (!eventFunc || typeof eventFunc !== 'function') {
      console.warn(`[UIManager] callWidgetEvent: event "${eventName}" (sanitized: "${sanitizedName}") not found in widget "${inst.blueprint.name}"`);
      console.log(`[UIManager] Available events:`, Object.keys(inst.state.__events || {}));
      return;
    }
    console.log(`[UIManager] Triggering widget "${inst.blueprint.name}" event "${eventName}" with args:`, args);
    eventFunc(...args);
  }
}
