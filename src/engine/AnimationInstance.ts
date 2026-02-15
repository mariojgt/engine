// ============================================================
//  AnimationInstance — Runtime evaluator for Animation Blueprints
//  Each skeletal mesh with an AnimBP gets one AnimationInstance.
//  Every frame:
//    1. Event Graph runs → computes variables (speed, isInAir, etc.)
//    2. State Machine evaluates transitions using those variables
//    3. Winning state drives Three.js AnimationMixer actions
//       (crossfade, blend spaces, play rates)
// ============================================================

import * as THREE from 'three';
import type {
  AnimBlueprintAsset,
  AnimStateMachineData,
  AnimStateData,
  AnimTransitionData,
  BlendSpace1D,
  AnimEventVariable,
} from '../editor/AnimBlueprintData';
import type { CharacterController } from './CharacterController';

/** Runtime state for a single AnimationInstance */
export class AnimationInstance {
  public asset: AnimBlueprintAsset;
  public mixer: THREE.AnimationMixer;
  public animations: THREE.AnimationClip[];

  /** Current active state ID */
  private _currentStateId: string;
  /** Current active AnimationAction(s) */
  private _currentActions: THREE.AnimationAction[] = [];
  /** Time spent in current state */
  private _stateTime = 0;
  /** Whether we're currently crossfading */
  private _transitioning = false;
  /** Crossfade remaining time */
  private _transitionTimeLeft = 0;
  /** Crossfade total duration */
  private _transitionDuration = 0;

  /** Runtime variable values (written by event graph, read by transition conditions) */
  public variables: Map<string, number | boolean | string> = new Map();

  /** Reference to character controller for auto-populating common variables */
  public characterController: CharacterController | null = null;

  constructor(
    asset: AnimBlueprintAsset,
    mixer: THREE.AnimationMixer,
    animations: THREE.AnimationClip[],
  ) {
    this.asset = asset;
    this.mixer = mixer;
    this.animations = animations;

    // Initialize variables from asset defaults
    for (const v of asset.eventVariables) {
      this.variables.set(v.name, v.defaultValue);
    }

    // Set initial state
    this._currentStateId = asset.stateMachine.entryStateId;

    // Start playing entry state
    const entryState = this._findState(this._currentStateId);
    if (entryState) {
      this._enterState(entryState);
    }
  }

  /** Main update — called every frame with delta time */
  update(dt: number): void {
    this._stateTime += dt;

    // 1. Update event variables from character controller
    this._updateEventVariables();

    // 2. Handle ongoing transitions
    if (this._transitioning) {
      this._transitionTimeLeft -= dt;
      if (this._transitionTimeLeft <= 0) {
        this._transitioning = false;
      }
    }

    // 3. Evaluate state machine transitions
    if (!this._transitioning) {
      this._evaluateTransitions();
    }

    // 4. Update blend spaces if current state uses one
    const currentState = this._findState(this._currentStateId);
    if (currentState && currentState.outputType === 'blendSpace1D') {
      this._updateBlendSpace1D(currentState);
    }

    // 5. The mixer itself is updated externally by Engine.ts
  }

  /** Populate event variables from a CharacterController */
  private _updateEventVariables(): void {
    const cc = this.characterController;
    if (!cc) return;

    // Speed (horizontal magnitude)
    const vel = cc.velocity;
    const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    this.variables.set('speed', horizontalSpeed);

    // Vertical velocity
    this.variables.set('verticalSpeed', vel.y);

    // Boolean states
    this.variables.set('isInAir', !cc.isGrounded);
    this.variables.set('isGrounded', cc.isGrounded);
    this.variables.set('isCrouching', cc.isCrouching);
    this.variables.set('isFalling', cc.isFalling);
    this.variables.set('isJumping', cc.isJumping);

    // Movement mode
    this.variables.set('movementMode', cc.movementMode);
  }

