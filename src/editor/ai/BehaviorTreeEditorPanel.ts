// ============================================================
//  BehaviorTreeEditorPanel — UE5-style Behavior Tree visual editor
//  Three-panel layout:
//    Left:   Blackboard keys sidebar
//    Center: Canvas graph with nodes, connections, drag/drop
//    Right:  Node details / properties
//  Includes right-click add node menu, search, play mode debug,
//  inline task/decorator/service creation, and drag-drop from Content Browser.
// ============================================================

import {
  type AIAssetManager,
  type BehaviorTreeAsset,
  type BTNodeData,
  type BTNodeType,
  type CompositeType,
  type BlackboardAsset,
  type BlackboardKey,
  BUILTIN_TASKS,
  BUILTIN_DECORATORS,
  BUILTIN_SERVICES,
  BLACKBOARD_KEY_COLORS,
  AI_ASSET_META,
} from './AIAssetManager';
import { iconHTML, Icons, ICON_COLORS, createIconSpan } from '../icons';

// ── Node visual constants ──
const NODE_COLORS: Record<string, string> = {
  root:      '#333',
  Sequence:  '#1565C0',
  Selector:  '#C62828',
  SimpleParallel: '#6A1B9A',
  RandomSelector: '#00695C',
  task:      '#E65100',
  decorator: '#7B1FA2',
  service:   '#546E7A',
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const LEVEL_HEIGHT = 100;

export class BehaviorTreeEditorPanel {
  private _container: HTMLElement;
  private _asset: BehaviorTreeAsset;
  private _manager: AIAssetManager;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _selectedNodeId: string | null = null;
  private _isPlayMode = false;
  private _onSave?: () => void;
  private _onCreateTask?: (name: string) => void;
  private _onCreateDecorator?: (name: string) => void;
  private _onCreateService?: (name: string) => void;
  private _onOpenTask?: (id: string) => void;
  private _onOpenDecorator?: (id: string) => void;
  private _onOpenService?: (id: string) => void;

  // Canvas state
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1;
  private _isPanning = false;
  private _panStartX = 0;
  private _panStartY = 0;
  private _isDragging = false;
  private _dragNodeId: string | null = null;
  private _dragOffsetX = 0;
  private _dragOffsetY = 0;

  // DOM elements
  private _leftPanel: HTMLElement | null = null;
  private _rightPanel: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    asset: BehaviorTreeAsset,
    manager: AIAssetManager,
    onSave?: () => void,
  ) {
    this._container = container;
    this._asset = asset;
    this._manager = manager;
    this._onSave = onSave;
    this._render();
  }

  dispose(): void { this._container.innerHTML = ''; }

  // ── Callbacks for creating new assets from the BT canvas ──
  setCreateCallbacks(opts: {
    onCreateTask?: (name: string) => void;
    onCreateDecorator?: (name: string) => void;
    onCreateService?: (name: string) => void;
    onOpenTask?: (id: string) => void;
    onOpenDecorator?: (id: string) => void;
    onOpenService?: (id: string) => void;
  }): void {
    this._onCreateTask = opts.onCreateTask;
    this._onCreateDecorator = opts.onCreateDecorator;
    this._onCreateService = opts.onCreateService;
    this._onOpenTask = opts.onOpenTask;
    this._onOpenDecorator = opts.onOpenDecorator;
    this._onOpenService = opts.onOpenService;
  }

  setPlayMode(active: boolean): void {
    this._isPlayMode = active;
    this._draw();
  }

  private _render(): void {
    this._container.innerHTML = '';
    this._container.className = 'ai-bt-editor';

    // ── Hint bar ──
    if (!this._manager.isHintDismissed('behaviorTree')) {
      const hint = document.createElement('div');
      hint.className = 'ai-hint-bar';
      hint.innerHTML = `
        <span class="ai-hint-icon">${iconHTML(Icons.Info, 12, '#fbbf24')}</span>
        <span>New to Behavior Trees? Add a Selector or Sequence from the ROOT node, then attach Tasks to build your AI logic. Right-click the canvas to add nodes.</span>
        <button class="ai-hint-dismiss">Got it</button>
      `;
      hint.querySelector('.ai-hint-dismiss')!.addEventListener('click', () => {
        this._manager.dismissHint('behaviorTree');
        hint.remove();
      });
      this._container.appendChild(hint);
    }

    // ── Header bar ──
    const header = document.createElement('div');
    header.className = 'ai-bt-header';

    // Blackboard picker
    const bbLabel = document.createElement('span');
    bbLabel.className = 'ai-bt-header-label';
    bbLabel.textContent = 'Blackboard:';

    const bbSelect = document.createElement('select');
    bbSelect.className = 'ai-field-select ai-bt-bb-select';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'None';
    bbSelect.appendChild(noneOpt);
    for (const bb of this._manager.getAllBlackboards()) {
      const opt = document.createElement('option');
      opt.value = bb.id;
      opt.textContent = bb.name;
      if (bb.id === this._asset.blackboardId) opt.selected = true;
      bbSelect.appendChild(opt);
    }
    bbSelect.addEventListener('change', () => {
      this._asset.blackboardId = bbSelect.value || null;
      this._asset.modifiedAt = Date.now();
      this._renderBlackboardPanel();
    });

    // Clickable pill to open blackboard
    const bbPill = document.createElement('span');
    bbPill.className = 'ai-linked-pill ai-linked-pill--header';
    if (this._asset.blackboardId) {
      const bb = this._manager.getBlackboard(this._asset.blackboardId);
      if (bb) {
        bbPill.innerHTML = `${iconHTML(Icons.ClipboardList, 10, '#2E7D32')} ${bb.name} →`;
        bbPill.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('open-ai-asset', { detail: { type: 'blackboard', id: bb.id } }));
        });
      }
    }

    header.appendChild(bbLabel);
    header.appendChild(bbSelect);
    header.appendChild(bbPill);

    // Warnings
    const warnings = this._manager.getWarnings(this._asset.id);
    if (warnings.length > 0) {
      const warnBadge = document.createElement('span');
      warnBadge.className = 'ai-warning-badge';
      warnBadge.innerHTML = `${iconHTML(Icons.AlertTriangle, 12, '#fbbf24')} ${warnings.length}`;
      warnBadge.title = warnings.map(w => w.message).join('\n');
      header.appendChild(warnBadge);
    }

    this._container.appendChild(header);

    // ── Three panel layout ──
    const layout = document.createElement('div');
    layout.className = 'ai-bt-layout';

    // Left — Blackboard keys
    const leftPanel = document.createElement('div');
    leftPanel.className = 'ai-bt-left';
    this._leftPanel = leftPanel;
    this._renderBlackboardPanel();

    // Center — Canvas
    const centerPanel = document.createElement('div');
    centerPanel.className = 'ai-bt-center';

    const canvas = document.createElement('canvas');
    canvas.className = 'ai-bt-canvas';
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    centerPanel.appendChild(canvas);

    // Right — Details
    const rightPanel = document.createElement('div');
    rightPanel.className = 'ai-bt-right';
    this._rightPanel = rightPanel;
    this._renderNodeDetails();

    layout.appendChild(leftPanel);
    layout.appendChild(centerPanel);
    layout.appendChild(rightPanel);
    this._container.appendChild(layout);

    // Size canvas
    this._resizeCanvas();
    const ro = new ResizeObserver(() => this._resizeCanvas());
    ro.observe(centerPanel);

    // ── Canvas events ──
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const { nodeX, nodeY } = this._screenToNode(e.offsetX, e.offsetY);
      this._showAddNodeMenu(e.clientX, e.clientY, nodeX, nodeY);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        // Middle click or shift+left — pan
        this._isPanning = true;
        this._panStartX = e.clientX - this._panX;
        this._panStartY = e.clientY - this._panY;
        return;
      }
      if (e.button === 0) {
        const { nodeX, nodeY } = this._screenToNode(e.offsetX, e.offsetY);
        const hitNode = this._hitTest(nodeX, nodeY);
        if (hitNode) {
          this._selectedNodeId = hitNode.id;
          this._isDragging = true;
          this._dragNodeId = hitNode.id;
          this._dragOffsetX = nodeX - hitNode.x;
          this._dragOffsetY = nodeY - hitNode.y;
          this._renderNodeDetails();
          this._draw();
        } else {
          this._selectedNodeId = null;
          this._renderNodeDetails();
          this._draw();
        }
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this._panX = e.clientX - this._panStartX;
        this._panY = e.clientY - this._panStartY;
        this._draw();
        return;
      }
      if (this._isDragging && this._dragNodeId) {
        const { nodeX, nodeY } = this._screenToNode(e.offsetX, e.offsetY);
        const node = this._asset.nodes[this._dragNodeId];
        if (node) {
          node.x = nodeX - this._dragOffsetX;
          node.y = nodeY - this._dragOffsetY;
          this._draw();
        }
      }
    });

    canvas.addEventListener('mouseup', () => {
      this._isPanning = false;
      this._isDragging = false;
      this._dragNodeId = null;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      this._zoom = Math.max(0.3, Math.min(3, this._zoom * zoomDelta));
      this._draw();
    });

    canvas.addEventListener('dblclick', (e) => {
      const { nodeX, nodeY } = this._screenToNode(e.offsetX, e.offsetY);
      const hitNode = this._hitTest(nodeX, nodeY);
      if (hitNode) {
        // Double-click a task/decorator/service to open its blueprint
        if (hitNode.type === 'task' && hitNode.assetRef) {
          this._onOpenTask?.(hitNode.assetRef);
        } else if (hitNode.type === 'decorator' && hitNode.assetRef) {
          this._onOpenDecorator?.(hitNode.assetRef);
        } else if (hitNode.type === 'service' && hitNode.assetRef) {
          this._onOpenService?.(hitNode.assetRef);
        }
      }
    });

    this._draw();
  }

  private _renderBlackboardPanel(): void {
    if (!this._leftPanel) return;
    this._leftPanel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ai-bt-section-title';
    title.textContent = 'Blackboard';
    this._leftPanel.appendChild(title);

    if (!this._asset.blackboardId) {
      const empty = document.createElement('div');
      empty.className = 'ai-bt-left-empty';
      empty.textContent = 'No blackboard assigned';
      this._leftPanel.appendChild(empty);
      return;
    }

    const bb = this._manager.getBlackboard(this._asset.blackboardId);
    if (!bb) return;

    for (const key of bb.keys) {
      const row = document.createElement('div');
      row.className = 'ai-bt-bb-key';
      const badge = document.createElement('span');
      badge.className = 'ai-bb-key-badge';
      badge.style.background = BLACKBOARD_KEY_COLORS[key.type];
      badge.textContent = key.type.charAt(0);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ai-bt-bb-key-name';
      nameSpan.textContent = key.name;
      row.appendChild(badge);
      row.appendChild(nameSpan);
      this._leftPanel.appendChild(row);
    }
  }

  private _renderNodeDetails(): void {
    if (!this._rightPanel) return;
    this._rightPanel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'ai-bt-section-title';
    title.textContent = 'Details';
    this._rightPanel.appendChild(title);

    const node = this._selectedNodeId ? this._asset.nodes[this._selectedNodeId] : null;
    if (!node) {
      const empty = document.createElement('div');
      empty.className = 'ai-bt-right-empty';
      empty.textContent = 'Select a node to edit its properties';
      this._rightPanel.appendChild(empty);
      return;
    }

    // Node type & label
    const infoRow = document.createElement('div');
    infoRow.className = 'ai-bt-detail-info';
    infoRow.innerHTML = `<strong>${node.label}</strong> <span class="ai-bt-detail-type">${node.type}</span>`;
    this._rightPanel.appendChild(infoRow);

    // If it's a task/decorator/service with an asset ref, show a link pill
    if (node.assetRef) {
      let assetName = node.assetRef;
      let assetType = node.type;
      if (node.type === 'task') {
        const task = this._manager.getTask(node.assetRef);
        if (task) assetName = task.name;
      } else if (node.type === 'decorator') {
        const dec = this._manager.getDecorator(node.assetRef);
        if (dec) assetName = dec.name;
      } else if (node.type === 'service') {
        const svc = this._manager.getService(node.assetRef);
        if (svc) assetName = svc.name;
      }

      const pill = document.createElement('span');
      pill.className = 'ai-linked-pill';
      pill.innerHTML = `Blueprint: ${assetName} →`;
      pill.addEventListener('click', () => {
        if (node.type === 'task') this._onOpenTask?.(node.assetRef!);
        else if (node.type === 'decorator') this._onOpenDecorator?.(node.assetRef!);
        else if (node.type === 'service') this._onOpenService?.(node.assetRef!);
      });
      this._rightPanel.appendChild(pill);
    }

    // Properties
    if (Object.keys(node.properties).length > 0) {
      const propTitle = document.createElement('div');
      propTitle.className = 'ai-bt-detail-props-title';
      propTitle.textContent = 'Properties';
      this._rightPanel.appendChild(propTitle);

      for (const [key, val] of Object.entries(node.properties)) {
        const row = document.createElement('div');
        row.className = 'ai-bb-field-row';
        const lbl = document.createElement('label');
        lbl.className = 'ai-bb-field-label';
        lbl.textContent = key;
        const inp = document.createElement('input');
        inp.type = typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'checkbox' : 'text';
        inp.className = 'ai-field-input';
        if (typeof val === 'boolean') inp.checked = val;
        else inp.value = String(val ?? '');
        inp.addEventListener('change', () => {
          node.properties[key] = inp.type === 'number' ? parseFloat(inp.value) : inp.type === 'checkbox' ? inp.checked : inp.value;
          this._asset.modifiedAt = Date.now();
        });
        row.appendChild(lbl);
        row.appendChild(inp);
        this._rightPanel.appendChild(row);
      }
    }

    // Delete button (not for root)
    if (node.type !== 'root') {
      const sep = document.createElement('div');
      sep.className = 'ai-bb-detail-sep';
      this._rightPanel.appendChild(sep);

      const delBtn = document.createElement('button');
      delBtn.className = 'ai-bb-delete-btn';
      delBtn.innerHTML = `${iconHTML(Icons.Trash2, 12, '#f87171')} Delete Node`;
      delBtn.addEventListener('click', () => {
        this._manager.removeBTNode(this._asset.id, node.id);
        this._selectedNodeId = null;
        this._renderNodeDetails();
        this._draw();
      });
      this._rightPanel.appendChild(delBtn);
    }
  }

  // ============================================================
  //  Canvas drawing
  // ============================================================

  private _resizeCanvas(): void {
    if (!this._canvas) return;
    const parent = this._canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = parent.clientWidth * dpr;
    this._canvas.height = parent.clientHeight * dpr;
    this._canvas.style.width = parent.clientWidth + 'px';
    this._canvas.style.height = parent.clientHeight + 'px';
    this._ctx?.scale(dpr, dpr);
    this._draw();
  }

  private _draw(): void {
    const ctx = this._ctx;
    const canvas = this._canvas;
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    this._drawGrid(ctx, w, h);

    // Draw connections first
    for (const node of Object.values(this._asset.nodes)) {
      for (let i = 0; i < node.children.length; i++) {
        const child = this._asset.nodes[node.children[i]];
        if (!child) continue;
        this._drawConnection(ctx, node, child, i);
      }
    }

    // Draw nodes
    for (const node of Object.values(this._asset.nodes)) {
      this._drawNode(ctx, node);
    }

    ctx.restore();
  }

  private _drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const gridSize = 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const startX = Math.floor(-this._panX / this._zoom / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-this._panY / this._zoom / gridSize) * gridSize - gridSize;
    const endX = startX + w / this._zoom + gridSize * 2;
    const endY = startY + h / this._zoom + gridSize * 2;
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }
  }

  private _drawConnection(ctx: CanvasRenderingContext2D, parent: BTNodeData, child: BTNodeData, index: number): void {
    const px = parent.x + NODE_WIDTH / 2;
    const py = parent.y + NODE_HEIGHT;
    const cx = child.x + NODE_WIDTH / 2;
    const cy = child.y;

    ctx.strokeStyle = this._isPlayMode && child._execStatus === 'running' ? '#4ade80' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = this._isPlayMode && child._execStatus === 'running' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const midY = (py + cy) / 2;
    ctx.bezierCurveTo(px, midY, cx, midY, cx, cy);
    ctx.stroke();

    // Execution order badge
    if (!this._isPlayMode) {
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(px + (cx - px) * 0.3, py + 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), px + (cx - px) * 0.3, py + 12);
    }
  }

  private _drawNode(ctx: CanvasRenderingContext2D, node: BTNodeData): void {
    const x = node.x;
    const y = node.y;
    const isSelected = node.id === this._selectedNodeId;
    const isRoot = node.type === 'root';

    // Node background
    let bgColor = NODE_COLORS[node.type] || NODE_COLORS[node.compositeType || ''] || '#444';
    if (node.type === 'composite') bgColor = NODE_COLORS[node.compositeType || 'Sequence'] || '#1565C0';

    // Play mode status glow
    if (this._isPlayMode) {
      if (node._execStatus === 'running') bgColor = '#2E7D32';
      else if (node._execStatus === 'success') bgColor = '#1B5E20';
      else if (node._execStatus === 'failure') bgColor = '#B71C1C';
    }

    const radius = 6;
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = isSelected ? 2.5 : 1;
    this._roundRect(ctx, x, y, NODE_WIDTH, NODE_HEIGHT, radius);

    // Node header
    ctx.fillStyle = '#fff';
    ctx.font = `${isRoot ? 'bold ' : ''}12px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let label = node.label;
    if (node.type === 'root') label = '● ROOT';
    ctx.fillText(label, x + NODE_WIDTH / 2, y + NODE_HEIGHT / 2);

    // Top connector (not for root)
    if (!isRoot) {
      ctx.fillStyle = '#aaa';
      ctx.beginPath();
      ctx.arc(x + NODE_WIDTH / 2, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom connector (for root and composites)
    if (isRoot || node.type === 'composite') {
      ctx.fillStyle = '#aaa';
      ctx.beginPath();
      ctx.arc(x + NODE_WIDTH / 2, y + NODE_HEIGHT, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Decorator badges (small purple diamonds above node)
    if (node.decorators.length > 0) {
      for (let i = 0; i < node.decorators.length; i++) {
        const dec = this._asset.nodes[node.decorators[i]];
        if (!dec) continue;
        const dx = x + NODE_WIDTH / 2 - (node.decorators.length - 1) * 12 + i * 24;
        const dy = y - 18;
        ctx.fillStyle = '#7B1FA2';
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5, -5, 10, 10);
        ctx.restore();
      }
    }

    // Play mode status icon
    if (this._isPlayMode && node._execStatus) {
      const statusIcons: Record<string, string> = {
        running: '▶',
        success: '✓',
        failure: '✗',
      };
      const statusColors: Record<string, string> = {
        running: '#4ade80',
        success: '#4ade80',
        failure: '#f87171',
      };
      if (node._execStatus !== 'inactive') {
        ctx.fillStyle = statusColors[node._execStatus] || '#fff';
        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(statusIcons[node._execStatus] || '', x + NODE_WIDTH + 4, y + NODE_HEIGHT / 2);
      }
    }
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ============================================================
  //  Hit testing & coordinate transforms
  // ============================================================

  private _screenToNode(sx: number, sy: number): { nodeX: number; nodeY: number } {
    return {
      nodeX: (sx - this._panX) / this._zoom,
      nodeY: (sy - this._panY) / this._zoom,
    };
  }

  private _hitTest(nx: number, ny: number): BTNodeData | null {
    for (const node of Object.values(this._asset.nodes)) {
      if (nx >= node.x && nx <= node.x + NODE_WIDTH && ny >= node.y && ny <= node.y + NODE_HEIGHT) {
        return node;
      }
    }
    return null;
  }

  // ============================================================
  //  Add Node Menu (right-click on canvas)
  // ============================================================

  private _showAddNodeMenu(clientX: number, clientY: number, nodeX: number, nodeY: number): void {
    // Remove existing menu
    document.querySelectorAll('.ai-bt-add-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'ai-bt-add-menu';
    menu.style.position = 'fixed';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';
    menu.style.zIndex = '10000';

    const title = document.createElement('div');
    title.className = 'ai-bt-add-title';
    title.textContent = 'Add Node';
    menu.appendChild(title);

    interface MenuSection { label: string; items: { label: string; action: () => void; isCreate?: boolean }[] }

    const sections: MenuSection[] = [];

    // Recent nodes
    const recent = this._manager.getRecentNodes();
    if (recent.length > 0) {
      sections.push({
        label: 'RECENT',
        items: recent.map(r => ({ label: r, action: () => this._addBuiltinNode(r, nodeX, nodeY) })),
      });
    }

    // Composites
    sections.push({
      label: 'COMPOSITES',
      items: [
        { label: 'Sequence', action: () => this._addCompositeNode('Sequence', nodeX, nodeY) },
        { label: 'Selector', action: () => this._addCompositeNode('Selector', nodeX, nodeY) },
        { label: 'Simple Parallel', action: () => this._addCompositeNode('SimpleParallel', nodeX, nodeY) },
        { label: 'Random Selector', action: () => this._addCompositeNode('RandomSelector', nodeX, nodeY) },
      ],
    });

    // Tasks — built-in + custom
    const taskItems: { label: string; action: () => void; isCreate?: boolean }[] = [];
    for (const bt of BUILTIN_TASKS) {
      taskItems.push({ label: bt.label, action: () => this._addBuiltinNode(bt.label, nodeX, nodeY, bt) });
    }
    // Custom tasks
    for (const task of this._manager.getAllTasks()) {
      taskItems.push({ label: task.name, action: () => this._addCustomTaskNode(task.id, task.name, nodeX, nodeY) });
    }
    taskItems.push({ label: '✨ New Task...', action: () => this._promptCreateAsset('task', nodeX, nodeY), isCreate: true });
    sections.push({ label: 'TASKS', items: taskItems });

    // Decorators
    const decItems: { label: string; action: () => void; isCreate?: boolean }[] = [];
    for (const bd of BUILTIN_DECORATORS) {
      decItems.push({ label: bd.label, action: () => this._addBuiltinNode(bd.label, nodeX, nodeY, bd) });
    }
    for (const dec of this._manager.getAllDecorators()) {
      decItems.push({ label: dec.name, action: () => this._addCustomDecoratorNode(dec.id, dec.name, nodeX, nodeY) });
    }
    decItems.push({ label: '✨ New Decorator...', action: () => this._promptCreateAsset('decorator', nodeX, nodeY), isCreate: true });
    sections.push({ label: 'DECORATORS', items: decItems });

    // Services
    const svcItems: { label: string; action: () => void; isCreate?: boolean }[] = [];
    for (const bs of BUILTIN_SERVICES) {
      svcItems.push({ label: bs.label, action: () => this._addBuiltinNode(bs.label, nodeX, nodeY, bs) });
    }
    for (const svc of this._manager.getAllServices()) {
      svcItems.push({ label: svc.name, action: () => this._addCustomServiceNode(svc.id, svc.name, nodeX, nodeY) });
    }
    svcItems.push({ label: '✨ New Service...', action: () => this._promptCreateAsset('service', nodeX, nodeY), isCreate: true });
    sections.push({ label: 'SERVICES', items: svcItems });

    // Build DOM
    const body = document.createElement('div');
    body.className = 'ai-bt-add-body';

    const allItems: { label: string; action: () => void; section: string; isCreate?: boolean; el?: HTMLElement }[] = [];

    for (const section of sections) {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'ai-bt-add-section';

      const secHeader = document.createElement('div');
      secHeader.className = 'ai-bt-add-section-header';
      secHeader.textContent = section.label;
      sectionEl.appendChild(secHeader);

      for (const item of section.items) {
        const row = document.createElement('div');
        row.className = `ai-bt-add-item${item.isCreate ? ' ai-bt-add-item--create' : ''}`;
        row.textContent = item.label;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.remove();
          this._manager.addRecentNode(item.label);
          item.action();
        });
        sectionEl.appendChild(row);
        allItems.push({ ...item, section: section.label, el: row });
      }

      body.appendChild(sectionEl);
    }

    menu.appendChild(body);

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'ai-bt-add-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.className = 'ai-bt-add-search';
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search nodes...';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      for (const item of allItems) {
        const match = !q || item.label.toLowerCase().includes(q) ||
          this._fuzzyMatch(q, item.label) ||
          item.section.toLowerCase().includes(q);
        if (item.el) item.el.style.display = match ? '' : 'none';
      }
      // Hide empty section headers
      body.querySelectorAll('.ai-bt-add-section').forEach(sec => {
        const visibleItems = sec.querySelectorAll('.ai-bt-add-item:not([style*="display: none"])');
        (sec as HTMLElement).style.display = visibleItems.length > 0 ? '' : 'none';
      });
    });
    searchWrap.appendChild(searchInput);
    menu.appendChild(searchWrap);

    document.body.appendChild(menu);

    // Keep menu within viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    });

    searchInput.focus();

    // Close on outside click
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    requestAnimationFrame(() => document.addEventListener('mousedown', close));
  }

  private _fuzzyMatch(query: string, text: string): boolean {
    const lc = text.toLowerCase();
    let qi = 0;
    for (let ci = 0; ci < lc.length && qi < query.length; ci++) {
      if (lc[ci] === query[qi]) qi++;
    }
    if (qi === query.length) return true;
    // Abbreviation match (first letters of words)
    const abbr = text.split(/\s+/).map(w => w[0]?.toLowerCase()).join('');
    return abbr.includes(query);
  }

  // ============================================================
  //  Node creation helpers
  // ============================================================

  private _addCompositeNode(type: CompositeType, x: number, y: number): void {
    const id = `btn_${Date.now().toString(36)}`;
    const node: BTNodeData = {
      id, type: 'composite', label: type, compositeType: type,
      x, y, children: [], decorators: [], services: [], properties: {},
    };
    this._manager.addBTNode(this._asset.id, node);
    this._autoLinkToSelected(node.id);
    this._selectedNodeId = node.id;
    this._renderNodeDetails();
    this._draw();
  }

  private _addBuiltinNode(label: string, x: number, y: number, def?: { id: string; category: string; properties: { name: string; default: any }[] }): void {
    const id = `btn_${Date.now().toString(36)}`;
    const type: BTNodeType = def?.category === 'decorator' ? 'decorator' : def?.category === 'service' ? 'service' : 'task';
    const props: Record<string, any> = {};
    if (def) {
      for (const p of def.properties) props[p.name] = p.default;
    }
    const node: BTNodeData = {
      id, type, label, builtinId: def?.id,
      x, y, children: [], decorators: [], services: [], properties: props,
    };
    this._manager.addBTNode(this._asset.id, node);
    this._autoLinkToSelected(node.id);
    this._selectedNodeId = node.id;
    this._renderNodeDetails();
    this._draw();
  }

  private _addCustomTaskNode(assetRef: string, name: string, x: number, y: number): void {
    const id = `btn_${Date.now().toString(36)}`;
    const node: BTNodeData = {
      id, type: 'task', label: name, assetRef,
      x, y, children: [], decorators: [], services: [], properties: {},
    };
    this._manager.addBTNode(this._asset.id, node);
    this._autoLinkToSelected(node.id);
    this._selectedNodeId = node.id;
    this._renderNodeDetails();
    this._draw();
  }

  private _addCustomDecoratorNode(assetRef: string, name: string, x: number, y: number): void {
    const id = `btn_${Date.now().toString(36)}`;
    const node: BTNodeData = {
      id, type: 'decorator', label: name, assetRef,
      x, y, children: [], decorators: [], services: [], properties: {},
    };
    this._manager.addBTNode(this._asset.id, node);
    this._selectedNodeId = node.id;
    this._renderNodeDetails();
    this._draw();
  }

  private _addCustomServiceNode(assetRef: string, name: string, x: number, y: number): void {
    const id = `btn_${Date.now().toString(36)}`;
    const node: BTNodeData = {
      id, type: 'service', label: name, assetRef,
      x, y, children: [], decorators: [], services: [], properties: {},
    };
    this._manager.addBTNode(this._asset.id, node);
    this._selectedNodeId = node.id;
    this._renderNodeDetails();
    this._draw();
  }

  /** Auto-link a newly created node as a child of the currently selected composite/root */
  private _autoLinkToSelected(newNodeId: string): void {
    if (!this._selectedNodeId) return;
    const parent = this._asset.nodes[this._selectedNodeId];
    if (!parent || (parent.type !== 'root' && parent.type !== 'composite')) return;
    parent.children.push(newNodeId);
    this._asset.modifiedAt = Date.now();
  }

  /** Show inline floating name input for creating a new asset from BT canvas */
  private _promptCreateAsset(kind: 'task' | 'decorator' | 'service', nodeX: number, nodeY: number): void {
    const prefix = kind === 'task' ? 'BTTask_' : kind === 'decorator' ? 'BTDecorator_' : 'BTService_';
    const popup = document.createElement('div');
    popup.className = 'ai-bt-name-popup';
    popup.style.position = 'fixed';
    // Position at cursor
    const canvasRect = this._canvas!.getBoundingClientRect();
    popup.style.left = (canvasRect.left + canvasRect.width / 2) + 'px';
    popup.style.top = (canvasRect.top + canvasRect.height / 2) + 'px';
    popup.style.zIndex = '10000';

    popup.innerHTML = `
      <div class="ai-bt-name-popup-title">New ${kind.charAt(0).toUpperCase() + kind.slice(1)} Name:</div>
      <input class="ai-field-input ai-bt-name-input" type="text" value="${prefix}" />
      <button class="ai-bt-name-create-btn">Create</button>
    `;

    const inp = popup.querySelector('input')!;
    const createBtn = popup.querySelector('.ai-bt-name-create-btn')!;

    const finish = (name: string | null) => {
      popup.remove();
      if (!name) return;
      if (kind === 'task') {
        this._onCreateTask?.(name);
        // After creation, find the new task and place it
        requestAnimationFrame(() => {
          const tasks = this._manager.getAllTasks();
          const newTask = tasks.find(t => t.name === name);
          if (newTask) this._addCustomTaskNode(newTask.id, newTask.name, nodeX, nodeY);
        });
      } else if (kind === 'decorator') {
        this._onCreateDecorator?.(name);
        requestAnimationFrame(() => {
          const decs = this._manager.getAllDecorators();
          const nd = decs.find(d => d.name === name);
          if (nd) this._addCustomDecoratorNode(nd.id, nd.name, nodeX, nodeY);
        });
      } else {
        this._onCreateService?.(name);
        requestAnimationFrame(() => {
          const svcs = this._manager.getAllServices();
          const ns = svcs.find(s => s.name === name);
          if (ns) this._addCustomServiceNode(ns.id, ns.name, nodeX, nodeY);
        });
      }
    };

    createBtn.addEventListener('click', () => finish(inp.value));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(inp.value);
      if (e.key === 'Escape') finish(null);
    });

    document.body.appendChild(popup);
    inp.focus();
    // Select just the part after the prefix
    inp.setSelectionRange(prefix.length, inp.value.length);

    const close = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        finish(null);
        document.removeEventListener('mousedown', close);
      }
    };
    requestAnimationFrame(() => document.addEventListener('mousedown', close));
  }

  /** Accept a drop from the Content Browser (drag a Task/Decorator/Service onto the canvas) */
  handleAssetDrop(assetType: string, assetId: string, clientX: number, clientY: number): void {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const { nodeX, nodeY } = this._screenToNode(clientX - rect.left, clientY - rect.top);

    if (assetType === 'btTask') {
      const task = this._manager.getTask(assetId);
      if (task) this._addCustomTaskNode(assetId, task.name, nodeX, nodeY);
    } else if (assetType === 'btDecorator') {
      const dec = this._manager.getDecorator(assetId);
      if (dec) this._addCustomDecoratorNode(assetId, dec.name, nodeX, nodeY);
    } else if (assetType === 'btService') {
      const svc = this._manager.getService(assetId);
      if (svc) this._addCustomServiceNode(assetId, svc.name, nodeX, nodeY);
    }
  }
}
