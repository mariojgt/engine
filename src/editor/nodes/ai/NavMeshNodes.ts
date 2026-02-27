// ============================================================
//  NavMesh Blueprint Nodes
//  Visual scripting nodes for NavMesh pathfinding and crowd
//  management. These appear in the 'AI' category.
// ============================================================

import { ClassicPreset } from 'rete';
import { registerNode, execSocket, numSocket, boolSocket, vec3Socket, strSocket, objectSocket, actorRefSocket } from '../sockets';

// ============================================================
//  NavMesh Build / Query Nodes
// ============================================================

/** Build NavMesh from the current scene at runtime */
export class NavMeshBuildNode extends ClassicPreset.Node {
  constructor() {
    super('Build NavMesh');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('Build NavMesh', 'AI', () => new NavMeshBuildNode());

/** Check if NavMesh is ready (built) */
export class NavMeshIsReadyNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Is Ready');
    this.addOutput('isReady', new ClassicPreset.Output(boolSocket, 'Is Ready'));
  }
}
registerNode('NavMesh Is Ready', 'AI', () => new NavMeshIsReadyNode());

// ============================================================
//  Pathfinding Nodes
// ============================================================

/** Find path between two positions using NavMesh */
export class NavMeshFindPathNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Find Path');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('start', new ClassicPreset.Input(vec3Socket, 'Start'));
    this.addInput('end', new ClassicPreset.Input(vec3Socket, 'End'));
    this.addOutput('path', new ClassicPreset.Output(objectSocket, 'Path'));
    this.addOutput('pathFound', new ClassicPreset.Output(boolSocket, 'Path Found'));
  }
}
registerNode('NavMesh Find Path', 'AI', () => new NavMeshFindPathNode());

/** Find closest point on NavMesh */
export class NavMeshFindClosestPointNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Closest Point');
    this.addInput('position', new ClassicPreset.Input(vec3Socket, 'Position'));
    this.addOutput('closestPoint', new ClassicPreset.Output(vec3Socket, 'Closest Point'));
    this.addOutput('found', new ClassicPreset.Output(boolSocket, 'Found'));
  }
}
registerNode('NavMesh Closest Point', 'AI', () => new NavMeshFindClosestPointNode());

/** Find random navigable point around a location */
export class NavMeshRandomPointNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Random Point');
    this.addInput('center', new ClassicPreset.Input(vec3Socket, 'Center'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addOutput('point', new ClassicPreset.Output(vec3Socket, 'Random Point'));
    this.addOutput('found', new ClassicPreset.Output(boolSocket, 'Found'));
  }
}
registerNode('NavMesh Random Point', 'AI', () => new NavMeshRandomPointNode());

// ============================================================
//  Agent Nodes (Crowd)
// ============================================================

/** Add a crowd agent to the NavMesh system */
export class NavMeshAddAgentNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Add Agent');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('actor', new ClassicPreset.Input(actorRefSocket, 'Actor'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Max Speed'));
    this.addOutput('agentId', new ClassicPreset.Output(strSocket, 'Agent ID'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('NavMesh Add Agent', 'AI', () => new NavMeshAddAgentNode());

/** Remove a crowd agent */
export class NavMeshRemoveAgentNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Remove Agent');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('agentId', new ClassicPreset.Input(strSocket, 'Agent ID'));
  }
}
registerNode('NavMesh Remove Agent', 'AI', () => new NavMeshRemoveAgentNode());

/** Request crowd agent to move to target */
export class NavMeshAgentMoveToNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Agent Move To');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('agentId', new ClassicPreset.Input(strSocket, 'Agent ID'));
    this.addInput('target', new ClassicPreset.Input(vec3Socket, 'Target'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('NavMesh Agent Move To', 'AI', () => new NavMeshAgentMoveToNode());

/** Get crowd agent position */
export class NavMeshGetAgentPositionNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Agent Position');
    this.addInput('agentId', new ClassicPreset.Input(strSocket, 'Agent ID'));
    this.addOutput('position', new ClassicPreset.Output(vec3Socket, 'Position'));
  }
}
registerNode('NavMesh Agent Position', 'AI', () => new NavMeshGetAgentPositionNode());

/** Get crowd agent velocity */
export class NavMeshGetAgentVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Agent Velocity');
    this.addInput('agentId', new ClassicPreset.Input(strSocket, 'Agent ID'));
    this.addOutput('velocity', new ClassicPreset.Output(vec3Socket, 'Velocity'));
  }
}
registerNode('NavMesh Agent Velocity', 'AI', () => new NavMeshGetAgentVelocityNode());

/** Check if crowd agent has reached target */
export class NavMeshAgentReachedTargetNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Agent Reached');
    this.addInput('agentId', new ClassicPreset.Input(strSocket, 'Agent ID'));
    this.addInput('threshold', new ClassicPreset.Input(numSocket, 'Threshold'));
    this.addOutput('reached', new ClassicPreset.Output(boolSocket, 'Reached'));
  }
}
registerNode('NavMesh Agent Reached', 'AI', () => new NavMeshAgentReachedTargetNode());

// ============================================================
//  Obstacle Nodes
// ============================================================

/** Add a box obstacle to the NavMesh */
export class NavMeshAddBoxObstacleNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Add Box Obstacle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('id', new ClassicPreset.Input(strSocket, 'Obstacle ID'));
    this.addInput('position', new ClassicPreset.Input(vec3Socket, 'Position'));
    this.addInput('halfExtents', new ClassicPreset.Input(vec3Socket, 'Half Extents'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('NavMesh Add Box Obstacle', 'AI', () => new NavMeshAddBoxObstacleNode());

/** Add a cylinder obstacle to the NavMesh */
export class NavMeshAddCylinderObstacleNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Add Cylinder Obstacle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('id', new ClassicPreset.Input(strSocket, 'Obstacle ID'));
    this.addInput('position', new ClassicPreset.Input(vec3Socket, 'Position'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('height', new ClassicPreset.Input(numSocket, 'Height'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('NavMesh Add Cylinder Obstacle', 'AI', () => new NavMeshAddCylinderObstacleNode());

/** Remove an obstacle from the NavMesh */
export class NavMeshRemoveObstacleNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Remove Obstacle');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
    this.addInput('id', new ClassicPreset.Input(strSocket, 'Obstacle ID'));
    this.addOutput('success', new ClassicPreset.Output(boolSocket, 'Success'));
  }
}
registerNode('NavMesh Remove Obstacle', 'AI', () => new NavMeshRemoveObstacleNode());

// ============================================================
//  Debug Nodes
// ============================================================

/** Toggle NavMesh debug visualization */
export class NavMeshToggleDebugNode extends ClassicPreset.Node {
  constructor() {
    super('NavMesh Toggle Debug');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('execOut', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('NavMesh Toggle Debug', 'AI', () => new NavMeshToggleDebugNode());
