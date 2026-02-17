// ============================================================
//  MaterialEditorPanel — UE-style Material Editor (v2)
//
//  Full-featured PBR material editor with:
//  • Toolbar (save, preview shape, preview background)
//  • Categorised property sections with collapsible groups
//  • Texture slots with drag-and-drop from files + from asset browser
//  • Texture file picker button + clear button
//  • Live 3D preview with orbit controls (mouse drag to rotate)
//  • Preview shape selector: Sphere / Cube / Cylinder / Plane
//  • Checkerboard background option
// ============================================================

import * as THREE from 'three';
import { MeshAssetManager, type MaterialAssetJSON, type TextureAssetJSON } from './MeshAsset';

// ── Tiny ID generator ──
let _matEdIdCounter = 0;
function matEdId(): string { return `__matEd_${Date.now()}_${++_matEdIdCounter}`; }

// ── Preview types ──
type PreviewShape = 'sphere' | 'cube' | 'cylinder' | 'plane';
type PreviewBg = 'dark' | 'checkerboard' | 'gradient';

export class MaterialEditorPanel {
  public container: HTMLElement;
  private _material: MaterialAssetJSON;
  private _meshManager: MeshAssetManager;
  private _onChanged: (() => void) | undefined;
  private _propsPane: HTMLElement | null = null;

  // Live preview
  private _previewRenderer: THREE.WebGLRenderer | null = null;
  private _previewScene: THREE.Scene | null = null;
  private _previewCamera: THREE.PerspectiveCamera | null = null;
  private _previewMesh: THREE.Mesh | null = null;
  private _previewCanvas: HTMLCanvasElement | null = null;
  private _animFrameId = 0;
  private _previewShape: PreviewShape = 'sphere';
  private _previewBg: PreviewBg = 'dark';

  // Orbit state
  private _orbitTheta = 0.6;
  private _orbitPhi = 0.8;
  private _orbitDist = 3.2;
  private _isDragging = false;
  private _lastMx = 0;
  private _lastMy = 0;

  // Bound event handlers for cleanup
  private _boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private _boundMouseUp: ((e: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    material: MaterialAssetJSON,
    meshManager: MeshAssetManager,
    onChanged?: () => void,
  ) {
    this.container = container;
    this._material = material;
    this._meshManager = meshManager;
    this._onChanged = onChanged;
    this._build();
  }

  dispose(): void {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this._previewRenderer) {
      this._previewRenderer.dispose();
      this._previewRenderer = null;
    }
    if (this._boundMouseMove) document.removeEventListener('mousemove', this._boundMouseMove);
    if (this._boundMouseUp) document.removeEventListener('mouseup', this._boundMouseUp);
  }

  private _emit(): void {
    const idx = this._meshManager.allMaterials.findIndex(m => m.assetId === this._material.assetId);
    if (idx >= 0) {
      this._meshManager.allMaterials[idx] = this._material;
    }
    this._onChanged?.();
    this._updatePreviewMaterial();
  }

