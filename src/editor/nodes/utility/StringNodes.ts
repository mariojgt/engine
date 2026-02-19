// ============================================================
//  String Nodes — UE5-quality string manipulation nodes.
//  All pure (no exec) unless noted otherwise.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, colorSocket, vec3Socket, registerNode } from '../sockets';

// ── Append ──────────────────────────────────────────────────
export class StringAppendNode extends ClassicPreset.Node {
  constructor() {
    super('Append');
    this.addInput('a', new ClassicPreset.Input(strSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(strSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Append', 'String', () => new StringAppendNode());

// ── Format Text ─────────────────────────────────────────────
export class FormatTextNode extends ClassicPreset.Node {
  constructor() {
    super('Format Text');
    this.addInput('format', new ClassicPreset.Input(strSocket, 'Format'));
    this.addInput('arg0', new ClassicPreset.Input(strSocket, '{0}'));
    this.addInput('arg1', new ClassicPreset.Input(strSocket, '{1}'));
    this.addInput('arg2', new ClassicPreset.Input(strSocket, '{2}'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Format Text', 'String', () => new FormatTextNode());

// ── To String (various types) ───────────────────────────────
export class BoolToStringNode2 extends ClassicPreset.Node {
  constructor() {
    super('Bool to String');
    this.addInput('value', new ClassicPreset.Input(boolSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Bool to String', 'String', () => new BoolToStringNode2());

export class IntToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Int to String');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Int to String', 'String', () => new IntToStringNode());

export class FloatToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Float to String');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Float to String', 'String', () => new FloatToStringNode());

export class Vec3ToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Vec3 to String');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Vec3 to String', 'String', () => new Vec3ToStringNode());

// ── String Operations ───────────────────────────────────────
export class StringLengthNode extends ClassicPreset.Node {
  constructor() {
    super('String Length');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('length', new ClassicPreset.Output(numSocket, 'Length'));
  }
}
registerNode('String Length', 'String', () => new StringLengthNode());

export class SubstringNode extends ClassicPreset.Node {
  constructor() {
    super('Substring');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addInput('start', new ClassicPreset.Input(numSocket, 'Start Index'));
    this.addInput('length', new ClassicPreset.Input(numSocket, 'Length'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Substring', 'String', () => new SubstringNode());

export class StringContainsNode extends ClassicPreset.Node {
  constructor() {
    super('String Contains');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addInput('substring', new ClassicPreset.Input(strSocket, 'Substring'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Contains'));
  }
}
registerNode('String Contains', 'String', () => new StringContainsNode());

export class StringReplaceNode extends ClassicPreset.Node {
  constructor() {
    super('String Replace');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addInput('from', new ClassicPreset.Input(strSocket, 'From'));
    this.addInput('to', new ClassicPreset.Input(strSocket, 'To'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('String Replace', 'String', () => new StringReplaceNode());

export class StringSplitNode extends ClassicPreset.Node {
  constructor() {
    super('String Split');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addInput('delimiter', new ClassicPreset.Input(strSocket, 'Delimiter'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
    // Note: Full array output requires array socket system (Phase 3)
  }
}
registerNode('String Split', 'String', () => new StringSplitNode());

export class TrimNode extends ClassicPreset.Node {
  constructor() {
    super('Trim');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('Trim', 'String', () => new TrimNode());

export class ToUpperNode extends ClassicPreset.Node {
  constructor() {
    super('To Upper');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('To Upper', 'String', () => new ToUpperNode());

export class ToLowerNode extends ClassicPreset.Node {
  constructor() {
    super('To Lower');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('To Lower', 'String', () => new ToLowerNode());

export class ParseIntNode extends ClassicPreset.Node {
  constructor() {
    super('Parse Int');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Parse Int', 'String', () => new ParseIntNode());

export class ParseFloatNode extends ClassicPreset.Node {
  constructor() {
    super('Parse Float');
    this.addInput('string', new ClassicPreset.Input(strSocket, 'String'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Parse Float', 'String', () => new ParseFloatNode());

// ── Print variants (exec nodes) ─────────────────────────────
export class PrintWarningNode extends ClassicPreset.Node {
  constructor() {
    super('Print Warning');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('message', new ClassicPreset.Input(strSocket, 'Message'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Print Warning', 'Utility', () => new PrintWarningNode());

export class PrintErrorNode extends ClassicPreset.Node {
  constructor() {
    super('Print Error');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('message', new ClassicPreset.Input(strSocket, 'Message'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Print Error', 'Utility', () => new PrintErrorNode());
