// ============================================================
//  BlackboardEditorPanel — UE5-style Blackboard key editor
//  Opens as a docked tab with a two-column layout:
//    Left:  Key list with type badges and [+ Add] button
//    Right: Key Details form (name, type, class filter, description, default)
//  During Play mode a third "Current Value" column appears with live values.
// ============================================================

import {
  type AIAssetManager,
  type BlackboardAsset,
  type BlackboardKey,
  type BlackboardKeyType,
  BLACKBOARD_KEY_COLORS,
} from './AIAssetManager';
import { iconHTML, Icons, ICON_COLORS, createIconSpan } from '../icons';

const KEY_TYPE_OPTIONS: { type: BlackboardKeyType; icon: string; color: string }[] = [
  { type: 'Object',  icon: '🔵', color: BLACKBOARD_KEY_COLORS.Object },
  { type: 'Vector',  icon: '🟡', color: BLACKBOARD_KEY_COLORS.Vector },
  { type: 'Rotator', icon: '🔴', color: BLACKBOARD_KEY_COLORS.Rotator },
  { type: 'Bool',    icon: '🟢', color: BLACKBOARD_KEY_COLORS.Bool },
  { type: 'Float',   icon: '🔵', color: BLACKBOARD_KEY_COLORS.Float },
  { type: 'Int',     icon: '🟠', color: BLACKBOARD_KEY_COLORS.Int },
  { type: 'String',  icon: '🟣', color: BLACKBOARD_KEY_COLORS.String },
  { type: 'Enum',    icon: '🩷', color: BLACKBOARD_KEY_COLORS.Enum },
];

export class BlackboardEditorPanel {
  private _container: HTMLElement;
  private _asset: BlackboardAsset;
  private _manager: AIAssetManager;
  private _selectedKeyId: string | null = null;
  private _isPlayMode = false;
  private _liveUpdateInterval: number | null = null;
  private _onSave?: () => void;

  constructor(
    container: HTMLElement,
    asset: BlackboardAsset,
    manager: AIAssetManager,
    onSave?: () => void,
  ) {
    this._container = container;
    this._asset = asset;
    this._manager = manager;
    this._onSave = onSave;
    this._render();
  }

  dispose(): void {
    if (this._liveUpdateInterval !== null) clearInterval(this._liveUpdateInterval);
    this._container.innerHTML = '';
  }

  setPlayMode(active: boolean): void {
    this._isPlayMode = active;
    this._render();
    if (active) {
      this._liveUpdateInterval = window.setInterval(() => this._renderKeyList(), 100);
    } else if (this._liveUpdateInterval !== null) {
      clearInterval(this._liveUpdateInterval);
      this._liveUpdateInterval = null;
    }
  }

