// ============================================================
//  DataTableEditorPanel — UE-style spreadsheet editor
//  Shows all rows of a DataTableAsset as an editable grid.
//  Columns are derived from the linked StructureAsset.
//  Supports: add/duplicate/delete rows, inline rename, column sort,
//  real-time search, row detail panel, CSV import/export.
// ============================================================

import { DataTableAsset, type DataTableRow } from './DataTableAsset';
import { DataTableAssetManager }              from './DataTableAsset';
import { StructureAssetManager, type StructureAsset, type StructureFieldDef } from './StructureAsset';
import { iconHTML, Icons, ICON_COLORS } from './icons';
import type { VarType } from './BlueprintData';

// ── Helpers ──────────────────────────────────────────────────

function _esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _formatCellValue(val: any, type: VarType): string {
  if (val === null || val === undefined) return '';
  if (type === 'Boolean') return val ? '✓' : '✗';
  if (type === 'Vector3' && typeof val === 'object') {
    return `(${(val.x ?? 0).toFixed(2)}, ${(val.y ?? 0).toFixed(2)}, ${(val.z ?? 0).toFixed(2)})`;
  }
  if (typeof val === 'number') return val.toFixed(val % 1 === 0 ? 0 : 3);
  return String(val);
}

function _relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return Math.floor(diff / 86_400_000) + 'd ago';
}

/** Build a button with a proper SVG icon child node — never stringified. */
function _mkBtn(
  iconData: any[], iconSize: number, iconColor: string,
  label: string, action: () => void, danger = false,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = [
    'display:inline-flex', 'align-items:center', 'gap:5px',
    'padding:4px 9px', 'font-size:12px', 'border-radius:4px',
    'border:1px solid var(--border,#3f3f5a)',
    `background:${danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-panel,#1e1e2e)'}`,
    `color:${danger ? '#f87171' : 'var(--color-text,#e2e8f0)'}`,
    'cursor:pointer', 'white-space:nowrap', 'flex-shrink:0', 'font-family:inherit',
  ].join(';');
  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;';
  iconSpan.innerHTML = iconHTML(iconData, iconSize, iconColor);
  btn.appendChild(iconSpan);
  if (label) {
    const txt = document.createElement('span');
    txt.textContent = label;
    btn.appendChild(txt);
  }
  btn.addEventListener('click', action);
  btn.addEventListener('mouseenter', () => {
    btn.style.borderColor = danger ? 'rgba(239,68,68,0.5)' : 'var(--border-hover,#6366f1)';
    btn.style.background  = danger ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.08)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.borderColor = 'var(--border,#3f3f5a)';
    btn.style.background  = danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-panel,#1e1e2e)';
  });
  return btn;
}

function _toolbarSep(): HTMLElement {
  const s = document.createElement('div');
  s.style.cssText = 'width:1px;height:20px;background:var(--border,#3f3f5a);flex-shrink:0;margin:0 2px;';
  return s;
}

/** Per-type colour used in column headers and detail panel. */
const TYPE_COLORS: Record<string, string> = {
  String: '#60a5fa', Name: '#60a5fa', Text: '#60a5fa',
  Float: '#34d399', Integer: '#34d399',
  Boolean: '#f59e0b',
  Vector3: '#f472b6', Vector2: '#f472b6',
  Object: '#a78bfa', Actor: '#a78bfa',
};
function _typeColor(t: string): string {
  if (t?.startsWith('Enum:')) return '#fb923c';
  return TYPE_COLORS[t] ?? '#94a3b8';
}

// ============================================================

export class DataTableEditorPanel {
  public container: HTMLElement;

  private _asset: DataTableAsset;
  private _dtManager: DataTableAssetManager;
  private _structManager: StructureAssetManager;
  private _onChanged: (() => void) | undefined;
  private _onOpenStruct: ((structId: string) => void) | undefined;

  // UI refs
  private _gridWrap!: HTMLElement;
  private _detailPanel!: HTMLElement;
  private _searchInput!: HTMLInputElement;
  private _statusEl!: HTMLElement;

