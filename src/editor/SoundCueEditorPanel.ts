// ============================================================
//  SoundCueEditorPanel — UE5-style Visual Node Graph Editor
//
//  Nodes: Output, Wave Player, Random, Modulator, Mixer
//  Features:
//    - Drag-and-drop node positioning
//    - Pin-to-pin connection wiring (bezier curves)
//    - Right-click context menu to add nodes
//    - Properties panel for selected node
//    - Preview playback via graph evaluation
//    - Pan (middle/right-drag) and zoom (scroll wheel)
// ============================================================

import {
  SoundLibrary,
  type SoundCueData,
  type SoundAssetData,
  type SCNode,
  type SCNodeType,
  type SCWavePlayerNode,
  type SCRandomNode,
  type SCModulatorNode,
  type SCMixerNode,
  type SCOutputNode,
  type SCConnection,
} from './SoundLibrary';

// ── Visual constants ────────────────────────────────────────

const GRID = 20;
const NODE_W = 230;
const PIN_R = 7;
const PIN_SPACING = 30;
const HDR_H = 30;
const BODY_PAD = 16;

const COLORS: Record<SCNodeType, string> = {
  output:     '#E91E63',
  wavePlayer: '#4CAF50',
  random:     '#9C27B0',
  modulator:  '#2196F3',
  mixer:      '#FF9800',
};

const LABELS: Record<SCNodeType, string> = {
  output:     '🔈  Output',
  wavePlayer: '🔊  Wave Player',
  random:     '🎲  Random',
  modulator:  '〰️  Modulator',
  mixer:      '⊕  Mixer',
};

// ── Helpers ─────────────────────────────────────────────────

let _uid = 0;
function uid(prefix = 'scn'): string {
  return prefix + '_' + Date.now().toString(36) + '_' + (++_uid).toString(36);
}

interface Vec2 { x: number; y: number; }

// ============================================================
//  SoundCueEditorPanel
// ============================================================

export class SoundCueEditorPanel {
  private _el: HTMLElement;
  private _cue: SoundCueData;
  private _lib: SoundLibrary;
  private _onSave?: () => void;
  private _audio: HTMLAudioElement | null = null;

  /* DOM */
  private _root: HTMLElement | null = null;
  private _graphEl: HTMLElement | null = null;
  private _svg: SVGSVGElement | null = null;
  private _nodeLayer: HTMLElement | null = null;
  private _propsPanel: HTMLElement | null = null;
  private _ctxMenu: HTMLElement | null = null;

  /* State */
  private _selId: string | null = null;
  private _selConn: string | null = null;
  private _nodeEls: Map<string, HTMLElement> = new Map();
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1;

  /* Interaction */
  private _drag: { nodeId: string; sx: number; sy: number; ox: number; oy: number } | null = null;
  private _conn: { fromId: string; px: number; py: number } | null = null;
  private _pan: { sx: number; sy: number; opx: number; opy: number } | null = null;
  private _tmpPath: SVGPathElement | null = null;

  /* Bound handlers */
  private _bMove: (e: MouseEvent) => void;
  private _bUp:   (e: MouseEvent) => void;
  private _bKey:  (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, cue: SoundCueData, onSave?: () => void) {
    this._el = container;
    this._cue = cue;
    this._lib = SoundLibrary.instance!;
    this._onSave = onSave;

    this._bMove = this._onMove.bind(this);
    this._bUp   = this._onUp.bind(this);
    this._bKey  = this._onKey.bind(this);

    this._build();
  }

  get cue(): SoundCueData { return this._cue; }

  dispose(): void {
    this._stopPreview();
    document.removeEventListener('mousemove', this._bMove);
    document.removeEventListener('mouseup', this._bUp);
    document.removeEventListener('keydown', this._bKey);
    if (this._root?.parentNode) this._root.remove();
    this._root = null;
  }

  // ============================================================
  //  Build
  // ============================================================

  private _build(): void {
    this._el.innerHTML = '';

    const root = document.createElement('div');
    root.style.cssText =
      'display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;' +
      'background:#0d1117;color:#c9d1d9;font-family:Inter,system-ui,sans-serif;font-size:12px;';

    root.appendChild(this._buildToolbar());

    const main = document.createElement('div');
    main.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    /* Canvas area */
    const graph = document.createElement('div');
    graph.style.cssText =
      'flex:1;position:relative;overflow:hidden;cursor:default;' +
      'background-color:#0d1117;' +
      `background-image:
        linear-gradient(rgba(48,54,61,0.25) 1px, transparent 1px),
        linear-gradient(90deg, rgba(48,54,61,0.25) 1px, transparent 1px);` +
      `background-size:${GRID}px ${GRID}px;`;
    graph.addEventListener('contextmenu', e => this._showCtxMenu(e));
    graph.addEventListener('mousedown', e => this._onGraphDown(e));
    graph.addEventListener('wheel', e => this._onWheel(e), { passive: false });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible;';
    graph.appendChild(svg);
    this._svg = svg;

    const nodeLayer = document.createElement('div');
    nodeLayer.style.cssText = 'position:absolute;top:0;left:0;z-index:2;';
    graph.appendChild(nodeLayer);
    this._nodeLayer = nodeLayer;
    this._graphEl = graph;

    main.appendChild(graph);

    /* Properties panel */
    const props = document.createElement('div');
    props.style.cssText =
      'width:280px;overflow-y:auto;background:#161b22;border-left:1px solid #30363d;flex-shrink:0;';
    main.appendChild(props);
    this._propsPanel = props;

    root.appendChild(main);
    this._el.appendChild(root);
    this._root = root;

    document.addEventListener('mousemove', this._bMove);
    document.addEventListener('mouseup', this._bUp);
    document.addEventListener('keydown', this._bKey);

    this._refresh();
  }

