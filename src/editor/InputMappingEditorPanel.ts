import { InputMappingAsset, InputMappingAssetManager } from './InputMappingAsset';
import { Icons, iconHTML } from './icons';
import { INPUT_KEYS } from './nodes/events/InputKeyNodes';

export class InputMappingEditorPanel {
  private _container: HTMLElement;
  private _assetId: string;
  private _manager: InputMappingAssetManager;

  constructor(container: HTMLElement, assetId: string) {
    this._container = container;
    this._assetId = assetId;
    this._manager = InputMappingAssetManager.getInstance();
    this.render();
  }

  public render(): void {
    this._container.innerHTML = '';
    this._container.style.padding = '16px';
    this._container.style.color = '#eee';
    this._container.style.fontFamily = 'sans-serif';
    this._container.style.overflowY = 'auto';
    this._container.style.height = '100%';

    const asset = this._manager.getAsset(this._assetId);
    if (!asset) {
      this._container.innerHTML = '<div>Asset not found.</div>';
      return;
    }

    const title = document.createElement('h2');
    title.textContent = `Input Mapping: ${asset.name}`;
    title.style.marginTop = '0';
    title.style.marginBottom = '24px';
    title.style.borderBottom = '1px solid #444';
    title.style.paddingBottom = '8px';
    this._container.appendChild(title);

    this._container.appendChild(this._renderActionMappings(asset));
    this._container.appendChild(this._renderAxisMappings(asset));
  }

  private _renderActionMappings(asset: InputMappingAsset): HTMLElement {
    const section = document.createElement('div');
    section.style.marginBottom = '24px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';

    const title = document.createElement('h3');
    title.textContent = 'Action Mappings';
    title.style.margin = '0';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.innerHTML = iconHTML(Icons.Plus, 'sm') + ' Add Action';
    addBtn.style.background = '#2a2a35';
    addBtn.style.border = '1px solid #444';
    addBtn.style.color = '#eee';
    addBtn.style.padding = '4px 8px';
    addBtn.style.cursor = 'pointer';
    addBtn.style.borderRadius = '4px';
    addBtn.onclick = () => {
      asset.actionMappings.push({ name: 'NewAction', keys: ['Space'] });
      this._manager.notifyChanged();
      this.render();
    };
    header.appendChild(addBtn);
    section.appendChild(header);

    asset.actionMappings.forEach((mapping, i) => {
      const row = document.createElement('div');
      row.style.background = '#1e1e24';
      row.style.border = '1px solid #333';
      row.style.borderRadius = '4px';
      row.style.padding = '8px';
      row.style.marginBottom = '8px';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.marginBottom = '8px';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = mapping.name;
      nameInput.style.flex = '1';
      nameInput.style.background = '#111';
      nameInput.style.border = '1px solid #444';
      nameInput.style.color = '#eee';
      nameInput.style.padding = '4px';
      nameInput.onchange = () => {
        mapping.name = nameInput.value;
        this._manager.notifyChanged();
      };
      topRow.appendChild(nameInput);

      const addKeyBtn = document.createElement('button');
      addKeyBtn.innerHTML = iconHTML(Icons.Plus, 'xs');
      addKeyBtn.style.background = 'none';
      addKeyBtn.style.border = 'none';
      addKeyBtn.style.color = '#8f8';
      addKeyBtn.style.cursor = 'pointer';
      addKeyBtn.style.marginLeft = '8px';
      addKeyBtn.title = 'Add Key';
      addKeyBtn.onclick = () => {
        mapping.keys.push('Space');
        this._manager.notifyChanged();
        this.render();
      };
      topRow.appendChild(addKeyBtn);

      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs');
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.color = '#f55';
      delBtn.style.cursor = 'pointer';
      delBtn.style.marginLeft = '4px';
      delBtn.title = 'Remove Action';
      delBtn.onclick = () => {
        asset.actionMappings.splice(i, 1);
        this._manager.notifyChanged();
        this.render();
      };
      topRow.appendChild(delBtn);
      row.appendChild(topRow);

      mapping.keys.forEach((key, j) => {
        const keyRow = document.createElement('div');
        keyRow.style.display = 'flex';
        keyRow.style.alignItems = 'center';
        keyRow.style.paddingLeft = '16px';
        keyRow.style.marginBottom = '4px';

        const keySelect = document.createElement('select');
        keySelect.style.flex = '1';
        keySelect.style.background = '#111';
        keySelect.style.border = '1px solid #444';
        keySelect.style.color = '#eee';
        keySelect.style.padding = '4px';
        INPUT_KEYS.forEach(k => {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = k;
          if (k === key) opt.selected = true;
          keySelect.appendChild(opt);
        });
        keySelect.onchange = () => {
          mapping.keys[j] = keySelect.value;
          this._manager.notifyChanged();
        };
        keyRow.appendChild(keySelect);

        const delKeyBtn = document.createElement('button');
        delKeyBtn.innerHTML = iconHTML(Icons.Trash2, 'xs');
        delKeyBtn.style.background = 'none';
        delKeyBtn.style.border = 'none';
        delKeyBtn.style.color = '#f55';
        delKeyBtn.style.cursor = 'pointer';
        delKeyBtn.style.marginLeft = '8px';
        delKeyBtn.title = 'Remove Key';
        delKeyBtn.onclick = () => {
          mapping.keys.splice(j, 1);
          this._manager.notifyChanged();
          this.render();
        };
        keyRow.appendChild(delKeyBtn);
        row.appendChild(keyRow);
      });

      section.appendChild(row);
    });

    return section;
  }

