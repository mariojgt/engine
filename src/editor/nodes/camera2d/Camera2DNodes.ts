// ============================================================
//  Camera 2D Nodes — Blueprint nodes for controlling the
//  orthographic 2D camera at runtime.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Set Camera Follow Target 2D
// ================================================================
export class SetCameraFollowTarget2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Follow Target 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('targetName', new ClassicPreset.Input(strSocket, 'Target Actor'));
    this.addInput('smoothing', new ClassicPreset.Input(numSocket, 'Smoothing'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Follow Target 2D', 'Camera 2D', () => new SetCameraFollowTarget2DNode());

// ================================================================
//  Clear Camera Follow 2D
// ================================================================
export class ClearCameraFollow2DNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Camera Follow 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Camera Follow 2D', 'Camera 2D', () => new ClearCameraFollow2DNode());

// ================================================================
//  Set Camera Zoom 2D
// ================================================================
export class SetCameraZoom2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Zoom 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('zoom', new ClassicPreset.Input(numSocket, 'Zoom'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Zoom 2D', 'Camera 2D', () => new SetCameraZoom2DNode());

// ================================================================
//  Get Camera Zoom 2D
// ================================================================
export class GetCameraZoom2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera Zoom 2D');
    this.addOutput('zoom', new ClassicPreset.Output(numSocket, 'Zoom'));
  }
}
registerNode('Get Camera Zoom 2D', 'Camera 2D', () => new GetCameraZoom2DNode());

// ================================================================
//  Camera Shake 2D
// ================================================================
export class CameraShake2DNode extends ClassicPreset.Node {
  constructor() {
    super('Camera Shake 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('intensity', new ClassicPreset.Input(numSocket, 'Intensity'));
    this.addInput('duration', new ClassicPreset.Input(numSocket, 'Duration'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Camera Shake 2D', 'Camera 2D', () => new CameraShake2DNode());

// ================================================================
//  Set Camera Position 2D
// ================================================================
export class SetCameraPosition2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Position 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Position 2D', 'Camera 2D', () => new SetCameraPosition2DNode());

// ================================================================
//  Get Camera Position 2D
// ================================================================
export class GetCameraPosition2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera Position 2D');
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
  }
}
registerNode('Get Camera Position 2D', 'Camera 2D', () => new GetCameraPosition2DNode());

// ================================================================
//  Screen To World 2D
// ================================================================
export class ScreenToWorld2DNode extends ClassicPreset.Node {
  constructor() {
    super('Screen To World 2D');
    this.addInput('screenX', new ClassicPreset.Input(numSocket, 'Screen X'));
    this.addInput('screenY', new ClassicPreset.Input(numSocket, 'Screen Y'));
    this.addOutput('worldX', new ClassicPreset.Output(numSocket, 'World X'));
    this.addOutput('worldY', new ClassicPreset.Output(numSocket, 'World Y'));
  }
}
registerNode('Screen To World 2D', 'Camera 2D', () => new ScreenToWorld2DNode());

// ================================================================
//  World To Screen 2D
// ================================================================
export class WorldToScreen2DNode extends ClassicPreset.Node {
  constructor() {
    super('World To Screen 2D');
    this.addInput('worldX', new ClassicPreset.Input(numSocket, 'World X'));
    this.addInput('worldY', new ClassicPreset.Input(numSocket, 'World Y'));
    this.addOutput('screenX', new ClassicPreset.Output(numSocket, 'Screen X'));
    this.addOutput('screenY', new ClassicPreset.Output(numSocket, 'Screen Y'));
  }
}
registerNode('World To Screen 2D', 'Camera 2D', () => new WorldToScreen2DNode());

// ================================================================
//  Set Camera Bounds 2D
// ================================================================
export class SetCameraBounds2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Bounds 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('minX', new ClassicPreset.Input(numSocket, 'Min X'));
    this.addInput('minY', new ClassicPreset.Input(numSocket, 'Min Y'));
    this.addInput('maxX', new ClassicPreset.Input(numSocket, 'Max X'));
    this.addInput('maxY', new ClassicPreset.Input(numSocket, 'Max Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Bounds 2D', 'Camera 2D', () => new SetCameraBounds2DNode());

// ================================================================
//  Clear Camera Bounds 2D
// ================================================================
export class ClearCameraBounds2DNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Camera Bounds 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Camera Bounds 2D', 'Camera 2D', () => new ClearCameraBounds2DNode());

// ================================================================
//  Set Camera Dead Zone 2D
// ================================================================
export class SetCameraDeadZone2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Dead Zone 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('width', new ClassicPreset.Input(numSocket, 'Width'));
    this.addInput('height', new ClassicPreset.Input(numSocket, 'Height'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Dead Zone 2D', 'Camera 2D', () => new SetCameraDeadZone2DNode());

// ================================================================
//  Set Camera FOV 2D
//  Controls how much of the world is visible. Lower zoom = wider
//  view (wider "FOV"). This drives Camera2D.setZoom().
// ================================================================
export class SetCameraFOV2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera FOV 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('zoom', new ClassicPreset.Input(numSocket, 'Zoom (FOV)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera FOV 2D', 'Camera 2D', () => new SetCameraFOV2DNode());

// ================================================================
//  Get Camera FOV 2D
//  Returns the current zoom / FOV of the 2D orthographic camera.
// ================================================================
export class GetCameraFOV2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera FOV 2D');
    this.addOutput('zoom', new ClassicPreset.Output(numSocket, 'Zoom (FOV)'));
  }
}
registerNode('Get Camera FOV 2D', 'Camera 2D', () => new GetCameraFOV2DNode());

// ================================================================
//  Set Camera Pixels Per Unit 2D
//  Changes how many screen pixels represent one world unit,
//  adjusting the render scale of the 2D scene.
// ================================================================
export class SetCamera2DPixelsPerUnitNode extends ClassicPreset.Node {
  constructor() {
    super('Set Camera Pixels Per Unit 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('ppu', new ClassicPreset.Input(numSocket, 'Pixels Per Unit'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Camera Pixels Per Unit 2D', 'Camera 2D', () => new SetCamera2DPixelsPerUnitNode());

// ================================================================
//  Get Camera Pixels Per Unit 2D
// ================================================================
export class GetCamera2DPixelsPerUnitNode extends ClassicPreset.Node {
  constructor() {
    super('Get Camera Pixels Per Unit 2D');
    this.addOutput('ppu', new ClassicPreset.Output(numSocket, 'Pixels Per Unit'));
  }
}
registerNode('Get Camera Pixels Per Unit 2D', 'Camera 2D', () => new GetCamera2DPixelsPerUnitNode());