  // ── Toolbar ──

  private _buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:5px 10px;' +
      'background:#161b22;border-bottom:1px solid #30363d;flex-shrink:0;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:600;flex:1;display:flex;align-items:center;gap:6px;';
    title.innerHTML = `<span style="color:#E91E63">♪</span> Sound Cue: <span style="color:#58a6ff">${this._esc(this._cue.assetName)}</span>`;
    bar.appendChild(title);

    const types: { t: SCNodeType; l: string; i: string }[] = [
      { t: 'wavePlayer', l: 'Wave Player', i: '🔊' },
      { t: 'random',     l: 'Random',      i: '🎲' },
      { t: 'modulator',  l: 'Modulator',   i: '〰' },
      { t: 'mixer',      l: 'Mixer',       i: '⊕' },
    ];
    for (const nt of types) {
      bar.appendChild(this._mkBtn(`${nt.i} ${nt.l}`, COLORS[nt.t], () => this._addNode(nt.t)));
    }

    this._sep(bar);
    bar.appendChild(this._mkBtn('▶ Preview', '#58a6ff', () => this._preview()));
    bar.appendChild(this._mkBtn('■ Stop', '#f85149', () => this._stopPreview()));

    return bar;
  }

  // ============================================================
  //  Refresh
  // ============================================================

  private _refresh(): void {
    this._renderNodes();
    this._renderConns();
    this._renderProps();
  }

  // ============================================================
  //  Node Rendering
  // ============================================================

  private _renderNodes(): void {
    if (!this._nodeLayer) return;
    this._nodeLayer.innerHTML = '';
    this._nodeEls.clear();

    for (const n of this._cue.nodes) {
      const el = this._mkNode(n);
      this._nodeLayer.appendChild(el);
      this._nodeEls.set(n.id, el);
    }
  }

  private _mkNode(node: SCNode): HTMLElement {
    const c = COLORS[node.type];
    const sel = this._selId === node.id;

    const el = document.createElement('div');
    el.dataset.nodeId = node.id;
    el.style.cssText =
      `position:absolute;left:${node.x + this._panX}px;top:${node.y + this._panY}px;` +
      `width:${NODE_W}px;background:#1c2128;border-radius:8px;user-select:none;` +
      `border:${sel ? 2 : 1}px solid ${sel ? c : c + '55'};` +
      `box-shadow:${sel ? `0 0 16px ${c}44,` : ''}0 4px 12px rgba(0,0,0,0.5);z-index:${sel ? 10 : 1};`;

    /* Header */
    const hdr = document.createElement('div');
    hdr.style.cssText =
      `background:linear-gradient(135deg, ${c}44, ${c}22);` +
      `border-bottom:1px solid ${c}44;padding:6px 12px;font-size:11px;font-weight:700;` +
      `color:${c};border-radius:7px 7px 0 0;cursor:grab;display:flex;align-items:center;` +
      'justify-content:space-between;';
    hdr.innerHTML = `<span>${LABELS[node.type]}</span>`;

    /* Delete button (not for output) */
    if (node.type !== 'output') {
      const del = document.createElement('span');
      del.textContent = '✕';
      del.style.cssText = 'cursor:pointer;font-size:13px;opacity:0.5;';
      del.addEventListener('mouseenter', () => del.style.opacity = '1');
      del.addEventListener('mouseleave', () => del.style.opacity = '0.5');
      del.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this._removeNode(node.id);
      });
      hdr.appendChild(del);
    }

    hdr.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this._selectNode(node.id);
      this._drag = { nodeId: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
    });
    el.appendChild(hdr);

    /* Body */
    const body = document.createElement('div');
    body.style.cssText = `padding:${BODY_PAD}px;position:relative;min-height:42px;`;

    switch (node.type) {
      case 'output':     this._bodyOutput(node as SCOutputNode, body); break;
      case 'wavePlayer': this._bodyWavePlayer(node as SCWavePlayerNode, body); break;
      case 'random':     this._bodyRandom(node as SCRandomNode, body); break;
      case 'modulator':  this._bodyModulator(node as SCModulatorNode, body); break;
      case 'mixer':      this._bodyMixer(node as SCMixerNode, body); break;
    }

    el.appendChild(body);
    el.addEventListener('mousedown', (e) => { if (e.button === 0) this._selectNode(node.id); });
    return el;
  }

  // ── Pin factories ──

  private _inPin(parent: HTMLElement, nodeId: string, idx: number, label: string, y: number): void {
    const pin = document.createElement('div');
    pin.className = 'sc-pin sc-pin-in';
    pin.dataset.nodeId = nodeId;
    pin.dataset.idx = String(idx);
    pin.style.cssText =
      `position:absolute;left:${-PIN_R - 1}px;top:${y}px;width:${PIN_R * 2}px;height:${PIN_R * 2}px;` +
      'background:#58a6ff;border:2px solid #0d1117;border-radius:50%;cursor:crosshair;z-index:5;' +
      'transition:box-shadow 0.15s;';
    pin.addEventListener('mouseenter', () => pin.style.boxShadow = '0 0 8px #58a6ff');
    pin.addEventListener('mouseleave', () => pin.style.boxShadow = 'none');
    pin.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      if (this._conn) this._finishConn(nodeId, idx);
    });
    parent.appendChild(pin);

    const lbl = document.createElement('span');
    lbl.style.cssText = `position:absolute;left:${PIN_R + 8}px;top:${y + 1}px;font-size:10px;color:#8b949e;pointer-events:none;white-space:nowrap;`;
    lbl.textContent = label;
    parent.appendChild(lbl);
  }

  private _outPin(parent: HTMLElement, nodeId: string, y: number, label = 'Out'): void {
    const pin = document.createElement('div');
    pin.className = 'sc-pin sc-pin-out';
    pin.dataset.nodeId = nodeId;
    pin.style.cssText =
      `position:absolute;right:${-PIN_R - 1}px;top:${y}px;width:${PIN_R * 2}px;height:${PIN_R * 2}px;` +
      'background:#3fb950;border:2px solid #0d1117;border-radius:50%;cursor:crosshair;z-index:5;' +
      'transition:box-shadow 0.15s;';
    pin.addEventListener('mouseenter', () => pin.style.boxShadow = '0 0 8px #3fb950');
    pin.addEventListener('mouseleave', () => pin.style.boxShadow = 'none');
    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._startConn(nodeId, e);
    });
    parent.appendChild(pin);

    const lbl = document.createElement('span');
    lbl.style.cssText = `position:absolute;right:${PIN_R + 8}px;top:${y + 1}px;font-size:10px;color:#8b949e;pointer-events:none;text-align:right;white-space:nowrap;`;
    lbl.textContent = label;
    parent.appendChild(lbl);
  }

  // ── Node body builders ──

  private _bodyOutput(n: SCOutputNode, body: HTMLElement): void {
    this._inPin(body, n.id, 0, 'Audio In', 4);
    const info = document.createElement('div');
    info.style.cssText = 'margin-left:24px;font-size:10px;color:#8b949e;line-height:1.8;';
    info.innerHTML =
      `Bus: <b style="color:#c9d1d9">${n.bus}</b><br>` +
      `Vol: <b style="color:#c9d1d9">${n.volume.toFixed(2)}</b>  ·  Pitch: <b style="color:#c9d1d9">${n.pitch.toFixed(2)}</b><br>` +
      `Loop: <b style="color:#c9d1d9">${n.loop ? 'Yes' : 'No'}</b>` +
      (n.fadeIn > 0 || n.fadeOut > 0 ? `<br>Fade: <b style="color:#c9d1d9">${n.fadeIn.toFixed(1)}s / ${n.fadeOut.toFixed(1)}s</b>` : '');
    body.appendChild(info);
  }

  private _bodyWavePlayer(n: SCWavePlayerNode, body: HTMLElement): void {
    this._outPin(body, n.id, 4);
    const snd = this._lib.getSound(n.soundAssetId);

    /* Sound picker button */
    const picker = document.createElement('div');
    picker.style.cssText =
      'margin-right:24px;margin-bottom:6px;background:#0d1117;border:1px solid #30363d;' +
      'border-radius:4px;padding:4px 8px;font-size:10px;cursor:pointer;overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap;transition:border-color 0.15s;';
    picker.style.color = snd ? '#c9d1d9' : '#484f58';
    picker.textContent = snd ? snd.assetName : '— select sound —';
    picker.addEventListener('mouseenter', () => picker.style.borderColor = '#58a6ff');
    picker.addEventListener('mouseleave', () => picker.style.borderColor = '#30363d');
    picker.addEventListener('click', (e) => { e.stopPropagation(); this._showSoundPicker(n, picker); });
    body.appendChild(picker);

    /* Waveform */
    if (snd?.thumbnail) {
      const img = document.createElement('img');
      img.src = snd.thumbnail;
      img.style.cssText = 'width:calc(100% - 24px);height:28px;border-radius:4px;margin-bottom:4px;opacity:0.7;display:block;';
      body.appendChild(img);
    }

    const info = document.createElement('div');
    info.style.cssText = 'font-size:10px;color:#8b949e;line-height:1.7;margin-right:24px;';
    info.innerHTML = `Vol: <b style="color:#c9d1d9">${n.volume.toFixed(2)}</b>  ·  Pitch: <b style="color:#c9d1d9">${n.pitchMin.toFixed(2)} – ${n.pitchMax.toFixed(2)}</b>`;
    if (snd) info.innerHTML += `<br>${SoundLibrary.formatDuration(snd.metadata.duration)} · ${snd.metadata.format.toUpperCase()}`;
    body.appendChild(info);
  }

  private _bodyRandom(n: SCRandomNode, body: HTMLElement): void {
    const conns = this._cue.connections.filter(c => c.toNodeId === n.id);
    const cnt = Math.max(conns.length + 1, 2);
    for (let i = 0; i < cnt; i++) {
      const w = (n.weights[i] ?? 1).toFixed(1);
      this._inPin(body, n.id, i, `In ${i + 1} (w:${w})`, i * PIN_SPACING);
    }
    this._outPin(body, n.id, Math.max(0, Math.floor(((cnt - 1) * PIN_SPACING) / 2)));
    body.style.minHeight = `${cnt * PIN_SPACING + 4}px`;
  }

  private _bodyModulator(n: SCModulatorNode, body: HTMLElement): void {
    this._inPin(body, n.id, 0, 'Audio In', 4);
    this._outPin(body, n.id, 4);
    const info = document.createElement('div');
    info.style.cssText = 'margin:6px 24px 0;font-size:10px;color:#8b949e;line-height:1.7;text-align:center;';
    info.innerHTML =
      `Vol: <b style="color:#c9d1d9">${n.volumeMin.toFixed(2)} – ${n.volumeMax.toFixed(2)}</b><br>` +
      `Pitch: <b style="color:#c9d1d9">${n.pitchMin.toFixed(2)} – ${n.pitchMax.toFixed(2)}</b>`;
    body.appendChild(info);
  }

  private _bodyMixer(n: SCMixerNode, body: HTMLElement): void {
    const conns = this._cue.connections.filter(c => c.toNodeId === n.id);
    const cnt = Math.max(conns.length + 1, 2);
    for (let i = 0; i < cnt; i++) {
      this._inPin(body, n.id, i, `In ${i + 1}`, i * PIN_SPACING);
    }
    this._outPin(body, n.id, Math.max(0, Math.floor(((cnt - 1) * PIN_SPACING) / 2)));
    body.style.minHeight = `${cnt * PIN_SPACING + 4}px`;
  }

  // ============================================================
  //  Connection Rendering (SVG)
  // ============================================================

  private _renderConns(): void {
    if (!this._svg) return;
    while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);

    for (const conn of this._cue.connections) {
      const path = this._mkConnPath(conn);
      if (path) this._svg.appendChild(path);
    }
  }

  private _mkConnPath(conn: SCConnection): SVGPathElement | null {
    const from = this._outPinPos(conn.fromNodeId);
    const to = this._inPinPos(conn.toNodeId, conn.toInputIndex);
    if (!from || !to) return null;

    const sel = this._selConn === conn.id;
    const d = this._bezier(from, to);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', sel ? '#58a6ff' : '#8b949e');
    path.setAttribute('stroke-width', sel ? '3' : '2');
    path.setAttribute('stroke-linecap', 'round');
    if (!sel) path.setAttribute('opacity', '0.6');
    path.style.pointerEvents = 'stroke';
    path.style.cursor = 'pointer';
    path.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._selConn = conn.id;
      this._selId = null;
      this._refresh();
    });
    return path;
  }

  private _bezier(from: Vec2, to: Vec2): string {
    const dx = Math.max(60, Math.abs(to.x - from.x) * 0.5);
    return `M ${from.x},${from.y} C ${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
  }

  // ── Pin world positions ──

  private _outPinPos(nodeId: string): Vec2 | null {
    const n = this._cue.nodes.find(nd => nd.id === nodeId);
    if (!n) return null;
    let py = HDR_H + BODY_PAD + 4 + PIN_R;
    // For Random/Mixer: center output pin
    if (n.type === 'random' || n.type === 'mixer') {
      const conns = this._cue.connections.filter(c => c.toNodeId === n.id);
      const cnt = Math.max(conns.length + 1, 2);
      py = HDR_H + BODY_PAD + Math.max(0, Math.floor(((cnt - 1) * PIN_SPACING) / 2)) + PIN_R;
    }
    return { x: n.x + NODE_W + this._panX, y: n.y + py + this._panY };
  }

  private _inPinPos(nodeId: string, idx: number): Vec2 | null {
    const n = this._cue.nodes.find(nd => nd.id === nodeId);
    if (!n) return null;
    let py: number;
    if (n.type === 'random' || n.type === 'mixer') {
      py = HDR_H + BODY_PAD + idx * PIN_SPACING + PIN_R;
    } else {
      py = HDR_H + BODY_PAD + 4 + PIN_R;
    }
    return { x: n.x + this._panX, y: n.y + py + this._panY };
  }

  // ============================================================
  //  Interaction — Drag, Connect, Pan, Zoom
  // ============================================================

  private _onGraphDown(e: MouseEvent): void {
    this._hideCtxMenu();
    if (e.button === 0) {
      /* Left-click on empty space = deselect */
      const t = e.target as HTMLElement;
      if (t === this._graphEl || t === this._nodeLayer) {
        this._selId = null;
        this._selConn = null;
        this._refresh();
      }
    }
    if (e.button === 1 || (e.button === 0 && e.altKey) || e.button === 2) {
      /* Middle-click / Alt+left / Right-click = pan */
      e.preventDefault();
      this._pan = { sx: e.clientX, sy: e.clientY, opx: this._panX, opy: this._panY };
    }
  }

  private _onMove(e: MouseEvent): void {
    /* Drag node */
    if (this._drag) {
      const n = this._cue.nodes.find(nd => nd.id === this._drag!.nodeId);
      if (n) {
        n.x = this._drag.ox + (e.clientX - this._drag.sx) / this._zoom;
        n.y = this._drag.oy + (e.clientY - this._drag.sy) / this._zoom;
        const el = this._nodeEls.get(n.id);
        if (el) {
          el.style.left = `${n.x + this._panX}px`;
          el.style.top  = `${n.y + this._panY}px`;
        }
        this._renderConns();
        this._updateTmpConn(e);
      }
      return;
    }

    /* Connecting (temp wire) */
    if (this._conn) {
      this._updateTmpConn(e);
      return;
    }

    /* Pan */
    if (this._pan) {
      this._panX = this._pan.opx + (e.clientX - this._pan.sx);
      this._panY = this._pan.opy + (e.clientY - this._pan.sy);
      this._renderNodes();
      this._renderConns();
    }
  }

  private _onUp(e: MouseEvent): void {
    if (this._drag) {
      this._save();
      this._drag = null;
    }
    if (this._conn) {
      /* Dropped on nothing — cancel */
      this._conn = null;
      if (this._tmpPath) { this._tmpPath.remove(); this._tmpPath = null; }
    }
    this._pan = null;
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Pan with wheel (zoom is less useful for node editors, pan is king)
    this._panX -= e.deltaX;
    this._panY -= e.deltaY;
    this._renderNodes();
    this._renderConns();
  }

  private _onKey(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this._selConn) {
        this._removeConn(this._selConn);
        this._selConn = null;
        this._refresh();
      } else if (this._selId) {
        const n = this._cue.nodes.find(nd => nd.id === this._selId);
        if (n && n.type !== 'output') {
          this._removeNode(this._selId);
        }
      }
    }
    if (e.key === 'Escape') {
      this._hideCtxMenu();
      if (this._conn) {
        this._conn = null;
        if (this._tmpPath) { this._tmpPath.remove(); this._tmpPath = null; }
      }
    }
  }

  // ── Connection wiring ──

  private _startConn(fromId: string, e: MouseEvent): void {
    const pos = this._outPinPos(fromId);
    if (!pos) return;
    this._conn = { fromId, px: pos.x, py: pos.y };
    this._tmpPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this._tmpPath.setAttribute('fill', 'none');
    this._tmpPath.setAttribute('stroke', '#58a6ff');
    this._tmpPath.setAttribute('stroke-width', '2');
    this._tmpPath.setAttribute('stroke-dasharray', '6 3');
    this._tmpPath.setAttribute('opacity', '0.8');
    this._svg?.appendChild(this._tmpPath);
  }

  private _updateTmpConn(e: MouseEvent): void {
    if (!this._conn || !this._tmpPath || !this._graphEl) return;
    const rect = this._graphEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const d = this._bezier({ x: this._conn.px, y: this._conn.py }, { x: mx, y: my });
    this._tmpPath.setAttribute('d', d);
  }

  private _finishConn(toId: string, toIdx: number): void {
    if (!this._conn) return;
    const fromId = this._conn.fromId;
    this._conn = null;
    if (this._tmpPath) { this._tmpPath.remove(); this._tmpPath = null; }

    if (fromId === toId) return; // no self-loops

    // Prevent duplicate or conflicting connections
    const existing = this._cue.connections.find(
      c => c.toNodeId === toId && c.toInputIndex === toIdx
    );
    if (existing) {
      // Replace existing connection to this input
      this._cue.connections = this._cue.connections.filter(c => c.id !== existing.id);
    }

    // Prevent connecting output→output or input→input (type validation)
    const fromNode = this._cue.nodes.find(n => n.id === fromId);
    const toNode = this._cue.nodes.find(n => n.id === toId);
    if (!fromNode || !toNode) return;
    if (fromNode.type === 'output') return; // output has no output pin
    if (toNode.type === 'wavePlayer') return; // wave player has no input pin

    this._cue.connections.push({
      id: uid('scc'),
      fromNodeId: fromId,
      toNodeId: toId,
      toInputIndex: toIdx,
    });

    // For Random/Mixer: ensure weights array is big enough
    if (toNode.type === 'random') {
      const rn = toNode as SCRandomNode;
      while (rn.weights.length <= toIdx) rn.weights.push(1);
    }

    this._save();
    this._refresh();
  }

  // ============================================================
  //  Context Menu
  // ============================================================

  private _showCtxMenu(e: MouseEvent): void {
    e.preventDefault();
    this._hideCtxMenu();

    const rect = this._graphEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left - this._panX;
    const cy = e.clientY - rect.top - this._panY;

    const menu = document.createElement('div');
    menu.style.cssText =
      `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#1c2128;` +
      'border:1px solid #30363d;border-radius:6px;padding:4px 0;z-index:9999;min-width:180px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:6px 12px;font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:0.05em;';
    hdr.textContent = 'Add Node';
    menu.appendChild(hdr);

    const items: { t: SCNodeType; l: string; i: string }[] = [
      { t: 'wavePlayer', l: 'Wave Player', i: '🔊' },
      { t: 'random',     l: 'Random',      i: '🎲' },
      { t: 'modulator',  l: 'Modulator',   i: '〰' },
      { t: 'mixer',      l: 'Mixer',       i: '⊕' },
    ];

    for (const item of items) {
      const row = document.createElement('div');
      row.style.cssText =
        'padding:6px 12px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:8px;color:#c9d1d9;';
      row.innerHTML = `<span>${item.i}</span><span>${item.l}</span>`;
      row.addEventListener('mouseenter', () => row.style.background = '#30363d');
      row.addEventListener('mouseleave', () => row.style.background = 'none');
      row.addEventListener('click', () => {
        this._addNode(item.t, cx, cy);
        this._hideCtxMenu();
      });
      menu.appendChild(row);
    }

    document.body.appendChild(menu);
    this._ctxMenu = menu;

    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        this._hideCtxMenu();
        document.removeEventListener('mousedown', close, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 10);
  }

  private _hideCtxMenu(): void {
    if (this._ctxMenu) { this._ctxMenu.remove(); this._ctxMenu = null; }
  }

  // ============================================================
  //  Sound Picker (for Wave Player nodes)
  // ============================================================

  private _showSoundPicker(node: SCWavePlayerNode, anchor: HTMLElement): void {
    const existing = document.getElementById('sc-sound-picker');
    if (existing) existing.remove();

    const rect = anchor.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.id = 'sc-sound-picker';
    picker.style.cssText =
      `position:fixed;left:${rect.left}px;top:${rect.bottom + 2}px;width:260px;max-height:300px;` +
      'background:#1c2128;border:1px solid #58a6ff;border-radius:6px;overflow:hidden;z-index:9999;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.5);';

    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search sounds...';
    search.style.cssText =
      'width:100%;background:#0d1117;color:#c9d1d9;border:none;border-bottom:1px solid #30363d;' +
      'padding:8px 10px;font-size:11px;outline:none;box-sizing:border-box;';
    picker.appendChild(search);

    const list = document.createElement('div');
    list.style.cssText = 'max-height:250px;overflow-y:auto;';

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const sounds = this._lib.allSounds.filter(s =>
        !filter || s.assetName.toLowerCase().includes(filter.toLowerCase())
      );
      if (sounds.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;text-align:center;color:#484f58;font-size:11px;';
        empty.textContent = 'No sounds imported';
        list.appendChild(empty);
        return;
      }
      for (const snd of sounds) {
        const row = document.createElement('div');
        row.style.cssText =
          `padding:6px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:8px;` +
          `color:${snd.assetId === node.soundAssetId ? '#58a6ff' : '#c9d1d9'};` +
          `font-weight:${snd.assetId === node.soundAssetId ? '700' : '400'};`;
        if (snd.thumbnail) {
          const thumb = document.createElement('img');
          thumb.src = snd.thumbnail;
          thumb.style.cssText = 'width:36px;height:18px;border-radius:2px;flex-shrink:0;';
          row.appendChild(thumb);
        }
        const info = document.createElement('div');
        info.innerHTML = `<div>${this._esc(snd.assetName)}</div><div style="font-size:9px;color:#484f58;">${SoundLibrary.formatDuration(snd.metadata.duration)} · ${snd.metadata.format}</div>`;
        row.appendChild(info);
        row.addEventListener('mouseenter', () => row.style.background = '#30363d');
        row.addEventListener('mouseleave', () => row.style.background = 'none');
        row.addEventListener('click', () => {
          node.soundAssetId = snd.assetId;
          this._save();
          this._refresh();
          picker.remove();
        });
        list.appendChild(row);
      }
    };

    search.addEventListener('input', () => renderList(search.value));
    renderList('');
    picker.appendChild(list);
    document.body.appendChild(picker);
    search.focus();

    const close = (ev: MouseEvent) => {
      if (!picker.contains(ev.target as Node)) {
        picker.remove();
        document.removeEventListener('mousedown', close, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 10);
  }

  // ============================================================
  //  Node Management
  // ============================================================

  private _selectNode(id: string): void {
    if (this._selId === id) return;
    this._selId = id;
    this._selConn = null;
    this._refresh();
  }

  private _addNode(type: SCNodeType, x?: number, y?: number): void {
    const cx = x ?? (200 - this._panX + Math.random() * 60);
    const cy = y ?? (150 - this._panY + Math.random() * 60);

    let node: SCNode;
    switch (type) {
      case 'wavePlayer':
        node = { id: uid(), type: 'wavePlayer', x: cx, y: cy, soundAssetId: '', volume: 1, pitchMin: 1, pitchMax: 1 };
        break;
      case 'random':
        node = { id: uid(), type: 'random', x: cx, y: cy, weights: [1, 1] };
        break;
      case 'modulator':
        node = { id: uid(), type: 'modulator', x: cx, y: cy, volumeMin: 0.8, volumeMax: 1.2, pitchMin: 0.9, pitchMax: 1.1 };
        break;
      case 'mixer':
        node = { id: uid(), type: 'mixer', x: cx, y: cy };
        break;
      default:
        return;
    }

    this._cue.nodes.push(node);
    this._selId = node.id;
    this._save();
    this._refresh();
  }

  private _removeNode(id: string): void {
    this._cue.nodes = this._cue.nodes.filter(n => n.id !== id);
    this._cue.connections = this._cue.connections.filter(c => c.fromNodeId !== id && c.toNodeId !== id);
    if (this._selId === id) this._selId = null;
    this._save();
    this._refresh();
  }

  private _removeConn(id: string): void {
    this._cue.connections = this._cue.connections.filter(c => c.id !== id);
    this._save();
  }

  // ============================================================
  //  Properties Panel
  // ============================================================

  private _renderProps(): void {
    if (!this._propsPanel) return;
    const p = this._propsPanel;
    p.innerHTML = '';

    if (this._selConn) {
      this._hdr(p, 'CONNECTION');
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px;';
      const delBtn = this._mkBtn('Delete Connection', '#f85149', () => {
        this._removeConn(this._selConn!);
        this._selConn = null;
        this._refresh();
      });
      delBtn.style.width = '100%';
      row.appendChild(delBtn);
      p.appendChild(row);
      return;
    }

    const node = this._cue.nodes.find(n => n.id === this._selId);
    if (!node) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:#484f58;font-size:11px;line-height:1.8;';
      empty.innerHTML = '<div style="font-size:28px;margin-bottom:8px;">🔊</div>Select a node to edit its properties<br>Right-click to add nodes';
      p.appendChild(empty);
      return;
    }

    switch (node.type) {
      case 'output':     this._propsOutput(node as SCOutputNode, p); break;
      case 'wavePlayer': this._propsWavePlayer(node as SCWavePlayerNode, p); break;
      case 'random':     this._propsRandom(node as SCRandomNode, p); break;
      case 'modulator':  this._propsModulator(node as SCModulatorNode, p); break;
      case 'mixer':      this._propsMixer(node as SCMixerNode, p); break;
    }
  }

  private _propsOutput(n: SCOutputNode, p: HTMLElement): void {
    this._hdr(p, '🔈 OUTPUT');

    this._dropdown(p, 'Audio Bus', n.bus, [
      { v: 'Master', l: 'Master' }, { v: 'SFX', l: 'SFX' },
      { v: 'Music', l: 'Music' }, { v: 'Ambient', l: 'Ambient' }, { v: 'UI', l: 'UI' },
    ], v => { n.bus = v; this._save(); this._refresh(); });

    this._slider(p, 'Volume', n.volume, 0, 2, 0.01, v => { n.volume = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Pitch', n.pitch, 0.1, 3, 0.01, v => { n.pitch = v; this._save(); this._renderNodes(); });
    this._checkbox(p, 'Loop', n.loop, v => { n.loop = v; this._save(); this._renderNodes(); });
    this._numInput(p, 'Max Concurrency', n.maxConcurrency, 0, 32, 1, v => { n.maxConcurrency = v; this._save(); }, '0 = unlimited');
    this._slider(p, 'Fade In (sec)', n.fadeIn, 0, 5, 0.05, v => { n.fadeIn = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Fade Out (sec)', n.fadeOut, 0, 5, 0.05, v => { n.fadeOut = v; this._save(); this._renderNodes(); });
  }

  private _propsWavePlayer(n: SCWavePlayerNode, p: HTMLElement): void {
    this._hdr(p, '🔊 WAVE PLAYER');

    /* Sound dropdown */
    const soundRow = document.createElement('div');
    soundRow.style.cssText = 'padding:8px 12px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#8b949e;margin-bottom:4px;';
    lbl.textContent = 'Sound Asset';
    soundRow.appendChild(lbl);
    const sel = document.createElement('select');
    sel.style.cssText =
      'width:100%;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;' +
      'padding:4px 6px;font-size:11px;';
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '— select —';
    sel.appendChild(defOpt);
    for (const snd of this._lib.allSounds) {
      const opt = document.createElement('option');
      opt.value = snd.assetId;
      opt.textContent = `${snd.assetName} (${SoundLibrary.formatDuration(snd.metadata.duration)})`;
      if (snd.assetId === n.soundAssetId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => { n.soundAssetId = sel.value; this._save(); this._refresh(); });
    soundRow.appendChild(sel);
    p.appendChild(soundRow);

    this._slider(p, 'Volume', n.volume, 0, 2, 0.01, v => { n.volume = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Pitch Min', n.pitchMin, 0.1, 3, 0.01, v => { n.pitchMin = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Pitch Max', n.pitchMax, 0.1, 3, 0.01, v => { n.pitchMax = v; this._save(); this._renderNodes(); });

    /* Preview single sound */
    const previewRow = document.createElement('div');
    previewRow.style.cssText = 'padding:8px 12px;';
    previewRow.appendChild(this._mkBtn('▶ Preview Sound', '#3fb950', () => this._previewSingle(n)));
    p.appendChild(previewRow);
  }

  private _propsRandom(n: SCRandomNode, p: HTMLElement): void {
    this._hdr(p, '🎲 RANDOM');

    const conns = this._cue.connections.filter(c => c.toNodeId === n.id).sort((a, b) => a.toInputIndex - b.toInputIndex);
    if (conns.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;color:#484f58;font-size:11px;text-align:center;';
      empty.textContent = 'Connect Wave Players to the input pins';
      p.appendChild(empty);
      return;
    }

    const weightsHdr = document.createElement('div');
    weightsHdr.style.cssText = 'padding:8px 12px 4px;font-size:10px;color:#8b949e;';
    weightsHdr.textContent = 'Input Weights';
    p.appendChild(weightsHdr);

    for (let i = 0; i < conns.length; i++) {
      const conn = conns[i];
      const fromNode = this._cue.nodes.find(nd => nd.id === conn.fromNodeId);
      const label = fromNode ? LABELS[fromNode.type] : 'Unknown';
      this._slider(p, `In ${i + 1} — ${label}`, n.weights[conn.toInputIndex] ?? 1, 0, 5, 0.1, v => {
        while (n.weights.length <= conn.toInputIndex) n.weights.push(1);
        n.weights[conn.toInputIndex] = v;
        this._save();
        this._renderNodes();
      });
    }

    const evenRow = document.createElement('div');
    evenRow.style.cssText = 'padding:8px 12px;';
    evenRow.appendChild(this._mkBtn('Even Weights', '#9C27B0', () => {
      for (let i = 0; i < n.weights.length; i++) n.weights[i] = 1;
      this._save();
      this._refresh();
    }));
    p.appendChild(evenRow);
  }

  private _propsModulator(n: SCModulatorNode, p: HTMLElement): void {
    this._hdr(p, '〰️ MODULATOR');
    this._slider(p, 'Volume Min', n.volumeMin, 0, 2, 0.01, v => { n.volumeMin = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Volume Max', n.volumeMax, 0, 2, 0.01, v => { n.volumeMax = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Pitch Min', n.pitchMin, 0.1, 3, 0.01, v => { n.pitchMin = v; this._save(); this._renderNodes(); });
    this._slider(p, 'Pitch Max', n.pitchMax, 0.1, 3, 0.01, v => { n.pitchMax = v; this._save(); this._renderNodes(); });
  }

  private _propsMixer(n: SCMixerNode, p: HTMLElement): void {
    this._hdr(p, '⊕ MIXER');
    const conns = this._cue.connections.filter(c => c.toNodeId === n.id);
    const info = document.createElement('div');
    info.style.cssText = 'padding:12px;font-size:11px;color:#8b949e;line-height:1.8;';
    info.innerHTML = `Connected inputs: <b style="color:#c9d1d9">${conns.length}</b><br>` +
      'Mixer plays a random connected input.<br>' +
      '<span style="font-size:10px;color:#484f58;">Connect multiple Wave Players or chains.</span>';
    p.appendChild(info);
  }

  // ============================================================
  //  Preview Playback
  // ============================================================

  private _preview(): void {
    this._stopPreview();
    const result = this._lib.resolveCueToSoundURL(this._cue.assetId);
    if (!result) return;
    this._audio = new Audio(result.url);
    this._audio.volume = Math.min(1, result.volume);
    this._audio.playbackRate = result.pitch;
    this._audio.play().catch(() => {});
  }

  private _previewSingle(n: SCWavePlayerNode): void {
    this._stopPreview();
    const snd = this._lib.getSound(n.soundAssetId);
    if (!snd) return;
    this._audio = new Audio(snd.storedData);
    this._audio.volume = Math.min(1, n.volume);
    const pitch = n.pitchMin + Math.random() * (n.pitchMax - n.pitchMin);
    this._audio.playbackRate = pitch;
    this._audio.play().catch(() => {});
  }

  private _stopPreview(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
  }

  // ============================================================
  //  Save
  // ============================================================

  private _save(): void {
    this._lib.updateCue(this._cue);
    this._onSave?.();
  }

  // ============================================================
  //  UI Helpers
  // ============================================================

  private _mkBtn(label: string, color: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.style.cssText =
      `background:${color}18;color:${color};border:1px solid ${color}44;border-radius:5px;` +
      'padding:4px 10px;font-size:10px;cursor:pointer;font-weight:600;transition:background 0.15s;';
    btn.textContent = label;
    btn.addEventListener('mouseenter', () => btn.style.background = `${color}33`);
    btn.addEventListener('mouseleave', () => btn.style.background = `${color}18`);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _sep(parent: HTMLElement): void {
    const d = document.createElement('div');
    d.style.cssText = 'width:1px;height:18px;background:#30363d;margin:0 4px;';
    parent.appendChild(d);
  }

  private _hdr(parent: HTMLElement, text: string): void {
    const h = document.createElement('div');
    h.style.cssText =
      'padding:10px 12px 6px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;' +
      'color:#484f58;border-bottom:1px solid #21262d;font-weight:600;';
    h.textContent = text;
    parent.appendChild(h);
  }

  private _slider(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 12px;';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:#8b949e;';
    lbl.textContent = label;
    header.appendChild(lbl);
    const val = document.createElement('span');
    val.style.cssText = 'font-size:10px;color:#c9d1d9;font-weight:600;';
    val.textContent = value.toFixed(2);
    header.appendChild(val);
    row.appendChild(header);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = 'width:100%;accent-color:#58a6ff;height:4px;';
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      val.textContent = v.toFixed(2);
      onChange(v);
    });
    row.appendChild(slider);
    parent.appendChild(row);
  }

  private _dropdown(parent: HTMLElement, label: string, value: string, options: { v: string; l: string }[], onChange: (v: string) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:#8b949e;';
    lbl.textContent = label;
    row.appendChild(lbl);
    const sel = document.createElement('select');
    sel.style.cssText =
      'background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:3px;' +
      'padding:3px 6px;font-size:10px;max-width:140px;';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.l;
      if (opt.v === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    parent.appendChild(row);
  }

  private _checkbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:#8b949e;';
    lbl.textContent = label;
    row.appendChild(lbl);
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.style.cssText = 'accent-color:#58a6ff;';
    cb.addEventListener('change', () => onChange(cb.checked));
    row.appendChild(cb);
    parent.appendChild(row);
  }

  private _numInput(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, hint?: string): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:#8b949e;';
    lbl.textContent = label;
    if (hint) {
      const h = document.createElement('span');
      h.style.cssText = 'font-size:9px;color:#484f58;margin-left:4px;';
      h.textContent = `(${hint})`;
      lbl.appendChild(h);
    }
    row.appendChild(lbl);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(value);
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.style.cssText =
      'width:56px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:3px;' +
      'padding:3px 6px;font-size:10px;text-align:center;';
    inp.addEventListener('change', () => onChange(parseFloat(inp.value) || 0));
    row.appendChild(inp);
    parent.appendChild(row);
  }

  private _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
