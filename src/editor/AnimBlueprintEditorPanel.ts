// ============================================================
//  AnimBlueprintEditorPanel — Visual editor for Animation Blueprints
//  Tabs: Animation Graph (state machine) | Event Graph (variables)
//  State machine: canvas-based node/edge graph with drag/drop
//  Transitions: click-to-create, condition editor
//  Blend Spaces: inline 1D editor with axis + samples
// ============================================================

import type {
  AnimBlueprintAsset,
  AnimStateData,
  AnimTransitionData,
  AnimStateMachineData,
  BlendSpace1D,
  AnimEventVariable,
  AnimStateOutputType,
} from './AnimBlueprintData';
import {
  defaultAnimState,
  defaultTransition,
  defaultBlendSpace1D,
} from './AnimBlueprintData';
import { MeshAssetManager } from './MeshAsset';

type EditorTab = 'animGraph' | 'eventGraph' | 'blendSpaces';

export class AnimBlueprintEditorPanel {
  private _container: HTMLElement;
  private _asset: AnimBlueprintAsset;
  private _meshManager: MeshAssetManager | null = null;
  private _onSave?: () => void;

  private _tabBar!: HTMLElement;
  private _contentArea!: HTMLElement;
  private _activeTab: EditorTab = 'animGraph';

  // --- State Machine Graph ---
  private _canvas!: HTMLCanvasElement;
  private _ctx!: CanvasRenderingContext2D;
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1;
  private _isPanning = false;
  private _panStartX = 0;
  private _panStartY = 0;

  // State node drag
  private _dragState: AnimStateData | null = null;
  private _dragOffsetX = 0;
  private _dragOffsetY = 0;

  // Transition creation mode
  private _linkingFrom: AnimStateData | null = null;

  // Selected items
  private _selectedStateId: string | null = null;
  private _selectedTransitionId: string | null = null;

  // Properties panel (right side)
  private _propsPanel!: HTMLElement;

  // Animation frame handle
  private _animFrame = 0;

  constructor(
    container: HTMLElement,
    asset: AnimBlueprintAsset,
    onSave?: () => void,
  ) {
    this._container = container;
    this._asset = asset;
    this._onSave = onSave;
    this._build();
  }

  setMeshManager(mgr: MeshAssetManager): void {
    this._meshManager = mgr;
  }

  dispose(): void {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
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
    this._tabBar.className = 'anim-bp-tab-bar';
    this._container.appendChild(this._tabBar);

    // Content area
    this._contentArea = document.createElement('div');
    this._contentArea.className = 'anim-bp-content';
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
      { key: 'animGraph', label: 'Animation Graph', icon: '🎬' },
      { key: 'eventGraph', label: 'Event Variables', icon: '📊' },
      { key: 'blendSpaces', label: 'Blend Spaces', icon: '📈' },
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

    // Toolbar buttons
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

    switch (tab) {
      case 'animGraph':
        this._buildAnimGraphTab();
        break;
      case 'eventGraph':
        this._buildEventGraphTab();
        break;
      case 'blendSpaces':
        this._buildBlendSpacesTab();
        break;
    }
  }

  // ============================================================
  //  Animation Graph Tab — State Machine Visual Editor
  // ============================================================

  private _buildAnimGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    // Left: Canvas
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'anim-graph-canvas-container';
    canvasContainer.style.flex = '1';
    canvasContainer.style.position = 'relative';
    canvasContainer.style.overflow = 'hidden';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'anim-graph-canvas';
    canvasContainer.appendChild(this._canvas);
    wrapper.appendChild(canvasContainer);

    // Right: Properties
    this._propsPanel = document.createElement('div');
    this._propsPanel.className = 'anim-graph-props';
    this._propsPanel.style.width = '260px';
    this._propsPanel.style.overflowY = 'auto';
    wrapper.appendChild(this._propsPanel);

    this._contentArea.appendChild(wrapper);

    // Setup canvas events
    this._setupCanvasEvents(canvasContainer);

    // Size canvas
    this._resizeCanvas(canvasContainer);
    const ro = new ResizeObserver(() => this._resizeCanvas(canvasContainer));
    ro.observe(canvasContainer);

