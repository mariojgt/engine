// ============================================================
//  AnimBP2DRuntime — Unified 2D Animation Blueprint Runtime
//
//  This is the SINGLE implementation of the AnimBP 2D state
//  machine logic, used by both Play mode and exported builds.
//
//  Previously duplicated across:
//    - src/editor/Scene2DManager._syncAnimBPVars /.evalAnimBPTransitions
//    - src/editor/build/platforms/PCBuildTarget.ts (syncAnimBPVars/evalAnimBPTransitions)
//    - src/editor/build/platforms/WebBuildTarget.ts (same)
//
//  Usage:
//    const runtime = new AnimBP2DRuntime();
//    runtime.registerActor(actor, abpData);  // after spawn
//    runtime.tick(actors, deltaTime, deps);  // each frame
//    runtime.unregisterActor(actor);         // on destroy
//    runtime.reset();                        // on stop
// ============================================================

import type { ScriptComponent } from '../engine/ScriptComponent';

// ────────────────────────────────────────────────────────────
//  Public Types
// ────────────────────────────────────────────────────────────

/** Per-actor AnimBP state tracking */
export interface AnimBPActorState {
  /** The AnimBP asset data (stateMachine, compiledCode, blueprintData, etc.) */
  abp: any;
  /** Current state machine node ID */
  currentStateId: string;
}

/** Per-actor event-graph script execution state */
export interface AnimBPScriptState {
  script: any; // ScriptComponent instance
  started: boolean;
  elapsed: number;
}

/** Dependencies injected into the runtime — avoids hard editor imports */
export interface AnimBP2DDeps {
  /** Function to create a ScriptComponent (decouples from concrete import) */
  createScriptComponent: () => any;

  /** The list of all sprite actors currently alive (for scene shim) */
  getSpriteActors: () => any[];

  /** Map of loaded sprite sheets keyed by assetId */
  spriteSheets: Map<string, any>;

  /** Print function for event-graph output (wired to output log in editor, console in export) */
  printFn: (value: any) => void;

  /** Despawn callback (for scene.destroyActor in blueprint context) */
  despawnActor?: (actor: any) => void;

  /** Engine reference for blueprint context (minimal shim) */
  engineShim?: any;

  /** EventBus instance */
  eventBus?: any;

  /** Canvas element (for _playCanvas in blueprint context) */
  canvas?: HTMLCanvasElement | null;

  /** spawnActor function for blueprint context */
  spawnActorFn?: (classId: string, className: string, pos: any, rot: any, sc: any, owner: any, overrides: any) => any;

  /** gameInstance reference */
  gameInstance?: any;

  /** projectManager reference */
  projectManager?: any;
}

// ────────────────────────────────────────────────────────────
//  AnimBP2DRuntime
// ────────────────────────────────────────────────────────────

export class AnimBP2DRuntime {
  /** Per-actor ABP state (current state, asset data) */
  private _actorStates = new Map<any /* SpriteActor */, AnimBPActorState>();

  /** Per-actor compiled event-graph script + execution state */
  private _actorScripts = new Map<any, AnimBPScriptState>();

  // ── Registration ──

  /**
   * Register an actor with its AnimBP data.
   * Must be called after the actor is spawned and the ABP data is loaded.
   */
  registerActor(actor: any, abpData: any): void {
    const sm = abpData?.stateMachine;
    const entryState = sm?.entryStateId
      ? sm.states?.find((s: any) => s.id === sm.entryStateId) ?? sm?.states?.[0]
      : sm?.states?.[0];
    const initialStateId = entryState?.id ?? '';

    this._actorStates.set(actor, {
      abp: abpData,
      currentStateId: initialStateId,
    });

    // Play the entry state animation if animator is ready
    if (entryState?.spriteAnimationName && actor.animator) {
      actor.animator.play(entryState.spriteAnimationName);
    }
  }

  /** Unregister an actor (on destroy/despawn) */
  unregisterActor(actor: any): void {
    this._actorStates.delete(actor);
    this._actorScripts.delete(actor);
  }

  /** Check if an actor has an AnimBP registered */
  hasActor(actor: any): boolean {
    return this._actorStates.has(actor);
  }

  /** Get the current state for an actor */
  getActorState(actor: any): AnimBPActorState | undefined {
    return this._actorStates.get(actor);
  }

  /** Clear all state (on play stop) */
  reset(): void {
    this._actorStates.clear();
    this._actorScripts.clear();
  }

