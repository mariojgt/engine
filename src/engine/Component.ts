import type { GameObject } from './GameObject';
import type { ScriptContext } from './ScriptComponent';

export abstract class Component {
  public gameObject!: GameObject;
  public enabled: boolean = true;
  
  /** Called when component is added to a GameObject */
  onAttach(gameObject: GameObject): void {
    this.gameObject = gameObject;
  }

  /** Called when component is removed or GameObject is destroyed */
  onDetach(): void {
    // cleanup
  }

  /** Helper to get other components */
  getComponent<T extends Component>(ctor: new (...args: any[]) => T): T | null {
    return this.gameObject.getComponent(ctor);
  }

  // Lifecycle hooks (optional)
  start?(ctx: ScriptContext): void;
  update?(ctx: ScriptContext): void;
  onDestroy?(ctx: ScriptContext): void;
}
