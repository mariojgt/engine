// ============================================================
//  TerrainEditorPanel — UE5-style Landscape editor
//  Provides sculpt / paint / manage modes for terrain editing.
//  Sculpt tools: Raise, Lower, Flatten, Smooth, Erosion, Noise
//  Paint tools:  Paint layer, Erase layer
//  Manage:       Resize, import/export heightmap
// ============================================================

import * as THREE from 'three';
import { createIcon, createIconSpan, Icons, ICON_COLORS, iconHTML } from './icons';
import { MeshAssetManager, type MaterialAssetJSON } from './MeshAsset';

// ---- Types ----

export interface TerrainLayer {
  id: string;
  name: string;
  /** Material asset ID from the engine material system */
  materialAssetId: string | null;
  /** Tiling scale for the texture */
  uvScale: number;
  /** Blend sharpness (higher = sharper transitions) */
  blendSharpness: number;
  /** Whether this is the base/default layer */
  isBase: boolean;
}

export interface TerrainData {
  /** Number of vertices per side (resolution + 1) */
  resolution: number;
  /** World size in units per side */
  sizeX: number;
  sizeZ: number;
  /** Maximum displacement height */
  maxHeight: number;
  /** Heightmap values [0..1] stored as flat Float32Array, row-major */
  heightmap: Float32Array;
  /** Splatmap: one channel per layer, stored as Float32Array per layer (same resolution as heightmap) */
  splatmaps: Map<string, Float32Array>;
  /** Material layers */
  layers: TerrainLayer[];
  /** Has collision */
  hasCollision: boolean;
}

export type SculptTool = 'raise' | 'lower' | 'flatten' | 'smooth' | 'erosion' | 'noise';
export type PaintTool = 'paint' | 'erase';
export type TerrainMode = 'sculpt' | 'paint' | 'manage';

// ---- Helpers ----

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
//  Terrain Mesh Builder — generates Three.js mesh from TerrainData
// ============================================================

export class TerrainMeshBuilder {
  /**
   * Create or update a terrain mesh from TerrainData.
   * Returns a THREE.Mesh with proper geometry, UVs, and normals.
   */
  static buildGeometry(data: TerrainData): THREE.PlaneGeometry {
    const { resolution, sizeX, sizeZ, maxHeight, heightmap } = data;
    const segs = resolution - 1;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, segs, segs);

