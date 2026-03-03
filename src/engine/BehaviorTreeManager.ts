// ============================================================
//  BehaviorTreeManager — Bridges BT assets → runtime BehaviorTree
//  Lives on the Engine so generated code can call
//  __engine.behaviorTreeManager.get(id) / .instantiate(asset)
// ============================================================

import {
  BehaviorTree,
  BTNode,
  BTNodeState,
  BTSequence,
  BTSelector,
  BTInverter,
  BTForceSuccess,
  BTWaitTask,
  BTCustomTask,
} from './ai/BehaviorTree';

import type { BehaviorTreeAsset, BTNodeData } from '../runtime/RuntimeTypes';

export class BehaviorTreeManager {
  /** Reference back to the AIAssetManager so we can look up assets by ID */
  private _getAsset: (id: string) => BehaviorTreeAsset | undefined;
  private _getTaskCode: (assetRef: string) => string | undefined;
  /** Engine reference so we can build proper ScriptContexts for task code */
  private _engine: any = null;

  constructor(
    getAsset: (id: string) => BehaviorTreeAsset | undefined,
    getTaskCode?: (assetRef: string) => string | undefined,
  ) {
    this._getAsset = getAsset;
    this._getTaskCode = getTaskCode ?? (() => undefined);
  }

  /** Set the engine reference (called after engine is ready) */
  setEngine(engine: any): void {
    this._engine = engine;
  }

  /** Look up a BehaviorTreeAsset by ID */
  get(id: string): BehaviorTreeAsset | undefined {
    return this._getAsset(id);
  }

  /** Convert a BehaviorTreeAsset into a live BehaviorTree instance */
  instantiate(asset: BehaviorTreeAsset): BehaviorTree {
    const tree = new BehaviorTree();

    if (!asset.rootNodeId || !asset.nodes[asset.rootNodeId]) {
      console.warn('[BT] instantiate: no root node found');
      return tree; // empty tree
    }

    // The root asset node is a virtual 'root' — build from its first child
    const rootData = asset.nodes[asset.rootNodeId];
    console.log(`[BT] instantiate: root="${rootData.label}" children=${rootData.children.length}, totalNodes=${Object.keys(asset.nodes).length}`);
    if (rootData.children.length > 0) {
      tree.root = this._buildNode(rootData.children[0], asset.nodes);
    } else {
      // Root itself might be a composite
      tree.root = this._buildNode(asset.rootNodeId, asset.nodes);
    }

    return tree;
  }

  // ── Recursive builder ──

