// ============================================================
//  SpawningNodes — UE5-style Actor Spawning & Destruction
//
//  • Spawn Actor from Class — with Expose on Spawn support
//  • Destroy Actor
//  • Spawn Emitter at Location
//  • Spawn Sound at Location
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  strSocket,
  objectSocket,
  registerNode,
  getClassRefSocket,
} from '../sockets';
import { socketForType } from '../variables/VariableNodes';
import type { VarType } from '../../BlueprintData';

// ============================================================
//  Actor Class Select Control — dropdown for selecting an actor class
//  Rendered as a <select> inside the node (like SceneSelectControl).
// ============================================================
export class ActorClassSelectControl extends ClassicPreset.Control {
  public value: string;        // ActorAsset ID
  public displayName: string;  // Human-readable name
  public onChange: ((classId: string, className: string) => void) | null = null;

  constructor(initialId = '', initialName = '') {
    super();
    this.value = initialId;
    this.displayName = initialName;
  }

  setValue(id: string, name?: string) {
    this.value = id;
    if (name !== undefined) this.displayName = name;
    if (this.onChange) this.onChange(id, this.displayName);
  }
}

// ============================================================
//  Refresh Nodes Control — button to refresh Expose on Spawn pins
// ============================================================
export class RefreshNodesControl extends ClassicPreset.Control {
  public onClick: (() => void) | null = null;
  constructor() {
    super();
  }
}

// ============================================================
//  Spawn Actor from Class
//  Creates a new actor instance at runtime.
//  Uses ActorClassSelectControl for class selection dropdown.
//  When a class is selected, dynamically adds input pins for
//  any blueprint variables marked "Expose on Spawn".
// ============================================================
export class SpawnActorFromClassNode extends ClassicPreset.Node {
  /** The selected class ActorAsset ID (if set) */
  public targetClassId: string;
  public targetClassName: string;
  /** Expose on Spawn variable pins (dynamically added) */
  public exposedVars: { name: string; type: VarType; varId: string }[] = [];

  constructor(targetClassId: string = '', targetClassName: string = '') {
    super('Spawn Actor from Class');
    this.targetClassId = targetClassId;
    this.targetClassName = targetClassName;

    // Class selection dropdown control
    const classCtrl = new ActorClassSelectControl(targetClassId, targetClassName);
    classCtrl.onChange = (id, name) => {
      this.targetClassId = id;
      this.targetClassName = name;
    };
    // Stash parent node reference so the renderer can rebuild expose-on-spawn pins
    (classCtrl as any).__parentNode = this;
    this.addControl('actorClass', classCtrl);

    // Standard inputs
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    // Transform inputs
    this.addInput('locX', new ClassicPreset.Input(numSocket, 'Location X'));
    this.addInput('locY', new ClassicPreset.Input(numSocket, 'Location Y'));
    this.addInput('locZ', new ClassicPreset.Input(numSocket, 'Location Z'));
    this.addInput('rotX', new ClassicPreset.Input(numSocket, 'Rotation X'));
    this.addInput('rotY', new ClassicPreset.Input(numSocket, 'Rotation Y'));
    this.addInput('rotZ', new ClassicPreset.Input(numSocket, 'Rotation Z'));
    this.addInput('scaleX', new ClassicPreset.Input(numSocket, 'Scale X'));
    this.addInput('scaleY', new ClassicPreset.Input(numSocket, 'Scale Y'));
    this.addInput('scaleZ', new ClassicPreset.Input(numSocket, 'Scale Z'));
    this.addInput('owner', new ClassicPreset.Input(objectSocket, 'Owner'));

    // Refresh Nodes button — re-checks Expose on Spawn vars
    const refreshCtrl = new RefreshNodesControl();
    (refreshCtrl as any).__parentNode = this;
    this.addControl('refreshNodes', refreshCtrl);

    // Outputs
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('returnValue', new ClassicPreset.Output(
      targetClassId ? getClassRefSocket(targetClassId) : objectSocket,
      'Return Value',
    ));
  }

  /**
   * Rebuild Expose on Spawn pins.
   * Called when the user selects/changes the class reference.
   */
  setExposedVars(vars: { name: string; type: VarType; varId: string }[]): void {
    // Remove old exposed pins
    for (const v of this.exposedVars) {
      try { this.removeInput(`exposed_${v.varId}`); } catch { /* pin may not exist */ }
    }
    this.exposedVars = vars;
    // Add new exposed pins
    for (const v of vars) {
      this.addInput(`exposed_${v.varId}`, new ClassicPreset.Input(socketForType(v.type), `[E] ${v.name}`));
    }
  }

  /** Convenience: get the class control */
  getClassControl(): ActorClassSelectControl | undefined {
    return this.controls['actorClass'] as ActorClassSelectControl | undefined;
  }
}

// Not registered statically — created dynamically via class selection UI.
// But we register a generic version for the search palette.
registerNode('Spawn Actor from Class', 'Spawning', () => new SpawnActorFromClassNode());

// ============================================================
//  Destroy Actor
//  Removes an actor from the scene at runtime.
// ============================================================
export class DestroyActorNode extends ClassicPreset.Node {
  constructor() {
    super('Destroy Actor');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Destroy Actor', 'Spawning', () => new DestroyActorNode());

// ============================================================
//  Spawn Emitter at Location
//  Creates a particle effect at a world position.
// ============================================================
export class SpawnEmitterAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Spawn Emitter at Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('template', new ClassicPreset.Input(strSocket, 'Emitter Template'));
    this.addInput('locX', new ClassicPreset.Input(numSocket, 'Location X'));
    this.addInput('locY', new ClassicPreset.Input(numSocket, 'Location Y'));
    this.addInput('locZ', new ClassicPreset.Input(numSocket, 'Location Z'));
    this.addInput('rotX', new ClassicPreset.Input(numSocket, 'Rotation X'));
    this.addInput('rotY', new ClassicPreset.Input(numSocket, 'Rotation Y'));
    this.addInput('rotZ', new ClassicPreset.Input(numSocket, 'Rotation Z'));
    this.addInput('scaleX', new ClassicPreset.Input(numSocket, 'Scale X'));
    this.addInput('scaleY', new ClassicPreset.Input(numSocket, 'Scale Y'));
    this.addInput('scaleZ', new ClassicPreset.Input(numSocket, 'Scale Z'));
    this.addInput('autoDestroy', new ClassicPreset.Input(boolSocket, 'Auto Destroy'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('returnValue', new ClassicPreset.Output(objectSocket, 'Return Value'));
  }
}

registerNode('Spawn Emitter at Location', 'Spawning', () => new SpawnEmitterAtLocationNode());

// ============================================================
//  Spawn Sound at Location
//  Plays a sound effect at a world position.
// ============================================================
export class SpawnSoundAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Spawn Sound at Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sound', new ClassicPreset.Input(strSocket, 'Sound'));
    this.addInput('locX', new ClassicPreset.Input(numSocket, 'Location X'));
    this.addInput('locY', new ClassicPreset.Input(numSocket, 'Location Y'));
    this.addInput('locZ', new ClassicPreset.Input(numSocket, 'Location Z'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addInput('pitch', new ClassicPreset.Input(numSocket, 'Pitch'));
    this.addInput('startTime', new ClassicPreset.Input(numSocket, 'Start Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Spawn Sound at Location', 'Spawning', () => new SpawnSoundAtLocationNode());
