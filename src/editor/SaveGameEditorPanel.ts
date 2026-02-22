// ============================================================
//  SaveGameEditorPanel — UE-style Save Game class editor
//  Opens in a dockview panel.  Allows defining variables that
//  will be stored when saving a game: name, type, default value,
//  category, and tooltip.  Supports add/remove/reorder.
// ============================================================

import { SaveGameAsset, SaveGameAssetManager } from './SaveGameAsset';
import type { SaveGameFieldDef } from './SaveGameAsset';
import { defaultForVarType } from './StructureAsset';
import type { StructureAssetManager } from './StructureAsset';
import type { VarType } from './BlueprintData';
import { iconHTML, Icons, ICON_COLORS } from './icons';

export class SaveGameEditorPanel {
  public container: HTMLElement;
  private _asset: SaveGameAsset;
  private _manager: SaveGameAssetManager;
  private _structManager: StructureAssetManager | null;
  private _onChanged: (() => void) | undefined;

  constructor(
    container: HTMLElement,
    asset: SaveGameAsset,
    manager: SaveGameAssetManager,
    structManager: StructureAssetManager | null,
    onChanged?: () => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._manager = manager;
    this._structManager = structManager;
    this._onChanged = onChanged;
    this._build();
  }

  private _emit(): void {
    this._manager.notifyChanged(this._asset.id);
    this._onChanged?.();
  }

  /** Build all available type options */
  private _buildTypeOptions(selected?: VarType): string {
    const base: VarType[] = ['Float', 'Boolean', 'Vector3', 'String', 'Color'];
    let html = '';
    for (const t of base) {
      html += `<option value="${t}"${selected === t ? ' selected' : ''}>${t}</option>`;
    }
    // Project-level structs
    if (this._structManager) {
      for (const s of this._structManager.structures) {
        const val: VarType = `Struct:${s.id}`;
        html += `<option value="${val}"${selected === val ? ' selected' : ''}>${s.name} (Struct)</option>`;
      }
      // Project-level enums
      for (const e of this._structManager.enums) {
        const val: VarType = `Enum:${e.id}`;
        html += `<option value="${val}"${selected === val ? ' selected' : ''}>${e.name} (Enum)</option>`;
      }
    }
    return html;
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel struct-editor-panel';

    // ---- Header ----
    const header = document.createElement('div');
    header.className = 'panel-header struct-editor-header';
    header.innerHTML = `
      <span class="struct-editor-icon">${iconHTML(Icons.Save, 16, '#FF7043')}</span>
      <span class="struct-editor-title">${this._asset.name}</span>
      <span class="struct-editor-badge" style="background:rgba(255,112,67,.15);color:#FF7043">Save Game</span>
    `;
    this.container.appendChild(header);

    // ---- Body ----
    const body = document.createElement('div');
    body.className = 'panel-body struct-editor-body';
    this.container.appendChild(body);

    // ---- Metadata Section ----
    const metaSection = document.createElement('div');
    metaSection.className = 'struct-editor-section';
    metaSection.innerHTML = `<div class="struct-editor-section-title">Details</div>`;

    // Name
    metaSection.appendChild(this._createPropertyRow('Name', 'text', this._asset.name, (val) => {
      this._asset.name = val as string;
      this._asset.touch();
      header.querySelector('.struct-editor-title')!.textContent = val as string;
      this._emit();
    }));

    // Description
    metaSection.appendChild(this._createPropertyRow('Description', 'text', this._asset.description, (val) => {
      this._asset.description = val as string;
      this._asset.touch();
      this._emit();
    }));

    body.appendChild(metaSection);

    // ---- Variables Section ----
    const fieldsSection = document.createElement('div');
    fieldsSection.className = 'struct-editor-section';

    const fieldsTitleRow = document.createElement('div');
    fieldsTitleRow.className = 'struct-editor-section-title-row';
    fieldsTitleRow.innerHTML = `
      <span class="struct-editor-section-title">Variables</span>
      <button class="struct-editor-add-btn" title="Add Variable">+ Add Variable</button>
    `;
    fieldsSection.appendChild(fieldsTitleRow);

    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'struct-editor-fields';
    fieldsSection.appendChild(fieldsContainer);

    fieldsTitleRow.querySelector('.struct-editor-add-btn')!.addEventListener('click', () => {
      this._asset.addField('NewVariable', 'Float', 'Default');
      this._emit();
      this._renderFields(fieldsContainer);
    });

    body.appendChild(fieldsSection);

    // ---- Default Value Preview Section ----
    const previewSection = document.createElement('div');
    previewSection.className = 'struct-editor-section';
    previewSection.innerHTML = `
      <div class="struct-editor-section-title">Default Values Preview</div>
      <pre class="struct-editor-preview"></pre>
    `;
    body.appendChild(previewSection);

    // Initial render
    this._renderFields(fieldsContainer);
    this._updatePreview(previewSection.querySelector('.struct-editor-preview')!);

    // Re-render preview whenever fields change
    const origEmit = this._emit.bind(this);
    this._emit = () => {
      origEmit();
      this._updatePreview(previewSection.querySelector('.struct-editor-preview')!);
    };
  }

