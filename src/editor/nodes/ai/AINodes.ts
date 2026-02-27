// ============================================================
//  AI Blueprint Nodes — pre-populated nodes for AI asset blueprints
//  These register into the existing NODE_PALETTE so they appear
//  in the node search and right-click menu.
// ============================================================

import { ClassicPreset } from 'rete';
import { registerNode, execSocket, numSocket, boolSocket, strSocket, objectSocket, actorRefSocket } from '../sockets';

// ── Category color ──
// Registered in sockets.ts NODE_CATEGORY_COLORS (we'll add 'AI' category)

// ============================================================
//  Task Nodes
// ============================================================

export class AIReceiveExecuteNode extends ClassicPreset.Node {
  constructor() {
    super('AI Receive Execute');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Receive Execute', 'AI', () => new AIReceiveExecuteNode());

export class AIReceiveTickNode extends ClassicPreset.Node {
  constructor() {
    super('AI Receive Tick');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
    this.addOutput('deltaTime', new ClassicPreset.Output(numSocket, 'Delta Time'));
  }
}
registerNode('AI Receive Tick', 'AI', () => new AIReceiveTickNode());

export class AIReceiveAbortNode extends ClassicPreset.Node {
  constructor() {
    super('AI Receive Abort');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Receive Abort', 'AI', () => new AIReceiveAbortNode());

export class FinishExecuteNode extends ClassicPreset.Node {
  constructor() {
    super('Finish Execute');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('success', new ClassicPreset.Input(boolSocket, 'Success'));
  }
}
registerNode('Finish Execute', 'AI', () => new FinishExecuteNode());

// ============================================================
//  Decorator Nodes
// ============================================================

export class AIPerformConditionCheckNode extends ClassicPreset.Node {
  constructor() {
    super('AI Perform Condition Check');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Perform Condition Check', 'AI', () => new AIPerformConditionCheckNode());

export class AIObserverActivatedNode extends ClassicPreset.Node {
  constructor() {
    super('AI Observer Activated');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Observer Activated', 'AI', () => new AIObserverActivatedNode());

export class AIObserverDeactivatedNode extends ClassicPreset.Node {
  constructor() {
    super('AI Observer Deactivated');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Observer Deactivated', 'AI', () => new AIObserverDeactivatedNode());

export class ReturnNode extends ClassicPreset.Node {
  constructor() {
    super('Return Node');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('canExecute', new ClassicPreset.Input(boolSocket, 'Can Execute'));
  }
}
registerNode('Return Node', 'AI', () => new ReturnNode());

// ============================================================
//  Service Nodes
// ============================================================

export class AIServiceActivatedNode extends ClassicPreset.Node {
  constructor() {
    super('AI Service Activated');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Service Activated', 'AI', () => new AIServiceActivatedNode());

export class AIServiceTickNode extends ClassicPreset.Node {
  constructor() {
    super('AI Service Tick');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
    this.addOutput('deltaTime', new ClassicPreset.Output(numSocket, 'Delta Time'));
  }
}
registerNode('AI Service Tick', 'AI', () => new AIServiceTickNode());

export class AIServiceDeactivatedNode extends ClassicPreset.Node {
  constructor() {
    super('AI Service Deactivated');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('ownerController', new ClassicPreset.Output(objectSocket, 'Owner Controller'));
    this.addOutput('controlledPawn', new ClassicPreset.Output(actorRefSocket, 'Controlled Pawn'));
  }
}
registerNode('AI Service Deactivated', 'AI', () => new AIServiceDeactivatedNode());

// ============================================================
//  AI Controller Nodes
// ============================================================

export class OnPossessNode extends ClassicPreset.Node {
  constructor() {
    super('On Possess');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('possessedPawn', new ClassicPreset.Output(actorRefSocket, 'Possessed Pawn'));
  }
}
registerNode('On Possess', 'AI', () => new OnPossessNode());

export class OnUnpossessNode extends ClassicPreset.Node {
  constructor() {
    super('On Unpossess');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('On Unpossess', 'AI', () => new OnUnpossessNode());

export class OnMoveCompletedNode extends ClassicPreset.Node {
  constructor() {
    super('On Move Completed');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('requestId', new ClassicPreset.Output(numSocket, 'Request ID'));
    this.addOutput('result', new ClassicPreset.Output(strSocket, 'Result'));
  }
}
registerNode('On Move Completed', 'AI', () => new OnMoveCompletedNode());

export class OnPerceptionUpdatedNode extends ClassicPreset.Node {
  constructor() {
    super('On Perception Updated');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('updatedActors', new ClassicPreset.Output(objectSocket, 'Updated Actors'));
  }
}
registerNode('On Perception Updated', 'AI', () => new OnPerceptionUpdatedNode());

export class RunBehaviorTreeNode extends ClassicPreset.Node {
  constructor() {
    super('Run Behavior Tree');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('behaviorTree', new ClassicPreset.Input(strSocket, 'Behavior Tree'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Run Behavior Tree', 'AI', () => new RunBehaviorTreeNode());

// ============================================================
//  Utility AI Nodes
// ============================================================

export class MoveToLocationNode extends ClassicPreset.Node {
  constructor() {
    super('AI Move To Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Acceptance Radius'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('AI Move To Location', 'AI', () => new MoveToLocationNode());

export class GetBlackboardValueNode extends ClassicPreset.Node {
  constructor() {
    super('Get Blackboard Value');
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key Name'));
    this.addOutput('value', new ClassicPreset.Output(objectSocket, 'Value'));
  }
}
registerNode('Get Blackboard Value', 'AI', () => new GetBlackboardValueNode());

export class SetBlackboardValueNode extends ClassicPreset.Node {
  constructor() {
    super('Set Blackboard Value');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key Name'));
    this.addInput('value', new ClassicPreset.Input(objectSocket, 'Value'));
  }
}
registerNode('Set Blackboard Value', 'AI', () => new SetBlackboardValueNode());

export class ClearBlackboardValueNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Blackboard Value');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('key', new ClassicPreset.Input(strSocket, 'Key Name'));
  }
}
registerNode('Clear Blackboard Value', 'AI', () => new ClearBlackboardValueNode());

export class RotateToFaceNode extends ClassicPreset.Node {
  constructor() {
    super('AI Rotate To Face');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Rotation Speed'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('AI Rotate To Face', 'AI', () => new RotateToFaceNode());
