
import * as THREE from 'three';
import type { MaterialAssetJSON, MeshAssetManager, TextureAssetJSON } from './MeshAsset';
import type { Engine } from '../engine/Engine';

export type NodeType = 'Output' | 'Color' | 'Float' | 'Math' | 'Time' | 'UV' | 'Texture2D' | 'Vector2' | 'Vector3';

export interface GraphNode {
    id: string;
    type: NodeType;
    x: number;
    y: number;
    w: number;
    h: number;
    inputs: string[];
    outputs: string[];
    data: any;
}

export interface GraphConnection {
    id: string;
    fromNode: string;
    fromPort: string;
    toNode: string;
    toPort: string;
}

export class ShaderGraphEditorPanel {
  public container: HTMLElement;
  private _material: MaterialAssetJSON | null = null;
  private _canvas!: HTMLCanvasElement;
  private _ctx!: CanvasRenderingContext2D;
  
  private _nodes: GraphNode[] = [];
  private _connections: GraphConnection[] = [];
  
  private _dragNode: GraphNode | null = null;
  private _dragOffset: { x: number, y: number } = { x: 0, y: 0 };
  private _dragConnection: { fromNode: string, fromPort: string, x: number, y: number } | null = null;
  private _camera: { x: number, y: number, zoom: number } = { x: 0, y: 0, zoom: 1 };
  
  private _contextMenu: HTMLElement | null = null;
  private _meshManager: MeshAssetManager | null = null;

  constructor(container: HTMLElement, engine: Engine, meshManager: MeshAssetManager | null = null) {
    this.container = container;
    this._meshManager = meshManager;
    this._build();
    this._initEvents();
    this._loop();
  }

  setMaterial(mat: MaterialAssetJSON) {
      this._material = mat;
      if (mat.materialData.shaderGraph) {
          this._nodes = mat.materialData.shaderGraph.nodes;
          this._connections = mat.materialData.shaderGraph.connections;
      } else {
          // Init default graph
          this._nodes = [
              { 
                  id: 'out', type: 'Output', x: 600, y: 200, w: 160, h: 220, 
                  inputs: ['Base Color', 'Normal', 'Roughness', 'Metalness', 'Emissive', 'Opacity'], 
                  outputs: [], data: {} 
              },
              {
                  id: 'baseColor', type: 'Color', x: 200, y: 200, w: 140, h: 100,
                  inputs: [], outputs: ['Color'], 
                  data: { color: mat.materialData.baseColor || '#ffffff' }
              }
          ];
          this._connections = [
              { id: 'c1', fromNode: 'baseColor', fromPort: 'Color', toNode: 'out', toPort: 'Base Color' }
          ];
      }
      this._draw();
  }

  private _build() {
    this.container.innerHTML = '';
    this.container.className = 'panel shader-graph-panel';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'panel-header';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '10px';
    toolbar.style.padding = '8px';
    toolbar.style.background = '#252526';
    toolbar.style.borderBottom = '1px solid #333';
    toolbar.innerHTML = `<span style="color:#ccc; font-weight:bold; margin-right:10px;">Shader Graph</span>`;
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply to Material';
    saveBtn.style.background = '#0e639c';
    saveBtn.style.color = '#fff';
    saveBtn.style.border = 'none';
    saveBtn.style.padding = '4px 12px';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => { this._applyGraph(); };
    toolbar.appendChild(saveBtn);
    
    this.container.appendChild(toolbar);

    // Canvas Container
    const canvasContainer = document.createElement('div');
    canvasContainer.style.flex = '1';
    canvasContainer.style.position = 'relative';
    canvasContainer.style.overflow = 'hidden';
    canvasContainer.style.background = '#1e1e1e';
    
    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    this._ctx = this._canvas.getContext('2d')!;
    
    canvasContainer.appendChild(this._canvas);
    this.container.appendChild(canvasContainer);
    
    // Resize observer
    new ResizeObserver(() => {
        this._canvas.width = canvasContainer.clientWidth;
        this._canvas.height = canvasContainer.clientHeight;
        this._draw();
    }).observe(canvasContainer);
  }

