// ============================================================
//  Grid Placement Nodes — bind/unbind actors to grid cells,
//  query occupancy, walk neighbors.
//
//  All access the runtime Scene's GridSystem via __scene.gridSystem.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket, numSocket, boolSocket, actorRefSocket, registerNode,
} from '../sockets';

/** Place On Grid — binds an actor to a cell + direction (snaps transform). */
export class PlaceOnGridNode extends ClassicPreset.Node {
  constructor() {
    super('Place On Grid');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}

/** Remove an actor from the grid (does not destroy the actor). */
export class RemoveFromGridNode extends ClassicPreset.Node {
  constructor() {
    super('Remove From Grid');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** Free a cell by coordinate; returns the freed actor (or null). */
export class RemoveFromGridAtNode extends ClassicPreset.Node {
  constructor() {
    super('Remove From Grid At');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('actor', new ClassicPreset.Output(actorRefSocket, 'Removed'));
  }
}

/** Is the cell currently occupied? */
export class IsGridCellOccupiedNode extends ClassicPreset.Node {
  constructor() {
    super('Is Grid Cell Occupied');
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addOutput('out', new ClassicPreset.Output(boolSocket, 'Occupied'));
  }
}

/** Get whatever actor is at a cell (or null). */
export class GetGridActorAtNode extends ClassicPreset.Node {
  constructor() {
    super('Get Grid Actor At');
    this.addInput('gx', new ClassicPreset.Input(numSocket, 'GX'));
    this.addInput('gz', new ClassicPreset.Input(numSocket, 'GZ'));
    this.addOutput('actor', new ClassicPreset.Output(actorRefSocket, 'Actor'));
  }
}

/** Read an actor's current grid binding. `valid` is false if it isn't placed. */
export class GetActorGridCellNode extends ClassicPreset.Node {
  constructor() {
    super('Get Actor Grid Cell');
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addOutput('gx', new ClassicPreset.Output(numSocket, 'GX'));
    this.addOutput('gz', new ClassicPreset.Output(numSocket, 'GZ'));
    this.addOutput('dir', new ClassicPreset.Output(numSocket, 'Direction'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Valid'));
  }
}

/** Walk one cell along an arbitrary direction from `actor`. */
export class GetNeighborGridActorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Neighbor Grid Actor');
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addInput('dir', new ClassicPreset.Input(numSocket, 'Direction'));
    this.addOutput('actor', new ClassicPreset.Output(actorRefSocket, 'Neighbor'));
  }
}

/** Walk one cell forward along the actor's *own* direction. */
export class GetForwardGridActorNode extends ClassicPreset.Node {
  constructor() {
    super('Get Forward Grid Actor');
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addOutput('actor', new ClassicPreset.Output(actorRefSocket, 'Neighbor'));
  }
}

/** Wipe every cell binding on the grid. Does not destroy actors. */
export class ClearGridNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Grid');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Place On Grid',           'Grid', () => new PlaceOnGridNode());
registerNode('Remove From Grid',        'Grid', () => new RemoveFromGridNode());
registerNode('Remove From Grid At',     'Grid', () => new RemoveFromGridAtNode());
registerNode('Is Grid Cell Occupied',   'Grid', () => new IsGridCellOccupiedNode());
registerNode('Get Grid Actor At',       'Grid', () => new GetGridActorAtNode());
registerNode('Get Actor Grid Cell',     'Grid', () => new GetActorGridCellNode());
registerNode('Get Neighbor Grid Actor', 'Grid', () => new GetNeighborGridActorNode());
registerNode('Get Forward Grid Actor',  'Grid', () => new GetForwardGridActorNode());
registerNode('Clear Grid',              'Grid', () => new ClearGridNode());
