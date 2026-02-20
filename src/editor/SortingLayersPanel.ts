// ============================================================
//  SortingLayersPanel — Editor panel for managing 2D sorting layers
//  Drag to reorder, toggle visibility/lock, rename, delete.
// ============================================================

import { SortingLayerManager, type SortingLayerData } from '../engine/SortingLayers';

export class SortingLayersPanel {
  private _container: HTMLElement;
  private _manager: SortingLayerManager;
  private _listEl: HTMLElement | null = null;

  constructor(container: HTMLElement, manager: SortingLayerManager) {
    this._container = container;
    this._manager = manager;
    this._build();
    this._manager.onChange(() => this._renderList());
  }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `<span style="opacity:0.6">⬛</span><span style="font-weight:600;flex:1">SORTING LAYERS</span>`;

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = 'background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;';
    addBtn.onclick = () => {
      const name = prompt('Layer name:');
      if (name?.trim()) this._manager.addLayer(name.trim());
    };
    header.appendChild(addBtn);
    root.appendChild(header);

    // Layer list
    this._listEl = document.createElement('div');
    this._listEl.style.cssText = 'flex:1;overflow-y:auto;padding:4px;';
    root.appendChild(this._listEl);
    this._renderList();
  }

  private _renderList(): void {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    this._manager.layers.forEach((layer, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;margin-bottom:2px;cursor:grab;';
      row.draggable = true;
      row.dataset.index = String(idx);

      row.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/plain', String(idx));
        row.style.opacity = '0.5';
      });
      row.addEventListener('dragend', () => { row.style.opacity = '1'; });
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.style.background = '#45475a'; });
      row.addEventListener('dragleave', () => { row.style.background = ''; });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.style.background = '';
        const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'));
        this._manager.reorder(fromIdx, idx);
      });

      // Drag handle
      const handle = document.createElement('span');
      handle.textContent = '⠿';
      handle.style.cssText = 'opacity:0.4;cursor:grab;';
      row.appendChild(handle);

      // Name
      const nameSpan = document.createElement('span');
      nameSpan.textContent = layer.name;
      nameSpan.style.cssText = 'flex:1;';
      row.appendChild(nameSpan);

      // Z value
      const zSpan = document.createElement('span');
      zSpan.textContent = `Z:${layer.z}`;
      zSpan.style.cssText = 'opacity:0.5;font-size:10px;min-width:40px;';
      row.appendChild(zSpan);

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.textContent = layer.visible ? '👁' : '👁‍🗨';
      visBtn.title = 'Toggle visibility';
      visBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:2px;opacity:' + (layer.visible ? '1' : '0.4');
      visBtn.onclick = (e) => { e.stopPropagation(); this._manager.toggleVisibility(layer.name); };
      row.appendChild(visBtn);

      // Lock toggle
      const lockBtn = document.createElement('button');
      lockBtn.textContent = layer.locked ? '🔒' : '🔓';
      lockBtn.title = 'Toggle lock';
      lockBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:2px;';
      lockBtn.onclick = (e) => { e.stopPropagation(); this._manager.toggleLock(layer.name); };
      row.appendChild(lockBtn);

      // Rename
      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✎';
      renameBtn.title = 'Rename';
      renameBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#cdd6f4;font-size:12px;padding:2px;';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = prompt('Rename layer:', layer.name);
        if (newName?.trim()) this._manager.renameLayer(layer.name, newName.trim());
      };
      row.appendChild(renameBtn);

      // Delete (not for Default)
      if (layer.name !== 'Default') {
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete';
        delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#f38ba8;font-size:12px;padding:2px;';
        delBtn.onclick = (e) => { e.stopPropagation(); this._manager.removeLayer(layer.name); };
        row.appendChild(delBtn);
      }

      this._listEl!.appendChild(row);
    });
  }

  dispose(): void {
    this._container.innerHTML = '';
  }
}
