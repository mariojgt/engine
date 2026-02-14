// ============================================================
//  EnumEditorPanel — UE-style Enum Definition Editor
//  Opens in a dockview panel. Allows editing enum values:
//  name, display name, description. Supports add/remove/reorder.
// ============================================================

import { EnumAsset, StructureAssetManager } from './StructureAsset';
import type { EnumValueDef } from './StructureAsset';

export class EnumEditorPanel {
  public container: HTMLElement;
  private _asset: EnumAsset;
  private _manager: StructureAssetManager;
  private _onChanged: (() => void) | undefined;

  constructor(
    container: HTMLElement,
    asset: EnumAsset,
    manager: StructureAssetManager,
    onChanged?: () => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._manager = manager;
    this._onChanged = onChanged;
    this._build();
  }

  private _emit(): void {
    this._manager.notifyEnumChanged(this._asset.id);
    this._onChanged?.();
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel enum-editor-panel';

    // ---- Header ----
    const header = document.createElement('div');
    header.className = 'panel-header enum-editor-header';
    header.innerHTML = `
      <span class="enum-editor-icon">📋</span>
      <span class="enum-editor-title">${this._asset.name}</span>
      <span class="enum-editor-badge">Enumeration</span>
    `;
    this.container.appendChild(header);

    // ---- Body ----
    const body = document.createElement('div');
    body.className = 'panel-body enum-editor-body';
    this.container.appendChild(body);

    // ---- Metadata Section ----
    const metaSection = document.createElement('div');
    metaSection.className = 'enum-editor-section';
    metaSection.innerHTML = `<div class="enum-editor-section-title">Details</div>`;

    // Name
    const nameRow = this._createPropertyRow('Name', 'text', this._asset.name, (val) => {
      this._asset.name = val as string;
      this._asset.touch();
      header.querySelector('.enum-editor-title')!.textContent = val as string;
      this._emit();
    });
    metaSection.appendChild(nameRow);

    // Description
    const descRow = this._createPropertyRow('Description', 'text', this._asset.description, (val) => {
      this._asset.description = val as string;
      this._asset.touch();
      this._emit();
    });
    metaSection.appendChild(descRow);

    body.appendChild(metaSection);

    // ---- Enumerators Section ----
    const enumSection = document.createElement('div');
    enumSection.className = 'enum-editor-section';

    const enumTitleRow = document.createElement('div');
    enumTitleRow.className = 'enum-editor-section-title-row';
    enumTitleRow.innerHTML = `
      <span class="enum-editor-section-title">Enumerators</span>
      <button class="enum-editor-add-btn" title="Add Value">+ Add</button>
    `;
    enumSection.appendChild(enumTitleRow);

    const valuesContainer = document.createElement('div');
    valuesContainer.className = 'enum-editor-values';
    enumSection.appendChild(valuesContainer);

    enumTitleRow.querySelector('.enum-editor-add-btn')!.addEventListener('click', () => {
      const idx = this._asset.values.length;
      this._asset.addValue(`Value${idx}`, `Value ${idx}`);
      this._emit();
      this._renderValues(valuesContainer);
    });

    body.appendChild(enumSection);

    // ---- Max Value Info ----
    const maxSection = document.createElement('div');
    maxSection.className = 'enum-editor-section enum-editor-max-section';
    maxSection.innerHTML = `
      <div class="enum-editor-max-label">
        <span class="enum-editor-max-icon">ℹ</span>
        <span>MAX value is auto-generated and not editable.</span>
      </div>
    `;
    body.appendChild(maxSection);

    // Initial render
    this._renderValues(valuesContainer);
  }

  private _renderValues(container: HTMLElement): void {
    container.innerHTML = '';

    if (this._asset.values.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'enum-editor-empty';
      empty.textContent = 'No enumerators. Click "+ Add" to begin.';
      container.appendChild(empty);
      return;
    }

    // Column headers
    const headerRow = document.createElement('div');
    headerRow.className = 'enum-value-header-row';
    headerRow.innerHTML = `
      <span class="enum-value-col-idx">#</span>
      <span class="enum-value-col-name">Name</span>
      <span class="enum-value-col-display">Display Name</span>
      <span class="enum-value-col-desc">Description</span>
      <span class="enum-value-col-actions"></span>
    `;
    container.appendChild(headerRow);

    for (let i = 0; i < this._asset.values.length; i++) {
      const val = this._asset.values[i];
      container.appendChild(this._createValueRow(val, i, container));
    }

    // MAX row
    const maxRow = document.createElement('div');
    maxRow.className = 'enum-value-row enum-value-max-row';
    maxRow.innerHTML = `
      <span class="enum-value-col-idx">${this._asset.values.length}</span>
      <span class="enum-value-col-name enum-value-max-name">${this._asset.name}_MAX</span>
      <span class="enum-value-col-display">(auto)</span>
      <span class="enum-value-col-desc">—</span>
      <span class="enum-value-col-actions"></span>
    `;
    container.appendChild(maxRow);
  }

  private _createValueRow(val: EnumValueDef, index: number, valuesContainer: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'enum-value-row';
    row.setAttribute('data-value-id', val.id);

    // Index
    const idxEl = document.createElement('span');
    idxEl.className = 'enum-value-col-idx';
    idxEl.textContent = String(index);
    row.appendChild(idxEl);

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'enum-value-input enum-value-col-name';
    nameInput.value = val.name;
    nameInput.addEventListener('change', () => {
      val.name = nameInput.value.trim() || 'Value';
      this._asset.touch();
      this._emit();
    });
    row.appendChild(nameInput);

    // Display Name input
    const displayInput = document.createElement('input');
    displayInput.type = 'text';
    displayInput.className = 'enum-value-input enum-value-col-display';
    displayInput.value = val.displayName;
    displayInput.addEventListener('change', () => {
      val.displayName = displayInput.value.trim() || val.name;
      this._asset.touch();
      this._emit();
    });
    row.appendChild(displayInput);

    // Description input
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'enum-value-input enum-value-col-desc';
    descInput.value = val.description;
    descInput.placeholder = 'Optional...';
    descInput.addEventListener('change', () => {
      val.description = descInput.value;
      this._asset.touch();
      this._emit();
    });
    row.appendChild(descInput);

    // Actions
    const actionsEl = document.createElement('span');
    actionsEl.className = 'enum-value-col-actions';

    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'enum-value-action-btn';
      upBtn.title = 'Move Up';
      upBtn.textContent = '▲';
      upBtn.addEventListener('click', () => {
        this._asset.reorderValue(val.id, index - 1);
        this._emit();
        this._renderValues(valuesContainer);
      });
      actionsEl.appendChild(upBtn);
    }

    if (index < this._asset.values.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'enum-value-action-btn';
      downBtn.title = 'Move Down';
      downBtn.textContent = '▼';
      downBtn.addEventListener('click', () => {
        this._asset.reorderValue(val.id, index + 1);
        this._emit();
        this._renderValues(valuesContainer);
      });
      actionsEl.appendChild(downBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'enum-value-action-btn enum-value-delete-btn';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      this._asset.removeValue(val.id);
      this._emit();
      this._renderValues(valuesContainer);
    });
    actionsEl.appendChild(delBtn);

    row.appendChild(actionsEl);
    return row;
  }

  private _createPropertyRow(label: string, inputType: string, value: string, onChange: (val: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'enum-editor-prop-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'enum-editor-prop-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'enum-editor-prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    row.appendChild(input);

    return row;
  }
}
