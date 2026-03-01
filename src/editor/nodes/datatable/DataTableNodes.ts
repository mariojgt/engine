// ============================================================
//  DataTableNodes — UE-style DataTable Blueprint nodes
//
//  All nodes are UI/schema definitions only.
//  Execution logic (code gen) lives in NodeEditorPanel.tsx.
//
//  Node categories:
//  ─ DataTable (query)
//    • Get Data Table Row       (exec: Then / Not Found)
//    • Get Data Table Row (Pure)
//    • Get All Data Table Rows
//    • Get Data Table Row Names
//    • Does Data Table Row Exist
//    • Get Data Table Row Count
//    • Find Rows By Predicate
//    • For Each Data Table Row
//  ─ DataTable (handle)
//    • Make Data Table Row Handle
//    • Resolve Data Table Row Handle
//    • Is Data Table Row Handle Valid
//  ─ DataTable (runtime write)
//    • Add Data Table Row (Runtime)
//    • Remove Data Table Row (Runtime)
//    • Update Data Table Row (Runtime)
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  strSocket,
  objectSocket,
  anySocket,
  registerNode,
  getStructSocket,
} from '../sockets';
import { socketForType } from '../variables/VariableNodes';
import type { VarType } from '../../BlueprintData';

// ── DataTable socket (teal) ──────────────────────────────────
export const dataTableSocket = new ClassicPreset.Socket('DataTable');
export const rowHandleSocket  = new ClassicPreset.Socket('DataTableRowHandle');
export const strArraySocket   = new ClassicPreset.Socket('StringArray');

// ── Struct socket helper ─────────────────────────────────────

/**
 * Returns the strongly typed struct socket when we know the struct ID,
 * or `anySocket` if the DataTable has not been connected yet.
 */
function structSock(structId?: string) {
  return structId ? getStructSocket(`Struct:${structId}`) : anySocket;
}

// ============================================================
//  DataTable Select Control
//  A lightweight control that stores the selected DataTable asset.
//  Rendered into a dropdown picker in NodeEditorPanel.tsx.
// ============================================================
export class DataTableSelectControl extends ClassicPreset.Control {
  public dataTableId:   string;
  public dataTableName: string;
  /** The structId of the selected table (resolved at render time) */
  public structId:   string;
  public structName: string;

  constructor(
    dtId   = '',
    dtName = '(none)',
    structId   = '',
    structName = '',
  ) {
    super();
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;
  }

  setValue(dtId: string, dtName: string, structId: string, structName: string): void {
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;
  }
}

// ============================================================
//  1.  Get Data Table Row  (impure — exec + two output paths)
// ============================================================
export class GetDataTableRowNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;
  /** Keys of dynamically added per-field output pins */
  public _dtFieldKeys: string[] = [];

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Get Data Table Row');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.addInput('exec',    new ClassicPreset.Input(execSocket,   '▶'));
    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket,    'Row Name'));

    this.addOutput('then',     new ClassicPreset.Output(execSocket,         '▶ Then'));
    this.addOutput('notFound', new ClassicPreset.Output(execSocket,         '▶ Not Found'));
    this.addOutput('outRow',   new ClassicPreset.Output(structSock(structId), structName || 'Row'));
    this.addOutput('rowFound', new ClassicPreset.Output(boolSocket,         'Row Found'));
  }

  /**
   * Called by the DataTable dropdown when a table is selected.
   * Removes stale per-field outputs and adds one output per struct field.
   * Call area.update('node', this.id) after this to re-render.
   */
  updateFields(fields: { name: string; type: VarType }[], structId: string, structName: string): void {
    // Remove old field outputs
    for (const key of this._dtFieldKeys) {
      if (this.outputs[key]) this.removeOutput(key);
    }
    this._dtFieldKeys = [];
    // Update outRow socket type and label
    if (this.outputs['outRow']) this.removeOutput('outRow');
    this.addOutput('outRow', new ClassicPreset.Output(structSock(structId), structName || 'Row'));
    // Add individual typed field outputs
    for (const f of fields) {
      const key = f.name;
      this._dtFieldKeys.push(key);
      this.addOutput(key, new ClassicPreset.Output(socketForType(f.type), `${f.name}  [${f.type}]`));
    }
  }
}
registerNode('Get Data Table Row', 'DataTable', () => new GetDataTableRowNode());

