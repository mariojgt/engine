import { ClassicPreset } from 'rete';
import { getStructSocket } from '../sockets';
import { socketForType } from './VariableNodes';
import type { VarType } from '../../BlueprintData';

// ============================================================
//  Make Struct Node — assembles field inputs into a struct output
// ============================================================
export class MakeStructNode extends ClassicPreset.Node {
  public structId: string;
  public structName: string;
  public structFields: { name: string; type: VarType }[];

  constructor(structId: string, structName: string, fields: { name: string; type: VarType }[]) {
    super(`Make ${structName}`);
    this.structId = structId;
    this.structName = structName;
    this.structFields = fields;

    for (const f of fields) {
      this.addInput(f.name, new ClassicPreset.Input(socketForType(f.type), f.name));
    }
    this.addOutput('struct', new ClassicPreset.Output(getStructSocket(`Struct:${structId}`), structName));
  }
}

// ============================================================
//  Break Struct Node — decomposes a struct input into field outputs
// ============================================================
export class BreakStructNode extends ClassicPreset.Node {
  public structId: string;
  public structName: string;
  public structFields: { name: string; type: VarType }[];

  constructor(structId: string, structName: string, fields: { name: string; type: VarType }[]) {
    super(`Break ${structName}`);
    this.structId = structId;
    this.structName = structName;
    this.structFields = fields;

    this.addInput('struct', new ClassicPreset.Input(getStructSocket(`Struct:${structId}`), structName));
    for (const f of fields) {
      this.addOutput(f.name, new ClassicPreset.Output(socketForType(f.type), f.name));
    }
  }
}
