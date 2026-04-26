// ============================================================
//  Grid Debug Nodes — overlay arrows + cell outlines for
//  visualising direction/flow in build/play mode.
//
//  Both call into Engine.drawDebugArrow / drawDebugGridCell.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket, numSocket, colorSocket, registerNode,
} from '../sockets';

/** Draw an arrow at a world position pointing along a direction (color hex string). */
export class DrawDebugArrowNode extends ClassicPreset.Node {
  constructor() {
    super('Draw Debug Arrow');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addInput('length', new ClassicPreset.Input(numSocket, 'Length'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Outline a single grid cell with debug lines. */
export class DrawDebugGridCellNode extends ClassicPreset.Node {
  constructor() {
    super('Draw Debug Grid Cell');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Draw Debug Arrow',     'Grid', () => new DrawDebugArrowNode());
registerNode('Draw Debug Grid Cell', 'Grid', () => new DrawDebugGridCellNode());