  private _initEvents() {
      let isPanning = false;
      let isDragging = false;
      let lastPos = { x: 0, y: 0 };

      this._canvas.onmousedown = (e) => {
          isDragging = false;
          this._closeContextMenu();
          const rect = this._canvas.getBoundingClientRect();
          const mx = (e.clientX - rect.left - this._camera.x) / this._camera.zoom;
          const my = (e.clientY - rect.top - this._camera.y) / this._camera.zoom;
          
          // Check ports first
          for (const n of this._nodes) {
              // Outputs
              for (let i = 0; i < n.outputs.length; i++) {
                  const px = n.x + n.w;
                  const py = n.y + 40 + i * 24;
                  if (Math.hypot(mx - px, my - py) < 12) {
                      this._dragConnection = { fromNode: n.id, fromPort: n.outputs[i], x: mx, y: my };
                      return;
                  }
              }
          }

          // Check nodes (reverse order for z-index)
          for (let i = this._nodes.length - 1; i >= 0; i--) {
              const n = this._nodes[i];
              if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
                  if (e.button === 0) {
                    this._dragNode = n;
                    this._dragOffset = { x: mx - n.x, y: my - n.y };
                    // Bring to front
                    this._nodes.splice(i, 1);
                    this._nodes.push(n);
                    return;
                  }
              }
          }
          
          // Background pan
          if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
              isPanning = true;
              lastPos = { x: e.clientX, y: e.clientY };
          }
      };

      window.onmousemove = (e) => {
          const rect = this._canvas.getBoundingClientRect();
          const mx = (e.clientX - rect.left - this._camera.x) / this._camera.zoom;
          const my = (e.clientY - rect.top - this._camera.y) / this._camera.zoom;

          if (this._dragConnection) {
              isDragging = true;
              this._dragConnection.x = mx;
              this._dragConnection.y = my;
              this._draw();
          } else if (this._dragNode) {
              isDragging = true;
              this._dragNode.x = mx - this._dragOffset.x;
              this._dragNode.y = my - this._dragOffset.y;
              this._draw();
          } else if (isPanning) {
              isDragging = true;
              const dx = e.clientX - lastPos.x;
              const dy = e.clientY - lastPos.y;
              this._camera.x += dx;
              this._camera.y += dy;
              lastPos = { x: e.clientX, y: e.clientY };
              this._draw();
          }
      };

      window.onmouseup = (e) => {
          if (this._dragConnection) {
              const rect = this._canvas.getBoundingClientRect();
              const mx = (e.clientX - rect.left - this._camera.x) / this._camera.zoom;
              const my = (e.clientY - rect.top - this._camera.y) / this._camera.zoom;
              
              // Check if dropped on an input port
              for (const n of this._nodes) {
                  for (let i = 0; i < n.inputs.length; i++) {
                      const px = n.x;
                      const py = n.y + 40 + i * 24;
                      if (Math.hypot(mx - px, my - py) < 12) {
                          // Remove existing connection to this port
                          this._connections = this._connections.filter(c => !(c.toNode === n.id && c.toPort === n.inputs[i]));
                          
                          this._connections.push({
                              id: 'c_' + Date.now(),
                              fromNode: this._dragConnection.fromNode,
                              fromPort: this._dragConnection.fromPort,
                              toNode: n.id,
                              toPort: n.inputs[i]
                          });
                          this._applyGraph();
                          break;
                      }
                  }
              }
              this._dragConnection = null;
              this._draw();
          }
          if (this._dragNode) {
              this._applyGraph();
          }
          this._dragNode = null;
          isPanning = false;
          // We don't reset isDragging here because onclick fires AFTER mouseup.
          // isDragging is reset in mousedown.
      };
      
      this._canvas.onwheel = (e) => {
          e.preventDefault();
          const rect = this._canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          
          const zoomTargetX = (mx - this._camera.x) / this._camera.zoom;
          const zoomTargetY = (my - this._camera.y) / this._camera.zoom;
          
          const scale = e.deltaY > 0 ? 0.9 : 1.1;
          this._camera.zoom *= scale;
          this._camera.zoom = Math.max(0.1, Math.min(this._camera.zoom, 5));
          
          this._camera.x = mx - zoomTargetX * this._camera.zoom;
          this._camera.y = my - zoomTargetY * this._camera.zoom;
          
          this._draw();
      };
      
      this._canvas.oncontextmenu = (e) => {
          e.preventDefault();
          const rect = this._canvas.getBoundingClientRect();
          const mx = (e.clientX - rect.left - this._camera.x) / this._camera.zoom;
          const my = (e.clientY - rect.top - this._camera.y) / this._camera.zoom;
          
          // Check if clicking on a node to delete
          for (let i = this._nodes.length - 1; i >= 0; i--) {
              const n = this._nodes[i];
              if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
                  if (n.type !== 'Output') {
                      this._connections = this._connections.filter(c => c.fromNode !== n.id && c.toNode !== n.id);
                      this._nodes.splice(i, 1);
                      this._draw();
                      this._applyGraph();
                  }
                  return;
              }
          }
          
          // Check if clicking on a connection to delete
          for (let i = this._connections.length - 1; i >= 0; i--) {
              const c = this._connections[i];
              const from = this._nodes.find(n => n.id === c.fromNode);
              const to = this._nodes.find(n => n.id === c.toNode);
              if (!from || !to) continue;
              
              const fromIdx = from.outputs.indexOf(c.fromPort);
              const toIdx = to.inputs.indexOf(c.toPort);
              const fx = from.x + from.w;
              const fy = from.y + 40 + (fromIdx * 24);
              const tx = to.x;
              const ty = to.y + 40 + (toIdx * 24);
              
              // Distance to line segment
              const l2 = Math.pow(fx - tx, 2) + Math.pow(fy - ty, 2);
              let t = ((mx - fx) * (tx - fx) + (my - fy) * (ty - fy)) / l2;
              t = Math.max(0, Math.min(1, t));
              const projX = fx + t * (tx - fx);
              const projY = fy + t * (ty - fy);
              if (Math.hypot(mx - projX, my - projY) < 10) {
                  this._connections.splice(i, 1);
                  this._draw();
                  this._applyGraph();
                  return;
              }
          }

          // Otherwise open add node menu
          this._openContextMenu(e.clientX, e.clientY, mx, my);
      };

      this._canvas.onclick = (e) => {
           if (isDragging) return;
           const rect = this._canvas.getBoundingClientRect();
           const mx = (e.clientX - rect.left - this._camera.x) / this._camera.zoom;
           const my = (e.clientY - rect.top - this._camera.y) / this._camera.zoom;
           
           for (let i = this._nodes.length - 1; i >= 0; i--) {
              const n = this._nodes[i];
              if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
                  if (n.type === 'Color') {
                      // Only trigger if clicking on the color preview area
                      if (my >= n.y + n.h - 30 && my <= n.y + n.h - 10) {
                          const input = document.createElement('input');
                          input.type = 'color';
                          input.value = n.data.color;
                          input.style.position = 'absolute';
                          input.style.left = e.clientX + 'px';
                          input.style.top = e.clientY + 'px';
                          input.style.opacity = '0';
                          document.body.appendChild(input);
                          
                          input.onchange = () => {
                              n.data.color = input.value;
                              this._draw();
                              this._applyGraph();
                              document.body.removeChild(input);
                          };
                          input.onblur = () => {
                              if (document.body.contains(input)) document.body.removeChild(input);
                          };
                          input.click();
                          return;
                      }
                  } else if (n.type === 'Float') {
                      // Only trigger if clicking on the value area
                      if (my >= n.y + n.h - 30 && my <= n.y + n.h - 10) {
                          const input = document.createElement('input');
                          input.type = 'number';
                          input.step = '0.01';
                          input.value = n.data.value;
                          input.style.position = 'absolute';
                          input.style.left = e.clientX + 'px';
                          input.style.top = e.clientY + 'px';
                          document.body.appendChild(input);
                          
                          input.onchange = () => {
                              n.data.value = parseFloat(input.value);
                              this._draw();
                              this._applyGraph();
                              document.body.removeChild(input);
                          };
                          input.onblur = () => {
                              if (document.body.contains(input)) document.body.removeChild(input);
                          };
                          input.focus();
                          return;
                      }
                  } else if (n.type === 'Math') {
                      // Only trigger if clicking on the op area
                      if (my >= n.y + n.h - 30 && my <= n.y + n.h - 10) {
                          const ops = ['Add', 'Subtract', 'Multiply', 'Divide'];
                          const currentIdx = ops.indexOf(n.data.op);
                          n.data.op = ops[(currentIdx + 1) % ops.length];
                          this._draw();
                          this._applyGraph();
                          return;
                      }
                  } else if (n.type === 'Texture2D') {
                      // Only trigger if clicking on the texture name area
                      if (my >= n.y + n.h - 30 && my <= n.y + n.h - 10) {
                          this._showTextureList(e.clientX, e.clientY, (texId) => {
                              n.data.textureId = texId;
                              this._draw();
                              this._applyGraph();
                          });
                          return;
                      }
                  }
              }
           }
      };
  }

  private _openContextMenu(cx: number, cy: number, wx: number, wy: number) {
      this._closeContextMenu();
      
      const menu = document.createElement('div');
      menu.style.position = 'absolute';
      menu.style.left = cx + 'px';
      menu.style.top = cy + 'px';
      menu.style.background = '#252526';
      menu.style.border = '1px solid #454545';
      menu.style.borderRadius = '4px';
      menu.style.padding = '4px 0';
      menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
      menu.style.zIndex = '1000';
      menu.style.color = '#ccc';
      menu.style.fontFamily = 'sans-serif';
      menu.style.fontSize = '13px';
      menu.style.minWidth = '150px';

      const addMenuItem = (label: string, type: NodeType) => {
          const item = document.createElement('div');
          item.textContent = label;
          item.style.padding = '6px 16px';
          item.style.cursor = 'pointer';
          item.onmouseenter = () => item.style.background = '#094771';
          item.onmouseleave = () => item.style.background = 'transparent';
          item.onclick = () => {
              this._addNode(type, wx, wy);
              this._closeContextMenu();
              this._applyGraph();
          };
          menu.appendChild(item);
      };

      addMenuItem('Color', 'Color');
      addMenuItem('Float', 'Float');
      addMenuItem('Vector2', 'Vector2');
      addMenuItem('Vector3', 'Vector3');
      addMenuItem('Math', 'Math');
      addMenuItem('Time', 'Time');
      addMenuItem('UV', 'UV');
      addMenuItem('Texture2D', 'Texture2D');

      document.body.appendChild(menu);
      this._contextMenu = menu;
  }

  private _closeContextMenu() {
      if (this._contextMenu && document.body.contains(this._contextMenu)) {
          document.body.removeChild(this._contextMenu);
      }
      this._contextMenu = null;
  }

  private _addNode(type: NodeType, x: number, y: number) {
      const id = 'node_' + Date.now();
      const node: GraphNode = {
          id, type, x, y, w: 140, h: 100, inputs: [], outputs: [], data: {}
      };
      
      switch (type) {
          case 'Color':
              node.outputs = ['Color'];
              node.data = { color: '#ff0000' };
              break;
          case 'Float':
              node.outputs = ['Value'];
              node.data = { value: 0.5 };
              break;
          case 'Vector2':
              node.outputs = ['Vector2'];
              node.data = { x: 0, y: 0 };
              break;
          case 'Vector3':
              node.outputs = ['Vector3'];
              node.data = { x: 0, y: 0, z: 0 };
              break;
          case 'Math':
              node.inputs = ['A', 'B'];
              node.outputs = ['Result'];
              node.data = { op: 'Add' };
              node.h = 120;
              break;
          case 'Time':
              node.outputs = ['Time'];
              break;
          case 'UV':
              node.outputs = ['UV'];
              break;
          case 'Texture2D':
              node.inputs = ['UV'];
              node.outputs = ['RGB', 'R', 'G', 'B', 'A'];
              node.data = { textureId: null };
              node.h = 160;
              break;
      }
      
      this._nodes.push(node);
      this._draw();
  }

  private _getNodeColor(type: NodeType): string {
      switch (type) {
          case 'Output': return '#522';
          case 'Color': return '#886';
          case 'Float': return '#464';
          case 'Vector2':
          case 'Vector3': return '#662';
          case 'Math': return '#264';
          case 'Time':
          case 'UV': return '#622';
          case 'Texture2D': return '#246';
          default: return '#335';
      }
  }

  private _draw() {
      const ctx = this._ctx;
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      
      ctx.save();
      ctx.translate(this._camera.x, this._camera.y);
      ctx.scale(this._camera.zoom, this._camera.zoom);
      
      // Grid
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1 / this._camera.zoom;
      ctx.beginPath();
      const gridSize = 50;
      const startX = Math.floor(-this._camera.x / this._camera.zoom / gridSize) * gridSize;
      const endX = startX + this._canvas.width / this._camera.zoom + gridSize;
      const startY = Math.floor(-this._camera.y / this._camera.zoom / gridSize) * gridSize;
      const endY = startY + this._canvas.height / this._camera.zoom + gridSize;
      
      for (let x = startX; x < endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y < endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();

      // Connections (Bezier curves)
      ctx.lineWidth = 3;
      for (const c of this._connections) {
          const from = this._nodes.find(n => n.id === c.fromNode);
          const to = this._nodes.find(n => n.id === c.toNode);
          if (!from || !to) continue;
          
          const fromIdx = from.outputs.indexOf(c.fromPort);
          const toIdx = to.inputs.indexOf(c.toPort);
          
          const fx = from.x + from.w;
          const fy = from.y + 40 + (fromIdx * 24);
          const tx = to.x;
          const ty = to.y + 40 + (toIdx * 24);
          
          ctx.strokeStyle = this._getNodeColor(from.type);
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.bezierCurveTo(fx + 60, fy, tx - 60, ty, tx, ty);
          ctx.stroke();
      }

      // Drag connection
      if (this._dragConnection) {
          const from = this._nodes.find(n => n.id === this._dragConnection!.fromNode);
          if (from) {
              const fromIdx = from.outputs.indexOf(this._dragConnection.fromPort);
              const fx = from.x + from.w;
              const fy = from.y + 40 + (fromIdx * 24);
              const tx = this._dragConnection.x;
              const ty = this._dragConnection.y;
              
              ctx.strokeStyle = '#aaa';
              ctx.setLineDash([5, 5]);
              ctx.beginPath();
              ctx.moveTo(fx, fy);
              ctx.bezierCurveTo(fx + 60, fy, tx - 60, ty, tx, ty);
              ctx.stroke();
              ctx.setLineDash([]);
          }
      }
      
      // Nodes
      for (const n of this._nodes) {
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.roundRect(n.x + 4, n.y + 4, n.w, n.h, 6); ctx.fill();

          // Body
          ctx.fillStyle = '#2d2d2d';
          ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, n.h, 6); ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Header
          ctx.fillStyle = this._getNodeColor(n.type);
          ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, 24, [6, 6, 0, 0]); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(n.type, n.x + 8, n.y + 16);
          
          // Inputs
          ctx.font = '11px sans-serif';
          n.inputs.forEach((inp, i) => {
              const py = n.y + 40 + i * 24;
              ctx.fillStyle = '#aaa';
              ctx.beginPath(); ctx.arc(n.x, py, 5, 0, Math.PI*2); ctx.fill();
              ctx.strokeStyle = '#111'; ctx.stroke();
              ctx.fillStyle = '#ddd';
              ctx.fillText(inp, n.x + 12, py + 4);
          });

          // Outputs
          n.outputs.forEach((out, i) => {
              const py = n.y + 40 + i * 24;
              ctx.fillStyle = this._getNodeColor(n.type);
              ctx.beginPath(); ctx.arc(n.x + n.w, py, 5, 0, Math.PI*2); ctx.fill();
              ctx.strokeStyle = '#111'; ctx.stroke();
              ctx.fillStyle = '#ddd';
              ctx.fillText(out, n.x + n.w - 12 - ctx.measureText(out).width, py + 4);
          });
          
          // Preview Data
          if (n.type === 'Color') {
              ctx.fillStyle = n.data.color;
              ctx.beginPath(); ctx.roundRect(n.x + 10, n.y + n.h - 30, n.w - 20, 20, 4); ctx.fill();
              ctx.strokeStyle = '#111'; ctx.stroke();
          } else if (n.type === 'Float') {
              ctx.fillStyle = '#fff';
              ctx.font = '14px sans-serif';
              ctx.fillText(n.data.value !== undefined ? n.data.value.toFixed(2) : '0.00', n.x + 10, n.y + n.h - 15);
          } else if (n.type === 'Math') {
              ctx.fillStyle = '#aaa';
              ctx.font = 'italic 11px sans-serif';
              ctx.fillText(n.data.op, n.x + 10, n.y + n.h - 15);
          } else if (n.type === 'Texture2D') {
              ctx.fillStyle = '#aaa';
              ctx.font = 'italic 11px sans-serif';
              const texName = n.data.textureId ? 'Texture Selected' : 'Click to pick';
              ctx.fillText(texName, n.x + 10, n.y + n.h - 15);
          }
      }
      
      ctx.restore();
  }
  
  private _loop() {
      requestAnimationFrame(() => this._loop());
  }

  private _showTextureList(cx: number, cy: number, onPicked: (id: string | null) => void) {
      this._closeContextMenu();
      
      const menu = document.createElement('div');
      menu.style.position = 'absolute';
      menu.style.left = cx + 'px';
      menu.style.top = cy + 'px';
      menu.style.background = '#252526';
      menu.style.border = '1px solid #454545';
      menu.style.borderRadius = '4px';
      menu.style.padding = '4px 0';
      menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
      menu.style.zIndex = '1000';
      menu.style.color = '#ccc';
      menu.style.fontFamily = 'sans-serif';
      menu.style.fontSize = '13px';
      menu.style.minWidth = '150px';
      menu.style.maxHeight = '250px';
      menu.style.display = 'flex';
      menu.style.flexDirection = 'column';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search textures...';
      searchInput.style.margin = '4px 8px';
      searchInput.style.padding = '4px';
      searchInput.style.background = '#1e1e1e';
      searchInput.style.color = '#ccc';
      searchInput.style.border = '1px solid #333';
      searchInput.style.borderRadius = '2px';
      searchInput.style.outline = 'none';
      menu.appendChild(searchInput);

      const listContainer = document.createElement('div');
      listContainer.style.overflowY = 'auto';
      listContainer.style.flex = '1';
      menu.appendChild(listContainer);

      const addMenuItem = (label: string, id: string | null) => {
          const item = document.createElement('div');
          item.textContent = label;
          item.style.padding = '6px 16px';
          item.style.cursor = 'pointer';
          item.onmouseenter = () => item.style.background = '#094771';
          item.onmouseleave = () => item.style.background = 'transparent';
          item.onclick = () => {
              onPicked(id);
              this._closeContextMenu();
          };
          listContainer.appendChild(item);
          return item;
      };

      const items: { el: HTMLElement, label: string }[] = [];
      items.push({ el: addMenuItem('None', null), label: 'none' });
      
      if (this._meshManager) {
          for (const tex of this._meshManager.allTextures) {
              items.push({ el: addMenuItem(tex.assetName, tex.assetId), label: tex.assetName.toLowerCase() });
          }
      }

      searchInput.oninput = () => {
          const query = searchInput.value.toLowerCase();
          for (const item of items) {
              if (item.label.includes(query)) {
                  item.el.style.display = 'block';
              } else {
                  item.el.style.display = 'none';
              }
          }
      };

      document.body.appendChild(menu);
      searchInput.focus();
      
      // Delay setting this._contextMenu so the current click event doesn't immediately close it
      setTimeout(() => {
          this._contextMenu = menu;
      }, 0);
  }

  private _applyGraph() {
      if (!this._material) return;
      
      this._material.materialData.shaderGraph = {
           nodes: this._nodes,
           connections: this._connections
      };
      
      // Simple CPU evaluation for constant values (Color, Float, Math)
      // This is a fallback until full GLSL compilation is implemented
      const outNode = this._nodes.find(n => n.type === 'Output');
      if (!outNode) return;
      
      const evaluateNode = (nodeId: string, port: string): any => {
          const node = this._nodes.find(n => n.id === nodeId);
          if (!node) return null;
          
          if (node.type === 'Color') return node.data.color;
          if (node.type === 'Float') return node.data.value;
          if (node.type === 'Texture2D') return { isTexture: true, id: node.data.textureId };
          if (node.type === 'Math') {
              const connA = this._connections.find(c => c.toNode === node.id && c.toPort === 'A');
              const connB = this._connections.find(c => c.toNode === node.id && c.toPort === 'B');
              const valA = connA ? evaluateNode(connA.fromNode, connA.fromPort) : 0;
              const valB = connB ? evaluateNode(connB.fromNode, connB.fromPort) : 0;
              
              // Simple float math
              const a = typeof valA === 'number' ? valA : 0;
              const b = typeof valB === 'number' ? valB : 0;
              
              if (node.data.op === 'Add') return a + b;
              if (node.data.op === 'Subtract') return a - b;
              if (node.data.op === 'Multiply') return a * b;
              if (node.data.op === 'Divide') return b !== 0 ? a / b : 0;
          }
          return null;
      };

      // Base Color
      const baseColorConn = this._connections.find(c => c.toNode === outNode.id && c.toPort === 'Base Color');
      if (baseColorConn) {
          const val = evaluateNode(baseColorConn.fromNode, baseColorConn.fromPort);
          if (typeof val === 'string') this._material.materialData.baseColor = val;
          else if (val && val.isTexture) this._material.materialData.baseColorMap = val.id;
      } else {
          this._material.materialData.baseColorMap = null;
      }
      
      // Emissive
      const emissiveConn = this._connections.find(c => c.toNode === outNode.id && c.toPort === 'Emissive');
      if (emissiveConn) {
          const val = evaluateNode(emissiveConn.fromNode, emissiveConn.fromPort);
          if (typeof val === 'string') this._material.materialData.emissive = val;
          else if (val && val.isTexture) this._material.materialData.emissiveMap = val.id;
      } else {
          this._material.materialData.emissiveMap = null;
      }

      // Roughness
      const roughnessConn = this._connections.find(c => c.toNode === outNode.id && c.toPort === 'Roughness');
      if (roughnessConn) {
          const val = evaluateNode(roughnessConn.fromNode, roughnessConn.fromPort);
          if (typeof val === 'number') this._material.materialData.roughness = val;
          else if (val && val.isTexture) this._material.materialData.roughnessMap = val.id;
      } else {
          this._material.materialData.roughnessMap = null;
      }

      // Metalness
      const metalnessConn = this._connections.find(c => c.toNode === outNode.id && c.toPort === 'Metalness');
      if (metalnessConn) {
          const val = evaluateNode(metalnessConn.fromNode, metalnessConn.fromPort);
          if (typeof val === 'number') this._material.materialData.metalness = val;
          else if (val && val.isTexture) this._material.materialData.metallicRoughnessMap = val.id;
      } else {
          this._material.materialData.metallicRoughnessMap = null;
      }
      
      // Normal
      const normalConn = this._connections.find(c => c.toNode === outNode.id && c.toPort === 'Normal');
      if (normalConn) {
          const val = evaluateNode(normalConn.fromNode, normalConn.fromPort);
          if (val && val.isTexture) this._material.materialData.normalMap = val.id;
      } else {
          this._material.materialData.normalMap = null;
      }
      
      // Dispatch event to notify MaterialEditorPanel and Engine
      window.dispatchEvent(new CustomEvent('material-updated', { detail: { materialId: this._material.assetId } }));
  }
}