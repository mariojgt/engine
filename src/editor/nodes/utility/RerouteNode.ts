import { ClassicPreset } from 'rete';

/**
 * RerouteNode — A tiny pass-through waypoint node (UE-style).
 *
 * It has a single input and a single output that both use the SAME socket type.
 * The socket type is dynamically set when the node is connected — the first
 * wire plugged in determines it.  Subsequent wires must match.
 *
 * Visual appearance is a small circle matching the wire colour, with no title
 * bar, no category strip, and no body — just the dot.  Custom CSS class
 * `.fe-reroute` controls the look.
 */
export class RerouteNode extends ClassicPreset.Node {
  /** The socket currently passing through (null = not yet assigned). */
  public passSocket: ClassicPreset.Socket | null = null;

  /** Set to true so code-gen knows this node is data-only (no exec action). */
  public readonly __isReroute = true;

  constructor(socket?: ClassicPreset.Socket) {
    super('Reroute');
    const sock = socket ?? new ClassicPreset.Socket('Any');
    this.passSocket = socket ?? null;
    this.addInput('in', new ClassicPreset.Input(sock, ''));
    this.addOutput('out', new ClassicPreset.Output(sock, ''));
  }

  /** Change the socket type flowing through (e.g. when first wire connects). */
  setSocket(sock: ClassicPreset.Socket): void {
    this.passSocket = sock;
    // Replace the existing input/output with the new socket type
    this.removeInput('in');
    this.removeOutput('out');
    this.addInput('in', new ClassicPreset.Input(sock, ''));
    this.addOutput('out', new ClassicPreset.Output(sock, ''));
  }
}
