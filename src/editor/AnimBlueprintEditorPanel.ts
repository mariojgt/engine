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
  AnimStateOutputType,
  AnimTransitionRuleGroup,
  AnimTransitionRule,
  TransitionBlendProfile,
} from './AnimBlueprintData';
import {
  defaultAnimState,
  defaultTransition,
  defaultBlendSpace1D,
} from './AnimBlueprintData';
import type { BlueprintVariable, VarType } from './BlueprintData';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshAssetManager } from './MeshAsset';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import { loadMeshFromAsset } from './MeshImporter';
import { AnimationInstance } from '../engine/AnimationInstance';

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

  // Event graph Rete editor cleanup
  private _eventGraphCleanup: (() => void) | null = null;
  private _eventGraphCompile: (() => void) | null = null;

  // ---- Preview viewport (Anim Graph tab) ----
  private _previewContainer: HTMLElement | null = null;
  private _previewScene: THREE.Scene | null = null;
  private _previewCamera: THREE.PerspectiveCamera | null = null;
  private _previewRenderer: THREE.WebGLRenderer | null = null;
  private _previewControls: OrbitControls | null = null;
  private _previewRoot: THREE.Object3D | null = null;
  private _previewMixer: THREE.AnimationMixer | null = null;
  private _previewAnimInstance: AnimationInstance | null = null;
  private _previewAnimations: THREE.AnimationClip[] = [];
  private _previewClock: THREE.Clock = new THREE.Clock();
  private _previewFrame = 0;
  private _previewResizeObserver: ResizeObserver | null = null;
  private _previewMeshAssetId: string | null = null;
  private _previewLoadToken = 0;
  private _previewBaseScale = 1;
  private _previewUserScale = 1;
  private _previewAutoFit = true;
  private _previewDebugEl: HTMLElement | null = null;
  private _previewDebugLast = 0;
  private _graphOverlayLast = 0;

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
    this._disposePreview();
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
    }
    this._eventGraphCompile = null;
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
    this._disposePreview();
    // Clean up Rete editor when switching away from event graph
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
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

      const { fx, fy, tx, ty } = this._getTransitionAnchors(sm, t, from, to);
      const bundle = this._getTransitionBundle(sm, t);
      const ctrl = this._getTransitionControlPoint(fx, fy, tx, ty, bundle.index, bundle.total);

      // Label hit-test
      const tpos = 0.6;
      const p = this._quadPoint(fx, fy, ctrl.x, ctrl.y, tx, ty, tpos);
      const label = this._getTransitionLabel(t);
      if (label) {
        const metrics = this._ctx.measureText(label);
        const lw = Math.min(160, metrics.width + 10);
        const lh = 14;
        const lx = p.x - lw / 2;
        const ly = p.y - 22;
        if (wx >= lx && wx <= lx + lw && wy >= ly && wy <= ly + lh) {
          return t;
        }
      }

      let minDist = Infinity;
      for (let i = 0; i <= 20; i++) {
        const tt = i / 20;
        const p = this._quadPoint(fx, fy, ctrl.x, ctrl.y, tx, ty, tt);
        const d = Math.hypot(wx - p.x, wy - p.y);
        if (d < minDist) minDist = d;
      }
      const hitRadius = 12 / Math.max(0.25, this._zoom);
      if (minDist < hitRadius) return t;
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

    // Live variable overlay (from preview anim instance)
    this._drawVariableOverlay(ctx, w, h);

    // Linking indicator
    if (this._linkingFrom) {
      ctx.fillStyle = '#ff0';
      ctx.font = '11px sans-serif';
      ctx.fillText('Shift-drag to target state...', 10, h - 10);
    }
  }

  private _drawVariableOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this._previewAnimInstance) return;
    const vars = Array.from(this._previewAnimInstance.variables.entries());
    if (vars.length === 0) return;

    const max = Math.min(8, vars.length);
    const padding = 8;
    const lineH = 14;
    const boxW = 220;
    const boxH = padding * 2 + lineH * (max + 1);
    const x = 10;
    const y = 10;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = '#ddd';
    ctx.font = '11px sans-serif';
    ctx.fillText('Anim Variables', x + padding, y + padding + 10);

    for (let i = 0; i < max; i++) {
      const [k, v] = vars[i];
      const val = typeof v === 'number' ? v.toFixed(3) : String(v);
      ctx.fillText(`${k}: ${val}`, x + padding, y + padding + 10 + lineH * (i + 1));
    }
    ctx.restore();
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
    if (state.animationName || state.outputType === 'blendSpace1D' || state.outputType === 'blendSpace2D') {
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      const subtitle = state.outputType === 'blendSpace1D'
        ? '📈 Blend Space 1D'
        : state.outputType === 'blendSpace2D'
          ? '🧭 Blend Space 2D'
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

    const { fx, fy, tx, ty } = this._getTransitionAnchors(sm, t, from, to);
    const isSelected = this._selectedTransitionId === t.id;

    const bundle = this._getTransitionBundle(sm, t);
    const ctrl = this._getTransitionControlPoint(fx, fy, tx, ty, bundle.index, bundle.total);

    // Edge line
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, tx, ty);
    ctx.strokeStyle = isSelected ? '#ff0' : '#888';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // Arrowhead
    const tpos = 0.6;
    const p = this._quadPoint(fx, fy, ctrl.x, ctrl.y, tx, ty, tpos);
    const tan = this._quadTangent(fx, fy, ctrl.x, ctrl.y, tx, ty, tpos);
    const angle = Math.atan2(tan.y, tan.x);
    const headLen = 10;
    const mx = p.x;
    const my = p.y;
    ctx.beginPath();
    ctx.moveTo(mx + headLen * Math.cos(angle), my + headLen * Math.sin(angle));
    ctx.lineTo(mx - headLen * Math.cos(angle - Math.PI / 6), my - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(mx - headLen * Math.cos(angle + Math.PI / 6), my - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#ff0' : '#888';
    ctx.fill();

    // Condition label
    const label = this._getTransitionLabel(t);
    if (label) {
      ctx.font = '10px sans-serif';
      const metrics = ctx.measureText(label);
      const lw = Math.min(160, metrics.width + 10);
      const lh = 14;
      const lx = mx - lw / 2;
      const ly = my - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(lx, ly, lw, lh);
      ctx.fillStyle = isSelected ? '#ff0' : '#ddd';
      ctx.textAlign = 'center';
      ctx.fillText(label, mx, ly + 10, 150);
      ctx.textAlign = 'start';
    }
  }

  private _getTransitionBundle(sm: AnimStateMachineData, t: AnimTransitionData): { index: number; total: number } {
    const list = sm.transitions.filter(x =>
      (x.fromStateId === t.fromStateId && x.toStateId === t.toStateId) ||
      (x.fromStateId === t.toStateId && x.toStateId === t.fromStateId)
    );
    const index = Math.max(0, list.findIndex(x => x.id === t.id));
    return { index, total: Math.max(1, list.length) };
  }

  private _getTransitionAnchors(
    sm: AnimStateMachineData,
    t: AnimTransitionData,
    from: AnimStateData,
    to: AnimStateData,
  ): { fx: number; fy: number; tx: number; ty: number } {
    const nodeW = 150;
    const nodeH = 40;
    const fromCenterX = from.posX + nodeW / 2;
    const fromCenterY = from.posY + nodeH / 2;
    const toCenterX = to.posX + nodeW / 2;
    const toCenterY = to.posY + nodeH / 2;
    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    // Prefer horizontal ports; fall back to vertical if mostly above/below.
    if (Math.abs(dx) >= Math.abs(dy)) {
      const fromOffset = this._getPortOffset(sm, from.id, t.id, true, 'horizontal');
      const toOffset = this._getPortOffset(sm, to.id, t.id, false, 'horizontal');
      const fx = from.posX + (dx >= 0 ? nodeW : 0);
      const fy = from.posY + nodeH / 2 + fromOffset;
      const tx = to.posX + (dx >= 0 ? 0 : nodeW);
      const ty = to.posY + nodeH / 2 + toOffset;
      return { fx, fy, tx, ty };
    }

    const fromOffset = this._getPortOffset(sm, from.id, t.id, true, 'vertical');
    const toOffset = this._getPortOffset(sm, to.id, t.id, false, 'vertical');
    const fx = from.posX + nodeW / 2 + fromOffset;
    const fy = from.posY + (dy >= 0 ? nodeH : 0);
    const tx = to.posX + nodeW / 2 + toOffset;
    const ty = to.posY + (dy >= 0 ? 0 : nodeH);
    return { fx, fy, tx, ty };
  }

  private _getPortOffset(
    sm: AnimStateMachineData,
    stateId: string,
    transitionId: string,
    outgoing: boolean,
    axis: 'horizontal' | 'vertical',
  ): number {
    const nodeW = 150;
    const nodeH = 40;
    const list = sm.transitions.filter(t => outgoing ? t.fromStateId === stateId : t.toStateId === stateId);
    const total = Math.max(1, list.length);
    const index = Math.max(0, list.findIndex(t => t.id === transitionId));
    const max = axis === 'horizontal' ? (nodeH / 2 - 6) : (nodeW / 2 - 12);
    const step = Math.min(12, (max * 2) / total);
    const offset = (index - (total - 1) / 2) * step;
    return Math.max(-max, Math.min(max, offset));
  }

  private _getTransitionControlPoint(
    fx: number, fy: number, tx: number, ty: number,
    index: number, total: number,
  ): { x: number; y: number } {
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const step = Math.min(70, Math.max(22, len * 0.22));
    const bundleOffset = (index - (total - 1) / 2) * step;
    const curvature = Math.min(80, Math.max(18, len * 0.18));
    const curveSign = dy >= 0 ? 1 : -1;
    return {
      x: mx + nx * bundleOffset,
      y: my + ny * bundleOffset + curveSign * curvature,
    };
  }

  private _quadPoint(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number,
  ): { x: number; y: number } {
    const it = 1 - t;
    const x = it * it * x0 + 2 * it * t * x1 + t * t * x2;
    const y = it * it * y0 + 2 * it * t * y1 + t * t * y2;
    return { x, y };
  }

  private _quadTangent(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number,
  ): { x: number; y: number } {
    const x = 2 * (1 - t) * (x1 - x0) + 2 * t * (x2 - x1);
    const y = 2 * (1 - t) * (y1 - y0) + 2 * t * (y2 - y1);
    return { x, y };
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
          const opt = document.createElement('option');
          opt.value = ma.id;
          const animCount = ma.animations.length;
          opt.textContent = animCount > 0 ? `${ma.name} (${animCount} anims)` : ma.name;
          if (ma.id === this._asset.targetSkeletonMeshAssetId) opt.selected = true;
          sel.appendChild(opt);
        }
      }
      sel.addEventListener('change', () => {
        this._asset.targetSkeletonMeshAssetId = sel.value;
        if (this._meshManager) {
          const target = this._meshManager.getAsset(sel.value);
          this._asset.targetSkeletonId = target?.skeleton?.assetId ?? '';
        } else {
          this._asset.targetSkeletonId = '';
        }
        this._asset.touch();
        this._ensureEntryStateAnimation();
        this._refreshPreview(true);
      });
      return sel;
    });

    if (this._meshManager) {
      if (this._meshManager.assets.length === 0) {
        const warn = document.createElement('div');
        warn.className = 'anim-props-hint';
        warn.textContent = 'No mesh assets found. Import a mesh with animations to enable preview.';
        p.appendChild(warn);
      }
    }

    // Preview viewport
    this._buildPreviewSection(p);

    // Stats
    const sm = this._asset.stateMachine;
    const stats = document.createElement('div');
    stats.className = 'anim-props-stats';
    stats.innerHTML = `
      <div>${sm.states.length} states</div>
      <div>${sm.transitions.length} transitions</div>
      <div>${this._asset.blendSpaces1D.length} blend spaces</div>
      <div>${this._asset.blueprintData.variables.length} variables</div>
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
      const types: AnimStateOutputType[] = ['singleAnimation', 'blendSpace1D', 'blendSpace2D'];
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t === 'singleAnimation'
          ? 'Single Animation'
          : t === 'blendSpace1D'
            ? 'Blend Space 1D'
            : 'Blend Space 2D';
        if (t === state.outputType) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        state.outputType = sel.value as AnimStateOutputType;
        this._asset.touch();
        this._renderGraph();
        this._renderProps(); // Refresh to show relevant fields
        this._restartPreviewInstance();
      });
      return sel;
    });

    // Sync group
    this._addPropRow(p, 'Sync Group', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.placeholder = 'e.g. Locomotion';
      inp.value = state.syncGroup || '';
      inp.addEventListener('change', () => {
        state.syncGroup = inp.value.trim();
        this._asset.touch();
      });
      return inp;
    });

    this._addPropRow(p, 'Sync Role', () => {
      const sel = document.createElement('select');
      sel.className = 'prop-input';
      for (const role of ['leader', 'follower'] as const) {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = role;
        if ((state.syncRole || 'leader') === role) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        state.syncRole = sel.value as 'leader' | 'follower';
        this._asset.touch();
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
          this._restartPreviewInstance();
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
          this._restartPreviewInstance();
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
          this._restartPreviewInstance();
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
          this._restartPreviewInstance();
        });
        return sel;
      });

      // Axis variable
      this._addPropRow(p, 'Axis Variable', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const v of this._getEventGraphVars()) {
          if (v.type !== 'Float') continue;
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          if (v.name === state.blendSpaceAxisVar) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpaceAxisVar = sel.value;
          this._asset.touch();
          this._restartPreviewInstance();
        });
        return sel;
      });
    } else if (state.outputType === 'blendSpace2D') {
      // Blend space 2D picker
      this._addPropRow(p, 'Blend Space', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        sel.innerHTML = '<option value="">-- None --</option>';
        for (const bs of this._asset.blendSpaces2D) {
          const opt = document.createElement('option');
          opt.value = bs.id;
          opt.textContent = bs.name;
          if (bs.id === state.blendSpace2DId) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpace2DId = sel.value;
          this._asset.touch();
          this._restartPreviewInstance();
        });
        return sel;
      });

      // Axis X variable
      this._addPropRow(p, 'Axis X Variable', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const v of this._getEventGraphVars()) {
          if (v.type !== 'Float') continue;
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          if (v.name === state.blendSpaceAxisVarX) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpaceAxisVarX = sel.value;
          this._asset.touch();
          this._restartPreviewInstance();
        });
        return sel;
      });

      // Axis Y variable
      this._addPropRow(p, 'Axis Y Variable', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const v of this._getEventGraphVars()) {
          if (v.type !== 'Float') continue;
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          if (v.name === state.blendSpaceAxisVarY) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpaceAxisVarY = sel.value;
          this._asset.touch();
          this._restartPreviewInstance();
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

    this._ensureTransitionDefaults(t);

    const vars = this._getEventGraphVars();
    const groups = t.rules || [];

    const header = document.createElement('div');
    header.className = 'anim-props-hint';
    header.textContent = 'Transition Rules:';
    p.appendChild(header);

    if (groups.length > 1) {
      this._addPropRow(p, 'Group Logic', () => {
        const sel = document.createElement('select');
        sel.className = 'prop-input';
        for (const op of ['AND', 'OR'] as const) {
          const opt = document.createElement('option');
          opt.value = op;
          opt.textContent = op;
          if ((t.ruleLogic || 'AND') === op) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          t.ruleLogic = sel.value as 'AND' | 'OR';
          this._asset.touch();
          this._renderGraph();
        });
        return sel;
      });
    }

    const buildRuleRow = (group: AnimTransitionRuleGroup, rule: AnimTransitionRule): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'anim-rule-row';

      if (rule.kind === 'expr') {
        const exprInput = document.createElement('input');
        exprInput.className = 'prop-input';
        exprInput.placeholder = 'expression';
        exprInput.value = rule.expr;
        exprInput.addEventListener('change', () => {
          rule.expr = exprInput.value;
          this._asset.touch();
          this._renderGraph();
        });
        row.appendChild(exprInput);
      } else {
        const varSel = document.createElement('select');
        varSel.className = 'prop-input';
        varSel.style.maxWidth = '120px';
        for (const v of vars) {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          if (v.name === rule.varName) opt.selected = true;
          varSel.appendChild(opt);
        }
        varSel.addEventListener('change', () => {
          const v = vars.find(x => x.name === varSel.value);
          if (!v) return;
          rule.varName = v.name;
          rule.valueType = v.type as 'Float' | 'Boolean' | 'String';
          if (rule.valueType === 'Boolean') rule.value = false;
          else if (rule.valueType === 'String') rule.value = '';
          else rule.value = 0;
          this._asset.touch();
          this._renderProps();
          this._renderGraph();
        });
        row.appendChild(varSel);

        const opSel = document.createElement('select');
        opSel.className = 'prop-input';
        opSel.style.maxWidth = '80px';
        const ops = rule.valueType === 'Boolean'
          ? ['==', '!=']
          : rule.valueType === 'String'
            ? ['==', '!=', 'contains']
            : ['==', '!=', '>', '<', '>=', '<='];
        for (const op of ops) {
          const opt = document.createElement('option');
          opt.value = op;
          opt.textContent = op;
          if (op === rule.op) opt.selected = true;
          opSel.appendChild(opt);
        }
        opSel.addEventListener('change', () => {
          rule.op = opSel.value as any;
          this._asset.touch();
          this._renderGraph();
        });
        row.appendChild(opSel);

        if (rule.valueType === 'Boolean') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!rule.value;
          cb.addEventListener('change', () => {
            rule.value = cb.checked;
            this._asset.touch();
            this._renderGraph();
          });
          row.appendChild(cb);
        } else {
          const valInput = document.createElement('input');
          valInput.className = 'prop-input';
          valInput.style.maxWidth = '90px';
          valInput.type = rule.valueType === 'Float' ? 'number' : 'text';
          valInput.value = rule.valueType === 'Float' ? String(rule.value ?? 0) : String(rule.value ?? '');
          valInput.addEventListener('change', () => {
            rule.value = rule.valueType === 'Float'
              ? (parseFloat(valInput.value) || 0)
              : valInput.value;
            this._asset.touch();
            this._renderGraph();
          });
          row.appendChild(valInput);
        }
      }

      const del = document.createElement('button');
      del.className = 'prop-btn-danger';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        group.rules = group.rules.filter(r => r.id !== rule.id);
        this._asset.touch();
        this._renderProps();
        this._renderGraph();
      });
      row.appendChild(del);

      return row;
    };

    for (const group of groups) {
      const groupBox = document.createElement('div');
      groupBox.className = 'anim-rule-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'anim-rule-group-header';
      groupHeader.textContent = 'Rule Group';

      const groupOp = document.createElement('select');
      groupOp.className = 'prop-input';
      groupOp.style.maxWidth = '70px';
      for (const op of ['AND', 'OR'] as const) {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        if (group.op === op) opt.selected = true;
        groupOp.appendChild(opt);
      }
      groupOp.addEventListener('change', () => {
        group.op = groupOp.value as 'AND' | 'OR';
        this._asset.touch();
        this._renderGraph();
      });
      groupHeader.appendChild(groupOp);
      groupBox.appendChild(groupHeader);

      for (const rule of group.rules) {
        groupBox.appendChild(buildRuleRow(group, rule));
      }

      const addRuleBtn = document.createElement('button');
      addRuleBtn.className = 'toolbar-btn';
      addRuleBtn.textContent = '+ Add Rule';
      addRuleBtn.addEventListener('click', () => {
        if (vars.length === 0) {
          group.rules.push({ id: this._newRuleId(), kind: 'expr', expr: 'true' });
        } else {
          const v = vars[0];
          group.rules.push({
            id: this._newRuleId(),
            kind: 'compare',
            varName: v.name,
            op: '==',
            value: v.type === 'Boolean' ? false : v.type === 'String' ? '' : 0,
            valueType: v.type as 'Float' | 'Boolean' | 'String',
          });
        }
        this._asset.touch();
        this._renderProps();
        this._renderGraph();
      });
      groupBox.appendChild(addRuleBtn);

      p.appendChild(groupBox);
    }

    const addGroupBtn = document.createElement('button');
    addGroupBtn.className = 'toolbar-btn';
    addGroupBtn.textContent = '+ Add Group';
    addGroupBtn.addEventListener('click', () => {
      const group: AnimTransitionRuleGroup = {
        id: this._newRuleId(),
        op: 'AND',
        rules: [],
      };
      t.rules!.push(group);
      this._asset.touch();
      this._renderProps();
      this._renderGraph();
    });
    p.appendChild(addGroupBtn);

    // Blend profile
    this._addPropRow(p, 'Blend Time (s)', () => {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.type = 'number';
      inp.step = '0.05';
      inp.min = '0';
      inp.value = String(t.blendProfile?.time ?? t.blendTime ?? 0);
      inp.addEventListener('change', () => {
        const v = parseFloat(inp.value) || 0;
        if (!t.blendProfile) t.blendProfile = { time: v, curve: 'linear' };
        t.blendProfile.time = v;
        t.blendTime = v;
        this._asset.touch();
      });
      return inp;
    });

    this._addPropRow(p, 'Blend Curve', () => {
      const sel = document.createElement('select');
      sel.className = 'prop-input';
      for (const c of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if ((t.blendProfile?.curve ?? 'linear') === c) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        if (!t.blendProfile) t.blendProfile = { time: t.blendTime ?? 0.25, curve: 'linear' };
        t.blendProfile.curve = sel.value as TransitionBlendProfile['curve'];
        this._asset.touch();
      });
      return sel;
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
      return [];
    }
    const anims = this._meshManager.getAnimationsForMesh(targetId);
    return anims.map(a => ({ name: a.assetName, id: a.assetId }));
  }

  private _getEventGraphVars(): BlueprintVariable[] {
    return this._asset.blueprintData.variables.filter(v =>
      v.type === 'Float' || v.type === 'Boolean' || v.type === 'String'
    );
  }

  private _ensureTransitionDefaults(t: AnimTransitionData): void {
    if (!t.rules) {
      t.rules = [{ id: this._newRuleId(), op: 'AND', rules: [] }];
    }
    if (!t.ruleLogic) t.ruleLogic = 'AND';
    if (!t.blendProfile) t.blendProfile = { time: t.blendTime ?? 0.25, curve: 'linear' };
  }

  private _newRuleId(): string {
    return 'tr_' + Math.random().toString(36).slice(2, 8);
  }

  private _getTransitionLabel(t: AnimTransitionData): string {
    if (!t.rules || t.rules.length === 0) return t.conditionExpr || '';
    const groupLabels = t.rules.map(g => {
      const ruleLabels = g.rules.map(r => {
        if (r.kind === 'expr') return r.expr;
        const rhs = r.valueType === 'String' ? JSON.stringify(r.value) : String(r.value);
        return `${r.varName} ${r.op} ${rhs}`;
      });
      return ruleLabels.join(` ${g.op} `);
    });
    const logic = t.ruleLogic || 'AND';
    return groupLabels.join(` ${logic} `);
  }

  private _ensureEntryStateAnimation(): void {
    const entryId = this._asset.stateMachine.entryStateId;
    const entry = this._asset.stateMachine.states.find(s => s.id === entryId);
    if (!entry || entry.outputType !== 'singleAnimation') return;
    if (entry.animationName) return;

    const anims = this._getAvailableAnimations();
    if (anims.length === 0) return;

    entry.animationName = anims[0].name;
    entry.animationId = anims[0].id;
    this._asset.touch();
  }

  // ============================================================
  //  Preview Viewport (Anim Graph tab)
  // ============================================================

  private _buildPreviewSection(container: HTMLElement): void {
    const section = document.createElement('div');
    section.className = 'anim-bp-preview';

    const header = document.createElement('div');
    header.className = 'anim-bp-preview-header';
    header.innerHTML = '<span>Preview</span>';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'toolbar-btn';
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.addEventListener('click', () => this._refreshPreview(true));
    header.appendChild(refreshBtn);

    section.appendChild(header);

    const viewport = document.createElement('div');
    viewport.className = 'anim-bp-preview-viewport';
    section.appendChild(viewport);

    const controls = document.createElement('div');
    controls.className = 'anim-bp-preview-controls';

    const scaleLabel = document.createElement('div');
    scaleLabel.className = 'anim-bp-preview-label';
    scaleLabel.textContent = 'Scale';
    controls.appendChild(scaleLabel);

    const scaleInput = document.createElement('input');
    scaleInput.type = 'range';
    scaleInput.min = '0.1';
    scaleInput.max = '4';
    scaleInput.step = '0.05';
    scaleInput.value = String(this._previewUserScale);
    scaleInput.className = 'anim-bp-preview-range';
    scaleInput.addEventListener('input', () => {
      this._previewUserScale = parseFloat(scaleInput.value) || 1;
      this._applyPreviewScale();
    });
    controls.appendChild(scaleInput);

    const autoFitLabel = document.createElement('label');
    autoFitLabel.className = 'anim-bp-preview-toggle';
    const autoFit = document.createElement('input');
    autoFit.type = 'checkbox';
    autoFit.checked = this._previewAutoFit;
    autoFit.addEventListener('change', () => {
      this._previewAutoFit = autoFit.checked;
      this._applyPreviewScale();
      if (this._previewRoot) this._framePreviewToObject(this._previewRoot);
    });
    autoFitLabel.appendChild(autoFit);
    autoFitLabel.appendChild(document.createTextNode('Auto-fit'));
    controls.appendChild(autoFitLabel);

    section.appendChild(controls);

    const hint = document.createElement('div');
    hint.className = 'anim-bp-preview-hint';
    hint.textContent = 'Select a target mesh to preview animations.';
    section.appendChild(hint);

    const debug = document.createElement('div');
    debug.className = 'anim-bp-preview-debug';
    debug.textContent = 'Debug: waiting for preview...';
    section.appendChild(debug);

    container.appendChild(section);

    this._previewContainer = viewport;
    this._previewDebugEl = debug;
    this._initPreviewRenderer(viewport, hint);
    this._refreshPreview(false);
  }

  private _initPreviewRenderer(container: HTMLElement, hintEl: HTMLElement): void {
    this._disposePreview();
    this._previewContainer = container;

    try {
      this._previewScene = new THREE.Scene();
      this._previewScene.background = new THREE.Color(0x12141c);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.7);
      this._previewScene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(3, 6, 4);
      this._previewScene.add(key);
      const fill = new THREE.DirectionalLight(0xaec9ff, 0.45);
      fill.position.set(-3, 2, -2);
      this._previewScene.add(fill);

      this._previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
      this._previewCamera.position.set(2.8, 2.2, 2.8);
      this._previewCamera.lookAt(0, 1, 0);

      this._previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this._previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this._previewRenderer.toneMappingExposure = 1.2;
      this._previewRenderer.setPixelRatio(window.devicePixelRatio);

      const w = container.clientWidth || 240;
      const h = container.clientHeight || 180;
      this._previewRenderer.setSize(w, h);
      container.innerHTML = '';
      container.appendChild(this._previewRenderer.domElement);

      this._previewControls = new OrbitControls(this._previewCamera, this._previewRenderer.domElement);
      this._previewControls.enableDamping = true;
      this._previewControls.dampingFactor = 0.1;
      this._previewControls.target.set(0, 1, 0);

      this._previewResizeObserver = new ResizeObserver(() => {
        if (!this._previewRenderer || !this._previewCamera || !this._previewContainer) return;
        const rw = this._previewContainer.clientWidth || 240;
        const rh = this._previewContainer.clientHeight || 180;
        this._previewRenderer.setSize(rw, rh);
        this._previewCamera.aspect = rw / rh;
        this._previewCamera.updateProjectionMatrix();
      });
      this._previewResizeObserver.observe(container);

      hintEl.style.display = 'block';
      this._startPreviewLoop();
    } catch (err) {
      console.warn('WebGL not available for AnimBP preview:', err);
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#666;font-size:11px;">WebGL required</div>';
    }
  }

  private _startPreviewLoop(): void {
    if (this._previewFrame) cancelAnimationFrame(this._previewFrame);
    const tick = () => {
      this._previewFrame = requestAnimationFrame(tick);
      if (!this._previewRenderer || !this._previewScene || !this._previewCamera) return;

      const dt = this._previewClock.getDelta();
      if (this._previewAnimInstance) this._previewAnimInstance.update(dt);
      if (this._previewMixer) this._previewMixer.update(dt);
      if (this._previewControls) this._previewControls.update();

      const now = performance.now();
      if (this._previewDebugEl && now - this._previewDebugLast > 200) {
        this._previewDebugLast = now;
        const info = this._previewAnimInstance?.getDebugInfo();
        if (!info) {
          this._previewDebugEl.textContent = 'Debug: no AnimBP instance.';
        } else {
          const clipCount = info.clipNames.length;
          const actionCount = info.actionNames.length;
          this._previewDebugEl.textContent =
            `State: ${info.stateName} | Output: ${info.outputType} | ` +
            `Anim: ${info.animationName || '(none)'} | ` +
            `Clips: ${clipCount} | Actions: ${actionCount}`;
        }
      }

      if (this._activeTab === 'animGraph' && now - this._graphOverlayLast > 200) {
        this._graphOverlayLast = now;
        this._renderGraph();
      }

      this._previewRenderer.render(this._previewScene, this._previewCamera);
    };
    this._previewClock.start();
    tick();
  }

  private _refreshPreview(forceReload: boolean): void {
    if (!this._previewScene || !this._previewContainer) return;
    const targetId = this._asset.targetSkeletonMeshAssetId;
    if (!targetId) {
      this._clearPreviewRoot();
      return;
    }

    if (!forceReload && this._previewMeshAssetId === targetId && this._previewRoot) {
      this._restartPreviewInstance();
      return;
    }

    this._loadPreviewMesh(targetId);
  }

  private async _loadPreviewMesh(meshAssetId: string): Promise<void> {
    if (!this._meshManager || !this._previewScene) return;
    const meshAsset = this._meshManager.getAsset(meshAssetId);
    if (!meshAsset) return;

    const token = ++this._previewLoadToken;
    this._previewMeshAssetId = meshAssetId;

    try {
      const { scene: loadedScene, animations } = await loadMeshFromAsset(meshAsset);
      if (token !== this._previewLoadToken) return;

      // Align clip names with stored asset names (same logic as runtime)
      if (meshAsset.animations.length > 0) {
        for (const clip of animations) {
          const match = meshAsset.animations.find(
            a => a.assetName === clip.name || a.assetName.endsWith('_' + clip.name)
          );
          if (match) clip.name = match.assetName;
        }
      }

      this._clearPreviewRoot();

      const wrapper = new THREE.Group();
      while (loadedScene.children.length > 0) {
        const child = loadedScene.children[0];
        loadedScene.remove(child);
        wrapper.add(child);
      }

      wrapper.updateMatrixWorld(true);
      this._previewScene.add(wrapper);
      this._previewRoot = wrapper;
      this._previewAnimations = animations;

      this._computePreviewBaseScale(wrapper);
      this._applyPreviewScale();
      this._framePreviewToObject(wrapper);
      this._ensureEntryStateAnimation();
      this._restartPreviewInstance();
    } catch (err) {
      console.error('Failed to load AnimBP preview mesh:', err);
    }
  }

  private _restartPreviewInstance(): void {
    if (!this._previewRoot) return;

    if (this._previewMixer) {
      this._previewMixer.stopAllAction();
    }

    if (this._previewAnimations.length === 0) return;

    this._previewMixer = new THREE.AnimationMixer(this._previewRoot);
    this._previewAnimInstance = new AnimationInstance(this._asset, this._previewMixer, this._previewAnimations, null);
    this._previewClock.start();
    if (this._previewDebugEl) this._previewDebugEl.textContent = 'Debug: AnimBP instance created.';
  }

  private _framePreviewToObject(obj: THREE.Object3D): void {
    if (!this._previewCamera || !this._previewControls) return;
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.0;
    this._previewCamera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    this._previewCamera.lookAt(center);
    this._previewControls.target.copy(center);
    this._previewControls.update();
  }

  private _computePreviewBaseScale(obj: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = 1.8;
    this._previewBaseScale = this._previewAutoFit ? (target / maxDim) : 1;
  }

  private _applyPreviewScale(): void {
    if (!this._previewRoot) return;
    if (this._previewAutoFit) {
      this._computePreviewBaseScale(this._previewRoot);
    } else {
      this._previewBaseScale = 1;
    }
    const scale = this._previewBaseScale * this._previewUserScale;
    this._previewRoot.scale.setScalar(scale);
    this._previewRoot.updateMatrixWorld(true);
  }

  private _clearPreviewRoot(): void {
    if (!this._previewScene) return;
    if (this._previewRoot) {
      this._previewScene.remove(this._previewRoot);
      this._disposePreviewObject(this._previewRoot);
      this._previewRoot = null;
    }
    this._previewAnimations = [];
    this._previewMixer = null;
    this._previewAnimInstance = null;
  }

  private _disposePreviewObject(obj: THREE.Object3D): void {
    obj.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose();
        } else if (mat) {
          mat.dispose();
        }
      }
    });
  }

  private _disposePreview(): void {
    if (this._previewFrame) {
      cancelAnimationFrame(this._previewFrame);
      this._previewFrame = 0;
    }
    if (this._previewResizeObserver && this._previewContainer) {
      this._previewResizeObserver.disconnect();
    }
    this._previewResizeObserver = null;

    if (this._previewControls) {
      this._previewControls.dispose();
      this._previewControls = null;
    }

    if (this._previewRenderer) {
      this._previewRenderer.dispose();
      this._previewRenderer = null;
    }

    this._previewScene = null;
    this._previewCamera = null;
    this._previewContainer = null;
    this._previewRoot = null;
    this._previewMixer = null;
    this._previewAnimInstance = null;
    this._previewAnimations = [];
    this._previewMeshAssetId = null;
    this._previewBaseScale = 1;
    this._previewUserScale = 1;
    this._previewAutoFit = true;
    this._previewDebugEl = null;
    this._previewDebugLast = 0;
  }

  // ============================================================
  //  Event Graph Variables Tab
  // ============================================================

  private _buildEventGraphTab(): void {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    // ── Left panel: Event Graph Variables ──
    const varPanel = document.createElement('div');
    varPanel.className = 'anim-event-var-panel';
    varPanel.style.width = '240px';
    varPanel.style.minWidth = '200px';
    varPanel.style.borderRight = '1px solid #333';
    varPanel.style.overflowY = 'auto';
    varPanel.style.padding = '12px';
    varPanel.style.background = '#1a1a2e';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.textContent = 'Event Graph Variables';
    varPanel.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'anim-props-help';
    desc.style.fontSize = '11px';
    desc.style.marginBottom = '8px';
    desc.innerHTML = `Define variables here, then use <b>Set / Get Anim Var</b> nodes
      in the event graph to drive them. State machine transitions read these variables.`;
    varPanel.appendChild(desc);

    // Add Variable button
    const addBtn = document.createElement('button');
    addBtn.className = 'toolbar-btn';
    addBtn.textContent = '+ Add Variable';
    addBtn.style.marginBottom = '8px';
    addBtn.addEventListener('click', () => {
      const name = prompt('Variable name:', 'myVar');
      if (!name) return;
      const cleanName = name.trim();
      if (!cleanName) return;
      this._asset.blueprintData.addVariable(cleanName, 'Float');
      this._asset.touch();
      this._buildEventGraphTabVarList(varTable);
    });
    varPanel.appendChild(addBtn);

    const compileBtn = document.createElement('button');
    compileBtn.className = 'toolbar-btn';
    compileBtn.textContent = 'Compile Graph';
    compileBtn.style.marginBottom = '8px';
    compileBtn.addEventListener('click', () => {
      if (this._eventGraphCompile) {
        console.log(`[AnimBP] Compile requested for ${this._asset.name}`);
        this._eventGraphCompile();
      } else {
        console.warn(`[AnimBP] Compile function not ready for ${this._asset.name}`);
      }
    });
    varPanel.appendChild(compileBtn);

    // Variable table
    const varTable = document.createElement('div');
    varTable.className = 'anim-var-table';
    varPanel.appendChild(varTable);
    this._buildEventGraphTabVarList(varTable);

    wrapper.appendChild(varPanel);

    // ── Right panel: Rete Node Editor ──
    const editorContainer = document.createElement('div');
    editorContainer.style.flex = '1';
    editorContainer.style.position = 'relative';
    editorContainer.style.overflow = 'hidden';
    editorContainer.style.minHeight = '300px';
    wrapper.appendChild(editorContainer);

    this._contentArea.appendChild(wrapper);

    // Mount the Rete node editor using the AnimBP's BlueprintData
    const bp = this._asset.blueprintData;
    this._eventGraphCleanup = mountNodeEditorForAsset(
      editorContainer,
      bp,
      `${this._asset.name} Event Graph`,
      (code: string) => {
        // Store compiled code on the asset for runtime use
        this._asset.compiledCode = code;
        this._asset.touch();
        this._onSave?.();
      },
    );

    // Auto-compile once the editor initializes so compiledCode exists.
    setTimeout(() => {
      const compileFn = (editorContainer as any).__compileAndSave as (() => void) | undefined;
      if (compileFn) {
        this._eventGraphCompile = compileFn;
        console.log(`[AnimBP] Auto-compile on open for ${this._asset.name}`);
        compileFn();
      } else {
        console.warn(`[AnimBP] Auto-compile failed: no compile function for ${this._asset.name}`);
      }
    }, 0);
  }

  /** Build/rebuild the variable list inside the Event Graph tab */
  private _buildEventGraphTabVarList(container: HTMLElement): void {
    container.innerHTML = '';

    const vars = this._getEventGraphVars();
    for (const v of vars) {
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
      for (const t of ['Float', 'Boolean', 'String'] as const) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === v.type) opt.selected = true;
        typeSel.appendChild(opt);
      }
      typeSel.addEventListener('change', () => {
        v.type = typeSel.value as VarType;
        if (v.type === 'Float') v.defaultValue = 0;
        else if (v.type === 'Boolean') v.defaultValue = false;
        else v.defaultValue = '';
        this._asset.touch();
        this._buildEventGraphTabVarList(container);
      });
      row.appendChild(typeSel);

      // Default value
      if (v.type === 'Boolean') {
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
        defInp.type = v.type === 'Float' ? 'number' : 'text';
        defInp.value = String(v.defaultValue);
        defInp.addEventListener('change', () => {
          v.defaultValue = v.type === 'Float' ? parseFloat(defInp.value) || 0 : defInp.value;
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
        this._asset.blueprintData.removeVariable(v.id);
        this._asset.touch();
        this._buildEventGraphTabVarList(container);
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    }
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