  /** Evaluate all transitions from current state, pick highest-priority match */
  private _evaluateTransitions(): void {
    const sm = this.asset.stateMachine;
    const candidates: AnimTransitionData[] = [];

    for (const t of sm.transitions) {
      // Match: exact "from" match OR wildcard "*"
      if (t.fromStateId !== this._currentStateId && t.fromStateId !== '*') continue;
      // Don't transition to ourselves (unless wildcard)
      if (t.toStateId === this._currentStateId && t.fromStateId !== '*') continue;

      // Evaluate condition
      if (this._evaluateCondition(t.conditionExpr)) {
        candidates.push(t);
      }
    }

    if (candidates.length === 0) return;

    // Sort by priority (lower number = higher priority)
    candidates.sort((a, b) => a.priority - b.priority);
    const winner = candidates[0];

    // Transition to new state
    const targetState = this._findState(winner.toStateId);
    if (targetState && targetState.id !== this._currentStateId) {
      this._transitionTo(targetState, winner.blendTime);
    }
  }

  /** Parse and evaluate a simple condition expression */
  private _evaluateCondition(expr: string): boolean {
    if (!expr || expr.trim() === '' || expr.trim() === 'true') return true;
    if (expr.trim() === 'false') return false;

    try {
      // Support simple conditions: "varName op value"
      // Operators: ==, !=, >, <, >=, <=
      // Also: "varName" alone (truthy check)
      // Also: "!varName" (falsy check)
      // Also: compound "a && b", "a || b"

      // Handle compound AND
      if (expr.includes('&&')) {
        const parts = expr.split('&&').map(s => s.trim());
        return parts.every(p => this._evaluateCondition(p));
      }
      // Handle compound OR
      if (expr.includes('||')) {
        const parts = expr.split('||').map(s => s.trim());
        return parts.some(p => this._evaluateCondition(p));
      }

      // Negation: "!varName"
      if (expr.startsWith('!')) {
        const varName = expr.slice(1).trim();
        const val = this.variables.get(varName);
        return !val;
      }

      // Comparison operators
      const match = expr.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
      if (match) {
        const [, varName, op, rawValue] = match;
        const varVal = this.variables.get(varName);
        let compareVal: number | boolean | string;

        // Parse the compare value
        const trimVal = rawValue.trim();
        if (trimVal === 'true') compareVal = true;
        else if (trimVal === 'false') compareVal = false;
        else if (!isNaN(Number(trimVal))) compareVal = Number(trimVal);
        else compareVal = trimVal;

        switch (op) {
          case '==': return varVal == compareVal;
          case '!=': return varVal != compareVal;
          case '>': return Number(varVal) > Number(compareVal);
          case '<': return Number(varVal) < Number(compareVal);
          case '>=': return Number(varVal) >= Number(compareVal);
          case '<=': return Number(varVal) <= Number(compareVal);
        }
      }

      // Bare variable name — truthy check
      const val = this.variables.get(expr.trim());
      return !!val;
    } catch (e) {
      console.warn('[AnimationInstance] Failed to evaluate condition:', expr, e);
      return false;
    }
  }

  /** Transition to a new state with crossfade */
  private _transitionTo(state: AnimStateData, blendTime: number): void {
    const oldActions = [...this._currentActions];
    this._currentStateId = state.id;
    this._stateTime = 0;

    // Enter new state (starts new actions)
    this._enterState(state);

    // Crossfade: fade out old, fade in new
    if (blendTime > 0 && oldActions.length > 0) {
      this._transitioning = true;
      this._transitionDuration = blendTime;
      this._transitionTimeLeft = blendTime;

      for (const newAction of this._currentActions) {
        // Use Three.js crossFadeFrom for smooth blending
        if (oldActions[0]) {
          newAction.crossFadeFrom(oldActions[0], blendTime, true);
        }
      }
    } else {
      // Instant switch — stop old actions
      for (const old of oldActions) {
        old.stop();
      }
    }
  }

