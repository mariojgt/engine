import { ClassicPreset } from 'rete';
import { execSocket, objectSocket } from '../sockets';
import { socketForType } from '../variables/VariableNodes';
import type { VarType } from '../../BlueprintData';

// ============================================================
//  Custom Event Node — defines a user-created event entry point.
//  Placed in the event graph; acts like a function definition.
//  Exec output leads to the event body.
//  Has one output per parameter so the body can read the values.
// ============================================================
export class CustomEventNode extends ClassicPreset.Node {
  public eventId: string;
  public eventName: string;
  public eventParams: { name: string; type: VarType }[];

  constructor(eventId: string, eventName: string, params: { name: string; type: VarType }[] = []) {
    super(eventName);
    this.eventId = eventId;
    this.eventName = eventName;
    this.eventParams = params;
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    for (const p of params) {
      this.addOutput(p.name, new ClassicPreset.Output(socketForType(p.type), p.name));
    }
  }
}

// ============================================================
//  Call Custom Event Node — triggers a custom event by name.
//  Has exec in/out so it can be chained in execution flow.
//  Has one input per parameter so the caller can supply values.
// ============================================================
export class CallCustomEventNode extends ClassicPreset.Node {
  public eventId: string;
  public eventName: string;
  public eventParams: { name: string; type: VarType }[];
  public targetActorId?: string;

  constructor(eventId: string, eventName: string, params: { name: string; type: VarType }[] = [], targetActorId?: string) {
    super(`Call ${eventName}`);
    this.eventId = eventId;
    this.eventName = eventName;
    this.eventParams = params;
    this.targetActorId = targetActorId;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('target', new ClassicPreset.Input(objectSocket, 'Target'));
    for (const p of params) {
      this.addInput(p.name, new ClassicPreset.Input(socketForType(p.type), p.name));
    }
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
