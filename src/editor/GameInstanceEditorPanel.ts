// ============================================================
//  GameInstanceEditorPanel — Editor for Game Instance Blueprints
//  Simple panel with a single Event Graph tab for scripting
//  persistent runtime logic that survives scene transitions.
// ============================================================

import type { GameInstanceBlueprintAsset } from './GameInstanceData';
import type { BlueprintVariable, VarType } from './BlueprintData';
import { mountNodeEditorForAsset } from './NodeEditorPanel';
import { iconHTML, Icons, ICON_COLORS } from './icons';

export class GameInstanceEditorPanel {
  private _container: HTMLElement;
  private _asset: GameInstanceBlueprintAsset;
  private _onSave?: () => void;

  private _contentArea!: HTMLElement;
  private _eventGraphCleanup: (() => void) | null = null;
  private _eventGraphCompile: (() => void) | null = null;

  constructor(container: HTMLElement, asset: GameInstanceBlueprintAsset, onSave?: () => void) {
    this._container = container;
    this._asset = asset;
    this._onSave = onSave;
    this._build();
  }

  private _build(): void {
    this._container.innerHTML = '';
    this._container.style.display = 'flex';
    this._container.style.flexDirection = 'column';
    this._container.style.height = '100%';
    this._container.style.background = '#1a1a2e';

    // ── Header ──
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.padding = '6px 12px';
    header.style.background = '#12121f';
    header.style.borderBottom = '1px solid #2a2a4a';
    header.style.gap = '10px';
    header.style.flexShrink = '0';

    const icon = document.createElement('span');
    icon.innerHTML = iconHTML(Icons.Circle, 16, ICON_COLORS.primary);
    icon.style.fontSize = '18px';
    header.appendChild(icon);

    const title = document.createElement('span');
    title.textContent = `Game Instance: ${this._asset.name}`;
    title.style.color = '#e0e0ff';
    title.style.fontWeight = '600';
    title.style.fontSize = '13px';
    header.appendChild(title);

    // Compile button
    const compileBtn = document.createElement('button');
    compileBtn.innerHTML = iconHTML(Icons.Zap, 12, ICON_COLORS.warning) + ' Compile';
    compileBtn.style.marginLeft = 'auto';
    compileBtn.style.padding = '3px 10px';
    compileBtn.style.background = '#2a6e3f';
    compileBtn.style.color = '#e0ffe0';
    compileBtn.style.border = '1px solid #3a8e5f';
    compileBtn.style.borderRadius = '4px';
    compileBtn.style.cursor = 'pointer';
    compileBtn.style.fontSize = '12px';
    compileBtn.addEventListener('click', () => {
      if (this._eventGraphCompile) {
        this._eventGraphCompile();
        console.log(`[GameInstance] Manual compile for ${this._asset.name}`);
      }
    });
    header.appendChild(compileBtn);

    this._container.appendChild(header);

    // ── Content area ──
    this._contentArea = document.createElement('div');
    this._contentArea.style.flex = '1';
    this._contentArea.style.display = 'flex';
    this._contentArea.style.flexDirection = 'column';
    this._contentArea.style.overflow = 'hidden';
    this._container.appendChild(this._contentArea);

    this._buildEventGraph();
  }

  private _buildEventGraph(): void {
    // Clean up previous editor
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
      this._eventGraphCompile = null;
    }

    this._contentArea.innerHTML = '';

    // ── Wrapper (horizontal split: variables | node editor) ──
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.overflow = 'hidden';

    // ── Left panel: Variable list ──
    const varPanel = document.createElement('div');
    varPanel.style.width = '220px';
    varPanel.style.minWidth = '180px';
    varPanel.style.borderRight = '1px solid #2a2a4a';
    varPanel.style.display = 'flex';
    varPanel.style.flexDirection = 'column';
    varPanel.style.background = '#16162a';
    varPanel.style.overflowY = 'auto';

    this._buildVarList(varPanel);
    wrapper.appendChild(varPanel);

    // ── Right panel: Rete Node Editor ──
    const editorContainer = document.createElement('div');
    editorContainer.style.flex = '1';
    editorContainer.style.position = 'relative';
    editorContainer.style.overflow = 'hidden';
    editorContainer.style.minHeight = '300px';
    wrapper.appendChild(editorContainer);

    this._contentArea.appendChild(wrapper);

