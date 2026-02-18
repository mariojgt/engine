// ============================================================
//  InheritanceDialogsUI — Warning dialogs for the inheritance system
//  Provides UE-style modal dialogs for parent edit warnings,
//  propagation preview, out-of-sync alerts, and reparent warnings.
// ============================================================

import type {
  InheritanceDialogs,
  PropagationPreview,
  PropagationDialogResult,
  OutOfSyncResult,
  ReparentResult,
  PropagationChange,
} from './ClassInheritanceSystem';

// ============================================================
//  Dialog Styles (injected once)
// ============================================================

let _stylesInjected = false;
function injectStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .inh-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 100000;
      animation: inh-fade-in 0.15s ease;
    }
    @keyframes inh-fade-in { from { opacity: 0; } to { opacity: 1; } }

    .inh-dialog {
      background: #1e1e2e;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 24px;
      min-width: 420px;
      max-width: 620px;
      max-height: 80vh;
      overflow-y: auto;
      color: #ccc;
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }

    .inh-dialog h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inh-dialog .inh-icon {
      font-size: 20px;
    }

    .inh-dialog .inh-body {
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .inh-dialog .inh-changes {
      background: #181825;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 10px 14px;
      margin: 8px 0;
      max-height: 200px;
      overflow-y: auto;
      font-size: 12px;
    }

    .inh-dialog .inh-change-item {
      padding: 3px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .inh-dialog .inh-change-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .inh-badge-add { background: #1a472a; color: #4ade80; }
    .inh-badge-modify { background: #3b2f12; color: #fbbf24; }
    .inh-badge-remove { background: #4a1c1c; color: #f87171; }
    .inh-badge-override { background: #1a2744; color: #60a5fa; }

    .inh-dialog .inh-child-summary {
      padding: 6px 0;
      border-bottom: 1px solid #2a2a3a;
    }
    .inh-dialog .inh-child-summary:last-child { border-bottom: none; }

    .inh-dialog .inh-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .inh-dialog button {
      padding: 6px 16px;
      border: 1px solid #555;
      border-radius: 4px;
      background: #2a2a3e;
      color: #ccc;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s;
    }
    .inh-dialog button:hover {
      background: #3a3a50;
    }
    .inh-dialog button.inh-primary {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
    }
    .inh-dialog button.inh-primary:hover {
      background: #1d4ed8;
    }
    .inh-dialog button.inh-danger {
      background: #dc2626;
      border-color: #dc2626;
      color: #fff;
    }
    .inh-dialog button.inh-danger:hover {
      background: #b91c1c;
    }

    .inh-dialog .inh-checkbox {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 11px;
      color: #999;
    }

    /* Class Info Bar */
    .class-info-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 12px;
      background: #181825;
      border-bottom: 1px solid #333;
      font-size: 12px;
      color: #aaa;
      flex-shrink: 0;
    }
    .class-info-bar .cib-name {
      font-weight: 600;
      color: #e0e0e0;
    }
    .class-info-bar .cib-parent {
      color: #60a5fa;
      cursor: pointer;
    }
    .class-info-bar .cib-parent:hover {
      text-decoration: underline;
    }
    .class-info-bar .cib-children {
      color: #fbbf24;
    }
    .class-info-bar .cib-warning {
      color: #f87171;
      font-style: italic;
    }
    .class-info-bar .cib-btn {
      padding: 2px 8px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #2a2a3e;
      color: #aaa;
      cursor: pointer;
      font-size: 11px;
    }
    .class-info-bar .cib-btn:hover {
      background: #3a3a50;
      color: #fff;
    }

    /* Inheritance badges */
    .inh-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 4px;
    }
    .inh-badge-inherited {
      background: #1a2744;
      color: #60a5fa;
    }
    .inh-badge-overridden {
      background: #3b2f12;
      color: #fbbf24;
    }
    .inh-badge-child-added {
      background: #1a472a;
      color: #4ade80;
    }

    .inh-reset-btn {
      font-size: 10px;
      padding: 1px 6px;
      border: 1px solid #555;
      border-radius: 3px;
      background: none;
      color: #60a5fa;
      cursor: pointer;
      margin-left: 4px;
    }
    .inh-reset-btn:hover {
      background: #1a2744;
    }

    /* Parent class selector */
    .inh-parent-selector {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 12px;
      padding: 6px 10px;
      background: #181825;
      border: 1px solid #333;
      border-radius: 4px;
      font-size: 12px;
    }
    .inh-parent-selector label {
      color: #999;
      white-space: nowrap;
    }
    .inh-parent-selector select {
      flex: 1;
      background: #2a2a3e;
      border: 1px solid #555;
      border-radius: 3px;
      color: #ccc;
      padding: 3px 6px;
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
//  Dialog Helper
// ============================================================

function createOverlay(): HTMLElement {
  injectStyles();
  const overlay = document.createElement('div');
  overlay.className = 'inh-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

function createDialog(overlay: HTMLElement): HTMLElement {
  const dialog = document.createElement('div');
  dialog.className = 'inh-dialog';
  overlay.appendChild(dialog);
  return dialog;
}

function closeOverlay(overlay: HTMLElement): void {
  overlay.remove();
}

function changeBadge(type: string): string {
  if (type.startsWith('add')) return '<span class="inh-change-badge inh-badge-add">ADD</span>';
  if (type.startsWith('remove')) return '<span class="inh-change-badge inh-badge-remove">REMOVE</span>';
  if (type.startsWith('modify')) return '<span class="inh-change-badge inh-badge-modify">MODIFY</span>';
  return '<span class="inh-change-badge inh-badge-modify">CHANGE</span>';
}

// ============================================================
//  Dialog Implementation
// ============================================================

export class InheritanceDialogsUI implements InheritanceDialogs {
  private _suppressParentWarning = false;

  /** Show warning when editing a parent class */
  showParentEditWarning(parentName: string, childNames: string[]): Promise<boolean> {
    if (this._suppressParentWarning) return Promise.resolve(true);

    return new Promise((resolve) => {
      const overlay = createOverlay();
      const dialog = createDialog(overlay);

      dialog.innerHTML = `
        <h3><span class="inh-icon">⚠️</span> Warning — Parent Class</h3>
        <div class="inh-body">
          You are editing: <strong>${parentName}</strong><br>
          This class has <strong>${childNames.length}</strong> child class${childNames.length !== 1 ? 'es' : ''}:
          <strong>${childNames.join(', ')}</strong><br><br>
          Changes will affect all children unless they have local overrides.
        </div>
        <div class="inh-checkbox">
          <input type="checkbox" id="inh-suppress-check">
          <label for="inh-suppress-check">Don't show again this session</label>
        </div>
        <div class="inh-buttons">
          <button class="inh-cancel">Cancel</button>
          <button class="inh-primary inh-continue">Continue</button>
        </div>
      `;

      dialog.querySelector('.inh-continue')!.addEventListener('click', () => {
        const check = dialog.querySelector('#inh-suppress-check') as HTMLInputElement;
        if (check.checked) this._suppressParentWarning = true;
        closeOverlay(overlay);
        resolve(true);
      });

      dialog.querySelector('.inh-cancel')!.addEventListener('click', () => {
        closeOverlay(overlay);
        resolve(false);
      });
    });
  }

  /** Show propagation summary before saving */
  showPropagationPreview(preview: PropagationPreview): Promise<PropagationDialogResult> {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const dialog = createDialog(overlay);

      const changesHTML = preview.changes.map(c =>
        `<div class="inh-change-item">${changeBadge(c.type)} <span>${c.targetName}</span></div>`
      ).join('');

      const childrenHTML = preview.affectedChildren.map(ch => `
        <div class="inh-child-summary">
          <strong>${ch.childName}</strong> (${ch.changeCount} change${ch.changeCount !== 1 ? 's' : ''})
          ${ch.hasOverrides ? '<span class="inh-change-badge inh-badge-override">HAS OVERRIDES</span>' : ''}
        </div>
      `).join('');

      dialog.innerHTML = `
        <h3><span class="inh-icon">💾</span> Saving ${preview.parentName} — Propagation Preview</h3>
        <div class="inh-body">
          <strong>Detected changes:</strong>
          <div class="inh-changes">${changesHTML || '<em>No structural changes detected</em>'}</div>
          <strong>Affected children:</strong>
          <div class="inh-changes">${childrenHTML || '<em>No children</em>'}</div>
        </div>
        <div class="inh-buttons">
          <button class="inh-cancel">Cancel</button>
          <button class="inh-review">Review Each Child</button>
          <button class="inh-primary inh-save">Save & Propagate</button>
        </div>
      `;

      dialog.querySelector('.inh-save')!.addEventListener('click', () => {
        closeOverlay(overlay);
        resolve('save');
      });
      dialog.querySelector('.inh-review')!.addEventListener('click', () => {
        closeOverlay(overlay);
        resolve('review');
      });
      dialog.querySelector('.inh-cancel')!.addEventListener('click', () => {
        closeOverlay(overlay);
        resolve('cancel');
      });
    });
  }

  /** Show out-of-sync alert */
  showOutOfSyncAlert(childName: string, parentName: string, changes: PropagationChange[]): Promise<OutOfSyncResult> {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const dialog = createDialog(overlay);

      const changesHTML = changes.map(c =>
        `<div class="inh-change-item">${changeBadge(c.type)} ${c.targetName}${
          c.oldValue !== undefined && c.newValue !== undefined ?
            ` (${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)})` : ''
        }</div>`
      ).join('');

      dialog.innerHTML = `
        <h3><span class="inh-icon">⚠️</span> Out of Sync — ${childName}</h3>
        <div class="inh-body">
          Parent (<strong>${parentName}</strong>) was updated while this class was closed.
          <div class="inh-changes">${changesHTML || '<em>Unknown changes</em>'}</div>
        </div>
        <div class="inh-buttons">
          <button class="inh-ignore">Ignore</button>
          <button class="inh-review">Review Changes</button>
          <button class="inh-primary inh-update">Update from Parent</button>
        </div>
      `;

      dialog.querySelector('.inh-update')!.addEventListener('click', () => { closeOverlay(overlay); resolve('update'); });
      dialog.querySelector('.inh-review')!.addEventListener('click', () => { closeOverlay(overlay); resolve('review'); });
      dialog.querySelector('.inh-ignore')!.addEventListener('click', () => { closeOverlay(overlay); resolve('ignore'); });
    });
  }

  /** Show reparent warning */
  showReparentWarning(className: string, oldParentName: string, newParentName: string): Promise<ReparentResult> {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const dialog = createDialog(overlay);

      dialog.innerHTML = `
        <h3><span class="inh-icon">⚠️</span> Change Parent Class — ${className}</h3>
        <div class="inh-body">
          Current parent: <strong>${oldParentName}</strong><br>
          New parent: <strong>${newParentName}</strong><br><br>
          <span style="color:#f87171;">This action may cause data loss:</span>
          <ul style="margin: 6px 0; padding-left: 20px; line-height: 1.8;">
            <li>Components from old parent will be removed</li>
            <li>Variables from old parent will be removed</li>
            <li>Overrides referencing old parent will be lost</li>
            <li>Blueprint connections may break</li>
          </ul>
          A backup will be created automatically before the change.
        </div>
        <div class="inh-buttons">
          <button class="inh-cancel">Cancel</button>
          <button class="inh-danger inh-change">Change Parent</button>
        </div>
      `;

      dialog.querySelector('.inh-change')!.addEventListener('click', () => { closeOverlay(overlay); resolve('change'); });
      dialog.querySelector('.inh-cancel')!.addEventListener('click', () => { closeOverlay(overlay); resolve('cancel'); });
    });
  }
}