  private _buildNode(nodeId: string, nodes: Record<string, BTNodeData>): BTNode | null {
    const data = nodes[nodeId];
    if (!data) {
      console.warn(`[BT] _buildNode: node "${nodeId}" not found in nodes map`);
      return null;
    }
    console.log(`[BT] _buildNode: id="${data.id}" type="${data.type}" label="${data.label}" builtinId="${data.builtinId || ''}" assetRef="${data.assetRef || ''}" children=${data.children?.length || 0}`);

    let rtNode: BTNode | null = null;

    switch (data.type) {
      case 'root': {
        // Root is typically a pass-through to its first child
        if (data.children.length > 0) {
          return this._buildNode(data.children[0], nodes);
        }
        return null;
      }

      case 'composite': {
        switch (data.compositeType) {
          case 'Selector': {
            const sel = new BTSelector();
            sel.id = data.id;
            sel.name = data.label;
            for (const childId of data.children) {
              const child = this._buildNode(childId, nodes);
              if (child) sel.children.push(child);
            }
            rtNode = sel;
            break;
          }
          case 'Sequence':
          default: {
            const seq = new BTSequence();
            seq.id = data.id;
            seq.name = data.label;
            for (const childId of data.children) {
              const child = this._buildNode(childId, nodes);
              if (child) seq.children.push(child);
            }
            rtNode = seq;
            break;
          }
        }
        break;
      }

      case 'decorator': {
        const builtinId = data.builtinId || '';
        if (builtinId === 'Inverter' || builtinId === 'inverter') {
          const inv = new BTInverter();
          inv.id = data.id;
          inv.name = data.label;
          if (data.children.length > 0) {
            inv.child = this._buildNode(data.children[0], nodes);
          }
          rtNode = inv;
        } else if (builtinId === 'ForceSuccess' || builtinId === 'force_success') {
          const fs = new BTForceSuccess();
          fs.id = data.id;
          fs.name = data.label;
          if (data.children.length > 0) {
            fs.child = this._buildNode(data.children[0], nodes);
          }
          rtNode = fs;

        // ── bt_bbcondition — Blackboard Condition ──
        } else if (builtinId === 'bt_bbcondition') {
          const child = data.children.length > 0 ? this._buildNode(data.children[0], nodes) : null;
          const bbKey = data.properties?.Key ?? '';
          const operator = data.properties?.Operator ?? 'IsSet';
          const compareValue = data.properties?.Value;
          const condTask = new BTCustomTask();
          condTask.id = data.id;
          condTask.name = data.label;
          condTask.executeFn = (ctx) => {
            const val = ctx.blackboard.get(bbKey);
            let conditionMet = false;
            switch (operator) {
              case 'IsSet': conditionMet = val !== undefined && val !== null; break;
              case 'IsNotSet': conditionMet = val === undefined || val === null; break;
              case 'Equals': conditionMet = val == compareValue; break;
              case 'NotEquals': conditionMet = val != compareValue; break;
              case 'GreaterThan': conditionMet = val > compareValue; break;
              case 'LessThan': conditionMet = val < compareValue; break;
              default: conditionMet = val !== undefined && val !== null; break;
            }
            if (!conditionMet) return BTNodeState.Failure;
            if (child) return child.tick(ctx);
            return BTNodeState.Success;
          };
          condTask.abortFn = (ctx) => { child?.abort(ctx); };
          rtNode = condTask;

        // ── bt_cooldown ──
        } else if (builtinId === 'bt_cooldown') {
          const child = data.children.length > 0 ? this._buildNode(data.children[0], nodes) : null;
          const cooldownTime = data.properties?.CooldownTime ?? 5.0;
          let lastRunTime = -Infinity;
          let accumulated = 0;
          const cdTask = new BTCustomTask();
          cdTask.id = data.id;
          cdTask.name = data.label;
          cdTask.executeFn = (ctx) => {
            accumulated += ctx.deltaTime;
            if (accumulated - lastRunTime < cooldownTime) return BTNodeState.Failure;
            if (child) {
              const result = child.tick(ctx);
              if (result !== BTNodeState.Running) lastRunTime = accumulated;
              return result;
            }
            lastRunTime = accumulated;
            return BTNodeState.Success;
          };
          cdTask.abortFn = (ctx) => { child?.abort(ctx); };
          rtNode = cdTask;

        // ── bt_loop ──
        } else if (builtinId === 'bt_loop') {
          const child = data.children.length > 0 ? this._buildNode(data.children[0], nodes) : null;
          const numLoops = data.properties?.NumLoops ?? 3;
          let currentLoop = 0;
          const loopTask = new BTCustomTask();
          loopTask.id = data.id;
          loopTask.name = data.label;
          loopTask.executeFn = (ctx) => {
            if (!child) return BTNodeState.Success;
            const result = child.tick(ctx);
            if (result === BTNodeState.Running) return BTNodeState.Running;
            currentLoop++;
            if (numLoops > 0 && currentLoop >= numLoops) {
              currentLoop = 0;
              return result;
            }
            // Loop again
            return BTNodeState.Running;
          };
          loopTask.abortFn = (ctx) => { currentLoop = 0; child?.abort(ctx); };
          rtNode = loopTask;

        // ── bt_timelimit ──
        } else if (builtinId === 'bt_timelimit') {
          const child = data.children.length > 0 ? this._buildNode(data.children[0], nodes) : null;
          const timeLimit = data.properties?.TimeLimit ?? 10.0;
          let elapsed = 0;
          const tlTask = new BTCustomTask();
          tlTask.id = data.id;
          tlTask.name = data.label;
          tlTask.executeFn = (ctx) => {
            elapsed += ctx.deltaTime;
            if (elapsed >= timeLimit) {
              elapsed = 0;
              child?.abort(ctx);
              return BTNodeState.Failure;
            }
            if (child) {
              const result = child.tick(ctx);
              if (result !== BTNodeState.Running) elapsed = 0;
              return result;
            }
            return BTNodeState.Success;
          };
          tlTask.abortFn = (ctx) => { elapsed = 0; child?.abort(ctx); };
          rtNode = tlTask;

        // ── bt_hastargetsight ──
        } else if (builtinId === 'bt_hastargetsight') {
          const child = data.children.length > 0 ? this._buildNode(data.children[0], nodes) : null;
          const targetKey = data.properties?.TargetKey ?? '';
          const sightTask = new BTCustomTask();
          sightTask.id = data.id;
          sightTask.name = data.label;
          sightTask.executeFn = (ctx) => {
            const target = ctx.blackboard.get(targetKey);
            if (!target) return BTNodeState.Failure;
            // Check via AI controller perception if available
            const ctrl = ctx.aiController;
            if (ctrl && typeof ctrl.hasLineOfSightTo === 'function') {
              if (!ctrl.hasLineOfSightTo(target)) return BTNodeState.Failure;
            }
            if (child) return child.tick(ctx);
            return BTNodeState.Success;
          };
          sightTask.abortFn = (ctx) => { child?.abort(ctx); };
          rtNode = sightTask;

        } else {
          // Generic decorator — wrap as ForceSuccess fallback
          const dec = new BTForceSuccess();
          dec.id = data.id;
          dec.name = data.label;
          if (data.children.length > 0) {
            dec.child = this._buildNode(data.children[0], nodes);
          }
          rtNode = dec;
        }
        break;
      }

      case 'task': {
        const builtinId = data.builtinId || '';

        // ── bt_wait ──
        if (builtinId === 'bt_wait' || builtinId === 'Wait' || builtinId === 'wait') {
          const wait = new BTWaitTask();
          wait.id = data.id;
          wait.name = data.label;
          wait.waitTime = data.properties?.WaitTime ?? data.properties?.waitTime ?? data.properties?.duration ?? 1.0;
          const dev = data.properties?.RandomDeviation ?? 0;
          if (dev > 0) wait.waitTime += (Math.random() * 2 - 1) * dev;
          rtNode = wait;

        // ── bt_moveto ──
        } else if (builtinId === 'bt_moveto') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const targetKey = data.properties?.TargetKey ?? '';
          const acceptableRadius = parseFloat(data.properties?.AcceptableRadius ?? 50);

          const movingState = new WeakMap<any, { isMoving: boolean; lastTx?: number; lastTy?: number; lastTz?: number; loggedOnce?: boolean }>();

          task.executeFn = (ctx) => {
            if (!targetKey) {
              console.warn(`[BT MoveTo] No TargetKey configured — set the TargetKey property on the Move To node in the BT Editor`);
              return BTNodeState.Failure;
            }
            const target = ctx.blackboard.get(targetKey);

            // Debug: log blackboard state on first execution
            let st = movingState.get(ctx);
            if (!st) {
              st = { isMoving: false };
              movingState.set(ctx, st);
            }
            if (!st.loggedOnce) {
              st.loggedOnce = true;
              console.log(`[BT MoveTo] TargetKey="${targetKey}" value=`, target,
                `| All BB keys:`, [...ctx.blackboard.keys()],
                `| All BB entries:`, [...ctx.blackboard.entries()]);
            }

            if (target == null) {
              console.warn(`[BT MoveTo] Blackboard key "${targetKey}" not found or null. Available keys:`, [...ctx.blackboard.keys()]);
              return BTNodeState.Failure;
            }

            let tx = 0, ty = 0, tz = 0;
            if (typeof target === 'object' && target !== null && typeof target.x === 'number') {
              tx = target.x; ty = target.y || 0; tz = target.z || 0;
            } else if (target?.position) {
              tx = target.position.x; ty = target.position.y; tz = target.position.z;
            } else {
              console.warn(`[BT MoveTo] Target value for key "${targetKey}" is not a vector or actor:`, target);
              return BTNodeState.Failure;
            }

            const ctrl = ctx.aiController;
            const pawn = ctx.gameObject;
            // Game objects store position in mesh.position (3D) or group.position (2D)
            const pawnPos = pawn?.mesh?.position ?? pawn?.group?.position ?? pawn?.position;
            if (!pawnPos) {
              console.warn(`[BT MoveTo] Pawn has no position property (expected mesh.position or group.position)`);
              return BTNodeState.Failure;
            }

            const dx = tx - pawnPos.x;
            const dy = ty - pawnPos.y;
            const dz = tz - pawnPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist <= acceptableRadius) {
              if (ctrl && ctrl.state === 'movingTo') ctrl.stopMovement();
              movingState.delete(ctx);
              return BTNodeState.Success;
            }

            if (ctrl && typeof ctrl.moveTo === 'function') {
              const changed = st.lastTx !== tx || st.lastTy !== ty || st.lastTz !== tz;
              if (!st.isMoving || changed) {
                console.log(`[BT MoveTo] Calling ctrl.moveTo(${tx}, ${ty}, ${tz}) dist=${dist.toFixed(1)} radius=${acceptableRadius}`);
                ctrl.moveTo(tx, ty, tz);
                st.isMoving = true;
                st.lastTx = tx;
                st.lastTy = ty;
                st.lastTz = tz;
              }
              // If ctrl arrived (state went idle) but BT dist check not yet met,
              // wait a couple frames before re-issuing to avoid spam
              if (st.isMoving && ctrl.state !== 'movingTo') {
                st.isMoving = false; // allow re-issue next frame
              }
              return BTNodeState.Running;
            }

            // Fallback: simple move toward target for pawns with no AIController
            const speed = 200 * ctx.deltaTime;
            const step = Math.min(speed, dist);
            pawnPos.x += (dx / dist) * step;
            pawnPos.y += (dy / dist) * step;
            pawnPos.z += (dz / dist) * step;
            return BTNodeState.Running;
          };

          task.abortFn = (ctx) => {
            if (ctx.aiController) ctx.aiController.stopMovement();
            movingState.delete(ctx);
          };
          rtNode = task;

        // ── bt_rotateto ──
        } else if (builtinId === 'bt_rotateto') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const targetKey = data.properties?.TargetKey ?? '';
          const rotSpeed = data.properties?.RotationSpeed ?? 360;
          task.executeFn = (ctx) => {
            if (!targetKey) return BTNodeState.Failure;
            const target = ctx.blackboard.get(targetKey);
            if (!target) return BTNodeState.Failure;
            const ctrl = ctx.aiController;
            if (ctrl && typeof ctrl.setFocalPoint === 'function') {
              ctrl.setFocalPoint(target);
              return BTNodeState.Success;
            }
            // Fallback: rotate pawn toward target
            const pawn = ctx.gameObject;
            if (pawn?.rotation && target) {
              const tx = target.x ?? target.position?.x ?? 0;
              const tz = target.z ?? target.position?.z ?? 0;
              const dx = tx - (pawn.position?.x ?? 0);
              const dz = tz - (pawn.position?.z ?? 0);
              const targetAngle = Math.atan2(dx, dz);
              pawn.rotation.y = targetAngle;
              return BTNodeState.Success;
            }
            return BTNodeState.Failure;
          };
          rtNode = task;

        // ── bt_setbb ──
        } else if (builtinId === 'bt_setbb') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const bbKey = data.properties?.Key ?? '';
          const bbValue = data.properties?.Value;
          task.executeFn = (ctx) => {
            if (!bbKey) return BTNodeState.Failure;
            ctx.blackboard.set(bbKey, bbValue);
            return BTNodeState.Success;
          };
          rtNode = task;

