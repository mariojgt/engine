// ============================================================
//  Animation 2D Blueprint Nodes — State-machine support for
//  2D sprite animation blueprints (AnimBP 2D).
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ================================================================
//  Anim Update 2D Event — Executes every tick inside an AnimBP 2D
// ================================================================
export class AnimUpdate2DEventNode extends ClassicPreset.Node {
  constructor() {
    super('Anim Update 2D');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('deltaTime', new ClassicPreset.Output(numSocket, 'DeltaTime'));
  }
}
registerNode('Anim Update 2D', 'Animation 2D', () => new AnimUpdate2DEventNode());

// ================================================================
//  Get Anim Owner 2D — Returns the owning sprite actor
// ================================================================
export class GetAnimOwner2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Owner 2D');
    this.addOutput('ownerName', new ClassicPreset.Output(strSocket, 'Owner'));
  }
}
registerNode('Get Anim Owner 2D', 'Animation 2D', () => new GetAnimOwner2DNode());

// ================================================================
//  Set State 2D — Transition to an animation state
// ================================================================
export class SetState2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim State 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('stateName', new ClassicPreset.Input(strSocket, 'State'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim State 2D', 'Animation 2D', () => new SetState2DNode());

// ================================================================
//  Get Current State 2D
// ================================================================
export class GetCurrentState2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim State 2D');
    this.addOutput('stateName', new ClassicPreset.Output(strSocket, 'State'));
  }
}
registerNode('Get Anim State 2D', 'Animation 2D', () => new GetCurrentState2DNode());

// ================================================================
//  State Transition 2D — Conditional transition between states
// ================================================================
export class StateTransition2DNode extends ClassicPreset.Node {
  constructor() {
    super('State Transition 2D');
    this.addInput('condition', new ClassicPreset.Input(boolSocket, 'Condition'));
    this.addInput('fromState', new ClassicPreset.Input(strSocket, 'From'));
    this.addInput('toState', new ClassicPreset.Input(strSocket, 'To'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('State Transition 2D', 'Animation 2D', () => new StateTransition2DNode());

// ================================================================
//  On State Enter 2D
// ================================================================
export class OnStateEnter2DNode extends ClassicPreset.Node {
  constructor() {
    super('On State Enter 2D');
    this.addInput('stateName', new ClassicPreset.Input(strSocket, 'State'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('On State Enter 2D', 'Animation 2D', () => new OnStateEnter2DNode());

// ================================================================
//  On State Exit 2D
// ================================================================
export class OnStateExit2DNode extends ClassicPreset.Node {
  constructor() {
    super('On State Exit 2D');
    this.addInput('stateName', new ClassicPreset.Input(strSocket, 'State'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('On State Exit 2D', 'Animation 2D', () => new OnStateExit2DNode());

// ================================================================
//  Set Anim Float 2D
// ================================================================
export class SetAnimFloat2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim Float 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addInput('value', new ClassicPreset.Input(numSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim Float 2D', 'Animation 2D', () => new SetAnimFloat2DNode());

// ================================================================
//  Get Anim Float 2D
// ================================================================
export class GetAnimFloat2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Float 2D');
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addOutput('value', new ClassicPreset.Output(numSocket, 'Value'));
  }
}
registerNode('Get Anim Float 2D', 'Animation 2D', () => new GetAnimFloat2DNode());

// ================================================================
//  Set Anim Bool 2D
// ================================================================
export class SetAnimBool2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Anim Bool 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addInput('value', new ClassicPreset.Input(boolSocket, 'Value'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Anim Bool 2D', 'Animation 2D', () => new SetAnimBool2DNode());

// ================================================================
//  Get Anim Bool 2D
// ================================================================
export class GetAnimBool2DNode extends ClassicPreset.Node {
  constructor() {
    super('Get Anim Bool 2D');
    this.addInput('varName', new ClassicPreset.Input(strSocket, 'Variable'));
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Value'));
  }
}
registerNode('Get Anim Bool 2D', 'Animation 2D', () => new GetAnimBool2DNode());

// ================================================================
//  Set Playback Speed 2D
// ================================================================
export class SetPlaybackSpeed2DNode extends ClassicPreset.Node {
  constructor() {
    super('Set Playback Speed 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Playback Speed 2D', 'Animation 2D', () => new SetPlaybackSpeed2DNode());