  private _renderFields(container: HTMLElement): void {
    container.innerHTML = '';

    if (this._asset.fields.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'struct-editor-empty';
      empty.textContent = 'No variables defined. Click "+ Add Variable" to begin.';
      container.appendChild(empty);
      return;
    }

    // Column headers
    const headerRow = document.createElement('div');
    headerRow.className = 'struct-field-header-row';
    headerRow.innerHTML = `
      <span class="struct-field-col-order">#</span>
      <span class="struct-field-col-name">Name</span>
      <span class="struct-field-col-type">Type</span>
      <span class="struct-field-col-default">Default</span>
      <span class="struct-field-col-tooltip">Category</span>
      <span class="struct-field-col-actions"></span>
    `;
    container.appendChild(headerRow);

    for (let i = 0; i < this._asset.fields.length; i++) {
      const field = this._asset.fields[i];
      container.appendChild(this._createFieldRow(field, i, container));
    }
  }

  private _createFieldRow(field: SaveGameFieldDef, index: number, fieldsContainer: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'struct-field-row';
    row.setAttribute('data-field-id', field.id);

    // Order number
    const orderEl = document.createElement('span');
    orderEl.className = 'struct-field-col-order';
    orderEl.textContent = String(index);
    row.appendChild(orderEl);

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'struct-field-input struct-field-col-name';
    nameInput.value = field.name;
    nameInput.addEventListener('change', () => {
      field.name = nameInput.value.trim() || 'Variable';
      this._asset.touch();
      this._emit();
    });
    row.appendChild(nameInput);

    // Type select
    const typeSelect = document.createElement('select');
    typeSelect.className = 'struct-field-select struct-field-col-type';
    typeSelect.innerHTML = this._buildTypeOptions(field.type);
    typeSelect.addEventListener('change', () => {
      field.type = typeSelect.value as VarType;
      field.defaultValue = defaultForVarType(field.type);
      this._asset.touch();
      this._emit();
      this._renderFields(fieldsContainer);
    });
    row.appendChild(typeSelect);

    // Default value input
    const defaultEl = this._createDefaultValueInput(field);
    defaultEl.classList.add('struct-field-col-default');
    row.appendChild(defaultEl);

    // Category input (re-using the "tooltip" column styling)
    const catInput = document.createElement('input');
    catInput.type = 'text';
    catInput.className = 'struct-field-input struct-field-col-tooltip';
    catInput.value = field.category;
    catInput.placeholder = 'Default';
    catInput.addEventListener('change', () => {
      field.category = catInput.value.trim() || 'Default';
      this._asset.touch();
      this._emit();
    });
    row.appendChild(catInput);

    // Actions (move up, move down, delete)
    const actionsEl = document.createElement('span');
    actionsEl.className = 'struct-field-col-actions';

    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'struct-field-action-btn';
      upBtn.title = 'Move Up';
      upBtn.innerHTML = iconHTML(Icons.ChevronUp, 'xs');
      upBtn.addEventListener('click', () => {
        this._asset.reorderField(field.id, index - 1);
        this._emit();
        this._renderFields(fieldsContainer);
      });
      actionsEl.appendChild(upBtn);
    }