  // State
  private _selectedRowName: string | null = null;
  private _searchQuery = '';
  private _sortCol: string | null = null;
  private _sortAsc = true;
  private _confirmPopup: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    asset: DataTableAsset,
    dtManager: DataTableAssetManager,
    structManager: StructureAssetManager,
    onChanged?: () => void,
    onOpenStruct?: (structId: string) => void,
  ) {
    this.container = container;
    this._asset = asset;
    this._dtManager = dtManager;
    this._structManager = structManager;
    this._onChanged = onChanged;
    this._onOpenStruct = onOpenStruct;

    this._build();

    // Re-render when the linked struct changes (columns may change)
    this._structManager.onChanged(() => this._refreshAll());
  }

  // ── Public ─────────────────────────────────────────────────

  public refresh(): void { this._refreshAll(); }

  // ── Emit ───────────────────────────────────────────────────

  private _emit(): void {
    this._dtManager.notifyTableChanged(this._asset.id);
    this._onChanged?.();
  }

  // ── Struct ─────────────────────────────────────────────────

  private _struct(): StructureAsset | undefined {
    return this._structManager.getStructure(this._asset.structId);
  }

  private _fields(): StructureFieldDef[] {
    return this._struct()?.fields ?? [];
  }

  // ── Build ──────────────────────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = [
      'display:flex', 'flex-direction:column', 'height:100%',
      'overflow:hidden', 'background:var(--bg-editor,#13131f)',
      'color:var(--color-text,#e2e8f0)', 'font-family:inherit',
    ].join(';');

    this.container.appendChild(this._buildHeader());
    this.container.appendChild(this._buildToolbar());

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;display:flex;overflow:hidden;min-height:0;';

    this._gridWrap = document.createElement('div');
    this._gridWrap.style.cssText = 'flex:1;overflow:auto;min-width:0;';
    body.appendChild(this._gridWrap);

    this._detailPanel = document.createElement('div');
    this._detailPanel.style.cssText = [
      'width:290px', 'min-width:250px', 'flex-shrink:0',
      'border-left:1px solid var(--border,#2a2a3e)',
      'overflow-y:auto', 'background:var(--bg-panel,#1a1a2e)',
    ].join(';');
    body.appendChild(this._detailPanel);

    this.container.appendChild(body);

    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = [
      'padding:3px 14px', 'font-size:11px',
      'color:var(--color-text-muted,#64748b)',
      'border-top:1px solid var(--border,#2a2a3e)',
      'flex-shrink:0', 'background:var(--bg-panel,#1a1a2e)',
      'display:flex', 'align-items:center', 'gap:8px',
    ].join(';');
    this.container.appendChild(this._statusEl);

    this._refreshAll();
  }

  private _buildHeader(): HTMLElement {
    const hdr = document.createElement('div');
    hdr.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:7px 14px', 'border-bottom:2px solid #14b8a6',
      'background:var(--bg-panel,#1a1a2e)', 'flex-shrink:0',
    ].join(';');

    const iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'display:inline-flex;align-items:center;';
    iconWrap.innerHTML = iconHTML(Icons.Table2, 16, '#14b8a6');
    hdr.appendChild(iconWrap);

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#f1f5f9;';
    titleEl.textContent = this._asset.name.toUpperCase();
    hdr.appendChild(titleEl);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    hdr.appendChild(spacer);

    // Row Struct pill
    const structPill = document.createElement('div');
    structPill.style.cssText = [
      'display:flex', 'align-items:center', 'gap:5px',
      'padding:3px 10px', 'border-radius:20px',
      'border:1px solid rgba(167,139,250,0.35)',
      'background:rgba(167,139,250,0.1)', 'font-size:11px',
    ].join(';');
    const structLabelEl = document.createElement('span');
    structLabelEl.style.cssText = 'color:var(--color-text-muted,#64748b);';
    structLabelEl.textContent = 'ROW STRUCT:';
    structPill.appendChild(structLabelEl);
    const structLink = document.createElement('span');
    structLink.style.cssText = 'color:#a78bfa;cursor:pointer;font-weight:600;';
    structLink.textContent = this._asset.structName.toUpperCase();
    structLink.title = 'Double-click to open struct editor';
    structLink.addEventListener('dblclick', () => this._onOpenStruct?.(this._asset.structId));
    structPill.appendChild(structLink);
    hdr.appendChild(structPill);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.style.cssText = [
      'margin-left:8px', 'padding:4px 14px', 'border-radius:4px',
      'border:none', 'background:#14b8a6', 'color:#fff',
      'font-size:12px', 'font-weight:600', 'cursor:pointer', 'font-family:inherit',
    ].join(';');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('mouseenter', () => { saveBtn.style.background = '#0d9488'; });
    saveBtn.addEventListener('mouseleave', () => { saveBtn.style.background = '#14b8a6'; });
    saveBtn.addEventListener('click', () => this._emit());
    hdr.appendChild(saveBtn);

    return hdr;
  }

  private _buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = [
      'display:flex', 'align-items:center', 'gap:5px',
      'padding:5px 14px', 'border-bottom:1px solid var(--border,#2a2a3e)',
      'background:var(--bg-panel,#1a1a2e)',
      'flex-shrink:0', 'overflow-x:auto', 'overflow-y:hidden',
    ].join(';');

    bar.appendChild(_mkBtn(Icons.Plus,   13, '#4ade80', 'Add Row',    () => this._addRow()));
    bar.appendChild(_mkBtn(Icons.Copy,   13, '#94a3b8', 'Duplicate',  () => this._duplicateRow()));
    bar.appendChild(_mkBtn(Icons.Trash2, 13, '#f87171', 'Delete Row', () => this._promptDeleteRow(), true));
    bar.appendChild(_toolbarSep());

    // Search box
    const searchBox = document.createElement('div');
    searchBox.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:4px',
      'padding:3px 8px', 'border-radius:4px',
      'border:1px solid var(--border,#3f3f5a)',
      'background:var(--bg-input,#0f0f1a)', 'flex-shrink:0',
    ].join(';');
    const searchIconEl = document.createElement('span');
    searchIconEl.style.cssText = 'display:inline-flex;align-items:center;opacity:0.5;';
    searchIconEl.innerHTML = iconHTML(Icons.Search, 12, '#94a3b8');
    searchBox.appendChild(searchIconEl);
    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Search rows\u2026';
    this._searchInput.style.cssText = [
      'background:none', 'border:none', 'outline:none',
      'font-size:12px', 'color:var(--color-text,#e2e8f0)',
      'width:150px', 'font-family:inherit',
    ].join(';');
    this._searchInput.addEventListener('input', () => {
      this._searchQuery = this._searchInput.value;
      this._refreshGrid();
    });
    searchBox.appendChild(this._searchInput);
    bar.appendChild(searchBox);

    bar.appendChild(_toolbarSep());
    bar.appendChild(_mkBtn(Icons.Upload,   13, '#94a3b8', 'Import CSV', () => this._importCSV()));
    bar.appendChild(_mkBtn(Icons.Download, 13, '#94a3b8', 'Export CSV', () => this._exportCSV()));

    return bar;
  }

  // ── Refresh All ────────────────────────────────────────────

  private _refreshAll(): void {
    this._refreshGrid();
    this._refreshDetailPanel();
    this._refreshStatus();
  }

  // ── Grid ───────────────────────────────────────────────────

  private _refreshGrid(): void {
    this._gridWrap.innerHTML = '';
    const fields = this._fields();

    if (fields.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:40px;text-align:center;color:var(--color-text-muted,#64748b);font-size:13px;line-height:1.8;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:8px;opacity:0.5;';
      iconWrap.innerHTML = iconHTML(Icons.AlertCircle, 28, '#f59e0b');
      empty.appendChild(iconWrap);
      const msg = document.createElement('div');
      msg.innerHTML = "This DataTable\u2019s struct has no fields.<br><span style=\"font-size:11px\">Open the struct editor to add fields.</span>";
      empty.appendChild(msg);
      this._gridWrap.appendChild(empty);
      this._refreshStatus();
      return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;';
    this._gridWrap.appendChild(table);

    // ── Header ──
    const thead = document.createElement('thead');
    const hrow  = document.createElement('tr');
    hrow.style.cssText = [
      'position:sticky', 'top:0', 'z-index:10',
      'background:var(--bg-panel,#1a1a2e)',
      'border-bottom:2px solid var(--border,#2a2a3e)',
    ].join(';');
    hrow.appendChild(this._makeTH('Row Name', '_rowName', undefined));
    for (const f of fields) hrow.appendChild(this._makeTH(f.name, f.name, f.type));
    thead.appendChild(hrow);
    table.appendChild(thead);

    // ── Body ──
    const tbody = document.createElement('tbody');
    let rows = this._asset.getAllRows();

    if (this._searchQuery.trim()) {
      const q = this._searchQuery.toLowerCase();
      rows = rows.filter(r => {
        if (r.rowName.toLowerCase().includes(q)) return true;
        return Object.values(r.data).some(v => String(v ?? '').toLowerCase().includes(q));
      });
    }

    if (this._sortCol) {
      const col = this._sortCol;
      const asc = this._sortAsc;
      rows = [...rows].sort((a, b) => {
        const va = col === '_rowName' ? a.rowName : String(a.data[col] ?? '');
        const vb = col === '_rowName' ? b.rowName : String(b.data[col] ?? '');
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 1 + fields.length;
      td.style.cssText = 'padding:36px;text-align:center;color:var(--color-text-muted,#64748b);font-size:13px;';
      td.textContent = this._searchQuery ? 'No rows match your search.' : 'No rows yet. Click + Add Row.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach((row, i) => tbody.appendChild(this._makeTableRow(row, fields, i)));
    }

    table.appendChild(tbody);
    this._refreshStatus();
  }

  private _makeTH(label: string, colKey: string, type?: string): HTMLElement {
    const th = document.createElement('th');
    const isSorted = this._sortCol === colKey;
    th.style.cssText = [
      'padding:6px 12px', 'text-align:left',
      'border-right:1px solid var(--border,#2a2a3e)',
      'cursor:pointer', 'user-select:none', 'white-space:nowrap',
      'font-size:11px', 'font-weight:600', 'letter-spacing:0.04em',
      `color:${isSorted ? '#e2e8f0' : 'var(--color-text-muted,#64748b)'}`,
    ].join(';');
    const inner = document.createElement('div');
    inner.style.cssText = 'display:inline-flex;align-items:center;gap:5px;';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    inner.appendChild(labelSpan);
    if (type) {
      const badge = document.createElement('span');
      badge.style.cssText = `color:${_typeColor(type)};font-size:10px;font-weight:400;opacity:0.8;`;
      badge.textContent = type.startsWith('Enum:') ? 'Enum' : type;
      inner.appendChild(badge);
    }
    if (isSorted) {
      const arrow = document.createElement('span');
      arrow.style.cssText = 'color:#6366f1;font-size:10px;';
      arrow.textContent = this._sortAsc ? '\u2191' : '\u2193';
      inner.appendChild(arrow);
    }
    th.appendChild(inner);
    th.title = `Sort by ${label}`;
    th.addEventListener('click', () => {
      if (this._sortCol === colKey) this._sortAsc = !this._sortAsc;
      else { this._sortCol = colKey; this._sortAsc = true; }
      this._refreshGrid();
    });
    return th;
  }

  private _makeTableRow(row: DataTableRow, fields: StructureFieldDef[], idx: number): HTMLElement {
    const tr = document.createElement('tr');
    const isSelected = row.rowName === this._selectedRowName;
    const baseEven = 'transparent';
    const baseOdd  = 'rgba(255,255,255,0.015)';

    tr.style.cssText = [
      `background:${isSelected ? 'rgba(99,102,241,0.18)' : (idx % 2 === 1 ? baseOdd : baseEven)}`,
      'cursor:pointer',
      `border-left:${isSelected ? '2px solid #6366f1' : '2px solid transparent'}`,
    ].join(';');

    tr.addEventListener('mouseenter', () => {
      if (!isSelected) tr.style.background = 'rgba(99,102,241,0.06)';
    });
    tr.addEventListener('mouseleave', () => {
      if (!isSelected) tr.style.background = idx % 2 === 1 ? baseOdd : baseEven;
    });
    tr.addEventListener('click', () => {
      this._selectedRowName = row.rowName;
      this._refreshGrid();
      this._refreshDetailPanel();
    });

    // Row Name cell
    const tdName = document.createElement('td');
    tdName.style.cssText = [
      'padding:5px 12px', 'font-weight:600',
      'border-right:1px solid var(--border,#2a2a3e)',
      'border-bottom:1px solid rgba(255,255,255,0.04)',
      'white-space:nowrap', 'color:#e2e8f0',
    ].join(';');
    if (isSelected) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = row.rowName;
      inp.style.cssText = 'background:transparent;border:none;outline:none;font-size:12px;font-weight:600;color:#e2e8f0;width:100%;font-family:inherit;';
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => {
        const newName = inp.value.trim();
        if (!newName || newName === row.rowName) return;
        if (this._asset.hasRow(newName)) { inp.value = row.rowName; return; }
        this._asset.renameRow(row.rowName, newName);
        this._selectedRowName = newName;
        this._emit();
        this._refreshAll();
      });
      tdName.appendChild(inp);
      setTimeout(() => inp.focus(), 10);
    } else {
      tdName.textContent = row.rowName;
    }
    tr.appendChild(tdName);

    // Field cells
    for (const f of fields) {
      const td = document.createElement('td');
      td.style.cssText = [
        'padding:5px 12px', 'white-space:nowrap',
        'overflow:hidden', 'text-overflow:ellipsis', 'max-width:180px',
        'border-right:1px solid var(--border,#2a2a3e)',
        'border-bottom:1px solid rgba(255,255,255,0.04)',
        'color:var(--color-text-muted,#94a3b8)',
      ].join(';');
      td.textContent = _formatCellValue(row.data[f.name], f.type);
      tr.appendChild(td);
    }

    return tr;
  }

  // ── Detail Panel ───────────────────────────────────────────

  private _refreshDetailPanel(): void {
    this._detailPanel.innerHTML = '';

    if (!this._selectedRowName) {
      const hint = document.createElement('div');
      hint.style.cssText = 'padding:32px 16px;text-align:center;color:var(--color-text-muted,#64748b);font-size:12px;line-height:1.8;';
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:8px;opacity:0.4;';
      iconWrap.innerHTML = iconHTML(Icons.MousePointerClick, 24, '#64748b');
      hint.appendChild(iconWrap);
      const txt = document.createElement('div');
      txt.textContent = 'Click a row to edit';
      hint.appendChild(txt);
      this._detailPanel.appendChild(hint);
      return;
    }

    const row = this._asset.getRow(this._selectedRowName);
    if (!row) { this._selectedRowName = null; return; }
    const fields = this._fields();

    // ─ Panel header ─
    const dpHdr = document.createElement('div');
    dpHdr.style.cssText = [
      'padding:10px 14px 8px',
      'border-bottom:1px solid var(--border,#2a2a3e)',
      'display:flex', 'align-items:center', 'gap:6px',
    ].join(';');
    const dpIconWrap = document.createElement('span');
    dpIconWrap.style.cssText = 'display:inline-flex;align-items:center;';
    dpIconWrap.innerHTML = iconHTML(Icons.Table2, 13, '#14b8a6');
    dpHdr.appendChild(dpIconWrap);
    const dpTitle = document.createElement('span');
    dpTitle.style.cssText = 'font-size:12px;font-weight:700;color:#e2e8f0;';
    dpTitle.textContent = row.rowName;
    dpHdr.appendChild(dpTitle);
    this._detailPanel.appendChild(dpHdr);

    // ─ Section label ─
    const sec = document.createElement('div');
    sec.style.cssText = [
      'padding:6px 14px 2px',
      'font-size:10px', 'font-weight:700',
      'letter-spacing:0.08em', 'text-transform:uppercase',
      'color:var(--color-text-muted,#64748b)',
      'border-bottom:1px solid var(--border,#2a2a3e)',
    ].join(';');
    sec.textContent = 'Row Properties';
    this._detailPanel.appendChild(sec);

    const dp = document.createElement('div');
    dp.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px;';

    // Row Name field
    dp.appendChild(this._makeDetailField('Row Name', row.rowName, null, true, (val) => {
      if (!val || val === row.rowName) return;
      if (this._asset.hasRow(val)) return;
      this._asset.renameRow(row.rowName, val);
      this._selectedRowName = val;
      this._emit();
      this._refreshAll();
    }));

    const divider = document.createElement('div');
    divider.style.cssText = 'border-top:1px solid var(--border,#2a2a3e);margin:2px 0;';
    dp.appendChild(divider);

    for (const f of fields) {
      dp.appendChild(this._makeDetailField(f.name, row.data[f.name], f.type, false, (val) => {
        row.data[f.name] = val;
        this._asset.touch();
        this._emit();
        this._refreshGrid();
      }));
    }

    this._detailPanel.appendChild(dp);

    // ─ Actions ─
    const actSep = document.createElement('div');
    actSep.style.cssText = 'border-top:1px solid var(--border,#2a2a3e);';
    this._detailPanel.appendChild(actSep);

    const actions = document.createElement('div');
    actions.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:5px;';

    const dupBtn = _mkBtn(Icons.Copy, 12, '#94a3b8', 'Duplicate Row', () => {
      const dup = this._asset.duplicateRow(row.rowName);
      if (dup) { this._selectedRowName = dup.rowName; this._emit(); this._refreshAll(); }
    });
    dupBtn.style.width = '100%';
    dupBtn.style.justifyContent = 'center';
    actions.appendChild(dupBtn);

    const delBtn = _mkBtn(Icons.Trash2, 12, '#f87171', 'Delete Row', () => this._promptDeleteRow(), true);
    delBtn.style.width = '100%';
    delBtn.style.justifyContent = 'center';
    actions.appendChild(delBtn);

    this._detailPanel.appendChild(actions);
  }

  private _makeDetailField(
    label: string,
    value: any,
    type: VarType | null,
    isName: boolean,
    onChange: (v: any) => void,
  ): HTMLElement {
    const wrap = document.createElement('div');

    const lblRow = document.createElement('div');
    lblRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted,#64748b);';
    lbl.textContent = label;
    lblRow.appendChild(lbl);
    if (type) {
      const typeBadge = document.createElement('span');
      typeBadge.style.cssText = `font-size:9px;color:${_typeColor(type)};font-weight:500;`;
      typeBadge.textContent = type.startsWith('Enum:') ? 'Enum' : type;
      lblRow.appendChild(typeBadge);
    }
    wrap.appendChild(lblRow);
    wrap.appendChild(this._makeFieldInput(value, type, isName, onChange));
    return wrap;
  }

  private _makeFieldInput(
    value: any,
    type: VarType | null,
    isName: boolean,
    onChange: (v: any) => void,
  ): HTMLElement {
    const base = [
      'width:100%', 'box-sizing:border-box',
      'background:var(--bg-input,#0f0f1a)',
      'border:1px solid var(--border,#3f3f5a)',
      'border-radius:4px', 'padding:5px 8px',
      'font-size:12px', 'color:var(--color-text,#e2e8f0)',
      'outline:none', 'font-family:inherit',
    ].join(';');

    if (type === 'Boolean') {
      const sel = document.createElement('select');
      sel.style.cssText = base + ';cursor:pointer;';
      const optF = document.createElement('option');
      optF.value = 'false'; optF.textContent = 'False'; if (!value) optF.selected = true;
      const optT = document.createElement('option');
      optT.value = 'true';  optT.textContent = 'True';  if (value)  optT.selected = true;
      sel.append(optF, optT);
      sel.addEventListener('change', () => onChange(sel.value === 'true'));
      return sel;
    }

    if (type === 'Float') {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.01';
      inp.style.cssText = base;
      inp.value = String(value ?? 0);
      inp.addEventListener('change', () => onChange(parseFloat(inp.value) || 0));
      return inp;
    }

    if (type === 'Vector3') {
      const v = value ?? { x: 0, y: 0, z: 0 };
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:flex;gap:4px;';
      for (const axis of ['x', 'y', 'z'] as const) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;position:relative;';
        const axisLabel = document.createElement('span');
        axisLabel.style.cssText = `position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:700;color:${axis === 'x' ? '#f87171' : axis === 'y' ? '#4ade80' : '#60a5fa'};pointer-events:none;`;
        axisLabel.textContent = axis.toUpperCase();
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = '0.1';
        inp.style.cssText = base + ';padding-left:18px;';
        inp.value = String(v[axis] ?? 0);
        inp.addEventListener('change', () => {
          if (!value || typeof value !== 'object') (value as any) = { x: 0, y: 0, z: 0 };
          value[axis] = parseFloat(inp.value) || 0;
          onChange(value);
        });
        wrap.appendChild(axisLabel);
        wrap.appendChild(inp);
        rowEl.appendChild(wrap);
      }
      return rowEl;
    }

    if (type?.startsWith('Enum:')) {
      const enumId = type.slice(5);
      const ea = this._structManager.getEnum(enumId);
      const sel = document.createElement('select');
      sel.style.cssText = base + ';cursor:pointer;';
      if (ea) {
        for (const ev of ea.values) {
          const opt = document.createElement('option');
          opt.value = ev.name;
          opt.textContent = ev.displayName;
          if (value === ev.name) opt.selected = true;
          sel.appendChild(opt);
        }
      }
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    }

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.style.cssText = base;
    inp.value = value !== null && value !== undefined ? String(value) : '';
    if (isName) inp.placeholder = 'Unique row key';
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', () => onChange(inp.value));
    return inp;
  }

  // ── Status Bar ─────────────────────────────────────────────

  private _refreshStatus(): void {
    this._statusEl.innerHTML = '';
    const total  = this._asset.getRowCount();
    const fields = this._struct()?.fields.length ?? 0;

    const dot = (color: string): HTMLElement => {
      const d = document.createElement('span');
      d.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;`;
      return d;
    };
    const txt = (s: string): HTMLElement => {
      const sp = document.createElement('span');
      sp.textContent = s;
      return sp;
    };
    const midDot = (): HTMLElement => {
      const s = document.createElement('span');
      s.textContent = '\u00b7';
      s.style.color = 'var(--border,#3f3f5a)';
      return s;
    };

    this._statusEl.appendChild(dot('#14b8a6'));
    this._statusEl.appendChild(txt(`${total} row${total !== 1 ? 's' : ''}`));
    this._statusEl.appendChild(midDot());
    this._statusEl.appendChild(dot('#6366f1'));
    this._statusEl.appendChild(txt(`${fields} field${fields !== 1 ? 's' : ''}`));

    if (this._selectedRowName) {
      this._statusEl.appendChild(midDot());
      this._statusEl.appendChild(dot('#f59e0b'));
      this._statusEl.appendChild(txt(`Selected: ${this._selectedRowName}`));
    }

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this._statusEl.appendChild(spacer);

    const time = document.createElement('span');
    time.style.opacity = '0.45';
    time.textContent = `Edited ${_relTime(this._asset.modifiedAt)}`;
    this._statusEl.appendChild(time);
  }

  // ── Row Actions ────────────────────────────────────────────

  private _addRow(): void {
    const struct = this._struct();
    const base = 'NewRow';
    let name = base;
    let n = 1;
    while (this._asset.hasRow(name)) name = base + n++;

    if (struct) {
      this._asset.addRow(name, struct);
    } else {
      this._asset.addRowWithData(name, {});
    }

    this._selectedRowName = name;
    this._emit();
    this._refreshAll();

    // Focus the row name input in detail panel so user can type
    setTimeout(() => {
      const inp = this._detailPanel.querySelector<HTMLInputElement>('input[type="text"]');
      if (inp) { inp.focus(); inp.select(); }
    }, 50);
  }

  private _duplicateRow(): void {
    if (!this._selectedRowName) return;
    const dup = this._asset.duplicateRow(this._selectedRowName);
    if (dup) {
      this._selectedRowName = dup.rowName;
      this._emit();
      this._refreshAll();
    }
  }

  private _promptDeleteRow(): void {
    if (!this._selectedRowName) return;
    this._showDeleteConfirm(this._selectedRowName);
  }

  private _showDeleteConfirm(rowName: string): void {
    if (this._confirmPopup) { this._confirmPopup.remove(); this._confirmPopup = null; }

    const popup = document.createElement('div');
    popup.style.cssText = [
      'position:fixed', 'background:#1a1a2e', 'border:1px solid #3f3f5a',
      'border-top:2px solid #ef4444', 'border-radius:6px', 'padding:14px 16px',
      'z-index:9999', 'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
      'font-size:12px', 'display:flex', 'flex-direction:column', 'gap:12px',
      'min-width:240px', 'max-width:280px',
    ].join(';');

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:700;color:#f87171;';
    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = iconHTML(Icons.Trash2, 14, '#f87171');
    titleRow.appendChild(iconWrap);
    titleRow.append('Delete Row');
    popup.appendChild(titleRow);

    const msg = document.createElement('div');
    msg.style.cssText = 'color:#94a3b8;font-size:11px;line-height:1.5;';
    const strong = document.createElement('strong');
    strong.style.color = '#e2e8f0';
    strong.textContent = rowName;
    msg.append('Delete ');
    msg.appendChild(strong);
    msg.append('? This cannot be undone.');
    popup.appendChild(msg);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = [
      'padding:5px 12px', 'font-size:11px', 'cursor:pointer',
      'border-radius:4px', 'border:1px solid #3f3f5a',
      'background:transparent', 'color:#94a3b8',
    ].join(';');
    cancel.addEventListener('click', () => { popup.remove(); this._confirmPopup = null; });
    btns.appendChild(cancel);

    const confirm = document.createElement('button');
    confirm.textContent = 'Delete';
    confirm.style.cssText = [
      'padding:5px 12px', 'font-size:11px', 'cursor:pointer',
      'border-radius:4px', 'border:none',
      'background:#ef4444', 'color:#fff', 'font-weight:600',
    ].join(';');
    confirm.addEventListener('click', () => {
      popup.remove();
      this._confirmPopup = null;
      this._asset.removeRow(rowName);
      if (this._selectedRowName === rowName) this._selectedRowName = null;
      this._emit();
      this._refreshAll();
    });
    btns.appendChild(confirm);
    popup.appendChild(btns);

    const rect = this.container.getBoundingClientRect();
    popup.style.left = (rect.left + rect.width / 2 - 140) + 'px';
    popup.style.top  = (rect.top  + rect.height / 2 - 70) + 'px';
    document.body.appendChild(popup);
    this._confirmPopup = popup;

    const close = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        popup.remove();
        this._confirmPopup = null;
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 10);
  }

  // ── CSV ────────────────────────────────────────────────────

  private _exportCSV(): void {
    const fields = this._fields();
    const csv = this._asset.exportCSV(fields);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this._asset.name + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private _importCSV(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      this._showCSVPreview(text);
    });
    input.click();
  }

  private _showCSVPreview(csv: string): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9998;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = [
      'background:#1a1a2e', 'border:1px solid #3f3f5a',
      'border-top:2px solid #6366f1', 'border-radius:8px',
      'padding:20px', 'min-width:520px', 'max-width:720px',
      'max-height:80vh', 'display:flex', 'flex-direction:column', 'gap:14px',
      'box-shadow:0 16px 48px rgba(0,0,0,0.7)',
    ].join(';');

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const titleIcon = document.createElement('span');
    titleIcon.innerHTML = iconHTML(Icons.Table2, 15, '#6366f1');
    titleRow.appendChild(titleIcon);
    const titleText = document.createElement('span');
    titleText.style.cssText = 'font-size:14px;font-weight:700;color:#e2e8f0;';
    titleText.textContent = 'Import CSV Preview';
    titleRow.appendChild(titleText);
    dialog.appendChild(titleRow);

    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'display:flex;gap:16px;font-size:12px;color:#94a3b8;';
    const mergeLabel = document.createElement('label');
    mergeLabel.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;';
    const mergeRadio = document.createElement('input');
    mergeRadio.type = 'radio'; mergeRadio.name = 'csvMode'; mergeRadio.value = 'merge'; mergeRadio.checked = true;
    mergeLabel.appendChild(mergeRadio); mergeLabel.append('Merge (add / update)');
    const replaceLabel = document.createElement('label');
    replaceLabel.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;';
    const replaceRadio = document.createElement('input');
    replaceRadio.type = 'radio'; replaceRadio.name = 'csvMode'; replaceRadio.value = 'replace';
    replaceLabel.appendChild(replaceRadio); replaceLabel.append('Replace all rows');
    modeWrap.append(mergeLabel, replaceLabel);
    dialog.appendChild(modeWrap);

    const preview = document.createElement('pre');
    preview.style.cssText = [
      'background:#0f0f1a', 'border:1px solid #3f3f5a',
      'border-radius:4px', 'padding:12px', 'font-size:11px',
      'overflow:auto', 'max-height:40vh', 'white-space:pre',
      'color:#94a3b8', 'font-family:monospace',
    ].join(';');
    preview.textContent = csv.slice(0, 2000) + (csv.length > 2000 ? '\n… (truncated)' : '');
    dialog.appendChild(preview);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = [
      'padding:6px 16px', 'font-size:12px', 'cursor:pointer',
      'border-radius:4px', 'border:1px solid #3f3f5a',
      'background:transparent', 'color:#94a3b8',
    ].join(';');
    cancelBtn.addEventListener('click', () => overlay.remove());
    btns.appendChild(cancelBtn);

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import';
    importBtn.style.cssText = [
      'padding:6px 16px', 'font-size:12px', 'cursor:pointer',
      'border-radius:4px', 'border:none',
      'background:#6366f1', 'color:#fff', 'font-weight:600',
    ].join(';');
    importBtn.addEventListener('click', () => {
      const mode = replaceRadio.checked ? 'replace' : 'merge';
      const { added, updated, errors } = this._asset.importCSV(csv, this._fields(), mode as any);
      overlay.remove();
      this._emit();
      this._refreshAll();
      if (errors.length > 0) console.warn('[DataTable] CSV import errors:', errors);
      alert(`Import complete: ${added} added, ${updated} updated.${errors.length > 0 ? '\n\nErrors:\n' + errors.slice(0, 5).join('\n') : ''}`);
    });
    btns.appendChild(importBtn);

    dialog.appendChild(btns);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }
}
