import { ClassicPreset } from 'rete';
import { registerNode, execSocket, anySocket, numSocket, boolSocket, strSocket, vec3Socket, objectSocket } from '../sockets';
import { EventSelectControl } from './EventSelectControl';
import { EventAssetManager, type EventPayloadField } from '../../EventAsset';

/** Map EventAsset field type → socket */
function socketForType(type: string): ClassicPreset.Socket {
  switch (type) {
    case 'Boolean': return boolSocket;
    case 'Integer':
    case 'Float':   return numSocket;
    case 'String':  return strSocket;
    case 'Vector3': return vec3Socket;
    case 'Object':  return objectSocket;
    default:        return anySocket;
  }
}

export class EmitEventNode extends ClassicPreset.Node {
  /** Tracks which dynamic payload input keys are present */
  private _dynamicInputKeys: string[] = [];

  constructor() {
    super('Emit Event');
    this.addInput('exec', new ClassicPreset.Input(execSocket, 'Exec'));

    const ctrl = new EventSelectControl('', (val) => {
      ctrl.value = val;
      this.syncPayloadPins();
    });
    (ctrl as any)._parentNode = this;
    this.addControl('eventId', ctrl);

    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }

  /** Rebuild dynamic input pins from the selected event's payloadFields */
  syncPayloadPins(): void {
    // Remove old dynamic input pins
    for (const key of this._dynamicInputKeys) {
      if (this.inputs[key]) this.removeInput(key);
    }
    this._dynamicInputKeys = [];

    const eventId = (this.controls.eventId as EventSelectControl).value;
    if (!eventId) return;

    const mgr = EventAssetManager.getInstance();
    const asset = mgr?.getAsset(eventId);
    if (!asset || asset.payloadFields.length === 0) return;

    for (const field of asset.payloadFields) {
      const key = `field_${field.name}`;
      this.addInput(key, new ClassicPreset.Input(socketForType(field.type), field.name));
      this._dynamicInputKeys.push(key);
    }
  }

  /** Returns the currently active dynamic field keys */
  getDynamicInputKeys(): string[] {
    return [...this._dynamicInputKeys];
  }

  execute(inputs: any, ctx: any): any {
    const eventId = (this.controls.eventId as EventSelectControl).value;
    if (eventId && ctx.engine?.eventBus) {
      const mgr = EventAssetManager.getInstance();
      const eventAsset = mgr?.getAsset(eventId);
      if (eventAsset) {
        const payload: Record<string, any> = {};
        for (const key of this._dynamicInputKeys) {
          const fieldName = key.replace('field_', '');
          payload[fieldName] = inputs[key]?.[0] ?? null;
        }
        ctx.engine.eventBus.emit(eventAsset.name, payload);
      }
    }
    return { exec: true };
  }

  generateCode(nodeId: string, ctx: any): string {
    const eventId = (this.controls.eventId as EventSelectControl).value;
    let eventName = '""';
    if (eventId) {
      const mgr = EventAssetManager.getInstance();
      const eventAsset = mgr?.getAsset(eventId);
      if (eventAsset) eventName = `"${eventAsset.name}"`;
    }
    return `
      // Emit Event
      if (__engine && __engine.eventBus) { __engine.eventBus.emit(${eventName}, null); }
      ${ctx.execNext(nodeId, 'exec')}
    `;
  }
}

registerNode('Emit Event', 'Events', () => new EmitEventNode());