// ============================================================
//  2.  Get Data Table Row  (pure)
// ============================================================
export class GetDataTableRowPureNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;
  public _dtFieldKeys: string[] = [];

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Get Data Table Row (Pure)');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket,    'Row Name'));

    this.addOutput('outRow',   new ClassicPreset.Output(structSock(structId), structName || 'Row'));
    this.addOutput('rowFound', new ClassicPreset.Output(boolSocket,           'Row Found'));
  }

  updateFields(fields: { name: string; type: VarType }[], structId: string, structName: string): void {
    for (const key of this._dtFieldKeys) {
      if (this.outputs[key]) this.removeOutput(key);
    }
    this._dtFieldKeys = [];
    if (this.outputs['outRow']) this.removeOutput('outRow');
    this.addOutput('outRow', new ClassicPreset.Output(structSock(structId), structName || 'Row'));
    for (const f of fields) {
      const key = f.name;
      this._dtFieldKeys.push(key);
      this.addOutput(key, new ClassicPreset.Output(socketForType(f.type), `${f.name}  [${f.type}]`));
    }
  }
}
registerNode('Get Data Table Row (Pure)', 'DataTable', () => new GetDataTableRowPureNode());

// ============================================================
//  3.  Get All Data Table Rows  (pure)
// ============================================================
export class GetAllDataTableRowsNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Get All Data Table Rows');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);

    this.addOutput('rowArray', new ClassicPreset.Output(objectSocket, `Array of ${structName || 'Row'}`));
  }
}
registerNode('Get All Data Table Rows', 'DataTable', () => new GetAllDataTableRowsNode());

// ============================================================
//  4.  Get Data Table Row Names  (pure)
// ============================================================
export class GetDataTableRowNamesNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)') {
    super('Get Data Table Row Names');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;

    this.control = new DataTableSelectControl(dtId, dtName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);

    this.addOutput('rowNames', new ClassicPreset.Output(objectSocket, 'Row Names'));
  }
}
registerNode('Get Data Table Row Names', 'DataTable', () => new GetDataTableRowNamesNode());

// ============================================================
//  5.  Does Data Table Row Exist  (pure)
// ============================================================
export class DoesDataTableRowExistNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)') {
    super('Does Data Table Row Exist');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;

    this.control = new DataTableSelectControl(dtId, dtName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket, 'Row Name'));

    this.addOutput('exists', new ClassicPreset.Output(boolSocket, 'Exists'));
  }
}
registerNode('Does Data Table Row Exist', 'DataTable', () => new DoesDataTableRowExistNode());

// ============================================================
//  6.  Get Data Table Row Count  (pure)
// ============================================================
export class GetDataTableRowCountNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)') {
    super('Get Data Table Row Count');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;

    this.control = new DataTableSelectControl(dtId, dtName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);

    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Get Data Table Row Count', 'DataTable', () => new GetDataTableRowCountNode());

// ============================================================
//  7.  Find Rows By Predicate  (impure)
//  The Predicate input pipes to a custom Blueprint event delegate.
// ============================================================
export class FindRowsByPredicateNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Find Rows By Predicate');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.addInput('exec',      new ClassicPreset.Input(execSocket, '▶'));
    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    // Predicate is a string (name of the blueprint function to call as predicate)
    this.addInput('predicate', new ClassicPreset.Input(strSocket,  'Predicate (fn name)'));

    this.addOutput('then',         new ClassicPreset.Output(execSocket,           '▶'));
    this.addOutput('matchingRows', new ClassicPreset.Output(objectSocket,          `Matching ${structName || 'Rows'}`));
    this.addOutput('matchCount',   new ClassicPreset.Output(numSocket,            'Match Count'));
  }
}
registerNode('Find Rows By Predicate', 'DataTable', () => new FindRowsByPredicateNode());

