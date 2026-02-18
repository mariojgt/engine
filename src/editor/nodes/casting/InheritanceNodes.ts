// ============================================================
//  InheritanceNodes — Blueprint nodes for class inheritance queries
//
//  Provides:
//    • Get Parent Class         — Returns the parent class ID/name of the current actor
//    • Get Child Classes        — Returns array of child class IDs for a given class
//    • Is Child Of              — Boolean check if actor is a child of a given class
//    • Get Class Name           — Gets the class name of the current actor blueprint
//    • Get Ancestry Chain       — Returns the full ancestry chain of a class
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  objectSocket,
  numSocket,
  boolSocket,
  strSocket,
  registerNode,
} from '../sockets';

// ============================================================
//  Get Parent Class — returns parent class info of current actor
// ============================================================
export class GetParentClassNode extends ClassicPreset.Node {
  constructor() {
    super('Get Parent Class');

    // Input: actor reference (optional — defaults to Self)
    this.addInput('actor', new ClassicPreset.Input(objectSocket, 'Actor'));

    // Outputs
    this.addOutput('parentId', new ClassicPreset.Output(strSocket, 'Parent Class ID'));
    this.addOutput('parentName', new ClassicPreset.Output(strSocket, 'Parent Class Name'));
    this.addOutput('hasParent', new ClassicPreset.Output(boolSocket, 'Has Parent'));
  }
}
registerNode('Get Parent Class', 'Inheritance', () => new GetParentClassNode());

// ============================================================
//  Get Child Classes — returns all child class IDs of a given class
// ============================================================
export class GetChildClassesNode extends ClassicPreset.Node {
  constructor() {
    super('Get Child Classes');

    // Input: class ID to query children
    this.addInput('classId', new ClassicPreset.Input(strSocket, 'Class ID'));

    // Outputs
    this.addOutput('childIds', new ClassicPreset.Output(strSocket, 'Child IDs (CSV)'));
    this.addOutput('childCount', new ClassicPreset.Output(numSocket, 'Child Count'));
    this.addOutput('hasChildren', new ClassicPreset.Output(boolSocket, 'Has Children'));
  }
}
registerNode('Get Child Classes', 'Inheritance', () => new GetChildClassesNode());

// ============================================================
//  Is Child Of — boolean check if a class is a descendant of another
// ============================================================
export class IsChildOfNode extends ClassicPreset.Node {
  constructor() {
    super('Is Child Of');

    // Inputs
    this.addInput('childActor', new ClassicPreset.Input(objectSocket, 'Actor'));
    this.addInput('parentClassId', new ClassicPreset.Input(strSocket, 'Parent Class ID'));

    // Outputs
    this.addOutput('result', new ClassicPreset.Output(boolSocket, 'Is Child'));
  }
}
registerNode('Is Child Of', 'Inheritance', () => new IsChildOfNode());

// ============================================================
//  Get Class Name — returns the class name of the current actor blueprint
// ============================================================
export class GetClassNameNode extends ClassicPreset.Node {
  constructor() {
    super('Get Class Name');

    this.addInput('actor', new ClassicPreset.Input(objectSocket, 'Actor'));

    this.addOutput('className', new ClassicPreset.Output(strSocket, 'Class Name'));
    this.addOutput('classId', new ClassicPreset.Output(strSocket, 'Class ID'));
  }
}
registerNode('Get Class Name', 'Inheritance', () => new GetClassNameNode());

// ============================================================
//  Get Ancestry Chain — returns the full parent chain as CSV
// ============================================================
export class GetAncestryChainNode extends ClassicPreset.Node {
  constructor() {
    super('Get Ancestry Chain');

    this.addInput('classId', new ClassicPreset.Input(strSocket, 'Class ID'));

    this.addOutput('chain', new ClassicPreset.Output(strSocket, 'Ancestry Chain (CSV)'));
    this.addOutput('depth', new ClassicPreset.Output(numSocket, 'Depth'));
  }
}
registerNode('Get Ancestry Chain', 'Inheritance', () => new GetAncestryChainNode());