  // ── Per-Frame Tick ──

  /**
   * Tick all registered actors: sync variables, run event graph, evaluate transitions.
   * This is the single unified entry point called once per frame.
   */
  tick(actors: any[], deltaTime: number, deps: AnimBP2DDeps): void {
    for (const actor of actors) {
      if (!this._actorStates.has(actor)) continue;

      // Step 1: Sync physics-derived variables
      try {
        this.syncAnimBPVars(actor, deltaTime, deps);
      } catch (err) {
        console.error(`[AnimBP2D] Sync failed on "${actor.name}"`, err);
      }

      // Step 2: Evaluate state machine transitions
      try {
        this.evalAnimBPTransitions(actor, deps);
      } catch (err) {
        console.error(`[AnimBP2D] Transition eval failed on "${actor.name}"`, err);
      }
    }
  }

  // ── Variable Sync ──

  /**
   * Sync physics-derived variables into the actor's __animVars store,
   * run the compiled AnimBP event graph (BeginPlay / Tick), and mirror
   * values back to the animator.
   *
   * This is the SINGLE implementation — no more duplication.
   */
  syncAnimBPVars(actor: any, deltaTime: number, deps: AnimBP2DDeps): void {
    const animator = actor.animator;
    const actorAny = actor as any;

    // ── Step 1: Bootstrap per-actor variable store ──
    if (!actorAny.__animVars) {
      actorAny.__animVars = {
        speed: 0,
        velocityX: 0,
        velocityY: 0,
        isGrounded: false,
        isJumping: false,
        isFalling: false,
        facingRight: true,
      };
      // Copy ABP-declared variable defaults
      const entry = this._actorStates.get(actor);
      const abp = entry?.abp;
      if (abp?.blueprintData?.variables) {
        for (const v of abp.blueprintData.variables as any[]) {
          const key: string = v.name;
          if (!(key in actorAny.__animVars)) {
            let def: any = v.defaultValue ?? null;
            if (v.type === 'Float') def = typeof def === 'number' ? def : 0;
            if (v.type === 'Boolean') def = def === true || def === 'true';
            actorAny.__animVars[key] = def;
          }
        }
      }
    }

    // ── Step 2: Sync physics-driven values ──
    if (animator) {
      animator.syncAutoVariables(actor);
      actorAny.__animVars['speed']      = animator.variables['speed']      ?? 0;
      actorAny.__animVars['velocityX']  = animator.variables['velocityX']  ?? 0;
      actorAny.__animVars['velocityY']  = animator.variables['velocityY']  ?? 0;
      actorAny.__animVars['isGrounded'] = animator.variables['isGrounded'] ?? false;
      actorAny.__animVars['isJumping']  = animator.variables['isJumping']  ?? false;
      actorAny.__animVars['isFalling']  = animator.variables['isFalling']  ?? false;
    } else {
      const rb = actor.getComponent?.('RigidBody2D');
      if (rb?.rigidBody) {
        const vel = rb.rigidBody.linvel();
        actorAny.__animVars['speed']      = Math.abs(vel.x);
        actorAny.__animVars['velocityX']  = vel.x;
        actorAny.__animVars['velocityY']  = vel.y;
        actorAny.__animVars['isGrounded'] = rb.isGrounded ?? false;
        actorAny.__animVars['isJumping']  = vel.y >  0.01 && !(rb.isGrounded ?? false);
        actorAny.__animVars['isFalling']  = vel.y < -0.01 && !(rb.isGrounded ?? false);
      }
    }

    // Override with CharacterMovement2D values (more accurate)
    const cm = actor.characterMovement2D;
    if (cm) {
      const rb = actor.getComponent?.('RigidBody2D');
      const vy = rb?.rigidBody?.linvel()?.y ?? 0;
      actorAny.__animVars['isGrounded']  = cm.isGrounded;
      actorAny.__animVars['isJumping']   = !cm.isGrounded && vy > 0.01;
      actorAny.__animVars['isFalling']   = !cm.isGrounded && vy < -0.01;
      actorAny.__animVars['facingRight'] = cm.facingRight;
      if (animator) {
        animator.variables['isGrounded']  = cm.isGrounded;
        animator.variables['isJumping']   = !cm.isGrounded && vy > 0.01;
        animator.variables['isFalling']   = !cm.isGrounded && vy < -0.01;
        animator.variables['facingRight'] = cm.facingRight;
      }
    }

    // ── Step 3: Execute the compiled AnimBP event graph ──
    const entry = this._actorStates.get(actor);
    const abp = entry?.abp;
    if (!entry) return;

    if (!abp?.compiledCode) {
      if (!actorAny.__warnedNoAnimBPCode) {
        actorAny.__warnedNoAnimBPCode = true;
        console.warn(
          `[AnimBP2D] "${actor.name}" → AnimBP "${abp?.name ?? '(unknown)'}" has no compiled code.`,
          'Open the AnimBP editor → Event Graph tab → add BeginPlay/Tick nodes → press "Compile Graph" → save the project.',
        );
      }
      return;
    }

    let ev = this._actorScripts.get(actor);
    if (!ev) {
      const sc = deps.createScriptComponent();
      sc.code = abp.compiledCode;
      const ok = sc.compile();
      ev = { script: ok ? sc : null, started: false, elapsed: 0 };
      this._actorScripts.set(actor, ev);
      if (!ok) console.warn('[AnimBP2D] Failed to compile event graph for', abp.name);
    }
    if (!ev.script) return;

    // varShim bridges __animVars ↔ animator.variables
    const vars: Record<string, any> = actorAny.__animVars;
    const varShim = {
      get: (k: string) => vars[k],
      set: (k: string, v: any) => {
        vars[k] = v;
        if (animator) animator.variables[k] = v;
      },
      has: (k: string) => k in vars,
    };

    // ── Setup controller shims on the actor ──
    if (!actorAny.__2dControllerShim) {
      actorAny.__2dControllerShim = {
        controllerType: actorAny.controllerClass === 'AIController' ? 'AIController' : 'PlayerController',
        getPawn: () => ({ gameObject: actor }),
        isPossessing: () => true,
      };
    }
    if (actorAny.controller == null) actorAny.controller = actorAny.__2dControllerShim;
    if (actorAny.characterController == null) actorAny.characterController = { gameObject: actor };
    if (actorAny.actorAssetId == null && actorAny.blueprintId) {
      actorAny.actorAssetId = actorAny.blueprintId;
    }

    // ── Build ScriptContext ──
    const spriteActors = deps.getSpriteActors();
    const sceneShim = {
      get gameObjects() { return spriteActors as any[]; },
      findById: (id: number) => spriteActors.find((a: any) => a.id === id) ?? null,
      destroyActor: deps.despawnActor ?? (() => {}),
    };

    const collisionShim = {
      registerCallbacks(_goId: number) {
        const cbs = {
          onBeginOverlap: [] as Array<(evt: any) => void>,
          onEndOverlap: [] as Array<(evt: any) => void>,
          onHit: [] as Array<(evt: any) => void>,
        };
        actor.on?.('triggerBegin2D', (evt: any) => {
          const mapped = { otherActorName: evt.otherName ?? evt.otherActor?.name ?? '', otherActorId: evt.otherActor?.id ?? 0, selfComponentName: evt.selfComponentName ?? '' };
          for (const cb of cbs.onBeginOverlap) cb(mapped);
        });
        actor.on?.('triggerEnd2D', (evt: any) => {
          const mapped = { otherActorName: evt.otherName ?? evt.otherActor?.name ?? '', otherActorId: evt.otherActor?.id ?? 0, selfComponentName: evt.selfComponentName ?? '' };
          for (const cb of cbs.onEndOverlap) cb(mapped);
        });
        actor.on?.('collisionBegin2D', (evt: any) => {
          const mapped = { otherActorName: evt.otherName ?? evt.otherActor?.name ?? '', otherActorId: evt.otherActor?.id ?? 0, selfComponentName: evt.selfComponentName ?? '' };
          for (const cb of cbs.onBeginOverlap) cb(mapped);
        });
        actor.on?.('collisionEnd2D', (evt: any) => {
          const mapped = { otherActorName: evt.otherName ?? evt.otherActor?.name ?? '', otherActorId: evt.otherActor?.id ?? 0, selfComponentName: evt.selfComponentName ?? '' };
          for (const cb of cbs.onEndOverlap) cb(mapped);
        });
        return cbs;
      },
      isOverlapping(_a: number, _b: number) { return false; },
      getOverlappingCount(_id: number) { return 0; },
      getOverlappingIds(_id: number) { return []; },
    };

    const physicsShim = { collision: collisionShim, world: null };

    const ctx: any = {
      gameObject: actor,
      deltaTime,
      elapsedTime: ev.elapsed,
      print: deps.printFn,
      physics: physicsShim,
      scene: sceneShim,
      animInstance: { variables: varShim, asset: abp },
      engine: deps.engineShim ?? null,
      gameInstance: deps.gameInstance ?? null,
      projectManager: deps.projectManager ?? null,
    };

    if (!ev.started) {
      console.log(`[AnimBP2D] ▶ BeginPlay firing for "${actor.name}" (ABP: "${abp.name}")`);
      ev.script.beginPlay(ctx);
      ev.started = true;
    }
    ev.script.tick(ctx);
    ev.elapsed += deltaTime;

    // ── Step 4: Mirror event-graph vars back to animator ──
    if (animator) {
      for (const k of Object.keys(vars)) {
        animator.variables[k] = vars[k];
      }
    }
  }