  // ============================================================
  //  Build Root Layout
  // ============================================================

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel material-editor-panel';
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-panel)',
      color: 'var(--text)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '12px',
    });

    // ── Toolbar ──
    this._buildToolbar();

    // ── Body: Properties + Preview side-by-side ──
    const body = document.createElement('div');
    Object.assign(body.style, {
      flex: '1',
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      minHeight: '0',
    });
    this.container.appendChild(body);

    // Left: Properties scroll
    const propsPane = document.createElement('div');
    Object.assign(propsPane.style, {
      flex: '1',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '0',
      minWidth: '300px',
      borderRight: '1px solid var(--border)',
    });
    body.appendChild(propsPane);
    this._propsPane = propsPane;

    // Right: Preview
    const previewPane = document.createElement('div');
    Object.assign(previewPane.style, {
      width: '340px',
      minWidth: '240px',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-darkest)',
    });
    body.appendChild(previewPane);

    this._buildProperties(propsPane);
    this._buildPreview(previewPane);
  }

  // ============================================================
  //  Toolbar
  // ============================================================

  private _buildToolbar(): void {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-dark)',
      flexShrink: '0',
    });

    // Material icon + name
    const titleIcon = document.createElement('span');
    titleIcon.textContent = '\uD83C\uDFA8';
    titleIcon.style.fontSize = '16px';
    bar.appendChild(titleIcon);

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = this._material.assetName;
    Object.assign(titleInput.style, {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--text-bright)',
      fontWeight: '600',
      fontSize: '13px',
      padding: '2px 6px',
      borderRadius: '3px',
      flex: '1',
      maxWidth: '220px',
    });
    titleInput.addEventListener('focus', () => { titleInput.style.borderColor = 'var(--accent)'; });
    titleInput.addEventListener('blur', () => {
      titleInput.style.borderColor = 'transparent';
      if (titleInput.value.trim()) {
        this._material.assetName = titleInput.value.trim();
        this._emit();
      }
    });
    bar.appendChild(titleInput);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Save button
    const saveBtn = this._createToolbarBtn('\uD83D\uDCBE', 'Save Material', () => {
      this._emit();
    });
    bar.appendChild(saveBtn);

    // Apply button
    const applyBtn = this._createToolbarBtn('\u2705', 'Apply to Instances', () => {
      this._emit();
    });
    bar.appendChild(applyBtn);

    this.container.appendChild(bar);
  }

  private _createToolbarBtn(icon: string, tooltip: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = icon;
    btn.title = tooltip;
    Object.assign(btn.style, {
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
      padding: '3px 8px',
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '13px',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--bg-hover)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--bg-input)'; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ============================================================
  //  Properties Panel
  // ============================================================

  private _buildProperties(parent: HTMLElement): void {
    const d = this._material.materialData;

    // ── Details Section ──
    const detailsGroup = this._addGroup(parent, 'Details', true);
    this._addSelectRow(detailsGroup, 'Shading Model', d.type, ['PBR', 'Phong', 'Basic'], (val) => {
      d.type = val as any;
      this._emit();
    });
    this._addSelectRow(detailsGroup, 'Blend Mode', d.alphaMode, ['OPAQUE', 'MASK', 'BLEND'], (val) => {
      d.alphaMode = val as any;
      this._emit();
    });
    if (d.alphaMode === 'MASK') {
      this._addSliderRow(detailsGroup, 'Alpha Cutoff', d.alphaCutoff ?? 0.5, 0, 1, 0.01, (val) => {
        d.alphaCutoff = val;
        this._emit();
      });
    }
    this._addCheckboxRow(detailsGroup, 'Two Sided', d.doubleSided, (val) => {
      d.doubleSided = val;
      this._emit();
    });
    this._addCheckboxRow(detailsGroup, 'Flat Shading', d.flatShading ?? false, (val) => {
      d.flatShading = val;
      this._emit();
    });
    this._addCheckboxRow(detailsGroup, 'Wireframe', d.wireframe ?? false, (val) => {
      d.wireframe = val;
      this._emit();
    });

    // ── Base Color ──
    const baseGroup = this._addGroup(parent, 'Base Color', true);
    this._addColorRow(baseGroup, 'Color', d.baseColor, (val) => {
      d.baseColor = val;
      this._emit();
    });
    this._addTextureSlot(baseGroup, 'Base Color Map', d.baseColorMap, (val) => {
      d.baseColorMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Metallic / Roughness ──
    const mrGroup = this._addGroup(parent, 'Metallic / Roughness', true);
    this._addSliderRow(mrGroup, 'Metalness', d.metalness, 0, 1, 0.01, (val) => {
      d.metalness = val;
      this._emit();
    });
    this._addSliderRow(mrGroup, 'Roughness', d.roughness, 0, 1, 0.01, (val) => {
      d.roughness = val;
      this._emit();
    });
    this._addTextureSlot(mrGroup, 'Metallic/Roughness Map', d.metallicRoughnessMap, (val) => {
      d.metallicRoughnessMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addTextureSlot(mrGroup, 'Roughness Map', d.roughnessMap ?? null, (val) => {
      d.roughnessMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Emissive ──
    const emissiveGroup = this._addGroup(parent, 'Emissive', true);
    this._addColorRow(emissiveGroup, 'Emissive Color', d.emissive, (val) => {
      d.emissive = val;
      this._emit();
    });
    this._addSliderRow(emissiveGroup, 'Emissive Intensity', d.emissiveIntensity, 0, 10, 0.1, (val) => {
      d.emissiveIntensity = val;
      this._emit();
    });
    this._addTextureSlot(emissiveGroup, 'Emissive Map', d.emissiveMap, (val) => {
      d.emissiveMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Normal Map ──
    const normalGroup = this._addGroup(parent, 'Normal Map', true);
    this._addTextureSlot(normalGroup, 'Normal Map', d.normalMap, (val) => {
      d.normalMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(normalGroup, 'Normal Scale', d.normalScale ?? 1.0, 0, 2, 0.01, (val) => {
      d.normalScale = val;
      this._emit();
    });

    // ── Ambient Occlusion ──
    const aoGroup = this._addGroup(parent, 'Ambient Occlusion', true);
    this._addTextureSlot(aoGroup, 'Occlusion Map', d.occlusionMap, (val) => {
      d.occlusionMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(aoGroup, 'AO Intensity', d.aoIntensity ?? 1.0, 0, 2, 0.01, (val) => {
      d.aoIntensity = val;
      this._emit();
    });

    // ── Opacity ──
    const opacityGroup = this._addGroup(parent, 'Opacity', true);
    this._addSliderRow(opacityGroup, 'Opacity', d.opacity, 0, 1, 0.01, (val) => {
      d.opacity = val;
      this._emit();
    });

    // ── Height / Displacement ──
    const heightGroup = this._addGroup(parent, 'Height / Displacement', false);
    this._addTextureSlot(heightGroup, 'Height Map', d.heightMap ?? null, (val) => {
      d.heightMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(heightGroup, 'Displacement Scale', d.displacementScale ?? 0.05, 0, 1, 0.001, (val) => {
      d.displacementScale = val;
      this._emit();
    });
    this._addSliderRow(heightGroup, 'Displacement Bias', d.displacementBias ?? 0, -0.5, 0.5, 0.001, (val) => {
      d.displacementBias = val;
      this._emit();
    });

    // ── Clearcoat ── (car paint, lacquered surfaces)
    const clearcoatGroup = this._addGroup(parent, 'Clearcoat', false);
    this._addGroupHint(clearcoatGroup, 'Adds a secondary clear reflective layer (car paint, lacquered wood)');
    this._addSliderRow(clearcoatGroup, 'Clearcoat', d.clearcoat ?? 0, 0, 1, 0.01, (val) => {
      d.clearcoat = val;
      this._emit();
    });
    this._addSliderRow(clearcoatGroup, 'CC Roughness', d.clearcoatRoughness ?? 0, 0, 1, 0.01, (val) => {
      d.clearcoatRoughness = val;
      this._emit();
    });
    this._addTextureSlot(clearcoatGroup, 'Clearcoat Map', d.clearcoatMap ?? null, (val) => {
      d.clearcoatMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addTextureSlot(clearcoatGroup, 'CC Roughness Map', d.clearcoatRoughnessMap ?? null, (val) => {
      d.clearcoatRoughnessMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addTextureSlot(clearcoatGroup, 'CC Normal Map', d.clearcoatNormalMap ?? null, (val) => {
      d.clearcoatNormalMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(clearcoatGroup, 'CC Normal Scale', d.clearcoatNormalScale ?? 1.0, 0, 2, 0.01, (val) => {
      d.clearcoatNormalScale = val;
      this._emit();
    });

    // ── Sheen ── (fabric, velvet)
    const sheenGroup = this._addGroup(parent, 'Sheen', false);
    this._addGroupHint(sheenGroup, 'Soft fabric-like reflections (velvet, cloth, felt)');
    this._addSliderRow(sheenGroup, 'Sheen', d.sheen ?? 0, 0, 1, 0.01, (val) => {
      d.sheen = val;
      this._emit();
    });
    this._addSliderRow(sheenGroup, 'Sheen Roughness', d.sheenRoughness ?? 0, 0, 1, 0.01, (val) => {
      d.sheenRoughness = val;
      this._emit();
    });
    this._addColorRow(sheenGroup, 'Sheen Color', d.sheenColor ?? '#ffffff', (val) => {
      d.sheenColor = val;
      this._emit();
    });
    this._addTextureSlot(sheenGroup, 'Sheen Color Map', d.sheenColorMap ?? null, (val) => {
      d.sheenColorMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addTextureSlot(sheenGroup, 'Sheen Roughness Map', d.sheenRoughnessMap ?? null, (val) => {
      d.sheenRoughnessMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Anisotropy ── (brushed metal, hair)
    const anisotropyGroup = this._addGroup(parent, 'Anisotropy', false);
    this._addGroupHint(anisotropyGroup, 'Directional stretched highlights (brushed metal, hair, carbon fiber)');
    this._addSliderRow(anisotropyGroup, 'Anisotropy', d.anisotropy ?? 0, -1, 1, 0.01, (val) => {
      d.anisotropy = val;
      this._emit();
    });
    this._addSliderRow(anisotropyGroup, 'Rotation', d.anisotropyRotation ?? 0, 0, Math.PI * 2, 0.01, (val) => {
      d.anisotropyRotation = val;
      this._emit();
    });
    this._addTextureSlot(anisotropyGroup, 'Anisotropy Map', d.anisotropyMap ?? null, (val) => {
      d.anisotropyMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Iridescence ── (soap bubbles, oil slick, beetle shells)
    const iridGroup = this._addGroup(parent, 'Iridescence', false);
    this._addGroupHint(iridGroup, 'Thin-film interference (soap bubbles, oil slicks, beetle shells)');
    this._addSliderRow(iridGroup, 'Iridescence', d.iridescence ?? 0, 0, 1, 0.01, (val) => {
      d.iridescence = val;
      this._emit();
    });
    this._addSliderRow(iridGroup, 'Iridescence IOR', d.iridescenceIOR ?? 1.3, 1.0, 2.333, 0.01, (val) => {
      d.iridescenceIOR = val;
      this._emit();
    });
    this._addSliderRow(iridGroup, 'Thickness Min', d.iridescenceThicknessMin ?? 100, 0, 800, 1, (val) => {
      d.iridescenceThicknessMin = val;
      this._emit();
    });
    this._addSliderRow(iridGroup, 'Thickness Max', d.iridescenceThicknessMax ?? 400, 0, 800, 1, (val) => {
      d.iridescenceThicknessMax = val;
      this._emit();
    });
    this._addTextureSlot(iridGroup, 'Iridescence Map', d.iridescenceMap ?? null, (val) => {
      d.iridescenceMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addTextureSlot(iridGroup, 'Thickness Map', d.iridescenceThicknessMap ?? null, (val) => {
      d.iridescenceThicknessMap = val;
      this._emit();
      this._rebuildProps();
    });

    // ── Transmission / Refraction ── (glass, water, crystal)
    const transGroup = this._addGroup(parent, 'Transmission / Refraction', false);
    this._addGroupHint(transGroup, 'Light passes through the surface (glass, water, crystal, gemstones)');
    this._addSliderRow(transGroup, 'Transmission', d.transmission ?? 0, 0, 1, 0.01, (val) => {
      d.transmission = val;
      this._emit();
    });
    this._addTextureSlot(transGroup, 'Transmission Map', d.transmissionMap ?? null, (val) => {
      d.transmissionMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(transGroup, 'Thickness', d.thickness ?? 0, 0, 10, 0.01, (val) => {
      d.thickness = val;
      this._emit();
    });
    this._addTextureSlot(transGroup, 'Thickness Map', d.thicknessMap ?? null, (val) => {
      d.thicknessMap = val;
      this._emit();
      this._rebuildProps();
    });
    this._addSliderRow(transGroup, 'IOR', d.ior ?? 1.5, 1.0, 2.5, 0.01, (val) => {
      d.ior = val;
      this._emit();
    });
    this._addColorRow(transGroup, 'Attenuation Color', d.attenuationColor ?? '#ffffff', (val) => {
      d.attenuationColor = val;
      this._emit();
    });
    this._addSliderRow(transGroup, 'Attenuation Dist.', d.attenuationDistance ?? Infinity, 0, 100, 0.1, (val) => {
      d.attenuationDistance = val;
      this._emit();
    });

    // ── UV Transform ──
    const uvGroup = this._addGroup(parent, 'UV Transform', false);
    this._addGroupHint(uvGroup, 'Scale, offset, and rotate all texture maps');
    const tilingX = d.uvTiling?.[0] ?? 1;
    const tilingY = d.uvTiling?.[1] ?? 1;
    this._addSliderRow(uvGroup, 'Tiling X', tilingX, 0.01, 20, 0.01, (val) => {
      if (!d.uvTiling) d.uvTiling = [1, 1];
      d.uvTiling[0] = val;
      this._emit();
    });
    this._addSliderRow(uvGroup, 'Tiling Y', tilingY, 0.01, 20, 0.01, (val) => {
      if (!d.uvTiling) d.uvTiling = [1, 1];
      d.uvTiling[1] = val;
      this._emit();
    });
    const offsetX = d.uvOffset?.[0] ?? 0;
    const offsetY = d.uvOffset?.[1] ?? 0;
    this._addSliderRow(uvGroup, 'Offset X', offsetX, -5, 5, 0.01, (val) => {
      if (!d.uvOffset) d.uvOffset = [0, 0];
      d.uvOffset[0] = val;
      this._emit();
    });
    this._addSliderRow(uvGroup, 'Offset Y', offsetY, -5, 5, 0.01, (val) => {
      if (!d.uvOffset) d.uvOffset = [0, 0];
      d.uvOffset[1] = val;
      this._emit();
    });
    this._addSliderRow(uvGroup, 'UV Rotation', d.uvRotation ?? 0, 0, 6.2832, 0.01, (val) => {
      d.uvRotation = val;
      this._emit();
    });

    // ── Environment ──
    const envGroup = this._addGroup(parent, 'Environment', false);
    this._addSliderRow(envGroup, 'Env Map Intensity', d.envMapIntensity ?? 1.0, 0, 5, 0.01, (val) => {
      d.envMapIntensity = val;
      this._emit();
    });
  }

  private _rebuildProps(): void {
    if (this._propsPane) {
      this._propsPane.innerHTML = '';
      this._buildProperties(this._propsPane);
    }
  }

  // ============================================================
  //  Collapsible Group
  // ============================================================

  private _addGroup(parent: HTMLElement, title: string, expanded: boolean): HTMLElement {
    const group = document.createElement('div');
    group.style.marginBottom = '2px';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 10px',
      cursor: 'pointer',
      background: 'var(--bg-dark)',
      borderBottom: '1px solid var(--border)',
      userSelect: 'none',
    });

    const arrow = document.createElement('span');
    arrow.textContent = expanded ? '\u25BC' : '\u25B6';
    arrow.style.cssText = 'font-size:9px;color:var(--text-dim);width:10px;';

    const label = document.createElement('span');
    label.textContent = title;
    label.style.cssText = 'font-size:11px;font-weight:600;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;';

    header.appendChild(arrow);
    header.appendChild(label);

    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '8px 10px',
      display: expanded ? 'block' : 'none',
      background: 'var(--bg-panel)',
    });

    header.addEventListener('click', () => {
      const visible = body.style.display !== 'none';
      body.style.display = visible ? 'none' : 'block';
      arrow.textContent = visible ? '\u25B6' : '\u25BC';
    });

    group.appendChild(header);
    group.appendChild(body);
    parent.appendChild(group);
    return body;
  }

  /** Add a small description hint inside a group */
  private _addGroupHint(parent: HTMLElement, text: string): void {
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      fontSize: '10px',
      color: 'var(--text-dim)',
      fontStyle: 'italic',
      marginBottom: '6px',
      padding: '2px 0',
      lineHeight: '1.3',
    });
    hint.textContent = text;
    parent.appendChild(hint);
  }

  // ============================================================
  //  Row Helpers
  // ============================================================

  private _createRow(parent: HTMLElement, label: string): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '6px',
    });
    const lbl = document.createElement('label');
    Object.assign(lbl.style, {
      width: '120px',
      flexShrink: '0',
      fontSize: '11px',
      color: 'var(--text-dim)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    lbl.textContent = label;
    row.appendChild(lbl);
    parent.appendChild(row);
    return row;
  }

  private _addColorRow(parent: HTMLElement, label: string, value: string, onChange: (val: string) => void): void {
    const row = this._createRow(parent, label);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = value;
    Object.assign(colorInput.style, {
      width: '36px',
      height: '24px',
      border: '1px solid var(--border)',
      cursor: 'pointer',
      background: 'transparent',
      borderRadius: '3px',
      padding: '1px',
    });

    const hexLabel = document.createElement('input');
    hexLabel.type = 'text';
    hexLabel.value = value.toUpperCase();
    hexLabel.className = 'prop-input';
    Object.assign(hexLabel.style, {
      width: '70px',
      fontFamily: 'monospace',
      fontSize: '11px',
      textTransform: 'uppercase',
    });

    colorInput.addEventListener('input', () => {
      hexLabel.value = colorInput.value.toUpperCase();
      onChange(colorInput.value);
    });
    hexLabel.addEventListener('change', () => {
      let v = hexLabel.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        colorInput.value = v;
        onChange(v);
      }
    });

    row.appendChild(colorInput);
    row.appendChild(hexLabel);
  }

  private _addSliderRow(parent: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (val: number) => void): void {
    const row = this._createRow(parent, label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    Object.assign(slider.style, {
      flex: '1',
      accentColor: 'var(--accent)',
      height: '4px',
    });

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = String(min);
    numInput.max = String(max);
    numInput.step = String(step);
    numInput.value = String(value);
    numInput.className = 'prop-input';
    Object.assign(numInput.style, { width: '55px', textAlign: 'right' });

    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      onChange(parseFloat(slider.value));
    });
    numInput.addEventListener('change', () => {
      slider.value = numInput.value;
      onChange(parseFloat(numInput.value));
    });

    row.appendChild(slider);
    row.appendChild(numInput);
  }

  private _addCheckboxRow(parent: HTMLElement, label: string, value: boolean, onChange: (val: boolean) => void): void {
    const row = this._createRow(parent, label);
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = value;
    cb.style.accentColor = 'var(--accent)';
    cb.addEventListener('change', () => onChange(cb.checked));
    row.appendChild(cb);
  }

  private _addSelectRow(parent: HTMLElement, label: string, value: string, options: string[], onChange: (val: string) => void): void {
    const row = this._createRow(parent, label);
    const sel = document.createElement('select');
    sel.className = 'prop-input';
    sel.style.flex = '1';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
  }

  // ============================================================
  //  Texture Slot — drag-drop + file picker + select + clear
  // ============================================================

  private _addTextureSlot(parent: HTMLElement, label: string, textureId: string | null, onChange: (val: string | null) => void): void {
    const slotContainer = document.createElement('div');
    slotContainer.style.marginBottom = '8px';

    // Label row
    const labelRow = document.createElement('div');
    Object.assign(labelRow.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '4px',
    });
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:var(--text-dim);';
    lbl.textContent = label;
    labelRow.appendChild(lbl);
    slotContainer.appendChild(labelRow);

    // Texture drop zone
    const dropZone = document.createElement('div');
    Object.assign(dropZone.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px',
      border: '1px dashed var(--border)',
      borderRadius: '4px',
      background: 'var(--bg-input)',
      transition: 'border-color 0.15s, background 0.15s',
      minHeight: '56px',
    });

    // Thumbnail
    const thumb = document.createElement('div');
    const checkerBg = [
      'linear-gradient(45deg, #333 25%, transparent 25%)',
      'linear-gradient(-45deg, #333 25%, transparent 25%)',
      'linear-gradient(45deg, transparent 75%, #333 75%)',
      'linear-gradient(-45deg, transparent 75%, #333 75%)',
    ].join(', ');
    Object.assign(thumb.style, {
      width: '48px',
      height: '48px',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      flexShrink: '0',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      overflow: 'hidden',
      position: 'relative',
    });

    // If no texture assigned, show checkerboard
    if (textureId) {
      const tex = this._meshManager.getTexture(textureId);
      if (tex && tex.dataUrl) {
        thumb.style.backgroundImage = `url(${tex.dataUrl})`;
      } else {
        thumb.style.background = '#333';
      }
    } else {
      thumb.style.backgroundImage = checkerBg;
      thumb.style.backgroundSize = '8px 8px';
    }

    // Info area
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;';

    // Texture name / placeholder
    const texNameEl = document.createElement('div');
    Object.assign(texNameEl.style, {
      fontSize: '11px',
      color: textureId ? 'var(--text)' : 'var(--text-dim)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    if (textureId) {
      const tex = this._meshManager.getTexture(textureId);
      if (tex) {
        texNameEl.textContent = tex.assetName;
        const dims = document.createElement('span');
        dims.style.cssText = 'font-size:10px;color:var(--text-dim);margin-left:6px;';
        dims.textContent = `${tex.textureData.width}\u00D7${tex.textureData.height}`;
        texNameEl.appendChild(dims);
      } else {
        texNameEl.textContent = textureId;
      }
    } else {
      texNameEl.textContent = 'Drop image here or click to browse...';
    }
    info.appendChild(texNameEl);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;';

    // Browse button
    const browseBtn = this._slotBtn('\uD83D\uDCC2 Browse', 'var(--bg-hover)');
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._pickTextureFile((newId) => {
        if (newId) onChange(newId);
      });
    });
    btnRow.appendChild(browseBtn);

    // Select from existing
    const existingTextures = this._getAllAvailableTextures();
    if (existingTextures.length > 0) {
      const selBtn = this._slotBtn('\uD83D\uDCCB Select', 'var(--bg-hover)');
      selBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showTexturePicker(selBtn, (pickedId) => {
          onChange(pickedId);
        });
      });
      btnRow.appendChild(selBtn);
    }

    // Clear button
    if (textureId) {
      const clearBtn = this._slotBtn('\u2715 Clear', 'var(--bg-hover)');
      clearBtn.style.color = '#f55';
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onChange(null);
      });
      btnRow.appendChild(clearBtn);
    }

    info.appendChild(btnRow);
    dropZone.appendChild(thumb);
    dropZone.appendChild(info);
    slotContainer.appendChild(dropZone);
    parent.appendChild(slotContainer);

    // ── Drag-and-drop handlers ──
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.background = 'var(--bg-hover)';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-input)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-input)';

      // Check for texture asset ID from content browser drag
      const texAssetId = e.dataTransfer?.getData('text/texture-asset-id');
      if (texAssetId) {
        const tex = this._meshManager.getTexture(texAssetId);
        if (tex) {
          onChange(texAssetId);
          return;
        }
      }

      // Check for dropped image files
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          this._importImageFile(file).then((newId) => {
            if (newId) onChange(newId);
          });
          return;
        }
      }

      // Check plain text — might be a texture name
      const textData = e.dataTransfer?.getData('text/plain');
      if (textData) {
        // Try to match by asset name
        const found = this._meshManager.allTextures.find(
          t => t.assetName === textData || t.assetId === textData,
        );
        if (found) {
          onChange(found.assetId);
          return;
        }
      }
    });

    // Click the drop zone itself to open file picker
    dropZone.style.cursor = 'pointer';
    dropZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this._pickTextureFile((newId) => {
        if (newId) onChange(newId);
      });
    });
  }

  private _slotBtn(text: string, bg: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      background: bg,
      border: '1px solid var(--border)',
      color: 'var(--text)',
      padding: '2px 8px',
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '10px',
      whiteSpace: 'nowrap',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--accent-dim)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = bg; });
    return btn;
  }

  // ============================================================
  //  Texture Import & Picker
  // ============================================================

  /** Open a native file picker dialog for image files */
  private _pickTextureFile(onPicked: (id: string | null) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/bmp,image/gif,image/tga';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (file) {
        const newId = await this._importImageFile(file);
        if (newId) onPicked(newId);
      }
      input.remove();
    });
    input.click();
  }

  /** Import an image File as a TextureAssetJSON and register it */
  private async _importImageFile(file: File): Promise<string | null> {
    try {
      const dataUrl = await this._readFileAsDataUrl(file);
      const img = await this._loadImage(dataUrl);

      const texId = matEdId();
      const texName = file.name.replace(/\.[^.]+$/, '');
      const texAsset: TextureAssetJSON = {
        assetId: texId,
        assetName: texName,
        meshAssetId: this._material.meshAssetId || '',
        dataUrl,
        textureData: {
          width: img.width,
          height: img.height,
          format: file.type || 'image/png',
        },
      };

      // Register in the global texture list
      this._meshManager.allTextures.push(texAsset);
      return texId;
    } catch (err) {
      console.error('[MaterialEditor] Failed to import texture:', err);
      return null;
    }
  }

  private _readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private _loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /** All textures: from parent mesh first, then all others */
  private _getAllAvailableTextures(): TextureAssetJSON[] {
    const parentMeshId = this._material.meshAssetId;
    const meshTextures = parentMeshId
      ? this._meshManager.allTextures.filter(t => t.meshAssetId === parentMeshId)
      : [];
    if (meshTextures.length > 0) {
      const ids = new Set(meshTextures.map(t => t.assetId));
      const others = this._meshManager.allTextures.filter(t => !ids.has(t.assetId));
      return [...meshTextures, ...others];
    }
    return this._meshManager.allTextures;
  }

  /** Show a floating texture picker popup with thumbnails */
  private _showTexturePicker(anchor: HTMLElement, onPicked: (id: string | null) => void): void {
    // Remove existing
    document.querySelectorAll('.mat-tex-picker-popup').forEach(el => el.remove());

    const popup = document.createElement('div');
    popup.className = 'mat-tex-picker-popup';
    const anchorRect = anchor.getBoundingClientRect();
    Object.assign(popup.style, {
      position: 'fixed',
      left: `${anchorRect.left}px`,
      top: `${anchorRect.bottom + 4}px`,
      width: '280px',
      maxHeight: '360px',
      overflowY: 'auto',
      background: 'var(--bg-dark)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      zIndex: '10000',
      padding: '4px',
    });

    // Search bar
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search textures...';
    searchInput.className = 'prop-input';
    Object.assign(searchInput.style, {
      width: '100%',
      marginBottom: '4px',
      boxSizing: 'border-box',
      fontSize: '11px',
    });
    popup.appendChild(searchInput);

    const listEl = document.createElement('div');
    popup.appendChild(listEl);

    const renderList = (filter: string) => {
      listEl.innerHTML = '';

      // "(None)" option
      if (!filter) {
        const noneItem = this._createPickerItem(null, 'None', null);
        noneItem.addEventListener('click', () => { onPicked(null); close(); });
        listEl.appendChild(noneItem);
      }

      const textures = this._getAllAvailableTextures();
      const filtered = filter
        ? textures.filter(t => t.assetName.toLowerCase().includes(filter.toLowerCase()))
        : textures;

      for (const tex of filtered) {
        const item = this._createPickerItem(tex.dataUrl, tex.assetName, `${tex.textureData.width}\u00D7${tex.textureData.height}`);
        item.addEventListener('click', () => { onPicked(tex.assetId); close(); });
        listEl.appendChild(item);
      }

      if (filtered.length === 0 && filter) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;text-align:center;color:var(--text-dim);font-size:11px;';
        empty.textContent = 'No matching textures found.';
        listEl.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    document.body.appendChild(popup);
    searchInput.focus();

    const close = () => {
      popup.remove();
      document.removeEventListener('mousedown', outsideClick);
    };

    const outsideClick = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) close();
    };
    setTimeout(() => document.addEventListener('mousedown', outsideClick), 0);
  }

  private _createPickerItem(dataUrl: string | null, name: string, dims: string | null): HTMLElement {
    const item = document.createElement('div');
    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 6px',
      borderRadius: '3px',
      cursor: 'pointer',
    });
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-hover)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

    const thumbEl = document.createElement('div');
    Object.assign(thumbEl.style, {
      width: '32px',
      height: '32px',
      borderRadius: '3px',
      border: '1px solid var(--border)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      flexShrink: '0',
    });
    if (dataUrl) {
      thumbEl.style.backgroundImage = `url(${dataUrl})`;
    } else {
      thumbEl.style.background = '#333';
      Object.assign(thumbEl.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '14px' });
      thumbEl.textContent = '\u2205';
    }

    const textEl = document.createElement('div');
    textEl.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameEl.textContent = name;
    textEl.appendChild(nameEl);
    if (dims) {
      const dimsEl = document.createElement('div');
      dimsEl.style.cssText = 'font-size:10px;color:var(--text-dim);';
      dimsEl.textContent = dims;
      textEl.appendChild(dimsEl);
    }

    item.appendChild(thumbEl);
    item.appendChild(textEl);
    return item;
  }

  // ============================================================
  //  3D Preview — Orbit controls, shape selector
  // ============================================================

  private _buildPreview(parent: HTMLElement): void {
    // ── Preview toolbar ──
    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-dark)',
      flexShrink: '0',
    });

    const previewLabel = document.createElement('span');
    previewLabel.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-dim);margin-right:auto;';
    previewLabel.textContent = 'Preview';
    toolbar.appendChild(previewLabel);

    // Shape selector buttons
    const shapes: { label: string; value: PreviewShape; title: string }[] = [
      { label: '\u25CF', value: 'sphere', title: 'Sphere' },
      { label: '\u25A0', value: 'cube', title: 'Cube' },
      { label: '\u2B21', value: 'cylinder', title: 'Cylinder' },
      { label: '\u25AC', value: 'plane', title: 'Plane' },
    ];
    const shapeBtns: HTMLButtonElement[] = [];
    for (const s of shapes) {
      const btn = document.createElement('button');
      btn.textContent = s.label;
      btn.title = s.title;
      Object.assign(btn.style, {
        background: this._previewShape === s.value ? 'var(--accent-dim)' : 'var(--bg-input)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        padding: '2px 7px',
        borderRadius: '3px',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '1',
      });
      btn.addEventListener('click', () => {
        this._previewShape = s.value;
        this._updatePreviewGeometry();
        shapeBtns.forEach(b => b.style.background = 'var(--bg-input)');
        btn.style.background = 'var(--accent-dim)';
      });
      shapeBtns.push(btn);
      toolbar.appendChild(btn);
    }

    // Background toggle
    const bgBtn = document.createElement('button');
    bgBtn.textContent = '\uD83C\uDF11';
    bgBtn.title = 'Toggle background';
    Object.assign(bgBtn.style, {
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
      padding: '2px 6px',
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '12px',
      marginLeft: '4px',
    });
    bgBtn.addEventListener('click', () => {
      const bgs: PreviewBg[] = ['dark', 'checkerboard', 'gradient'];
      const idx = bgs.indexOf(this._previewBg);
      this._previewBg = bgs[(idx + 1) % bgs.length];
      this._updatePreviewBackground();
    });
    toolbar.appendChild(bgBtn);

    parent.appendChild(toolbar);

    // ── Canvas container ──
    const canvasContainer = document.createElement('div');
    Object.assign(canvasContainer.style, {
      flex: '1',
      position: 'relative',
      overflow: 'hidden',
    });
    parent.appendChild(canvasContainer);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    canvasContainer.appendChild(canvas);
    this._previewCanvas = canvas;

    // ── Three.js setup ──
    this._previewScene = new THREE.Scene();
    this._previewScene.background = new THREE.Color(0x1a1a2e);

    this._previewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this._updateCameraPosition();

    // Studio-style lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this._previewScene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(4, 6, 5);
    this._previewScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8899cc, 0.5);
    fillLight.position.set(-4, 2, -3);
    this._previewScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.35);
    rimLight.position.set(-2, -3, -5);
    this._previewScene.add(rimLight);

    const bottomLight = new THREE.DirectionalLight(0x665544, 0.15);
    bottomLight.position.set(0, -5, 0);
    this._previewScene.add(bottomLight);

    // Preview mesh (stationary, centered)
    const geo = this._getPreviewGeometry();
    const mat = this._buildThreeMaterial();
    this._previewMesh = new THREE.Mesh(geo, mat);
    this._previewScene.add(this._previewMesh);

    // Reference grid
    const gridHelper = new THREE.GridHelper(4, 20, 0x333355, 0x222244);
    gridHelper.position.y = -1.2;
    this._previewScene.add(gridHelper);

    // Renderer
    this._previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this._previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._previewRenderer.toneMappingExposure = 1.2;
    this._previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── Mouse orbit controls ──
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this._isDragging = true;
        this._lastMx = e.clientX;
        this._lastMy = e.clientY;
        e.preventDefault();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._boundMouseMove = (e: MouseEvent) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastMx;
      const dy = e.clientY - this._lastMy;
      this._lastMx = e.clientX;
      this._lastMy = e.clientY;
      this._orbitTheta -= dx * 0.008;
      this._orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this._orbitPhi - dy * 0.008));
      this._updateCameraPosition();
    };
    this._boundMouseUp = () => { this._isDragging = false; };

    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._orbitDist = Math.max(1.5, Math.min(10, this._orbitDist + e.deltaY * 0.005));
      this._updateCameraPosition();
    }, { passive: false });

    // Render loop (no rotation — camera is static unless user drags)
    const animate = () => {
      this._animFrameId = requestAnimationFrame(animate);
      if (!this._previewRenderer || !this._previewScene || !this._previewCamera) return;

      const rect = canvasContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          this._previewRenderer.setSize(w, h, false);
          this._previewCamera.aspect = w / h;
          this._previewCamera.updateProjectionMatrix();
        }
      }

      this._previewRenderer.render(this._previewScene, this._previewCamera);
    };
    animate();
  }

  private _updateCameraPosition(): void {
    if (!this._previewCamera) return;
    const x = this._orbitDist * Math.sin(this._orbitPhi) * Math.cos(this._orbitTheta);
    const y = this._orbitDist * Math.cos(this._orbitPhi);
    const z = this._orbitDist * Math.sin(this._orbitPhi) * Math.sin(this._orbitTheta);
    this._previewCamera.position.set(x, y, z);
    this._previewCamera.lookAt(0, 0, 0);
  }

  private _getPreviewGeometry(): THREE.BufferGeometry {
    switch (this._previewShape) {
      case 'cube':
        return new THREE.BoxGeometry(1.4, 1.4, 1.4);
      case 'cylinder':
        return new THREE.CylinderGeometry(0.8, 0.8, 1.6, 48);
      case 'plane': {
        const g = new THREE.PlaneGeometry(2.4, 2.4);
        g.rotateX(-Math.PI * 0.15);
        return g;
      }
      case 'sphere':
      default:
        return new THREE.SphereGeometry(1, 64, 64);
    }
  }

  private _updatePreviewGeometry(): void {
    if (!this._previewMesh) return;
    const oldGeo = this._previewMesh.geometry;
    this._previewMesh.geometry = this._getPreviewGeometry();
    oldGeo.dispose();
  }

  private _updatePreviewBackground(): void {
    if (!this._previewScene) return;
    switch (this._previewBg) {
      case 'dark':
        this._previewScene.background = new THREE.Color(0x1a1a2e);
        break;
      case 'checkerboard': {
        const size = 256;
        const checkerCanvas = document.createElement('canvas');
        checkerCanvas.width = size;
        checkerCanvas.height = size;
        const ctx = checkerCanvas.getContext('2d')!;
        const cs = 16;
        for (let y = 0; y < size; y += cs) {
          for (let x = 0; x < size; x += cs) {
            ctx.fillStyle = ((x + y) / cs) % 2 === 0 ? '#2a2a3e' : '#1e1e30';
            ctx.fillRect(x, y, cs, cs);
          }
        }
        this._previewScene.background = new THREE.CanvasTexture(checkerCanvas);
        break;
      }
      case 'gradient':
        this._previewScene.background = new THREE.Color(0x0a0a1a);
        break;
    }
  }

  // ============================================================
  //  Material → THREE.js (MeshPhysicalMaterial for full PBR)
  // ============================================================

  private _buildThreeMaterial(): THREE.MeshPhysicalMaterial {
    const d = this._material.materialData;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(d.baseColor),
      metalness: d.metalness,
      roughness: d.roughness,
      emissive: new THREE.Color(d.emissive),
      emissiveIntensity: d.emissiveIntensity,
      opacity: d.opacity,
      transparent: d.alphaMode === 'BLEND' || d.opacity < 1,
      side: d.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: d.alphaMode !== 'BLEND',
      flatShading: d.flatShading ?? false,
      wireframe: d.wireframe ?? false,
      envMapIntensity: d.envMapIntensity ?? 1.0,
    });

    // Alpha cutoff
    if (d.alphaMode === 'MASK') {
      mat.alphaTest = d.alphaCutoff ?? 0.5;
    }

    // Normal map scale
    if (d.normalScale !== undefined && d.normalScale !== 1.0) {
      mat.normalScale = new THREE.Vector2(d.normalScale, d.normalScale);
    }

    // Displacement
    mat.displacementScale = d.displacementScale ?? 0;
    mat.displacementBias = d.displacementBias ?? 0;

    // AO intensity
    mat.aoMapIntensity = d.aoIntensity ?? 1.0;

    // Clearcoat
    mat.clearcoat = d.clearcoat ?? 0;
    mat.clearcoatRoughness = d.clearcoatRoughness ?? 0;
    if (d.clearcoatNormalScale !== undefined) {
      mat.clearcoatNormalScale = new THREE.Vector2(d.clearcoatNormalScale, d.clearcoatNormalScale);
    }

    // Sheen
    mat.sheen = d.sheen ?? 0;
    mat.sheenRoughness = d.sheenRoughness ?? 0;
    if (d.sheenColor) mat.sheenColor = new THREE.Color(d.sheenColor);

    // Anisotropy
    mat.anisotropy = d.anisotropy ?? 0;
    mat.anisotropyRotation = d.anisotropyRotation ?? 0;

    // Iridescence
    mat.iridescence = d.iridescence ?? 0;
    mat.iridescenceIOR = d.iridescenceIOR ?? 1.3;
    if (d.iridescenceThicknessMin !== undefined || d.iridescenceThicknessMax !== undefined) {
      mat.iridescenceThicknessRange = [
        d.iridescenceThicknessMin ?? 100,
        d.iridescenceThicknessMax ?? 400,
      ];
    }

    // Transmission / Refraction
    mat.transmission = d.transmission ?? 0;
    mat.thickness = d.thickness ?? 0;
    mat.ior = d.ior ?? 1.5;
    if (d.attenuationColor) mat.attenuationColor = new THREE.Color(d.attenuationColor);
    if (d.attenuationDistance !== undefined) mat.attenuationDistance = d.attenuationDistance;

    // UV Transform
    const uvTiling = d.uvTiling ?? [1, 1];
    const uvOffset = d.uvOffset ?? [0, 0];
    const uvRotation = d.uvRotation ?? 0;
    const hasUVTransform = uvTiling[0] !== 1 || uvTiling[1] !== 1 ||
                           uvOffset[0] !== 0 || uvOffset[1] !== 0 || uvRotation !== 0;

    // Apply textures
    const applyTex = (slot: string, textureId: string | null | undefined) => {
      if (!textureId) return;
      this._applyTexture(mat, slot, textureId, hasUVTransform, uvTiling, uvOffset, uvRotation);
    };

    // Core maps
    applyTex('map', d.baseColorMap);
    applyTex('normalMap', d.normalMap);
    applyTex('metalnessMap', d.metallicRoughnessMap);
    applyTex('roughnessMap', d.roughnessMap);
    applyTex('emissiveMap', d.emissiveMap);
    applyTex('aoMap', d.occlusionMap);
    applyTex('displacementMap', d.heightMap);

    // Advanced maps
    applyTex('clearcoatMap', d.clearcoatMap);
    applyTex('clearcoatRoughnessMap', d.clearcoatRoughnessMap);
    applyTex('clearcoatNormalMap', d.clearcoatNormalMap);
    applyTex('sheenColorMap', d.sheenColorMap);
    applyTex('sheenRoughnessMap', d.sheenRoughnessMap);
    applyTex('anisotropyMap', d.anisotropyMap);
    applyTex('iridescenceMap', d.iridescenceMap);
    applyTex('iridescenceThicknessMap', d.iridescenceThicknessMap);
    applyTex('transmissionMap', d.transmissionMap);
    applyTex('thicknessMap', d.thicknessMap);

    return mat;
  }

  private _applyTexture(
    mat: THREE.MeshPhysicalMaterial,
    slot: string,
    textureId: string,
    hasUVTransform = false,
    uvTiling: [number, number] = [1, 1],
    uvOffset: [number, number] = [0, 0],
    uvRotation = 0,
  ): void {
    const texAsset = this._meshManager.getTexture(textureId);
    if (!texAsset || !texAsset.dataUrl) return;

    const loader = new THREE.TextureLoader();
    const tex = loader.load(texAsset.dataUrl, () => {
      mat.needsUpdate = true;
    });
    tex.colorSpace = (slot === 'map' || slot === 'emissiveMap' || slot === 'sheenColorMap')
      ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    if (hasUVTransform) {
      tex.repeat.set(uvTiling[0], uvTiling[1]);
      tex.offset.set(uvOffset[0], uvOffset[1]);
      tex.rotation = uvRotation;
      tex.center.set(0.5, 0.5);
    }

    (mat as any)[slot] = tex;
    mat.needsUpdate = true;
  }

  private _updatePreviewMaterial(): void {
    if (!this._previewMesh) return;
    const oldMat = this._previewMesh.material as THREE.Material;
    if (oldMat) oldMat.dispose();
    this._previewMesh.material = this._buildThreeMaterial();
  }
}
