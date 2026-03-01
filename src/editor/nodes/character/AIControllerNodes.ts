// ============================================================
//  AI Controller Blueprint Nodes
//  AIMoveTo, AIStopMovement, AIPatrol, AIFollow, AI queries
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, strSocket, vec3Socket } from '../sockets';
import { registerNode } from '../sockets';

// ================================================================
//  ACTION NODES
// ================================================================

/** AI Move To — navigate to a world position */
export class AIMoveToNode extends ClassicPreset.Node {
  constructor() {
    super('AI Move To');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Move To Location (Vector) — navigate using a Vector input */
export class AIMoveToVectorNode extends ClassicPreset.Node {
  constructor() {
    super('AI Move To (Vector)');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('location', new ClassicPreset.Input(vec3Socket, 'Location'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Stop Movement — halt all AI navigation */
export class AIStopMovementNode extends ClassicPreset.Node {
  constructor() {
    super('AI Stop Movement');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Set Focal Point — look at a position */
export class AISetFocalPointNode extends ClassicPreset.Node {
  constructor() {
    super('AI Set Focal Point');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Clear Focal Point */
export class AIClearFocalPointNode extends ClassicPreset.Node {
  constructor() {
    super('AI Clear Focal Point');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Start Patrol — begin patrolling waypoints */
export class AIStartPatrolNode extends ClassicPreset.Node {
  constructor() {
    super('AI Start Patrol');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Stop Patrol */
export class AIStopPatrolNode extends ClassicPreset.Node {
  constructor() {
    super('AI Stop Patrol');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Start Following — follow another game object */
export class AIStartFollowingNode extends ClassicPreset.Node {
  constructor() {
    super('AI Start Following');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('targetName', new ClassicPreset.Input(strSocket, 'Target Name'));
    this.addInput('distance', new ClassicPreset.Input(numSocket, 'Distance'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

/** AI Stop Following */
export class AIStopFollowingNode extends ClassicPreset.Node {
  constructor() {
    super('AI Stop Following');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ================================================================
//  QUERY NODES
// ================================================================

/** Get AI State */
export class GetAIStateNode extends ClassicPreset.Node {
  constructor() {
    super('Get AI State');
    this.addOutput('state', new ClassicPreset.Output(strSocket, 'State'));
  }
}

/** AI Has Reached Target */
export class AIHasReachedTargetNode extends ClassicPreset.Node {
  constructor() {
    super('AI Has Reached Target');
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Result'));
  }
}

/** AI Get Distance To Target */
export class AIGetDistanceToTargetNode extends ClassicPreset.Node {
  constructor() {
    super('AI Get Distance To Target');
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
  }
}

// ================================================================
//  Registration
// ================================================================

registerNode('AI Move To', 'AI', () => new AIMoveToNode());
registerNode('AI Move To (Vector)', 'AI', () => new AIMoveToVectorNode());
registerNode('AI Stop Movement', 'AI', () => new AIStopMovementNode());
registerNode('AI Set Focal Point', 'AI', () => new AISetFocalPointNode());
registerNode('AI Clear Focal Point', 'AI', () => new AIClearFocalPointNode());
registerNode('AI Start Patrol', 'AI', () => new AIStartPatrolNode());
registerNode('AI Stop Patrol', 'AI', () => new AIStopPatrolNode());
registerNode('AI Start Following', 'AI', () => new AIStartFollowingNode());
registerNode('AI Stop Following', 'AI', () => new AIStopFollowingNode());
registerNode('Get AI State', 'AI', () => new GetAIStateNode());
registerNode('AI Has Reached Target', 'AI', () => new AIHasReachedTargetNode());
registerNode('AI Get Distance To Target', 'AI', () => new AIGetDistanceToTargetNode());