    // Mount the Rete node editor using the GameInstance's BlueprintData
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
      undefined, // components
      undefined, // rootMeshType
      undefined, // widgetList
      undefined  // isAnimBlueprint
    );

    // Auto-compile once the editor initializes
    setTimeout(() => {
      const compileFn = (editorContainer as any).__compileAndSave as (() => void) | undefined;
      if (compileFn) {
        this._eventGraphCompile = compileFn;
        console.log(`[GameInstance] Auto-compile on open for ${this._asset.name}`);
        compileFn();
      } else {
        console.warn(`[GameInstance] Auto-compile failed: no compile function for ${this._asset.name}`);
      }
    }, 0);
  }

  /** Build/rebuild the variable list */
  private _buildVarList(container: HTMLElement): void {
    container.innerHTML = '';
    const bp = this._asset.blueprintData;

    // Header row
    const hdr = document.createElement('div');
    hdr.style.display = 'flex';
    hdr.style.alignItems = 'center';
    hdr.style.padding = '8px 10px';
    hdr.style.borderBottom = '1px solid #2a2a4a';
    hdr.style.gap = '6px';

    const hdrLabel = document.createElement('span');
    hdrLabel.textContent = 'Variables';
    hdrLabel.style.color = '#aaa';
    hdrLabel.style.fontSize = '11px';
    hdrLabel.style.fontWeight = '700';
    hdrLabel.style.textTransform = 'uppercase';
    hdrLabel.style.letterSpacing = '1px';
    hdr.appendChild(hdrLabel);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.marginLeft = 'auto';
    addBtn.style.padding = '2px 8px';
    addBtn.style.background = '#2a3a5a';
    addBtn.style.color = '#7ec8ff';
    addBtn.style.border = '1px solid #3a5a8a';
    addBtn.style.borderRadius = '3px';
    addBtn.style.cursor = 'pointer';
    addBtn.style.fontSize = '11px';
    addBtn.addEventListener('click', () => {
      const name = `NewVar${bp.variables.length}`;
      bp.addVariable(name, 'Float');
      this._buildVarList(container);
      this._asset.touch();
      this._onSave?.();
    });
    hdr.appendChild(addBtn);
    container.appendChild(hdr);

    // Variable rows
    for (const v of bp.variables) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.padding = '4px 10px';
      row.style.borderBottom = '1px solid #1e1e38';
      row.style.gap = '6px';
      row.style.fontSize = '12px';

      // Color marker by type
      const dot = document.createElement('span');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.borderRadius = '50%';
      dot.style.flexShrink = '0';
      const typeColors: Record<string, string> = {
        Float: '#4fc3f7',
        Boolean: '#e57373',
        String: '#81c784',
        Vector3: '#ffb74d',
        Color: '#ce93d8',
      };
      dot.style.background = typeColors[v.type] ?? '#888';
      row.appendChild(dot);

      // Name (editable)
      const nameEl = document.createElement('input');
      nameEl.value = v.name;
      nameEl.style.flex = '1';
      nameEl.style.minWidth = '0';
      nameEl.style.background = 'transparent';
      nameEl.style.border = 'none';
      nameEl.style.color = '#e0e0ff';
      nameEl.style.fontSize = '12px';
      nameEl.style.outline = 'none';
      nameEl.addEventListener('change', () => {
        v.name = nameEl.value;
        this._asset.touch();
        this._onSave?.();
      });
      row.appendChild(nameEl);

      // Type selector
      const typeSelect = document.createElement('select');
      typeSelect.style.background = '#1e1e2e';
      typeSelect.style.color = '#aaa';
      typeSelect.style.border = '1px solid #2a2a4a';
      typeSelect.style.borderRadius = '3px';
      typeSelect.style.fontSize = '10px';
      typeSelect.style.padding = '1px 3px';
      const types: VarType[] = ['Float', 'Boolean', 'String', 'Vector3', 'Color'];
      for (const t of types) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === v.type) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener('change', () => {
        v.type = typeSelect.value as VarType;
        this._asset.touch();
        this._onSave?.();
      });
      row.appendChild(typeSelect);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.X, 'xs');
      delBtn.style.background = 'transparent';
      delBtn.style.border = 'none';
      delBtn.style.color = '#e57373';
      delBtn.style.cursor = 'pointer';
      delBtn.style.fontSize = '12px';
      delBtn.style.padding = '0 2px';
      delBtn.addEventListener('click', () => {
        bp.removeVariable(v.name);
        this._buildVarList(container);
        this._asset.touch();
        this._onSave?.();
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    }
  }

  /** Clean up resources */
  dispose(): void {
    if (this._eventGraphCleanup) {
      this._eventGraphCleanup();
      this._eventGraphCleanup = null;
      this._eventGraphCompile = null;
    }
  }
}