    if (index < this._asset.fields.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'struct-field-action-btn';
      downBtn.title = 'Move Down';
      downBtn.innerHTML = iconHTML(Icons.ChevronDown, 'xs');
      downBtn.addEventListener('click', () => {
        this._asset.reorderField(field.id, index + 1);
        this._emit();
        this._renderFields(fieldsContainer);
      });
      actionsEl.appendChild(downBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'struct-field-action-btn struct-field-delete-btn';
    delBtn.title = 'Delete Variable';
    delBtn.innerHTML = iconHTML(Icons.X, 'xs');
    delBtn.addEventListener('click', () => {
      this._asset.removeField(field.id);
      this._emit();
      this._renderFields(fieldsContainer);
    });
    actionsEl.appendChild(delBtn);

    row.appendChild(actionsEl);
    return row;
  }

  private _createDefaultValueInput(field: SaveGameFieldDef): HTMLElement {
    const wrapper = document.createElement('span');

    if (field.type === 'Float') {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'struct-field-input';
      inp.value = String(field.defaultValue ?? 0);
      inp.step = '0.1';
      inp.addEventListener('change', () => {
        field.defaultValue = parseFloat(inp.value) || 0;
        this._asset.touch();
        this._emit();
      });
      wrapper.appendChild(inp);
    } else if (field.type === 'Boolean') {
      const inp = document.createElement('select');
      inp.className = 'struct-field-select';
      inp.innerHTML = `
        <option value="false"${field.defaultValue === false ? ' selected' : ''}>False</option>
        <option value="true"${field.defaultValue === true ? ' selected' : ''}>True</option>
      `;
      inp.addEventListener('change', () => {
        field.defaultValue = inp.value === 'true';
        this._asset.touch();
        this._emit();
      });
      wrapper.appendChild(inp);
    } else if (field.type === 'String') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'struct-field-input';
      inp.value = String(field.defaultValue ?? '');
      inp.addEventListener('change', () => {
        field.defaultValue = inp.value;
        this._asset.touch();
        this._emit();
      });
      wrapper.appendChild(inp);
    } else if (field.type === 'Vector3') {
      const vec = field.defaultValue ?? { x: 0, y: 0, z: 0 };
      const vecWrap = document.createElement('span');
      vecWrap.className = 'struct-field-vec3';
      for (const axis of ['x', 'y', 'z'] as const) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'struct-field-input struct-field-vec3-input';
        inp.value = String(vec[axis] ?? 0);
        inp.step = '0.1';
        inp.placeholder = axis.toUpperCase();
        inp.addEventListener('change', () => {
          if (!field.defaultValue || typeof field.defaultValue !== 'object') {
            field.defaultValue = { x: 0, y: 0, z: 0 };
          }
          field.defaultValue[axis] = parseFloat(inp.value) || 0;
          this._asset.touch();
          this._emit();
        });
        vecWrap.appendChild(inp);
      }
      wrapper.appendChild(vecWrap);
    } else if (field.type.startsWith('Enum:') && this._structManager) {
      const enumId = field.type.slice(5);
      const enumAsset = this._structManager.getEnum(enumId);
      const inp = document.createElement('select');
      inp.className = 'struct-field-select';
      if (enumAsset) {
        for (const v of enumAsset.values) {
          inp.innerHTML += `<option value="${v.name}"${field.defaultValue === v.name ? ' selected' : ''}>${v.displayName}</option>`;
        }
      }
      inp.addEventListener('change', () => {
        field.defaultValue = inp.value;
        this._asset.touch();
        this._emit();
      });
      wrapper.appendChild(inp);
    } else {
      // Struct or unknown — show as JSON text
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'struct-field-input';
      inp.value = typeof field.defaultValue === 'object' ? JSON.stringify(field.defaultValue) : String(field.defaultValue ?? '');
      inp.placeholder = '{ ... }';
      inp.addEventListener('change', () => {
        try { field.defaultValue = JSON.parse(inp.value); } catch { field.defaultValue = inp.value; }
        this._asset.touch();
        this._emit();
      });
      wrapper.appendChild(inp);
    }

    return wrapper;
  }

  private _updatePreview(previewEl: HTMLElement): void {
    const obj: Record<string, any> = {};
    for (const f of this._asset.fields) {
      obj[f.name] = f.defaultValue;
    }
    previewEl.textContent = JSON.stringify(obj, null, 2);
  }

  private _createPropertyRow(label: string, inputType: string, value: string, onChange: (val: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'struct-editor-prop-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'struct-editor-prop-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'struct-editor-prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(input);

    return row;
  }
}
