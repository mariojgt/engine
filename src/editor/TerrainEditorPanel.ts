// ============================================================
//  TerrainEditorPanel — Dockable UI for terrain sculpting,
//  texture painting, and foliage placement.
//
//  Follows the same DOM-based panel pattern as TileEditorPanel
//  and ParticleEditorPanel. Styled with Catppuccin Mocha tokens.
// ============================================================

import * as THREE from 'three';
import { iconHTML, Icons, ICON_COLORS } from './icons';
import { TerrainActor } from './scene/TerrainActor';
import { TerrainInteractionHandler } from './viewport/TerrainInteractionHandler';
import type { SceneCompositionManager } from './scene/SceneCompositionManager';
import type { TextureLibrary } from './TextureLibrary';
import type { MeshAssetManager, MaterialAssetJSON } from './MeshAsset';
import {
  type SculptTool,
  type TerrainMode,
  type BrushFalloff,
  type TerrainLayerDef,
  type FoliageTypeDef,
  defaultTerrainLayer,
  defaultFoliageType,
} from '../engine/TerrainData';

// ---- Style constants ----
const S = {
  bg: '#1e1e2e',
  surface: '#313244',
  overlay: '#45475a',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  muted: '#585b70',
  accent: '#89b4fa',
  green: '#a6e3a1',
  red: '#f38ba8',
  yellow: '#f9e2af',
  peach: '#fab387',
  font: 'Inter, sans-serif',
} as const;

export class TerrainEditorPanel {
  public container: HTMLElement;
  private _root: HTMLElement;

  // ---- References ----
  private _composition: SceneCompositionManager | null = null;
  private _interaction: TerrainInteractionHandler | null = null;
  private _textureLibrary: TextureLibrary | null = null;
  private _meshManager: MeshAssetManager | null = null;
  private _terrain: TerrainActor | null = null;

  // ---- State ----
  private _mode: TerrainMode = 'sculpt';
  private _sculptTool: SculptTool = 'raise';
  private _activeLayerIndex = 0;
  private _activeFoliageIndex = -1;

