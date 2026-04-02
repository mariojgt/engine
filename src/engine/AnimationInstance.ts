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
  AnimBlueprintAssetData as AnimBlueprintAsset,
  AnimStateMachineData,
  AnimStateData,
  AnimTransitionData,
  BlendSpace1D,
  AnimTransitionRuleGroup,
  AnimTransitionRule,
  TransitionBlendProfile,
  VarType,
} from '../runtime/RuntimeTypes';
import type { CharacterController } from './CharacterController';
import { ScriptComponent, type ScriptContext } from './ScriptComponent';
import type { GameObject } from './GameObject';
import { tryGetEngineDeps } from '../runtime/EngineDeps';

// ── Montage Types ───────────────────────────────────────────

export interface MontagePlayOptions {
  /** Blend-in duration in seconds (default 0.2) */
  blendIn?: number;
  /** Blend-out duration in seconds (default 0.2) */
  blendOut?: number;
  /** Playback rate multiplier (default 1) */
  playRate?: number;
  /** Start time in seconds (default 0) */
  startTime?: number;
  /** Loop the montage (default false — one-shot) */
  loop?: boolean;
}

export interface ActiveMontage {
  action: THREE.AnimationAction;
  clip: THREE.AnimationClip;
  blendIn: number;
  blendOut: number;
  /** Whether we're currently blending in, playing, blending out, or done */
  phase: 'blendIn' | 'playing' | 'blendOut' | 'done';
  /** Time spent in current phase */
  phaseTime: number;
  /** Callback when montage finishes (after blend-out) */
  onEnded: (() => void) | null;
  /** Callback when montage is interrupted by another montage or stop */
  onInterrupted: (() => void) | null;
}

// ── Notify Types ────────────────────────────────────────────