  private _render(): void {
    this._container.innerHTML = '';
    this._container.className = 'ai-bb-editor';

    // ── Hint bar (first time) ──
    if (!this._manager.isHintDismissed('blackboard')) {
      const hint = document.createElement('div');
      hint.className = 'ai-hint-bar';
      hint.innerHTML = `
        <span class="ai-hint-icon">${iconHTML(Icons.Info, 12, '#fbbf24')}</span>
        <span>Add keys to define the shared memory your AI uses. Keys are available in all linked Behavior Trees.</span>
        <button class="ai-hint-dismiss">Got it</button>
      `;
      hint.querySelector('.ai-hint-dismiss')!.addEventListener('click', () => {
        this._manager.dismissHint('blackboard');
        hint.remove();
      });
      this._container.appendChild(hint);
    }

    // ── Main layout ──
    const layout = document.createElement('div');
    layout.className = 'ai-bb-layout';

    // Left — Key list
    const leftPanel = document.createElement('div');
    leftPanel.className = 'ai-bb-left';

    const leftHeader = document.createElement('div');
    leftHeader.className = 'ai-bb-left-header';
    leftHeader.innerHTML = `<span class="ai-bb-left-title">Keys</span>`;

    const addBtn = document.createElement('button');
    addBtn.className = 'ai-bb-add-btn';
    addBtn.innerHTML = `${iconHTML(Icons.Plus, 10, '#fff')} Add`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showKeyTypeDropdown(addBtn);
    });
    leftHeader.appendChild(addBtn);
    leftPanel.appendChild(leftHeader);

    const keyListEl = document.createElement('div');
    keyListEl.className = 'ai-bb-keylist';
    leftPanel.appendChild(keyListEl);

    // Right — Key Details
    const rightPanel = document.createElement('div');
    rightPanel.className = 'ai-bb-right';
    this._rightPanel = rightPanel;

    layout.appendChild(leftPanel);
    layout.appendChild(rightPanel);
    this._container.appendChild(layout);

    this._keyListEl = keyListEl;
    this._renderKeyList();
    this._renderKeyDetails();

    // ── "Used By" footer ──
    const usedByTrees = this._manager.getTreesUsingBlackboard(this._asset.id);
    if (usedByTrees.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'ai-bb-footer';
      footer.innerHTML = `<span class="ai-bb-footer-label">Used By:</span>`;
      for (const bt of usedByTrees) {
        const pill = document.createElement('span');
        pill.className = 'ai-linked-pill';
        pill.innerHTML = `${iconHTML(Icons.GitBranch, 10, '#1565C0')} ${bt.name} →`;
        pill.title = `Open ${bt.name}`;
        pill.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('open-ai-asset', { detail: { type: 'behaviorTree', id: bt.id } }));
        });
        footer.appendChild(pill);
      }
      this._container.appendChild(footer);
    }
  }

  private _keyListEl: HTMLElement | null = null;
  private _rightPanel: HTMLElement | null = null;

  private _renderKeyList(): void {
    if (!this._keyListEl) return;
    const listEl = this._keyListEl;
    // Preserve scroll position
    const scroll = listEl.scrollTop;
    listEl.innerHTML = '';

    for (const key of this._asset.keys) {
      const row = document.createElement('div');
      row.className = `ai-bb-key-row${this._selectedKeyId === key.id ? ' ai-bb-key-row--selected' : ''}`;

      // Flash green if recently changed (play mode)
      if (this._isPlayMode && key._lastChanged && Date.now() - key._lastChanged < 500) {
        row.classList.add('ai-bb-key-row--changed');
      }

      const badge = document.createElement('span');
      badge.className = 'ai-bb-key-badge';
      badge.style.background = BLACKBOARD_KEY_COLORS[key.type];
      badge.textContent = key.type.charAt(0);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ai-bb-key-name';
      nameSpan.textContent = key.name;

      const typeSpan = document.createElement('span');
      typeSpan.className = 'ai-bb-key-type';
      typeSpan.textContent = key.type;

      row.appendChild(badge);
      row.appendChild(nameSpan);
      row.appendChild(typeSpan);

      // Play mode — live value
      if (this._isPlayMode) {
        const valSpan = document.createElement('span');
        valSpan.className = 'ai-bb-key-live';
        const val = key._liveValue !== undefined ? key._liveValue : key.defaultValue;
        if (val === null || val === undefined) {
          valSpan.textContent = 'None';
          valSpan.classList.add('ai-bb-key-live--dimmed');
        } else if (typeof val === 'boolean') {
          valSpan.innerHTML = val ? '✅ true' : '❌ false';
        } else if (typeof val === 'object') {
          valSpan.textContent = `(${Object.values(val).join(', ')})`;
        } else {
          valSpan.textContent = String(val);
        }
        // Click to override in play mode
        valSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showLiveOverride(key, valSpan);
        });
        row.appendChild(valSpan);
      }

      row.addEventListener('click', () => {
        this._selectedKeyId = key.id;
        this._renderKeyList();
        this._renderKeyDetails();
      });

      listEl.appendChild(row);
    }

    if (this._asset.keys.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ai-bb-empty';
      empty.textContent = 'No keys. Click + Add to create one.';
      listEl.appendChild(empty);
    }

    listEl.scrollTop = scroll;
  }

  private _renderKeyDetails(): void {
    if (!this._rightPanel) return;
    this._rightPanel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'ai-bb-right-header';
    header.textContent = 'Key Details';
    this._rightPanel.appendChild(header);

    const key = this._asset.keys.find(k => k.id === this._selectedKeyId);
    if (!key) {
      const hint = document.createElement('div');
      hint.className = 'ai-bb-right-empty';
      hint.textContent = 'Select a key to edit its properties';
      this._rightPanel.appendChild(hint);
      return;
    }

    const form = document.createElement('div');
    form.className = 'ai-bb-detail-form';

    // Name
    form.appendChild(this._makeField('Name', () => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = key.name;
      inp.className = 'ai-field-input';
      inp.addEventListener('change', () => {
        this._manager.updateBlackboardKey(this._asset.id, key.id, { name: inp.value });
        this._renderKeyList();
      });
      return inp;
    }));

    // Type
    form.appendChild(this._makeField('Type', () => {
      const sel = document.createElement('select');
      sel.className = 'ai-field-select';
      for (const opt of KEY_TYPE_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt.type;
        o.textContent = opt.type;
        if (opt.type === key.type) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        this._manager.updateBlackboardKey(this._asset.id, key.id, { type: sel.value as BlackboardKeyType });
        this._renderKeyList();
        this._renderKeyDetails();
      });
      return sel;
    }));

    // Class filter (for Object type)
    if (key.type === 'Object') {
      form.appendChild(this._makeField('Class Filter', () => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = key.classFilter || 'Actor';
        inp.className = 'ai-field-input';
        inp.addEventListener('change', () => {
          this._manager.updateBlackboardKey(this._asset.id, key.id, { classFilter: inp.value });
        });
        return inp;
      }));
    }

    // Description
    form.appendChild(this._makeField('Description', () => {
      const ta = document.createElement('textarea');
      ta.className = 'ai-field-textarea';
      ta.value = key.description;
      ta.rows = 2;
      ta.addEventListener('change', () => {
        this._manager.updateBlackboardKey(this._asset.id, key.id, { description: ta.value });
      });
      return ta;
    }));

    // Default value
    form.appendChild(this._makeField('Default', () => {
      return this._createDefaultEditor(key);
    }));

    this._rightPanel.appendChild(form);

    // Separator + Delete
    const sep = document.createElement('div');
    sep.className = 'ai-bb-detail-sep';
    this._rightPanel.appendChild(sep);

    const delBtn = document.createElement('button');
    delBtn.className = 'ai-bb-delete-btn';
    delBtn.innerHTML = `${iconHTML(Icons.Trash2, 12, '#f87171')} Delete Key`;
    delBtn.addEventListener('click', () => {
      this._manager.removeBlackboardKey(this._asset.id, key.id);
      this._selectedKeyId = null;
      this._renderKeyList();
      this._renderKeyDetails();
    });
    this._rightPanel.appendChild(delBtn);
  }

  private _makeField(label: string, createControl: () => HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ai-bb-field-row';
    const lbl = document.createElement('label');
    lbl.className = 'ai-bb-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(createControl());
    return row;
  }

  private _createDefaultEditor(key: BlackboardKey): HTMLElement {
    switch (key.type) {
      case 'Bool': {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!key.defaultValue;
        cb.addEventListener('change', () => {
          this._manager.updateBlackboardKey(this._asset.id, key.id, { defaultValue: cb.checked });
        });
        return cb;
      }
      case 'Float':
      case 'Int': {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = String(key.defaultValue ?? 0);
        inp.step = key.type === 'Float' ? '0.01' : '1';
        inp.className = 'ai-field-input';
        inp.addEventListener('change', () => {
          this._manager.updateBlackboardKey(this._asset.id, key.id, {
            defaultValue: key.type === 'Int' ? parseInt(inp.value) : parseFloat(inp.value),
          });
        });
        return inp;
      }
      case 'String':
      case 'Enum': {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = String(key.defaultValue ?? '');
        inp.className = 'ai-field-input';
        inp.addEventListener('change', () => {
          this._manager.updateBlackboardKey(this._asset.id, key.id, { defaultValue: inp.value });
        });
        return inp;
      }
      case 'Vector':
      case 'Rotator': {
        const wrap = document.createElement('div');
        wrap.className = 'ai-vec-editor';
        const val = key.defaultValue || (key.type === 'Vector' ? { x: 0, y: 0, z: 0 } : { pitch: 0, yaw: 0, roll: 0 });
        const fields = key.type === 'Vector' ? ['x', 'y', 'z'] : ['pitch', 'yaw', 'roll'];
        for (const f of fields) {
          const lbl = document.createElement('span');
          lbl.className = 'ai-vec-label';
          lbl.textContent = f.charAt(0).toUpperCase();
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.step = '0.1';
          inp.value = String(val[f] ?? 0);
          inp.className = 'ai-field-input ai-vec-input';
          inp.addEventListener('change', () => {
            val[f] = parseFloat(inp.value);
            this._manager.updateBlackboardKey(this._asset.id, key.id, { defaultValue: { ...val } });
          });
          wrap.appendChild(lbl);
          wrap.appendChild(inp);
        }
        return wrap;
      }
      default: {
        const span = document.createElement('span');
        span.className = 'ai-bb-default-none';
        span.textContent = 'None';
        return span;
      }
    }
  }

  /** Show key type dropdown below the Add button */
  private _showKeyTypeDropdown(anchor: HTMLElement): void {
    // Remove existing dropdown
    document.querySelectorAll('.ai-bb-type-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'ai-bb-type-dropdown';

    const title = document.createElement('div');
    title.className = 'ai-bb-type-dropdown-title';
    title.textContent = 'Choose Key Type';
    dropdown.appendChild(title);

    for (const opt of KEY_TYPE_OPTIONS) {
      const row = document.createElement('div');
      row.className = 'ai-bb-type-option';
      row.innerHTML = `<span class="ai-bb-key-badge" style="background:${opt.color}">${opt.type.charAt(0)}</span> <span>${opt.type}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.remove();
        const newKey = this._manager.addBlackboardKey(this._asset.id, opt.type);
        if (newKey) {
          this._selectedKeyId = newKey.id;
          this._renderKeyList();
          this._renderKeyDetails();
          // Focus name input for inline editing
          requestAnimationFrame(() => {
            const nameInput = this._rightPanel?.querySelector('.ai-field-input') as HTMLInputElement;
            if (nameInput) { nameInput.focus(); nameInput.select(); }
          });
        }
      });
      dropdown.appendChild(row);
    }

    // Position below anchor
    const rect = anchor.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 2 + 'px';
    dropdown.style.zIndex = '10000';
    document.body.appendChild(dropdown);

    // Close on outside click
    const close = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node)) {
        dropdown.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    requestAnimationFrame(() => document.addEventListener('mousedown', close));
  }

  /** Show inline override editor for play mode live values */
  private _showLiveOverride(key: BlackboardKey, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'ai-bb-live-popup';
    popup.style.position = 'fixed';
    popup.style.left = rect.left + 'px';
    popup.style.top = rect.bottom + 2 + 'px';
    popup.style.zIndex = '10000';

    const inp = document.createElement('input');
    inp.type = key.type === 'Bool' ? 'checkbox' : key.type === 'Float' || key.type === 'Int' ? 'number' : 'text';
    inp.className = 'ai-field-input';
    if (key.type === 'Bool') {
      inp.checked = !!key._liveValue;
    } else {
      inp.value = key._liveValue !== undefined ? String(key._liveValue) : '';
    }
    popup.appendChild(inp);

    const apply = () => {
      let val: any;
      if (key.type === 'Bool') val = inp.checked;
      else if (key.type === 'Float') val = parseFloat(inp.value);
      else if (key.type === 'Int') val = parseInt(inp.value);
      else val = inp.value;
      key._liveValue = val;
      key._lastChanged = Date.now();
      popup.remove();
      this._renderKeyList();
    };

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') apply();
      if (e.key === 'Escape') popup.remove();
    });

    document.body.appendChild(popup);
    inp.focus();

    const closeHandler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        popup.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    requestAnimationFrame(() => document.addEventListener('mousedown', closeHandler));
  }
}