// ============================================================
//  Class Info Bar Component
// ============================================================

export interface ClassInfoBarOptions {
  className: string;
  classId: string;
  kind: 'actor' | 'widget';
  parentName: string | null;
  parentId: string | null;
  childCount: number;
  isOutOfSync: boolean;
  onOpenParent?: () => void;
  onShowInHierarchy?: () => void;
}

export function createClassInfoBar(container: HTMLElement, options: ClassInfoBarOptions): HTMLElement {
  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'class-info-bar';

  const nameEl = document.createElement('span');
  nameEl.className = 'cib-name';
  nameEl.textContent = options.className;
  bar.appendChild(nameEl);

  // Divider
  bar.appendChild(Object.assign(document.createElement('span'), { textContent: '|', style: 'color:#555' }));

  // Parent
  if (options.parentId && options.parentName) {
    const parentLabel = document.createElement('span');
    parentLabel.innerHTML = `Parent: <span class="cib-parent">🔗 ${options.parentName}</span>`;
    parentLabel.querySelector('.cib-parent')?.addEventListener('click', () => {
      options.onOpenParent?.();
    });
    bar.appendChild(parentLabel);
  } else {
    const noParent = document.createElement('span');
    noParent.textContent = 'Parent: None (root class)';
    noParent.style.color = '#666';
    bar.appendChild(noParent);
  }

  // Divider
  bar.appendChild(Object.assign(document.createElement('span'), { textContent: '|', style: 'color:#555' }));

  // Children count
  if (options.childCount > 0) {
    const childEl = document.createElement('span');
    childEl.className = 'cib-children';
    childEl.textContent = `Children: ${options.childCount}`;
    bar.appendChild(childEl);

    bar.appendChild(Object.assign(document.createElement('span'), { textContent: '|', style: 'color:#555' }));

    const warningEl = document.createElement('span');
    warningEl.className = 'cib-warning';
    warningEl.textContent = '⚠️ Changes affect all children';
    bar.appendChild(warningEl);
  } else {
    const childEl = document.createElement('span');
    childEl.textContent = 'Children: 0';
    childEl.style.color = '#666';
    bar.appendChild(childEl);
  }

  // Out of sync indicator
  if (options.isOutOfSync) {
    bar.appendChild(Object.assign(document.createElement('span'), { textContent: '|', style: 'color:#555' }));
    const syncEl = document.createElement('span');
    syncEl.style.color = '#f87171';
    syncEl.textContent = '⚠️ Out of sync with parent';
    bar.appendChild(syncEl);
  }

  // Open Parent button (for child classes)
  if (options.parentId && options.onOpenParent) {
    const btn = document.createElement('button');
    btn.className = 'cib-btn';
    btn.textContent = '📂 Open Parent';
    btn.addEventListener('click', () => options.onOpenParent?.());
    bar.appendChild(btn);
  }

  // Show in Hierarchy button
  if (options.onShowInHierarchy) {
    const btn = document.createElement('button');
    btn.className = 'cib-btn';
    btn.textContent = '🌳 Hierarchy';
    btn.addEventListener('click', () => options.onShowInHierarchy?.());
    bar.appendChild(btn);
  }

  container.prepend(bar);
  return bar;
}