  // ── Transition Evaluation ──

  /**
   * Evaluate AnimBP state machine transitions for an actor.
   * Fires at most ONE transition per frame.
   */
  evalAnimBPTransitions(actor: any, deps: AnimBP2DDeps): void {
    const entry = this._actorStates.get(actor);
    if (!entry) return;
    const { abp } = entry;
    const sm = abp?.stateMachine;
    if (!sm) return;
    const animator = actor.animator;
    if (!animator) return;
    const vars: Record<string, any> = (actor as any).__animVars ?? animator.variables ?? {};

    // Collect eligible transitions: from current state OR Any-State (*)
    const transitions: any[] = (sm.transitions ?? [])
      .filter((t: any) => t.fromStateId === entry.currentStateId || t.fromStateId === '*')
      .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const t of transitions) {
      if (t.toStateId === entry.currentStateId) continue;

      const hasRules = t.rules && t.rules.length > 0;
      if (!hasRules) {
        // No rules: only fire when current (non-looping) animation finishes
        if (animator.currentAnim?.loop) continue;
        if (animator.isPlaying) continue;
      } else {
        if (!AnimBP2DRuntime._evalTransition(t, vars)) continue;
      }

      const targetState = sm.states.find((s: any) => s.id === t.toStateId);
      if (!targetState) continue;

      entry.currentStateId = t.toStateId;

      // Swap sprite sheet if needed
      if (targetState.spriteSheetId && targetState.spriteSheetId !== animator.spriteSheet?.assetId) {
        const newSheet = deps.spriteSheets.get(targetState.spriteSheetId);
        if (newSheet) {
          // Ensure texture is created
          if (newSheet.image && !newSheet.texture) {
            try {
              const THREE = (globalThis as any).THREE;
              if (!THREE) throw new Error('THREE not available');
              const tex = new THREE.Texture(newSheet.image);
              tex.magFilter = THREE.NearestFilter;
              tex.minFilter = THREE.NearestFilter;
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.flipY = false;
              tex.needsUpdate = true;
              newSheet.texture = tex;
            } catch { /* THREE not available — texture should already be set */ }
          }
          animator.setSpriteSheet?.(newSheet);
        }
      }

      // Apply blend space or direct animation
      if (targetState.outputType === 'blendSprite1D') {
        this._applyBlendSprite1DState(targetState, abp, vars, animator);
      } else if (targetState.blendSpace1D) {
        // PCBuildTarget uses blendSpace1D directly
        this._applyBlendSpaceCompat(targetState, vars, animator);
      } else if (targetState.spriteAnimationName) {
        animator.play(targetState.spriteAnimationName);
      }
      return; // fire one transition per frame
    }