  /** Enter a state — set up the appropriate AnimationAction(s) */
  private _enterState(state: AnimStateData): void {
    this._currentActions = [];

    if (state.outputType === 'singleAnimation') {
      this._playSingleAnimation(state);
    } else if (state.outputType === 'blendSpace1D') {
      this._setupBlendSpace1D(state);
    }
    // Future: blendSpace2D
  }

  /** Play a single animation clip */
  private _playSingleAnimation(state: AnimStateData): void {
    if (!state.animationName) return;

    const clip = this.animations.find(a => a.name === state.animationName);
    if (!clip) {
      console.warn(`[AnimationInstance] Clip not found: "${state.animationName}"`);
      return;
    }

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !state.loop;
    action.timeScale = state.playRate;
    action.setEffectiveWeight(1);
    action.play();

    this._currentActions.push(action);
  }

  /** Set up all actions for a 1D blend space (all play simultaneously with varying weights) */
  private _setupBlendSpace1D(state: AnimStateData): void {
    const bs = this.asset.blendSpaces1D.find(b => b.id === state.blendSpace1DId);
    if (!bs || bs.samples.length === 0) return;

    for (const sample of bs.samples) {
      const clip = this.animations.find(a => a.name === sample.animationName);
      if (!clip) continue;

      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.timeScale = state.playRate;
      action.setEffectiveWeight(0);
      action.play();

      this._currentActions.push(action);
    }

    // Set initial weights
    this._updateBlendSpace1D(state);
  }

  /** Update blend space 1D weights based on current variable value */
  private _updateBlendSpace1D(state: AnimStateData): void {
    const bs = this.asset.blendSpaces1D.find(b => b.id === state.blendSpace1DId);
    if (!bs || bs.samples.length === 0) return;

    const varName = state.blendSpaceAxisVar || bs.axisLabel.toLowerCase();
    const rawValue = this.variables.get(varName);
    const value = typeof rawValue === 'number' ? rawValue : 0;

    // Clamp to axis range
    const clamped = Math.max(bs.axisMin, Math.min(bs.axisMax, value));

    // Sort samples by position
    const sorted = [...bs.samples].sort((a, b) => a.position - b.position);

    // Calculate weights using linear interpolation between nearest neighbours
    const weights: number[] = new Array(sorted.length).fill(0);

    if (sorted.length === 1) {
      weights[0] = 1;
    } else {
      // Find the two samples surrounding the current value
      let lowerIdx = 0;
      let upperIdx = sorted.length - 1;

      for (let i = 0; i < sorted.length - 1; i++) {
        if (clamped >= sorted[i].position && clamped <= sorted[i + 1].position) {
          lowerIdx = i;
          upperIdx = i + 1;
          break;
        }
      }

      if (clamped <= sorted[0].position) {
        weights[0] = 1;
      } else if (clamped >= sorted[sorted.length - 1].position) {
        weights[sorted.length - 1] = 1;
      } else {
        const range = sorted[upperIdx].position - sorted[lowerIdx].position;
        const t = range > 0 ? (clamped - sorted[lowerIdx].position) / range : 0;
        weights[lowerIdx] = 1 - t;
        weights[upperIdx] = t;
      }
    }

    // Apply weights to actions (actions are in the same order as sorted samples)
    // We need to map sorted sample indices back to actions
    for (let i = 0; i < sorted.length && i < this._currentActions.length; i++) {
      this._currentActions[i].setEffectiveWeight(weights[i]);
    }
  }

  /** Get current state name (for debug/UI) */
  get currentStateName(): string {
    const state = this._findState(this._currentStateId);
    return state?.name ?? 'None';
  }

  get currentStateId(): string {
    return this._currentStateId;
  }

  /** Clean up — stop all actions */
  dispose(): void {
    for (const action of this._currentActions) {
      action.stop();
    }
    this._currentActions = [];
  }

  // ---- Helpers ----

  private _findState(id: string): AnimStateData | undefined {
    return this.asset.stateMachine.states.find(s => s.id === id);
  }
}
