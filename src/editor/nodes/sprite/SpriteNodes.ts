// ============================================================
//  Sprite 2D Nodes — Blueprint nodes for controlling SpriteRenderer
//  and SpriteAnimator at runtime.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Play Animation 2D
// ================================================================
export class PlayAnimation2DNode extends ClassicPreset.Node {
  constructor() {
    super('Play Animation 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Play Animation 2D', 'Animation 2D', () => new PlayAnimation2DNode());

// ================================================================
//  Stop Animation 2D
// ================================================================
export class StopAnimation2DNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Animation 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Stop Animation 2D', 'Animation 2D', () => new StopAnimation2DNode());

// ================================================================
//  Set Sprite Frame
// ================================================================
export class SetSpriteFrameNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sprite Frame');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('spriteName', new ClassicPreset.Input(strSocket, 'Sprite Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Sprite Frame', 'Animation 2D', () => new SetSpriteFrameNode());

// ================================================================
//  Set Anim Variable 2D
// ================================================================
export class SetAnimVariable2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim Variable 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim Variable 2D', 'Animation 2D', () => new SetAnimVariable2DNode());

// ================================================================
//  Get Anim Variable 2D
// ================================================================
export class GetAnimVariable2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Variable 2D');
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Get Anim Variable 2D', 'Animation 2D', () => new GetAnimVariable2DNode());

// ================================================================
//  On Animation Event 2D
// ================================================================
export class OnAnimationEvent2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Animation Event 2D');
    this.addInput('eventName', new ClassicPreset.Input(strSocket, 'Event Name'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('animName', new ClassicPreset.Output(strSocket, 'Anim Name'));
    this.addOutput('frame', new ClassicPreset.Output(numSocket, 'Frame'));
  }
}
registerNode('On Animation Event 2D', 'Animation 2D', () => new OnAnimationEvent2DNode());

// ================================================================
//  On Animation Finished 2D
// ================================================================
export class OnAnimationFinished2DNode extends ClassicPreset.Node {
  constructor() {
    super('On Animation Finished 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('animName', new ClassicPreset.Output(strSocket, 'Anim Name'));
  }
}
registerNode('On Animation Finished 2D', 'Animation 2D', () => new OnAnimationFinished2DNode());

// ================================================================
//  Is Animation Playing 2D
// ================================================================
export class IsAnimationPlaying2DNode extends ClassicPreset.Node {
  constructor() {
    super('Is Animation Playing 2D');
    this.addInput('animName', new ClassicPreset.Input(strSocket, 'Anim Name'));
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Playing'));
  }
}
registerNode('Is Animation Playing 2D', 'Animation 2D', () => new IsAnimationPlaying2DNode());

// ================================================================
//  Get Current Animation 2D
// ================================================================
export class GetCurrentAnimation2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Current Animation 2D');
    this.addOutput('animName', new ClassicPreset.Output(strSocket, 'Anim Name'));
    this.addOutput('frame', new ClassicPreset.Output(numSocket, 'Frame'));
    this.addOutput('progress', new ClassicPreset.Output(numSocket, 'Progress'));
  }
}
registerNode('Get Current Animation 2D', 'Animation 2D', () => new GetCurrentAnimation2DNode());

// ================================================================
//  Set Sprite Flip
// ================================================================
export class SetSpriteFlipNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sprite Flip');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('flipX', new ClassicPreset.Input(boolSocket, 'Flip X'));
    this.addInput('flipY', new ClassicPreset.Input(boolSocket, 'Flip Y'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Sprite Flip', 'Animation 2D', () => new SetSpriteFlipNode());

// ================================================================
//  Set Sprite Color
// ================================================================
export class SetSpriteColorNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sprite Color');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('r', new ClassicPreset.Input(numSocket, 'R'));
    this.addInput('g', new ClassicPreset.Input(numSocket, 'G'));
    this.addInput('b', new ClassicPreset.Input(numSocket, 'B'));
    this.addInput('a', new ClassicPreset.Input(numSocket, 'A'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Sprite Color', 'Animation 2D', () => new SetSpriteColorNode());

// ================================================================
//  Set Sprite Opacity
// ================================================================
export class SetSpriteOpacityNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sprite Opacity');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('opacity', new ClassicPreset.Input(numSocket, 'Opacity'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Sprite Opacity', 'Animation 2D', () => new SetSpriteOpacityNode());

// ================================================================
//  Set Sorting Layer
// ================================================================
export class SetSortingLayerNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sorting Layer');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('layerName', new ClassicPreset.Input(strSocket, 'Layer'));
    this.addInput('orderInLayer', new ClassicPreset.Input(numSocket, 'Order'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Sorting Layer', 'Animation 2D', () => new SetSortingLayerNode());

// ================================================================
//  Get Sorting Layer
// ================================================================
export class GetSortingLayerNode extends ClassicPreset.Node {
  constructor() {
    super('Get Sorting Layer');
    this.addOutput('layerName', new ClassicPreset.Output(strSocket, 'Layer'));
    this.addOutput('orderInLayer', new ClassicPreset.Output(numSocket, 'Order'));
  }
}
registerNode('Get Sorting Layer', 'Animation 2D', () => new GetSortingLayerNode());
