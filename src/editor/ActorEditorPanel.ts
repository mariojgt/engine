// ============================================================
//  ActorEditorPanel — UE-style Blueprint Actor Editor
//  Tabs: Viewport (components + 3D preview) | Event Graph (node editor)
//  The Viewport tab has a Components tree on the left and a
//  mini Three.js scene on the right with transform gizmos.
// ============================================================

import type { ActorAsset, ActorComponentData, PhysicsConfig, CollisionChannel, LightType, SkeletalMeshConfig } from './ActorAsset';
import { ActorAssetManager, defaultPhysicsConfig, defaultLightConfig } from './ActorAsset';
import type { MeshAssetManager, MeshAsset, MaterialAssetJSON } from './MeshAsset';
import { buildThreeMaterialFromAsset } from './MeshAsset';
import type { AnimBlueprintManager, AnimBlueprintAsset } from './AnimBlueprintData';
import type { CollisionConfig, CollisionShapeType, CollisionMode, CollisionResponse, CollisionChannelName, BoxShapeDimensions, SphereShapeDimensions, CapsuleShapeDimensions } from '../engine/CollisionTypes';
import { defaultCollisionConfig, defaultMeshCollisionConfig, defaultDimensionsForShape, defaultPawnCollisionProfile, defaultCameraCollisionProfile } from '../engine/CollisionTypes';
import { ActorPreviewViewport } from './ActorPreviewViewport';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import type { MeshType, RootMeshType } from '../engine/Scene';
import { defaultCharacterPawnConfig, defaultSpringArmConfig, defaultCameraConfig } from '../engine/CharacterPawnData';
import type { CameraMode, SpringArmConfig, CameraComponentConfig } from '../engine/CharacterPawnData';
import { ClassInheritanceSystem } from './ClassInheritanceSystem';
import { createClassInfoBar, inheritanceBadgeHTML } from './InheritanceDialogsUI';
import { TextureLibrary } from './TextureLibrary';
import type { Scene2DManager } from './Scene2DManager';

let _compNextId = 1;
function compUid(): string {
  return 'comp_' + (_compNextId++) + '_' + Math.random().toString(36).slice(2, 6);
}

export class ActorEditorPanel {
  public container: HTMLElement;
  private _asset: ActorAsset;
  private _assetManager: ActorAssetManager | null;
  private _meshManager: MeshAssetManager | null = null;
  private _animBPManager: AnimBlueprintManager | null = null;
  private _scene2DManager: Scene2DManager | null = null;
  private _onCompile: (code: string) => void;
  private _onAssetChanged: () => void;
  private _onSave: (() => void) | null;

  // Top-level DOM
  private _tabBar!: HTMLElement;
  private _tabContentArea!: HTMLElement;

  // Compile / Save state
  private _compileStatus: 'compiled' | 'dirty' | 'error' = 'compiled';
  private _compileStatusEl: HTMLElement | null = null;
  private _compileBtnEl: HTMLElement | null = null;
  private _lastCompileTime: number = 0;

  // Viewport tab
  private _viewportTabEl: HTMLElement | null = null;
  private _preview: ActorPreviewViewport | null = null;
  private _componentsListEl: HTMLElement | null = null;
  private _componentPropsEl: HTMLElement | null = null;
  /** Refresh the 2D canvas preview — set in _build2DPreview, called by property pickers */
  private _refreshPreview: (() => void) | null = null;
  private _selectedComponentId: string | null = null; // null | '__root__' | comp.id

  // Event Graph tab
  private _graphTabEl: HTMLElement | null = null;
  private _nodeEditorCleanup: (() => void) | null = null;

  private _activeTab: 'viewport' | 'graph' = 'viewport';

  constructor(
    container: HTMLElement,
    asset: ActorAsset,
    onCompile: (code: string) => void,
    onAssetChanged?: () => void,
    assetManager?: ActorAssetManager,
    onSave?: () => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._assetManager = assetManager ?? null;
    this._onCompile = (code: string) => {
      onCompile(code);
      this._setCompileStatus('compiled');
    };
    this._onAssetChanged = onAssetChanged ?? (() => {});
    this._onSave = onSave ?? null;
    this._build();
  }

  /** Wire up MeshAssetManager for skeletal mesh picker */
  setMeshManager(mgr: MeshAssetManager): void {
    this._meshManager = mgr;
  }

  /** Wire up AnimBlueprintManager for animation blueprint picker on skeletal meshes */
  setAnimBPManager(mgr: AnimBlueprintManager): void {
    this._animBPManager = mgr;
  }

  /** Wire up Scene2DManager for 2D sprite sheet / anim blueprint pickers */
  setScene2DManager(mgr: Scene2DManager): void {
    this._scene2DManager = mgr;
    // Re-render the 2D preview now that sprite sheets are available
    this._refreshPreview?.();
  }

  /** Mark the blueprint as needing recompilation (called externally when graph changes) */
  markDirty(): void {
    this._setCompileStatus('dirty');
  }

  // ---- Build ----

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'actor-editor-root';

    // Class Inheritance Info Bar (if this asset has inheritance metadata)
    const inh = ClassInheritanceSystem.instance;
    const entry = inh.getActorEntry(this._asset.id);
    if (entry) {
      const inhData = (this._asset as any)._inheritance;
      const parentId = inhData?.parentClassId ?? null;
      const parentName = parentId
        ? (inh.getActorEntry(parentId)?.name ?? this._assetManager?.getAsset(parentId)?.name ?? 'Unknown')
        : null;
      const childCount = inhData?.childClassIds?.length ?? 0;

      const infoBarContainer = document.createElement('div');
      this.container.appendChild(infoBarContainer);

      createClassInfoBar(infoBarContainer, {
        className: this._asset.name,
        classId: this._asset.id,
        kind: 'actor',
        parentName,
        parentId,
        childCount,
        isOutOfSync: inh.isOutOfSync(this._asset.id),
        onOpenParent: parentId ? () => {
          const asset = this._assetManager?.getAsset(parentId);
          if (asset) {
            document.dispatchEvent(new CustomEvent('open-actor-editor', { detail: { assetId: parentId } }));
          }
        } : undefined,
        onShowInHierarchy: () => {
          document.dispatchEvent(new CustomEvent('show-in-hierarchy', { detail: { id: this._asset.id, kind: 'actor' } }));
        },
      });
    }

    // Tab bar
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'actor-editor-tab-bar';
    this.container.appendChild(this._tabBar);

    // Content area
    this._tabContentArea = document.createElement('div');
    this._tabContentArea.className = 'actor-editor-content';
    this.container.appendChild(this._tabContentArea);

    // Build tabs
    this._buildTabBar();

