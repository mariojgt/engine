// ============================================================
//  DragSelectionNodes — UE-style Marquee / Box Selection nodes
//
//  Blueprint nodes for the DragSelectionComponent.
//  Works like Unreal Engine's "Get Actors in Selection Rectangle"
//  paradigm.  Lets the user:
//    • Enable/disable drag-select on a camera
//    • Configure the class filter (which actor classes to select)
//    • React to selection-complete events
//    • Retrieve the selected actors array and iterate with ForEach
//    • Customise the visual appearance of the selection rectangle
//    • Set the input mode (game/UI) together with selection
//
//  Both 2D and 3D cameras are supported.
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  strSocket,
  objectSocket,
  actorRefSocket,
  actorArraySocket,
  registerNode,
} from '../sockets';
import { ActorClassSelectControl } from '../spawning/SpawningNodes';

// ================================================================
//  Enable Drag Selection
//  Initialises the DragSelectionComponent on the active camera.
//  Must be called once (usually in BeginPlay) before drag-select
//  will work.
// ================================================================
export class EnableDragSelectionNode extends ClassicPreset.Node {
  constructor() {
    super('Enable Drag Selection');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('mouseButton', new ClassicPreset.Input(numSocket, 'Mouse Button'));
    this.addControl('mouseButton', new ClassicPreset.InputControl('number', { initial: 0, readonly: false }));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Enable Drag Selection', 'Selection', () => new EnableDragSelectionNode());

// ================================================================
//  Disable Drag Selection
//  Tears down the DragSelectionComponent and removes the overlay.
// ================================================================
export class DisableDragSelectionNode extends ClassicPreset.Node {
  constructor() {
    super('Disable Drag Selection');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Disable Drag Selection', 'Selection', () => new DisableDragSelectionNode());

// ================================================================
//  Set Drag Selection Enabled
//  Toggles the enabled state on an already-initialised component
//  (without tearing it down).
// ================================================================
export class SetDragSelectionEnabledNode extends ClassicPreset.Node {
  constructor() {
    super('Set Drag Selection Enabled');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Drag Selection Enabled', 'Selection', () => new SetDragSelectionEnabledNode());

// ================================================================
//  On Drag Selection Complete — Event node
//  Fires when the user releases the mouse after a drag selection.
//  Outputs the selected actors array and count.
// ================================================================
export class OnDragSelectionCompleteNode extends ClassicPreset.Node {
  constructor() {
    super('On Drag Selection Complete');
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('selectedActors', new ClassicPreset.Output(actorArraySocket, 'Selected Actors (Actor Array)'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('On Drag Selection Complete', 'Selection', () => new OnDragSelectionCompleteNode());

// ================================================================
//  Get Selected Actors — Returns the array from the last selection
// ================================================================
export class GetSelectedActorsNode extends ClassicPreset.Node {
  constructor() {
    super('Get Selected Actors');
    this.addOutput('actors', new ClassicPreset.Output(actorArraySocket, 'Actors (Actor Array)'));
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Get Selected Actors', 'Selection', () => new GetSelectedActorsNode());

// ================================================================
//  Get Selected Actor At Index
// ================================================================
export class GetSelectedActorAtIndexNode extends ClassicPreset.Node {
  constructor() {
    super('Get Selected Actor At Index');
    this.addInput('index', new ClassicPreset.Input(numSocket, 'Index'));
    this.addOutput('actor', new ClassicPreset.Output(actorRefSocket, 'Actor'));
    this.addOutput('valid', new ClassicPreset.Output(boolSocket, 'Is Valid'));
  }
}
registerNode('Get Selected Actor At Index', 'Selection', () => new GetSelectedActorAtIndexNode());

// ================================================================
//  Set Drag Selection Class Filter
//  Sets the array of actor class IDs to filter on.
//  Use the dropdown to pick a class, or wire a string dynamically.
//  Pass an empty string or clear to select all.
// ================================================================
export class SetDragSelectionClassFilterNode extends ClassicPreset.Node {
  constructor() {
    super('Set Drag Selection Class Filter');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('className', new ClassicPreset.Input(strSocket, 'Class Name'));
    // Dropdown control for selecting from available actor classes
    const classCtrl = new ActorClassSelectControl('', '');
    this.addControl('actorClass', classCtrl);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Drag Selection Class Filter', 'Selection', () => new SetDragSelectionClassFilterNode());

// ================================================================
//  Add Drag Selection Class Filter
//  Adds a single class to the filter. Chain multiple for multi-class.
//  Use the dropdown to pick a class, or wire a string dynamically.
// ================================================================
export class AddDragSelectionClassFilterNode extends ClassicPreset.Node {
  constructor() {
    super('Add Drag Selection Class Filter');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('className', new ClassicPreset.Input(strSocket, 'Class Name'));
    // Dropdown control for selecting from available actor classes
    const classCtrl = new ActorClassSelectControl('', '');
    this.addControl('actorClass', classCtrl);
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Add Drag Selection Class Filter', 'Selection', () => new AddDragSelectionClassFilterNode());

// ================================================================
//  Clear Drag Selection Class Filter
//  Removes all class filters — selects all actors.
// ================================================================
export class ClearDragSelectionClassFilterNode extends ClassicPreset.Node {
  constructor() {
    super('Clear Drag Selection Class Filter');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Clear Drag Selection Class Filter', 'Selection', () => new ClearDragSelectionClassFilterNode());

// ================================================================
//  Set Drag Selection Style
//  Customise the visual look of the selection rectangle.
//  Supports fill color, border color/width/style, corner radius,
//  and overall opacity — similar to UE's selection rectangle.
// ================================================================
export class SetDragSelectionStyleNode extends ClassicPreset.Node {
  constructor() {
    super('Set Drag Selection Style');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fillColor', new ClassicPreset.Input(strSocket, 'Fill Color'));
    this.addInput('borderColor', new ClassicPreset.Input(strSocket, 'Border Color'));
    this.addInput('borderWidth', new ClassicPreset.Input(numSocket, 'Border Width'));
    this.addInput('borderStyle', new ClassicPreset.Input(strSocket, 'Border Style'));
    this.addInput('borderRadius', new ClassicPreset.Input(numSocket, 'Border Radius'));
    this.addInput('opacity', new ClassicPreset.Input(numSocket, 'Opacity'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
registerNode('Set Drag Selection Style', 'Selection', () => new SetDragSelectionStyleNode());

// ================================================================
//  Is Drag Selecting — Returns true while the user is mid-drag
// ================================================================
export class IsDragSelectingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Drag Selecting');
    this.addOutput('isDragging', new ClassicPreset.Output(boolSocket, 'Is Dragging'));
  }
}
registerNode('Is Drag Selecting', 'Selection', () => new IsDragSelectingNode());

// ================================================================
//  Get Drag Selection Count — Number of actors in last selection
// ================================================================
export class GetDragSelectionCountNode extends ClassicPreset.Node {
  constructor() {
    super('Get Drag Selection Count');
    this.addOutput('count', new ClassicPreset.Output(numSocket, 'Count'));
  }
}
registerNode('Get Drag Selection Count', 'Selection', () => new GetDragSelectionCountNode());