export interface AnimNotify {
  /** Unique name for this notify (e.g., "Footstep", "AttackStart", "AttackEnd") */
  name: string;
  /** Time in seconds within the clip when this notify fires */
  time: number;
  /** Optional clip name — if omitted, fires on any active clip */
  clipName?: string;
}

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
  private _transitionFromActions: THREE.AnimationAction[] = [];
  private _transitionToActions: THREE.AnimationAction[] = [];
  private _transitionCurve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' = 'linear';

  // ── Montage System ──────────────────────────────────────────
  private _activeMontage: ActiveMontage | null = null;
  /** While a montage is active, state machine actions are suppressed to this weight */
  private _stateMachineWeight = 1;

  // ── Notify System ───────────────────────────────────────────
  /** Registered notifies (can be added from editor or blueprint at runtime) */
  private _notifies: AnimNotify[] = [];
  /** Callbacks registered for notify names */
  private _notifyCallbacks: Map<string, Array<() => void>> = new Map();
  /** Tracks last-known playback time per action to detect crossings */
  private _lastActionTimes: Map<THREE.AnimationAction, number> = new Map();

  /** Runtime variable values (written by event graph, read by transition conditions) */
  public variables: Map<string, number | boolean | string> = new Map();

  /** Reference to character controller for auto-populating common variables */
  public characterController: CharacterController | null = null;

  /** Owning game object (used for event graph context) */
  public owner: GameObject | null = null;

  /** Compiled event graph script (if the AnimBP has a blueprint event graph) */
  private _eventScript: ScriptComponent | null = null;
  private _eventScriptStarted = false;

  /** Avoid spamming warnings when no action is playing */
  private _warnedNoAction = false;
  private _debugLoggedBeginPlay = false;
  private _debugLoggedNoCode = false;
  private _debugTransitionLogCooldown = 0;
  private _debugTransitionLogEnabled = false;  // Disabled by default — enable explicitly for debugging
  private _overrideClipCache: Map<string, THREE.AnimationClip[]> = new Map();
  private _overrideClipLoading: Set<string> = new Set();

  /** Scene & physics references for script execution context */
  public sceneRef: any = null;
  public physicsRef: any = null;
  public printFn: ((value: any) => void) | null = null;
  /** Additional runtime references for full script context parity */
  public uiManagerRef: any = null;
  public engineRef: any = null;
  public gameInstanceRef: any = null;
  /** Elapsed time accumulator for script context */
  private _elapsedTime = 0;

  constructor(
    asset: AnimBlueprintAsset,
    mixer: THREE.AnimationMixer,
    animations: THREE.AnimationClip[],
    owner: GameObject | null = null,
  ) {
    this.asset = asset;
    this.mixer = mixer;
    this.animations = animations;
    this.owner = owner;

    // Initialize variables from BlueprintData defaults
    for (const v of asset.blueprintData.variables) {
      const type = v.type as VarType;
      if (type === 'Float') this.variables.set(v.name, Number(v.defaultValue) || 0);
      else if (type === 'Boolean') this.variables.set(v.name, !!v.defaultValue);
      else if (type === 'String') this.variables.set(v.name, String(v.defaultValue ?? ''));
    }

    // Set initial state
    const sm = asset.stateMachine;
    this._currentStateId = sm.entryStateId;
    let entryState = this._findState(this._currentStateId);
    if (!entryState && sm.states.length > 0) {
      entryState = sm.states[0];
      this._currentStateId = entryState.id;
    }

    // Start playing entry state
    if (entryState) {
      this._enterState(entryState);
    }

    // Compile event graph code if present
    if (asset.compiledCode) {
      this.setEventGraphCode(asset.compiledCode);
    }
  }

  /** Debug info for editor/runtime overlays */
  getDebugInfo(): {
    stateId: string;
    stateName: string;
    outputType: string;
    animationName: string;
    actionNames: string[];
    clipNames: string[];
    transitioning: boolean;
    stateTime: number;
    timeRemaining: number;
    normalizedTime: number;
    stateRelevance: number;
  } {
    const state = this._findState(this._currentStateId);
    const primaryAction = this._currentActions[0];
    const duration = primaryAction?.getClip().duration || 0;
    const normalized = duration > 0 ? (primaryAction!.time / duration) : 0;
    const remaining = duration > 0 ? Math.max(0, duration - primaryAction!.time) : 0;
    const relevance = this._currentActions.length > 0
      ? Math.max(...this._currentActions.map(a => a.getEffectiveWeight()))
      : 0;
    return {
      stateId: this._currentStateId,
      stateName: state?.name ?? '(none)',
      outputType: state?.outputType ?? '(none)',
      animationName: state?.animationName ?? '',
      actionNames: this._currentActions.map(a => a.getClip().name),
      clipNames: this.animations.map(a => a.name),
      transitioning: this._transitioning,
      stateTime: this._stateTime,
      timeRemaining: remaining,
      normalizedTime: normalized,
      stateRelevance: relevance,
      montageActive: this.isMontageActive,
      montageClip: this.montageClipName,
      montagePhase: this._activeMontage?.phase ?? 'none',
    };
  }

  /** Compile and set the event graph code for per-frame execution */
  setEventGraphCode(code: string): void {
    if (!code || !code.trim()) {
      this._eventScript = null;
      return;
    }
    const sc = new ScriptComponent();
    sc.code = code;
    if (sc.compile()) {
      this._eventScript = sc;
      this._eventScriptStarted = false;
    } else {
      console.warn('[AnimationInstance] Failed to compile event graph code');
      this._eventScript = null;
    }
  }

  /** Main update — called every frame with delta time */
  update(dt: number): void {
    this._stateTime += dt;
    this._elapsedTime += dt;
    if (this._debugTransitionLogEnabled && this._debugTransitionLogCooldown > 0) {
      this._debugTransitionLogCooldown -= dt;
    }

    // Hot-load event graph code if it was compiled after instance creation.
    if (!this._eventScript && this.asset.compiledCode) {
      this.setEventGraphCode(this.asset.compiledCode);
    } else if (!this._eventScript && !this.asset.compiledCode && !this._debugLoggedNoCode) {
      this._debugLoggedNoCode = true;
      // Only warn once per asset globally to avoid log spam in editor preview
      const key = `__animBP_noCode_${this.asset.name}`;
      if (!(globalThis as any)[key]) {
        (globalThis as any)[key] = true;
        console.warn(`[AnimBP] No compiled code for ${this.asset.name}`);
      }
    }

    // 1. Update event variables — either from event graph script or auto-populate
    if (this._eventScript) {
      this._executeEventGraph(dt);
    } else {
      this._updateEventVariables();
    }

    // 2. Handle ongoing transitions
    if (this._transitioning) {
      this._transitionTimeLeft -= dt;
      const total = Math.max(0.0001, this._transitionDuration);
      const t = Math.min(1, Math.max(0, 1 - this._transitionTimeLeft / total));
      const w = this._applyCurve(t, this._transitionCurve);
      for (const a of this._transitionFromActions) {
        a.setEffectiveWeight(1 - w);
      }
      for (const a of this._transitionToActions) {
        a.setEffectiveWeight(w);
      }
      if (this._transitionTimeLeft <= 0) {
        this._transitioning = false;
        for (const a of this._transitionFromActions) {
          a.stop();
        }
        this._transitionFromActions = [];
        this._transitionToActions = [];
      }
    }

    // 3. Evaluate state machine transitions (skip while montage overrides)
    if (!this._transitioning && !this.isMontageActive) {
      this._evaluateTransitions();
    }

    // 4. Update blend spaces if current state uses one
    const currentState = this._findState(this._currentStateId);
    if (currentState && currentState.outputType === 'blendSpace1D') {
      this._updateBlendSpace1D(currentState);
    }

    // 5. Update montage blend phases
    this._updateMontage(dt);

    // 6. Check animation notifies
    this._checkNotifies();

    if (this._currentActions.length === 0 && this.animations.length > 0 && !this._warnedNoAction) {
      this._warnedNoAction = true;
      console.warn('[AnimationInstance] No active actions. Falling back to first clip.');
      this._playSingleAnimation({
        ...currentState,
        outputType: 'singleAnimation',
        animationName: this.animations[0].name,
        loop: true,
        playRate: 1,
      } as AnimStateData);
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

  /** Cached ScriptContext to avoid per-frame allocations */
  private _cachedCtx: ScriptContext = {
    gameObject: null as any,
    deltaTime: 0,
    elapsedTime: 0,
    print: (v: any) => console.log('[AnimBP]', v),
    physics: null,
    scene: null,
    animInstance: null,
    uiManager: null,
    engine: null,
    gameInstance: null,
  };

  /** Execute the compiled event graph code each frame */
  private _executeEventGraph(dt: number): void {
    if (!this._eventScript) return;

    // Build script context — gameObject is the owning pawn
    const go = this.characterController?.gameObject ?? this.owner ?? null;
    if (!go) return;

    const ctx = this._cachedCtx;
    ctx.gameObject = go;
    ctx.deltaTime = dt;
    ctx.elapsedTime = this._elapsedTime;
    ctx.print = this.printFn ?? ((v: any) => console.log('[AnimBP]', v));
    ctx.physics = this.physicsRef;
    ctx.scene = this.sceneRef;
    ctx.animInstance = this;
    ctx.uiManager = this.uiManagerRef;
    ctx.engine = this.engineRef;
    ctx.gameInstance = this.gameInstanceRef;

    // Run beginPlay once
    if (!this._eventScriptStarted) {
      this._eventScript.beginPlay(ctx);
      this._eventScriptStarted = true;
      if (!this._debugLoggedBeginPlay) {
        this._debugLoggedBeginPlay = true;
        console.log(`[AnimBP] BeginPlay fired for ${this.asset.name} on ${go.name}`);
      }
    }

    // Run tick every frame
    this._eventScript.tick(ctx);
  }

  /** Evaluate all transitions from current state, pick highest-priority match */
  private _evaluateTransitions(): void {
    const sm = this.asset.stateMachine;
    const candidates: AnimTransitionData[] = [];

    for (const t of sm.transitions) {
      // Match: exact "from" match OR wildcard "*"
      if (t.fromStateId !== this._currentStateId && t.fromStateId !== '*') continue;
      // Don't transition to ourselves
      if (t.toStateId === this._currentStateId) continue;

      const condResult = this._evaluateTransitionRules(t);

      // Evaluate condition
      if (condResult) {
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
      if (this._debugTransitionLogEnabled) {
        console.log(
          `[AnimBP] Transition fired: ${this.asset.name} ${this._currentStateId} -> ${targetState.id} ` +
          `label="${this._getTransitionLabel(winner)}"`
        );
      }
      this._transitionTo(targetState, winner.blendProfile, winner.blendTime);
    }
  }

  private _evaluateTransitionRules(t: AnimTransitionData): boolean {
    const groups = t.rules ?? [];
    if (groups.length === 0) {
      if (t.conditionExpr) return this._evaluateCondition(t.conditionExpr);
      return true;
    }
    const groupResults = groups.map(g => this._evaluateRuleGroup(g));
    const logic = t.ruleLogic ?? 'AND';
    return logic === 'AND'
      ? groupResults.every(Boolean)
      : groupResults.some(Boolean);
  }

  private _evaluateRuleGroup(group: AnimTransitionRuleGroup): boolean {
    if (!group.rules || group.rules.length === 0) return false;
    const results = group.rules.map(r => this._evaluateRule(r));
    return group.op === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private _evaluateRule(rule: AnimTransitionRule): boolean {
    if (rule.kind === 'expr') {
      return this._evaluateCondition(rule.expr);
    }

    const varVal = this.variables.get(rule.varName);
    if (varVal === undefined) return false;

    const rhs = rule.value;
    switch (rule.op) {
      case '==': return varVal == rhs;
      case '!=': return varVal != rhs;
      case '>': return Number(varVal) > Number(rhs);
      case '<': return Number(varVal) < Number(rhs);
      case '>=': return Number(varVal) >= Number(rhs);
      case '<=': return Number(varVal) <= Number(rhs);
      case 'contains': return String(varVal).includes(String(rhs));
      default: return false;
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

  private _getConditionVarName(t: AnimTransitionData): string | null {
    const groups = t.rules ?? [];
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.kind === 'compare') return r.varName;
      }
    }
    if (t.conditionExpr) {
      const clean = t.conditionExpr.trim();
      if (!clean || clean === 'true' || clean === 'false') return null;
      if (clean.startsWith('!')) return clean.slice(1).trim().match(/^\w+$/)?.[0] ?? null;
      const match = clean.match(/^(\w+)\b/);
      return match ? match[1] : null;
    }
    return null;
  }

  private _getTransitionLabel(t: AnimTransitionData): string {
    const groups = t.rules ?? [];
    if (groups.length === 0) return t.conditionExpr ?? '';
    const groupLabels = groups.map(g => {
      const ruleLabels = g.rules.map(r => {
        if (r.kind === 'expr') return r.expr;
        const rhs = r.valueType === 'String' ? JSON.stringify(r.value) : String(r.value);
        return `${r.varName} ${r.op} ${rhs}`;
      });
      return ruleLabels.join(` ${g.op} `);
    });
    const logic = t.ruleLogic ?? 'AND';
    return groupLabels.join(` ${logic} `);
  }

  private _applyCurve(t: number, curve: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'): number {
    switch (curve) {
      case 'easeIn': return t * t;
      case 'easeOut': return t * (2 - t);
      case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t;
    }
  }

  /** Transition to a new state with crossfade */
  private _transitionTo(state: AnimStateData, blendProfile?: TransitionBlendProfile, legacyBlendTime?: number): void {
    const oldActions = [...this._currentActions];
    const prevState = this._findState(this._currentStateId);
    let prevNormalized = 0;
    if (oldActions[0]) {
      const dur = oldActions[0].getClip().duration || 0;
      if (dur > 0) prevNormalized = oldActions[0].time / dur;
    }

    this._currentStateId = state.id;
    this._stateTime = 0;
    this._warnedNoAction = false;

    // Enter new state (starts new actions)
    this._enterState(state);

    if (prevState && state.syncGroup && prevState.syncGroup && prevState.syncGroup === state.syncGroup) {
      for (const a of this._currentActions) {
        const dur = a.getClip().duration || 0;
        if (dur > 0) a.time = prevNormalized * dur;
      }
    }

    const blendTime = blendProfile?.time ?? legacyBlendTime ?? 0;
    this._transitionCurve = blendProfile?.curve ?? 'linear';

    if (blendTime > 0 && oldActions.length > 0) {
      this._transitioning = true;
      this._transitionDuration = blendTime;
      this._transitionTimeLeft = blendTime;
      this._transitionFromActions = oldActions;
      this._transitionToActions = [...this._currentActions];

      for (const a of this._transitionToActions) {
        a.setEffectiveWeight(0);
      }
    } else {
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
      if (this._currentActions.length === 0 && this.animations.length > 0) {
        console.warn('[AnimationInstance] Blend space has no playable samples, using first clip.');
        this._playSingleAnimation({
          ...state,
          outputType: 'singleAnimation',
          animationName: this.animations[0].name,
          loop: true,
          playRate: 1,
        } as AnimStateData);
      }
    }
    // Future: blendSpace2D
  }

  /** Play a single animation clip */
  private _playSingleAnimation(state: AnimStateData): void {
    const overrideClip = this._getOverrideClip(state);
    if (!overrideClip && !state.animationName) {
      if (this.animations.length > 0) {
        const fallback = this.animations[0];
        console.warn('[AnimationInstance] State has no animation, using first clip:', fallback.name);
        state = { ...state, animationName: fallback.name };
      } else {
        return;
      }
    }

    let clip = overrideClip || this._findClipByName(this.animations, state.animationName);
    if (!clip) {
      const available = this.animations.map(a => a.name).slice(0, 6).join(', ');
      console.warn(`[AnimationInstance] Clip not found: "${state.animationName}". Available: ${available}`);
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

  /** Set up all actions for a 1D blend space (all play simultaneously with varying weights).
   *  Range-based: each sample has rangeMin/rangeMax. Samples play at full weight inside their
   *  range, and crossfade at range boundaries using the blend space's blendMargin. */
  private _setupBlendSpace1D(state: AnimStateData): void {
    const bs = this.asset.blendSpaces1D.find(b => b.id === state.blendSpace1DId);
    if (!bs || bs.samples.length === 0) return;

    // Sort samples by rangeMin for consistent ordering
    const sorted = [...bs.samples].sort((a, b) => a.rangeMin - b.rangeMin);

    for (const sample of sorted) {
      const clip = this._findClipByName(this.animations, sample.animationName);
      if (!clip) {
        // Push a null placeholder action so indices stay aligned
        this._currentActions.push(null as any);
        continue;
      }

      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(sample.loop !== false ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !sample.loop;
      action.timeScale = (sample.playRate ?? 1) * (state.playRate || 1);
      action.setEffectiveWeight(0);
      action.play();

      this._currentActions.push(action);
    }

    // Set initial weights
    this._updateBlendSpace1D(state);
  }

  /** Update blend space 1D weights based on current variable value (range-based).
   *
   *  Algorithm:
   *  1. If value is inside one or more ranges [rangeMin, rangeMax] → those get weight 1
   *  2. If value is outside all ranges but within blendMargin of some → proximity-based fade
   *  3. If value is in a gap beyond margin → nearest range gets weight 1
   */
  private _updateBlendSpace1D(state: AnimStateData): void {
    const bs = this.asset.blendSpaces1D.find(b => b.id === state.blendSpace1DId);
    if (!bs || bs.samples.length === 0) return;

    // Resolve driving variable: state override → blend space config → axis label fallback
    const varName = state.blendSpaceAxisVar || bs.drivingVariable || bs.axisLabel?.toLowerCase() || 'speed';
    const rawValue = this.variables.get(varName);
    const value = typeof rawValue === 'number' ? rawValue : 0;

    // Clamp to axis range
    const clamped = Math.max(bs.axisMin, Math.min(bs.axisMax, value));
    const margin = bs.blendMargin ?? 0;

    // Sort by rangeMin (same order as _setupBlendSpace1D)
    const sorted = [...bs.samples].sort((a, b) => a.rangeMin - b.rangeMin);

    const weights: number[] = new Array(sorted.length).fill(0);

    if (sorted.length === 1) {
      weights[0] = 1;
    } else {
      // Step 1: Find all ranges that directly contain the value
      const containingIndices: number[] = [];
      for (let i = 0; i < sorted.length; i++) {
        if (clamped >= sorted[i].rangeMin && clamped <= sorted[i].rangeMax) {
          containingIndices.push(i);
        }
      }

      if (containingIndices.length > 0) {
        // Value is inside one or more ranges — give those ranges full weight
        // If inside multiple overlapping ranges, weight by how centered we are
        if (containingIndices.length === 1) {
          weights[containingIndices[0]] = 1;
        } else {
          // Overlapping ranges: distribute weight based on centrality within each range
          for (const idx of containingIndices) {
            const s = sorted[idx];
            const span = s.rangeMax - s.rangeMin;
            if (span < 0.001) {
              weights[idx] = 1;
            } else {
              // How centered is the value within this range? 1.0 at center, lower at edges
              const center = (s.rangeMin + s.rangeMax) / 2;
              const distFromCenter = Math.abs(clamped - center);
              weights[idx] = Math.max(0.01, 1 - (distFromCenter / (span / 2)));
            }
          }
        }
      } else {
        // Value is outside all ranges — crossfade based on proximity
        for (let i = 0; i < sorted.length; i++) {
          const s = sorted[i];
          // Distance from value to nearest edge of this range
          let distOutside = 0;
          if (clamped < s.rangeMin) {
            distOutside = s.rangeMin - clamped;
          } else if (clamped > s.rangeMax) {
            distOutside = clamped - s.rangeMax;
          }

          if (margin > 0 && distOutside < margin) {
            // Within blend margin — fade based on distance
            weights[i] = 1 - (distOutside / margin);
          } else {
            weights[i] = 0;
          }
        }
      }

      // If no weights at all (fell in a gap beyond margin), snap to nearest range
      let totalWeight = 0;
      for (let i = 0; i < weights.length; i++) totalWeight += weights[i];

      if (totalWeight < 0.001) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < sorted.length; i++) {
          const dMin = Math.abs(clamped - sorted[i].rangeMin);
          const dMax = Math.abs(clamped - sorted[i].rangeMax);
          const dist = Math.min(dMin, dMax);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = i;
          }
        }
        weights[nearestIdx] = 1;
        totalWeight = 1;
      }

      // Normalize weights so they sum to 1
      if (totalWeight > 0 && totalWeight !== 1) {
        for (let i = 0; i < weights.length; i++) {
          weights[i] /= totalWeight;
        }
      }
    }

    // Apply weights to actions
    for (let i = 0; i < sorted.length && i < this._currentActions.length; i++) {
      const action = this._currentActions[i];
      if (action && action.setEffectiveWeight) {
        action.setEffectiveWeight(weights[i]);
      }
    }
  }

  private _findClipByName(list: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
    if (!name) return undefined;
    let clip = list.find(a => a.name === name);
    if (!clip) {
      clip = list.find(a => a.name.endsWith('_' + name)) ||
        list.find(a => name.endsWith('_' + a.name));
    }
    return clip;
  }

  private _getOverrideClip(state: AnimStateData): THREE.AnimationClip | null {
    if (!state.useOverrideMesh || !state.overrideMeshAssetId || !state.overrideAnimationName) return null;
    const meshId = state.overrideMeshAssetId;
    const clips = this._overrideClipCache.get(meshId);
    if (clips) {
      return this._findClipByName(clips, state.overrideAnimationName) ?? null;
    }
    if (!this._overrideClipLoading.has(meshId)) {
      this._overrideClipLoading.add(meshId);
      this._preloadOverrideClips(meshId, state.id, state.overrideAnimationName);
    }
    return null;
  }

  private async _preloadOverrideClips(meshId: string, stateId: string, animName: string): Promise<void> {
    const deps = tryGetEngineDeps();
    const asset = deps?.meshAssets?.getAsset(meshId);
    if (!asset) {
      this._overrideClipLoading.delete(meshId);
      return;
    }
    try {
      const loadFn = deps?.loadMeshFromAsset;
      if (!loadFn) throw new Error('loadMeshFromAsset not available');
      const { scene, animations } = await loadFn(asset);
      this._overrideClipCache.set(meshId, animations || []);

      // Dispose loaded scene to avoid GPU leaks
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if ((mesh as any).geometry) (mesh as any).geometry.dispose();
        if ((mesh as any).material) {
          const mat = (mesh as any).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });

      if (this._currentStateId === stateId && !this._transitioning) {
        const state = this._findState(stateId);
        if (state && state.outputType === 'singleAnimation' && state.overrideAnimationName === animName) {
          this._playSingleAnimation(state);
        }
      }
    } catch (e) {
      console.warn('[AnimationInstance] Failed to load override animation clips:', e);
    } finally {
      this._overrideClipLoading.delete(meshId);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  Montage System — one-shot animations over the state machine
  // ════════════════════════════════════════════════════════════

  /**
   * Play a montage (one-shot animation) that overrides the state machine.
   * Returns true if successfully started. When finished, blends back to
   * the state machine seamlessly.
   */
  playMontage(
    clipName: string,
    options: MontagePlayOptions = {},
    onEnded?: () => void,
    onInterrupted?: () => void,
  ): boolean {
    const clip = this._findClipByName(this.animations, clipName);
    if (!clip) {
      console.warn(`[AnimationInstance] Montage clip not found: "${clipName}"`);
      return false;
    }

    // Interrupt existing montage if any
    if (this._activeMontage && this._activeMontage.phase !== 'done') {
      this._interruptMontage();
    }

    const blendIn = options.blendIn ?? 0.2;
    const blendOut = options.blendOut ?? 0.2;
    const playRate = options.playRate ?? 1;
    const startTime = options.startTime ?? 0;
    const loop = options.loop ?? false;

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = playRate;
    action.time = startTime;

    // Start with zero weight for blend-in
    if (blendIn > 0) {
      action.setEffectiveWeight(0);
    } else {
      action.setEffectiveWeight(1);
      // Immediately suppress state machine
      this._setStateMachineWeight(0);
    }
    action.play();

    this._activeMontage = {
      action,
      clip,
      blendIn,
      blendOut,
      phase: blendIn > 0 ? 'blendIn' : 'playing',
      phaseTime: 0,
      onEnded: onEnded ?? null,
      onInterrupted: onInterrupted ?? null,
    };

    return true;
  }

  /** Stop the active montage early, triggering blend-out */
  stopMontage(blendOut?: number): void {
    if (!this._activeMontage || this._activeMontage.phase === 'done') return;
    const m = this._activeMontage;
    m.blendOut = blendOut ?? m.blendOut;
    if (m.blendOut > 0) {
      m.phase = 'blendOut';
      m.phaseTime = 0;
    } else {
      this._finishMontage();
    }
  }

  /** Is a montage currently playing? */
  get isMontageActive(): boolean {
    return this._activeMontage !== null && this._activeMontage.phase !== 'done';
  }

  /** Get the name of the currently playing montage clip (or empty string) */
  get montageClipName(): string {
    return this._activeMontage?.clip.name ?? '';
  }

  /** Update montage blend phases — called from update() */
  private _updateMontage(dt: number): void {
    const m = this._activeMontage;
    if (!m || m.phase === 'done') return;

    m.phaseTime += dt;

    switch (m.phase) {
      case 'blendIn': {
        const t = Math.min(1, m.phaseTime / Math.max(0.001, m.blendIn));
        m.action.setEffectiveWeight(t);
        this._setStateMachineWeight(1 - t);
        if (t >= 1) {
          m.phase = 'playing';
          m.phaseTime = 0;
        }
        break;
      }
      case 'playing': {
        // Check if one-shot montage has finished playing
        if (!m.action.loop && m.action.time >= m.clip.duration - m.blendOut) {
          // Start blend-out before the clip fully ends
          if (m.blendOut > 0) {
            m.phase = 'blendOut';
            m.phaseTime = 0;
          } else {
            this._finishMontage();
          }
        }
        break;
      }
      case 'blendOut': {
        const t = Math.min(1, m.phaseTime / Math.max(0.001, m.blendOut));
        m.action.setEffectiveWeight(1 - t);
        this._setStateMachineWeight(t);
        if (t >= 1) {
          this._finishMontage();
        }
        break;
      }
    }
  }

  /** Set the weight of all state machine actions */
  private _setStateMachineWeight(w: number): void {
    this._stateMachineWeight = w;
    for (const a of this._currentActions) {
      if (a && a.setEffectiveWeight) {
        // Scale existing weights by the state machine factor
        // (blend spaces have per-sample weights, so preserve relative ratios)
        a.setEffectiveWeight(a.getEffectiveWeight() > 0 ? w : 0);
      }
    }
  }

  private _interruptMontage(): void {
    const m = this._activeMontage!;
    m.action.stop();
    m.phase = 'done';
    this._setStateMachineWeight(1);
    if (m.onInterrupted) {
      try { m.onInterrupted(); } catch (e) { console.error('[AnimationInstance] Montage onInterrupted error:', e); }
    }
    this._activeMontage = null;
  }

  private _finishMontage(): void {
    const m = this._activeMontage!;
    m.action.stop();
    m.phase = 'done';
    this._setStateMachineWeight(1);
    if (m.onEnded) {
      try { m.onEnded(); } catch (e) { console.error('[AnimationInstance] Montage onEnded error:', e); }
    }
    this._activeMontage = null;
  }

  // ════════════════════════════════════════════════════════════
  //  Notify System — fire callbacks at specific animation times
  // ════════════════════════════════════════════════════════════

  /**
   * Register a notify marker on a clip. When playback crosses this time,
   * all registered callbacks for that notify name fire.
   */
  addNotify(name: string, time: number, clipName?: string): void {
    this._notifies.push({ name, time, clipName });
  }

  /** Remove all notifies with the given name */
  removeNotify(name: string): void {
    this._notifies = this._notifies.filter(n => n.name !== name);
  }

  /** Register a callback for when a named notify fires */
  onNotify(name: string, callback: () => void): void {
    let cbs = this._notifyCallbacks.get(name);
    if (!cbs) {
      cbs = [];
      this._notifyCallbacks.set(name, cbs);
    }
    cbs.push(callback);
  }

  /** Unregister a specific callback for a named notify */
  offNotify(name: string, callback: () => void): void {
    const cbs = this._notifyCallbacks.get(name);
    if (!cbs) return;
    const idx = cbs.indexOf(callback);
    if (idx !== -1) cbs.splice(idx, 1);
  }

  /** Clear all notify callbacks (but keep notify definitions) */
  clearNotifyCallbacks(): void {
    this._notifyCallbacks.clear();
  }

  /** Check all active actions for notify time crossings — called from update() */
  private _checkNotifies(): void {
    if (this._notifies.length === 0) return;

    // Collect all active actions to check (state machine + montage)
    const actionsToCheck: THREE.AnimationAction[] = [];
    for (const a of this._currentActions) {
      if (a && a.isRunning()) actionsToCheck.push(a);
    }
    if (this._activeMontage && this._activeMontage.phase !== 'done') {
      actionsToCheck.push(this._activeMontage.action);
    }

    for (const action of actionsToCheck) {
      const clip = action.getClip();
      const currentTime = action.time;
      const lastTime = this._lastActionTimes.get(action) ?? currentTime;

      for (const notify of this._notifies) {
        // Skip if notify is for a specific clip and this isn't it
        if (notify.clipName && clip.name !== notify.clipName) continue;

        // Check if playback crossed the notify time since last frame
        // Handle both forward and looping playback
        const crossed = (lastTime < notify.time && currentTime >= notify.time) ||
                        (lastTime > currentTime && notify.time >= 0 && currentTime >= notify.time); // loop wrap

        if (crossed) {
          const cbs = this._notifyCallbacks.get(notify.name);
          if (cbs) {
            for (const cb of cbs) {
              try { cb(); } catch (e) { console.error(`[AnimationInstance] Notify "${notify.name}" callback error:`, e); }
            }
          }
        }
      }

      this._lastActionTimes.set(action, currentTime);
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
    // Stop montage if active
    if (this._activeMontage && this._activeMontage.phase !== 'done') {
      this._activeMontage.action.stop();
      this._activeMontage = null;
    }

    // Clear notifies
    this._notifies = [];
    this._notifyCallbacks.clear();
    this._lastActionTimes.clear();

    for (const action of this._currentActions) {
      if (action) action.stop();
    }
    this._currentActions = [];
    this._transitionFromActions = [];
    this._transitionToActions = [];
    this._transitioning = false;

    // Fire onDestroy on the event graph script so cleanup code runs
    // (e.g. EventBus.off, interval clears, input listener removal).
    if (this._eventScript && this._eventScriptStarted) {
      try {
        const go = this.characterController?.gameObject ?? this.owner ?? null;
        if (go) {
          const ctx: ScriptContext = {
            gameObject: go,
            deltaTime: 0,
            elapsedTime: this._elapsedTime,
            print: this.printFn ?? ((v: any) => console.log('[AnimBP]', v)),
            physics: this.physicsRef,
            scene: this.sceneRef,
            animInstance: this,
            uiManager: this.uiManagerRef,
            engine: this.engineRef,
            gameInstance: this.gameInstanceRef,
          };
          this._eventScript.onDestroy(ctx);
        }
      } catch (err) {
        console.error('[AnimationInstance] Error running onDestroy on event script:', err);
      }
    }

    // Reset the event graph script so beginPlay guard resets on re-use
    if (this._eventScript) {
      this._eventScript.reset();
      this._eventScriptStarted = false;
    }
  }

  // ---- Helpers ----

  private _findState(id: string): AnimStateData | undefined {
    return this.asset.stateMachine.states.find(s => s.id === id);
  }
}
