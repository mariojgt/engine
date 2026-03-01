// ============================================================
//  BehaviorTree — Runtime Executor for AI Behavior Trees
//  Implements standard BT nodes: Sequence, Selector, Task, Decorator
// ============================================================

export type BTNodeState = 'Success' | 'Failure' | 'Running';

export const BTNodeState = {
  Success: 'Success' as BTNodeState,
  Failure: 'Failure' as BTNodeState,
  Running: 'Running' as BTNodeState,
};

export interface BTContext {
  aiController: any;
  gameObject: any;
  blackboard: Map<string, any>;
  deltaTime: number;
}

export abstract class BTNode {
  public id: string = '';
  public name: string = '';
  
  abstract tick(context: BTContext): BTNodeState;
  
  abort(context: BTContext): void {
    // Override in subclasses if needed
  }
}

// ── Composites ──────────────────────────────────────────────

export class BTSequence extends BTNode {
  public children: BTNode[] = [];
  private _runningIndex: number = 0;

  tick(context: BTContext): BTNodeState {
    for (let i = this._runningIndex; i < this.children.length; i++) {
      const state = this.children[i].tick(context);
      
      if (state === BTNodeState.Running) {
        this._runningIndex = i;
        return BTNodeState.Running;
      }
      
      if (state === BTNodeState.Failure) {
        this._runningIndex = 0;
        return BTNodeState.Failure;
      }
    }
    
    this._runningIndex = 0;
    return BTNodeState.Success;
  }

  abort(context: BTContext): void {
    if (this._runningIndex < this.children.length) {
      this.children[this._runningIndex].abort(context);
    }
    this._runningIndex = 0;
  }
}

export class BTSelector extends BTNode {
  public children: BTNode[] = [];
  private _runningIndex: number = 0;

  tick(context: BTContext): BTNodeState {
    for (let i = this._runningIndex; i < this.children.length; i++) {
      const state = this.children[i].tick(context);
      
      if (state === BTNodeState.Running) {
        this._runningIndex = i;
        return BTNodeState.Running;
      }
      
      if (state === BTNodeState.Success) {
        this._runningIndex = 0;
        return BTNodeState.Success;
      }
    }
    
    this._runningIndex = 0;
    return BTNodeState.Failure;
  }

  abort(context: BTContext): void {
    if (this._runningIndex < this.children.length) {
      this.children[this._runningIndex].abort(context);
    }
    this._runningIndex = 0;
  }
}

// ── Decorators ──────────────────────────────────────────────

export class BTInverter extends BTNode {
  public child: BTNode | null = null;

  tick(context: BTContext): BTNodeState {
    if (!this.child) return BTNodeState.Success;
    
    const state = this.child.tick(context);
    if (state === BTNodeState.Success) return BTNodeState.Failure;
    if (state === BTNodeState.Failure) return BTNodeState.Success;
    return BTNodeState.Running;
  }

  abort(context: BTContext): void {
    this.child?.abort(context);
  }
}

export class BTForceSuccess extends BTNode {
  public child: BTNode | null = null;

  tick(context: BTContext): BTNodeState {
    if (!this.child) return BTNodeState.Success;
    
    const state = this.child.tick(context);
    if (state === BTNodeState.Running) return BTNodeState.Running;
    return BTNodeState.Success;
  }

  abort(context: BTContext): void {
    this.child?.abort(context);
  }
}

// ── Tasks ───────────────────────────────────────────────────

export class BTWaitTask extends BTNode {
  public waitTime: number = 1.0;
  private _elapsed: number = 0;

  tick(context: BTContext): BTNodeState {
    this._elapsed += context.deltaTime;
    if (this._elapsed >= this.waitTime) {
      this._elapsed = 0;
      return BTNodeState.Success;
    }
    return BTNodeState.Running;
  }

  abort(context: BTContext): void {
    this._elapsed = 0;
  }
}

export class BTCustomTask extends BTNode {
  public executeFn: ((context: BTContext) => BTNodeState) | null = null;
  public abortFn: ((context: BTContext) => void) | null = null;

  tick(context: BTContext): BTNodeState {
    if (this.executeFn) {
      return this.executeFn(context);
    }
    return BTNodeState.Success;
  }

  abort(context: BTContext): void {
    if (this.abortFn) {
      this.abortFn(context);
    }
  }
}

// ── Tree Runner ─────────────────────────────────────────────

export class BehaviorTree {
  public root: BTNode | null = null;
  public isRunning: boolean = false;
  private _tickLogged = false;
  private _loopCount = 0;

  tick(context: BTContext): void {
    if (!this.root) return;
    if (!this._tickLogged) {
      this._tickLogged = true;
      console.log(`[BT] BehaviorTree starting: root=${this.root.constructor.name} name="${this.root.name}"`);
    }
    this.isRunning = true;
    
    const state = this.root.tick(context);
    
    // When the tree completes (Success or Failure), log the restart so the user
    // can confirm it IS looping. Root's _runningIndex is already reset to 0
    // by BTSequence/BTSelector, so the next tick() call starts fresh automatically.
    if (state !== BTNodeState.Running) {
      this._loopCount++;
      console.log(`[BT] Loop #${this._loopCount} complete (${state}) — restarting next frame`);
    }
  }

  abort(context: BTContext): void {
    if (this.root) {
      this.root.abort(context);
    }
    this.isRunning = false;
  }
}
