// ============================================================
//  DataTableAsset — UE-style DataTable asset
//  A table of typed rows, each conforming to a StructureAsset schema.
//  Primary use-cases: inventory, items, character stats, weapons,
//  dialogue, quests, loot tables — any generic data registry.
// ============================================================

import { defaultForVarType } from './StructureAsset';
import type { StructureAsset, StructureFieldDef } from './StructureAsset';
import type { VarType } from './BlueprintData';

// ── Data shapes ──────────────────────────────────────────────

/** Lightweight typed reference: stores both table ID and row name */
export interface DataTableRowHandleValue {
  dataTableId: string;
  rowName: string;
}

/** A single row inside a DataTable */
export interface DataTableRow {
  /** Unique key within the table – used for all lookups */
  rowName: string;
  /** Field values keyed by StructureFieldDef.name */
  data: Record<string, any>;
}

/** Persisted JSON form */
export interface DataTableAssetJSON {
  dataTableId: string;
  dataTableName: string;
  /** ID of the StructureAsset that defines the row schema */
  structId: string;
  /** Human-readable struct name (for display without the manager) */
  structName: string;
  rows: DataTableRow[];
  createdAt: number;
  modifiedAt: number;
}

// ── UID helpers ───────────────────────────────────────────────

let _nextDTId = 1;
function dtUid(): string {
  return 'dt_' + (_nextDTId++) + '_' + Date.now().toString(36);
}

// ── Runtime class ─────────────────────────────────────────────

export class DataTableAsset {
  public id: string;
  public name: string;
  public structId: string;
  public structName: string;
  public rows: DataTableRow[] = [];
  public createdAt: number;
  public modifiedAt: number;

  /** Shadow rows used during Play – reset on Stop so the asset is never permanently mutated */
  private _runtimeRows: DataTableRow[] | null = null;

