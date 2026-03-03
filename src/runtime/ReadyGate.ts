// ============================================================
//  ReadyGate — Ensures BeginPlay fires only after all systems
//  are fully initialized and all assets are loaded.
//
//  The same gate is used in both Play mode and exported builds.
//  No more timing differences between contexts.
// ============================================================

export class ReadyGate {
  private _conditions = new Map<string, boolean>();
  private _onReady: (() => void) | null = null;
  private _fired = false;

  /**
   * Register a condition that must be met before BeginPlay fires.
   * Call this during initialization for each async system.
   */
  addCondition(name: string): void {
    if (this._fired) {
      console.warn(`[ReadyGate] Condition "${name}" added after gate already fired`);
      return;
    }
    this._conditions.set(name, false);
  }

  /**
   * Mark a condition as satisfied.
   * If all conditions are met, the onReady callback fires.
   */
  satisfy(name: string): void {
    if (!this._conditions.has(name)) {
      console.warn(`[ReadyGate] Unknown condition "${name}"`);
      return;
    }
    this._conditions.set(name, true);
    this._checkAndFire();
  }

  /**
   * Set the callback to invoke when all conditions are satisfied.
   * If all conditions are already met, fires immediately.
   */
  onReady(callback: () => void): void {
    this._onReady = callback;
    this._checkAndFire();
  }

  /**
   * Check if all conditions are satisfied.
   */
  isReady(): boolean {
    for (const [, satisfied] of this._conditions) {
      if (!satisfied) return false;
    }
    return true;
  }

  /**
   * Get the list of unsatisfied conditions (for debugging).
   */
  getPendingConditions(): string[] {
    const pending: string[] = [];
    for (const [name, satisfied] of this._conditions) {
      if (!satisfied) pending.push(name);
    }
    return pending;
  }

  /**
   * Reset the gate for a new scene load.
   */
  reset(): void {
    this._conditions.clear();
    this._onReady = null;
    this._fired = false;
  }

  private _checkAndFire(): void {
    if (this._fired || !this._onReady) return;
    if (!this.isReady()) return;
    this._fired = true;
    this._onReady();
  }
}