  // ---- UI refs ----
  private _brushRadiusSlider: HTMLInputElement | null = null;
  private _brushStrengthSlider: HTMLInputElement | null = null;
  private _brushRadiusLabel: HTMLSpanElement | null = null;
  private _brushStrengthLabel: HTMLSpanElement | null = null;
  private _falloffSelect: HTMLSelectElement | null = null;
  private _layerListEl: HTMLElement | null = null;
  private _foliageListEl: HTMLElement | null = null;
  private _sculptToolsEl: HTMLElement | null = null;
  private _paintSection: HTMLElement | null = null;
  private _foliageSection: HTMLElement | null = null;
  private _sculptSection: HTMLElement | null = null;
  private _statusEl: HTMLElement | null = null;
  private _noTerrainEl: HTMLElement | null = null;
  private _editorContent: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this._root = document.createElement('div');
    this._root.style.cssText = `display:flex;flex-direction:column;height:100%;background:${S.bg};color:${S.text};font-family:${S.font};font-size:12px;overflow-y:auto;`;
    container.appendChild(this._root);
    this._build();
  }

  // ============================================================
  //  Setup
  // ============================================================

  setCompositionManager(comp: SceneCompositionManager): void {
    this._composition = comp;
    this._findTerrain();

    // Listen for changes (terrain added/removed)
    comp.on('changed', () => this._findTerrain());
  }

  setInteractionHandler(handler: TerrainInteractionHandler): void {
    this._interaction = handler;
  }

  setTextureLibrary(lib: TextureLibrary): void {
    this._textureLibrary = lib;
  }

  setMeshManager(mgr: MeshAssetManager): void {
    this._meshManager = mgr;
    // Re-render layers when materials change
    mgr.onChanged(() => this._refreshLayerList());
    // Also wire into terrain actor for foliage loading
    if (this._terrain) {
      this._terrain.setMeshAssetManager(mgr);
    }
  }

  // ============================================================
  //  Find terrain actor
  // ============================================================

  private _findTerrain(): void {
    if (!this._composition) return;

    let terrain: TerrainActor | null = null;
    for (const entry of this._composition.actors.values()) {
      if (entry.type === 'Terrain' as any) {
        terrain = entry.actor as TerrainActor;
        break;
      }
    }

    const changed = terrain !== this._terrain;
    this._terrain = terrain;

    if (changed) {
      this._updateTerrainVisibility();
      if (terrain && this._interaction) {
        this._interaction.activate(terrain);
      } else if (!terrain && this._interaction) {
        this._interaction.deactivate();
      }
      // Wire mesh asset manager into terrain for foliage mesh loading
      if (terrain && this._meshManager) {
        terrain.setMeshAssetManager(this._meshManager);
      }
    }
  }

  private _updateTerrainVisibility(): void {
    if (this._noTerrainEl && this._editorContent) {
      if (this._terrain) {
        this._noTerrainEl.style.display = 'none';
        this._editorContent.style.display = 'flex';
      } else {
        this._noTerrainEl.style.display = 'flex';
        this._editorContent.style.display = 'none';
      }
    }
  }

  // ============================================================
  //  Build UI
  // ============================================================

  private _build(): void {
    this._root.innerHTML = '';

    // ---- Header ----
    const header = this._el('div', `display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid ${S.surface};gap:8px;`);
    header.innerHTML = `${iconHTML(Icons.Mountain, 'xs', ICON_COLORS.muted)}<span style="font-weight:600;flex:1;letter-spacing:0.5px;">TERRAIN EDITOR</span>`;
    this._root.appendChild(header);

    // ---- No terrain message ----
    this._noTerrainEl = this._el('div', `display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:12px;color:${S.muted};`);
    this._noTerrainEl.innerHTML = `
      ${iconHTML(Icons.Mountain, 'xl', S.muted)}
      <span style="font-size:13px;text-align:center;">No terrain in scene</span>
      <span style="font-size:11px;text-align:center;color:${S.subtext};">Add a Terrain actor from the<br/>World Outliner → Add Actor menu</span>
    `;
    this._root.appendChild(this._noTerrainEl);

    // ---- Editor content ----
    this._editorContent = this._el('div', `display:none;flex-direction:column;flex:1;`);
    this._root.appendChild(this._editorContent);

    // Mode tabs
    this._buildModeTabs();

    // Brush settings
    this._buildBrushSection();

    // Sculpt tools
    this._buildSculptSection();

    // Paint layers
    this._buildPaintSection();

    // Foliage
    this._buildFoliageSection();

    // Import/Export
    this._buildImportSection();

    // Status bar
    this._statusEl = this._el('div', `padding:6px 10px;font-size:10px;color:${S.muted};border-top:1px solid ${S.surface};`);
    this._statusEl.textContent = 'Ready';
    this._editorContent.appendChild(this._statusEl);

    // Initial tab state
    this._switchMode('sculpt');
  }

  // ---- Mode Tabs ----

  private _buildModeTabs(): void {
    const bar = this._el('div', `display:flex;border-bottom:1px solid ${S.surface};`);

    const modes: { key: TerrainMode; label: string; icon: any[] }[] = [
      { key: 'sculpt', label: 'Sculpt', icon: Icons.Mountain },
      { key: 'paint', label: 'Paint', icon: Icons.Paintbrush },
      { key: 'foliage', label: 'Foliage', icon: Icons.Sparkles },
    ];

    for (const m of modes) {
      const btn = this._el('button', `
        flex:1;padding:8px 4px;background:none;border:none;border-bottom:2px solid transparent;
        color:${S.subtext};cursor:pointer;font-size:11px;font-family:${S.font};
        display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s;
      `);
      btn.innerHTML = `${iconHTML(m.icon, 'xs', S.subtext)}<span>${m.label}</span>`;
      btn.dataset.mode = m.key;

      btn.addEventListener('click', () => this._switchMode(m.key));
      btn.addEventListener('mouseenter', () => { if (this._mode !== m.key) btn.style.color = S.text; });
      btn.addEventListener('mouseleave', () => { if (this._mode !== m.key) btn.style.color = S.subtext; });

      bar.appendChild(btn);
    }

    this._editorContent!.appendChild(bar);
  }

  private _switchMode(mode: TerrainMode): void {
    this._mode = mode;
    this._interaction?.setMode(mode);

    // Update tab styles
    const tabs = this._editorContent!.querySelectorAll('[data-mode]');
    tabs.forEach(tab => {
      const el = tab as HTMLElement;
      const isActive = el.dataset.mode === mode;
      el.style.borderBottomColor = isActive ? S.accent : 'transparent';
      el.style.color = isActive ? S.accent : S.subtext;
    });

    // Show/hide sections
    if (this._sculptSection) this._sculptSection.style.display = mode === 'sculpt' ? 'block' : 'none';
    if (this._paintSection) this._paintSection.style.display = mode === 'paint' ? 'block' : 'none';
    if (this._foliageSection) this._foliageSection.style.display = mode === 'foliage' ? 'block' : 'none';
  }

  // ---- Brush Settings ----

  private _buildBrushSection(): void {
    const section = this._section('Brush Settings');

    // Radius
    const radiusRow = this._sliderRow('Radius', 1, 100, 10, 1, (v) => {
      this._interaction?.setBrush({ radius: v });
      if (this._brushRadiusLabel) this._brushRadiusLabel.textContent = String(v);
    });
    this._brushRadiusSlider = radiusRow.slider;
    this._brushRadiusLabel = radiusRow.label;
    section.appendChild(radiusRow.row);

    // Strength
    const strengthRow = this._sliderRow('Strength', 0.01, 1.0, 0.3, 0.01, (v) => {
      this._interaction?.setBrush({ strength: v });
      if (this._brushStrengthLabel) this._brushStrengthLabel.textContent = v.toFixed(2);
    });
    this._brushStrengthSlider = strengthRow.slider;
    this._brushStrengthLabel = strengthRow.label;
    section.appendChild(strengthRow.row);

    // Falloff
    const falloffRow = this._el('div', `display:flex;align-items:center;padding:4px 10px;gap:8px;`);
    falloffRow.innerHTML = `<span style="width:70px;color:${S.subtext};font-size:11px;">Falloff</span>`;
    this._falloffSelect = document.createElement('select');
    this._falloffSelect.style.cssText = `flex:1;background:${S.surface};border:1px solid ${S.overlay};color:${S.text};padding:3px 6px;border-radius:3px;font-size:11px;font-family:${S.font};`;
    const falloffs: { value: BrushFalloff; label: string }[] = [
      { value: 'smooth', label: 'Smooth' },
      { value: 'linear', label: 'Linear' },
      { value: 'sphere', label: 'Sphere' },
      { value: 'tip', label: 'Tip' },
    ];
    for (const f of falloffs) {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      this._falloffSelect.appendChild(opt);
    }
    this._falloffSelect.value = 'smooth';
    this._falloffSelect.addEventListener('change', () => {
      this._interaction?.setBrush({ falloff: this._falloffSelect!.value as BrushFalloff });
    });
    falloffRow.appendChild(this._falloffSelect);
    section.appendChild(falloffRow);

    this._editorContent!.appendChild(section);
  }

  // ---- Sculpt Tools ----

  private _buildSculptSection(): void {
    this._sculptSection = this._section('Sculpt Tools');

    const tools: { key: SculptTool; label: string; icon: string }[] = [
      { key: 'raise', label: 'Raise', icon: '▲' },
      { key: 'lower', label: 'Lower', icon: '▼' },
      { key: 'smooth', label: 'Smooth', icon: '≈' },
      { key: 'flatten', label: 'Flatten', icon: '▬' },
      { key: 'noise', label: 'Noise', icon: '~' },
    ];

    const toolBar = this._el('div', `display:flex;gap:4px;padding:6px 10px;flex-wrap:wrap;`);

    for (const tool of tools) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex:1;min-width:48px;padding:6px 4px;background:${S.surface};border:1px solid ${S.overlay};
        color:${S.text};cursor:pointer;border-radius:4px;font-size:11px;font-family:${S.font};
        display:flex;flex-direction:column;align-items:center;gap:2px;transition:all 0.1s;
      `;
      btn.innerHTML = `<span style="font-size:16px;">${tool.icon}</span><span style="font-size:10px;">${tool.label}</span>`;
      btn.dataset.tool = tool.key;

      btn.addEventListener('click', () => {
        this._sculptTool = tool.key;
        this._interaction?.setSculptTool(tool.key);
        // Update active state
        toolBar.querySelectorAll('button').forEach(b => {
          const isActive = (b as HTMLElement).dataset.tool === tool.key;
          (b as HTMLElement).style.borderColor = isActive ? S.accent : S.overlay;
          (b as HTMLElement).style.background = isActive ? S.overlay : S.surface;
        });
      });

      toolBar.appendChild(btn);
    }

    // Set first tool active
    (toolBar.children[0] as HTMLElement).style.borderColor = S.accent;
    (toolBar.children[0] as HTMLElement).style.background = S.overlay;

    this._sculptSection.appendChild(toolBar);
    this._editorContent!.appendChild(this._sculptSection);
  }

  // ---- Paint Layers ----

  private _buildPaintSection(): void {
    this._paintSection = this._section('Texture Layers');
    this._paintSection.style.display = 'none';

    this._layerListEl = this._el('div', `padding:4px 10px;display:flex;flex-direction:column;gap:4px;`);
    this._paintSection.appendChild(this._layerListEl);

    // Add layer button
    const addBtn = document.createElement('button');
    addBtn.style.cssText = `
      margin:4px 10px 8px;padding:6px 10px;background:${S.surface};border:1px solid ${S.overlay};
      color:${S.accent};cursor:pointer;border-radius:4px;font-size:11px;font-family:${S.font};
      display:flex;align-items:center;justify-content:center;gap:4px;
    `;
    addBtn.innerHTML = `${iconHTML(Icons.Plus, 'xs', S.accent)} Add Layer`;
    addBtn.addEventListener('click', () => this._addLayer());
    this._paintSection.appendChild(addBtn);

    this._editorContent!.appendChild(this._paintSection);
    this._refreshLayerList();
  }

  private _addLayer(): void {
    if (!this._terrain) return;
    this._terrain.addLayer();
    this._refreshLayerList();
  }

  private _refreshLayerList(): void {
    if (!this._layerListEl || !this._terrain) return;
    this._layerListEl.innerHTML = '';

    this._terrain.layers.forEach((layer, idx) => {
      const row = this._el('div', `
        display:flex;align-items:center;gap:6px;padding:6px 8px;
        background:${idx === this._activeLayerIndex ? S.overlay : S.surface};
        border:1px solid ${idx === this._activeLayerIndex ? S.accent : S.overlay};
        border-radius:4px;cursor:pointer;transition:all 0.1s;
      `);

      // Color preview square
      const preview = this._el('div', `width:24px;height:24px;border-radius:3px;background:#4a6741;border:1px solid ${S.overlay};flex-shrink:0;overflow:hidden;`);
      if (layer.albedoTextureId) {
        const thumb = this._getTextureThumbnail(layer.albedoTextureId);
        if (thumb) {
          preview.style.backgroundImage = `url(${thumb})`;
          preview.style.backgroundSize = 'cover';
        } else {
          // Show base color from assigned material
          const matColor = this._getMaterialColor(layer.albedoTextureId);
          if (matColor) preview.style.background = matColor;
        }
      }
      row.appendChild(preview);

      // Material dropdown select
      const select = document.createElement('select');
      select.style.cssText = `flex:1;background:${S.surface};color:${S.text};border:1px solid ${S.overlay};border-radius:3px;padding:2px 4px;font-size:11px;font-family:${S.font};cursor:pointer;min-width:0;`;

      // Default option
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '-- Select Material --';
      select.appendChild(noneOpt);

      // Populate with materials from MeshAssetManager
      const materials = this._meshManager?.allMaterials ?? [];
      for (const mat of materials) {
        const opt = document.createElement('option');
        opt.value = mat.assetId;
        opt.textContent = mat.assetName;
        if (layer.albedoTextureId === `mat:${mat.assetId}`) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }

      // Also check if current texture is a file-based one (non-material)
      if (layer.albedoTextureId && !layer.albedoTextureId.startsWith('mat:') && layer.albedoTextureId !== '__terrain_default_gray') {
        const customOpt = document.createElement('option');
        customOpt.value = layer.albedoTextureId;
        customOpt.textContent = `\ud83d\udcc1 ${layer.albedoTextureId}`;
        customOpt.selected = true;
        select.appendChild(customOpt);
      }

      select.addEventListener('change', () => {
        const matId = select.value;
        if (!matId) return;
        this._assignMaterialToLayer(idx, matId);
      });

      // Stop all events from propagating to row (prevents list rebuild)
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('mousedown', (e) => e.stopPropagation());
      select.addEventListener('mouseup', (e) => e.stopPropagation());
      select.addEventListener('pointerdown', (e) => e.stopPropagation());

      row.appendChild(select);

      // Tiling label
      const tiling = this._el('span', `font-size:10px;color:${S.muted};white-space:nowrap;`);
      tiling.textContent = `\u00d7${layer.tilingU}`;
      row.appendChild(tiling);

      // Select this layer on row click (skip if interacting with dropdown)
      row.addEventListener('click', (e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'SELECT' || tag === 'OPTION') return;
        this._activeLayerIndex = idx;
        this._interaction?.setActiveLayerIndex(idx);
        this._refreshLayerList();
      });

      // Right-click context menu for tiling/removal
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showLayerContextMenu(idx, e.clientX, e.clientY);
      });

      this._layerListEl!.appendChild(row);
    });

    // Hint text
    if (this._terrain.layers.length > 0) {
      const hint = this._el('div', `padding:2px 0;font-size:10px;color:${S.muted};text-align:center;`);
      hint.textContent = 'Select a material from the dropdown to assign it';
      this._layerListEl.appendChild(hint);
    }
  }

  private _pickLayerTexture(layerIndex: number): void {
    // Create a file picker for texture import
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file || !this._terrain) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const tex = new THREE.Texture(img);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.needsUpdate = true;

          const texId = `terrain_tex_${Date.now()}`;
          this._terrain!.setLayerTexture(layerIndex, texId, tex);
          this._refreshLayerList();
          this._setStatus(`Texture assigned to ${this._terrain!.layers[layerIndex]?.name}`);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  /** Assign a material from MeshAssetManager to a terrain layer */
  private _assignMaterialToLayer(layerIndex: number, materialAssetId: string): void {
    if (!this._terrain || !this._meshManager) return;
    const mat = this._meshManager.getMaterial(materialAssetId);
    if (!mat) return;

    const { materialData } = mat;

    // Use the material's base color texture if available
    if (materialData.baseColorMap) {
      const texAsset = this._meshManager.getTexture(materialData.baseColorMap);
      if (texAsset?.dataUrl) {
        const loader = new THREE.TextureLoader();
        const tex = loader.load(texAsset.dataUrl, () => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          const texId = `mat:${mat.assetId}`;
          this._terrain!.setLayerTexture(layerIndex, texId, tex);

          // Apply material PBR properties to the layer
          this._terrain!.updateLayer(layerIndex, {
            roughness: materialData.roughness,
            metalness: materialData.metalness,
            name: mat.assetName,
          });
          this._refreshLayerList();
          this._setStatus(`Material "${mat.assetName}" assigned to layer`);
        });
        return;
      }
    }

    // No texture — create a solid-color texture from the material's base color
    const color = new THREE.Color(materialData.baseColor);
    const size = 4;
    const data = new Uint8Array(size * size * 4);
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;

    const texId = `mat:${mat.assetId}`;
    this._terrain!.setLayerTexture(layerIndex, texId, tex);
    this._terrain!.updateLayer(layerIndex, {
      roughness: materialData.roughness,
      metalness: materialData.metalness,
      name: mat.assetName,
    });
    this._refreshLayerList();
    this._setStatus(`Material "${mat.assetName}" assigned to layer`);
  }

  /** Get the base color hex from a material-based texture ID */
  private _getMaterialColor(textureId: string): string | null {
    if (!textureId.startsWith('mat:') || !this._meshManager) return null;
    const matId = textureId.slice(4);
    const mat = this._meshManager.getMaterial(matId);
    return mat?.materialData.baseColor ?? null;
  }

  private _showLayerContextMenu(idx: number, x: number, y: number): void {
    // Simple inline context menu
    const menu = this._el('div', `
      position:fixed;left:${x}px;top:${y}px;z-index:10000;
      background:${S.surface};border:1px solid ${S.overlay};border-radius:6px;
      padding:4px 0;min-width:140px;box-shadow:0 4px 12px rgba(0,0,0,0.3);
    `);

    const items = [
      { label: 'Set Tiling...', action: () => this._setLayerTiling(idx) },
      { label: 'Rename...', action: () => this._renameLayer(idx) },
      { label: 'Remove Layer', action: () => this._removeLayer(idx) },
    ];

    for (const item of items) {
      const btn = this._el('button', `
        display:block;width:100%;padding:6px 12px;background:none;border:none;
        color:${S.text};text-align:left;cursor:pointer;font-size:11px;font-family:${S.font};
      `);
      btn.textContent = item.label;
      btn.addEventListener('click', () => { menu.remove(); item.action(); });
      btn.addEventListener('mouseenter', () => btn.style.background = S.overlay);
      btn.addEventListener('mouseleave', () => btn.style.background = 'none');
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  private _setLayerTiling(idx: number): void {
    if (!this._terrain) return;
    const layer = this._terrain.layers[idx];
    if (!layer) return;
    const val = prompt('Enter tiling value (e.g. 10):', String(layer.tilingU));
    if (val === null) return;
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return;
    this._terrain.updateLayer(idx, { tilingU: n, tilingV: n });
    this._refreshLayerList();
  }

  private _renameLayer(idx: number): void {
    if (!this._terrain) return;
    const layer = this._terrain.layers[idx];
    if (!layer) return;
    const name = prompt('Layer name:', layer.name);
    if (!name) return;
    this._terrain.updateLayer(idx, { name });
    this._refreshLayerList();
  }

  private _removeLayer(idx: number): void {
    if (!this._terrain) return;
    this._terrain.removeLayer(idx);
    if (this._activeLayerIndex >= this._terrain.layers.length) {
      this._activeLayerIndex = Math.max(0, this._terrain.layers.length - 1);
      this._interaction?.setActiveLayerIndex(this._activeLayerIndex);
    }
    this._refreshLayerList();
  }

  // ---- Foliage ----

  private _buildFoliageSection(): void {
    this._foliageSection = this._section('Foliage Types');
    this._foliageSection.style.display = 'none';

    this._foliageListEl = this._el('div', `padding:4px 10px;display:flex;flex-direction:column;gap:4px;`);
    this._foliageSection.appendChild(this._foliageListEl);

    // Add foliage type button
    const addBtn = document.createElement('button');
    addBtn.style.cssText = `
      margin:4px 10px 8px;padding:6px 10px;background:${S.surface};border:1px solid ${S.overlay};
      color:${S.green};cursor:pointer;border-radius:4px;font-size:11px;font-family:${S.font};
      display:flex;align-items:center;justify-content:center;gap:4px;
    `;
    addBtn.innerHTML = `${iconHTML(Icons.Plus, 'xs', S.green)} Add Foliage Type`;
    addBtn.addEventListener('click', () => this._addFoliageType());
    this._foliageSection.appendChild(addBtn);

    // Hint: erase with shift
    const hint = this._el('div', `padding:4px 10px;font-size:10px;color:${S.muted};`);
    hint.textContent = 'LMB to paint • Shift+LMB to erase';
    this._foliageSection.appendChild(hint);

    this._editorContent!.appendChild(this._foliageSection);
    this._refreshFoliageList();
  }

  private _addFoliageType(): void {
    if (!this._terrain) return;
    const type = defaultFoliageType();
    type.name = `Foliage_${this._terrain.foliageTypes.length}`;
    this._terrain.addFoliageType(type);
    this._refreshFoliageList();
  }

  private _refreshFoliageList(): void {
    if (!this._foliageListEl || !this._terrain) return;
    this._foliageListEl.innerHTML = '';

    this._terrain.foliageTypes.forEach((fType, idx) => {
      const isActive = idx === this._activeFoliageIndex;

      // Container for the foliage entry (header row + optional details)
      const container = this._el('div', `display:flex;flex-direction:column;gap:0;`);

      // -- Header row --
      const row = this._el('div', `
        display:flex;align-items:center;gap:6px;padding:6px 8px;
        background:${isActive ? S.overlay : S.surface};
        border:1px solid ${isActive ? S.green : S.overlay};
        border-radius:${isActive ? '4px 4px 0 0' : '4px'};
        cursor:pointer;transition:all 0.1s;
      `);

      // Icon
      const icon = this._el('span', `font-size:14px;`);
      icon.textContent = '🌿';
      row.appendChild(icon);

      // Name
      const name = this._el('span', `flex:1;font-size:11px;color:${S.text};`);
      name.textContent = fType.name;
      row.appendChild(name);

      // Density label
      const density = this._el('span', `font-size:10px;color:${S.muted};`);
      density.textContent = `d:${fType.density.toFixed(1)}`;
      row.appendChild(density);

      // Delete button
      const del = this._el('button', `background:none;border:none;color:${S.muted};cursor:pointer;padding:2px;`);
      del.innerHTML = iconHTML(Icons.X, 'xs', S.muted);
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._terrain?.removeFoliageType(fType.id);
        this._refreshFoliageList();
      });
      row.appendChild(del);

      row.addEventListener('click', (e) => {
        // Don't toggle if clicking inside a control
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'SELECT' || tag === 'OPTION' || tag === 'INPUT' || tag === 'BUTTON') return;
        this._activeFoliageIndex = idx;
        this._interaction?.setActiveFoliageType(fType.id);
        this._refreshFoliageList();
      });

      container.appendChild(row);

      // -- Expanded details (only when active) --
      if (isActive) {
        const details = this._el('div', `
          display:flex;flex-direction:column;gap:6px;padding:8px;
          background:${S.surface};border:1px solid ${S.green};border-top:none;
          border-radius:0 0 4px 4px;
        `);

        // --- Mesh selection ---
        const meshRow = this._el('div', `display:flex;align-items:center;gap:6px;`);
        const meshLabel = this._el('span', `font-size:10px;color:${S.subtext};min-width:45px;`);
        meshLabel.textContent = 'Mesh';
        meshRow.appendChild(meshLabel);

        const meshSelect = document.createElement('select');
        meshSelect.style.cssText = `
          flex:1;background:${S.overlay};color:${S.text};border:1px solid ${S.muted};
          border-radius:3px;padding:3px 6px;font-size:10px;font-family:${S.font};
          cursor:pointer;outline:none;
        `;

        // None option
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— None —';
        if (!fType.meshAssetId) noneOpt.selected = true;
        meshSelect.appendChild(noneOpt);

        // Populate from MeshAssetManager
        if (this._meshManager) {
          for (const asset of this._meshManager.assets) {
            const opt = document.createElement('option');
            opt.value = asset.id;
            opt.textContent = asset.name;
            if (asset.id === fType.meshAssetId) opt.selected = true;
            meshSelect.appendChild(opt);
          }
        }

        // Prevent click from bubbling to row handler
        for (const evt of ['mousedown', 'mouseup', 'pointerdown', 'click'] as const) {
          meshSelect.addEventListener(evt, (e) => e.stopPropagation());
        }

        meshSelect.addEventListener('change', () => {
          fType.meshAssetId = meshSelect.value;
          // Rebuild foliage instances with new mesh
          if (this._terrain) {
            this._terrain.rebuildFoliageMeshForType(fType.id);
          }
          this._refreshFoliageList();
        });
        meshRow.appendChild(meshSelect);
        details.appendChild(meshRow);

        // --- Mesh thumbnail preview ---
        if (fType.meshAssetId && this._meshManager) {
          const asset = this._meshManager.getAsset(fType.meshAssetId);
          if (asset?.thumbnail) {
            const thumb = this._el('div', `
              display:flex;justify-content:center;padding:4px 0;
            `);
            const img = document.createElement('img');
            img.src = asset.thumbnail;
            img.style.cssText = `width:48px;height:48px;object-fit:contain;border-radius:4px;border:1px solid ${S.overlay};`;
            thumb.appendChild(img);
            details.appendChild(thumb);
          }
        }

        // --- Name ---
        const nameRow = this._el('div', `display:flex;align-items:center;gap:6px;`);
        const nameLabel = this._el('span', `font-size:10px;color:${S.subtext};min-width:45px;`);
        nameLabel.textContent = 'Name';
        nameRow.appendChild(nameLabel);
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = fType.name;
        nameInput.style.cssText = `
          flex:1;background:${S.overlay};color:${S.text};border:1px solid ${S.muted};
          border-radius:3px;padding:3px 6px;font-size:10px;font-family:${S.font};outline:none;
        `;
        nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
        nameInput.addEventListener('change', () => {
          fType.name = nameInput.value;
          this._refreshFoliageList();
        });
        nameRow.appendChild(nameInput);
        details.appendChild(nameRow);

        // --- Density ---
        const densityRow = this._el('div', `display:flex;align-items:center;gap:6px;`);
        const densityLabel = this._el('span', `font-size:10px;color:${S.subtext};min-width:45px;`);
        densityLabel.textContent = 'Density';
        densityRow.appendChild(densityLabel);
        const densitySlider = document.createElement('input');
        densitySlider.type = 'range';
        densitySlider.min = '0.1';
        densitySlider.max = '10';
        densitySlider.step = '0.1';
        densitySlider.value = String(fType.density);
        densitySlider.style.cssText = `flex:1;accent-color:${S.green};`;
        densitySlider.addEventListener('mousedown', (e) => e.stopPropagation());
        const densityVal = this._el('span', `font-size:10px;color:${S.muted};min-width:24px;text-align:right;`);
        densityVal.textContent = fType.density.toFixed(1);
        densitySlider.addEventListener('input', () => {
          fType.density = parseFloat(densitySlider.value);
          densityVal.textContent = fType.density.toFixed(1);
        });
        densityRow.appendChild(densitySlider);
        densityRow.appendChild(densityVal);
        details.appendChild(densityRow);

        // --- Scale Range ---
        const scaleRow = this._el('div', `display:flex;align-items:center;gap:6px;`);
        const scaleLabel = this._el('span', `font-size:10px;color:${S.subtext};min-width:45px;`);
        scaleLabel.textContent = 'Scale';
        scaleRow.appendChild(scaleLabel);
        const scaleMinInput = document.createElement('input');
        scaleMinInput.type = 'number';
        scaleMinInput.value = fType.scaleMin.toFixed(2);
        scaleMinInput.step = '0.05';
        scaleMinInput.min = '0.01';
        scaleMinInput.max = '10';
        scaleMinInput.style.cssText = `
          width:48px;background:${S.overlay};color:${S.text};border:1px solid ${S.muted};
          border-radius:3px;padding:3px 4px;font-size:10px;font-family:${S.font};outline:none;text-align:center;
        `;
        scaleMinInput.addEventListener('mousedown', (e) => e.stopPropagation());
        const scaleSep = this._el('span', `font-size:10px;color:${S.muted};`);
        scaleSep.textContent = '–';
        const scaleMaxInput = document.createElement('input');
        scaleMaxInput.type = 'number';
        scaleMaxInput.value = fType.scaleMax.toFixed(2);
        scaleMaxInput.step = '0.05';
        scaleMaxInput.min = '0.01';
        scaleMaxInput.max = '10';
        scaleMaxInput.style.cssText = scaleMinInput.style.cssText;
        scaleMaxInput.addEventListener('mousedown', (e) => e.stopPropagation());
        scaleMinInput.addEventListener('change', () => {
          fType.scaleMin = parseFloat(scaleMinInput.value) || 0.5;
        });
        scaleMaxInput.addEventListener('change', () => {
          fType.scaleMax = parseFloat(scaleMaxInput.value) || 1.5;
        });
        scaleRow.appendChild(scaleMinInput);
        scaleRow.appendChild(scaleSep);
        scaleRow.appendChild(scaleMaxInput);
        details.appendChild(scaleRow);

        // --- Checkboxes ---
        const checksRow = this._el('div', `display:flex;align-items:center;gap:10px;flex-wrap:wrap;`);

        const rotYLabel = this._el('label', `display:flex;align-items:center;gap:3px;font-size:10px;color:${S.subtext};cursor:pointer;`);
        const rotYCb = document.createElement('input');
        rotYCb.type = 'checkbox';
        rotYCb.checked = fType.randomRotationY;
        rotYCb.addEventListener('mousedown', (e) => e.stopPropagation());
        rotYCb.addEventListener('change', () => { fType.randomRotationY = rotYCb.checked; });
        rotYLabel.appendChild(rotYCb);
        rotYLabel.appendChild(document.createTextNode('Random Y Rot'));
        checksRow.appendChild(rotYLabel);

        const alignLabel = this._el('label', `display:flex;align-items:center;gap:3px;font-size:10px;color:${S.subtext};cursor:pointer;`);
        const alignCb = document.createElement('input');
        alignCb.type = 'checkbox';
        alignCb.checked = fType.alignToNormal;
        alignCb.addEventListener('mousedown', (e) => e.stopPropagation());
        alignCb.addEventListener('change', () => { fType.alignToNormal = alignCb.checked; });
        alignLabel.appendChild(alignCb);
        alignLabel.appendChild(document.createTextNode('Align to Normal'));
        checksRow.appendChild(alignLabel);
        details.appendChild(checksRow);

        container.appendChild(details);
      }

      this._foliageListEl!.appendChild(container);
    });
  }

  // ---- Import / Export ----

  private _buildImportSection(): void {
    const section = this._section('Import / Export');

    const row = this._el('div', `display:flex;gap:6px;padding:4px 10px 8px;`);

    // Import heightmap
    const importBtn = document.createElement('button');
    importBtn.style.cssText = `
      flex:1;padding:6px 8px;background:${S.surface};border:1px solid ${S.overlay};
      color:${S.text};cursor:pointer;border-radius:4px;font-size:11px;font-family:${S.font};
      display:flex;align-items:center;justify-content:center;gap:4px;
    `;
    importBtn.innerHTML = `${iconHTML(Icons.Upload, 'xs', S.subtext)} Import Heightmap`;
    importBtn.addEventListener('click', () => this._importHeightmap());
    row.appendChild(importBtn);

    // Export heightmap
    const exportBtn = document.createElement('button');
    exportBtn.style.cssText = importBtn.style.cssText;
    exportBtn.innerHTML = `${iconHTML(Icons.Download, 'xs', S.subtext)} Export`;
    exportBtn.addEventListener('click', () => this._exportHeightmap());
    row.appendChild(exportBtn);

    section.appendChild(row);
    this._editorContent!.appendChild(section);
  }

  private _importHeightmap(): void {
    if (!this._terrain) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          this._terrain!.importHeightmapFromImage(imageData);
          this._setStatus(`Imported heightmap (${img.width}×${img.height})`);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  private _exportHeightmap(): void {
    if (!this._terrain) return;
    const { resolution, maxHeight } = this._terrain.config;
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(resolution, resolution);

    for (let i = 0; i < this._terrain.heightmap.length; i++) {
      const v = Math.round(this._terrain.heightmap[i] * 255);
      const p = i * 4;
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // Download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terrain_heightmap_${resolution}.png`;
      a.click();
      URL.revokeObjectURL(url);
      this._setStatus('Heightmap exported');
    });
  }

  // ============================================================
  //  Helpers
  // ============================================================

  private _el(tag: string, style: string): HTMLElement {
    const el = document.createElement(tag);
    el.style.cssText = style;
    return el;
  }

  private _section(title: string): HTMLElement {
    const section = this._el('div', `border-bottom:1px solid ${S.surface};`);

    const header = this._el('div', `
      display:flex;align-items:center;padding:6px 10px;cursor:pointer;gap:4px;
    `);
    header.innerHTML = `${iconHTML(Icons.ChevronDown, 'xs', S.muted)}<span style="font-size:11px;color:${S.subtext};font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">${title}</span>`;

    const content = this._el('div', ``);
    let collapsed = false;

    header.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : '';
      header.innerHTML = `${iconHTML(collapsed ? Icons.ChevronRight : Icons.ChevronDown, 'xs', S.muted)}<span style="font-size:11px;color:${S.subtext};font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">${title}</span>`;
    });

    section.appendChild(header);
    section.appendChild(content);

    // Return the content container so callers append to it
    // But let's wrap it so section itself is returned
    (section as any).__content = content;

    // Override appendChild to always append to content
    const origAppend = section.appendChild.bind(section);
    let headerAdded = false;
    section.appendChild = function(child: Node) {
      if (!headerAdded) {
        headerAdded = true;
        origAppend(header);
        origAppend(content);
      }
      content.appendChild(child);
      return child;
    } as any;

    return section;
  }

  private _sliderRow(
    label: string,
    min: number,
    max: number,
    value: number,
    step: number,
    onChange: (v: number) => void,
  ): { row: HTMLElement; slider: HTMLInputElement; label: HTMLSpanElement } {
    const row = this._el('div', `display:flex;align-items:center;padding:4px 10px;gap:8px;`);

    const lbl = this._el('span', `width:70px;color:${S.subtext};font-size:11px;`) as HTMLSpanElement;
    lbl.textContent = label;
    row.appendChild(lbl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = `flex:1;accent-color:${S.accent};height:4px;`;

    const valLabel = this._el('span', `width:36px;text-align:right;color:${S.text};font-size:11px;font-variant-numeric:tabular-nums;`) as HTMLSpanElement;
    valLabel.textContent = step < 1 ? value.toFixed(2) : String(value);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valLabel.textContent = step < 1 ? v.toFixed(2) : String(v);
      onChange(v);
    });

    row.appendChild(slider);
    row.appendChild(valLabel);

    return { row, slider, label: valLabel };
  }

  private _setStatus(msg: string): void {
    if (this._statusEl) this._statusEl.textContent = msg;
  }

  private _getTextureThumbnail(textureId: string): string {
    // Try to get from TextureLibrary
    if (this._textureLibrary) {
      const data = (this._textureLibrary as any)._textures?.get(textureId);
      if (data?.thumbnail) return data.thumbnail;
      if (data?.storedData) return data.storedData;
    }
    return '';
  }

  // ============================================================
  //  Cleanup
  // ============================================================

  dispose(): void {
    this._root.innerHTML = '';
    this._interaction?.deactivate();
  }
}