    // Controller blueprints default to Event Graph tab (no mesh to show)
    const isController = this._asset.actorType === 'playerController' || this._asset.actorType === 'aiController';
    this._switchTab(isController ? 'graph' : 'viewport');
  }

  private _buildTabBar(): void {
    this._tabBar.innerHTML = '';

    // ── Left side: Viewport + Event Graph tabs ──
    const tabsLeft = document.createElement('div');
    tabsLeft.className = 'ae-tab-bar-left';

    const makeTab = (label: string, id: 'viewport' | 'graph') => {
      const tab = document.createElement('div');
      tab.className = 'graph-tab' + (this._activeTab === id ? ' active' : '');
      tab.textContent = label;
      tab.addEventListener('click', () => this._switchTab(id));
      tabsLeft.appendChild(tab);
    };

    makeTab('🎮 Viewport', 'viewport');
    makeTab('⬡ Event Graph', 'graph');
    this._tabBar.appendChild(tabsLeft);

    // ── Right side: Compile + Save buttons (UE-style toolbar) ──
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'ae-toolbar-right';

    // Compile button
    const compileBtn = document.createElement('button');
    compileBtn.className = 'ae-toolbar-btn ae-compile-btn';
    compileBtn.title = 'Compile this blueprint (Ctrl+F7)';
    this._compileBtnEl = compileBtn;
    this._updateCompileButton();
    compileBtn.addEventListener('click', () => this._doCompile());
    toolbarRight.appendChild(compileBtn);

    // Compile status indicator
    const statusEl = document.createElement('span');
    statusEl.className = 'ae-compile-status';
    this._compileStatusEl = statusEl;
    this._updateCompileStatus();
    toolbarRight.appendChild(statusEl);

    // Separator
    const sep = document.createElement('div');
    sep.className = 'ae-toolbar-separator';
    toolbarRight.appendChild(sep);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ae-toolbar-btn ae-save-btn';
    saveBtn.innerHTML = '💾 Save';
    saveBtn.title = 'Save all (Ctrl+S)';
    saveBtn.addEventListener('click', () => this._doSave());
    toolbarRight.appendChild(saveBtn);

    this._tabBar.appendChild(toolbarRight);
  }

  private _setCompileStatus(status: 'compiled' | 'dirty' | 'error'): void {
    this._compileStatus = status;
    if (status === 'compiled') this._lastCompileTime = Date.now();
    this._updateCompileButton();
    this._updateCompileStatus();
  }

  private _updateCompileButton(): void {
    if (!this._compileBtnEl) return;
    const btn = this._compileBtnEl;
    switch (this._compileStatus) {
      case 'compiled':
        btn.innerHTML = '✅ Compile';
        btn.classList.remove('ae-compile-dirty', 'ae-compile-error');
        btn.classList.add('ae-compile-ok');
        break;
      case 'dirty':
        btn.innerHTML = '🔨 Compile';
        btn.classList.remove('ae-compile-ok', 'ae-compile-error');
        btn.classList.add('ae-compile-dirty');
        break;
      case 'error':
        btn.innerHTML = '❌ Compile';
        btn.classList.remove('ae-compile-ok', 'ae-compile-dirty');
        btn.classList.add('ae-compile-error');
        break;
    }
  }

  private _updateCompileStatus(): void {
    if (!this._compileStatusEl) return;
    switch (this._compileStatus) {
      case 'compiled': {
        const ago = this._lastCompileTime ? this._timeSince(this._lastCompileTime) : '';
        this._compileStatusEl.textContent = ago ? `Blueprint compiled ${ago}` : 'Blueprint up to date';
        this._compileStatusEl.className = 'ae-compile-status ae-status-ok';
        break;
      }
      case 'dirty':
        this._compileStatusEl.textContent = 'Blueprint needs recompile';
        this._compileStatusEl.className = 'ae-compile-status ae-status-dirty';
        break;
      case 'error':
        this._compileStatusEl.textContent = 'Compile error!';
        this._compileStatusEl.className = 'ae-compile-status ae-status-error';
        break;
    }
  }

  private _timeSince(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ago`;
  }

  /** Trigger manual compile — calls the live node editor's compileAndSave without destroying the graph */
  private _doCompile(): void {
    if (this._graphTabEl) {
      // The node editor exposes its compileAndSave on the container div's first child
      const editorEl = this._graphTabEl.querySelector('[class*="node-editor"], div');
      const container = this._graphTabEl.children[0] as any;
      // Try the direct ref first (set by NodeEditorView)
      if (container && typeof container.__compileAndSave === 'function') {
        container.__compileAndSave();
        return;
      }
      // Fallback: walk children
      for (let i = 0; i < this._graphTabEl.children.length; i++) {
        const child = this._graphTabEl.children[i] as any;
        if (child && typeof child.__compileAndSave === 'function') {
          child.__compileAndSave();
          return;
        }
      }
    }
    // Last resort: just fire the onCompile with existing code (no-op recompile)
    this._onCompile(this._asset.compiledCode);
  }

  /** Trigger manual save */
  private _doSave(): void {
    // Ensure compiled before save
    if (this._compileStatus !== 'compiled') {
      this._doCompile();
    }
    // Call external save handler
    if (this._onSave) {
      this._onSave();
    }
    // Flash save feedback
    this._flashSaveStatus();
  }

  private _flashSaveStatus(): void {
    if (!this._compileStatusEl) return;
    const el = this._compileStatusEl;
    el.textContent = '💾 Saved!';
    el.className = 'ae-compile-status ae-status-saved';
    setTimeout(() => this._updateCompileStatus(), 1500);
  }

  private _switchTab(tab: 'viewport' | 'graph'): void {
    this._activeTab = tab;
    this._buildTabBar();
    this._tabContentArea.innerHTML = '';

    // Cleanup previous
    if (tab !== 'viewport') this._disposeViewportTab();
    if (tab !== 'graph') this._disposeGraphTab();

    if (tab === 'viewport') {
      this._buildViewportTab();
    } else {
      this._buildGraphTab();
    }
  }

  // ================================================================
  //  VIEWPORT TAB — Components tree + mini 3D preview + properties
  // ================================================================

  private _buildViewportTab(): void {
    // Controller blueprints have no mesh — show a simple info panel
    const isController = this._asset.actorType === 'playerController' || this._asset.actorType === 'aiController';
    if (isController) {
      this._buildControllerInfoTab();
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'actor-viewport-tab';
    this._tabContentArea.appendChild(wrap);
    this._viewportTabEl = wrap;

    // Left panel: Components tree
    const leftPanel = document.createElement('div');
    leftPanel.className = 'actor-components-panel';
    wrap.appendChild(leftPanel);

    const headerEl = document.createElement('div');
    headerEl.className = 'panel-header';
    headerEl.innerHTML = `
      <span>Components</span>
      <div class="content-browser-add actor-comp-add-btn">+ Add</div>
    `;
    leftPanel.appendChild(headerEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'panel-body';
    leftPanel.appendChild(bodyEl);

    this._componentsListEl = document.createElement('div');
    this._componentsListEl.className = 'actor-comp-list';
    bodyEl.appendChild(this._componentsListEl);

    // Component properties below the tree
    this._componentPropsEl = document.createElement('div');
    this._componentPropsEl.className = 'actor-comp-props';
    bodyEl.appendChild(this._componentPropsEl);

    // Add button handler
    headerEl.querySelector('.actor-comp-add-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showAddComponentMenu(e as MouseEvent);
    });

    // Right panel: Mini viewport (2D or 3D depending on actor type)
    const rightPanel = document.createElement('div');
    rightPanel.className = 'actor-preview-area';
    wrap.appendChild(rightPanel);

    const is2DActor = this._asset.actorType === 'spriteActor'
      || this._asset.actorType === 'characterPawn2D'
      || this._asset.actorType === 'parallaxLayer';

    if (is2DActor) {
      this._build2DPreview(rightPanel);
    } else {
      this._preview = new ActorPreviewViewport(rightPanel, this._asset);
      this._preview.onSelectionChanged = (sel) => {
        if (!sel) {
          this._selectedComponentId = null;
        } else if (sel.type === 'root') {
          this._selectedComponentId = '__root__';
        } else {
          this._selectedComponentId = sel.id;
        }
        this._refreshComponentsList();
        this._refreshComponentProps();
      };
    }

    this._refreshComponentsList();
    this._refreshComponentProps();
  }

  /**
   * Build a simplified info panel for Controller blueprint assets.
   * No 3D viewport — just shows controller type and variables.
   */
  private _buildControllerInfoTab(): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;overflow-y:auto;height:100%;';
    this._tabContentArea.appendChild(wrap);
    this._viewportTabEl = wrap;

    const isPC = this._asset.actorType === 'playerController';
    const typeLabel = isPC ? 'Player Controller' : 'AI Controller';
    const emoji = isPC ? '🎮' : '🤖';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'physics-section-header';
    hdr.textContent = `${emoji} ${typeLabel} Blueprint`;
    wrap.appendChild(hdr);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:12px;line-height:1.5;';
    desc.textContent = isPC
      ? 'This is a Player Controller blueprint. Assign it to a Character Pawn in its Controller settings. ' +
        'Its Event Graph runs at play time alongside the possessed pawn — use Get Pawn to access the character.'
      : 'This is an AI Controller blueprint. Assign it to a Character Pawn in its Controller settings. ' +
        'Its Event Graph runs at play time alongside the possessed pawn — use AI MoveTo, Get Pawn, etc.';
    wrap.appendChild(desc);

    // Name row
    wrap.appendChild(this._makeTextRow('Name', this._asset.name, (v) => {
      this._asset.name = v;
      this._asset.touch();
      this._onAssetChanged();
    }));

    // Description row
    wrap.appendChild(this._makeTextRow('Description', this._asset.description, (v) => {
      this._asset.description = v;
      this._asset.touch();
      this._onAssetChanged();
    }));

    // Tip
    const tip = document.createElement('div');
    tip.style.cssText = 'color:#888;font-size:11px;margin-top:16px;font-style:italic;';
    tip.textContent = 'Switch to the Event Graph tab to add blueprint logic.';
    wrap.appendChild(tip);
  }

  // ---- 2D canvas preview for sprite/character2D actors ----

  private _build2DPreview(container: HTMLElement): void {
    Object.assign(container.style, {
      background: '#0a0a14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      padding: '12px',
    });

    const sprComp = this._asset.components.find(c => c.type === 'spriteRenderer');

    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 220;
    canvas.style.cssText = 'border:1px solid #2a2a42;border-radius:5px;image-rendering:pixelated;flex-shrink:0;cursor:grab;';
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Zoom / pan state
    let zoom = 1.0;
    let panX = 0, panY = 0;
    let _dragActive = false, _dragLastX = 0, _dragLastY = 0;

    // Last sprite render args — needed so zoom/pan can redraw without re-fetching the image
    let _lastImg: HTMLImageElement | null = null;
    let _lastSx = 0, _lastSy = 0, _lastSw = 0, _lastSh = 0;

    // Tracks last sprite render so the collider overlay uses the matching scale/ppu.
    let _lastDrawScale = 0;
    let _lastDrawPpu = 64;

    const drawChecker = () => {
      const s = 10;
      for (let y = 0; y < canvas.height; y += s) {
        for (let x = 0; x < canvas.width; x += s) {
          ctx.fillStyle = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0 ? '#1a1a22' : '#111118';
          ctx.fillRect(x, y, s, s);
        }
      }
    };

    const drawSprite = (img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) => {
      _lastImg = img; _lastSx = sx; _lastSy = sy; _lastSw = sw; _lastSh = sh;
      drawChecker();
      const baseScale = Math.min((canvas.width * 0.85) / sw, (canvas.height * 0.85) / sh);
      _lastDrawScale = baseScale * zoom;
      const dw = sw * _lastDrawScale;
      const dh = sh * _lastDrawScale;
      ctx.drawImage(img, sx, sy, sw, sh,
        (canvas.width - dw) / 2 + panX,
        (canvas.height - dh) / 2 + panY,
        dw, dh);
    };

    // Draw the collider2d component as a green dashed shape overlay on top of the sprite.
    const drawColliderOverlay = () => {
      if (_lastDrawScale === 0) return;
      const col = this._asset.components.find(c => c.type === 'collider2d');
      if (!col) return;

      const ppu   = _lastDrawPpu;
      const scale = _lastDrawScale;
      const cx = canvas.width  / 2 + panX;
      const cy = canvas.height / 2 + panY;
      const shape: string = col.collider2dShape ?? 'box';

      ctx.save();
      ctx.strokeStyle = 'rgba(0,230,100,0.9)';
      ctx.fillStyle   = 'rgba(0,230,100,0.08)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);

      if (shape === 'circle') {
        const r = (col.collider2dRadius ?? 0.5) * ppu * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'capsule') {
        const hw = ((col.collider2dSize?.width  ?? 0.8) / 2) * ppu * scale;
        const hh = ((col.collider2dSize?.height ?? 1.0) / 2) * ppu * scale;
        const r = hw;
        const bodyH = Math.max(0, hh - r);
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy - bodyH);
        ctx.arc(cx, cy - bodyH, r, Math.PI, 0);
        ctx.lineTo(cx + hw, cy + bodyH);
        ctx.arc(cx, cy + bodyH, r, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // box
        const hw = ((col.collider2dSize?.width  ?? 0.8) / 2) * ppu * scale;
        const hh = ((col.collider2dSize?.height ?? 1.0) / 2) * ppu * scale;
        ctx.beginPath();
        ctx.rect(cx - hw, cy - hh, hw * 2, hh * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Size label in top-left corner
      ctx.setLineDash([]);
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,230,100,0.85)';
      const label = shape === 'circle'
        ? `r=${(col.collider2dRadius ?? 0.5).toFixed(2)}`
        : `${(col.collider2dSize?.width ?? 0.8).toFixed(2)}×${(col.collider2dSize?.height ?? 1.0).toFixed(2)}`;
      ctx.fillText(label, 4, 4);
      ctx.restore();
    };

    // Zoom + pan interaction
    const redraw = () => {
      if (_lastImg) { drawSprite(_lastImg, _lastSx, _lastSy, _lastSw, _lastSh); drawColliderOverlay(); }
    };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Zoom toward cursor position
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
      const prevZoom = zoom;
      zoom = Math.max(0.2, Math.min(10, zoom * (e.deltaY > 0 ? 0.85 : 1 / 0.85)));
      panX = mx + (panX - mx) * (zoom / prevZoom);
      panY = my + (panY - my) * (zoom / prevZoom);
      redraw();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      _dragActive = true; _dragLastX = e.clientX; _dragLastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!_dragActive) return;
      const rect = canvas.getBoundingClientRect();
      const scaleCSS = canvas.width / rect.width;
      panX += (e.clientX - _dragLastX) * scaleCSS;
      panY += (e.clientY - _dragLastY) * scaleCSS;
      _dragLastX = e.clientX; _dragLastY = e.clientY;
      redraw();
    });
    canvas.addEventListener('mouseup',    () => { _dragActive = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('mouseleave', () => { _dragActive = false; });
    canvas.addEventListener('dblclick',   () => { zoom = 1; panX = panY = 0; redraw(); });

    const showMessage = (lines: string[], color = '#3a3a52') => {
      drawChecker();
      ctx.fillStyle = color;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * 18);
      });
    };

    const loadPreview = () => {
      if (!sprComp) {
        showMessage(['No SpriteRenderer component', 'Add one from the Components tree']);
        return;
      }
      if (!sprComp.spriteSheetId) {
        showMessage(['Select SpriteRenderer →', 'assign a Sprite Sheet']);
        return;
      }

      const sheet = this._scene2DManager?.spriteSheets.get(sprComp.spriteSheetId);
      if (!sheet) {
        const tex = TextureLibrary.instance?.getAsset(sprComp.spriteSheetId);
        if (tex?.storedData) {
          const img = new Image();
          img.onload = () => drawSprite(img, 0, 0, img.naturalWidth, img.naturalHeight);
          img.src = tex.storedData;
        } else {
          showMessage(['Sprite sheet not loaded'], '#e8a838');
        }
        return;
      }

      const renderWithImage = (img: HTMLImageElement) => {
        _lastDrawPpu = sheet.pixelsPerUnit ?? 64;
        const sprite = sprComp!.defaultSprite
          ? sheet.sprites.find(s => s.name === sprComp!.defaultSprite || s.spriteId === sprComp!.defaultSprite)
          : sheet.sprites[0];
        if (sprite) {
          drawSprite(img, sprite.x, sprite.y, sprite.width, sprite.height);
        } else {
          drawSprite(img, 0, 0, sheet.textureWidth, sheet.textureHeight);
        }
        drawColliderOverlay();
      };

      if (sheet.image?.complete && sheet.image.naturalWidth > 0) {
        renderWithImage(sheet.image);
      } else if (sheet.imageDataUrl) {
        const img = new Image();
        img.onload = () => { sheet.image = img; renderWithImage(img); };
        img.src = sheet.imageDataUrl;
      } else {
        showMessage(['Image not loaded'], '#e8a838');
      }
    };

    // Expose so property pickers can trigger a re-draw after changing the sprite sheet
    this._refreshPreview = loadPreview;

    loadPreview();
    container.appendChild(canvas);

    // Actor type label
    const typeLabel = document.createElement('div');
    typeLabel.style.cssText = 'font-size:11px;color:#64748b;text-align:center;line-height:1.5;max-width:220px;';
    const typeName = this._asset.actorType === 'characterPawn2D' ? '2D Character Pawn'
      : this._asset.actorType === 'spriteActor' ? '2D Sprite Actor'
      : '2D Parallax Layer';
    typeLabel.innerHTML = `<b style="color:#94a3b8">${typeName}</b><br>` +
      `<span style="font-size:10px;color:#475569">Scroll to zoom · Drag to pan · Dblclick to reset</span>`;
    container.appendChild(typeLabel);

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'toolbar-btn';
    refreshBtn.style.marginTop = '4px';
    refreshBtn.textContent = '↺ Refresh Preview';
    refreshBtn.addEventListener('click', () => {
      zoom = 1; panX = 0; panY = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      loadPreview();
    });
    container.appendChild(refreshBtn);
  }

  private _disposeViewportTab(): void {
    if (this._preview) {
      this._preview.dispose();
      this._preview = null;
    }
    this._viewportTabEl = null;
    this._componentsListEl = null;
    this._componentPropsEl = null;
  }

  // ---- Components tree ----

  private _refreshComponentsList(): void {
    if (!this._componentsListEl) return;
    this._componentsListEl.innerHTML = '';

    // Root component (always present)
    this._componentsListEl.appendChild(
      this._makeComponentItem(
        this._asset.rootMeshType === 'none'
          ? 'DefaultSceneRoot'
          : 'DefaultSceneRoot (' + this._asset.rootMeshType + ')',
        '__root__',
        this._asset.rootMeshType === 'none' ? '🔵' : '📦',
      ),
    );

    // Child components — render with hierarchy indentation
    for (const comp of this._asset.components) {
      const icon = comp.type === 'trigger' ? '⚡'
        : comp.type === 'light' ? '💡'
        : comp.type === 'camera' ? '📷'
        : comp.type === 'characterMovement' ? '🏃'
        : comp.type === 'springArm' ? '🎯'
        : comp.type === 'capsule' ? '🔵'
        : comp.type === 'spriteRenderer' ? '🖼'
        : comp.type === 'rigidbody2d' ? '⚙'
        : comp.type === 'collider2d' ? '▭'
        : comp.type === 'characterMovement2d' ? '🏃'
        : comp.type === 'tilemap' ? '🗺'
        : '🔹';
      const indent = comp.parentId ? true : false;
      const item = this._makeComponentItem(comp.name, comp.id, icon);
      if (indent) item.style.paddingLeft = '24px';
      this._componentsListEl.appendChild(item);
    }
  }

  private _makeComponentItem(label: string, id: string, icon: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'actor-comp-item' + (this._selectedComponentId === id ? ' selected' : '');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'actor-comp-item-icon';
    iconSpan.textContent = icon;
    item.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'actor-comp-item-name';
    nameSpan.textContent = label;
    item.appendChild(nameSpan);

    // Inheritance badge — show if this component is inherited or overridden
    const inhData = (this._asset as any)._inheritance;
    if (inhData && id !== '__root__') {
      const compOverrides: any[] = inhData.componentOverrides ?? [];
      const override = compOverrides.find((o: any) => o.componentId === id);
      if (override) {
        const badgeSpan = document.createElement('span');
        badgeSpan.style.cssText = 'margin-left:4px;';
        badgeSpan.innerHTML = inheritanceBadgeHTML(
          !!override.isInherited,
          !!override.overridden,
          !!override.addedInChild,
        );
        if (badgeSpan.innerHTML) item.appendChild(badgeSpan);
      }
    }

    // Select
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedComponentId = id;
      this._refreshComponentsList();
      this._refreshComponentProps();
      if (this._preview) this._preview.selectById(id);
    });

    // Delete button (not for root)
    if (id !== '__root__') {
      const actions = document.createElement('span');
      actions.className = 'actor-comp-item-actions';

      const delBtn = document.createElement('span');
      delBtn.className = 'mybp-delete';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove component';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._asset.components = this._asset.components.filter(c => c.id !== id);
        this._asset.touch();
        if (this._selectedComponentId === id) this._selectedComponentId = null;
        if (this._preview) this._preview.rebuild();
        this._refreshComponentsList();
        this._refreshComponentProps();
        this._onAssetChanged();
      });
      actions.appendChild(delBtn);
      item.appendChild(actions);
    }

    return item;
  }

  // ---- Component properties panel ----

  private _refreshComponentProps(): void {
    if (!this._componentPropsEl) return;
    this._componentPropsEl.innerHTML = '';

    if (!this._selectedComponentId) {
      this._componentPropsEl.innerHTML = '<div class="prop-empty" style="padding:8px;font-size:11px;">Select a component</div>';
      return;
    }

    if (this._selectedComponentId === '__root__') {
      this._buildRootProps();
    } else {
      const comp = this._asset.components.find(c => c.id === this._selectedComponentId);
      if (comp) this._buildChildProps(comp);
    }
  }

  private _buildRootProps(): void {
    const container = this._componentPropsEl!;

    // Title
    const title = document.createElement('div');
    title.className = 'actor-comp-props-title';
    title.textContent = 'Root Component';
    container.appendChild(title);

    // Root type dropdown (none = empty scene root)
    container.appendChild(this._makeDropdownRow('Root Type', this._asset.rootMeshType, ['none', 'cube', 'sphere', 'cylinder', 'plane'], (v) => {
      this._asset.rootMeshType = v as any;
      this._asset.touch();
      if (this._preview) this._preview.rebuild();
      this._refreshComponentsList();
      this._onAssetChanged();
    }));

    // ── Material Slots for root mesh ──
    if (this._asset.rootMeshType !== 'none') {
      this._buildMaterialSlotsSection(container, 'root');
    }

    // Physics section for root component (only for mesh roots)
    if (this._asset.rootMeshType !== 'none') {
      this._buildPhysicsSection(container, this._asset.rootPhysics);
    }

    // ---- Character Pawn settings ----
    if (this._asset.actorType === 'characterPawn') {
      if (!this._asset.characterPawnConfig) {
        this._asset.characterPawnConfig = defaultCharacterPawnConfig();
      }

      // ── Controller selector ──
      const ctrlHeader = document.createElement('div');
      ctrlHeader.className = 'physics-section-header';
      ctrlHeader.textContent = '🎮 Controller';
      container.appendChild(ctrlHeader);

      // Build options list: Default types + any created controller blueprints
      const controllerOptions: string[] = ['None', 'PlayerController (Default)', 'AIController (Default)'];
      const controllerBlueprintAssets: ActorAsset[] = [];
      if (this._assetManager) {
        for (const a of this._assetManager.assets) {
          if (a.actorType === 'playerController' || a.actorType === 'aiController') {
            controllerBlueprintAssets.push(a);
            const prefix = a.actorType === 'playerController' ? '🎮' : '🤖';
            controllerOptions.push(`${prefix} ${a.name}`);
          }
        }
      }

      // Determine current value for the dropdown
      let currentValue = 'None';
      if (this._asset.controllerBlueprintId) {
        const bpAsset = controllerBlueprintAssets.find(a => a.id === this._asset.controllerBlueprintId);
        if (bpAsset) {
          const prefix = bpAsset.actorType === 'playerController' ? '🎮' : '🤖';
          currentValue = `${prefix} ${bpAsset.name}`;
        }
      } else if (this._asset.controllerClass === 'PlayerController') {
        currentValue = 'PlayerController (Default)';
      } else if (this._asset.controllerClass === 'AIController') {
        currentValue = 'AIController (Default)';
      }

      container.appendChild(this._makeDropdownRow('Controller', currentValue, controllerOptions, (v) => {
        if (v === 'None') {
          this._asset.controllerClass = 'None';
          this._asset.controllerBlueprintId = '';
        } else if (v === 'PlayerController (Default)') {
          this._asset.controllerClass = 'PlayerController';
          this._asset.controllerBlueprintId = '';
        } else if (v === 'AIController (Default)') {
          this._asset.controllerClass = 'AIController';
          this._asset.controllerBlueprintId = '';
        } else {
          // A specific controller blueprint was selected
          const bpAsset = controllerBlueprintAssets.find(a => {
            const prefix = a.actorType === 'playerController' ? '🎮' : '🤖';
            return `${prefix} ${a.name}` === v;
          });
          if (bpAsset) {
            this._asset.controllerClass = bpAsset.actorType === 'playerController' ? 'PlayerController' : 'AIController';
            this._asset.controllerBlueprintId = bpAsset.id;
          }
        }
        this._asset.touch();
        this._onAssetChanged();
      }));

      this._buildCharacterPawnSection(container);
    }
  }

  /**
   * Build a UE-style "Material Slots" section showing each material slot
   * from the mesh and a dropdown to override it with any available material.
   * @param container Parent DOM element to append into
   * @param targetId  'root' for the root mesh, or component id for skeletal mesh components
   */
  private _buildMaterialSlotsSection(container: HTMLElement, targetId: string): void {
    if (!this._meshManager) return;

    // ── Determine the mesh asset and current overrides map ──
    let meshAsset: MeshAsset | undefined;
    let overrides: Record<string, string>;
    let isPrimitive = false;

    if (targetId === 'root') {
      if (this._asset.rootCustomMeshAssetId) {
        meshAsset = this._meshManager.getAsset(this._asset.rootCustomMeshAssetId);
      }
      overrides = this._asset.rootMaterialOverrides;
      isPrimitive = !this._asset.rootCustomMeshAssetId;
    } else {
      const comp = this._asset.components.find(c => c.id === targetId);
      if (!comp) return;
      if (comp.type === 'skeletalMesh' && comp.skeletalMesh?.meshAssetId) {
        meshAsset = this._meshManager.getAsset(comp.skeletalMesh.meshAssetId);
      } else if (comp.customMeshAssetId) {
        meshAsset = this._meshManager.getAsset(comp.customMeshAssetId);
      } else if (comp.type === 'mesh') {
        isPrimitive = true; // Primitive mesh component — show single material slot
      }
      if (!comp.materialOverrides) comp.materialOverrides = {};
      overrides = comp.materialOverrides;
    }

    // Determine slot names
    let slotNames: string[];
    if (meshAsset && meshAsset.materials.length > 0) {
      slotNames = meshAsset.materials.map((m, i) => m.assetName || `Slot ${i}`);
    } else if (isPrimitive) {
      slotNames = ['Material'];
    } else {
      return; // no mesh → no slots
    }

    // ── Section header ──
    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '🎨 Material Slots';
    container.appendChild(header);

    // Build all available material options
    const allMaterials = this._meshManager.allMaterials;
    const materialOptions = ['(Default)', ...allMaterials.map(m => m.assetName)];

    // ── One row per slot ──
    for (let i = 0; i < slotNames.length; i++) {
      const slotKey = String(i);
      const currentOverride = overrides[slotKey];
      const currentMat = currentOverride
        ? (allMaterials.find(m => m.assetId === currentOverride)?.assetName ?? '(Default)')
        : '(Default)';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;';

      // Color swatch
      const swatch = document.createElement('div');
      swatch.style.cssText = 'width:14px;height:14px;border-radius:3px;border:1px solid #555;flex-shrink:0;';
      const swatchColor = currentOverride
        ? (allMaterials.find(m => m.assetId === currentOverride)?.materialData.baseColor ?? '#6c8ebf')
        : (meshAsset?.materials[i]?.materialData.baseColor ?? '#6c8ebf');
      swatch.style.backgroundColor = swatchColor;
      row.appendChild(swatch);

      // Slot label
      const label = document.createElement('span');
      label.className = 'prop-label';
      label.style.cssText = 'flex:0 0 auto;min-width:50px;font-size:11px;';
      label.textContent = slotNames[i];
      row.appendChild(label);

      // Dropdown
      const select = document.createElement('select');
      select.className = 'prop-input';
      select.style.cssText = 'flex:1;';
      for (const optName of materialOptions) {
        const opt = document.createElement('option');
        opt.value = optName;
        opt.textContent = optName;
        if (optName === currentMat) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        const v = select.value;
        if (v === '(Default)') {
          delete overrides[slotKey];
        } else {
          const mat = allMaterials.find(m => m.assetName === v);
          if (mat) overrides[slotKey] = mat.assetId;
        }
        this._asset.touch();
        if (this._preview) this._preview.applyMaterialOverrides();
        this._refreshComponentProps();
        this._onAssetChanged();
      });
      row.appendChild(select);

      // Reset button
      if (currentOverride) {
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺';
        resetBtn.title = 'Reset to default';
        resetBtn.style.cssText = 'background:none;border:1px solid #555;color:#ccc;border-radius:3px;cursor:pointer;padding:1px 4px;font-size:12px;flex-shrink:0;';
        resetBtn.addEventListener('click', () => {
          delete overrides[slotKey];
          this._asset.touch();
          if (this._preview) this._preview.applyMaterialOverrides();
          this._refreshComponentProps();
          this._onAssetChanged();
        });
        row.appendChild(resetBtn);
      }

      container.appendChild(row);
    }
  }

  private _buildChildProps(comp: ActorComponentData): void {
    const container = this._componentPropsEl!;

    // Title
    const title = document.createElement('div');
    title.className = 'actor-comp-props-title';
    title.textContent = comp.name;
    container.appendChild(title);

    // Name
    container.appendChild(this._makeTextRow('Name', comp.name, (v) => {
      comp.name = v;
      this._asset.touch();
      this._refreshComponentsList();
      this._onAssetChanged();
    }));

    if (comp.type === 'trigger') {
      // ---- Trigger component properties ----
      // Offset
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Collision settings section
      if (!comp.collision) comp.collision = defaultCollisionConfig();
      this._buildCollisionSection(container, comp.collision);
    } else if (comp.type === 'light') {
      // ---- Light component properties ----
      if (!comp.light) comp.light = defaultLightConfig('point');
      const lcfg = comp.light;

      // Light Type (read-only)
      const ltRow = document.createElement('div');
      ltRow.className = 'prop-row';
      ltRow.innerHTML = '<span class="prop-label">Type</span>';
      const ltVal = document.createElement('span');
      ltVal.className = 'prop-value';
      ltVal.textContent = lcfg.lightType.charAt(0).toUpperCase() + lcfg.lightType.slice(1);
      ltVal.style.color = '#ffcc00';
      ltRow.appendChild(ltVal);
      container.appendChild(ltRow);

      // Offset
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Enabled
      container.appendChild(this._makeCheckboxRow('Enabled', lcfg.enabled, (v) => {
        lcfg.enabled = v;
        this._asset.touch();
        this._onAssetChanged();
      }));

      // Color
      container.appendChild(this._makeColorRow('Color', lcfg.color, (v) => {
        lcfg.color = v;
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Ground Color (hemisphere only)
      if (lcfg.lightType === 'hemisphere') {
        container.appendChild(this._makeColorRow('Ground Color', lcfg.groundColor, (v) => {
          lcfg.groundColor = v;
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._onAssetChanged();
        }));
      }

      // Intensity
      container.appendChild(this._makeNumberRow('Intensity', lcfg.intensity, 0.1, 0, 100, (v) => {
        lcfg.intensity = v;
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Distance (point / spot)
      if (lcfg.lightType === 'point' || lcfg.lightType === 'spot') {
        container.appendChild(this._makeNumberRow('Distance', lcfg.distance, 0.5, 0, 1000, (v) => {
          lcfg.distance = v;
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._onAssetChanged();
        }));
        container.appendChild(this._makeNumberRow('Decay', lcfg.decay, 0.1, 0, 10, (v) => {
          lcfg.decay = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
      }

      // Spot-specific: angle, penumbra
      if (lcfg.lightType === 'spot') {
        container.appendChild(this._makeNumberRow('Angle (deg)', lcfg.angle, 1, 1, 180, (v) => {
          lcfg.angle = v;
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._onAssetChanged();
        }));
        container.appendChild(this._makeNumberRow('Penumbra', lcfg.penumbra, 0.05, 0, 1, (v) => {
          lcfg.penumbra = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
      }

      // Target (directional / spot)
      if (lcfg.lightType === 'directional' || lcfg.lightType === 'spot') {
        container.appendChild(this._makeVec3Row('Target', lcfg.target, () => {
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._onAssetChanged();
        }));
      }

      // Shadows section header
      const shHeader = document.createElement('div');
      shHeader.className = 'prop-section-title';
      shHeader.textContent = 'Shadows';
      container.appendChild(shHeader);

      // Cast Shadow (not for ambient/hemisphere)
      if (lcfg.lightType !== 'ambient' && lcfg.lightType !== 'hemisphere') {
        container.appendChild(this._makeCheckboxRow('Cast Shadow', lcfg.castShadow, (v) => {
          lcfg.castShadow = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
        container.appendChild(this._makeDropdownRow('Map Size', String(lcfg.shadowMapSize), ['512', '1024', '2048', '4096'], (v) => {
          lcfg.shadowMapSize = parseInt(v, 10);
          this._asset.touch();
          this._onAssetChanged();
        }));
        container.appendChild(this._makeNumberRow('Shadow Bias', lcfg.shadowBias, 0.0001, -0.01, 0.01, (v) => {
          lcfg.shadowBias = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
      }
    } else if (comp.type === 'springArm') {
      // ---- Spring Arm component properties ----
      if (!comp.springArm) comp.springArm = defaultSpringArmConfig();
      this._buildSpringArmSection(container, comp.springArm);
    } else if (comp.type === 'camera') {
      // ---- Camera component properties ----
      if (!comp.camera) comp.camera = defaultCameraConfig('thirdPerson');
      this._buildCameraComponentSection(container, comp.camera);
    } else if (comp.type === 'capsule') {
      // ---- Capsule component (read-only info, config lives in characterPawnConfig) ----
      const capsInfo = document.createElement('div');
      capsInfo.className = 'prop-row';
      capsInfo.style.color = '#888';
      capsInfo.style.fontSize = '11px';
      capsInfo.style.padding = '4px 0';
      capsInfo.textContent = 'Capsule collision is configured via the root Character Pawn settings.';
      container.appendChild(capsInfo);
      if (this._asset.characterPawnConfig) {
        const cfg = this._asset.characterPawnConfig.capsule;
        const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };
        container.appendChild(this._makeNumberRow('Radius', cfg.radius, 0.05, 0.1, 5, (v) => { cfg.radius = v; notifyChanged(); }));
        container.appendChild(this._makeNumberRow('Height', cfg.height, 0.1, 0.2, 10, (v) => { cfg.height = v; notifyChanged(); }));

        // ---- Collision Profile Section ----
        if (!cfg.collisionProfile) {
          cfg.collisionProfile = defaultPawnCollisionProfile();
        }
        const profile = cfg.collisionProfile;
        const profileSection = document.createElement('div');
        profileSection.className = 'physics-section';
        profileSection.style.marginTop = '8px';

        const profileHeader = document.createElement('div');
        profileHeader.className = 'physics-section-header';
        profileHeader.textContent = '🛡️ Collision Profile';
        profileSection.appendChild(profileHeader);

        const profileBody = document.createElement('div');
        profileBody.className = 'physics-section-body';
        profileSection.appendChild(profileBody);

        // Profile name (read-only display)
        const nameRow = document.createElement('div');
        nameRow.className = 'prop-row';
        nameRow.style.color = '#ccc';
        nameRow.style.fontSize = '11px';
        nameRow.textContent = `Preset: ${profile.name}`;
        profileBody.appendChild(nameRow);

        // Object Type display
        const objRow = document.createElement('div');
        objRow.className = 'prop-row';
        objRow.style.color = '#ccc';
        objRow.style.fontSize = '11px';
        objRow.textContent = `Object Type: ${profile.objectType}`;
        profileBody.appendChild(objRow);

        // Per-channel responses
        const chHeader = document.createElement('div');
        chHeader.className = 'physics-subsection-header';
        chHeader.textContent = 'Channel Responses';
        profileBody.appendChild(chHeader);

        const channelNames: CollisionChannelName[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'Player', 'Projectile', 'Trigger', 'Camera'];
        const responses: CollisionResponse[] = ['block', 'overlap', 'ignore'];
        for (const ch of channelNames) {
          const current = profile.responses[ch] ?? 'ignore';
          profileBody.appendChild(this._makeDropdownRow(ch, current, responses, (v) => {
            profile.responses[ch] = v as CollisionResponse;
            profile.name = 'Custom'; // Mark as customized
            notifyChanged();
          }));
        }

        container.appendChild(profileSection);
      }

      // ---- Hidden In Game toggle ----
      const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };
      const isHidden = comp.hiddenInGame !== false; // default true for capsule
      container.appendChild(this._makeCheckboxRow('Hidden In Game', isHidden, (v) => {
        comp.hiddenInGame = v;
        notifyChanged();
      }));
    } else if (comp.type === 'characterMovement') {
      // ---- Character Movement component (read-only info, config lives in characterPawnConfig) ----
      const info = document.createElement('div');
      info.className = 'prop-row';
      info.style.color = '#888';
      info.style.fontSize = '11px';
      info.style.padding = '4px 0';
      info.textContent = 'Movement is configured via the root Character Pawn settings.';
      container.appendChild(info);
    } else if (comp.type === 'skeletalMesh') {
      // ---- Skeletal Mesh component properties ----
      if (!comp.skeletalMesh) {
        comp.skeletalMesh = { meshAssetId: '', animationName: '', loopAnimation: true, animationSpeed: 1.0, strictSkeletonMatching: false };
      } else if (comp.skeletalMesh.strictSkeletonMatching === undefined) {
        comp.skeletalMesh.strictSkeletonMatching = false;
      }
      const cfg = comp.skeletalMesh;

      // Mesh Asset picker
      const meshOptions: string[] = ['(None)'];
      const meshAssets: MeshAsset[] = [];
      if (this._meshManager) {
        for (const ma of this._meshManager.assets) {
          meshAssets.push(ma);
          meshOptions.push(ma.name);
        }
      }

      const currentMesh = cfg.meshAssetId
        ? (meshAssets.find(m => m.id === cfg.meshAssetId)?.name ?? '(None)')
        : '(None)';

      container.appendChild(this._makeDropdownRow('Mesh Asset', currentMesh, meshOptions, (v) => {
        if (v === '(None)') {
          cfg.meshAssetId = '';
          cfg.animationName = '';
        } else {
          const ma = meshAssets.find(m => m.name === v);
          if (ma) {
            cfg.meshAssetId = ma.id;
            cfg.animationName = ''; // reset animation when mesh changes
          }
        }
        // Clear material overrides when mesh changes
        comp.materialOverrides = {};
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._refreshComponentProps(); // re-render to update animation list
        this._onAssetChanged();
      }));

      // ── Material Slots for skeletal mesh component ──
      if (cfg.meshAssetId) {
        this._buildMaterialSlotsSection(container, comp.id);
      }

      // ---- Animation Blueprint picker ----
      if (this._animBPManager && this._animBPManager.assets.length > 0) {
        const abpHeader = document.createElement('div');
        abpHeader.className = 'prop-section-title';
        abpHeader.textContent = '🎬 Animation Blueprint';
        container.appendChild(abpHeader);

        const abpAssets = this._animBPManager.assets.filter(a => !a.is2D);
        const abpOptions = ['(None)', ...abpAssets.map(a => a.name)];
        const currentBP = cfg.animationBlueprintId
          ? (abpAssets.find(a => a.id === cfg.animationBlueprintId)?.name ?? '(None)')
          : '(None)';

        container.appendChild(this._makeDropdownRow('Anim BP', currentBP, abpOptions, (v) => {
          if (v === '(None)') {
            cfg.animationBlueprintId = undefined;
          } else {
            const abp = abpAssets.find(a => a.name === v);
            if (abp) {
              cfg.animationBlueprintId = abp.id;
              // Auto-bind target skeleton if missing
              if (!abp.targetSkeletonMeshAssetId && cfg.meshAssetId) {
                abp.targetSkeletonMeshAssetId = cfg.meshAssetId;
                const target = this._meshManager?.getAsset(cfg.meshAssetId);
                abp.targetSkeletonId = target?.skeleton?.assetId ?? '';
                abp.touch();
                this._animBPManager?.notifyAssetChanged(abp.id);
              }
            }
          }
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._refreshComponentProps(); // re-render to toggle single-anim vs BP mode
          this._onAssetChanged();
        }));

        container.appendChild(this._makeCheckboxRow('Strict Skeleton', !!cfg.strictSkeletonMatching, (v) => {
          cfg.strictSkeletonMatching = v;
          this._asset.touch();
          this._onAssetChanged();
        }));

        // If an anim BP is assigned, show its info and hide single-animation picker
        if (cfg.animationBlueprintId) {
          const abp = abpAssets.find(a => a.id === cfg.animationBlueprintId);
          if (abp) {
            const info = document.createElement('div');
            info.style.cssText = 'font-size:10px;color:var(--text-dim);padding:4px 12px;line-height:1.5;';
            const animVarCount = abp.blueprintData.variables.filter(v =>
              v.type === 'Float' || v.type === 'Boolean' || v.type === 'String'
            ).length;
            info.innerHTML = `States: <b>${abp.stateMachine.states.length}</b> · Transitions: <b>${abp.stateMachine.transitions.length}</b><br>` +
              `Variables: <b>${animVarCount}</b> · Blend Spaces: <b>${abp.blendSpaces1D.length}</b>`;
            container.appendChild(info);

            if (!abp.targetSkeletonMeshAssetId) {
              const warn = document.createElement('div');
              warn.style.cssText = 'font-size:10px;color:#e8a838;padding:2px 12px;line-height:1.4;';
              warn.textContent = 'Anim BP has no target mesh. Set it in the AnimBP editor.';
              container.appendChild(warn);
            } else if (cfg.meshAssetId && abp.targetSkeletonMeshAssetId !== cfg.meshAssetId) {
              const warn = document.createElement('div');
              warn.style.cssText = 'font-size:10px;color:#e8a838;padding:2px 12px;line-height:1.4;';
              warn.textContent = 'Anim BP target mesh does not match this skeletal mesh.';
              container.appendChild(warn);
            }
            if (cfg.meshAssetId && abp.targetSkeletonId) {
              const target = meshAssets.find(m => m.id === cfg.meshAssetId);
              const skeletonId = target?.skeleton?.assetId ?? '';
              if (skeletonId && skeletonId !== abp.targetSkeletonId) {
                const warn = document.createElement('div');
                warn.style.cssText = 'font-size:10px;color:#e8a838;padding:2px 12px;line-height:1.4;';
                warn.textContent = 'Anim BP skeleton does not match this mesh skeleton.';
                container.appendChild(warn);
              }
            }
          }
        }
      }

      // Animation picker (only if NO anim BP is assigned and mesh has animations)
      const selectedMeshAsset = meshAssets.find(m => m.id === cfg.meshAssetId);
      if (!cfg.animationBlueprintId && selectedMeshAsset && selectedMeshAsset.animations.length > 0) {
        const animHeader = document.createElement('div');
        animHeader.className = 'prop-section-title';
        animHeader.textContent = 'Animation';
        container.appendChild(animHeader);

        const animNames = selectedMeshAsset.animations.map(a => a.assetName);
        const animOptions = ['(None)', ...animNames];
        const currentAnim = cfg.animationName || '(None)';

        container.appendChild(this._makeDropdownRow('Animation', currentAnim, animOptions, (v) => {
          cfg.animationName = v === '(None)' ? '' : v;
          this._asset.touch();
          if (this._preview) this._preview.rebuild();
          this._onAssetChanged();
        }));

        container.appendChild(this._makeCheckboxRow('Loop', cfg.loopAnimation, (v) => {
          cfg.loopAnimation = v;
          this._asset.touch();
          this._onAssetChanged();
        }));

        container.appendChild(this._makeNumberRow('Speed', cfg.animationSpeed, 0.1, 0, 10, (v) => {
          cfg.animationSpeed = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
      }

      // Offset / Rotation / Scale
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.updateComponentTransform(comp.id);
        this._onAssetChanged();
      }));

      container.appendChild(this._makeVec3Row('Rotation', comp.rotation, () => {
        this._asset.touch();
        if (this._preview) this._preview.updateComponentTransform(comp.id);
        this._onAssetChanged();
      }));

      container.appendChild(this._makeVec3Row('Scale', comp.scale, () => {
        this._asset.touch();
        if (this._preview) this._preview.updateComponentTransform(comp.id);
        this._onAssetChanged();
      }));
    } else if (comp.type === 'spriteRenderer') {
      // ---- Sprite Renderer component properties ----
      const sprHeader = document.createElement('div');
      sprHeader.className = 'prop-section-title';
      sprHeader.textContent = '🖼 Sprite';
      container.appendChild(sprHeader);

      // Build sheet options from Scene2DManager + TextureLibrary 'Sprite'
      type SheetOpt = { id: string; name: string };
      const sheetOptions: SheetOpt[] = [];
      if (this._scene2DManager) {
        for (const [id, sheet] of this._scene2DManager.spriteSheets) {
          sheetOptions.push({ id, name: sheet.assetName });
        }
      }
      const existingSourceTexIds = new Set(
        this._scene2DManager
          ? Array.from(this._scene2DManager.spriteSheets.values()).map(s => s.sourceTexture)
          : [],
      );
      const texLib = TextureLibrary.instance;
      if (texLib) {
        for (const tex of texLib.getTexturesByCategory('Sprite')) {
          if (!existingSourceTexIds.has(tex.assetId)) {
            sheetOptions.push({ id: tex.assetId, name: tex.assetName + ' ↑' });
          }
        }
      }

      const sheetDisplayOptions = ['(None)', ...sheetOptions.map(s => s.name)];
      const currentSheet = comp.spriteSheetId
        ? (sheetOptions.find(s => s.id === comp.spriteSheetId)?.name ?? '(None)')
        : '(None)';

      container.appendChild(this._makeDropdownRow('Sprite Sheet', currentSheet, sheetDisplayOptions, (v) => {
        if (v === '(None)') {
          comp.spriteSheetId = undefined;
          comp.defaultSprite = undefined;
        } else {
          const sel = sheetOptions.find(s => s.name === v);
          if (sel) comp.spriteSheetId = sel.id;
        }
        this._asset.touch();
        this._refreshComponentProps();
        this._refreshPreview?.();
        this._onAssetChanged();
      }));

      // Default Sprite picker
      if (comp.spriteSheetId && this._scene2DManager) {
        const sheet = this._scene2DManager.spriteSheets.get(comp.spriteSheetId);
        if (sheet && sheet.sprites.length > 0) {
          const spriteOpts = ['(First)', ...sheet.sprites.map(s => s.name)];
          const currentSpr = comp.defaultSprite || '(First)';
          container.appendChild(this._makeDropdownRow('Default Sprite', currentSpr, spriteOpts, (v) => {
            comp.defaultSprite = v === '(First)' ? undefined : v;
            this._asset.touch();
            this._refreshPreview?.();
            this._onAssetChanged();
          }));
        }
      }

      // Flip
      container.appendChild(this._makeCheckboxRow('Flip X', !!(comp as any).flipX, (v) => {
        (comp as any).flipX = v;
        this._asset.touch();
        this._onAssetChanged();
      }));
      container.appendChild(this._makeCheckboxRow('Flip Y', !!(comp as any).flipY, (v) => {
        (comp as any).flipY = v;
        this._asset.touch();
        this._onAssetChanged();
      }));

      // Sorting
      container.appendChild(this._makeDropdownRow('Sorting Layer', comp.sortingLayer ?? 'Default',
        ['Default', 'Background', 'Foreground', 'UI'], (v) => {
          comp.sortingLayer = v;
          this._asset.touch();
          this._onAssetChanged();
        }));
      container.appendChild(this._makeNumberRow('Order In Layer', comp.orderInLayer ?? 0, 1, -100, 100, (v) => {
        comp.orderInLayer = Math.round(v);
        this._asset.touch();
        this._onAssetChanged();
      }));

      // ---- 2D Animation Blueprint picker ----
      const abp2dHeader = document.createElement('div');
      abp2dHeader.className = 'prop-section-title';
      abp2dHeader.textContent = '🎬 2D Animation Blueprint';
      container.appendChild(abp2dHeader);

      if (this._animBPManager) {
        const abp2dAssets = this._animBPManager.assets.filter(a => a.is2D);
        const abp2dOptions = ['(None)', ...abp2dAssets.map(a => a.name)];
        const currentBP2D = comp.animBlueprint2dId
          ? (abp2dAssets.find(a => a.id === comp.animBlueprint2dId)?.name ?? '(None)')
          : '(None)';

        container.appendChild(this._makeDropdownRow('Anim BP 2D', currentBP2D, abp2dOptions, (v) => {
          if (v === '(None)') {
            comp.animBlueprint2dId = undefined;
          } else {
            const abp = abp2dAssets.find(a => a.name === v);
            if (abp) {
              comp.animBlueprint2dId = abp.id;
              // Auto-assign target sprite sheet if the BP doesn't have one yet
              if (!abp.targetSpriteSheetId && comp.spriteSheetId) {
                abp.targetSpriteSheetId = comp.spriteSheetId;
                abp.touch();
                this._animBPManager?.notifyAssetChanged(abp.id);
              }
            }
          }
          this._asset.touch();
          this._refreshComponentProps();
          this._onAssetChanged();
        }));

        if (comp.animBlueprint2dId) {
          const abp = abp2dAssets.find(a => a.id === comp.animBlueprint2dId);
          if (abp) {
            const info = document.createElement('div');
            info.style.cssText = 'font-size:10px;color:var(--text-dim);padding:4px 12px;line-height:1.5;';
            info.innerHTML = `States: <b>${abp.stateMachine.states.length}</b> &middot; Transitions: <b>${abp.stateMachine.transitions.length}</b>`;
            container.appendChild(info);

            const openBtn = document.createElement('button');
            openBtn.className = 'toolbar-btn';
            openBtn.style.margin = '4px 10px';
            openBtn.textContent = '🎬 Open AnimBP 2D Editor';
            openBtn.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent('open-animblueprint-2d', { detail: { assetId: abp.id } }));
            });
            container.appendChild(openBtn);

            if (!abp.targetSpriteSheetId) {
              const warn = document.createElement('div');
              warn.style.cssText = 'font-size:10px;color:#e8a838;padding:2px 12px;line-height:1.4;';
              warn.textContent = '⚠ Anim BP has no target sprite sheet — set it in the AnimBP 2D editor.';
              container.appendChild(warn);
            }
          }
        } else if (abp2dAssets.length === 0) {
          const hint = document.createElement('div');
          hint.style.cssText = 'font-size:10px;color:#64748b;padding:2px 12px;line-height:1.4;';
          hint.textContent = 'No 2D animation blueprints found. Create one in the Content Browser → right-click → Create → Animation Blueprint (2D).';
          container.appendChild(hint);
        }
      }

    } else if (comp.type === 'rigidbody2d') {
      // ---- RigidBody 2D ----
      const rbHeader = document.createElement('div');
      rbHeader.className = 'prop-section-title';
      rbHeader.textContent = '⚙ Rigidbody 2D';
      container.appendChild(rbHeader);
      container.appendChild(this._makeDropdownRow('Body Type',
        comp.rigidbody2dType ?? 'dynamic', ['dynamic', 'static', 'kinematic'], (v) => {
          comp.rigidbody2dType = v as 'dynamic' | 'static' | 'kinematic';
          this._asset.touch();
          this._onAssetChanged();
        }));

    } else if (comp.type === 'collider2d') {
      // ---- Collider 2D ----
      const colHeader = document.createElement('div');
      colHeader.className = 'prop-section-title';
      colHeader.textContent = '▭ Collider 2D';
      container.appendChild(colHeader);
      container.appendChild(this._makeDropdownRow('Shape',
        comp.collider2dShape ?? 'box', ['box', 'circle', 'capsule'], (v) => {
          comp.collider2dShape = v as 'box' | 'circle' | 'capsule';
          this._asset.touch();
          this._refreshComponentProps();
          this._onAssetChanged();
          this._refreshPreview?.();
        }));
      if ((comp.collider2dShape ?? 'box') === 'circle') {
        if (comp.collider2dRadius === undefined) comp.collider2dRadius = 0.5;
        container.appendChild(this._makeNumberRow('Radius', comp.collider2dRadius, 0.05, 0.05, 20, (v) => {
          comp.collider2dRadius = v;
          this._asset.touch();
          this._onAssetChanged();
          this._refreshPreview?.();
        }));
      } else {
        if (!comp.collider2dSize) comp.collider2dSize = { width: 0.8, height: 1.0 };
        container.appendChild(this._makeNumberRow('Width', comp.collider2dSize.width, 0.05, 0.05, 20, (v) => {
          comp.collider2dSize!.width = v;
          this._asset.touch();
          this._onAssetChanged();
          this._refreshPreview?.();
        }));
        container.appendChild(this._makeNumberRow('Height', comp.collider2dSize.height, 0.05, 0.05, 20, (v) => {
          comp.collider2dSize!.height = v;
          this._asset.touch();
          this._onAssetChanged();
          this._refreshPreview?.();
        }));
      }

    } else if (comp.type === 'characterMovement2d') {
      // ---- Character Movement 2D ----
      const info = document.createElement('div');
      info.style.cssText = 'color:#888;font-size:11px;padding:6px 0;line-height:1.5;';
      info.textContent = '2D movement speed, jump force and physics are configured via the Character Pad 2D settings.';
      container.appendChild(info);

    } else {
      // ---- Mesh component properties (Static Mesh or Primitive) ----

      // Build unified mesh dropdown: Primitives + Imported meshes (UE-style)
      const primitiveOptions = ['Cube', 'Sphere', 'Cylinder', 'Plane'];
      const importedMeshes: { label: string; id: string }[] = [];
      if (this._meshManager) {
        for (const ma of this._meshManager.assets) {
          importedMeshes.push({ label: ma.name, id: ma.id });
        }
      }
      const allMeshOptions = [
        ...primitiveOptions,
        ...(importedMeshes.length > 0 ? ['──── Imported Meshes ────'] : []),
        ...importedMeshes.map(m => `📁 ${m.label}`),
      ];

      // Determine current display value
      let currentMeshDisplay: string;
      if (comp.customMeshAssetId) {
        const ma = this._meshManager?.getAsset(comp.customMeshAssetId);
        currentMeshDisplay = ma ? `📁 ${ma.name}` : '(Missing Mesh)';
      } else {
        currentMeshDisplay = comp.meshType.charAt(0).toUpperCase() + comp.meshType.slice(1);
      }

      container.appendChild(this._makeDropdownRow('Static Mesh', currentMeshDisplay, allMeshOptions, (v) => {
        if (v.startsWith('────')) return; // separator — ignore
        if (v.startsWith('📁 ')) {
          const meshName = v.slice(3);
          const ma = importedMeshes.find(m => m.label === meshName);
          if (ma) {
            comp.customMeshAssetId = ma.id;
            comp.materialOverrides = {}; // reset overrides on mesh change
          }
        } else {
          delete comp.customMeshAssetId;
          comp.meshType = v.toLowerCase() as MeshType;
          comp.materialOverrides = {};
        }
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._refreshComponentProps();
        this._onAssetChanged();
      }));

      // ── Material Slots ──
      this._buildMaterialSlotsSection(container, comp.id);

      // Offset
      container.appendChild(this._makeVec3Row('Offset', comp.offset, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Rotation
      container.appendChild(this._makeVec3Row('Rotation', comp.rotation, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Scale
      container.appendChild(this._makeVec3Row('Scale', comp.scale, () => {
        this._asset.touch();
        if (this._preview) this._preview.rebuild();
        this._onAssetChanged();
      }));

      // Physics section for mesh child component
      if (!comp.physics) comp.physics = defaultPhysicsConfig();
      this._buildPhysicsSection(container, comp.physics);

      // Collision section for mesh child component (UE-style per-component collision)
      if (!comp.collision) comp.collision = defaultMeshCollisionConfig();
      this._buildCollisionSection(container, comp.collision);
    }
  }

  // ---- Add Component context menu ----

  private _showAddComponentMenu(e: MouseEvent): void {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // ---- Mesh sub-header ----
    const meshHeader = document.createElement('div');
    meshHeader.className = 'context-menu-header';
    meshHeader.textContent = '📦 Mesh';
    menu.appendChild(meshHeader);

    // Static Mesh Component (imported mesh)
    const staticMeshItem = document.createElement('div');
    staticMeshItem.className = 'context-menu-item';
    staticMeshItem.textContent = 'Static Mesh Component';
    staticMeshItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      this._addStaticMeshComponent();
    });
    menu.appendChild(staticMeshItem);

    const meshTypes: { label: string; type: MeshType }[] = [
      { label: 'Cube Mesh', type: 'cube' },
      { label: 'Sphere Mesh', type: 'sphere' },
      { label: 'Cylinder Mesh', type: 'cylinder' },
      { label: 'Plane Mesh', type: 'plane' },
    ];

    for (const t of meshTypes) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        this._addComponent(t.type);
      });
      menu.appendChild(item);
    }

    // ---- Skeletal Mesh sub-header ----
    const skeletalHeader = document.createElement('div');
    skeletalHeader.className = 'context-menu-header';
    skeletalHeader.textContent = '🦴 Skeletal Mesh';
    menu.appendChild(skeletalHeader);

    const addSkeletalMesh = document.createElement('div');
    addSkeletalMesh.className = 'context-menu-item';
    addSkeletalMesh.textContent = 'Skeletal Mesh Component';
    addSkeletalMesh.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      this._addSkeletalMeshComponent();
    });
    menu.appendChild(addSkeletalMesh);

    // ---- Trigger sub-header ----
    const triggerHeader = document.createElement('div');
    triggerHeader.className = 'context-menu-header';
    triggerHeader.textContent = '⚡ Collision';
    menu.appendChild(triggerHeader);

    const triggerTypes: { label: string; shape: CollisionShapeType }[] = [
      { label: 'Box Trigger', shape: 'box' },
      { label: 'Sphere Trigger', shape: 'sphere' },
      { label: 'Capsule Trigger', shape: 'capsule' },
    ];

    for (const t of triggerTypes) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        this._addTriggerComponent(t.shape);
      });
      menu.appendChild(item);
    }

    // ---- Light sub-header ----
    const lightHeader = document.createElement('div');
    lightHeader.className = 'context-menu-header';
    lightHeader.textContent = '💡 Light';
    menu.appendChild(lightHeader);

    const lightTypes: { label: string; lt: LightType }[] = [
      { label: 'Directional Light', lt: 'directional' },
      { label: 'Point Light',       lt: 'point' },
      { label: 'Spot Light',        lt: 'spot' },
      { label: 'Ambient Light',     lt: 'ambient' },
      { label: 'Hemisphere Light',  lt: 'hemisphere' },
    ];

    for (const t of lightTypes) {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = t.label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        this._addLightComponent(t.lt);
      });
      menu.appendChild(item);
    }

    // ---- Camera sub-header ----
    const cameraHeader = document.createElement('div');
    cameraHeader.className = 'context-menu-header';
    cameraHeader.textContent = '📷 Camera';
    menu.appendChild(cameraHeader);

    const addSpringArm = document.createElement('div');
    addSpringArm.className = 'context-menu-item';
    addSpringArm.textContent = 'Spring Arm (Camera Boom)';
    addSpringArm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      this._addSpringArmComponent();
    });
    menu.appendChild(addSpringArm);

    const addCamera = document.createElement('div');
    addCamera.className = 'context-menu-item';
    addCamera.textContent = 'Camera';
    addCamera.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.remove();
      this._addCameraComponent();
    });
    menu.appendChild(addCamera);

    document.body.appendChild(menu);

    const cleanup = () => {
      menu.remove();
      document.removeEventListener('click', cleanup);
    };
    setTimeout(() => document.addEventListener('click', cleanup), 0);
  }

  private _addComponent(meshType: MeshType): void {
    const name = meshType.charAt(0).toUpperCase() + meshType.slice(1) + '_' + this._asset.components.length;
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'mesh',
      meshType,
      name,
      offset: { x: 0, y: 1.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      physics: defaultPhysicsConfig(),
      collision: defaultMeshCollisionConfig(),
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  /** Add a Static Mesh Component (user picks an imported mesh from the properties panel) */
  private _addStaticMeshComponent(): void {
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'mesh',
      meshType: 'cube',           // placeholder — not rendered as primitive when customMeshAssetId is set
      name: 'StaticMesh_' + this._asset.components.length,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      customMeshAssetId: '',      // user picks from dropdown in properties panel
      materialOverrides: {},
      physics: defaultPhysicsConfig(),
      collision: defaultMeshCollisionConfig(),
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  private _addTriggerComponent(shape: CollisionShapeType): void {
    const label = shape.charAt(0).toUpperCase() + shape.slice(1);
    const name = label + 'Trigger_' + this._asset.components.length;
    const collision = defaultCollisionConfig();
    collision.shape = shape;
    collision.dimensions = defaultDimensionsForShape(shape);
    collision.collisionMode = 'trigger';
    collision.generateOverlapEvents = true;

    const comp: ActorComponentData = {
      id: compUid(),
      type: 'trigger',
      meshType: 'cube',           // placeholder — not rendered as mesh
      name,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      collision,
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  private _addLightComponent(lightType: LightType): void {
    const label = lightType.charAt(0).toUpperCase() + lightType.slice(1);
    const name = label + 'Light_' + this._asset.components.length;
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'light',
      meshType: 'cube',           // placeholder — not rendered as mesh
      name,
      offset: { x: 0, y: 3, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      light: defaultLightConfig(lightType),
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  private _addSkeletalMeshComponent(): void {
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'skeletalMesh',
      meshType: 'cube',           // placeholder — not rendered as primitive
      name: 'SkeletalMesh_' + this._asset.components.length,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      skeletalMesh: {
        meshAssetId: '',
        animationName: '',
        loopAnimation: true,
        animationSpeed: 1.0,
        strictSkeletonMatching: false,
      },
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  private _addSpringArmComponent(): void {
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'springArm',
      meshType: 'cube',
      name: 'SpringArm_' + this._asset.components.length,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      springArm: defaultSpringArmConfig(),
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    // Also update characterPawnConfig if this is a pawn
    if (this._asset.characterPawnConfig && comp.springArm) {
      this._asset.characterPawnConfig.springArm = structuredClone(comp.springArm);
    }

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  private _addCameraComponent(): void {
    const comp: ActorComponentData = {
      id: compUid(),
      type: 'camera',
      meshType: 'cube',
      name: 'Camera_' + this._asset.components.length,
      offset: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      camera: defaultCameraConfig('thirdPerson'),
    };
    this._asset.components.push(comp);
    this._asset.touch();
    this._selectedComponentId = comp.id;

    // Also update characterPawnConfig if this is a pawn
    if (this._asset.characterPawnConfig && comp.camera) {
      this._asset.characterPawnConfig.camera = structuredClone(comp.camera);
    }

    if (this._preview) this._preview.rebuild();
    this._refreshComponentsList();
    this._refreshComponentProps();
    this._onAssetChanged();
  }

  // ================================================================
  //  EVENT GRAPH TAB — Full node editor
  // ================================================================

  private _buildGraphTab(): void {
    const wrap = document.createElement('div');
    wrap.className = 'node-editor-container';
    this._tabContentArea.appendChild(wrap);
    this._graphTabEl = wrap;

    this._nodeEditorCleanup = mountNodeEditorForAsset(
      wrap,
      this._asset.blueprintData,
      this._asset.name,
      this._onCompile,
      this._asset.components,
      this._asset.rootMeshType,
    );
  }

  private _disposeGraphTab(): void {
    if (this._nodeEditorCleanup) {
      this._nodeEditorCleanup();
      this._nodeEditorCleanup = null;
    }
    this._graphTabEl = null;
  }

  // ================================================================
  //  Collision / Trigger Settings Section builder
  // ================================================================

  private _buildCollisionSection(container: HTMLElement, col: CollisionConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const section = document.createElement('div');
    section.className = 'physics-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '⚡ Collision Settings';
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'physics-section-body';
    section.appendChild(body);

    // -- Enabled toggle --
    body.appendChild(this._makeCheckboxRow('Enabled', col.enabled, (v) => {
      col.enabled = v;
      notifyChanged();
      if (this._preview) this._preview.rebuild();
    }));

    // -- Shape dropdown --
    body.appendChild(this._makeDropdownRow('Shape', col.shape, ['box', 'sphere', 'capsule'], (v) => {
      col.shape = v as CollisionShapeType;
      col.dimensions = defaultDimensionsForShape(col.shape);
      notifyChanged();
      if (this._preview) this._preview.rebuild();
      this._refreshComponentProps();
    }));

    // -- Shape dimensions (context-sensitive) --
    const dimHeader = document.createElement('div');
    dimHeader.className = 'physics-subsection-header';
    dimHeader.textContent = 'Dimensions';
    body.appendChild(dimHeader);

    if (col.shape === 'box') {
      const dim = col.dimensions as BoxShapeDimensions;
      body.appendChild(this._makeNumberRow('Width', dim.width, 0.1, 0.01, 1000, (v) => {
        dim.width = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
      body.appendChild(this._makeNumberRow('Height', dim.height, 0.1, 0.01, 1000, (v) => {
        dim.height = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
      body.appendChild(this._makeNumberRow('Depth', dim.depth, 0.1, 0.01, 1000, (v) => {
        dim.depth = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
    } else if (col.shape === 'sphere') {
      const dim = col.dimensions as SphereShapeDimensions;
      body.appendChild(this._makeNumberRow('Radius', dim.radius, 0.1, 0.01, 1000, (v) => {
        dim.radius = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
    } else if (col.shape === 'capsule') {
      const dim = col.dimensions as CapsuleShapeDimensions;
      body.appendChild(this._makeNumberRow('Radius', dim.radius, 0.1, 0.01, 1000, (v) => {
        dim.radius = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
      body.appendChild(this._makeNumberRow('Height', dim.height, 0.1, 0.01, 1000, (v) => {
        dim.height = v; notifyChanged(); if (this._preview) this._preview.rebuild();
      }));
    }

    // -- Collision Offset --
    const offsetHeader = document.createElement('div');
    offsetHeader.className = 'physics-subsection-header';
    offsetHeader.textContent = 'Offset';
    body.appendChild(offsetHeader);

    if (!col.offset) col.offset = { x: 0, y: 0, z: 0 };
    body.appendChild(this._makeVec3Row('Location Offset', col.offset, () => {
      notifyChanged(); if (this._preview) this._preview.rebuild();
    }));

    if (!col.rotationOffset) col.rotationOffset = { x: 0, y: 0, z: 0 };
    body.appendChild(this._makeVec3Row('Rotation Offset', col.rotationOffset, () => {
      notifyChanged(); if (this._preview) this._preview.rebuild();
    }));

    // -- Collision Mode --
    const modeHeader = document.createElement('div');
    modeHeader.className = 'physics-subsection-header';
    modeHeader.textContent = 'Mode';
    body.appendChild(modeHeader);

    body.appendChild(this._makeDropdownRow('Collision Mode', col.collisionMode, ['none', 'trigger', 'physics'], (v) => {
      col.collisionMode = v as CollisionMode;
      notifyChanged();
      if (this._preview) this._preview.rebuild();
      this._refreshComponentProps();
    }));

    // -- Events --
    const evtHeader = document.createElement('div');
    evtHeader.className = 'physics-subsection-header';
    evtHeader.textContent = 'Events';
    body.appendChild(evtHeader);

    body.appendChild(this._makeCheckboxRow('Generate Overlap Events', col.generateOverlapEvents, (v) => {
      col.generateOverlapEvents = v;
      notifyChanged();
    }));
    body.appendChild(this._makeCheckboxRow('Generate Hit Events', col.generateHitEvents, (v) => {
      col.generateHitEvents = v;
      notifyChanged();
    }));

    // -- Channel Responses --
    const chHeader = document.createElement('div');
    chHeader.className = 'physics-subsection-header';
    chHeader.textContent = 'Channel Responses';
    body.appendChild(chHeader);

    const channelNames: CollisionChannelName[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'Player', 'Projectile', 'Trigger'];
    const responses: CollisionResponse[] = ['block', 'overlap', 'ignore'];
    for (const ch of channelNames) {
      const current = col.channelResponses[ch] ?? 'overlap';
      body.appendChild(this._makeDropdownRow(ch, current, responses, (v) => {
        col.channelResponses[ch] = v as CollisionResponse;
        notifyChanged();
      }));
    }

    // -- Editor Visualization --
    body.appendChild(this._makeCheckboxRow('Show in Editor', col.showInEditor, (v) => {
      col.showInEditor = v;
      notifyChanged();
      if (this._preview) this._preview.rebuild();
    }));

    container.appendChild(section);
  }

  // ================================================================
  //  Physics Properties Section builder
  // ================================================================

  private _buildPhysicsSection(container: HTMLElement, phys: PhysicsConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const section = document.createElement('div');
    section.className = 'physics-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '⚛ Physics Settings';
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'physics-section-body';
    section.appendChild(body);

    // -- Simulate Physics (master toggle) --
    body.appendChild(this._makeCheckboxRow('Simulate Physics', phys.simulatePhysics, (v) => {
      phys.simulatePhysics = v;
      phys.enabled = v;
      notifyChanged();
      // Refresh to show/hide dependent fields
      this._refreshComponentProps();
    }));

    if (phys.simulatePhysics) {
      // -- Mass --
      body.appendChild(this._makeNumberRow('Mass (kg)', phys.mass, 0.1, 0, 100000, (v) => {
        phys.mass = v;
        notifyChanged();
      }));

      // -- Gravity sub-section --
      const gravHeader = document.createElement('div');
      gravHeader.className = 'physics-subsection-header';
      gravHeader.textContent = 'Gravity';
      body.appendChild(gravHeader);

      body.appendChild(this._makeCheckboxRow('Enable Gravity', phys.gravityEnabled, (v) => {
        phys.gravityEnabled = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Gravity Scale', phys.gravityScale, 0.1, -10, 10, (v) => {
        phys.gravityScale = v;
        notifyChanged();
      }));

      // -- Damping sub-section --
      const dampHeader = document.createElement('div');
      dampHeader.className = 'physics-subsection-header';
      dampHeader.textContent = 'Damping';
      body.appendChild(dampHeader);

      body.appendChild(this._makeNumberRow('Linear Damping', phys.linearDamping, 0.01, 0, 100, (v) => {
        phys.linearDamping = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Angular Damping', phys.angularDamping, 0.01, 0, 100, (v) => {
        phys.angularDamping = v;
        notifyChanged();
      }));

      // -- Material sub-section --
      const matHeader = document.createElement('div');
      matHeader.className = 'physics-subsection-header';
      matHeader.textContent = 'Material';
      body.appendChild(matHeader);

      body.appendChild(this._makeNumberRow('Friction', phys.friction, 0.05, 0, 2, (v) => {
        phys.friction = v;
        notifyChanged();
      }));
      body.appendChild(this._makeNumberRow('Restitution', phys.restitution, 0.05, 0, 2, (v) => {
        phys.restitution = v;
        notifyChanged();
      }));

      // -- Constraints sub-section --
      const conHeader = document.createElement('div');
      conHeader.className = 'physics-subsection-header';
      conHeader.textContent = 'Constraints';
      body.appendChild(conHeader);

      body.appendChild(this._makeAxisLockRow('Lock Position',
        phys.lockPositionX, phys.lockPositionY, phys.lockPositionZ,
        (x, y, z) => { phys.lockPositionX = x; phys.lockPositionY = y; phys.lockPositionZ = z; notifyChanged(); },
      ));
      body.appendChild(this._makeAxisLockRow('Lock Rotation',
        phys.lockRotationX, phys.lockRotationY, phys.lockRotationZ,
        (x, y, z) => { phys.lockRotationX = x; phys.lockRotationY = y; phys.lockRotationZ = z; notifyChanged(); },
      ));

      // -- Collision sub-section --
      const colHeader = document.createElement('div');
      colHeader.className = 'physics-subsection-header';
      colHeader.textContent = 'Collision';
      body.appendChild(colHeader);

      body.appendChild(this._makeCheckboxRow('Collision Enabled', phys.collisionEnabled, (v) => {
        phys.collisionEnabled = v;
        notifyChanged();
      }));

      const channels: CollisionChannel[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'PhysicsBody', 'Trigger', 'Custom1', 'Custom2', 'Custom3', 'Custom4'];
      body.appendChild(this._makeDropdownRow('Collision Channel', phys.collisionChannel, channels, (v) => {
        phys.collisionChannel = v as CollisionChannel;
        notifyChanged();
      }));
    }

    container.appendChild(section);
  }

  // ================================================================
  //  Character Pawn settings (movement, camera, capsule, input)
  // ================================================================

  private _buildCharacterPawnSection(container: HTMLElement): void {
    const cfg = this._asset.characterPawnConfig!;
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    // ---- Movement settings ----
    const moveHeader = document.createElement('div');
    moveHeader.className = 'physics-section-header';
    moveHeader.textContent = '🏃 Movement';
    container.appendChild(moveHeader);

    container.appendChild(this._makeNumberRow('Walk Speed', cfg.movement.walkSpeed, 0.5, 0, 50, (v) => {
      cfg.movement.walkSpeed = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Run Speed', cfg.movement.runSpeed, 0.5, 0, 100, (v) => {
      cfg.movement.runSpeed = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Crouch Speed', cfg.movement.crouchSpeed, 0.5, 0, 20, (v) => {
      cfg.movement.crouchSpeed = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Jump Velocity', cfg.movement.jumpVelocity, 0.5, 0, 50, (v) => {
      cfg.movement.jumpVelocity = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Air Control', cfg.movement.airControl, 0.05, 0, 1, (v) => {
      cfg.movement.airControl = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Gravity', cfg.movement.gravity, 1, -100, 0, (v) => {
      cfg.movement.gravity = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Ground Friction', cfg.movement.groundFriction, 0.5, 0, 30, (v) => {
      cfg.movement.groundFriction = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Max Slope Angle', cfg.movement.maxSlopeAngle, 1, 0, 90, (v) => {
      cfg.movement.maxSlopeAngle = v; notifyChanged();
    }));
    container.appendChild(this._makeNumberRow('Max Step Height', cfg.movement.maxStepHeight, 0.05, 0, 2, (v) => {
      cfg.movement.maxStepHeight = v; notifyChanged();
    }));

    // Ability flags
    const abilHeader = document.createElement('div');
    abilHeader.className = 'physics-subsection-header';
    abilHeader.textContent = 'Abilities';
    container.appendChild(abilHeader);

    container.appendChild(this._makeCheckboxRow('Can Walk', cfg.movement.canWalk, (v) => {
      cfg.movement.canWalk = v; notifyChanged();
    }));
    container.appendChild(this._makeCheckboxRow('Can Run', cfg.movement.canRun, (v) => {
      cfg.movement.canRun = v; notifyChanged();
    }));
    container.appendChild(this._makeCheckboxRow('Can Jump', cfg.movement.canJump, (v) => {
      cfg.movement.canJump = v; notifyChanged();
    }));
    container.appendChild(this._makeCheckboxRow('Can Crouch', cfg.movement.canCrouch, (v) => {
      cfg.movement.canCrouch = v; notifyChanged();
    }));

    // Default Movement Mode
    container.appendChild(this._makeDropdownRow('Default Movement Mode', cfg.defaultMovementMode ?? 'walking',
      ['walking', 'running', 'crouching', 'flying', 'swimming'], (v) => {
      cfg.defaultMovementMode = v as any; notifyChanged();
    }));

    // ---- Input Bindings ----
    const inputHeader = document.createElement('div');
    inputHeader.className = 'physics-section-header';
    inputHeader.textContent = '🎮 Input Bindings';
    container.appendChild(inputHeader);

    container.appendChild(this._makeTextRow('Forward', cfg.inputBindings.moveForward, (v) => {
      cfg.inputBindings.moveForward = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Backward', cfg.inputBindings.moveBackward, (v) => {
      cfg.inputBindings.moveBackward = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Left', cfg.inputBindings.moveLeft, (v) => {
      cfg.inputBindings.moveLeft = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Right', cfg.inputBindings.moveRight, (v) => {
      cfg.inputBindings.moveRight = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Jump', cfg.inputBindings.jump, (v) => {
      cfg.inputBindings.jump = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Crouch', cfg.inputBindings.crouch, (v) => {
      cfg.inputBindings.crouch = v; notifyChanged();
    }));
    container.appendChild(this._makeTextRow('Run', cfg.inputBindings.run, (v) => {
      cfg.inputBindings.run = v; notifyChanged();
    }));
    container.appendChild(this._makeCheckboxRow('Mouse Look', cfg.inputBindings.mouseLook, (v) => {
      cfg.inputBindings.mouseLook = v; notifyChanged();
    }));
  }

  // ================================================================
  //  Spring Arm Properties Section builder
  // ================================================================

  private _buildSpringArmSection(container: HTMLElement, sa: SpringArmConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '🎯 Spring Arm (Camera Boom)';
    container.appendChild(header);

    container.appendChild(this._makeNumberRow('Arm Length', sa.armLength, 0.5, 0, 50, (v) => {
      sa.armLength = v; notifyChanged();
      // Sync to characterPawnConfig if present
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.armLength = v;
    }));

    container.appendChild(this._makeVec3Row('Target Offset', sa.targetOffset, () => {
      notifyChanged();
      if (this._asset.characterPawnConfig) {
        this._asset.characterPawnConfig.springArm.targetOffset = { ...sa.targetOffset };
      }
    }));

    container.appendChild(this._makeVec3Row('Socket Offset', sa.socketOffset, () => {
      notifyChanged();
      if (this._asset.characterPawnConfig) {
        this._asset.characterPawnConfig.springArm.socketOffset = { ...sa.socketOffset };
      }
    }));

    // Collision
    const colHeader = document.createElement('div');
    colHeader.className = 'physics-subsection-header';
    colHeader.textContent = 'Collision';
    container.appendChild(colHeader);

    container.appendChild(this._makeCheckboxRow('Do Collision Test', sa.doCollisionTest, (v) => {
      sa.doCollisionTest = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.doCollisionTest = v;
    }));
    container.appendChild(this._makeNumberRow('Probe Size', sa.probeSize, 0.01, 0.01, 1, (v) => {
      sa.probeSize = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.probeSize = v;
    }));

    // Camera Collision Profile — per-channel responses for the spring arm ray
    if (!sa.collisionProfile) {
      sa.collisionProfile = defaultCameraCollisionProfile();
    }
    const camProfile = sa.collisionProfile;
    const camChHeader = document.createElement('div');
    camChHeader.className = 'physics-subsection-header';
    camChHeader.textContent = 'Camera Collision Channels';
    container.appendChild(camChHeader);

    const camChannelNames: CollisionChannelName[] = ['WorldStatic', 'WorldDynamic', 'Pawn', 'Player', 'Projectile', 'Trigger', 'Camera'];
    const camResponses: CollisionResponse[] = ['block', 'overlap', 'ignore'];
    for (const ch of camChannelNames) {
      const current = camProfile.responses[ch] ?? 'ignore';
      container.appendChild(this._makeDropdownRow(ch, current, camResponses, (v) => {
        camProfile.responses[ch] = v as CollisionResponse;
        camProfile.name = 'Custom';
        notifyChanged();
        if (this._asset.characterPawnConfig) {
          this._asset.characterPawnConfig.springArm.collisionProfile = camProfile;
        }
      }));
    }

    // Camera Lag
    const lagHeader = document.createElement('div');
    lagHeader.className = 'physics-subsection-header';
    lagHeader.textContent = 'Camera Lag';
    container.appendChild(lagHeader);

    container.appendChild(this._makeCheckboxRow('Enable Camera Lag', sa.enableCameraLag, (v) => {
      sa.enableCameraLag = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.enableCameraLag = v;
      this._refreshComponentProps();
    }));
    if (sa.enableCameraLag) {
      container.appendChild(this._makeNumberRow('Lag Speed', sa.cameraLagSpeed, 0.5, 0.1, 100, (v) => {
        sa.cameraLagSpeed = v; notifyChanged();
        if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.cameraLagSpeed = v;
      }));
    }

    container.appendChild(this._makeCheckboxRow('Enable Rotation Lag', sa.enableCameraRotationLag, (v) => {
      sa.enableCameraRotationLag = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.enableCameraRotationLag = v;
      this._refreshComponentProps();
    }));
    if (sa.enableCameraRotationLag) {
      container.appendChild(this._makeNumberRow('Rotation Lag Speed', sa.cameraRotationLagSpeed, 0.5, 0.1, 100, (v) => {
        sa.cameraRotationLagSpeed = v; notifyChanged();
        if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.cameraRotationLagSpeed = v;
      }));
    }

    // Inherit Control Rotation
    const inheritHeader = document.createElement('div');
    inheritHeader.className = 'physics-subsection-header';
    inheritHeader.textContent = 'Inherit Rotation';
    container.appendChild(inheritHeader);

    container.appendChild(this._makeCheckboxRow('Inherit Pitch', sa.inheritPitch, (v) => {
      sa.inheritPitch = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.inheritPitch = v;
    }));
    container.appendChild(this._makeCheckboxRow('Inherit Yaw', sa.inheritYaw, (v) => {
      sa.inheritYaw = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.inheritYaw = v;
    }));
    container.appendChild(this._makeCheckboxRow('Inherit Roll', sa.inheritRoll, (v) => {
      sa.inheritRoll = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.springArm.inheritRoll = v;
    }));
  }

  // ================================================================
  //  Camera Component Properties Section builder
  // ================================================================

  private _buildCameraComponentSection(container: HTMLElement, cam: CameraComponentConfig): void {
    const notifyChanged = () => { this._asset.touch(); this._onAssetChanged(); };

    const header = document.createElement('div');
    header.className = 'physics-section-header';
    header.textContent = '📷 Camera';
    container.appendChild(header);

    container.appendChild(this._makeDropdownRow('Camera Mode', cam.cameraMode, ['firstPerson', 'thirdPerson'], (v) => {
      cam.cameraMode = v as CameraMode;
      notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.cameraMode = v as CameraMode;
      this._refreshComponentProps();
    }));

    container.appendChild(this._makeNumberRow('Field of View', cam.fieldOfView, 1, 30, 120, (v) => {
      cam.fieldOfView = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.fieldOfView = v;
    }));

    container.appendChild(this._makeNumberRow('Near Clip', cam.nearClip, 0.01, 0.01, 10, (v) => {
      cam.nearClip = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.nearClip = v;
    }));

    container.appendChild(this._makeNumberRow('Far Clip', cam.farClip, 10, 10, 100000, (v) => {
      cam.farClip = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.farClip = v;
    }));

    container.appendChild(this._makeNumberRow('Mouse Sensitivity', cam.mouseSensitivity, 0.01, 0.01, 1, (v) => {
      cam.mouseSensitivity = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.mouseSensitivity = v;
    }));

    container.appendChild(this._makeVec3Row('Offset', cam.offset, () => {
      notifyChanged();
      if (this._asset.characterPawnConfig) {
        this._asset.characterPawnConfig.camera.offset = { ...cam.offset };
      }
    }));

    // Pitch clamp
    const clampHeader = document.createElement('div');
    clampHeader.className = 'physics-subsection-header';
    clampHeader.textContent = 'Pitch Clamp';
    container.appendChild(clampHeader);

    container.appendChild(this._makeNumberRow('Pitch Min', cam.pitchMin, 1, -90, 0, (v) => {
      cam.pitchMin = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.pitchMin = v;
    }));
    container.appendChild(this._makeNumberRow('Pitch Max', cam.pitchMax, 1, 0, 90, (v) => {
      cam.pitchMax = v; notifyChanged();
      if (this._asset.characterPawnConfig) this._asset.characterPawnConfig.camera.pitchMax = v;
    }));
  }

  // ================================================================
  //  Helper UI builders
  // ================================================================

  private _makeTextRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _makeDropdownRow(label: string, value: string, options: string[], onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const select = document.createElement('select');
    select.className = 'prop-input';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
      if (o === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(lbl);
    row.appendChild(select);
    return row;
  }

  private _makeVec3Row(label: string, vec: { x: number; y: number; z: number }, onChange: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisLabel = document.createElement('span');
      axisLabel.className = `prop-xyz-label ${axis}`;
      axisLabel.textContent = axis.toUpperCase();

      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.className = 'prop-input prop-input-sm';
      input.value = (vec[axis] ?? 0).toFixed(2);
      input.addEventListener('change', () => {
        (vec as any)[axis] = parseFloat(input.value) || 0;
        onChange();
      });
      row.appendChild(axisLabel);
      row.appendChild(input);
    }

    return row;
  }

  private _makeCheckboxRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'prop-checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    row.appendChild(lbl);
    row.appendChild(cb);
    return row;
  }

  private _makeColorRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'prop-color';
    input.value = value;
    input.style.width = '50px';
    input.style.height = '22px';
    input.style.border = '1px solid #555';
    input.style.backgroundColor = 'transparent';
    input.style.cursor = 'pointer';
    input.addEventListener('input', () => onChange(input.value));
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _makeNumberRow(label: string, value: number, step: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.step = String(step);
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _makeAxisLockRow(
    label: string,
    x: boolean, y: boolean, z: boolean,
    onChange: (x: boolean, y: boolean, z: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    let cx = x, cy = y, cz = z;
    for (const [axisLabel, getter, setter] of [
      ['X', () => cx, (v: boolean) => { cx = v; }],
      ['Y', () => cy, (v: boolean) => { cy = v; }],
      ['Z', () => cz, (v: boolean) => { cz = v; }],
    ] as [string, () => boolean, (v: boolean) => void][]) {
      const axLbl = document.createElement('span');
      axLbl.className = `prop-xyz-label ${axisLabel.toLowerCase()}`;
      axLbl.textContent = axisLabel;
      row.appendChild(axLbl);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'prop-checkbox';
      cb.checked = getter();
      cb.addEventListener('change', () => {
        setter(cb.checked);
        onChange(cx, cy, cz);
      });
      row.appendChild(cb);
    }
    return row;
  }

  // ---- Cleanup ----

  dispose(): void {
    this._disposeViewportTab();
    this._disposeGraphTab();
  }
}
