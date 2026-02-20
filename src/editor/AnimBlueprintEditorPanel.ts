// ============================================================
//  AnimBlueprintEditorPanel — Visual editor for Animation Blueprints
//  Tabs: Animation Graph (state machine) | Event Graph (variables)
//  State machine: canvas-based node/edge graph with drag/drop
//  Transitions: click-to-create, condition editor
//  Blend Spaces: inline 1D editor with axis + samples
// ============================================================

import { iconHTML, Icons, ICON_COLORS } from './icons';
import type {
  AnimBlueprintAsset,
  AnimStateData,
  AnimTransitionData,
  AnimStateMachineData,
  BlendSpace1D,
  BlendSpaceSample1D,
  AnimStateOutputType,
  AnimTransitionRuleGroup,
  AnimTransitionRule,
  TransitionBlendProfile,
} from './AnimBlueprintData';
import {
  animUid,
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

  // --- Performance: batched rendering ---
  private _graphDirty = false;
  private _graphRafId = 0;
  private _propsDirty = false;
  private _propsRafId = 0;
  private _transitionBundleCache: Map<string, { index: number; total: number }> | null = null;
  private _transitionBundleCacheKey = '';

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

  // Persistent preview section — survives _renderProps() re-renders
  private _previewSection: HTMLElement | null = null;
  private _previewHintEl: HTMLElement | null = null;
  private _previewInitialised = false;

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
    if (this._graphRafId) cancelAnimationFrame(this._graphRafId);
    if (this._propsRafId) cancelAnimationFrame(this._propsRafId);
    this._graphRafId = 0;
    this._propsRafId = 0;
    this._graphDirty = false;
    this._propsDirty = false;
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
      { key: 'animGraph', label: 'Animation Graph', icon: '▸' },
      { key: 'eventGraph', label: 'Event Variables', icon: '▪' },
      { key: 'blendSpaces', label: 'Blend Spaces', icon: '▴' },
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
      saveBtn.innerHTML = iconHTML(Icons.Save, 12, ICON_COLORS.blue) + ' Save';
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
        this._scheduleGraphRender();
        this._schedulePropsRender();
        return;
      }

      // Check transition hit
      const tHit = this._hitTestTransition(pos.x, pos.y);
      if (tHit) {
        this._selectedTransitionId = tHit.id;
        this._selectedStateId = null;
        this._scheduleGraphRender();
        this._schedulePropsRender();
        return;
      }

      // Deselect
      this._selectedStateId = null;
      this._selectedTransitionId = null;
      this._scheduleGraphRender();
      this._schedulePropsRender();
    });

    // Mouse move — drag node or pan
    canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this._panX = e.offsetX - this._panStartX;
        this._panY = e.offsetY - this._panStartY;
        this._scheduleGraphRender();
        return;
      }

      if (this._dragState) {
        const pos = this._canvasToWorld(e.offsetX, e.offsetY);
        this._dragState.posX = pos.x - this._dragOffsetX;
        this._dragState.posY = pos.y - this._dragOffsetY;
        this._asset.touch();
        this._invalidateTransitionBundleCache();
        this._scheduleGraphRender();
        return;
      }

      if (this._linkingFrom) {
        // Cancel any pending batched render — we need an immediate draw with the link line
        if (this._graphRafId) {
          cancelAnimationFrame(this._graphRafId);
          this._graphRafId = 0;
          this._graphDirty = false;
        }
        this._renderGraphImmediate();
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
          this._invalidateTransitionBundleCache();
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

      this._scheduleGraphRender();
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
    const nodeW = 160;
    const nodeH = 44;
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
    // Build a quick state lookup map to avoid O(n) find() per transition
    const stateMap = new Map<string, AnimStateData>();
    for (const s of sm.states) stateMap.set(s.id, s);

    for (const t of sm.transitions) {
      const from = stateMap.get(t.fromStateId);
      const to = stateMap.get(t.toStateId);
      if (!from || !to) continue;

      const { fx, fy, tx, ty } = this._getTransitionAnchors(sm, t, from, to);

      // Quick bounding-box reject: skip if mouse isn't anywhere near this edge
      const minX = Math.min(fx, tx) - 40;
      const maxX = Math.max(fx, tx) + 40;
      const minY = Math.min(fy, ty) - 60;
      const maxY = Math.max(fy, ty) + 60;
      if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;

      const bundle = this._getTransitionBundle(sm, t);

      // Compute the same canonical offset used in _drawTransition
      const canonFlip = t.fromStateId > t.toStateId ? -1 : 1;
      const dx2 = tx - fx;
      const dy2 = ty - fy;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      const nx2 = (-dy2 / len2) * canonFlip;
      const ny2 = (dx2 / len2) * canonFlip;
      const parallelStep = 16;
      const offset2 = (bundle.index - (bundle.total - 1) / 2) * parallelStep;
      const ofx = fx + nx2 * offset2;
      const ofy = fy + ny2 * offset2;
      const otx = tx + nx2 * offset2;
      const oty = ty + ny2 * offset2;

      // Circle icon hit-test at midpoint of the straight line
      const mpx = (ofx + otx) / 2;
      const mpy = (ofy + oty) / 2;
      const iconR = 13;
      const dxI = wx - mpx;
      const dyI = wy - mpy;
      if (dxI * dxI + dyI * dyI < iconR * iconR) {
        return t;
      }

      // Point-to-line distance hit-test for the straight line
      const hitRadius = 10 / Math.max(0.25, this._zoom);
      const lineDx = otx - ofx;
      const lineDy = oty - ofy;
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy) || 1;
      // Project point onto line, clamped to segment
      const tProj = Math.max(0, Math.min(1, ((wx - ofx) * lineDx + (wy - ofy) * lineDy) / (lineLen * lineLen)));
      const closestX = ofx + tProj * lineDx;
      const closestY = ofy + tProj * lineDy;
      const distSq = (wx - closestX) * (wx - closestX) + (wy - closestY) * (wy - closestY);
      if (distSq < hitRadius * hitRadius) return t;
    }
    return null;
  }

  // ---- Render the state machine graph ----

  /** Schedule a batched graph redraw on the next animation frame */
  private _scheduleGraphRender(): void {
    if (this._graphDirty) return;
    this._graphDirty = true;
    this._graphRafId = requestAnimationFrame(() => {
      this._graphDirty = false;
      this._graphRafId = 0;
      this._renderGraphImmediate();
    });
  }

  /** Schedule a batched props panel rebuild on the next animation frame */
  private _schedulePropsRender(): void {
    if (this._propsDirty) return;
    this._propsDirty = true;
    this._propsRafId = requestAnimationFrame(() => {
      this._propsDirty = false;
      this._propsRafId = 0;
      this._renderProps();
    });
  }

  /** Invalidate the transition bundle cache (call when transitions/states change) */
  private _invalidateTransitionBundleCache(): void {
    this._transitionBundleCache = null;
  }

  /** Build and cache transition bundle lookups for all transitions */
  private _ensureTransitionBundleCache(): void {
    const sm = this._asset.stateMachine;
    const key = sm.transitions.map(t => t.id).join(',') + '|' + sm.states.map(s => s.id).join(',');
    if (this._transitionBundleCache && this._transitionBundleCacheKey === key) return;

    this._transitionBundleCacheKey = key;
    this._transitionBundleCache = new Map();

    // Group transitions by their (fromId, toId) pair (both directions)
    const pairMap = new Map<string, AnimTransitionData[]>();
    for (const t of sm.transitions) {
      const k1 = t.fromStateId < t.toStateId
        ? `${t.fromStateId}|${t.toStateId}`
        : `${t.toStateId}|${t.fromStateId}`;
      let list = pairMap.get(k1);
      if (!list) { list = []; pairMap.set(k1, list); }
      list.push(t);
    }

    for (const list of pairMap.values()) {
      const total = list.length;
      for (let i = 0; i < total; i++) {
        this._transitionBundleCache.set(list[i].id, { index: i, total });
      }
    }
  }

  private _renderGraph(): void {
    this._renderGraphImmediate();
  }

  private _renderGraphImmediate(): void {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this._canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // UE-style dark background
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(ctx, w, h);

    // "ANIMATION" watermark bottom-right
    ctx.save();
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ANIMATION', w - 24, h - 16);
    ctx.restore();

    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    const sm = this._asset.stateMachine;

    // Ensure transition bundle cache is up-to-date
    this._ensureTransitionBundleCache();

    // Draw Entry node label
    this._drawEntryNode(ctx, sm);

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
      ctx.fillStyle = 'rgba(255,200,0,0.9)';
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
    ctx.fillStyle = 'rgba(30,30,30,0.75)';
    ctx.strokeStyle = 'rgba(80,80,80,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + boxW - 4, y);
    ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + 4);
    ctx.lineTo(x + boxW, y + boxH - 4);
    ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - 4, y + boxH);
    ctx.lineTo(x + 4, y + boxH);
    ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - 4);
    ctx.lineTo(x, y + 4);
    ctx.quadraticCurveTo(x, y, x + 4, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('ANIM VARIABLES', x + padding, y + padding + 9);

    ctx.font = '11px sans-serif';
    for (let i = 0; i < max; i++) {
      const [k, v] = vars[i];
      const val = typeof v === 'number' ? v.toFixed(3) : String(v);
      ctx.fillStyle = '#888';
      ctx.fillText(`${k}:`, x + padding, y + padding + 10 + lineH * (i + 1));
      ctx.fillStyle = '#e0c070';
      const nameWidth = ctx.measureText(`${k}: `).width;
      ctx.fillText(val, x + padding + nameWidth, y + padding + 10 + lineH * (i + 1));
    }
    ctx.restore();
  }

  private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Fine grid
    const stepSmall = 20 * this._zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    let offX = this._panX % stepSmall;
    let offY = this._panY % stepSmall;
    for (let x = offX; x < w; x += stepSmall) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offY; y < h; y += stepSmall) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Coarse grid
    const stepLarge = 100 * this._zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    offX = this._panX % stepLarge;
    offY = this._panY % stepLarge;
    for (let x = offX; x < w; x += stepLarge) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = offY; y < h; y += stepLarge) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  /** Draw the "Entry" node — a small rounded label with a play arrow pointing to the entry state */
  private _drawEntryNode(ctx: CanvasRenderingContext2D, sm: AnimStateMachineData): void {
    const entryState = sm.states.find(s => s.id === sm.entryStateId);
    if (!entryState) return;

    const NODE_W = 160;
    // Position the entry label to the left of the entry state
    const ex = entryState.posX - 90;
    const ey = entryState.posY + 12;
    const ew = 62;
    const eh = 22;
    const r = 4;

    // Rounded rect background
    ctx.beginPath();
    ctx.moveTo(ex + r, ey);
    ctx.lineTo(ex + ew - r, ey);
    ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + r);
    ctx.lineTo(ex + ew, ey + eh - r);
    ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - r, ey + eh);
    ctx.lineTo(ex + r, ey + eh);
    ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - r);
    ctx.lineTo(ex, ey + r);
    ctx.quadraticCurveTo(ex, ey, ex + r, ey);
    ctx.closePath();
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.stroke();

    // "Entry" text
    ctx.fillStyle = '#ccc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Entry', ex + 6, ey + eh / 2);

    // Play triangle
    const tx = ex + ew - 12;
    const ty = ey + eh / 2;
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.moveTo(tx, ty - 4);
    ctx.lineTo(tx + 7, ty);
    ctx.lineTo(tx, ty + 4);
    ctx.closePath();
    ctx.fill();

    // Arrow line from entry to the entry state
    const arrowFromX = ex + ew + 2;
    const arrowFromY = ey + eh / 2;
    const arrowToX = entryState.posX - 2;
    const arrowToY = entryState.posY + 22;

    ctx.beginPath();
    ctx.moveTo(arrowFromX, arrowFromY);
    ctx.lineTo(arrowToX, arrowToY);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Small arrowhead
    const angle = Math.atan2(arrowToY - arrowFromY, arrowToX - arrowFromX);
    const hl = 8;
    ctx.beginPath();
    ctx.moveTo(arrowToX, arrowToY);
    ctx.lineTo(arrowToX - hl * Math.cos(angle - 0.4), arrowToY - hl * Math.sin(angle - 0.4));
    ctx.lineTo(arrowToX - hl * Math.cos(angle + 0.4), arrowToY - hl * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#999';
    ctx.fill();

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  /** Helper: draw a rounded rect path */
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

  private _drawStateNode(ctx: CanvasRenderingContext2D, state: AnimStateData, sm: AnimStateMachineData): void {
    const x = state.posX;
    const y = state.posY;
    const w = 160;
    const h = 44;
    const r = 4;
    const topBarH = 4; // UE-style thin color bar at top
    const isEntry = sm.entryStateId === state.id;
    const isSelected = this._selectedStateId === state.id;

    // Check if this is the active state in preview
    const debugInfo = this._previewAnimInstance?.getDebugInfo();
    const isActive = debugInfo ? debugInfo.stateId === state.id : false;

    // ── Shadow ──
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // ── Body fill ──
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = isActive ? '#8a5c34' : '#333';
    ctx.fill();
    ctx.restore(); // drop shadow

    // ── Top color bar ──
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + topBarH);
    ctx.lineTo(x, y + topBarH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (isActive) {
      ctx.fillStyle = '#d4935a';
    } else if (isSelected) {
      ctx.fillStyle = '#d4a844';
    } else {
      ctx.fillStyle = '#606060';
    }
    ctx.fill();
    ctx.restore();

    // ── Border ──
    this._roundRect(ctx, x, y, w, h, r);
    if (isSelected) {
      ctx.strokeStyle = '#d4a844';
      ctx.lineWidth = 2;
    } else if (isActive) {
      ctx.strokeStyle = '#d4935a';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    // ── Film icon ──
    const ix = x + 10;
    const iy = y + topBarH + (h - topBarH) / 2 - 5;
    ctx.fillStyle = isActive ? 'rgba(255,255,255,0.5)' : '#777';
    ctx.fillRect(ix, iy, 8, 10);
    ctx.fillStyle = isActive ? '#8a5c34' : '#333';
    ctx.fillRect(ix + 1, iy + 1, 2, 1.5);
    ctx.fillRect(ix + 5, iy + 1, 2, 1.5);
    ctx.fillRect(ix + 1, iy + 4, 2, 1.5);
    ctx.fillRect(ix + 5, iy + 4, 2, 1.5);
    ctx.fillRect(ix + 1, iy + 7, 2, 1.5);
    ctx.fillRect(ix + 5, iy + 7, 2, 1.5);

    // ── State name ──
    ctx.fillStyle = isActive ? '#fff' : '#ddd';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.name, x + 24, y + topBarH + (h - topBarH) / 2, w - 30);

    // ── Active state badge (shows weight % and time) ──
    if (isActive && debugInfo) {
      const weight = (debugInfo.stateRelevance * 100).toFixed(1);
      const time = debugInfo.stateTime.toFixed(2);
      const badgeText = `${weight}%`;
      const timeText = `Active for ${time} secs`;

      ctx.font = '10px sans-serif';
      const bm = ctx.measureText(badgeText);
      const tm = ctx.measureText(timeText);
      const bw = Math.max(bm.width, tm.width) + 14;
      const bh = 28;
      const bx = x + w / 2 - bw / 2;
      const by = y - bh - 8;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      this._roundRect(ctx, bx, by, bw, bh, 3);
      ctx.fillStyle = 'rgba(212, 147, 90, 0.9)';
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(badgeText, bx + bw / 2, by + 10);
      ctx.font = '9px sans-serif';
      ctx.fillText(timeText, bx + bw / 2, by + 22);

      // Small triangle pointer below badge
      ctx.fillStyle = 'rgba(212, 147, 90, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 5, by + bh);
      ctx.lineTo(x + w / 2 + 5, by + bh);
      ctx.lineTo(x + w / 2, by + bh + 5);
      ctx.closePath();
      ctx.fill();
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

    // Offset parallel lines so bidirectional transitions don't overlap.
    // Use a CANONICAL normal: always compute from smaller-ID state toward larger-ID state,
    // so both A→B and B→A get the same normal direction and separate correctly.
    const canonFlip = t.fromStateId > t.toStateId ? -1 : 1;
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * canonFlip; // canonical unit normal
    const ny = (dx / len) * canonFlip;
    const parallelStep = 16;
    const offset = (bundle.index - (bundle.total - 1) / 2) * parallelStep;
    const ofx = fx + nx * offset;
    const ofy = fy + ny * offset;
    const otx = tx + nx * offset;
    const oty = ty + ny * offset;

    // ── Straight line ──
    ctx.beginPath();
    ctx.moveTo(ofx, ofy);
    ctx.lineTo(otx, oty);
    ctx.strokeStyle = isSelected ? '#d4a844' : 'rgba(200,200,200,0.6)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // ── Arrowhead near destination ──
    const arrowT = 0.85;
    const apx = ofx + (otx - ofx) * arrowT;
    const apy = ofy + (oty - ofy) * arrowT;
    const lineAngle = Math.atan2(oty - ofy, otx - ofx);
    const hl = 8;
    ctx.beginPath();
    ctx.moveTo(apx + hl * Math.cos(lineAngle), apy + hl * Math.sin(lineAngle));
    ctx.lineTo(apx - hl * Math.cos(lineAngle - 0.45), apy - hl * Math.sin(lineAngle - 0.45));
    ctx.lineTo(apx - hl * Math.cos(lineAngle + 0.45), apy - hl * Math.sin(lineAngle + 0.45));
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#d4a844' : 'rgba(200,200,200,0.6)';
    ctx.fill();

    // ── UE-style transition rule circle at midpoint ──
    const mx = (ofx + otx) / 2;
    const my = (ofy + oty) / 2;
    const iconR = 10;

    // Outer circle
    ctx.beginPath();
    ctx.arc(mx, my, iconR, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#d4a844' : '#2d2d2d';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#e8c060' : '#777';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner icon: ⊖ (circle-minus) like UE
    const innerFg = isSelected ? '#1a1a1a' : '#bbb';
    ctx.strokeStyle = innerFg;
    ctx.lineWidth = 1.5;
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(mx - 4.5, my);
    ctx.lineTo(mx + 4.5, my);
    ctx.stroke();

    // ── Condition label (only when selected) ──
    if (isSelected) {
      const label = this._getTransitionLabel(t);
      if (label) {
        ctx.font = '10px sans-serif';
        const metrics = ctx.measureText(label);
        const lw = Math.min(180, metrics.width + 12);
        const lh = 16;
        const lx = mx - lw / 2;
        const ly = my - iconR - lh - 6;

        this._roundRect(ctx, lx, ly, lw, lh, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fill();
        ctx.strokeStyle = '#d4a844';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#e8c060';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, ly + lh / 2, 170);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  private _getTransitionBundle(sm: AnimStateMachineData, t: AnimTransitionData): { index: number; total: number } {
    // Use cached bundle if available (populated by _ensureTransitionBundleCache)
    if (this._transitionBundleCache) {
      const cached = this._transitionBundleCache.get(t.id);
      if (cached) return cached;
    }
    // Fallback: compute directly
    const list = sm.transitions.filter(x =>
      (x.fromStateId === t.fromStateId && x.toStateId === t.toStateId) ||
      (x.fromStateId === t.toStateId && x.toStateId === t.fromStateId)
    );
    const index = Math.max(0, list.findIndex(x => x.id === t.id));
    return { index, total: Math.max(1, list.length) };
  }

  /** Compute anchor points where a transition leaves/enters nodes.
   *  Uses ray-from-center-to-center clipped to the node rect edge. */
  private _getTransitionAnchors(
    _sm: AnimStateMachineData,
    _t: AnimTransitionData,
    from: AnimStateData,
    to: AnimStateData,
  ): { fx: number; fy: number; tx: number; ty: number } {
    const nodeW = 160;
    const nodeH = 44;
    const fromCx = from.posX + nodeW / 2;
    const fromCy = from.posY + nodeH / 2;
    const toCx = to.posX + nodeW / 2;
    const toCy = to.posY + nodeH / 2;

    const f = this._clipToRect(fromCx, fromCy, toCx, toCy, from.posX, from.posY, nodeW, nodeH);
    const t2 = this._clipToRect(toCx, toCy, fromCx, fromCy, to.posX, to.posY, nodeW, nodeH);
    return { fx: f.x, fy: f.y, tx: t2.x, ty: t2.y };
  }

  /** Clip a ray from (cx,cy)→(tx,ty) to the edge of a rect at (rx,ry,rw,rh). */
  private _clipToRect(
    cx: number, cy: number, tx: number, ty: number,
    rx: number, ry: number, rw: number, rh: number,
  ): { x: number; y: number } {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    // Half dimensions
    const hw = rw / 2;
    const hh = rh / 2;

    // Scale factors to each edge
    let tMin = Infinity;
    if (dx !== 0) {
      const tRight = hw / Math.abs(dx);
      if (tRight < tMin) tMin = tRight;
    }
    if (dy !== 0) {
      const tBottom = hh / Math.abs(dy);
      if (tBottom < tMin) tMin = tBottom;
    }
    if (tMin === Infinity) tMin = 0;

    return {
      x: cx + dx * tMin,
      y: cy + dy * tMin,
    };
  }

  /* Dead bezier helpers removed — transitions are straight lines now */

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
      this._addCtxItem(menu, iconHTML(Icons.RefreshCw, 12, ICON_COLORS.muted) + ' Set as Entry State', () => {
        this._asset.stateMachine.entryStateId = hitState.id;
        this._asset.touch();
        this._renderGraph();
      });

      this._addCtxItem(menu, iconHTML(Icons.ArrowRight, 12, ICON_COLORS.muted) + ' Add Transition From Here', () => {
        this._linkingFrom = hitState;
      });

      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      const del = this._addCtxItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete State', () => {
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
      this._addCtxItem(menu, iconHTML(Icons.PlusCircle, 12, ICON_COLORS.blue) + ' Add State', () => {
        this._showInlinePrompt('New State Name', 'NewState', (name) => {
          if (!name) return;
          const state = defaultAnimState(name, worldX, worldY);
          this._asset.stateMachine.states.push(state);
          if (this._asset.stateMachine.states.length === 1) {
            this._asset.stateMachine.entryStateId = state.id;
          }
          this._asset.touch();
          this._renderGraph();
        });
      });

      this._addCtxItem(menu, '⭐ Add Wildcard Transition', () => {
        const targets = this._asset.stateMachine.states;
        if (targets.length === 0) return;
        // Build a selection dialog instead of prompt
        this._showInlineSelect('Target State', targets.map(s => s.name), (targetName) => {
          if (!targetName) return;
          const target = targets.find(s => s.name === targetName);
          if (!target) return;
          const t = defaultTransition('*', target.id, '');
          t.priority = 100;
          this._asset.stateMachine.transitions.push(t);
          this._asset.touch();
          this._renderGraph();
        });
      });
    }

    // Check if right-clicking on a transition
    const hitTransition = this._hitTestTransition(worldX, worldY);
    if (hitTransition && !hitState) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);

      const del = this._addCtxItem(menu, iconHTML(Icons.Trash2, 12, ICON_COLORS.error) + ' Delete Transition', () => {
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
    item.innerHTML = text;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      onClick();
    });
    menu.appendChild(item);
    return item;
  }

  // ---- Cross-platform inline prompt (replaces window.prompt) ----

  /**
   * Show a small inline modal to get a text value from the user.
   * Works on macOS Tauri (WKWebView) where window.prompt() is unavailable.
   */
  private _showInlinePrompt(title: string, defaultValue: string, onConfirm: (value: string | null) => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'anim-inline-prompt-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: 'var(--bg-panel, #1e2028)', border: '1px solid #555',
      borderRadius: '6px', padding: '16px 20px', minWidth: '280px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', color: '#ddd', fontFamily: 'inherit',
    });

    const label = document.createElement('div');
    label.textContent = title;
    Object.assign(label.style, { marginBottom: '10px', fontWeight: '600', fontSize: '13px' });
    dialog.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.className = 'prop-input';
    Object.assign(input.style, { width: '100%', boxSizing: 'border-box', marginBottom: '12px', fontSize: '13px', padding: '6px 8px' });
    dialog.appendChild(input);

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'toolbar-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); onConfirm(null); });
    btnRow.appendChild(cancelBtn);

    const okBtn = document.createElement('button');
    okBtn.className = 'toolbar-btn';
    okBtn.textContent = 'OK';
    Object.assign(okBtn.style, { background: 'var(--accent, #4a9eff)', color: '#fff' });
    okBtn.addEventListener('click', () => { overlay.remove(); onConfirm(input.value.trim() || null); });
    btnRow.appendChild(okBtn);

    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus input and select text
    requestAnimationFrame(() => { input.focus(); input.select(); });

    // Enter to confirm, Escape to cancel
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    });

    // Click outside to cancel
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) cancelBtn.click();
    });
  }

  /**
   * Show a small inline select dialog for picking from a list.
   * Works on macOS Tauri (WKWebView) where window.prompt() is unavailable.
   */
  private _showInlineSelect(title: string, options: string[], onSelect: (value: string | null) => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'anim-inline-prompt-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: 'var(--bg-panel, #1e2028)', border: '1px solid #555',
      borderRadius: '6px', padding: '16px 20px', minWidth: '280px', maxHeight: '400px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', color: '#ddd', fontFamily: 'inherit',
      display: 'flex', flexDirection: 'column',
    });

    const label = document.createElement('div');
    label.textContent = title;
    Object.assign(label.style, { marginBottom: '10px', fontWeight: '600', fontSize: '13px' });
    dialog.appendChild(label);

    const list = document.createElement('div');
    Object.assign(list.style, { overflowY: 'auto', maxHeight: '260px', marginBottom: '12px' });
    for (const opt of options) {
      const item = document.createElement('div');
      item.textContent = opt;
      Object.assign(item.style, {
        padding: '6px 10px', cursor: 'pointer', borderRadius: '3px', fontSize: '13px',
      });
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--accent, #4a9eff)'; item.style.color = '#fff'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; item.style.color = '#ddd'; });
      item.addEventListener('click', () => { overlay.remove(); onSelect(opt); });
      list.appendChild(item);
    }
    dialog.appendChild(list);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'toolbar-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.remove(); onSelect(null); });
    dialog.appendChild(cancelBtn);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) cancelBtn.click();
    });
  }

  // ============================================================
  //  Properties Panel (right side of Anim Graph)
  // ============================================================

  private _renderProps(): void {
    this._propsPanel.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'anim-props-toolbar';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'toolbar-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      this._asset.touch();
      this._onSave?.();
    });
    toolbar.appendChild(saveBtn);

    const compileBtn = document.createElement('button');
    compileBtn.className = 'toolbar-btn';
    compileBtn.textContent = 'Compile Graph';
    compileBtn.addEventListener('click', () => {
      if (this._eventGraphCompile) {
        this._eventGraphCompile();
      } else {
        console.warn(`[AnimBP] Compile function not ready for ${this._asset.name}`);
      }
    });
    toolbar.appendChild(compileBtn);

    this._propsPanel.appendChild(toolbar);

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

    // Preview viewport — reuse existing section to avoid WebGL context leak
    if (this._previewSection && this._previewInitialised) {
      // Re-attach the persistent preview section without recreating the renderer
      p.appendChild(this._previewSection);
    } else {
      this._buildPreviewSection(p);
    }

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
      this._addPropRow(p, 'Allow Other Skeletons', () => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!state.useOverrideMesh;
        cb.addEventListener('change', () => {
          state.useOverrideMesh = cb.checked;
          if (!state.useOverrideMesh) {
            state.overrideMeshAssetId = '';
            state.overrideAnimationName = '';
          }
          this._asset.touch();
          this._renderProps();
          this._restartPreviewInstance();
        });
        return cb;
      });

      if (state.useOverrideMesh) {
        this._addPropRow(p, 'Animation (All Meshes)', () => {
          const sel = document.createElement('select');
          sel.className = 'prop-input';
          sel.innerHTML = '<option value="">-- None --</option>';
          const allAnims = this._getAllAnimationsWithMesh();
          for (const anim of allAnims) {
            const opt = document.createElement('option');
            opt.value = `${anim.meshId}::${anim.name}`;
            opt.textContent = `${anim.meshName} · ${anim.name}`;
            if (anim.meshId === state.overrideMeshAssetId && anim.name === state.overrideAnimationName) {
              opt.selected = true;
            }
            sel.appendChild(opt);
          }
          sel.addEventListener('change', () => {
            const [meshId, animName] = sel.value.split('::');
            state.overrideMeshAssetId = meshId || '';
            state.overrideAnimationName = animName || '';
            this._asset.touch();
            this._renderGraph();
            this._restartPreviewInstance();
          });
          return sel;
        });
      } else {
        // Animation picker (target mesh only)
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
      }

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
          const sampleCount = bs.samples.length;
          const opt = document.createElement('option');
          opt.value = bs.id;
          opt.textContent = `${bs.name} (${sampleCount} ranges, ${bs.drivingVariable || '?'})`;
          if (bs.id === state.blendSpace1DId) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          state.blendSpace1DId = sel.value;
          // Auto-fill axis var from blend space's driving variable
          const bsFound = this._asset.blendSpaces1D.find(b => b.id === sel.value);
          if (bsFound && bsFound.drivingVariable) {
            state.blendSpaceAxisVar = bsFound.drivingVariable;
          }
          this._asset.touch();
          this._renderProps();
          this._restartPreviewInstance();
        });
        return sel;
      });

      // Show info about the selected blend space
      const selectedBs = this._asset.blendSpaces1D.find(b => b.id === state.blendSpace1DId);
      if (selectedBs) {
        // Driving variable (from blend space, or override)
        this._addPropRow(p, 'Axis Variable', () => {
          const sel = document.createElement('select');
          sel.className = 'prop-input';
          sel.innerHTML = '<option value="">-- Use BS Default --</option>';
          for (const v of this._getEventGraphVars()) {
            const opt = document.createElement('option');
            opt.value = v.name;
            opt.textContent = `${v.name} (${v.type})`;
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

        // Show summary of ranges
        const info = document.createElement('div');
        info.className = 'anim-bs-state-info';
        info.innerHTML = `<div class="anim-bs-state-info-header">Ranges in ${selectedBs.name}:</div>`;
        const rangeList = document.createElement('div');
        rangeList.className = 'anim-bs-state-ranges';
        for (const s of selectedBs.samples) {
          const rangeItem = document.createElement('div');
          rangeItem.className = 'anim-bs-state-range-item';
          rangeItem.innerHTML = `<span class="anim-bs-range-values">${s.rangeMin} → ${s.rangeMax}</span> ` +
            `<span class="anim-bs-range-anim">${s.animationName || '(none)'}</span>`;
          rangeList.appendChild(rangeItem);
        }
        info.appendChild(rangeList);
        if (selectedBs.samples.length === 0) {
          const hint = document.createElement('div');
          hint.className = 'anim-props-help';
          hint.style.fontSize = '10px';
          hint.textContent = 'No ranges defined. Go to the Blend Spaces tab to add animation ranges.';
          info.appendChild(hint);
        }
        p.appendChild(info);
      } else if (this._asset.blendSpaces1D.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'anim-props-help';
        hint.innerHTML = 'No blend spaces defined yet.<br>Go to the <b>Blend Spaces</b> tab to create one.';
        p.appendChild(hint);
      }
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

  private _getAvailableAnimationsForMeshId(meshAssetId: string): Array<{ name: string; id: string }> {
    if (!this._meshManager || !meshAssetId) return [];
    const anims = this._meshManager.getAnimationsForMesh(meshAssetId);
    return anims.map(a => ({ name: a.assetName, id: a.assetId }));
  }

  private _getAllAnimationsWithMesh(): Array<{ meshId: string; meshName: string; name: string }>{
    if (!this._meshManager) return [];
    const list: Array<{ meshId: string; meshName: string; name: string }> = [];
    for (const mesh of this._meshManager.assets) {
      const anims = this._meshManager.getAnimationsForMesh(mesh.id);
      for (const anim of anims) {
        list.push({ meshId: mesh.id, meshName: mesh.name, name: anim.assetName });
      }
    }
    return list;
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
    // If already initialised, just re-attach and skip renderer creation
    if (this._previewSection && this._previewInitialised) {
      container.appendChild(this._previewSection);
      return;
    }

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

    // Persist references so we can re-attach without recreating
    this._previewSection = section;
    this._previewHintEl = hint;
    this._previewContainer = viewport;
    this._previewDebugEl = debug;
    this._previewInitialised = true;

    this._initPreviewRenderer(viewport, hint);
    this._refreshPreview(false);
  }

  private _initPreviewRenderer(container: HTMLElement, hintEl: HTMLElement): void {
    // Only dispose if there was a previous renderer
    if (this._previewRenderer) {
      this._disposePreview();
    }
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
      if (this._previewDebugEl && now - this._previewDebugLast > 500) {
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

      // Only schedule a graph overlay redraw every 500ms (not every 200ms),
      // and use the batched scheduler to avoid redundant draws
      if (this._activeTab === 'animGraph' && now - this._graphOverlayLast > 500) {
        this._graphOverlayLast = now;
        this._scheduleGraphRender();
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

    // Mark persistent section as needing re-creation
    this._previewSection = null;
    this._previewHintEl = null;
    this._previewInitialised = false;
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
      this._showInlinePrompt('Variable Name', 'myVar', (name) => {
        if (!name) return;
        const cleanName = name.trim();
        if (!cleanName) return;
        this._asset.blueprintData.addVariable(cleanName, 'Float');
        this._asset.touch();
        this._buildEventGraphTabVarList(varTable);
      });
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
      undefined,  // components
      undefined,  // rootMeshType
      undefined,  // widgetList
      true,       // isAnimBlueprint — prevents _scriptVars pollution on the pawn
    );

    // Auto-compile once the editor initializes so compiledCode exists.
    // Use a short delay to let the Rete editor fully mount before compiling.
    setTimeout(() => {
      const compileFn = (editorContainer as any).__compileAndSave as (() => void) | undefined;
      if (compileFn) {
        this._eventGraphCompile = compileFn;
        compileFn();
      }
    }, 100);
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
  //  Blend Spaces Tab — UE-style 1D blend space with dots on axis
  // ============================================================

  private _buildBlendSpacesTab(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'anim-blend-spaces';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    // Top toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'anim-bs-toolbar';

    const header = document.createElement('div');
    header.className = 'anim-props-header';
    header.style.margin = '0';
    header.textContent = 'Blend Spaces';
    toolbar.appendChild(header);

    const addBtn = document.createElement('button');
    addBtn.className = 'toolbar-btn';
    addBtn.textContent = '+ New Blend Space';
    addBtn.addEventListener('click', () => {
      this._showInlinePrompt('Blend Space Name', 'BS_Locomotion', (name) => {
        if (!name) return;
        const bs = defaultBlendSpace1D(name);
        this._asset.blendSpaces1D.push(bs);
        this._asset.touch();
        this._buildBlendSpacesTab();
      });
    });
    toolbar.appendChild(addBtn);
    wrapper.appendChild(toolbar);

    // Scrollable list of blend space cards
    const scrollArea = document.createElement('div');
    scrollArea.style.flex = '1';
    scrollArea.style.overflowY = 'auto';
    scrollArea.style.padding = '0 12px 16px';

    if (this._asset.blendSpaces1D.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'anim-props-help';
      empty.style.marginTop = '20px';
      empty.innerHTML = 'No blend spaces yet. Click <b>+ New Blend Space</b> to create one.<br><br>' +
        'Blend spaces let you map positions along an axis to different animations, just like Unreal Engine. ' +
        'Click on the axis to add sample points, then assign animations to each point.';
      scrollArea.appendChild(empty);
    }

    for (const bs of this._asset.blendSpaces1D) {
      scrollArea.appendChild(this._buildBlendSpaceCard(bs));
    }

    wrapper.appendChild(scrollArea);
    this._contentArea.appendChild(wrapper);
  }

  /** Build a UE-style blend space card with a horizontal axis, draggable dot markers, and animation assignments */
  private _buildBlendSpaceCard(bs: BlendSpace1D): HTMLElement {
    const card = document.createElement('div');
    card.className = 'anim-bs-card';

    // ── Header ──
    const cardHeader = document.createElement('div');
    cardHeader.className = 'anim-bs-header';
    const nameSpan = document.createElement('span');
    nameSpan.innerHTML = `${iconHTML(Icons.Activity, 12, ICON_COLORS.primary)} ${bs.name}`;
    cardHeader.appendChild(nameSpan);

    const headerBtns = document.createElement('div');
    headerBtns.style.display = 'flex';
    headerBtns.style.gap = '4px';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'toolbar-btn';
    renameBtn.style.fontSize = '10px';
    renameBtn.style.padding = '2px 6px';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      this._showInlinePrompt('Rename Blend Space', bs.name, (name) => {
        if (!name) return;
        bs.name = name;
        this._asset.touch();
        this._buildBlendSpacesTab();
      });
    });
    headerBtns.appendChild(renameBtn);

    const delBsBtn = document.createElement('button');
    delBsBtn.className = 'prop-btn-danger';
    delBsBtn.innerHTML = iconHTML(Icons.Trash2, 12, ICON_COLORS.error);
    delBsBtn.title = 'Delete Blend Space';
    delBsBtn.addEventListener('click', () => {
      // Guard: show confirm-like prompt
      const idx = this._asset.blendSpaces1D.indexOf(bs);
      if (idx < 0) return;
      this._asset.blendSpaces1D.splice(idx, 1);
      this._asset.touch();
      this._buildBlendSpacesTab();
    });
    headerBtns.appendChild(delBsBtn);
    cardHeader.appendChild(headerBtns);
    card.appendChild(cardHeader);

    const body = document.createElement('div');
    body.className = 'anim-bs-body';

    // ── Config row: driving variable + axis range ──
    const configRow = document.createElement('div');
    configRow.className = 'anim-bs-config-row';

    // Driving variable
    const driverLabel = document.createElement('label');
    driverLabel.textContent = 'Variable:';
    configRow.appendChild(driverLabel);
    const driverSel = document.createElement('select');
    driverSel.innerHTML = '<option value="">-- None --</option>';
    for (const v of this._asset.blueprintData.variables) {
      if (v.type !== 'Float' && v.type !== 'Boolean' && v.type !== 'String') continue;
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.type})`;
      if (v.name === bs.drivingVariable) opt.selected = true;
      driverSel.appendChild(opt);
    }
    driverSel.addEventListener('change', () => { bs.drivingVariable = driverSel.value; this._asset.touch(); });
    configRow.appendChild(driverSel);

    // Axis label
    const axisLabelEl = document.createElement('label');
    axisLabelEl.textContent = 'Axis:';
    configRow.appendChild(axisLabelEl);
    const axisInp = document.createElement('input');
    axisInp.type = 'text';
    axisInp.style.width = '70px';
    axisInp.value = bs.axisLabel;
    axisInp.addEventListener('change', () => { bs.axisLabel = axisInp.value; this._asset.touch(); rebuildAxis(); });
    configRow.appendChild(axisInp);

    // Min/Max
    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:';
    configRow.appendChild(minLabel);
    const minInp = document.createElement('input');
    minInp.type = 'number';
    minInp.style.width = '60px';
    minInp.value = String(bs.axisMin);
    minInp.addEventListener('change', () => { bs.axisMin = parseFloat(minInp.value) || 0; this._asset.touch(); rebuildAxis(); });
    configRow.appendChild(minInp);

    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:';
    configRow.appendChild(maxLabel);
    const maxInp = document.createElement('input');
    maxInp.type = 'number';
    maxInp.style.width = '60px';
    maxInp.value = String(bs.axisMax);
    maxInp.addEventListener('change', () => { bs.axisMax = parseFloat(maxInp.value) || 1; this._asset.touch(); rebuildAxis(); });
    configRow.appendChild(maxInp);

    // Blend margin
    const marginLabel = document.createElement('label');
    marginLabel.textContent = 'Blend:';
    marginLabel.title = 'Crossfade width at range boundaries';
    configRow.appendChild(marginLabel);
    const marginInp = document.createElement('input');
    marginInp.type = 'number';
    marginInp.style.width = '50px';
    marginInp.step = '1';
    marginInp.min = '0';
    marginInp.value = String(bs.blendMargin ?? 10);
    marginInp.addEventListener('change', () => { bs.blendMargin = parseFloat(marginInp.value) || 0; this._asset.touch(); });
    configRow.appendChild(marginInp);

    body.appendChild(configRow);

    // ── UE-style horizontal axis with dots ──
    const axisContainer = document.createElement('div');
    axisContainer.className = 'bs-axis-container';

    const axisHeader = document.createElement('div');
    axisHeader.className = 'bs-axis-header';
    axisHeader.innerHTML = `<span class="bs-axis-title">${bs.axisLabel}</span>` +
      `<span class="bs-axis-hint">Click on the axis to add a sample point</span>`;
    axisContainer.appendChild(axisHeader);

    // The axis track area
    const axisTrack = document.createElement('div');
    axisTrack.className = 'bs-axis-track-area';

    // Range segments (colored background between dots)
    const segmentLayer = document.createElement('div');
    segmentLayer.className = 'bs-axis-segments';
    axisTrack.appendChild(segmentLayer);

    // The horizontal line
    const axisLine = document.createElement('div');
    axisLine.className = 'bs-axis-line';
    axisTrack.appendChild(axisLine);

    // Tick marks layer
    const tickLayer = document.createElement('div');
    tickLayer.className = 'bs-axis-tick-layer';
    axisTrack.appendChild(tickLayer);

    // Dots layer
    const dotLayer = document.createElement('div');
    dotLayer.className = 'bs-axis-dot-layer';
    axisTrack.appendChild(dotLayer);

    axisContainer.appendChild(axisTrack);

    // Tick labels row
    const tickLabels = document.createElement('div');
    tickLabels.className = 'bs-axis-tick-labels';
    axisContainer.appendChild(tickLabels);

    body.appendChild(axisContainer);

    // ── Sample details area (shows the selected dot's details + all dots list) ──
    const detailsArea = document.createElement('div');
    detailsArea.className = 'bs-sample-details';
    body.appendChild(detailsArea);

    card.appendChild(body);

    // Track state for selected dot
    let selectedSampleId: string | null = bs.samples.length > 0 ? bs.samples[0].id : null;

    const colors = ['#4a9eff', '#50c878', '#e6a23c', '#e74c3c', '#9b59b6', '#1abc9c', '#e67e22', '#3498db'];
    const animations = this._getAvailableAnimations();

    // ── Axis click to add dot ──
    axisTrack.addEventListener('click', (e) => {
      const rect = axisTrack.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const totalRange = bs.axisMax - bs.axisMin;
      const value = Math.round((bs.axisMin + pct * totalRange) * 10) / 10;

      // Don't add if clicking right on an existing dot
      const dotEls = dotLayer.querySelectorAll('.bs-axis-dot');
      for (const d of dotEls) {
        const dr = d.getBoundingClientRect();
        if (e.clientX >= dr.left - 4 && e.clientX <= dr.right + 4 &&
            e.clientY >= dr.top - 4 && e.clientY <= dr.bottom + 4) {
          return; // clicked on a dot, don't add
        }
      }

      // Determine range for this new sample
      const sorted = [...bs.samples].sort((a, b) => a.rangeMin - b.rangeMin);
      let rangeMin = value;
      let rangeMax = value;

      // Expand range to midpoint between neighbours
      const leftNeighbour = sorted.filter(s => s.rangeMin <= value).pop();
      const rightNeighbour = sorted.find(s => s.rangeMin > value);
      if (leftNeighbour && rightNeighbour) {
        rangeMin = (leftNeighbour.rangeMax + value) / 2;
        rangeMax = (value + rightNeighbour.rangeMin) / 2;
      } else if (leftNeighbour) {
        rangeMin = (leftNeighbour.rangeMax + value) / 2;
        rangeMax = bs.axisMax;
      } else if (rightNeighbour) {
        rangeMin = bs.axisMin;
        rangeMax = (value + rightNeighbour.rangeMin) / 2;
      } else {
        rangeMin = bs.axisMin;
        rangeMax = bs.axisMax;
      }

      const newSample: BlendSpaceSample1D = {
        id: animUid(),
        animationId: '',
        animationName: '',
        rangeMin: Math.round(rangeMin * 10) / 10,
        rangeMax: Math.round(rangeMax * 10) / 10,
        playRate: 1,
        loop: true,
      };
      bs.samples.push(newSample);
      selectedSampleId = newSample.id;
      this._asset.touch();
      rebuildAxis();
      rebuildDetails();
    });

    // ── Rebuild axis visuals ──
    const rebuildAxis = () => {
      // Clear layers
      segmentLayer.innerHTML = '';
      dotLayer.innerHTML = '';
      tickLayer.innerHTML = '';
      tickLabels.innerHTML = '';

      const totalRange = bs.axisMax - bs.axisMin;
      if (totalRange <= 0) return;

      // Sort samples by rangeMin
      const sorted = [...bs.samples].sort((a, b) => a.rangeMin - b.rangeMin);

      // Draw colored range segments
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const color = colors[i % colors.length];
        const leftPct = ((s.rangeMin - bs.axisMin) / totalRange) * 100;
        const widthPct = ((s.rangeMax - s.rangeMin) / totalRange) * 100;

        const seg = document.createElement('div');
        seg.className = 'bs-axis-segment';
        seg.style.left = `${Math.max(0, leftPct)}%`;
        seg.style.width = `${Math.min(100 - Math.max(0, leftPct), Math.max(0, widthPct))}%`;
        seg.style.backgroundColor = color;
        seg.title = `${s.animationName || '(none)'}: ${s.rangeMin} → ${s.rangeMax}`;
        segmentLayer.appendChild(seg);
      }

      // Draw dots at position (midpoint of each sample's range)
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const color = colors[i % colors.length];
        const midpoint = (s.rangeMin + s.rangeMax) / 2;
        const pct = ((midpoint - bs.axisMin) / totalRange) * 100;

        const dot = document.createElement('div');
        dot.className = 'bs-axis-dot' + (s.id === selectedSampleId ? ' bs-axis-dot-selected' : '');
        dot.style.left = `${Math.max(0.5, Math.min(99.5, pct))}%`;
        dot.style.borderColor = color;
        dot.style.backgroundColor = s.id === selectedSampleId ? color : '#1e1e2e';
        dot.title = `${s.animationName || '(no anim)'}\nValue: ${midpoint.toFixed(1)}\nRange: ${s.rangeMin} → ${s.rangeMax}`;

        // Value label above the dot
        const valLabel = document.createElement('div');
        valLabel.className = 'bs-axis-dot-label';
        valLabel.textContent = String(Math.round(midpoint));
        dot.appendChild(valLabel);

        // Animation name below the dot
        const animLabel = document.createElement('div');
        animLabel.className = 'bs-axis-dot-anim';
        animLabel.textContent = s.animationName || '?';
        dot.appendChild(animLabel);

        // Click to select
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedSampleId = s.id;
          rebuildAxis();
          rebuildDetails();
        });

        // Drag to reposition
        dot.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.preventDefault();
          selectedSampleId = s.id;
          rebuildDetails();

          const trackRect = axisTrack.getBoundingClientRect();
          const startX = e.clientX;
          const startMid = midpoint;

          const onMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const dVal = (dx / trackRect.width) * totalRange;
            const newMid = Math.round((startMid + dVal) * 10) / 10;
            const halfRange = (s.rangeMax - s.rangeMin) / 2;
            s.rangeMin = Math.round(Math.max(bs.axisMin, newMid - halfRange) * 10) / 10;
            s.rangeMax = Math.round(Math.min(bs.axisMax, newMid + halfRange) * 10) / 10;
            this._asset.touch();
            rebuildAxis();
          };

          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            rebuildDetails();
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        dotLayer.appendChild(dot);
      }

      // Draw tick marks
      const tickCount = Math.min(10, Math.max(2, Math.ceil(totalRange / 50)));
      for (let i = 0; i <= tickCount; i++) {
        const pct = (i / tickCount) * 100;
        const val = bs.axisMin + (totalRange * i / tickCount);

        const tick = document.createElement('div');
        tick.className = 'bs-axis-tick';
        tick.style.left = `${pct}%`;
        tickLayer.appendChild(tick);

        const label = document.createElement('div');
        label.className = 'bs-axis-tick-label';
        label.style.left = `${pct}%`;
        label.textContent = String(Math.round(val * 10) / 10);
        tickLabels.appendChild(label);
      }

      // Update header
      axisHeader.innerHTML = `<span class="bs-axis-title">${bs.axisLabel} (${bs.drivingVariable || 'no variable'})</span>` +
        `<span class="bs-axis-hint">Click axis to add point · Drag dots to reposition · ${bs.samples.length} sample${bs.samples.length !== 1 ? 's' : ''}</span>`;
    };

    // ── Rebuild sample details list ──
    const rebuildDetails = () => {
      detailsArea.innerHTML = '';
      const sorted = [...bs.samples].sort((a, b) => a.rangeMin - b.rangeMin);

      if (sorted.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'bs-detail-hint';
        hint.textContent = 'Click on the axis above to add animation sample points.';
        detailsArea.appendChild(hint);
        return;
      }

      // Sample list — like UE's list at the bottom
      const listHeader = document.createElement('div');
      listHeader.className = 'bs-detail-list-header';
      listHeader.innerHTML = '<span></span><span>Animation</span><span>Value</span><span>Range Min</span><span>Range Max</span><span>Rate</span><span>Loop</span><span></span>';
      detailsArea.appendChild(listHeader);

      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const color = colors[i % colors.length];
        const isSelected = s.id === selectedSampleId;

        const row = document.createElement('div');
        row.className = 'bs-detail-row' + (isSelected ? ' bs-detail-row-selected' : '');
        row.addEventListener('click', () => {
          selectedSampleId = s.id;
          rebuildAxis();
          rebuildDetails();
        });

        // Color dot
        const colorDot = document.createElement('div');
        colorDot.className = 'bs-detail-color';
        colorDot.style.backgroundColor = color;
        row.appendChild(colorDot);

        // Animation picker
        const animSel = document.createElement('select');
        animSel.className = 'bs-detail-select';
        animSel.innerHTML = '<option value="">-- Animation --</option>';
        for (const a of animations) {
          const opt = document.createElement('option');
          opt.value = a.name;
          opt.textContent = a.name;
          if (a.name === s.animationName) opt.selected = true;
          animSel.appendChild(opt);
        }
        animSel.addEventListener('change', (e) => {
          e.stopPropagation();
          s.animationName = animSel.value;
          this._asset.touch();
          rebuildAxis();
        });
        animSel.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(animSel);

        // Value (midpoint — read-only display)
        const valSpan = document.createElement('span');
        valSpan.className = 'bs-detail-value';
        valSpan.textContent = String(Math.round(((s.rangeMin + s.rangeMax) / 2) * 10) / 10);
        row.appendChild(valSpan);

        // Range min
        const minInp = document.createElement('input');
        minInp.className = 'bs-detail-input';
        minInp.type = 'number';
        minInp.value = String(s.rangeMin);
        minInp.addEventListener('change', (e) => {
          e.stopPropagation();
          s.rangeMin = parseFloat(minInp.value) || 0;
          this._asset.touch();
          rebuildAxis();
        });
        minInp.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(minInp);

        // Range max
        const maxInp = document.createElement('input');
        maxInp.className = 'bs-detail-input';
        maxInp.type = 'number';
        maxInp.value = String(s.rangeMax);
        maxInp.addEventListener('change', (e) => {
          e.stopPropagation();
          s.rangeMax = parseFloat(maxInp.value) || 0;
          this._asset.touch();
          rebuildAxis();
        });
        maxInp.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(maxInp);

        // Play rate
        const rateInp = document.createElement('input');
        rateInp.className = 'bs-detail-input';
        rateInp.type = 'number';
        rateInp.step = '0.1';
        rateInp.min = '0';
        rateInp.style.width = '40px';
        rateInp.value = String(s.playRate ?? 1);
        rateInp.addEventListener('change', (e) => {
          e.stopPropagation();
          s.playRate = parseFloat(rateInp.value) || 1;
          this._asset.touch();
        });
        rateInp.addEventListener('click', (e) => e.stopPropagation());
        row.appendChild(rateInp);

        // Loop checkbox
        const loopWrap = document.createElement('label');
        loopWrap.className = 'bs-detail-loop';
        const loopCb = document.createElement('input');
        loopCb.type = 'checkbox';
        loopCb.checked = s.loop !== false;
        loopCb.addEventListener('change', (e) => {
          e.stopPropagation();
          s.loop = loopCb.checked;
          this._asset.touch();
        });
        loopCb.addEventListener('click', (e) => e.stopPropagation());
        loopWrap.appendChild(loopCb);
        row.appendChild(loopWrap);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'bs-detail-delete';
        delBtn.innerHTML = '✕';
        delBtn.title = 'Remove sample point';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = bs.samples.findIndex(x => x.id === s.id);
          if (idx >= 0) bs.samples.splice(idx, 1);
          if (selectedSampleId === s.id) {
            selectedSampleId = bs.samples.length > 0 ? bs.samples[0].id : null;
          }
          this._asset.touch();
          rebuildAxis();
          rebuildDetails();
        });
        row.appendChild(delBtn);

        detailsArea.appendChild(row);
      }
    };

    // Initial build
    rebuildAxis();
    rebuildDetails();

    return card;
  }
}
