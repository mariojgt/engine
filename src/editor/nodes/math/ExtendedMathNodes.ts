// ============================================================
//  Extended Math Nodes — covers all remaining math operations
//  needed for UE5-quality Blueprint system.
//  All nodes are pure (no exec pins) with correct typed pins.
// ============================================================

import { ClassicPreset } from 'rete';
import { numSocket, boolSocket, vec3Socket, registerNode } from '../sockets';

// ── Arithmetic ──────────────────────────────────────────────

export class ModuloNode extends ClassicPreset.Node {
  constructor() {
    super('Modulo');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Modulo', 'Math', () => new ModuloNode());

export class PowerNode extends ClassicPreset.Node {
  constructor() {
    super('Power');
    this.addInput('base', new ClassicPreset.Input(numSocket, 'Base'));
    this.addInput('exponent', new ClassicPreset.Input(numSocket, 'Exponent'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Power', 'Math', () => new PowerNode());

export class MinNode extends ClassicPreset.Node {
  constructor() {
    super('Min');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Min', 'Math', () => new MinNode());

export class MaxNode extends ClassicPreset.Node {
  constructor() {
    super('Max');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Max', 'Math', () => new MaxNode());

export class RoundNode extends ClassicPreset.Node {
  constructor() {
    super('Round');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Round', 'Math', () => new RoundNode());

export class FloorNode extends ClassicPreset.Node {
  constructor() {
    super('Floor');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Floor', 'Math', () => new FloorNode());

export class CeilNode extends ClassicPreset.Node {
  constructor() {
    super('Ceil');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Ceil', 'Math', () => new CeilNode());

export class SqrtNode extends ClassicPreset.Node {
  constructor() {
    super('Sqrt');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Sqrt', 'Math', () => new SqrtNode());

export class LogNode extends ClassicPreset.Node {
  constructor() {
    super('Log');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Log', 'Math', () => new LogNode());

export class TanNode extends ClassicPreset.Node {
  constructor() {
    super('Tangent');
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Tangent', 'Math', () => new TanNode());

// ── Vector Math ─────────────────────────────────────────────

export class NormalizeVec3Node extends ClassicPreset.Node {
  constructor() {
    super('Normalize');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('nx', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('ny', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('nz', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Normalize (Vector)', 'Math', () => new NormalizeVec3Node());

export class DotProductNode extends ClassicPreset.Node {
  constructor() {
    super('Dot Product');
    this.addInput('ax', new ClassicPreset.Input(numSocket, 'A.X'));
    this.addInput('ay', new ClassicPreset.Input(numSocket, 'A.Y'));
    this.addInput('az', new ClassicPreset.Input(numSocket, 'A.Z'));
    this.addInput('bx', new ClassicPreset.Input(numSocket, 'B.X'));
    this.addInput('by', new ClassicPreset.Input(numSocket, 'B.Y'));
    this.addInput('bz', new ClassicPreset.Input(numSocket, 'B.Z'));
    this.addOutput('result', new ClassicPreset.Output(numSocket, 'Result'));
  }
}
registerNode('Dot Product', 'Math', () => new DotProductNode());

export class CrossProductNode extends ClassicPreset.Node {
  constructor() {
    super('Cross Product');
    this.addInput('ax', new ClassicPreset.Input(numSocket, 'A.X'));
    this.addInput('ay', new ClassicPreset.Input(numSocket, 'A.Y'));
    this.addInput('az', new ClassicPreset.Input(numSocket, 'A.Z'));
    this.addInput('bx', new ClassicPreset.Input(numSocket, 'B.X'));
    this.addInput('by', new ClassicPreset.Input(numSocket, 'B.Y'));
    this.addInput('bz', new ClassicPreset.Input(numSocket, 'B.Z'));
    this.addOutput('rx', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('ry', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('rz', new ClassicPreset.Output(numSocket, 'Z'));
  }
}
registerNode('Cross Product', 'Math', () => new CrossProductNode());

export class VectorLengthNode extends ClassicPreset.Node {
  constructor() {
    super('Vector Length');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('length', new ClassicPreset.Output(numSocket, 'Length'));
  }
}
registerNode('Vector Length', 'Math', () => new VectorLengthNode());

export class DistanceNode extends ClassicPreset.Node {
  constructor() {
    super('Distance');
    this.addInput('ax', new ClassicPreset.Input(numSocket, 'A.X'));
    this.addInput('ay', new ClassicPreset.Input(numSocket, 'A.Y'));
    this.addInput('az', new ClassicPreset.Input(numSocket, 'A.Z'));
    this.addInput('bx', new ClassicPreset.Input(numSocket, 'B.X'));
    this.addInput('by', new ClassicPreset.Input(numSocket, 'B.Y'));
    this.addInput('bz', new ClassicPreset.Input(numSocket, 'B.Z'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}
registerNode('Distance', 'Math', () => new DistanceNode());

// ── Random ──────────────────────────────────────────────────

export class RandomFloatNode extends ClassicPreset.Node {
  constructor() {
    super('Random Float');
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Random Float', 'Math', () => new RandomFloatNode());

export class RandomFloatInRangeNode extends ClassicPreset.Node {
  constructor() {
    super('Random Float in Range');
    this.addInput('min', new ClassicPreset.Input(numSocket, 'Min'));
    this.addInput('max', new ClassicPreset.Input(numSocket, 'Max'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Random Float in Range', 'Math', () => new RandomFloatInRangeNode());

export class RandomIntInRangeNode extends ClassicPreset.Node {
  constructor() {
    super('Random Int in Range');
    this.addInput('min', new ClassicPreset.Input(numSocket, 'Min'));
    this.addInput('max', new ClassicPreset.Input(numSocket, 'Max'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Random Int in Range', 'Math', () => new RandomIntInRangeNode());

export class RandomBoolNode extends ClassicPreset.Node {
  constructor() {
    super('Random Bool');
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Value'));
  }
}
registerNode('Random Bool', 'Math', () => new RandomBoolNode());

// ── Comparison ──────────────────────────────────────────────

export class EqualNode extends ClassicPreset.Node {
  constructor() {
    super('Equal');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('Equal', 'Math', () => new EqualNode());

export class NotEqualNode extends ClassicPreset.Node {
  constructor() {
    super('Not Equal');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('Not Equal', 'Math', () => new NotEqualNode());

export class LessThanNode extends ClassicPreset.Node {
  constructor() {
    super('Less Than');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('Less Than', 'Math', () => new LessThanNode());

export class GreaterOrEqualNode extends ClassicPreset.Node {
  constructor() {
    super('Greater or Equal');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('Greater or Equal', 'Math', () => new GreaterOrEqualNode());

export class LessOrEqualNode extends ClassicPreset.Node {
  constructor() {
    super('Less or Equal');
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('Less or Equal', 'Math', () => new LessOrEqualNode());

// ── Boolean Logic (Pure) ────────────────────────────────────

export class BooleanAndNode extends ClassicPreset.Node {
  constructor() {
    super('AND');
    this.addInput('a', new ClassicPreset.Input(boolSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(boolSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('AND', 'Math', () => new BooleanAndNode());

export class BooleanOrNode extends ClassicPreset.Node {
  constructor() {
    super('OR');
    this.addInput('a', new ClassicPreset.Input(boolSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(boolSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('OR', 'Math', () => new BooleanOrNode());

export class BooleanNotNode extends ClassicPreset.Node {
  constructor() {
    super('NOT');
    this.addInput('value', new ClassicPreset.Input(boolSocket, 'Value'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('NOT', 'Math', () => new BooleanNotNode());

export class BooleanXorNode extends ClassicPreset.Node {
  constructor() {
    super('XOR');
    this.addInput('a', new ClassicPreset.Input(boolSocket, 'A'));
    this.addInput('b', new ClassicPreset.Input(boolSocket, 'B'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}
registerNode('XOR', 'Math', () => new BooleanXorNode());