// ============================================================
//  8.  For Each Data Table Row  (impure loop)
// ============================================================
export class ForEachDataTableRowNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('For Each Data Table Row');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);

    this.addOutput('loopBody',  new ClassicPreset.Output(execSocket,            '▶ Loop Body'));
    this.addOutput('row',       new ClassicPreset.Output(structSock(structId),  structName || 'Row'));
    this.addOutput('rowName',   new ClassicPreset.Output(strSocket,             'Row Name'));
    this.addOutput('rowIndex',  new ClassicPreset.Output(numSocket,             'Row Index'));
    this.addOutput('completed', new ClassicPreset.Output(execSocket,            '▶ Completed'));
  }
}
registerNode('For Each Data Table Row', 'DataTable', () => new ForEachDataTableRowNode());

// ============================================================
//  9.  Make Data Table Row Handle  (pure)
// ============================================================
export class MakeDataTableRowHandleNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)') {
    super('Make Data Table Row Handle');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;

    this.control = new DataTableSelectControl(dtId, dtName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket,      'Row Name'));

    this.addOutput('handle', new ClassicPreset.Output(rowHandleSocket, 'Row Handle'));
  }
}
registerNode('Make Data Table Row Handle', 'DataTable', () => new MakeDataTableRowHandleNode());

// ============================================================
//  10.  Resolve Data Table Row Handle  (impure)
// ============================================================
export class ResolveDataTableRowHandleNode extends ClassicPreset.Node {
  public structId:   string;
  public structName: string;

  constructor(structId = '', structName = '') {
    super('Resolve Data Table Row Handle');
    this.structId   = structId;
    this.structName = structName;

    this.addInput('exec',   new ClassicPreset.Input(execSocket,         '▶'));
    this.addInput('handle', new ClassicPreset.Input(rowHandleSocket,    'Row Handle'));

    this.addOutput('then',     new ClassicPreset.Output(execSocket,         '▶ Then'));
    this.addOutput('notFound', new ClassicPreset.Output(execSocket,         '▶ Not Found'));
    this.addOutput('outRow',   new ClassicPreset.Output(structSock(structId), structName || 'Row'));
    this.addOutput('rowFound', new ClassicPreset.Output(boolSocket,           'Row Found'));
  }
}
registerNode('Resolve Data Table Row Handle', 'DataTable', () => new ResolveDataTableRowHandleNode());

// ============================================================
//  11.  Is Data Table Row Handle Valid  (pure)
// ============================================================
export class IsDataTableRowHandleValidNode extends ClassicPreset.Node {
  constructor() {
    super('Is Data Table Row Handle Valid');
    this.addInput('handle',  new ClassicPreset.Input(rowHandleSocket, 'Row Handle'));
    this.addOutput('isValid', new ClassicPreset.Output(boolSocket,    'Is Valid'));
  }
}
registerNode('Is Data Table Row Handle Valid', 'DataTable', () => new IsDataTableRowHandleValidNode());

