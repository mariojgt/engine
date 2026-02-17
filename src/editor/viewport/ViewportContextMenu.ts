/**
 * Right-click context menu for the 3D viewport — UE-style.
 *
 * Shows context-sensitive options depending on whether an object is clicked or empty space.
 */

export interface ContextMenuAction {
  label: string;
  shortcut?: string;
  icon?: string;
  submenu?: ContextMenuAction[];
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

export class ViewportContextMenu {
  private _menuEl: HTMLDivElement;
  private _subMenuEl: HTMLDivElement | null = null;
  private _visible = false;
  private _boundClose: (e: MouseEvent) => void;

  constructor() {
    this._menuEl = document.createElement('div');
    this._menuEl.className = 'vp-context-menu';
    this._menuEl.style.display = 'none';
    document.body.appendChild(this._menuEl);

    this._boundClose = (e: MouseEvent) => {
      if (!this._menuEl.contains(e.target as Node) && !(this._subMenuEl?.contains(e.target as Node))) {
        this.hide();
      }
    };
  }

  show(x: number, y: number, items: ContextMenuAction[]): void {
    this.hide();

    this._menuEl.innerHTML = '';
    this._buildMenu(this._menuEl, items);

    // Position
    this._menuEl.style.left = `${x}px`;
    this._menuEl.style.top = `${y}px`;
    this._menuEl.style.display = 'block';

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = this._menuEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this._menuEl.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this._menuEl.style.top = `${y - rect.height}px`;
      }
    });

    this._visible = true;

    // Close on click elsewhere
    setTimeout(() => {
      document.addEventListener('mousedown', this._boundClose);
    }, 10);
  }

  hide(): void {
    this._menuEl.style.display = 'none';
    this._menuEl.innerHTML = '';
    this._visible = false;
    this._closeSubMenu();
    document.removeEventListener('mousedown', this._boundClose);
  }

  get visible() {
    return this._visible;
  }

  dispose(): void {
    this.hide();
    if (this._menuEl.parentElement) this._menuEl.parentElement.removeChild(this._menuEl);
  }

  /* -------- private -------- */

  private _buildMenu(container: HTMLElement, items: ContextMenuAction[]): void {
    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'vp-ctx-separator';
        container.appendChild(sep);
        return;
      }

      const row = document.createElement('div');
      row.className = 'vp-ctx-item';
      if (item.disabled) row.classList.add('vp-ctx-disabled');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'vp-ctx-label';
      labelSpan.textContent = item.label;
      row.appendChild(labelSpan);

      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'vp-ctx-shortcut';
        shortcutSpan.textContent = item.shortcut;
        row.appendChild(shortcutSpan);
      }

      if (item.submenu && item.submenu.length > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'vp-ctx-arrow';
        arrow.textContent = '▸';
        row.appendChild(arrow);

        row.addEventListener('mouseenter', () => {
          this._showSubMenu(row, item.submenu!);
        });
        row.addEventListener('mouseleave', (e) => {
          // Only close if mouse isn't entering submenu
          const related = e.relatedTarget as Node;
          if (!this._subMenuEl?.contains(related)) {
            this._closeSubMenu();
          }
        });
      } else {
        row.addEventListener('click', () => {
          if (!item.disabled && item.action) {
            item.action();
            this.hide();
          }
        });
      }

      container.appendChild(row);
    });
  }

  private _showSubMenu(parentRow: HTMLElement, items: ContextMenuAction[]): void {
    this._closeSubMenu();

    const sub = document.createElement('div');
    sub.className = 'vp-context-menu vp-context-submenu';
    this._buildMenu(sub, items);

    const parentRect = parentRow.getBoundingClientRect();
    sub.style.left = `${parentRect.right}px`;
    sub.style.top = `${parentRect.top}px`;
    sub.style.display = 'block';

    sub.addEventListener('mouseleave', () => {
      this._closeSubMenu();
    });

    document.body.appendChild(sub);
    this._subMenuEl = sub;

    // Clamp
    requestAnimationFrame(() => {
      const rect = sub.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        sub.style.left = `${parentRect.left - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        sub.style.top = `${parentRect.bottom - rect.height}px`;
      }
    });
  }

  private _closeSubMenu(): void {
    if (this._subMenuEl) {
      if (this._subMenuEl.parentElement) this._subMenuEl.parentElement.removeChild(this._subMenuEl);
      this._subMenuEl = null;
    }
  }
}

/**
 * Build the standard context menu items for a viewport right-click.
 */
export function buildViewportContextMenuItems(options: {
  hasSelection: boolean;
  selectionCount: number;
  isGroup: boolean;
  onResetLocation: () => void;
  onResetRotation: () => void;
  onResetScale: () => void;
  onResetAll: () => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onDeselectAll: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onHide: () => void;
  onShowAll: () => void;
  onHideUnselected: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFocus: () => void;
}): ContextMenuAction[] {
  const items: ContextMenuAction[] = [];

  if (options.hasSelection) {
    items.push({
      label: 'Transform',
      submenu: [
        { label: 'Reset Location', action: options.onResetLocation },
        { label: 'Reset Rotation', action: options.onResetRotation },
        { label: 'Reset Scale', action: options.onResetScale },
        { separator: true, label: '' },
        { label: 'Reset All Transforms', action: options.onResetAll },
      ],
    });

    items.push({
      label: 'Focus on Selection',
      shortcut: 'F',
      action: options.onFocus,
    });

    items.push({ separator: true, label: '' });
  }

  items.push({
    label: 'Select',
    submenu: [
      { label: 'Select All', shortcut: 'Ctrl+A', action: options.onSelectAll },
      { label: 'Deselect All', shortcut: 'Esc', action: options.onDeselectAll },
      { label: 'Invert Selection', shortcut: 'Ctrl+Shift+I', action: options.onInvertSelection },
    ],
  });

  if (options.hasSelection) {
    items.push({ separator: true, label: '' });

    if (options.selectionCount >= 2 && !options.isGroup) {
      items.push({
        label: 'Group',
        submenu: [
          { label: 'Group Selected', shortcut: 'Ctrl+G', action: options.onGroup },
        ],
      });
    }

    if (options.isGroup) {
      items.push({
        label: 'Ungroup',
        shortcut: 'Ctrl+Shift+G',
        action: options.onUngroup,
      });
    }

    items.push({
      label: 'Visibility',
      submenu: [
        { label: 'Hide Selected', shortcut: 'H', action: options.onHide },
        { label: 'Show All', shortcut: 'Ctrl+H', action: options.onShowAll },
        { label: 'Hide Unselected', action: options.onHideUnselected },
      ],
    });

    items.push({ separator: true, label: '' });

    items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: options.onCut });
    items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: options.onCopy });
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: options.onPaste });
    items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', action: options.onDuplicate });

    items.push({ separator: true, label: '' });

    items.push({ label: 'Delete', shortcut: 'Del', action: options.onDelete });
  } else {
    items.push({ separator: true, label: '' });
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: options.onPaste });
  }

  return items;
}
