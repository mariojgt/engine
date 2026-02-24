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

export class OnEventNode extends ClassicPreset.Node {
  /** Tracks which dynamic payload output keys are present */
  private _dynamicOutputKeys: string[] = [];

  constructor() {
    super('On Event');

    const ctrl = new EventSelectControl('', (val) => {
      ctrl.value = val;
      this.syncPayloadPins();
    });
    (ctrl as any)._parentNode = this;
    this.addControl('eventId', ctrl);

    this.addOutput('exec', new ClassicPreset.Output(execSocket, 'Exec'));
  }

  /** Rebuild dynamic output pins from the selected event's payloadFields */
  syncPayloadPins(): void {
    // Remove old dynamic output pins
    for (const key of this._dynamicOutputKeys) {
      if (this.outputs[key]) this.removeOutput(key);
    }
    this._dynamicOutputKeys = [];

    const eventId = (this.controls.eventId as EventSelectControl).value;
    if (!eventId) return;

    const mgr = EventAssetManager.getInstance();
    const asset = mgr?.getAsset(eventId);
    if (!asset || asset.payloadFields.length === 0) return;

    for (const field of asset.payloadFields) {
      const key = `field_${field.name}`;
      this.addOutput(key, new ClassicPreset.Output(socketForType(field.type), field.name));
      this._dynamicOutputKeys.push(key);
    }
  }

  /** Returns the currently active dynamic field keys */
  getDynamicOutputKeys(): string[] {
    return [...this._dynamicOutputKeys];
  }

  execute(inputs: any, ctx: any): any {
    // This node is event-driven, so it doesn't execute sequentially
    return {};
  }

  generateCode(nodeId: string, ctx: any): string {
    const eventId = (this.controls.eventId as EventSelectControl).value;

    let eventName = '""';
    if (eventId) {
      const mgr = EventAssetManager.getInstance();
      const eventAsset = mgr?.getAsset(eventId);
      if (eventAsset) {
        eventName = `"${eventAsset.name}"`;
      }
    }

    const handlerName = `__eventHandler_${nodeId.replace(/-/g, '_')}`;

    ctx.addBeginPlayCode(`
      this.${handlerName} = (payload) => {
        const __payload = payload;
        ${ctx.execNext(nodeId, 'exec')}
      };
      if (__engine && __engine.eventBus) { __engine.eventBus.on(${eventName}, this.${handlerName}); }
    `);

    ctx.addOnDestroyCode(`
      if (this.${handlerName} && __engine && __engine.eventBus) {
        __engine.eventBus.off(${eventName}, this.${handlerName});
      }
    `);

    return ``;
  }
}

registerNode('On Event', 'Events', () => new OnEventNode());