// ============================================================
//  Inheritance Badge Helpers — used by editor panels
// ============================================================

export function inheritanceBadgeHTML(isInherited: boolean, isOverridden: boolean, isAddedInChild: boolean): string {
  if (isAddedInChild) {
    return '<span class="inh-badge inh-badge-child-added">➕ Added in child</span>';
  }
  if (isInherited && isOverridden) {
    return '<span class="inh-badge inh-badge-overridden">🔗✏️ Overridden</span>';
  }
  if (isInherited) {
    return '<span class="inh-badge inh-badge-inherited">🔗 Inherited</span>';
  }
  return '';
}

export function resetToParentButton(label: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'inh-reset-btn';
  btn.textContent = `↩ Reset to Parent${label ? ': ' + label : ''}`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// ============================================================
//  Parent Class Selector (for Create dialogs)
// ============================================================

export interface ParentSelectorOptions {
  kind: 'actor' | 'widget';
  availableParents: Array<{ id: string; name: string }>;
  onSelect: (parentId: string | null) => void;
  selectedParentId?: string | null;
}

export function createParentSelector(container: HTMLElement, options: ParentSelectorOptions): HTMLElement {
  injectStyles();

  const wrapper = document.createElement('div');
  wrapper.className = 'inh-parent-selector';

  const label = document.createElement('label');
  label.textContent = 'Parent Class:';
  wrapper.appendChild(label);

  const select = document.createElement('select');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '[ None ]';
  select.appendChild(noneOpt);

  for (const p of options.availableParents) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (options.selectedParentId === p.id) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    options.onSelect(select.value || null);
  });

  wrapper.appendChild(select);
  container.appendChild(wrapper);
  return wrapper;
}