  constructor(name: string, structId: string, structName: string, id?: string) {
    this.id = id ?? dtUid();
    this.name = name;
    this.structId = structId;
    this.structName = structName;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  touch(): void { this.modifiedAt = Date.now(); }

  // ────────────────────────────────────────────────────────────
  //  Active rows (runtime copy during Play, base rows otherwise)
  // ────────────────────────────────────────────────────────────

  private get _active(): DataTableRow[] {
    return this._runtimeRows ?? this.rows;
  }

  // ── Play mode ────────────────────────────────────────────────

  /** Called by DataTableAssetManager.beginPlay() – clones rows for runtime */
  beginPlay(): void {
    this._runtimeRows = this.rows.map(r => ({
      rowName: r.rowName,
      data: { ...r.data },
    }));
  }

  /** Called by DataTableAssetManager.endPlay() – discards runtime shadow */
  endPlay(): void {
    this._runtimeRows = null;
  }

  // ── Design-time writes (modify this.rows) ────────────────────

  addRow(rowName: string, struct: StructureAsset): DataTableRow | null {
    if (this.hasRow(rowName)) return null;
    const data: Record<string, any> = {};
    for (const f of struct.fields) {
      data[f.name] = structuredClone(f.defaultValue) ?? defaultForVarType(f.type);
    }
    const row: DataTableRow = { rowName, data };
    this.rows.push(row);
    this.touch();
    return row;
  }

  addRowWithData(rowName: string, data: Record<string, any>): DataTableRow | null {
    if (this.hasRow(rowName)) return null;
    const row: DataTableRow = { rowName, data: { ...data } };
    this.rows.push(row);
    this.touch();
    return row;
  }

  updateRow(rowName: string, data: Record<string, any>): boolean {
    const row = this.rows.find(r => r.rowName === rowName);
    if (!row) return false;
    Object.assign(row.data, data);
    this.touch();
    return true;
  }

  removeRow(rowName: string): boolean {
    const idx = this.rows.findIndex(r => r.rowName === rowName);
    if (idx < 0) return false;
    this.rows.splice(idx, 1);
    this.touch();
    return true;
  }

  renameRow(oldName: string, newName: string): boolean {
    if (this.hasRow(newName)) return false;
    const row = this.rows.find(r => r.rowName === oldName);
    if (!row) return false;
    row.rowName = newName;
    this.touch();
    return true;
  }

  duplicateRow(rowName: string): DataTableRow | null {
    const row = this.rows.find(r => r.rowName === rowName);
    if (!row) return null;
    let newName = rowName + '_Copy';
    let n = 2;
    while (this.hasRow(newName)) newName = rowName + '_Copy' + (n++);
    const idx = this.rows.indexOf(row);
    const newRow: DataTableRow = { rowName: newName, data: { ...row.data } };
    this.rows.splice(idx + 1, 0, newRow);
    this.touch();
    return newRow;
  }

  // ── Queries (work on active rows) ────────────────────────────

  hasRow(rowName: string): boolean { return this._active.some(r => r.rowName === rowName); }
  getRow(rowName: string): DataTableRow | undefined { return this._active.find(r => r.rowName === rowName); }
  getAllRows(): DataTableRow[] { return [...this._active]; }
  getRowNames(): string[] { return this._active.map(r => r.rowName); }
  getRowCount(): number { return this._active.length; }

  // ── Runtime mutations (write to shadow rows during Play) ──────

  runtimeAddRow(rowName: string, data: Record<string, any>): boolean {
    if (this.hasRow(rowName)) return false;
    const target = this._runtimeRows ?? this.rows;
    target.push({ rowName, data: { ...data } });
    if (!this._runtimeRows) this.touch();
    return true;
  }

  runtimeRemoveRow(rowName: string): void {
    const target = this._runtimeRows ?? this.rows;
    const idx = target.findIndex(r => r.rowName === rowName);
    if (idx >= 0) target.splice(idx, 1);
    if (!this._runtimeRows) this.touch();
  }

  runtimeUpdateRow(rowName: string, data: Record<string, any>): boolean {
    const target = this._runtimeRows ?? this.rows;
    const row = target.find(r => r.rowName === rowName);
    if (!row) return false;
    Object.assign(row.data, data);
    if (!this._runtimeRows) this.touch();
    return true;
  }

  // ── CSV ──────────────────────────────────────────────────────

  exportCSV(fields: StructureFieldDef[]): string {
    const headers = ['RowName', ...fields.map(f => f.name)];
    const escape = (v: any) => JSON.stringify(v === null || v === undefined ? '' : String(v));
    const lines: string[] = [headers.map(escape).join(',')];
    for (const row of this.rows) {
      lines.push([escape(row.rowName), ...fields.map(f => escape(row.data[f.name] ?? ''))].join(','));
    }
    return lines.join('\n');
  }

  importCSV(
    csv: string,
    fields: StructureFieldDef[],
    mode: 'replace' | 'merge' = 'merge',
  ): { added: number; updated: number; errors: string[] } {
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 1) return { added: 0, updated: 0, errors: ['Empty CSV'] };

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
        else { cur += ch; }
      }
      result.push(cur);
      return result.map(c => c.replace(/^"|"$/g, ''));
    };

    const header = parseRow(lines[0]);
    const rnIdx = header.findIndex(h => h === 'RowName');
    if (rnIdx < 0) return { added: 0, updated: 0, errors: ['CSV is missing a RowName column'] };

    if (mode === 'replace') this.rows = [];
    let added = 0, updated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      const rowName = cols[rnIdx];
      if (!rowName) { errors.push(`Row ${i + 1}: empty RowName – skipped`); continue; }
      const data: Record<string, any> = {};
      for (const f of fields) {
        const ci = header.indexOf(f.name);
        if (ci >= 0 && cols[ci] !== undefined) {
          data[f.name] = _parseValue(cols[ci], f.type);
        } else {
          data[f.name] = structuredClone(f.defaultValue) ?? defaultForVarType(f.type);
        }
      }
      if (this.hasRow(rowName)) { this.updateRow(rowName, data); updated++; }
      else { this.addRowWithData(rowName, data); added++; }
    }
    this.touch();
    return { added, updated, errors };
  }

  // ── Serialization ─────────────────────────────────────────────

  toJSON(): DataTableAssetJSON {
    return {
      dataTableId: this.id,
      dataTableName: this.name,
      structId: this.structId,
      structName: this.structName,
      rows: this.rows.map(r => ({ rowName: r.rowName, data: { ...r.data } })),
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  static fromJSON(json: DataTableAssetJSON): DataTableAsset {
    const dt = new DataTableAsset(json.dataTableName, json.structId, json.structName, json.dataTableId);
    dt.rows = (json.rows || []).map(r => ({ rowName: r.rowName, data: { ...r.data } }));
    dt.createdAt = json.createdAt || Date.now();
    dt.modifiedAt = json.modifiedAt || Date.now();
    return dt;
  }
}

// ── Helper ────────────────────────────────────────────────────

function _parseValue(raw: string, type: VarType): any {
  switch (type) {
    case 'Float':   return isNaN(parseFloat(raw)) ? 0 : parseFloat(raw);
    case 'Boolean': return raw === 'true' || raw === '1' || raw === 'yes';
    default:        return raw;
  }
}

// ============================================================
//  DataTableAssetManager
// ============================================================

type ChangeCallback = () => void;

export class DataTableAssetManager {
  private _tables: Map<string, DataTableAsset> = new Map();
  private _onChanged: ChangeCallback[] = [];

  get tables(): DataTableAsset[] { return Array.from(this._tables.values()); }

  getTable(id: string): DataTableAsset | undefined { return this._tables.get(id); }
  getTableByName(name: string): DataTableAsset | undefined {
    return this.tables.find(t => t.name === name);
  }

  createTable(name: string, structId: string, structName: string): DataTableAsset {
    const dt = new DataTableAsset(name, structId, structName);
    this._tables.set(dt.id, dt);
    this._emit();
    return dt;
  }

  removeTable(id: string): void {
    this._tables.delete(id);
    this._emit();
  }

  renameTable(id: string, newName: string): void {
    const t = this._tables.get(id);
    if (t) { t.name = newName; t.touch(); this._emit(); }
  }

  duplicateTable(id: string, newName: string): DataTableAsset | null {
    const src = this._tables.get(id);
    if (!src) return null;
    const dup = new DataTableAsset(newName, src.structId, src.structName);
    dup.rows = src.rows.map(r => ({ rowName: r.rowName, data: { ...r.data } }));
    this._tables.set(dup.id, dup);
    this._emit();
    return dup;
  }

  notifyTableChanged(id: string): void {
    const t = this._tables.get(id);
    if (t) t.touch();
    this._emit();
  }

  onChanged(cb: ChangeCallback): void { this._onChanged.push(cb); }

  // ── Play mode ────────────────────────────────────────────────

  beginPlay(): void { for (const t of this._tables.values()) t.beginPlay(); }
  endPlay(): void   { for (const t of this._tables.values()) t.endPlay(); }

  // ── Serialization ─────────────────────────────────────────────

  exportAll(): DataTableAssetJSON[] { return this.tables.map(t => t.toJSON()); }

  importAll(data: DataTableAssetJSON[]): void {
    this._tables.clear();
    for (const json of data) {
      const dt = DataTableAsset.fromJSON(json);
      this._tables.set(dt.id, dt);
    }
    this._emit();
  }

  private _emit(): void { for (const cb of this._onChanged) cb(); }
}
