import { ClassicPreset } from 'rete';
import { numSocket, boolSocket, strSocket, registerNode } from '../sockets';

// ============================================================
//  Line Trace Single — casts a ray and returns the first hit
// ============================================================
export class LineTraceSingleNode extends ClassicPreset.Node {
  constructor() {
    super('Line Trace Single');
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('maxDist', new ClassicPreset.Input(numSocket, 'Max Distance'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Hit X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Hit Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Hit Z'));
    this.addOutput('normalX', new ClassicPreset.Output(numSocket, 'Normal X'));
    this.addOutput('normalY', new ClassicPreset.Output(numSocket, 'Normal Y'));
    this.addOutput('normalZ', new ClassicPreset.Output(numSocket, 'Normal Z'));
    this.addOutput('hitActorId', new ClassicPreset.Output(numSocket, 'Hit Actor ID'));
    this.addOutput('hitActorName', new ClassicPreset.Output(strSocket, 'Hit Actor Name'));
  }
}

registerNode('Line Trace Single', 'Collision Queries', () => new LineTraceSingleNode());

// ============================================================
//  Line Trace Multi — casts a ray and returns all hits
// ============================================================
export class LineTraceMultiNode extends ClassicPreset.Node {
  constructor() {
    super('Line Trace Multi');
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('maxDist', new ClassicPreset.Input(numSocket, 'Max Distance'));
    this.addOutput('hitCount', new ClassicPreset.Output(numSocket, 'Hit Count'));
    this.addOutput('closestHitX', new ClassicPreset.Output(numSocket, 'Closest Hit X'));
    this.addOutput('closestHitY', new ClassicPreset.Output(numSocket, 'Closest Hit Y'));
    this.addOutput('closestHitZ', new ClassicPreset.Output(numSocket, 'Closest Hit Z'));
    this.addOutput('closestHitActorId', new ClassicPreset.Output(numSocket, 'Closest Hit Actor ID'));
    this.addOutput('closestHitActorName', new ClassicPreset.Output(strSocket, 'Closest Hit Actor Name'));
  }
}

registerNode('Line Trace Multi', 'Collision Queries', () => new LineTraceMultiNode());

// ============================================================
//  Sphere Trace — shape-cast a sphere along a direction
// ============================================================
export class SphereTraceNode extends ClassicPreset.Node {
  constructor() {
    super('Sphere Trace');
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addInput('maxDist', new ClassicPreset.Input(numSocket, 'Max Distance'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Hit X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Hit Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Hit Z'));
    this.addOutput('hitActorId', new ClassicPreset.Output(numSocket, 'Hit Actor ID'));
    this.addOutput('hitActorName', new ClassicPreset.Output(strSocket, 'Hit Actor Name'));
  }
}

registerNode('Sphere Trace', 'Collision Queries', () => new SphereTraceNode());

// ============================================================
//  Box Trace — shape-cast a box along a direction
// ============================================================
export class BoxTraceSingleNode extends ClassicPreset.Node {
  constructor() {
    super('Box Trace');
    this.addInput('startX', new ClassicPreset.Input(numSocket, 'Start X'));
    this.addInput('startY', new ClassicPreset.Input(numSocket, 'Start Y'));
    this.addInput('startZ', new ClassicPreset.Input(numSocket, 'Start Z'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('halfX', new ClassicPreset.Input(numSocket, 'Half X'));
    this.addInput('halfY', new ClassicPreset.Input(numSocket, 'Half Y'));
    this.addInput('halfZ', new ClassicPreset.Input(numSocket, 'Half Z'));
    this.addInput('maxDist', new ClassicPreset.Input(numSocket, 'Max Distance'));
    this.addOutput('hit', new ClassicPreset.Output(boolSocket, 'Hit'));
    this.addOutput('distance', new ClassicPreset.Output(numSocket, 'Distance'));
    this.addOutput('hitX', new ClassicPreset.Output(numSocket, 'Hit X'));
    this.addOutput('hitY', new ClassicPreset.Output(numSocket, 'Hit Y'));
    this.addOutput('hitZ', new ClassicPreset.Output(numSocket, 'Hit Z'));
    this.addOutput('hitActorId', new ClassicPreset.Output(numSocket, 'Hit Actor ID'));
    this.addOutput('hitActorName', new ClassicPreset.Output(strSocket, 'Hit Actor Name'));
  }
}

registerNode('Box Trace', 'Collision Queries', () => new BoxTraceSingleNode());

// ============================================================
//  Overlap Sphere — find all actors inside a sphere
// ============================================================
export class OverlapSphereNode extends ClassicPreset.Node {
  constructor() {
    super('Overlap Sphere');
    this.addInput('cx', new ClassicPreset.Input(numSocket, 'Center X'));
    this.addInput('cy', new ClassicPreset.Input(numSocket, 'Center Y'));
    this.addInput('cz', new ClassicPreset.Input(numSocket, 'Center Z'));
    this.addInput('radius', new ClassicPreset.Input(numSocket, 'Radius'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

registerNode('Overlap Sphere', 'Collision Queries', () => new OverlapSphereNode());

// ============================================================
//  Overlap Box — find all actors inside a box
// ============================================================
export class OverlapBoxNode extends ClassicPreset.Node {
  constructor() {
    super('Overlap Box');
    this.addInput('cx', new ClassicPreset.Input(numSocket, 'Center X'));
    this.addInput('cy', new ClassicPreset.Input(numSocket, 'Center Y'));
    this.addInput('cz', new ClassicPreset.Input(numSocket, 'Center Z'));
    this.addInput('halfX', new ClassicPreset.Input(numSocket, 'Half X'));
    this.addInput('halfY', new ClassicPreset.Input(numSocket, 'Half Y'));
    this.addInput('halfZ', new ClassicPreset.Input(numSocket, 'Half Z'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}

registerNode('Overlap Box', 'Collision Queries', () => new OverlapBoxNode());

// ============================================================
//  Point Is Inside — checks if a point is inside an actor's collider
// ============================================================
export class PointIsInsideNode extends ClassicPreset.Node {
  constructor() {
    super('Point Is Inside');
    this.addInput('px', new ClassicPreset.Input(numSocket, 'Point X'));
    this.addInput('py', new ClassicPreset.Input(numSocket, 'Point Y'));
    this.addInput('pz', new ClassicPreset.Input(numSocket, 'Point Z'));
    this.addOutput('inside', new ClassicPreset.Output(boolSocket, 'Inside'));
  }
}

registerNode('Point Is Inside', 'Collision Queries', () => new PointIsInsideNode());
