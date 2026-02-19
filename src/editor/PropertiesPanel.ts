import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import type { SceneCompositionManager } from './scene/SceneCompositionManager';
import type { PropertyDescriptor as ScenePropertyDescriptor } from './scene/SceneActors';
import { MeshAssetManager } from './MeshAsset';
import type { TextureAssetJSON } from './MeshAsset';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { defaultPhysicsConfig, ALL_COLLISION_CHANNELS } from './ActorAsset';
import type { PhysicsConfig, PhysicsBodyType, ColliderShapeType, CombineMode, CollisionChannel } from './ActorAsset';

export class PropertiesPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _bodyEl!: HTMLElement;
  private _current: GameObject | null = null;
  private _composition: SceneCompositionManager | null = null;
  private _currentCompositionActorId: string | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._build();
    this._engine.scene.onSelectionChanged((obj) => {
      if (obj) {
        // A game object was selected — clear composition actor display
        this._currentCompositionActorId = null;
        this._showProperties(obj);
      } else if (!this._currentCompositionActorId) {
        // Selection cleared with no composition actor active — show empty
        this._showProperties(null);
      }
      // If a composition actor is active, don't override with empty state
    });
  }

  /** Set the composition manager reference (called from EditorLayout) */
  setCompositionManager(comp: SceneCompositionManager | null): void {
    this._composition = comp;
  }

  /** Show properties for a composition actor (called from EditorLayout) */
  showCompositionActor(actorId: string | null): void {
    this._currentCompositionActorId = actorId;
    this._current = null;

    if (actorId) {
      this._showCompositionActorProperties(actorId);
    } else {
      this._showProperties(this._engine.scene.selectedObject);
    }
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<span>Properties</span>';
    this.container.appendChild(header);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'panel-body';
    this.container.appendChild(this._bodyEl);

    this._showProperties(null);
  }

  private _showCompositionActorProperties(actorId: string): void {
    this._bodyEl.innerHTML = '';
    if (!this._composition) return;

    const entry = this._composition.getActor(actorId);
    if (!entry) {
      this._showProperties(null);
      return;
    }

    // Actor header
    const headerGroup = document.createElement('div');
    headerGroup.className = 'prop-group';
    const headerTitle = document.createElement('div');
    headerTitle.className = 'prop-group-title composition-actor-title';
    const icon = document.createElement('span');
    icon.style.marginRight = '6px';
    icon.textContent = this._getActorIcon(entry.type);
    headerTitle.appendChild(icon);
    headerTitle.appendChild(document.createTextNode(entry.name));
    headerGroup.appendChild(headerTitle);

    // Type badge
    const typeBadge = document.createElement('div');
    typeBadge.className = 'prop-row';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'prop-label';
    typeLabel.textContent = 'Type';
    const typeValue = document.createElement('span');
    typeValue.className = 'prop-value-label';
    typeValue.textContent = entry.type;
    typeValue.style.color = 'var(--accent)';
    typeValue.style.fontSize = '11px';
    typeBadge.appendChild(typeLabel);
    typeBadge.appendChild(typeValue);
    headerGroup.appendChild(typeBadge);

    this._bodyEl.appendChild(headerGroup);

    // Transform section (for actors with gizmo capabilities)
    const caps = this._composition.getActorGizmoCapabilities(actorId);
    if (caps.length > 0) {
      const transformRows: HTMLElement[] = [];
      const group = entry.actor.group;

      if (caps.includes('translate')) {
        transformRows.push(this._createVec3Row('Position', group.position));
      }
      if (caps.includes('rotate')) {
        transformRows.push(this._createVec3Row('Rotation', group.rotation as any, true));
      }
      if (caps.includes('scale')) {
        transformRows.push(this._createVec3Row('Scale', group.scale));
      }

      if (transformRows.length > 0) {
        this._bodyEl.appendChild(this._createGroup('Transform', transformRows));
      }
    }

    // Property descriptors grouped
    const descriptors = this._composition.getActorPropertyDescriptors(actorId);
    const groups = new Map<string, ScenePropertyDescriptor[]>();

    for (const desc of descriptors) {
      if (!groups.has(desc.group)) groups.set(desc.group, []);
      groups.get(desc.group)!.push(desc);
    }

    groups.forEach((props, groupName) => {
      const rows: HTMLElement[] = [];
      for (const prop of props) {
        rows.push(this._createPropertyRow(actorId, prop));
      }
      this._bodyEl.appendChild(this._createGroup(groupName, rows));
    });
  }

  private _createPropertyRow(actorId: string, prop: ScenePropertyDescriptor): HTMLElement {
    switch (prop.type) {
      case 'number':
        return this._createNumberRow(prop.label, prop.value, prop.min, prop.max, prop.step, (v) => {
          this._composition?.updateActorProperty(actorId, prop.key, v);
          // Re-read the value to keep UI in sync
          prop.value = v;
        });
      case 'color':
        return this._createColorRow(prop.label, prop.value, (v) => {
          this._composition?.updateActorProperty(actorId, prop.key, v);
          prop.value = v;
        });
      case 'boolean':
        return this._createCheckboxRow(prop.label, prop.value, (v) => {
          this._composition?.updateActorProperty(actorId, prop.key, v);
          prop.value = v;
        });
      case 'select':
        return this._createSelectRow(prop.label, prop.value, prop.options || [], (v) => {
          this._composition?.updateActorProperty(actorId, prop.key, v);
          prop.value = v;
        });
      case 'text':
        return this._createTextRow(prop.label, String(prop.value || ''), (v) => {
          this._composition?.updateActorProperty(actorId, prop.key, v);
          prop.value = v;
        }, prop.placeholder);
      case 'file':
        return this._createFileRow(actorId, prop);
      case 'texture':
        return this._createTextureSlotRow(actorId, prop);
      default:
        return this._createTextRow(prop.label, String(prop.value), () => {});
    }
  }

  private _createFileRow(actorId: string, prop: ScenePropertyDescriptor): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = prop.label;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '4px';
    wrapper.style.flex = '1';
    wrapper.style.minWidth = '0';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.style.flex = '1';
    input.style.minWidth = '0';
    input.value = prop.value || '';
    if (prop.placeholder) input.placeholder = prop.placeholder;
    input.addEventListener('change', () => {
      this._composition?.updateActorProperty(actorId, prop.key, input.value);
      prop.value = input.value;
    });

    const browseBtn = document.createElement('button');
    browseBtn.textContent = '📁';
    browseBtn.title = 'Browse...';
    browseBtn.style.background = 'var(--input-bg, #1e1e2e)';
    browseBtn.style.border = '1px solid var(--border)';
    browseBtn.style.borderRadius = '3px';
    browseBtn.style.color = 'var(--text)';
    browseBtn.style.cursor = 'pointer';
    browseBtn.style.padding = '3px 6px';
    browseBtn.style.fontSize = '12px';
    browseBtn.style.flexShrink = '0';
    browseBtn.addEventListener('click', async () => {
      try {
        const filters = prop.fileFilters || [];
        const selected = await tauriOpen({
          multiple: false,
          filters,
          title: `Select ${prop.label}`,
        });
        if (selected) {
          const filePath = typeof selected === 'string' ? selected : String(selected);
          input.value = filePath;
          this._composition?.updateActorProperty(actorId, prop.key, filePath);
          prop.value = filePath;
        }
      } catch (err) {
        console.warn('[PropertiesPanel] File dialog error:', err);
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(browseBtn);
    row.appendChild(lbl);
    row.appendChild(wrapper);
    return row;
  }

  // ── Texture slot (like MaterialEditorPanel) ──

  private _createTextureSlotRow(actorId: string, prop: ScenePropertyDescriptor): HTMLElement {
    const container = document.createElement('div');
    container.style.marginBottom = '4px';

    // Current value is { textureId, dataUrl, textureName }
    const val = prop.value || {};
    const currentDataUrl: string = val.dataUrl || '';
    const currentName: string = val.textureName || '';

    // Drop zone
    const dropZone = document.createElement('div');
    Object.assign(dropZone.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px',
      border: '1px dashed var(--border)',
      borderRadius: '4px',
      background: 'var(--bg-input, #1e1e2e)',
      transition: 'border-color 0.15s, background 0.15s',
      minHeight: '56px',
      cursor: 'pointer',
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
    });

    if (currentDataUrl) {
      thumb.style.backgroundImage = `url(${currentDataUrl})`;
    } else {
      thumb.style.backgroundImage = checkerBg;
      thumb.style.backgroundSize = '8px 8px';
    }

    // Info area
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;';

    // Label
    const labelEl = document.createElement('div');
    Object.assign(labelEl.style, {
      fontSize: '11px',
      color: 'var(--text-dim)',
      marginBottom: '2px',
    });
    labelEl.textContent = prop.label;
    info.appendChild(labelEl);

    // Texture name / placeholder
    const nameEl = document.createElement('div');
    Object.assign(nameEl.style, {
      fontSize: '11px',
      color: currentDataUrl ? 'var(--text)' : 'var(--text-dim)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    nameEl.textContent = currentName || prop.placeholder || 'Drop image here or browse...';
    info.appendChild(nameEl);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;';

    const mkBtn = (text: string, color?: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = text;
      Object.assign(btn.style, {
        background: 'var(--bg-hover, #2a2d3e)',
        border: '1px solid var(--border)',
        color: color || 'var(--text)',
        padding: '2px 8px',
        borderRadius: '3px',
        cursor: 'pointer',
        fontSize: '10px',
        whiteSpace: 'nowrap',
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--accent-dim, #3a3d5e)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--bg-hover, #2a2d3e)'; });
      return btn;
    };

    // Browse button
    const browseBtn = mkBtn('\uD83D\uDCC2 Browse');
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._pickSkyTexture((dataUrl, fileName) => {
        this._applySkyTexture(actorId, prop.key, dataUrl, fileName);
      });
    });
    btnRow.appendChild(browseBtn);

    // Select from existing textures (if any exist in the asset manager)
    const mgr = MeshAssetManager.getInstance();
    if (mgr && mgr.allTextures.length > 0) {
      const selBtn = mkBtn('\uD83D\uDCCB Select');
      selBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showSkyTexturePicker(selBtn, (tex) => {
          this._applySkyTexture(actorId, prop.key, tex.dataUrl, tex.assetName);
        });
      });
      btnRow.appendChild(selBtn);
    }

    // Clear button
    if (currentDataUrl) {
      const clearBtn = mkBtn('\u2715 Clear', '#f55');
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applySkyTexture(actorId, prop.key, '', '');
      });
      btnRow.appendChild(clearBtn);
    }

    info.appendChild(btnRow);
    dropZone.appendChild(thumb);
    dropZone.appendChild(info);
    container.appendChild(dropZone);

    // ── Drag-and-drop ──
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.background = 'var(--bg-hover, #2a2d3e)';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-input, #1e1e2e)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--bg-input, #1e1e2e)';

      // Check for texture asset from content browser drag
      const texAssetId = e.dataTransfer?.getData('text/texture-asset-id');
      if (texAssetId && mgr) {
        const tex = mgr.getTexture(texAssetId);
        if (tex) {
          this._applySkyTexture(actorId, prop.key, tex.dataUrl, tex.assetName);
          return;
        }
      }

      // Check for dropped image files
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          this._readFileAsDataUrl(file).then((dataUrl) => {
            this._applySkyTexture(actorId, prop.key, dataUrl, file.name.replace(/\.[^.]+$/, ''));
          });
          return;
        }
      }
    });

    // Click the drop zone to open file picker
    dropZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this._pickSkyTexture((dataUrl, fileName) => {
        this._applySkyTexture(actorId, prop.key, dataUrl, fileName);
      });
    });

    return container;
  }

  /** Apply a sky texture by updating all three related actor properties */
  private _applySkyTexture(actorId: string, _key: string, dataUrl: string, textureName: string): void {
    if (!this._composition) return;
    const textureId = dataUrl ? `sky_${Date.now()}` : '';

    // Auto-switch sky type to HDRI when a texture is set, or back to atmosphere when cleared
    if (dataUrl) {
      this._composition.updateActorProperty(actorId, 'skyType', 'hdri');
    } else {
      this._composition.updateActorProperty(actorId, 'skyType', 'atmosphere');
    }

    // Set ID and name first (these don't trigger _loadHDRI)
    this._composition.updateActorProperty(actorId, 'hdriTextureId', textureId);
    this._composition.updateActorProperty(actorId, 'hdriTextureName', textureName);
    // Set dataUrl last — this is the one that triggers the actual texture load
    this._composition.updateActorProperty(actorId, 'hdriDataUrl', dataUrl);

    // Also register in asset manager so it appears in "Select from existing" later
    if (dataUrl && textureName) {
      const mgr = MeshAssetManager.getInstance();
      if (mgr) {
        // Only add if not already present
        const existing = mgr.allTextures.find(t => t.dataUrl === dataUrl);
        if (!existing) {
          const img = new Image();
          img.onload = () => {
            mgr.allTextures.push({
              assetId: textureId,
              assetName: textureName,
              meshAssetId: '',
              dataUrl,
              textureData: { width: img.width, height: img.height, format: 'image/jpeg' },
            });
          };
          img.src = dataUrl;
        }
      }
    }

    // Re-render the properties panel for this actor
    this._showCompositionActorProperties(actorId);
  }

  /** Open an HTML file input for images (PNG, JPEG, WebP, etc.) */
  private _pickSkyTexture(onPicked: (dataUrl: string, fileName: string) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/bmp';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) {
        this._readFileAsDataUrl(file).then((dataUrl) => {
          onPicked(dataUrl, file.name.replace(/\.[^.]+$/, ''));
        });
      }
      input.remove();
    });
    input.click();
  }

  /** Show a popup picker for existing textures from MeshAssetManager */
  private _showSkyTexturePicker(anchor: HTMLElement, onPicked: (tex: TextureAssetJSON) => void): void {
    const mgr = MeshAssetManager.getInstance();
    if (!mgr) return;

    // Remove any existing picker
    document.querySelectorAll('.sky-texture-picker-popup').forEach(el => el.remove());

    const popup = document.createElement('div');
    popup.className = 'sky-texture-picker-popup';
    Object.assign(popup.style, {
      position: 'fixed',
      background: 'var(--bg-panel, #1e1e2e)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '6px',
      maxHeight: '240px',
      overflowY: 'auto',
      zIndex: '10000',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '4px',
      minWidth: '200px',
    });

    // Position near anchor
    const rect = anchor.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;

    for (const tex of mgr.allTextures) {
      if (!tex.dataUrl) continue;
      const item = document.createElement('div');
      Object.assign(item.style, {
        width: '60px',
        height: '60px',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        backgroundImage: `url(${tex.dataUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      });
      item.title = `${tex.assetName} (${tex.textureData.width}\u00D7${tex.textureData.height})`;
      item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--accent)'; });
      item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; });
      item.addEventListener('click', () => {
        onPicked(tex);
        popup.remove();
      });
      popup.appendChild(item);
    }

    if (mgr.allTextures.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--text-dim);font-size:11px;padding:12px;';
      empty.textContent = 'No textures imported yet';
      popup.appendChild(empty);
    }

    document.body.appendChild(popup);

    // Close on outside click
    const close = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && e.target !== anchor) {
        popup.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  private _readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private _getActorIcon(type: string): string {
    const icons: Record<string, string> = {
      DirectionalLight: '💡', SkyAtmosphere: '🌌', SkyLight: '🌤️',
      ExponentialHeightFog: '🌫️', PostProcessVolume: '📷',
      WorldGrid: '🔲', DevGroundPlane: '🟫', PlayerStart: '🚀',
    };
    return icons[type] || '📦';
  }

  private _showProperties(go: GameObject | null): void {
    this._current = go;
    this._bodyEl.innerHTML = '';

    if (!go) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Select an object';
      this._bodyEl.appendChild(empty);
      return;
    }

    // Name
    this._bodyEl.appendChild(this._createGroup('Object', [
      this._createTextRow('Name', go.name, (v) => { go.name = v; this._engine.scene['_emitChanged'](); }),
    ]));

    // Transform — Position
    this._bodyEl.appendChild(this._createGroup('Transform', [
      this._createVec3Row('Pos', go.mesh.position),
      this._createVec3Row('Rot', go.mesh.rotation as any, true),
      this._createVec3Row('Scale', go.mesh.scale),
    ]));

    // ---- Full Physics Properties Panel ----
    const cfg: PhysicsConfig = go.physicsConfig ?? defaultPhysicsConfig();
    if (!go.physicsConfig) go.physicsConfig = cfg;

    const physUpdate = (prop: string, value: any) => {
      (cfg as any)[prop] = value;
      if (this._engine.physics.isPlaying && go.rigidBody) {
        this._engine.physics.queueChange({ type: 'updateProperty', go, prop, value });
      }
      this._engine.scene['_emitChanged']();
    };

    // Physics Body
    this._bodyEl.appendChild(this._createGroup('Physics Body', [
      this._createCheckboxRow('Simulate Physics', cfg.simulatePhysics, (v) => {
        physUpdate('simulatePhysics', v);
        if (v && cfg.enabled) this._engine.physics.addPhysicsBody(go);
        else this._engine.physics.removePhysicsBody(go);
      }),
      this._createCheckboxRow('Enabled', cfg.enabled, (v) => {
        physUpdate('enabled', v);
        if (v && cfg.simulatePhysics) this._engine.physics.addPhysicsBody(go);
        else this._engine.physics.removePhysicsBody(go);
      }),
      this._createSelectRow('Body Type', cfg.bodyType, [
        { label: 'Static', value: 'Static' },
        { label: 'Dynamic', value: 'Dynamic' },
        { label: 'Kinematic', value: 'Kinematic' },
      ], (v: PhysicsBodyType) => {
        physUpdate('bodyType', v);
        if (this._engine.physics.isPlaying && go.rigidBody) {
          this._engine.physics.queueChange({ type: 'changeBodyType', go, newType: v });
        }
      }),
      this._createNumberRow('Mass (kg)', cfg.mass, 0.001, 100000, 0.1, (v) => physUpdate('mass', v)),
      this._createNumberRow('Linear Damping', cfg.linearDamping, 0, 100, 0.01, (v) => physUpdate('linearDamping', v)),
      this._createNumberRow('Angular Damping', cfg.angularDamping, 0, 100, 0.01, (v) => physUpdate('angularDamping', v)),
      this._createCheckboxRow('Gravity Enabled', cfg.gravityEnabled, (v) => physUpdate('gravityEnabled', v)),
      this._createNumberRow('Gravity Scale', cfg.gravityScale, -10, 10, 0.1, (v) => physUpdate('gravityScale', v)),
      this._createCheckboxRow('CCD Enabled', cfg.ccdEnabled, (v) => physUpdate('ccdEnabled', v)),
    ]));

    // Collider
    this._bodyEl.appendChild(this._createGroup('Collider', [
      this._createCheckboxRow('Collision Enabled', cfg.collisionEnabled, (v) => physUpdate('collisionEnabled', v)),
      this._createSelectRow('Collider Shape', cfg.colliderShape, [
        { label: 'Box', value: 'Box' },
        { label: 'Sphere', value: 'Sphere' },
        { label: 'Capsule', value: 'Capsule' },
        { label: 'Cylinder', value: 'Cylinder' },
        { label: 'Convex Hull', value: 'ConvexHull' },
        { label: 'Trimesh', value: 'Trimesh' },
        { label: 'None', value: 'None' },
      ], (v: ColliderShapeType) => {
        physUpdate('colliderShape', v);
        if (this._engine.physics.isPlaying && go.rigidBody) {
          this._engine.physics.queueChange({ type: 'changeShape', go });
        }
        this._showProperties(go);
      }),
      this._createCheckboxRow('Auto-Fit Collider', cfg.autoFitCollider, (v) => {
        physUpdate('autoFitCollider', v);
        if (this._engine.physics.isPlaying && go.rigidBody) {
          this._engine.physics.queueChange({ type: 'changeShape', go });
        }
      }),
      this._createCheckboxRow('Is Trigger', cfg.isTrigger, (v) => physUpdate('isTrigger', v)),
    ]));

    // Manual Collider Dimensions (contextual)
    if (!cfg.autoFitCollider) {
      const dimRows: HTMLElement[] = [];
      if (cfg.colliderShape === 'Box') {
        dimRows.push(this._createNumberRow('Half X', cfg.boxHalfExtents.x, 0.001, 1000, 0.1, (v) => { cfg.boxHalfExtents.x = v; physUpdate('boxHalfExtents', cfg.boxHalfExtents); }));
        dimRows.push(this._createNumberRow('Half Y', cfg.boxHalfExtents.y, 0.001, 1000, 0.1, (v) => { cfg.boxHalfExtents.y = v; physUpdate('boxHalfExtents', cfg.boxHalfExtents); }));
        dimRows.push(this._createNumberRow('Half Z', cfg.boxHalfExtents.z, 0.001, 1000, 0.1, (v) => { cfg.boxHalfExtents.z = v; physUpdate('boxHalfExtents', cfg.boxHalfExtents); }));
      } else if (cfg.colliderShape === 'Sphere') {
        dimRows.push(this._createNumberRow('Radius', cfg.sphereRadius, 0.001, 1000, 0.1, (v) => physUpdate('sphereRadius', v)));
      } else if (cfg.colliderShape === 'Capsule') {
        dimRows.push(this._createNumberRow('Radius', cfg.capsuleRadius, 0.001, 1000, 0.1, (v) => physUpdate('capsuleRadius', v)));
        dimRows.push(this._createNumberRow('Half Height', cfg.capsuleHalfHeight, 0.001, 1000, 0.1, (v) => physUpdate('capsuleHalfHeight', v)));
      } else if (cfg.colliderShape === 'Cylinder') {
        dimRows.push(this._createNumberRow('Radius', cfg.cylinderRadius, 0.001, 1000, 0.1, (v) => physUpdate('cylinderRadius', v)));
        dimRows.push(this._createNumberRow('Half Height', cfg.cylinderHalfHeight, 0.001, 1000, 0.1, (v) => physUpdate('cylinderHalfHeight', v)));
      }
      if (dimRows.length > 0) this._bodyEl.appendChild(this._createGroup('Collider Dimensions', dimRows));
    }

    // Collider Offset
    this._bodyEl.appendChild(this._createGroup('Collider Offset', [
      this._createNumberRow('Offset X', cfg.colliderOffset.x, -1000, 1000, 0.1, (v) => { cfg.colliderOffset.x = v; physUpdate('colliderOffset', cfg.colliderOffset); }),
      this._createNumberRow('Offset Y', cfg.colliderOffset.y, -1000, 1000, 0.1, (v) => { cfg.colliderOffset.y = v; physUpdate('colliderOffset', cfg.colliderOffset); }),
      this._createNumberRow('Offset Z', cfg.colliderOffset.z, -1000, 1000, 0.1, (v) => { cfg.colliderOffset.z = v; physUpdate('colliderOffset', cfg.colliderOffset); }),
    ]));

    // Physics Material
    this._bodyEl.appendChild(this._createGroup('Physics Material', [
      this._createNumberRow('Friction', cfg.friction, 0, 10, 0.05, (v) => physUpdate('friction', v)),
      this._createSelectRow('Friction Combine', cfg.frictionCombine, [
        { label: 'Average', value: 'Average' }, { label: 'Min', value: 'Min' },
        { label: 'Max', value: 'Max' }, { label: 'Multiply', value: 'Multiply' },
      ], (v: CombineMode) => physUpdate('frictionCombine', v)),
      this._createNumberRow('Restitution', cfg.restitution, 0, 2, 0.05, (v) => physUpdate('restitution', v)),
      this._createSelectRow('Restitution Combine', cfg.restitutionCombine, [
        { label: 'Average', value: 'Average' }, { label: 'Min', value: 'Min' },
        { label: 'Max', value: 'Max' }, { label: 'Multiply', value: 'Multiply' },
      ], (v: CombineMode) => physUpdate('restitutionCombine', v)),
    ]));

    // Constraints (axis locks)
    this._bodyEl.appendChild(this._createGroup('Constraints', [
      this._createCheckboxRow('Lock Pos X', cfg.lockPositionX, (v) => physUpdate('lockPositionX', v)),
      this._createCheckboxRow('Lock Pos Y', cfg.lockPositionY, (v) => physUpdate('lockPositionY', v)),
      this._createCheckboxRow('Lock Pos Z', cfg.lockPositionZ, (v) => physUpdate('lockPositionZ', v)),
      this._createCheckboxRow('Lock Rot X', cfg.lockRotationX, (v) => physUpdate('lockRotationX', v)),
      this._createCheckboxRow('Lock Rot Y', cfg.lockRotationY, (v) => physUpdate('lockRotationY', v)),
      this._createCheckboxRow('Lock Rot Z', cfg.lockRotationZ, (v) => physUpdate('lockRotationZ', v)),
    ]));

    // Collision Filtering
    this._bodyEl.appendChild(this._createGroup('Collision Filtering', [
      this._createSelectRow('Collision Channel', cfg.collisionChannel, ALL_COLLISION_CHANNELS.map(ch => ({ label: ch, value: ch })),
        (v: CollisionChannel) => physUpdate('collisionChannel', v)),
      this._createCheckboxRow('Generate Overlap Events', cfg.generateOverlapEvents, (v) => physUpdate('generateOverlapEvents', v)),
      this._createCheckboxRow('Generate Hit Events', cfg.generateHitEvents, (v) => physUpdate('generateHitEvents', v)),
    ]));
  }

  private _createGroup(title: string, rows: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'prop-group';

    const titleEl = document.createElement('div');
    titleEl.className = 'prop-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);

    for (const row of rows) {
      group.appendChild(row);
    }

    return group;
  }

  private _createTextRow(label: string, value: string, onChange: (v: string) => void, placeholder?: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', () => onChange(input.value));

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _createVec3Row(label: string, vec: { x: number; y: number; z: number }, isDegrees = false): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const toDeg = (r: number) => (r * 180) / Math.PI;
    const toRad = (d: number) => (d * Math.PI) / 180;

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisLabel = document.createElement('span');
      axisLabel.className = `prop-xyz-label ${axis}`;
      axisLabel.textContent = axis.toUpperCase();

      const input = document.createElement('input');
      input.type = 'number';
      input.step = isDegrees ? '1' : '0.1';
      input.className = 'prop-input prop-input-sm';
      input.value = isDegrees
        ? toDeg(vec[axis]).toFixed(1)
        : vec[axis].toFixed(2);

      input.addEventListener('change', () => {
        const val = parseFloat(input.value) || 0;
        (vec as any)[axis] = isDegrees ? toRad(val) : val;
      });

      row.appendChild(axisLabel);
      row.appendChild(input);
    }

    return row;
  }

  private _createCheckboxRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'prop-checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _createNumberRow(label: string, value: number, min?: number, max?: number, step?: number, onChange?: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.value = String(value);
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
    if (step != null) input.step = String(step);

    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v) && onChange) onChange(v);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _createColorRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    wrapper.style.flex = '1';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'prop-color-input';
    colorInput.value = value;
    colorInput.style.width = '28px';
    colorInput.style.height = '22px';
    colorInput.style.border = '1px solid var(--border)';
    colorInput.style.borderRadius = '3px';
    colorInput.style.cursor = 'pointer';
    colorInput.style.padding = '0';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'prop-input';
    hexInput.value = value;
    hexInput.style.flex = '1';

    colorInput.addEventListener('input', () => {
      hexInput.value = colorInput.value;
      onChange(colorInput.value);
    });

    hexInput.addEventListener('change', () => {
      colorInput.value = hexInput.value;
      onChange(hexInput.value);
    });

    wrapper.appendChild(colorInput);
    wrapper.appendChild(hexInput);

    row.appendChild(lbl);
    row.appendChild(wrapper);
    return row;
  }

  private _createSelectRow(label: string, value: any, options: { label: string; value: any }[], onChange: (v: any) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const select = document.createElement('select');
    select.className = 'prop-input prop-select';

    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = String(opt.value);
      optEl.textContent = opt.label;
      if (String(opt.value) === String(value)) optEl.selected = true;
      select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
      // Try to parse as number
      const numVal = parseFloat(select.value);
      onChange(isNaN(numVal) ? select.value : numVal);
    });

    row.appendChild(lbl);
    row.appendChild(select);
    return row;
  }

  // Refresh current properties (called externally during play to sync positions)
  refresh(): void {
    if (this._currentCompositionActorId) return; // Don't refresh composition during play
    if (this._current && !this._engine.physics.isPlaying) return;
    if (this._current) {
      this._showProperties(this._current);
    }
  }
}
