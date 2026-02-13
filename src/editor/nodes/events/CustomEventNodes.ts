import { ClassicPreset } from 'rete';
import { execSocket } from '../sockets';

// ============================================================
//  Custom Event Node — defines a user-created event entry point.
//  Placed in the event graph; acts like a function definition.
//  Exec output leads to the event body.
// ============================================================
export class CustomEventNode extends ClassicPreset.Node {
  public eventId: string;
  public eventName: string;

  constructor(eventId: string, eventName: string) {
    super(eventName);
    this.eventId = eventId;
    this.eventName = eventName;
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ============================================================
//  Call Custom Event Node — triggers a custom event by name.
//  Has exec in/out so it can be chained in execution flow.
// ============================================================
export class CallCustomEventNode extends ClassicPreset.Node {
  public eventId: string;
  public eventName: string;

  constructor(eventId: string, eventName: string) {
    super(`Call ${eventName}`);
    this.eventId = eventId;
    this.eventName = eventName;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}