        // ── bt_navmesh_random_point ──
        // Picks a random navigable point on the NavMesh around the pawn and
        // stores it in a blackboard key. Falls back to a random point in a
        // circle if no NavMesh is available so the BT can still loop.
        } else if (builtinId === 'bt_navmesh_random_point') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const resultKey = data.properties?.BlackboardKey ?? '';
          const radius    = parseFloat(data.properties?.Radius ?? 500);
          task.executeFn = (ctx) => {
            if (!resultKey) return BTNodeState.Failure;

            const ctrl = ctx.aiController;
            const meshPos = ctx.gameObject?.mesh?.position;
            const goPos   = ctx.gameObject?.position;
            const px = meshPos?.x ?? goPos?.x ?? 0;
            const py = meshPos?.y ?? goPos?.y ?? 0;
            const pz = meshPos?.z ?? goPos?.z ?? 0;

            // Try NavMesh first
            const navMesh = ctrl?.navMeshSystem;
            if (navMesh && navMesh.isReady) {
              // findRandomPoint accepts any {x,y,z} object at runtime
              const result = navMesh.findRandomPoint({ x: px, y: py, z: pz } as any, radius);
              if (result && result.success) {
                ctx.blackboard.set(resultKey, { x: result.point.x, y: result.point.y, z: result.point.z });
                return BTNodeState.Success;
              }
            }

            // Fallback: random point in a horizontal circle around the pawn
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            ctx.blackboard.set(resultKey, {
              x: px + Math.cos(angle) * r,
              y: py,
              z: pz + Math.sin(angle) * r,
            });
            return BTNodeState.Success;
          };
          rtNode = task;

        // ── bt_investigate ──
        } else if (builtinId === 'bt_investigate') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const locKey = data.properties?.LocationKey ?? '';
          const invTime = data.properties?.InvestigateTime ?? 3.0;
          let elapsed = 0;
          let arrived = false;
          task.executeFn = (ctx) => {
            if (!locKey) return BTNodeState.Failure;
            const loc = ctx.blackboard.get(locKey);
            if (!loc) return BTNodeState.Failure;
            const pawn = ctx.gameObject;
            if (!arrived && pawn?.position) {
              const tx = loc.x ?? 0;
              const tz = loc.z ?? 0;
              const dx = tx - pawn.position.x;
              const dz = tz - pawn.position.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist <= 50) {
                arrived = true;
              } else {
                const speed = 200 * ctx.deltaTime;
                pawn.position.x += (dx / dist) * Math.min(speed, dist);
                pawn.position.z += (dz / dist) * Math.min(speed, dist);
                return BTNodeState.Running;
              }
            }
            elapsed += ctx.deltaTime;
            if (elapsed >= invTime) {
              elapsed = 0;
              arrived = false;
              return BTNodeState.Success;
            }
            return BTNodeState.Running;
          };
          task.abortFn = () => { elapsed = 0; arrived = false; };
          rtNode = task;

        // ── bt_searcharea ──
        } else if (builtinId === 'bt_searcharea') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          task.executeFn = (ctx) => {
            // Placeholder — search area finishes immediately
            return BTNodeState.Success;
          };
          rtNode = task;

        // ── bt_playanim ──
        } else if (builtinId === 'bt_playanim') {
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;
          const animAsset = data.properties?.AnimationAsset ?? '';
          const loop = data.properties?.Loop ?? false;
          task.executeFn = (ctx) => {
            const ctrl = ctx.aiController;
            if (ctrl && typeof ctrl.playAnimation === 'function') {
              ctrl.playAnimation(animAsset, loop);
            }
            return BTNodeState.Success;
          };
          rtNode = task;

        } else {
          // Custom task — compile the task blueprint code using ScriptComponent-style parsing
          const task = new BTCustomTask();
          task.id = data.id;
          task.name = data.label;

          if (data.assetRef) {
            const code = this._getTaskCode(data.assetRef);
            console.log(`[BT] Custom task "${data.label}": assetRef="${data.assetRef}" codeLength=${code ? code.length : 'undefined'}`);
            console.log(`[BT] FULL TASK CODE for "${data.label}":\n`, code);
            if (code && code.length > 0) {
              try {
                const compiled = this._compileTaskCode(code, data.properties);
                console.log(`[BT] Custom task "${data.label}": compiled beginPlay=${!!compiled?.beginPlay} tick=${!!compiled?.tick} onDestroy=${!!compiled?.onDestroy}`);
                if (compiled) {
                  let initialized = false;
                  task.executeFn = (ctx) => {
                    try {
                      // Build a ScriptContext from the BTContext
                      const scriptCtx = this._btContextToScriptCtx(ctx);

                      // On first execution, call beginPlay (AI Receive Execute → ... → Finish Execute)
                      if (!initialized) {
                        initialized = true;
                        if (compiled.beginPlay) {
                          console.log(`[BT] Task "${data.label}" scriptCtx.aiController=`, scriptCtx.aiController, `gameObject.aiController=`, scriptCtx.gameObject?.aiController);
                          const result = compiled.beginPlay(scriptCtx);
                          console.log(`[BT] Task "${data.label}" beginPlay returned:`, result);
                          if (result === 'Success') return BTNodeState.Success;
                          if (result === 'Failure') return BTNodeState.Failure;
                          if (result === 'Running') return BTNodeState.Running;
                          // If beginPlay returned something else or undefined,
                          // check if there's tick logic — if so, return Running
                          if (compiled.tick) return BTNodeState.Running;
                          return BTNodeState.Success;
                        }
                      }

                      // On subsequent ticks, call tick (e.g. AI Receive Tick)
                      if (compiled.tick) {
                        const result = compiled.tick(scriptCtx);
                        if (result === 'Success') return BTNodeState.Success;
                        if (result === 'Failure') return BTNodeState.Failure;
                        if (result === 'Running') return BTNodeState.Running;
                      }
                      return BTNodeState.Success;
                    } catch (e) {
                      console.warn(`[BT] Task "${data.label}" error:`, e);
                      return BTNodeState.Failure;
                    }
                  };
                  task.abortFn = (ctx) => {
                    if (compiled.onDestroy) {
                      try {
                        compiled.onDestroy(this._btContextToScriptCtx(ctx));
                      } catch (e) {
                        console.warn(`[BT] Task "${data.label}" abort error:`, e);
                      }
                    }
                    initialized = false;
                  };
                }
              } catch (e) {
                console.warn(`[BT] Failed to compile task "${data.label}":`, e);
              }
            } else {
              console.warn(`[BT] Custom task "${data.label}": compiledCode is EMPTY — task will auto-succeed without running blueprint logic. Open the task blueprint editor to compile it.`);
            }
          } else {
            console.warn(`[BT] Custom task "${data.label}": no assetRef set — task has no blueprint`);
          }
          rtNode = task;
        }
        break;
      }

      case 'service': {
        // Services are typically attached to composites, but if standalone just skip
        const task = new BTCustomTask();
        task.id = data.id;
        task.name = data.label;
        task.executeFn = () => BTNodeState.Success;
        rtNode = task;
        break;
      }

      default: {
        console.warn(`[BT] Unknown node type: ${data.type}`);
        return null;
      }
    }

    return rtNode;
  }

  // ============================================================
  //  Task Blueprint Code Compilation Helpers
  // ============================================================

  /**
   * Build a ScriptContext from a BTContext so that compiled blueprint code
   * (which expects gameObject, print, __engine, etc.) can run properly.
   */
  private _btContextToScriptCtx(ctx: import('./ai/BehaviorTree').BTContext): any {
    const engine = this._engine;

    // Ensure the gameObject has .aiController set so generated code like
    // `gameObject.aiController` resolves correctly.  The Engine sets this
    // during onPlayStarted, but we also apply it here as a safety net
    // (the BTContext always has the authoritative aiController reference).
    const go = ctx.gameObject;
    if (go && ctx.aiController) {
      go.aiController = ctx.aiController;
    }

    return {
      gameObject: go,
      deltaTime: ctx.deltaTime,
      elapsedTime: 0,
      print: engine ? (v: any) => engine.onPrint(v) : (v: any) => console.log('[BT Print]', v),
      physics: engine?.physics || null,
      scene: engine?.scene || null,
      uiManager: engine?.uiManager || null,
      animInstance: null,
      meshAssetManager: null,
      loadMeshFromAsset: null,
      buildThreeMaterialFromAsset: null,
      engine: engine || null,
      gameInstance: engine?.gameInstance || null,
      projectManager: engine?.projectManager || null,
      __pTrack: null,
      aiController: ctx.aiController || null,
    };
  }

  /**
   * Compile a task's generated code (with __beginPlay__ / __tick__ / __onDestroy__ markers)
   * into lifecycle functions, mirroring ScriptComponent._compileShared().
   * Returns functions whose return values are captured (unlike ScriptComponent which ignores them).
   * @param properties Optional property overrides from the Behavior Tree node to inject into script variables.
   */
  private _compileTaskCode(code: string, properties?: Record<string, any>): {
    beginPlay: ((ctx: any) => any) | null;
    tick: ((ctx: any) => any) | null;
    onDestroy: ((ctx: any) => any) | null;
  } | null {
    const beginPlayCode = this._extractBlock(code, '__beginPlay__') || '';
    const tickCode = this._extractBlock(code, '__tick__') || '';
    const destroyCode = this._extractBlock(code, '__onDestroy__') || '';
    const preamble = this._extractPreamble(code);

    if (!beginPlayCode && !tickCode && !destroyCode && !preamble) {
      return null;
    }

    let overrides = '';
    if (properties) {
      overrides = '// Property overrides from BT Editor\n' + Object.entries(properties).map(([k, v]) => {
        const safeName = k.replace(/[^a-zA-Z0-9_]/g, '_');
        return `if (typeof __var_${safeName} !== 'undefined') { __var_${safeName} = ${JSON.stringify(v)}; }`;
      }).join('\n');
    }

    // Build a factory function identical to ScriptComponent._compileShared,
    // but each lifecycle function RETURNS a value (so FinishExecuteNode's
    // `return 'Success'` / `return 'Failure'` is captured).
    const ctxSetup = `
  __ctx = ctx;
  gameObject = ctx.gameObject;
  deltaTime = ctx.deltaTime;
  elapsedTime = ctx.elapsedTime;
  print = ctx.print;
  __physics = ctx.physics || null;
  __scene = ctx.scene || null;
  __uiManager = ctx.uiManager || null;
  __animInstance = ctx.animInstance || null;
  __meshAssetManager = ctx.meshAssetManager || null;
  __loadMeshFromAsset = ctx.loadMeshFromAsset || null;
  __buildThreeMaterialFromAsset = ctx.buildThreeMaterialFromAsset || null;
  __engine = ctx.engine || null;
  __gameInstance = ctx.gameInstance || null;
  __pTrack = ctx.__pTrack || null;
  __aiController = ctx.aiController || null;`;

    const factoryBody = `
  var gameObject, deltaTime, elapsedTime, print, __physics, __scene, __uiManager, __animInstance, __meshAssetManager, __loadMeshFromAsset, __buildThreeMaterialFromAsset, __engine, __gameInstance, __ctx, __pTrack, __aiController;

${preamble}

${overrides}

var __bp = null;
var __tk = null;
var __od = null;

${beginPlayCode.trim() ? `__bp = function(ctx) {
  ${ctxSetup}
  ${beginPlayCode}
};` : ''}

${tickCode.trim() ? `__tk = function(ctx) {
  ${ctxSetup}
  ${tickCode}
};` : ''}

${destroyCode.trim() ? `__od = function(ctx) {
  ${ctxSetup}
  ${destroyCode}
};` : ''}

return { beginPlay: __bp, tick: __tk, onDestroy: __od };
`;

    try {
      const factory = new Function(factoryBody) as () => {
        beginPlay: ((ctx: any) => any) | null;
        tick: ((ctx: any) => any) | null;
        onDestroy: ((ctx: any) => any) | null;
      };
      const result = factory();
      console.log(`[BT] _compileTaskCode: factory succeeded. beginPlay=${!!result.beginPlay}, tick=${!!result.tick}, onDestroy=${!!result.onDestroy}`);
      return result;
    } catch (e) {
      console.warn('[BT] Task code compilation error:', e);
      console.warn('[BT] Factory body was:', factoryBody);
      return null;
    }
  }

  /** Extract everything before the first lifecycle marker */
  private _extractPreamble(code: string): string {
    const markers = ['// __beginPlay__', '// __tick__', '// __onDestroy__'];
    let first = code.length;
    for (const m of markers) {
      const idx = code.indexOf(m);
      if (idx !== -1 && idx < first) first = idx;
    }
    return code.slice(0, first).trim();
  }

  /** Extract a block of code between a marker and the next marker */
  private _extractBlock(code: string, label: string): string | null {
    const marker = `// ${label}`;
    const idx = code.indexOf(marker);
    if (idx === -1) return null;

    const nextMarkers = ['// __beginPlay__', '// __tick__', '// __onDestroy__'];
    let end = code.length;
    for (const m of nextMarkers) {
      if (m === marker) continue;
      const mIdx = code.indexOf(m, idx + marker.length);
      if (mIdx !== -1 && mIdx < end) end = mIdx;
    }

    return code.slice(idx + marker.length, end).trim();
  }
}
