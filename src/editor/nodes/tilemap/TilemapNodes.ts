// ============================================================
//  Tilemap Nodes — Blueprint nodes for runtime tilemap
//  queries and manipulation.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Get Tile At Location
// ================================================================
export class GetTileAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Get Tile At Location');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Grid X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Grid Y'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addOutput('tileId', new ClassicPreset.Output(numSocket, 'Tile ID'));
    this.addOutput('exists', new ClassicPreset.Output(boolSocket, 'Exists'));
  }
}
registerNode('Get Tile At Location', 'Tilemap', () => new GetTileAtLocationNode());

// ================================================================
//  Set Tile At Location
// ================================================================
export class SetTileAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Set Tile At Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Grid X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Grid Y'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addInput('tileId', new ClassicPreset.Input(numSocket, 'Tile ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Tile At Location', 'Tilemap', () => new SetTileAtLocationNode());

// ================================================================
//  Clear Tile At Location
// ================================================================
export class ClearTileAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Tile At Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Grid X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Grid Y'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Tile At Location', 'Tilemap', () => new ClearTileAtLocationNode());

// ================================================================
//  Has Tile At Location
// ================================================================
export class HasTileAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Has Tile At Location');
    this.addInput('x', new ClassicPreset.Input(numSocket, 'Grid X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Grid Y'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addOutput('exists', new ClassicPreset.Output(boolSocket, 'Has Tile'));
  }
}
registerNode('Has Tile At Location', 'Tilemap', () => new HasTileAtLocationNode());

// ================================================================
//  World To Tile
// ================================================================
export class WorldToTileNode extends ClassicPreset.Node {
  constructor() {
    super('World To Tile');
    this.addInput('worldX', new ClassicPreset.Input(numSocket, 'World X'));
    this.addInput('worldY', new ClassicPreset.Input(numSocket, 'World Y'));
    this.addOutput('gridX', new ClassicPreset.Output(numSocket, 'Grid X'));
    this.addOutput('gridY', new ClassicPreset.Output(numSocket, 'Grid Y'));
  }
}
registerNode('World To Tile', 'Tilemap', () => new WorldToTileNode());

// ================================================================
//  Tile To World
// ================================================================
export class TileToWorldNode extends ClassicPreset.Node {
  constructor() {
    super('Tile To World');
    this.addInput('gridX', new ClassicPreset.Input(numSocket, 'Grid X'));
    this.addInput('gridY', new ClassicPreset.Input(numSocket, 'Grid Y'));
    this.addOutput('worldX', new ClassicPreset.Output(numSocket, 'World X'));
    this.addOutput('worldY', new ClassicPreset.Output(numSocket, 'World Y'));
  }
}
registerNode('Tile To World', 'Tilemap', () => new TileToWorldNode());

// ================================================================
//  Get Tilemap Size
// ================================================================
export class GetTilemapSizeNode extends ClassicPreset.Node {
  constructor() {
    super('Get Tilemap Size');
    this.addOutput('width', new ClassicPreset.Output(numSocket, 'Width'));
    this.addOutput('height', new ClassicPreset.Output(numSocket, 'Height'));
    this.addOutput('tileSize', new ClassicPreset.Output(numSocket, 'Tile Size'));
  }
}
registerNode('Get Tilemap Size', 'Tilemap', () => new GetTilemapSizeNode());

// ================================================================
//  Fill Tiles
// ================================================================
export class FillTilesNode extends ClassicPreset.Node {
  constructor() {
    super('Fill Tiles');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fromX', new ClassicPreset.Input(numSocket, 'From X'));
    this.addInput('fromY', new ClassicPreset.Input(numSocket, 'From Y'));
    this.addInput('toX', new ClassicPreset.Input(numSocket, 'To X'));
    this.addInput('toY', new ClassicPreset.Input(numSocket, 'To Y'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addInput('tileId', new ClassicPreset.Input(numSocket, 'Tile ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Fill Tiles', 'Tilemap', () => new FillTilesNode());

// ================================================================
//  Clear Layer
// ================================================================
export class ClearTileLayerNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Tile Layer');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('layer', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Tile Layer', 'Tilemap', () => new ClearTileLayerNode());

// ================================================================
//  Rebuild Tilemap Collision
// ================================================================
export class RebuildTilemapCollisionNode extends ClassicPreset.Node {
  constructor() {
    super('Rebuild Tilemap Collision');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Rebuild Tilemap Collision', 'Tilemap', () => new RebuildTilemapCollisionNode());
