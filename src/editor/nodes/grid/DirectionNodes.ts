// ============================================================
//  Direction Nodes — 4-way cardinal helpers (N/E/S/W)
//
//  Direction values are integers 0..3 carried over Number sockets:
//    0 = N  (-Z)
//    1 = E  (+X)
//    2 = S  (+Z)
//    3 = W  (-X)
//
//  See engine/Direction.ts for the runtime helpers used by the
//  generated code (dirNormalize / dirToVector / dirToYaw / etc.).
// ============================================================

import { ClassicPreset } from 'rete';
import { numSocket, strSocket, registerNode } from '../sockets';

/** Direction Literal — number control 0..3, outputs the value. */
export class DirectionLiteralNode extends ClassicPreset.Node {
  constructor(initial: number = 0) {
    super('Direction Literal');
    this.addControl('value', new ClassicPreset.InputControl('number', { initial }));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Direction'));
  }
}

/** Rotate Direction — input direction + step count → new direction. CW for positive steps. */
export class RotateDirectionNode extends ClassicPreset.Node {
  constructor() {
    super('Rotate Direction');
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addInput('steps', new ClassicPreset.Input(numSocket, 'Steps'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Direction'));
  }
}

/** Opposite Direction — flips N↔S, E↔W. */
export class OppositeDirectionNode extends ClassicPreset.Node {
  constructor() {
    super('Opposite Direction');
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Direction'));
  }
}

/** Direction → unit Vector3 on the X/Z plane. */
export class DirectionToVectorNode extends ClassicPreset.Node {
  constructor() {
    super('Direction To Vector');
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

/** Direction → yaw in radians (Y-axis rotation). */
export class DirectionToYawNode extends ClassicPreset.Node {
  constructor() {
    super('Direction To Yaw');
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Yaw'));
  }
}

/** Yaw (radians) → nearest cardinal direction. */
export class DirectionFromYawNode extends ClassicPreset.Node {
  constructor() {
    super('Direction From Yaw');
    this.addInput('yaw', new ClassicPreset.Input(numSocket, 'Yaw'));
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Direction'));
  }
}

/** Direction → "North"/"East"/"South"/"West". Useful for debug print. */
export class DirectionToStringNode extends ClassicPreset.Node {
  constructor() {
    super('Direction To String');
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('out', new ClassicPreset.Output(strSocket, 'Name'));
  }
}

registerNode('Direction Literal',   'Grid', () => new DirectionLiteralNode());
registerNode('Rotate Direction',    'Grid', () => new RotateDirectionNode());
registerNode('Opposite Direction',  'Grid', () => new OppositeDirectionNode());
registerNode('Direction To Vector', 'Grid', () => new DirectionToVectorNode());
registerNode('Direction To Yaw',    'Grid', () => new DirectionToYawNode());
registerNode('Direction From Yaw',  'Grid', () => new DirectionFromYawNode());
registerNode('Direction To String', 'Grid', () => new DirectionToStringNode());