  private _renderAxisMappings(asset: InputMappingAsset): HTMLElement {
    const section = document.createElement('div');

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';

    const title = document.createElement('h3');
    title.textContent = 'Axis Mappings';
    title.style.margin = '0';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.innerHTML = iconHTML(Icons.Plus, 'sm') + ' Add Axis';
    addBtn.style.background = '#2a2a35';
    addBtn.style.border = '1px solid #444';
    addBtn.style.color = '#eee';
    addBtn.style.padding = '4px 8px';
    addBtn.style.cursor = 'pointer';
    addBtn.style.borderRadius = '4px';
    addBtn.onclick = () => {
      asset.axisMappings.push({ name: 'NewAxis', key: 'W', scale: 1.0 });
      this._manager.notifyChanged();
      this.render();
    };
    header.appendChild(addBtn);
    section.appendChild(header);

    asset.axisMappings.forEach((mapping, i) => {
      const row = document.createElement('div');
      row.style.background = '#1e1e24';
      row.style.border = '1px solid #333';
      row.style.borderRadius = '4px';
      row.style.padding = '8px';
      row.style.marginBottom = '8px';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = mapping.name;
      nameInput.style.flex = '1';
      nameInput.style.background = '#111';
      nameInput.style.border = '1px solid #444';
      nameInput.style.color = '#eee';
      nameInput.style.padding = '4px';
      nameInput.onchange = () => {
        mapping.name = nameInput.value;
        this._manager.notifyChanged();
      };
      row.appendChild(nameInput);

      const keySelect = document.createElement('select');
      keySelect.style.flex = '1';
      keySelect.style.background = '#111';
      keySelect.style.border = '1px solid #444';
      keySelect.style.color = '#eee';
      keySelect.style.padding = '4px';
      INPUT_KEYS.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        if (k === mapping.key) opt.selected = true;
        keySelect.appendChild(opt);
      });
      keySelect.onchange = () => {
        mapping.key = keySelect.value;
        this._manager.notifyChanged();
      };
      row.appendChild(keySelect);

      const scaleInput = document.createElement('input');
      scaleInput.type = 'number';
      scaleInput.step = '0.1';
      scaleInput.value = mapping.scale.toString();
      scaleInput.style.width = '60px';
      scaleInput.style.background = '#111';
      scaleInput.style.border = '1px solid #444';
      scaleInput.style.color = '#eee';
      scaleInput.style.padding = '4px';
      scaleInput.onchange = () => {
        mapping.scale = parseFloat(scaleInput.value) || 1.0;
        this._manager.notifyChanged();
      };
      row.appendChild(scaleInput);

      const delBtn = document.createElement('button');
      delBtn.innerHTML = iconHTML(Icons.Trash2, 'xs');
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.color = '#f55';
      delBtn.style.cursor = 'pointer';
      delBtn.title = 'Remove Axis';
      delBtn.onclick = () => {
        asset.axisMappings.splice(i, 1);
        this._manager.notifyChanged();
        this.render();
      };
      row.appendChild(delBtn);

      section.appendChild(row);
    });

    return section;
  }
}