    // ── Continuous blend space update ──
    const currentState = sm.states.find((s: any) => s.id === entry.currentStateId);
    if (currentState?.outputType === 'blendSprite1D') {
      this._applyBlendSprite1DState(currentState, abp, vars, animator);
    } else if (currentState?.blendSpace1D) {
      this._applyBlendSpaceCompat(currentState, vars, animator);
    }
  }

  // ── Blend Space ──

  /** Apply blendSprite1D state (Scene2DManager format, uses abp.blendSprites1D array) */
  private _applyBlendSprite1DState(state: any, abp: any, vars: Record<string, any>, animator: any): void {
    const blendSprites1D: any[] = abp.blendSprites1D ?? [];
    const bs = blendSprites1D.find((b: any) => b.id === state.blendSprite1DId);
    if (!bs || !bs.samples?.length) {
      if (state.spriteAnimationName) animator.play(state.spriteAnimationName);
      return;
    }
    AnimBP2DRuntime._applyBlendSamples(state, bs, vars, animator);
  }

  /** Apply blend space (PCBuildTarget format, uses state.blendSpace1D directly) */
  private _applyBlendSpaceCompat(state: any, vars: Record<string, any>, animator: any): void {
    const bs = state.blendSpace1D;
    if (!bs?.samples?.length) {
      if (state.spriteAnimationName) animator.play(state.spriteAnimationName);
      return;
    }
    AnimBP2DRuntime._applyBlendSamples(state, bs, vars, animator);
  }

  /** Shared blend-sample evaluation logic */
  private static _applyBlendSamples(state: any, bs: any, vars: Record<string, any>, animator: any): void {
    const drivingVar = state.blendSpriteAxisVar || bs.drivingVariable;
    const axisValue: number = typeof vars[drivingVar] === 'number' ? vars[drivingVar] : 0;

    const sorted = [...bs.samples].sort((a: any, b: any) => a.rangeMin - b.rangeMin);
    let best = sorted.find((s: any) => axisValue >= s.rangeMin && axisValue <= s.rangeMax);
    if (!best) {
      best = sorted.reduce((prev: any, cur: any) => {
        const prevMid = (prev.rangeMin + prev.rangeMax) / 2;
        const curMid = (cur.rangeMin + cur.rangeMax) / 2;
        return Math.abs(axisValue - curMid) < Math.abs(axisValue - prevMid) ? cur : prev;
      });
    }
    if (!best?.spriteAnimationName) return;
    if (animator.currentAnim?.animName !== best.spriteAnimationName) {
      animator.play(best.spriteAnimationName);
    }
  }

  // ── Transition Rule Evaluation (static — pure functions) ──

  static _evalTransition(t: any, vars: Record<string, any>): boolean {
    const groups: any[] = t.rules ?? [];
    if (groups.length === 0) return true;
    const logic: string = t.ruleLogic ?? 'AND';
    if (logic === 'AND') return groups.every((g: any) => AnimBP2DRuntime._evalRuleGroup(g, vars));
    return groups.some((g: any) => AnimBP2DRuntime._evalRuleGroup(g, vars));
  }

  static _evalRuleGroup(group: any, vars: Record<string, any>): boolean {
    const rules: any[] = group.rules ?? [];
    if (rules.length === 0) return true;
    if (group.op === 'AND') return rules.every((r: any) => AnimBP2DRuntime._evalRule(r, vars));
    return rules.some((r: any) => AnimBP2DRuntime._evalRule(r, vars));
  }

  static _evalRule(rule: any, vars: Record<string, any>): boolean {
    if (rule.kind === 'expr') {
      try {
        // eslint-disable-next-line no-new-func
        return !!new Function('vars', `with(vars){return!!(${rule.expr})}`)(vars);
      } catch { return false; }
    }
    const val = vars[rule.varName];
    const cmp = rule.value;
    switch (rule.op) {
      case '==':       return val == cmp;  // loose: bool vs number
      case '!=':       return val != cmp;
      case '>':        return Number(val) > Number(cmp);
      case '<':        return Number(val) < Number(cmp);
      case '>=':       return Number(val) >= Number(cmp);
      case '<=':       return Number(val) <= Number(cmp);
      case 'contains': return String(val).includes(String(cmp));
      default:         return false;
    }
  }

  // ── Controller Shims ──

  /**
   * Setup controller/characterController shims on all 2D actors.
   * Must be called once after actors are spawned.
   */
  static setupControllerShims(actors: any[]): void {
    for (const actor of actors) {
      const actorAny = actor as any;
      if (!actorAny.__2dControllerShim) {
        actorAny.__2dControllerShim = {
          controllerType: actor.controllerClass === 'AIController' ? 'AIController' : 'PlayerController',
          getPawn: () => ({ gameObject: actor }),
          isPossessing: () => true,
        };
      }
      if (actorAny.controller == null) actorAny.controller = actorAny.__2dControllerShim;
      if (actorAny.characterController == null) actorAny.characterController = { gameObject: actor };
      if (actorAny.actorAssetId == null && actorAny.blueprintId) {
        actorAny.actorAssetId = actorAny.blueprintId;
      }
    }
  }
}
