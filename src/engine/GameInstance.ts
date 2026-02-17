// ============================================================
//  GameInstance — Runtime persistent object that survives scene loads.
//  Like UE4's UGameInstance, this object persists across scene
//  transitions and provides shared state (variables) and logic
//  (event graph) accessible from any blueprint via
//  "Get Game Instance" nodes.
// ============================================================

import { ScriptComponent, type ScriptContext } from './ScriptComponent';
import type { GameInstanceBlueprintAsset } from '../editor/GameInstanceData';

export class GameInstance {
  /** The blueprint asset this instance was created from */
  public asset: GameInstanceBlueprintAsset;
  /** Runtime script component (compiled event graph) */
  public script: ScriptComponent;
  /** Runtime variable storage — blueprint nodes read/write these */
  public variables: Record<string, any> = {};

  private _initialized = false;

  constructor(asset: GameInstanceBlueprintAsset) {
    this.asset = asset;
    this.script = new ScriptComponent();

    // Initialize runtime variables from blueprint defaults
    for (const v of asset.blueprintData.variables) {
      this.variables[v.name] = v.defaultValue;
    }

    // Compile the event graph
    if (asset.compiledCode) {
      this.script.code = asset.compiledCode;
      if (this.script.compile()) {
        console.log(`[GameInstance] Compiled event graph for "${asset.name}"`);
      } else {
        console.warn(`[GameInstance] Failed to compile event graph for "${asset.name}"`);
      }
    }
  }

  /** Fire BeginPlay (only once, even across scene reloads) */
  beginPlay(ctx: ScriptContext): void {
    if (this._initialized) return;
    this._initialized = true;
    this.script.beginPlay(ctx);
    console.log(`[GameInstance] BeginPlay for "${this.asset.name}"`);
  }

  /** Fire Tick each frame */
  tick(ctx: ScriptContext): void {
    if (!this._initialized) return;
    this.script.tick(ctx);
  }

  /** Fire OnDestroy (called only when play stops completely, not on scene transitions) */
  onDestroy(ctx: ScriptContext): void {
    if (!this._initialized) return;
    this.script.onDestroy(ctx);
    this.script.reset();
    this._initialized = false;
    console.log(`[GameInstance] OnDestroy for "${this.asset.name}"`);
  }

  /** Get a variable value by name */
  getVariable(name: string): any {
    return this.variables[name];
  }

  /** Set a variable value by name */
  setVariable(name: string, value: any): void {
    this.variables[name] = value;
  }
}