    // PlaneGeometry lies on XY, rotate to XZ by swapping Y/Z in position
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Map x from [-sizeX/2, sizeX/2] to grid col [0..resolution-1]
      const col = Math.round(((x / sizeX) + 0.5) * segs);
      // Map y from [sizeZ/2, -sizeZ/2] to grid row [0..resolution-1]
      const row = Math.round((0.5 - (y / sizeZ)) * segs);
      const idx = clamp(row, 0, resolution - 1) * resolution + clamp(col, 0, resolution - 1);
      const h = (heightmap[idx] ?? 0) * maxHeight;
      // Set to XZ plane: x stays, y = height, z = -original y
      pos.setXYZ(i, x, h, -y);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** Update existing geometry vertex heights in-place (fast path for sculpting) */
  static updateHeights(geo: THREE.BufferGeometry, data: TerrainData): void {
    const { resolution, sizeX, sizeZ, maxHeight, heightmap } = data;
    const segs = resolution - 1;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // x goes from -sizeX/2 to sizeX/2
      const col = Math.round(((x / sizeX) + 0.5) * segs);
      // z goes from -sizeZ/2 to sizeZ/2
      const row = Math.round(((z / sizeZ) + 0.5) * segs);
      const idx = clamp(row, 0, resolution - 1) * resolution + clamp(col, 0, resolution - 1);
      const h = (heightmap[idx] ?? 0) * maxHeight;
      pos.setY(i, h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /**
   * Build a splatmap material (ShaderMaterial) that blends up to 4 layers
   * using weight textures. Falls back to a simple MeshStandardMaterial if
   * no layers are defined.
   */
  static buildSplatMaterial(
    data: TerrainData,
    resolveTexture?: (materialAssetId: string) => THREE.Texture | null,
  ): THREE.Material {
    const layers = data.layers;

    if (layers.length === 0) {
      // Default dev-checker fallback
      return TerrainMeshBuilder._defaultMaterial(data);
    }

    // Build splatmap data texture (RGBA → up to 4 layers)
    const res = data.resolution;
    const splatData = new Uint8Array(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      for (let ch = 0; ch < 4; ch++) {
        const layer = layers[ch];
        if (!layer) { splatData[i * 4 + ch] = 0; continue; }
        const weights = data.splatmaps.get(layer.id);
        splatData[i * 4 + ch] = weights ? Math.round(clamp(weights[i], 0, 1) * 255) : (ch === 0 ? 255 : 0);
      }
    }

    const splatTex = new THREE.DataTexture(splatData, res, res, THREE.RGBAFormat);
    splatTex.needsUpdate = true;
    // flipY = true so row 0 of splatmap data (grid row 0 = UV v=1) maps to the
    // top of the GPU texture, matching the PlaneGeometry UV layout after XY→XZ rotation.
    splatTex.flipY = true;
    splatTex.minFilter = THREE.LinearFilter;
    splatTex.magFilter = THREE.LinearFilter;
    splatTex.wrapS = THREE.ClampToEdgeWrapping;
    splatTex.wrapT = THREE.ClampToEdgeWrapping;

    // Resolve layer textures
    const layerTextures: (THREE.Texture | null)[] = [];
    const uvScales: number[] = [];
    for (let i = 0; i < 4; i++) {
      const layer = layers[i];
      if (layer?.materialAssetId && resolveTexture) {
        const tex = resolveTexture(layer.materialAssetId);
        layerTextures.push(tex);
      } else {
        layerTextures.push(null);
      }
      uvScales.push(layer?.uvScale ?? 10);
    }

    // If no real textures resolved, generate solid-color textures from layer base colors
    const hasAnyTexture = layerTextures.some(t => t !== null);
    if (!hasAnyTexture) {
      for (let i = 0; i < Math.min(4, layers.length); i++) {
        const layer = layers[i];
        if (!layer) continue;
        // Generate a solid-color texture using the material's base color or a procedural palette
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        let color = TerrainMeshBuilder._layerFallbackColor(i);
        if (layer.materialAssetId && resolveTexture) {
          // resolveTexture might return a solid-color canvas (from our resolver)
          const tex = resolveTexture(layer.materialAssetId);
          if (tex) { layerTextures[i] = tex; continue; }
        }
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        layerTextures[i] = tex;
      }
    }

    // Build custom ShaderMaterial for splatmap blending
    const defaultTex = TerrainMeshBuilder._checkerTexture();

    const uniforms: Record<string, THREE.IUniform> = {
      splatMap: { value: splatTex },
      layer0Tex: { value: layerTextures[0] ?? defaultTex },
      layer1Tex: { value: layerTextures[1] ?? defaultTex },
      layer2Tex: { value: layerTextures[2] ?? defaultTex },
      layer3Tex: { value: layerTextures[3] ?? defaultTex },
      uvScale0: { value: uvScales[0] },
      uvScale1: { value: uvScales[1] },
      uvScale2: { value: uvScales[2] },
      uvScale3: { value: uvScales[3] },
      terrainSize: { value: new THREE.Vector2(data.sizeX, data.sizeZ) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D splatMap;
        uniform sampler2D layer0Tex;
        uniform sampler2D layer1Tex;
        uniform sampler2D layer2Tex;
        uniform sampler2D layer3Tex;
        uniform float uvScale0;
        uniform float uvScale1;
        uniform float uvScale2;
        uniform float uvScale3;
        uniform vec2 terrainSize;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          vec4 splat = texture2D(splatMap, vUv);

          // World-space UVs for tiling
          vec2 worldUV = vWorldPos.xz / terrainSize;

          vec3 c0 = texture2D(layer0Tex, worldUV * uvScale0).rgb;
          vec3 c1 = texture2D(layer1Tex, worldUV * uvScale1).rgb;
          vec3 c2 = texture2D(layer2Tex, worldUV * uvScale2).rgb;
          vec3 c3 = texture2D(layer3Tex, worldUV * uvScale3).rgb;

          float total = splat.r + splat.g + splat.b + splat.a;
          if (total < 0.001) total = 1.0;

          vec3 color = (c0 * splat.r + c1 * splat.g + c2 * splat.b + c3 * splat.a) / total;

          // Simple hemisphere lighting
          float NdotL = dot(vNormal, normalize(vec3(0.5, 1.0, 0.3)));
          float light = 0.4 + 0.6 * max(NdotL, 0.0);

          gl_FragColor = vec4(color * light, 1.0);
        }
      `,
      side: THREE.FrontSide,
    });

    return mat;
  }

  /** Generate a default dev-style material for terrain */
  private static _defaultMaterial(data: TerrainData): THREE.MeshStandardMaterial {
    const tex = TerrainMeshBuilder._devTexture(data);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.FrontSide,
    });
  }

  /** Generate a dev checker texture for terrain */
  private static _devTexture(data: TerrainData): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const tileCount = 16;
    const tileSize = size / tileCount;
    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#7a8a5a' : '#6a7a4a';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
    ctx.strokeStyle = '#8a9a6a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= tileCount; i++) {
      const pos = i * tileSize;
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(data.sizeX / 10, data.sizeZ / 10);
    return tex;
  }

  /** Simple white checker for missing layer textures */
  private static _checkerTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#aaa';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#888';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /** Fallback palette colors for layers without materials */
  static _layerFallbackColor(index: number): string {
    const palette = ['#7a8a5a', '#b08850', '#888888', '#e0d080'];
    return palette[index % palette.length];
  }

  /** Update the splatmap DataTexture in-place on a ShaderMaterial (fast path for painting) */
  static updateSplatmapTexture(material: THREE.Material, data: TerrainData): void {
    if (!(material instanceof THREE.ShaderMaterial)) return;
    const splatUniform = material.uniforms?.splatMap;
    if (!splatUniform) return;

    const res = data.resolution;
    const layers = data.layers;
    const tex = splatUniform.value as THREE.DataTexture;
    if (!tex || !tex.image?.data) return;

    const pixels = tex.image.data as Uint8Array;
    for (let i = 0; i < res * res; i++) {
      for (let ch = 0; ch < 4; ch++) {
        const layer = layers[ch];
        if (!layer) { pixels[i * 4 + ch] = 0; continue; }
        const weights = data.splatmaps.get(layer.id);
        pixels[i * 4 + ch] = weights ? Math.round(clamp(weights[i], 0, 1) * 255) : (ch === 0 ? 255 : 0);
      }
    }
    tex.needsUpdate = true;
  }
}

// ============================================================
//  Sculpt Brush Engine
// ============================================================

export class SculptBrush {
  /** Apply a sculpt stroke at (cx, cz) in terrain-local coordinates */
  static apply(
    data: TerrainData,
    tool: SculptTool,
    cx: number,
    cz: number,
    radius: number,
    strength: number,
    dt: number,
  ): void {
    const { resolution, sizeX, sizeZ, heightmap } = data;
    const hx = sizeX / 2;
    const hz = sizeZ / 2;
    const cellSizeX = sizeX / (resolution - 1);
    const cellSizeZ = sizeZ / (resolution - 1);

    // Convert world pos to grid coords
    const gridCX = (cx + hx) / cellSizeX;
    const gridCZ = (cz + hz) / cellSizeZ;
    const gridRadius = radius / cellSizeX;

    const rmin = Math.max(0, Math.floor(gridCZ - gridRadius));
    const rmax = Math.min(resolution - 1, Math.ceil(gridCZ + gridRadius));
    const cmin = Math.max(0, Math.floor(gridCX - gridRadius));
    const cmax = Math.min(resolution - 1, Math.ceil(gridCX + gridRadius));

    // For flatten: sample center height
    let centerH = 0;
    if (tool === 'flatten') {
      const ci = clamp(Math.round(gridCZ), 0, resolution - 1) * resolution + clamp(Math.round(gridCX), 0, resolution - 1);
      centerH = heightmap[ci] ?? 0;
    }

    // For smooth: collect neighbour averages
    const str = strength * dt;

    for (let row = rmin; row <= rmax; row++) {
      for (let col = cmin; col <= cmax; col++) {
        const dx = col - gridCX;
        const dz = row - gridCZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > gridRadius) continue;

        // Falloff: smooth cosine falloff
        const t = dist / gridRadius;
        const falloff = 0.5 * (1 + Math.cos(Math.PI * t));
        const idx = row * resolution + col;

        switch (tool) {
          case 'raise':
            heightmap[idx] = clamp(heightmap[idx] + str * falloff, 0, 1);
            break;
          case 'lower':
            heightmap[idx] = clamp(heightmap[idx] - str * falloff, 0, 1);
            break;
          case 'flatten':
            heightmap[idx] += (centerH - heightmap[idx]) * falloff * clamp(str * 5, 0, 1);
            break;
          case 'smooth': {
            // Average of neighbours
            let sum = 0; let cnt = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              const nr = row + dr; const nc = col + dc;
              if (nr >= 0 && nr < resolution && nc >= 0 && nc < resolution) {
                sum += heightmap[nr * resolution + nc]; cnt++;
              }
            }
            const avg = sum / cnt;
            heightmap[idx] += (avg - heightmap[idx]) * falloff * clamp(str * 3, 0, 1);
            break;
          }
          case 'erosion': {
            // Simple thermal erosion: move height to lower neighbours
            let lowestH = heightmap[idx];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = row + dr; const nc = col + dc;
              if (nr >= 0 && nr < resolution && nc >= 0 && nc < resolution) {
                lowestH = Math.min(lowestH, heightmap[nr * resolution + nc]);
              }
            }
            heightmap[idx] += (lowestH - heightmap[idx]) * falloff * str * 0.5;
            break;
          }
          case 'noise': {
            const noise = (Math.random() - 0.5) * 2;
            heightmap[idx] = clamp(heightmap[idx] + noise * str * falloff * 0.3, 0, 1);
            break;
          }
        }
      }
    }
  }
}

// ============================================================
//  Paint Brush Engine
// ============================================================

export class PaintBrush {
  /** Paint a layer weight at (cx, cz) in terrain-local coordinates */
  static apply(
    data: TerrainData,
    layerId: string,
    cx: number,
    cz: number,
    radius: number,
    strength: number,
    erase: boolean,
    dt: number,
  ): void {
    const { resolution, sizeX, sizeZ, splatmaps } = data;
    let weights = splatmaps.get(layerId);
    if (!weights) {
      weights = new Float32Array(resolution * resolution);
      // If this is base layer, fill with 1
      const layer = data.layers.find(l => l.id === layerId);
      if (layer?.isBase) weights.fill(1);
      splatmaps.set(layerId, weights);
    }

    const hx = sizeX / 2;
    const hz = sizeZ / 2;
    const cellSize = sizeX / (resolution - 1);
    const gridCX = (cx + hx) / cellSize;
    const gridCZ = (cz + hz) / cellSize;
    const gridRadius = radius / cellSize;

    const rmin = Math.max(0, Math.floor(gridCZ - gridRadius));
    const rmax = Math.min(resolution - 1, Math.ceil(gridCZ + gridRadius));
    const cmin = Math.max(0, Math.floor(gridCX - gridRadius));
    const cmax = Math.min(resolution - 1, Math.ceil(gridCX + gridRadius));

    const str = strength * dt;

    for (let row = rmin; row <= rmax; row++) {
      for (let col = cmin; col <= cmax; col++) {
        const dx = col - gridCX;
        const dz = row - gridCZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > gridRadius) continue;

        const t = dist / gridRadius;
        const falloff = 0.5 * (1 + Math.cos(Math.PI * t));
        const idx = row * resolution + col;

        if (erase) {
          weights[idx] = clamp(weights[idx] - str * falloff, 0, 1);
        } else {
          weights[idx] = clamp(weights[idx] + str * falloff, 0, 1);
        }

        // Normalize other layers so total <= 1
        let total = 0;
        for (const [lid, w] of splatmaps) {
          total += w[idx];
        }
        if (total > 1) {
          const scale = 1 / total;
          for (const [lid, w] of splatmaps) {
            w[idx] *= scale;
          }
        }
      }
    }
  }
}

// ============================================================
//  TerrainEditorPanel — Main editor UI
// ============================================================

export class TerrainEditorPanel {
  private _container: HTMLElement;
  private _root: HTMLDivElement;

  // Callbacks
  private _onDataChanged: ((data: TerrainData) => void) | null = null;
  private _onLayerMaterialRequest: ((layerId: string) => void) | null = null;

  // State
  private _data: TerrainData;
  private _mode: TerrainMode = 'sculpt';
  private _sculptTool: SculptTool = 'raise';
  private _paintTool: PaintTool = 'paint';
  private _activeLayerId: string = '';
  private _brushRadius: number = 5;
  private _brushStrength: number = 0.5;

  constructor(
    container: HTMLElement,
    data: TerrainData,
    callbacks?: {
      onDataChanged?: (data: TerrainData) => void;
      onLayerMaterialRequest?: (layerId: string) => void;
    },
  ) {
    this._container = container;
    this._data = data;
    this._onDataChanged = callbacks?.onDataChanged ?? null;
    this._onLayerMaterialRequest = callbacks?.onLayerMaterialRequest ?? null;
    if (data.layers.length > 0) this._activeLayerId = data.layers[0].id;

    this._root = document.createElement('div');
    this._root.className = 'terrain-editor-panel';
    this._container.appendChild(this._root);

    this._render();
  }

  get data(): TerrainData { return this._data; }
  get mode(): TerrainMode { return this._mode; }
  get sculptTool(): SculptTool { return this._sculptTool; }
  get paintTool(): PaintTool { return this._paintTool; }
  get activeLayerId(): string { return this._activeLayerId; }
  get brushRadius(): number { return this._brushRadius; }
  get brushStrength(): number { return this._brushStrength; }

  setData(data: TerrainData): void {
    this._data = data;
    this._render();
  }

  dispose(): void {
    this._root.remove();
  }

  // ---- Render the panel ----

  private _render(): void {
    this._root.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'terrain-editor-header';
    header.innerHTML = `
      <div class="terrain-editor-title">
        ${iconHTML(Icons.Map, 'md', ICON_COLORS.green)}
        <span>Terrain Editor</span>
      </div>
    `;
    this._root.appendChild(header);

    // Mode tabs
    this._renderModeTabs();

    // Mode content
    const content = document.createElement('div');
    content.className = 'terrain-editor-content';
    this._root.appendChild(content);

    switch (this._mode) {
      case 'sculpt': this._renderSculptMode(content); break;
      case 'paint': this._renderPaintMode(content); break;
      case 'manage': this._renderManageMode(content); break;
    }
  }

  private _renderModeTabs(): void {
    const tabs = document.createElement('div');
    tabs.className = 'terrain-editor-tabs';

    const modes: { mode: TerrainMode; label: string; icon: any[] }[] = [
      { mode: 'sculpt', label: 'Sculpt', icon: Icons.Move },
      { mode: 'paint', label: 'Paint', icon: Icons.Paintbrush },
      { mode: 'manage', label: 'Manage', icon: Icons.Settings },
    ];

    for (const m of modes) {
      const tab = document.createElement('button');
      tab.className = `terrain-editor-tab${this._mode === m.mode ? ' active' : ''}`;
      tab.innerHTML = `${iconHTML(m.icon, 'xs')} ${m.label}`;
      tab.addEventListener('click', () => {
        this._mode = m.mode;
        this._render();
      });
      tabs.appendChild(tab);
    }

    this._root.appendChild(tabs);
  }

  // ---- Sculpt Mode ----

  private _renderSculptMode(container: HTMLElement): void {
    // Tool buttons
    const toolSection = this._createSection('Tools', container);
    const toolGrid = document.createElement('div');
    toolGrid.className = 'terrain-tool-grid';

    const tools: { tool: SculptTool; label: string; desc: string }[] = [
      { tool: 'raise', label: 'Raise', desc: 'Raise terrain height' },
      { tool: 'lower', label: 'Lower', desc: 'Lower terrain height' },
      { tool: 'flatten', label: 'Flatten', desc: 'Flatten to target height' },
      { tool: 'smooth', label: 'Smooth', desc: 'Smooth terrain surface' },
      { tool: 'erosion', label: 'Erosion', desc: 'Simulate thermal erosion' },
      { tool: 'noise', label: 'Noise', desc: 'Add random noise' },
    ];

    for (const t of tools) {
      const btn = document.createElement('button');
      btn.className = `terrain-tool-btn${this._sculptTool === t.tool ? ' active' : ''}`;
      btn.title = t.desc;
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        this._sculptTool = t.tool;
        this._render();
      });
      toolGrid.appendChild(btn);
    }
    toolSection.appendChild(toolGrid);

    // Brush settings
    this._renderBrushSettings(container);
  }

  // ---- Paint Mode ----

  private _renderPaintMode(container: HTMLElement): void {
    // Paint/Erase toggle
    const toolSection = this._createSection('Tools', container);
    const toolGrid = document.createElement('div');
    toolGrid.className = 'terrain-tool-grid';

    const paintTools: { tool: PaintTool; label: string }[] = [
      { tool: 'paint', label: 'Paint' },
      { tool: 'erase', label: 'Erase' },
    ];

    for (const t of paintTools) {
      const btn = document.createElement('button');
      btn.className = `terrain-tool-btn${this._paintTool === t.tool ? ' active' : ''}`;
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        this._paintTool = t.tool;
        this._render();
      });
      toolGrid.appendChild(btn);
    }
    toolSection.appendChild(toolGrid);

    // Brush settings
    this._renderBrushSettings(container);

    // Layers
    this._renderLayers(container);
  }

  // ---- Manage Mode ----

  private _renderManageMode(container: HTMLElement): void {
    const section = this._createSection('Terrain Settings', container);

    // Resolution
    this._addNumberInput(section, 'Resolution', this._data.resolution, 17, 513, 16, (v) => {
      // Ensure odd number for center vertex
      const newRes = Math.max(17, Math.min(513, v));
      if (newRes !== this._data.resolution) {
        this._resizeTerrain(newRes);
      }
    });

    // Size X
    this._addNumberInput(section, 'Size X', this._data.sizeX, 10, 10000, 10, (v) => {
      this._data.sizeX = v;
      this._emitChange();
    });

    // Size Z
    this._addNumberInput(section, 'Size Z', this._data.sizeZ, 10, 10000, 10, (v) => {
      this._data.sizeZ = v;
      this._emitChange();
    });

    // Max Height
    this._addNumberInput(section, 'Max Height', this._data.maxHeight, 1, 5000, 1, (v) => {
      this._data.maxHeight = v;
      this._emitChange();
    });

    // Collision toggle
    this._addToggle(section, 'Has Collision', this._data.hasCollision, (v) => {
      this._data.hasCollision = v;
      this._emitChange();
    });

    // Import/Export section
    const ioSection = this._createSection('Import / Export', container);

    const importBtn = document.createElement('button');
    importBtn.className = 'terrain-action-btn';
    importBtn.textContent = 'Import Heightmap…';
    importBtn.addEventListener('click', () => this._importHeightmap());
    ioSection.appendChild(importBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'terrain-action-btn';
    exportBtn.textContent = 'Export Heightmap';
    exportBtn.addEventListener('click', () => this._exportHeightmap());
    ioSection.appendChild(exportBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'terrain-action-btn danger';
    resetBtn.textContent = 'Reset Heightmap';
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all terrain heights to flat? This cannot be undone.')) {
        this._data.heightmap.fill(0);
        this._emitChange();
      }
    });
    ioSection.appendChild(resetBtn);

    // Layers management
    this._renderLayers(container);
  }

  // ---- Brush Settings ----

  private _renderBrushSettings(container: HTMLElement): void {
    const section = this._createSection('Brush', container);

    // Radius
    this._addSlider(section, 'Radius', this._brushRadius, 0.5, 50, 0.5, (v) => {
      this._brushRadius = v;
    });

    // Strength
    this._addSlider(section, 'Strength', this._brushStrength, 0.01, 2.0, 0.01, (v) => {
      this._brushStrength = v;
    });
  }

  // ---- Layers ----

  private _renderLayers(container: HTMLElement): void {
    const section = this._createSection('Material Layers', container);

    // Add layer button
    const addBtn = document.createElement('button');
    addBtn.className = 'terrain-action-btn';
    addBtn.innerHTML = `${iconHTML(Icons.Plus, 'xs')} Add Layer`;
    addBtn.addEventListener('click', () => {
      const layer: TerrainLayer = {
        id: generateId(),
        name: `Layer ${this._data.layers.length + 1}`,
        materialAssetId: null,
        uvScale: 10,
        blendSharpness: 1,
        isBase: this._data.layers.length === 0,
      };
      this._data.layers.push(layer);

      // Create default splatmap
      const weights = new Float32Array(this._data.resolution * this._data.resolution);
      if (layer.isBase) weights.fill(1);
      this._data.splatmaps.set(layer.id, weights);

      if (!this._activeLayerId) this._activeLayerId = layer.id;
      this._emitChange();
      this._render();
    });
    section.appendChild(addBtn);

    // Layer list
    const list = document.createElement('div');
    list.className = 'terrain-layer-list';

    for (const layer of this._data.layers) {
      const item = document.createElement('div');
      item.className = `terrain-layer-item${this._activeLayerId === layer.id ? ' active' : ''}`;

      item.addEventListener('click', () => {
        this._activeLayerId = layer.id;
        this._render();
      });

      // Color swatch / thumbnail
      const swatch = document.createElement('div');
      swatch.className = 'terrain-layer-swatch';
      swatch.style.background = layer.materialAssetId ? 'var(--color-blue)' : '#666';
      item.appendChild(swatch);

      // Info
      const info = document.createElement('div');
      info.className = 'terrain-layer-info';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'terrain-layer-name-wrap';

      const nameInput = document.createElement('input');
      nameInput.className = 'terrain-layer-name';
      nameInput.type = 'text';
      nameInput.value = layer.name;
      nameInput.addEventListener('change', () => {
        layer.name = nameInput.value;
        this._emitChange();
      });
      nameInput.addEventListener('click', (e) => e.stopPropagation());
      nameWrap.appendChild(nameInput);

      if (layer.isBase) {
        const badge = document.createElement('span');
        badge.className = 'terrain-layer-badge';
        badge.textContent = 'BASE';
        nameWrap.appendChild(badge);
      }

      info.appendChild(nameWrap);

      // Material assignment button
      const matBtn = document.createElement('button');
      matBtn.className = 'terrain-layer-mat-btn';
      // Show the assigned material name if available
      const mgr = MeshAssetManager.getInstance();
      const assignedMat = layer.materialAssetId ? mgr?.getMaterial(layer.materialAssetId) : null;
      matBtn.textContent = assignedMat ? `✓ ${assignedMat.assetName}` : 'Assign Material…';
      if (assignedMat) {
        // Show material's base color on the swatch
        swatch.style.background = assignedMat.materialData.baseColor || 'var(--color-blue)';
      }
      matBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showMaterialPicker(matBtn, layer);
      });
      info.appendChild(matBtn);

      item.appendChild(info);

      // Delete button (not for base)
      if (!layer.isBase) {
        const delBtn = document.createElement('button');
        delBtn.className = 'terrain-layer-del';
        delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs', ICON_COLORS.error);
        delBtn.title = 'Remove layer';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = this._data.layers.indexOf(layer);
          if (idx >= 0) this._data.layers.splice(idx, 1);
          this._data.splatmaps.delete(layer.id);
          if (this._activeLayerId === layer.id) {
            this._activeLayerId = this._data.layers[0]?.id ?? '';
          }
          this._emitChange();
          this._render();
        });
        item.appendChild(delBtn);
      }

      // UV Scale slider (in expanded state)
      if (this._activeLayerId === layer.id) {
        const details = document.createElement('div');
        details.className = 'terrain-layer-details';
        this._addSlider(details, 'UV Scale', layer.uvScale, 1, 100, 0.5, (v) => {
          layer.uvScale = v;
          this._emitChange();
        });
        this._addSlider(details, 'Blend Sharpness', layer.blendSharpness, 0.1, 10, 0.1, (v) => {
          layer.blendSharpness = v;
          this._emitChange();
        });
        item.appendChild(details);
      }

      list.appendChild(item);
    }

    section.appendChild(list);
  }

  // ---- UI Helpers ----

  private _createSection(title: string, parent: HTMLElement): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'terrain-section';
    const h = document.createElement('div');
    h.className = 'terrain-section-title';
    h.textContent = title;
    section.appendChild(h);
    parent.appendChild(section);
    return section;
  }

  private _addSlider(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
    const row = document.createElement('div');
    row.className = 'terrain-prop-row';

    const lbl = document.createElement('label');
    lbl.className = 'terrain-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.className = 'terrain-prop-input-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'terrain-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'terrain-num-input';
    numInput.min = String(min);
    numInput.max = String(max);
    numInput.step = String(step);
    numInput.value = String(value);

    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      onChange(parseFloat(slider.value));
    });
    numInput.addEventListener('change', () => {
      slider.value = numInput.value;
      onChange(parseFloat(numInput.value));
    });

    wrap.appendChild(slider);
    wrap.appendChild(numInput);
    row.appendChild(wrap);
    parent.appendChild(row);
  }

  private _addNumberInput(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
    const row = document.createElement('div');
    row.className = 'terrain-prop-row';

    const lbl = document.createElement('label');
    lbl.className = 'terrain-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'terrain-num-input wide';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => {
      onChange(parseFloat(input.value));
    });

    row.appendChild(input);
    parent.appendChild(row);
  }

  private _addToggle(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement('div');
    row.className = 'terrain-prop-row';

    const lbl = document.createElement('label');
    lbl.className = 'terrain-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = value;
    cb.addEventListener('change', () => onChange(cb.checked));

    row.appendChild(cb);
    parent.appendChild(row);
  }

  // ---- Heightmap Import/Export ----

  private _importHeightmap(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const res = this._data.resolution;
          canvas.width = res;
          canvas.height = res;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, res, res);
          const imageData = ctx.getImageData(0, 0, res, res);
          const pixels = imageData.data;

          for (let i = 0; i < res * res; i++) {
            // Use red channel as height
            this._data.heightmap[i] = pixels[i * 4] / 255;
          }

          this._emitChange();
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  private _exportHeightmap(): void {
    const res = this._data.resolution;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(res, res);

    for (let i = 0; i < res * res; i++) {
      const v = Math.round(clamp(this._data.heightmap[i], 0, 1) * 255);
      imageData.data[i * 4] = v;
      imageData.data[i * 4 + 1] = v;
      imageData.data[i * 4 + 2] = v;
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    const link = document.createElement('a');
    link.download = 'terrain_heightmap.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ---- Resize ----

  private _resizeTerrain(newRes: number): void {
    const oldRes = this._data.resolution;
    const oldHM = this._data.heightmap;

    // Bilinear resample heightmap
    const newHM = new Float32Array(newRes * newRes);
    for (let row = 0; row < newRes; row++) {
      for (let col = 0; col < newRes; col++) {
        const srcR = (row / (newRes - 1)) * (oldRes - 1);
        const srcC = (col / (newRes - 1)) * (oldRes - 1);

        const r0 = Math.floor(srcR);
        const c0 = Math.floor(srcC);
        const r1 = Math.min(r0 + 1, oldRes - 1);
        const c1 = Math.min(c0 + 1, oldRes - 1);
        const tr = srcR - r0;
        const tc = srcC - c0;

        const h00 = oldHM[r0 * oldRes + c0];
        const h10 = oldHM[r1 * oldRes + c0];
        const h01 = oldHM[r0 * oldRes + c1];
        const h11 = oldHM[r1 * oldRes + c1];

        newHM[row * newRes + col] = (1 - tr) * (1 - tc) * h00 + tr * (1 - tc) * h10 +
          (1 - tr) * tc * h01 + tr * tc * h11;
      }
    }

    // Resample splatmaps
    const newSplats = new Map<string, Float32Array>();
    for (const [id, old] of this._data.splatmaps) {
      const ns = new Float32Array(newRes * newRes);
      for (let row = 0; row < newRes; row++) {
        for (let col = 0; col < newRes; col++) {
          const srcR = (row / (newRes - 1)) * (oldRes - 1);
          const srcC = (col / (newRes - 1)) * (oldRes - 1);
          const r0 = Math.floor(srcR);
          const c0 = Math.floor(srcC);
          const r1 = Math.min(r0 + 1, oldRes - 1);
          const c1 = Math.min(c0 + 1, oldRes - 1);
          const tr = srcR - r0;
          const tc = srcC - c0;
          ns[row * newRes + col] =
            (1 - tr) * (1 - tc) * old[r0 * oldRes + c0] +
            tr * (1 - tc) * old[r1 * oldRes + c0] +
            (1 - tr) * tc * old[r0 * oldRes + c1] +
            tr * tc * old[r1 * oldRes + c1];
        }
      }
      newSplats.set(id, ns);
    }

    this._data.resolution = newRes;
    this._data.heightmap = newHM;
    this._data.splatmaps = newSplats;
    this._emitChange();
    this._render();
  }

  // ---- Material Picker Popup ----

  /** Show a searchable popup to pick a material for a given terrain layer */
  private _showMaterialPicker(anchorEl: HTMLElement, layer: TerrainLayer): void {
    // Close any existing picker
    document.querySelectorAll('.terrain-mat-picker-popup').forEach(el => el.remove());

    const mgr = MeshAssetManager.getInstance();
    const allMats = mgr?.allMaterials ?? [];

    const popup = document.createElement('div');
    popup.className = 'terrain-mat-picker-popup';
    const anchorRect = anchorEl.getBoundingClientRect();
    Object.assign(popup.style, {
      position: 'fixed',
      left: `${anchorRect.left}px`,
      top: `${anchorRect.bottom + 4}px`,
      width: '260px',
      maxHeight: '320px',
      overflowY: 'auto',
      background: 'var(--bg-dark, #1a1a2e)',
      border: '1px solid var(--border, #3f3f5a)',
      borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      zIndex: '10000',
      padding: '6px',
    });

    // Search bar
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search materials...';
    Object.assign(searchInput.style, {
      width: '100%',
      boxSizing: 'border-box',
      marginBottom: '4px',
      padding: '5px 8px',
      background: 'var(--bg-input, #2a2a3e)',
      border: '1px solid var(--border, #3f3f5a)',
      borderRadius: '4px',
      color: 'inherit',
      fontSize: '11px',
      outline: 'none',
    });
    popup.appendChild(searchInput);

    const listEl = document.createElement('div');
    popup.appendChild(listEl);

    const renderList = (filter: string) => {
      listEl.innerHTML = '';

      // "(None)" option to clear assignment
      if (!filter) {
        const noneItem = this._createMaterialPickerItem(null, '— None —', '#666');
        noneItem.addEventListener('click', () => {
          layer.materialAssetId = null;
          this._emitChange();
          this._render();
          close();
        });
        listEl.appendChild(noneItem);
      }

      const filtered = filter
        ? allMats.filter(m => m.assetName.toLowerCase().includes(filter.toLowerCase()))
        : allMats;

      for (const mat of filtered) {
        const color = mat.materialData.baseColor || '#888';
        const item = this._createMaterialPickerItem(color, mat.assetName, color);
        item.addEventListener('click', () => {
          layer.materialAssetId = mat.assetId;
          this._emitChange();
          this._render();
          close();
        });
        listEl.appendChild(item);
      }

      if (filtered.length === 0 && filter) {
        const empty = document.createElement('div');
        Object.assign(empty.style, {
          padding: '12px',
          textAlign: 'center',
          color: 'var(--text-dim, #888)',
          fontSize: '11px',
        });
        empty.textContent = 'No matching materials.';
        listEl.appendChild(empty);
      }

      if (allMats.length === 0 && !filter) {
        const empty = document.createElement('div');
        Object.assign(empty.style, {
          padding: '12px',
          textAlign: 'center',
          color: 'var(--text-dim, #888)',
          fontSize: '11px',
        });
        empty.textContent = 'No materials in project. Import a mesh to create materials.';
        listEl.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    const close = () => {
      popup.remove();
      document.removeEventListener('mousedown', outsideHandler);
    };

    const outsideHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) close();
    };
    // Delay so current click doesn't immediately close
    setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);

    document.body.appendChild(popup);
    setTimeout(() => searchInput.focus(), 50);
  }

  /** Create a single row element for the material picker popup */
  private _createMaterialPickerItem(color: string | null, label: string, swatchColor: string): HTMLElement {
    const item = document.createElement('div');
    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '5px 8px',
      cursor: 'pointer',
      fontSize: '12px',
      borderRadius: '3px',
      color: 'var(--text, #e0e0f0)',
    });
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.08)'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });

    // Color swatch
    const swatch = document.createElement('div');
    Object.assign(swatch.style, {
      width: '16px',
      height: '16px',
      borderRadius: '3px',
      border: '1px solid rgba(255,255,255,0.15)',
      background: swatchColor,
      flexShrink: '0',
    });
    item.appendChild(swatch);

    // Label
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.overflow = 'hidden';
    lbl.style.textOverflow = 'ellipsis';
    lbl.style.whiteSpace = 'nowrap';
    item.appendChild(lbl);

    return item;
  }

  // ---- Emitters ----

  private _emitChange(): void {
    this._onDataChanged?.(this._data);
  }
}

// ============================================================
//  Default Terrain Data factory
// ============================================================

export function createDefaultTerrainData(): TerrainData {
  const resolution = 129; // 128 segments + 1
  const heightmap = new Float32Array(resolution * resolution);
  const baseLayer: TerrainLayer = {
    id: generateId(),
    name: 'Default',
    materialAssetId: null,
    uvScale: 10,
    blendSharpness: 1,
    isBase: true,
  };
  const splatmaps = new Map<string, Float32Array>();
  const baseWeights = new Float32Array(resolution * resolution);
  baseWeights.fill(1);
  splatmaps.set(baseLayer.id, baseWeights);

  return {
    resolution,
    sizeX: 200,
    sizeZ: 200,
    maxHeight: 100,
    heightmap,
    splatmaps,
    layers: [baseLayer],
    hasCollision: true,
  };
}
