// ============================================================
//  Grid Coordinate Nodes — world ↔ grid conversion + cell config
//
//  All access the runtime Scene's GridSystem via __scene.gridSystem.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, registerNode } from '../sockets';

/** World position → integer grid cell. */
export class WorldToGridNode extends ClassicPreset.Node {
  constructor() {
    super('World To Grid');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('gx', new ClassicPreset.Output(numSocket, 'GX'));
    this.addOutput('gz', new ClassicPreset.Output(numSocket, 'GZ'));
  }
}

/** Grid cell → world position (cell center, Y = placementY). */
export class GridToWorldNode extends ClassicPreset.Node {
  constructor() {
    super('Grid To World');
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

/** Snap an arbitrary world (x, z) to the center of its cell. Also outputs the cell coords. */
export class SnapToGridNode extends ClassicPreset.Node {
  constructor() {
    super('Snap To Grid');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
    this.addOutput('gx', new ClassicPreset.Output(numSocket, 'GX'));
    this.addOutput('gz', new ClassicPreset.Output(numSocket, 'GZ'));
  }
}

/** Read cell side length. */
export class GetGridCellSizeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Grid Cell Size');
    this.addOutput('out', new ClassicPreset.Output(numSocket, 'Size'));
  }
}

/** Set cell side length (call once at BeginPlay). */
export class SetGridCellSizeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Grid Cell Size');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('size', new ClassicPreset.Input(numSocket, 'Size'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Set the Y at which Grid To World places actors. */
export class SetGridPlacementYNode extends ClassicPreset.Node {
  constructor() {
    super('Set Grid Placement Y');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('World To Grid',         'Grid', () => new WorldToGridNode());
registerNode('Grid To World',         'Grid', () => new GridToWorldNode());
registerNode('Snap To Grid',          'Grid', () => new SnapToGridNode());
registerNode('Get Grid Cell Size',    'Grid', () => new GetGridCellSizeNode());
registerNode('Set Grid Cell Size',    'Grid', () => new SetGridCellSizeNode());
registerNode('Set Grid Placement Y',  'Grid', () => new SetGridPlacementYNode());