// ============================================================
//  12.  Add Data Table Row (Runtime)
// ============================================================
export class AddDataTableRowRuntimeNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Add Data Table Row (Runtime)');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.addInput('exec',    new ClassicPreset.Input(execSocket,         '▶'));
    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket,          'Row Name'));
    this.addInput('rowData', new ClassicPreset.Input(structSock(structId), `Row Data (${structName || 'Struct'})`));

    this.addOutput('then',    new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Add Data Table Row (Runtime)', 'DataTable', () => new AddDataTableRowRuntimeNode());

// ============================================================
//  13.  Remove Data Table Row (Runtime)
// ============================================================
export class RemoveDataTableRowRuntimeNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)') {
    super('Remove Data Table Row (Runtime)');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;

    this.addInput('exec',    new ClassicPreset.Input(execSocket,    '▶'));
    this.control = new DataTableSelectControl(dtId, dtName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName', new ClassicPreset.Input(strSocket,     'Row Name'));

    this.addOutput('then', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Remove Data Table Row (Runtime)', 'DataTable', () => new RemoveDataTableRowRuntimeNode());

// ============================================================
//  14.  Update Data Table Row (Runtime)
// ============================================================
export class UpdateDataTableRowRuntimeNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public control: DataTableSelectControl;

  constructor(dtId = '', dtName = '(none)', structId = '', structName = '') {
    super('Update Data Table Row (Runtime)');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;

    this.addInput('exec',       new ClassicPreset.Input(execSocket,           '▶'));
    this.control = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.control as any)._parentNode = this;
    this.addControl('dataTable', this.control);
    this.addInput('rowName',    new ClassicPreset.Input(strSocket,            'Row Name'));
    this.addInput('newRowData', new ClassicPreset.Input(structSock(structId), `New Data (${structName || 'Struct'})`));

    this.addOutput('then',    new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Update Data Table Row (Runtime)', 'DataTable', () => new UpdateDataTableRowRuntimeNode());

// ============================================================
//  15.  Get Data Table Field  (pure — single field accessor)
//  UE-equivalent: drag from row output → "Get <FieldName>"
//  Here it's an explicit node: pick table + field, wire Row Name, get value.
// ============================================================

/** Control that stores the chosen field name + resolved type. */
export class DataTableFieldSelectControl extends ClassicPreset.Control {
  public fieldName: string;
  public fieldType: VarType | '';
  constructor(fieldName = '', fieldType: VarType | '' = '') {
    super();
    this.fieldName = fieldName;
    this.fieldType = fieldType;
  }
  setValue(name: string, type: VarType | ''): void {
    this.fieldName = name;
    this.fieldType = type;
  }
}

export class GetDataTableFieldNode extends ClassicPreset.Node {
  public dataTableId:   string;
  public dataTableName: string;
  public structId:      string;
  public structName:    string;
  public fieldName:     string;
  public fieldType:     VarType | '';
  public dtCtrl:   DataTableSelectControl;
  public fldCtrl:  DataTableFieldSelectControl;

  constructor(
    dtId = '', dtName = '(none)',
    structId = '', structName = '',
    fieldName = '', fieldType: VarType | '' = '',
  ) {
    super('Get Data Table Field');
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = structId;
    this.structName    = structName;
    this.fieldName     = fieldName;
    this.fieldType     = fieldType;

    this.dtCtrl = new DataTableSelectControl(dtId, dtName, structId, structName);
    (this.dtCtrl as any)._parentNode = this;
    this.addControl('dataTable', this.dtCtrl);

    this.fldCtrl = new DataTableFieldSelectControl(fieldName, fieldType);
    (this.fldCtrl as any)._parentNode = this;
    this.addControl('field', this.fldCtrl);

    this.addInput('rowName', new ClassicPreset.Input(strSocket, 'Row Name'));

    // Output is typed based on the chosen field; starts as anySocket until a field is picked
    const outSock = fieldType ? socketForType(fieldType as VarType) : anySocket;
    this.addOutput('value', new ClassicPreset.Output(outSock, fieldName ? `${fieldName}` : 'Value'));
  }

  /** Called by both dropdowns when a table or field is selected. */
  setField(name: string, type: VarType | ''): void {
    this.fieldName = name;
    this.fieldType = type;
    this.fldCtrl.setValue(name, type);
    if (this.outputs['value']) this.removeOutput('value');
    const outSock = type ? socketForType(type as VarType) : anySocket;
    this.addOutput('value', new ClassicPreset.Output(outSock, name || 'Value'));
  }

  setTable(dtId: string, dtName: string, sid: string, sName: string): void {
    this.dataTableId   = dtId;
    this.dataTableName = dtName;
    this.structId      = sid;
    this.structName    = sName;
    this.dtCtrl.setValue(dtId, dtName, sid, sName);
    // Clear field when table changes
    this.setField('', '');
  }
}
registerNode('Get Data Table Field', 'DataTable', () => new GetDataTableFieldNode());