    // Initial render
    this._renderGraph();
    this._renderProps();
  }

  private _resizeCanvas(container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = rect.width + 'px';
    this._canvas.style.height = rect.height + 'px';
    this._ctx = this._canvas.getContext('2d')!;
    this._ctx.scale(dpr, dpr);
    this._renderGraph();
  }

  private _setupCanvasEvents(container: HTMLElement): void {
    const canvas = this._canvas;

    // Context menu — add state
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      this._showCanvasContextMenu(e.clientX, e.clientY, pos.x, pos.y);
    });

    // Mouse down — select / start drag / start link
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle mouse or Alt+click → pan
        this._isPanning = true;
        this._panStartX = e.offsetX - this._panX;
        this._panStartY = e.offsetY - this._panY;
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;

      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      const hit = this._hitTestState(pos.x, pos.y);

      if (e.shiftKey && hit) {
        // Shift+click on state → start linking
        this._linkingFrom = hit;
        return;
      }

      if (hit) {
        this._selectedStateId = hit.id;
        this._selectedTransitionId = null;
        this._dragState = hit;
        this._dragOffsetX = pos.x - hit.posX;
        this._dragOffsetY = pos.y - hit.posY;
        this._renderGraph();
        this._renderProps();
        return;
      }

      // Check transition hit
      const tHit = this._hitTestTransition(pos.x, pos.y);
      if (tHit) {
        this._selectedTransitionId = tHit.id;
        this._selectedStateId = null;
        this._renderGraph();
        this._renderProps();
        return;
      }

      // Deselect
      this._selectedStateId = null;
      this._selectedTransitionId = null;
      this._renderGraph();
      this._renderProps();
    });

    // Mouse move — drag node or pan
    canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this._panX = e.offsetX - this._panStartX;
        this._panY = e.offsetY - this._panStartY;
        this._renderGraph();
        return;
      }

      if (this._dragState) {
        const pos = this._canvasToWorld(e.offsetX, e.offsetY);
        this._dragState.posX = pos.x - this._dragOffsetX;
        this._dragState.posY = pos.y - this._dragOffsetY;
        this._asset.touch();
        this._renderGraph();
        return;
      }

      if (this._linkingFrom) {
        this._renderGraph();
        // Draw temp edge to cursor
        const ctx = this._ctx;
        const from = this._linkingFrom;
        const fromScreen = this._worldToCanvas(from.posX + 75, from.posY + 20);
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Mouse up — finish drag / link
    canvas.addEventListener('mouseup', (e) => {
      if (this._isPanning) {
        this._isPanning = false;
        canvas.style.cursor = 'default';
        return;
      }

      if (this._linkingFrom) {
        const pos = this._canvasToWorld(e.offsetX, e.offsetY);
        const target = this._hitTestState(pos.x, pos.y);
        if (target && target.id !== this._linkingFrom.id) {
          // Create transition
          const t = defaultTransition(this._linkingFrom.id, target.id, '');
          this._asset.stateMachine.transitions.push(t);
          this._selectedTransitionId = t.id;
          this._selectedStateId = null;
          this._asset.touch();
        }
        this._linkingFrom = null;
        this._renderGraph();
        this._renderProps();
        return;
      }

      this._dragState = null;
    });

    // Zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const oldZoom = this._zoom;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this._zoom = Math.max(0.2, Math.min(3, this._zoom * delta));

      // Zoom toward cursor
      const mx = e.offsetX;
      const my = e.offsetY;
      this._panX = mx - (mx - this._panX) * (this._zoom / oldZoom);
      this._panY = my - (my - this._panY) * (this._zoom / oldZoom);

      this._renderGraph();
    });

    // Double-click — open state/transition editor
    canvas.addEventListener('dblclick', (e) => {
      const pos = this._canvasToWorld(e.offsetX, e.offsetY);
      const hit = this._hitTestState(pos.x, pos.y);
      if (hit) {
        this._selectedStateId = hit.id;
        this._selectedTransitionId = null;
        this._renderGraph();
        this._renderProps();
      }
    });
  }

  // ---- Coordinate transforms ----

  private _canvasToWorld(cx: number, cy: number): { x: number; y: number } {
    return {
      x: (cx - this._panX) / this._zoom,
      y: (cy - this._panY) / this._zoom,
    };
  }

  private _worldToCanvas(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this._zoom + this._panX,
      y: wy * this._zoom + this._panY,
    };
  }

  // ---- Hit testing ----

  private _hitTestState(wx: number, wy: number): AnimStateData | null {
    const nodeW = 150;
    const nodeH = 40;
    for (const state of this._asset.stateMachine.states) {
      if (wx >= state.posX && wx <= state.posX + nodeW &&
          wy >= state.posY && wy <= state.posY + nodeH) {
        return state;
      }
    }
    return null;
  }

  private _hitTestTransition(wx: number, wy: number): AnimTransitionData | null {
    const sm = this._asset.stateMachine;
    for (const t of sm.transitions) {
      const from = sm.states.find(s => s.id === t.fromStateId);
      const to = sm.states.find(s => s.id === t.toStateId);
      if (!from || !to) continue;

      // Check distance to line segment center
      const fx = from.posX + 75;
      const fy = from.posY + 20;
      const tx = to.posX + 75;
      const ty = to.posY + 20;
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      const dist = Math.sqrt((wx - mx) ** 2 + (wy - my) ** 2);
      if (dist < 15) return t;
    }
    return null;
  }

  // ---- Render the state machine graph ----

  private _renderGraph(): void {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this._canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(ctx, w, h);

    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    const sm = this._asset.stateMachine;

    // Draw transitions (edges)
    for (const t of sm.transitions) {
      this._drawTransition(ctx, t, sm);
    }

    // Draw states (nodes)
    for (const state of sm.states) {
      this._drawStateNode(ctx, state, sm);
    }

    ctx.restore();

    // Linking indicator
    if (this._linkingFrom) {
      ctx.fillStyle = '#ff0';
      ctx.font = '11px sans-serif';
      ctx.fillText('Shift-drag to target state...', 10, h - 10);
    }
  }

  private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const step = 30 * this._zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const offX = this._panX % step;
    const offY = this._panY % step;
    for (let x = offX; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offY; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  private _drawStateNode(ctx: CanvasRenderingContext2D, state: AnimStateData, sm: AnimStateMachineData): void {
    const x = state.posX;
    const y = state.posY;
    const w = 150;
    const h = 40;
    const r = 6;
    const isEntry = sm.entryStateId === state.id;
    const isSelected = this._selectedStateId === state.id;

    // Rounded rect
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

    // Fill
    if (isEntry) {
      ctx.fillStyle = '#2d5a27';
    } else {
      ctx.fillStyle = isSelected ? '#3a3a5c' : '#2a2a44';
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? '#7c8fff' : (isEntry ? '#4caf50' : '#555');
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Entry marker
    if (isEntry) {
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.moveTo(x - 12, y + h / 2 - 6);
      ctx.lineTo(x - 2, y + h / 2);
      ctx.lineTo(x - 12, y + h / 2 + 6);
      ctx.closePath();
      ctx.fill();
    }

    // State name
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.name, x + w / 2, y + h / 2 - (state.animationName ? 4 : 0), w - 10);

    // Subtitle (animation name or blend space)
    if (state.animationName || state.outputType === 'blendSpace1D') {
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      const subtitle = state.outputType === 'blendSpace1D'
        ? '📈 Blend Space 1D'
        : state.animationName || 'No animation';
      ctx.fillText(subtitle, x + w / 2, y + h / 2 + 10, w - 10);
    }

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  private _drawTransition(ctx: CanvasRenderingContext2D, t: AnimTransitionData, sm: AnimStateMachineData): void {
    const from = sm.states.find(s => s.id === t.fromStateId);
    const to = sm.states.find(s => s.id === t.toStateId);
    if (!from || !to) return;

    const fx = from.posX + 75;
    const fy = from.posY + 20;
    const tx = to.posX + 75;
    const ty = to.posY + 20;
    const isSelected = this._selectedTransitionId === t.id;

    // Edge line
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = isSelected ? '#ff0' : '#888';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(ty - fy, tx - fx);
    const headLen = 10;
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    ctx.beginPath();
    ctx.moveTo(mx + headLen * Math.cos(angle), my + headLen * Math.sin(angle));
    ctx.lineTo(mx - headLen * Math.cos(angle - Math.PI / 6), my - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(mx - headLen * Math.cos(angle + Math.PI / 6), my - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#ff0' : '#888';
    ctx.fill();

    // Condition label
    if (t.conditionExpr) {
      ctx.fillStyle = isSelected ? '#ff0' : '#aaa';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.conditionExpr, mx, my - 8, 120);
      ctx.textAlign = 'start';
    }
  }

  // ---- Canvas Context Menu ----

  private _showCanvasContextMenu(clientX: number, clientY: number, worldX: number, worldY: number): void {
    // Remove existing
    document.querySelectorAll('.anim-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu anim-context-menu';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';

    // Check if right-clicking on a state
    const hitState = this._hitTestState(worldX, worldY);

    if (hitState) {
      this._addCtxItem(menu, '🔄 Set as Entry State', () => {
        this._asset.stateMachine.entryStateId = hitState.id;
        this._asset.touch();
        this._renderGraph();
      });

      this._addCtxItem(menu, '➡ Add Transition From Here', () => {
        this._linkingFrom = hitState;
      });

      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      const del = this._addCtxItem(menu, '🗑 Delete State', () => {
        const sm = this._asset.stateMachine;
        sm.states = sm.states.filter(s => s.id !== hitState.id);
        sm.transitions = sm.transitions.filter(t => t.fromStateId !== hitState.id && t.toStateId !== hitState.id);
        if (sm.entryStateId === hitState.id) {
          sm.entryStateId = sm.states[0]?.id ?? '';
        }
        if (this._selectedStateId === hitState.id) this._selectedStateId = null;
        this._asset.touch();
        this._renderGraph();
        this._renderProps();
      });
      del.style.color = 'var(--danger, #ff5555)';
    } else {
      this._addCtxItem(menu, '➕ Add State', () => {
        const name = prompt('State name:', 'NewState');
        if (!name) return;
        const state = defaultAnimState(name, worldX, worldY);
        this._asset.stateMachine.states.push(state);
        if (this._asset.stateMachine.states.length === 1) {
          this._asset.stateMachine.entryStateId = state.id;
        }
        this._asset.touch();
        this._renderGraph();
      });

      this._addCtxItem(menu, '⭐ Add Wildcard Transition', () => {
        const targets = this._asset.stateMachine.states;
        if (targets.length === 0) return;
        // Prompt for target
        const targetName = prompt('Target state name:', targets[0].name);
        const target = targets.find(s => s.name === targetName);
        if (!target) { alert('State not found'); return; }
        const t = defaultTransition('*', target.id, '');
        t.priority = 100;
        this._asset.stateMachine.transitions.push(t);
        this._asset.touch();
        this._renderGraph();
      });
    }

    // Check if right-clicking on a transition
    const hitTransition = this._hitTestTransition(worldX, worldY);
    if (hitTransition && !hitState) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      const del = this._addCtxItem(menu, '🗑 Delete Transition', () => {
        this._asset.stateMachine.transitions = this._asset.stateMachine.transitions.filter(t => t.id !== hitTransition.id);
        if (this._selectedTransitionId === hitTransition.id) this._selectedTransitionId = null;
        this._asset.touch();
        this._renderGraph();
        this._renderProps();
      });
      del.style.color = 'var(--danger, #ff5555)';
    }

    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  private _addCtxItem(menu: HTMLElement, text: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = text;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      onClick();
    });
    menu.appendChild(item);
    return item;
  }

  // ============================================================
  //  Properties Panel (right side of Anim Graph)
  // ============================================================

  private _renderProps(): void {
    this._propsPanel.innerHTML = '';

    if (this._selectedStateId) {
      const state = this._asset.stateMachine.states.find(s => s.id === this._selectedStateId);
      if (state) this._renderStateProps(state);
    } else if (this._selectedTransitionId) {
      const t = this._asset.stateMachine.transitions.find(t => t.id === this._selectedTransitionId);
      if (t) this._renderTransitionProps(t);
    } else {
      this._renderAnimBPProps();
    }
  }

  /** Properties for the AnimBP itself (no selection) */
  private _renderAnimBPProps(): void {
    const p = this._propsPanel;
    p.innerHTML = `<div class="anim-props-header">Animation Blueprint</div>`;

    // Target Skeleton Mesh
    this._addPropRow(p, 'Target Mesh', () => {
      const sel = document.createElement('select');
      sel.className = 'prop-input';
      sel.innerHTML = '<option value="">-- None --</option>';
      if (this._meshManager) {
        for (const ma of this._meshManager.assets) {
          if (ma.skeleton) {
            const opt = document.createElement('option');
            opt.value = ma.id;
            opt.textContent = ma.name;
            if (ma.id === this._asset.targetSkeletonMeshAssetId) opt.selected = true;
            sel.appendChild(opt);
          }
        }
      }
      sel.addEventListener('change', () => {
        this._asset.targetSkeletonMeshAssetId = sel.value;
        this._asset.touch();
      });
      return sel;
    });

    // Stats
    const sm = this._asset.stateMachine;
    const stats = document.createElement('div');
    stats.className = 'anim-props-stats';
    stats.innerHTML = `
      <div>${sm.states.length} states</div>
      <div>${sm.transitions.length} transitions</div>
      <div>${this._asset.blendSpaces1D.length} blend spaces</div>
      <div>${this._asset.eventVariables.length} variables</div>
    `;
    p.appendChild(stats);

    // Help
    const help = document.createElement('div');
    help.className = 'anim-props-help';
    help.innerHTML = `
      <b>Controls:</b><br>
      • Right-click → Add State<br>
      • Shift+drag → Create Transition<br>
      • Alt+drag / Middle mouse → Pan<br>
      • Scroll → Zoom<br>
      • Click state/transition → Select
    `;
    p.appendChild(help);
  }

  /** Properties for a selected state */
  private _renderStateProps(state: AnimStateData): void {
    const p = this._propsPanel;
    p.innerHTML = `<div class="anim-props-header">State: ${state.name}</div>`;

    // State name
    this._addPropRow(p, 'Name', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.value = state.name;
      inp.addEventListener('change', () => {
        state.name = inp.value.trim() || state.name;
        this._asset.touch();
        this._renderGraph();
      });
      return inp;
    });

    // Output type
    this._addPropRow(p, 'Output Type', () => {
      const sel = document.createElement('select');
      sel.className = 'prop-input';
      const types: AnimStateOutputType[] = ['singleAnimation', 'blendSpace1D'];
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t === 'singleAnimation' ? 'Single Animation' : 'Blend Space 1D';
        if (t === state.outputType) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        state.outputType = sel.value as AnimStateOutputType;
        this._asset.touch();
        this._renderGraph();
        this._renderProps(); // Refresh to show relevant fields
      });
      return sel;
    });

    if (state.outputType === 'singleAnimation') {
      // Animation picker
      this._addPropRow(p, 'Animation', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        sel.innerHTML = '<option value="">-- None --</option>';
        const animations = this._getAvailableAnimations();
        for (const anim of animations) {
          const opt = document.createElement('option');
          opt.value = anim.name;
          opt.textContent = anim.name;
          if (anim.name === state.animationName) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.animationName = sel.value;
          state.animationId = '';  // Will be resolved at runtime
          this._asset.touch();
          this._renderGraph();
        });
        return sel;
      });

      // Loop
      this._addPropRow(p, 'Loop', () => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.loop;
        cb.addEventListener('change', () => {
          state.loop = cb.checked;
          this._asset.touch();
        });
        return cb;
      });

      // Play Rate
      this._addPropRow(p, 'Play Rate', () => {
        const inp = document.createElement('input');
        inp.className = 'prop-input';
        inp.type = 'number';
        inp.step = '0.1';
        inp.min = '0';
        inp.value = String(state.playRate);
        inp.addEventListener('change', () => {
          state.playRate = parseFloat(inp.value) || 1;
          this._asset.touch();
        });
        return inp;
      });
    } else if (state.outputType === 'blendSpace1D') {
      // Blend space picker
      this._addPropRow(p, 'Blend Space', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        sel.innerHTML = '<option value="">-- None --</option>';
        for (const bs of this._asset.blendSpaces1D) {
          const opt = document.createElement('option');
          opt.value = bs.id;
          opt.textContent = bs.name;
          if (bs.id === state.blendSpace1DId) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpace1DId = sel.value;
          this._asset.touch();
        });
        return sel;
      });

      // Axis variable
      this._addPropRow(p, 'Axis Variable', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const v of this._asset.eventVariables) {
          if (v.type !== 'number') continue;
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          if (v.name === state.blendSpaceAxisVar) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpaceAxisVar = sel.value;
          this._asset.touch();
        });
        return sel;
      });
    }
  }

  /** Properties for a selected transition */
  private _renderTransitionProps(t: AnimTransitionData): void {
    const p = this._propsPanel;
    const sm = this._asset.stateMachine;
    const fromState = sm.states.find(s => s.id === t.fromStateId);
    const toState = sm.states.find(s => s.id === t.toStateId);
    const fromName = t.fromStateId === '*' ? '* (Any)' : (fromState?.name ?? '???');
    const toName = toState?.name ?? '???';

    p.innerHTML = `<div class="anim-props-header">Transition</div>
      <div class="anim-props-subtitle">${fromName} → ${toName}</div>`;

    // Condition expression
    this._addPropRow(p, 'Condition', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.value = t.conditionExpr;
      inp.placeholder = 'e.g. speed > 10';
      inp.addEventListener('change', () => {
        t.conditionExpr = inp.value;
        this._asset.touch();
        this._renderGraph();
      });
      return inp;
    });

    // Available variables hint
    const hint = document.createElement('div');
    hint.className = 'anim-props-hint';
    hint.innerHTML = '<b>Variables:</b> ' +
      this._asset.eventVariables.map(v => `<code>${v.name}</code>`).join(', ') +
      '<br><b>Ops:</b> ==  !=  &gt;  &lt;  &gt;=  &lt;=  &&  ||  !';
    p.appendChild(hint);

    // Blend time
    this._addPropRow(p, 'Blend Time (s)', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '0.05';
      inp.min = '0';
      inp.value = String(t.blendTime);
      inp.addEventListener('change', () => {
        t.blendTime = parseFloat(inp.value) || 0;
        this._asset.touch();
      });
      return inp;
    });

    // Priority
    this._addPropRow(p, 'Priority', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '1';
      inp.value = String(t.priority);
      inp.addEventListener('change', () => {
        t.priority = parseInt(inp.value) || 0;
        this._asset.touch();
      });
      return inp;
    });
  }

  // ---- UI helpers ----

  private _addPropRow(container: HTMLElement, label: string, createWidget: () => HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'anim-prop-row';

    const lbl = document.createElement('label');
    lbl.className = 'anim-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const widget = createWidget();
    row.appendChild(widget);

    container.appendChild(row);
  }

  private _getAvailableAnimations(): Array<{ name: string; id: string }> {
    if (!this._meshManager) return [];
    const targetId = this._asset.targetSkeletonMeshAssetId;
    if (!targetId) {
      // Return all animations from all meshes
      const result: Array<{ name: string; id: string }> = [];
      for (const ma of this._meshManager.assets) {
        const anims = this._meshManager.getAnimationsForMesh(ma.id);
        for (const a of anims) {
          result.push({ name: a.assetName, id: a.assetId });
        }
      }
      return result;
    }
    const anims = this._meshManager.getAnimationsForMesh(targetId);
    return anims.map(a => ({ name: a.assetName, id: a.assetId }));
  }

  // ============================================================
  //  Event Variables Tab
  // ============================================================

  private _buildEventGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'anim-event-graph';
    wrapper.style.padding = '16px';
    wrapper.style.overflowY = 'auto';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = 'Event Variables';
    wrapper.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'anim-props-help';
    desc.innerHTML = `These variables are automatically computed each frame from the character's state 
      and used in transition conditions. The runtime <code>AnimationInstance</code> auto-populates 
      <code>speed</code>, <code>isInAir</code>, <code>isCrouching</code>, etc. from the CharacterController.<br><br>
      Add custom variables here for use in transition conditions.`;
    wrapper.appendChild(desc);

    // Add Variable button
    const addBtn = document.createElement('button');
    addBtn.className = 'toolbar-btn';
    addBtn.textContent = '+ Add Variable';
    addBtn.style.marginTop = '8px';
    addBtn.addEventListener('click', () => {
      const name = prompt('Variable name:', 'myVar');
      if (!name) return;
      this._asset.eventVariables.push({
        name: name.trim(),
        type: 'number',
        defaultValue: 0,
      });
      this._asset.touch();
      this._buildEventGraphTab();
    });
    wrapper.appendChild(addBtn);

    // Variable list
    const table = document.createElement('div');
    table.className = 'anim-var-table';
    table.style.marginTop = '12px';

    for (let i = 0; i < this._asset.eventVariables.length; i++) {
      const v = this._asset.eventVariables[i];
      const row = document.createElement('div');
      row.className = 'anim-var-row';

      // Name
      const nameInp = document.createElement('input');
      nameInp.className = 'prop-input';
      nameInp.value = v.name;
      nameInp.style.flex = '1';
      nameInp.addEventListener('change', () => {
        v.name = nameInp.value.trim() || v.name;
        this._asset.touch();
      });
      row.appendChild(nameInp);

      // Type
      const typeSel = document.createElement('select');
      typeSel.className = 'prop-input';
      typeSel.style.width = '80px';
      for (const t of ['number', 'boolean', 'string'] as const) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === v.type) opt.selected = true;
        typeSel.appendChild(opt);
      }
      typeSel.addEventListener('change', () => {
        v.type = typeSel.value as 'number' | 'boolean' | 'string';
        if (v.type === 'number') v.defaultValue = 0;
        else if (v.type === 'boolean') v.defaultValue = false;
        else v.defaultValue = '';
        this._asset.touch();
        this._buildEventGraphTab();
      });
      row.appendChild(typeSel);

      // Default value
      if (v.type === 'boolean') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!v.defaultValue;
        cb.addEventListener('change', () => {
          v.defaultValue = cb.checked;
          this._asset.touch();
        });
        row.appendChild(cb);
      } else {
        const defInp = document.createElement('input');
        defInp.className = 'prop-input';
        defInp.style.width = '60px';
        defInp.type = v.type === 'number' ? 'number' : 'text';
        defInp.value = String(v.defaultValue);
        defInp.addEventListener('change', () => {
          v.defaultValue = v.type === 'number' ? parseFloat(defInp.value) || 0 : defInp.value;
          this._asset.touch();
        });
        row.appendChild(defInp);
      }

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'prop-btn-danger';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete variable';
      delBtn.addEventListener('click', () => {
        this._asset.eventVariables.splice(i, 1);
        this._asset.touch();
        this._buildEventGraphTab();
      });
      row.appendChild(delBtn);

      table.appendChild(row);
    }

    wrapper.appendChild(table);
    this._contentArea.appendChild(wrapper);
  }

  // ============================================================
  //  Blend Spaces Tab
  // ============================================================

  private _buildBlendSpacesTab(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'anim-blend-spaces';
    wrapper.style.padding = '16px';
    wrapper.style.overflowY = 'auto';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = 'Blend Spaces';
    wrapper.appendChild(header);

    // Add Blend Space button
    const addBtn = document.createElement('button');
    addBtn.className = 'toolbar-btn';
    addBtn.textContent = '+ New 1D Blend Space';
    addBtn.style.marginTop = '8px';
    addBtn.addEventListener('click', () => {
      const name = prompt('Blend Space name:', 'BS_Locomotion');
      if (!name) return;
      const bs = defaultBlendSpace1D(name);
      this._asset.blendSpaces1D.push(bs);
      this._asset.touch();
      this._buildBlendSpacesTab();
    });
    wrapper.appendChild(addBtn);

    // List
    for (const bs of this._asset.blendSpaces1D) {
      const card = document.createElement('div');
      card.className = 'anim-bs-card';

      // Header
      const cardHeader = document.createElement('div');
      cardHeader.className = 'anim-bs-header';
      cardHeader.innerHTML = `<span>📈 ${bs.name}</span>`;

      const delBsBtn = document.createElement('button');
      delBsBtn.className = 'prop-btn-danger';
      delBsBtn.textContent = '🗑';
      delBsBtn.title = 'Delete Blend Space';
      delBsBtn.addEventListener('click', () => {
        this._asset.blendSpaces1D = this._asset.blendSpaces1D.filter(b => b.id !== bs.id);
        this._asset.touch();
        this._buildBlendSpacesTab();
      });
      cardHeader.appendChild(delBsBtn);
      card.appendChild(cardHeader);

      // Axis config
      this._addPropRow(card, 'Axis Label', () => {
        const inp = document.createElement('input');
        inp.className = 'prop-input';
        inp.value = bs.axisLabel;
        inp.addEventListener('change', () => { bs.axisLabel = inp.value; this._asset.touch(); });
        return inp;
      });

      const rangeRow = document.createElement('div');
      rangeRow.className = 'anim-prop-row';
      rangeRow.innerHTML = '<label class="anim-prop-label">Range</label>';
      const minInp = document.createElement('input');
      minInp.className = 'prop-input';
      minInp.type = 'number';
      minInp.style.width = '60px';
      minInp.value = String(bs.axisMin);
      minInp.addEventListener('change', () => { bs.axisMin = parseFloat(minInp.value) || 0; this._asset.touch(); });
      rangeRow.appendChild(minInp);
      const dash = document.createElement('span');
      dash.textContent = ' – ';
      dash.style.color = '#888';
      rangeRow.appendChild(dash);
      const maxInp = document.createElement('input');
      maxInp.className = 'prop-input';
      maxInp.type = 'number';
      maxInp.style.width = '60px';
      maxInp.value = String(bs.axisMax);
      maxInp.addEventListener('change', () => { bs.axisMax = parseFloat(maxInp.value) || 1; this._asset.touch(); });
      rangeRow.appendChild(maxInp);
      card.appendChild(rangeRow);

      // Samples
      const samplesHeader = document.createElement('div');
      samplesHeader.className = 'anim-bs-samples-header';
      samplesHeader.textContent = 'Samples';
      card.appendChild(samplesHeader);

      for (let i = 0; i < bs.samples.length; i++) {
        const s = bs.samples[i];
        const sRow = document.createElement('div');
        sRow.className = 'anim-var-row';

        // Animation picker
        const animSel = document.createElement('select');
        animSel.className = 'prop-input';
        animSel.style.flex = '1';
        animSel.innerHTML = '<option value="">-- None --</option>';
        const animations = this._getAvailableAnimations();
        for (const a of animations) {
          const opt = document.createElement('option');
          opt.value = a.name;
          opt.textContent = a.name;
          if (a.name === s.animationName) opt.selected = true;
          animSel.appendChild(opt);
        }
        animSel.addEventListener('change', () => {
          s.animationName = animSel.value;
          this._asset.touch();
        });
        sRow.appendChild(animSel);

        // Position
        const posInp = document.createElement('input');
        posInp.className = 'prop-input';
        posInp.type = 'number';
        posInp.style.width = '60px';
        posInp.value = String(s.position);
        posInp.title = 'Position on axis';
        posInp.addEventListener('change', () => {
          s.position = parseFloat(posInp.value) || 0;
          this._asset.touch();
        });
        sRow.appendChild(posInp);

        // Delete
        const delSampleBtn = document.createElement('button');
        delSampleBtn.className = 'prop-btn-danger';
        delSampleBtn.textContent = '✕';
        delSampleBtn.addEventListener('click', () => {
          bs.samples.splice(i, 1);
          this._asset.touch();
          this._buildBlendSpacesTab();
        });
        sRow.appendChild(delSampleBtn);

        card.appendChild(sRow);
      }

      // Add sample button
      const addSampleBtn = document.createElement('button');
      addSampleBtn.className = 'toolbar-btn';
      addSampleBtn.style.marginTop = '4px';
      addSampleBtn.style.fontSize = '11px';
      addSampleBtn.textContent = '+ Add Sample';
      addSampleBtn.addEventListener('click', () => {
        bs.samples.push({
          animationId: '',
          animationName: '',
          position: bs.samples.length > 0 ? bs.samples[bs.samples.length - 1].position + 100 : 0,
        });
        this._asset.touch();
        this._buildBlendSpacesTab();
      });
      card.appendChild(addSampleBtn);

      wrapper.appendChild(card);
    }

    this._contentArea.appendChild(wrapper);
  }
}
