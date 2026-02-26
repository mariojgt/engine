// ============================================================
//  ProfilerHooks — Instrumentation hooks for the profiling
//  system. Works by:
//
//  1. Wrapping Engine.update() to track per-frame actor state
//     for BOTH 3D (scene.gameObjects) and 2D (scene2DManager.
//     spriteActors)
//  2. Wrapping ScriptComponent.prototype.tick/beginPlay to
//     measure per-actor script execution time
//  3. Wrapping the ScriptContext's runtime APIs (print, scene,
//     physics, engine, uiManager) with profiling proxies that
//     detect individual node executions from generated code
//  4. Wrapping Scene.destroyActor/spawnActorFromClass
//  5. Wrapping EventBus.emit
//  6. Wrapping Scene2DManager.spawnActorFromClassId/despawnSpriteActor2D
//
//  The key insight: generated blueprint code calls runtime APIs
//  through the ScriptContext (e.g. `print(...)`, `__scene.
//  spawnActorFromClass(...)`, `__scene.destroyActor(...)`).
//  By intercepting these APIs at the context level, we detect
//  WHICH blueprint nodes are executing.
// ============================================================

import type { Engine } from '../../engine/Engine';
import type { GameObject } from '../../engine/GameObject';
import { ScriptComponent } from '../../engine/ScriptComponent';
import { EventBus } from '../../engine/EventBus';
import { ProfilerStore } from './ProfilerStore';

let _installed = false;

// Saved originals for teardown
let _origUpdate: (() => void) | null = null;
let _origDestroyActor: ((go: GameObject) => void) | null = null;
let _origSpawnActorFromClass: ((...args: any[]) => any) | null = null;
let _origEventBusEmit: ((event: string, ...args: any[]) => void) | null = null;
let _origScriptTick: ((ctx: any) => void) | null = null;
let _origScriptBeginPlay: ((ctx: any) => void) | null = null;
let _origScriptOnDestroy: ((ctx: any) => void) | null = null;
let _origGetCtx: ((...args: any[]) => any) | null = null;
let _origPrint: ((v: any) => void) | null = null;
let _orig2DSpawnFromClassId: ((...args: any[]) => any) | null = null;
let _orig2DDespawn: ((actor: any) => void) | null = null;
let _prevActorIds: Set<number> = new Set();
let _prev2DActorIds: Set<number> = new Set();
let _loggedFirstFrame = false;
let _engine: Engine | null = null;

// Per-frame state tracking for node exec attribution
let _currentActorId: number = -1;
let _currentActorName: string = '';
let _currentGraphName: string = '';
let _silentActorErrors: number = 0;

/** Gather component names from a GameObject */
function _gatherComponents(go: GameObject): string[] {
  const compNames: string[] = [];
  try {
    if ((go as any)._triggerComponents) {
      for (const t of (go as any)._triggerComponents) compNames.push(`Trigger:${t.name || 'trigger'}`);
    }
    if ((go as any)._lightComponents) {
      for (const l of (go as any)._lightComponents) compNames.push(`Light:${l.name || 'light'}`);
    }
    if ((go as any)._meshComponents) {
      for (const m of (go as any)._meshComponents) compNames.push(`Mesh:${m.name || 'mesh'}`);
    }
    if (go.scripts && go.scripts.length > 0) compNames.push(`Script×${go.scripts.length}`);
    if (go.components) {
      for (const c of go.components) compNames.push(c.constructor.name);
    }
    if ((go as any)._runtimeComponents && (go as any)._runtimeComponents.size > 0) {
      for (const [key] of (go as any)._runtimeComponents) compNames.push(`RT:${key}`);
    }
  } catch { /* defensive */ }
  return compNames;
}

/** Gather component names from a 2D SpriteActor */
function _gatherComponents2D(actor: any): string[] {
  const compNames: string[] = [];
  try {
    if (actor.spriteRenderer) compNames.push('SpriteRenderer');
    if (actor.animator) compNames.push('SpriteAnimator');
    if (actor.physicsBody) compNames.push('RigidBody2D');
    if (actor.characterMovement2D) compNames.push('CharacterMovement2D');
    if (actor.scripts && actor.scripts.length > 0) compNames.push(`Script×${actor.scripts.length}`);
    // Check the private _components map via getComponent or direct access
    if (actor._components && actor._components.size > 0) {
      for (const [key] of actor._components) {
        if (key !== 'SpriteRenderer') compNames.push(`RT:${key}`);
      }
    }
    if (actor._runtimeComponents && actor._runtimeComponents.size > 0) {
      for (const [key] of actor._runtimeComponents) compNames.push(`RT:${key}`);
    }
  } catch { /* defensive */ }
  return compNames;
}

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
//  NODE_PALETTE category → Profiler badge category mapper.
//  This is the PRIMARY path used when the 3rd arg is present
//  in __pTrack (i.e. all newly-compiled blueprints).
//  Maps long palette names like "Flow Control" to short badge
//  names like "Flow" that match the CSS classes.
// ─────────────────────────────────────────────────────────
const _paletteCatMap: Record<string, string> = {
  'Events':         'Event',
  'Flow Control':   'Flow',
  'Math':           'Math',
  'Values':         'Action',   // literal constants, no badge needed
  'Variables':      'Variable',
  'Physics':        'Physics',
  'Transform':      'Transform',
  'Utility':        'Action',    // mixed bag (PrintString, OpenScene, etc.)
  'Conversions':    'Action',
  'Components':     'Action',
  'Functions':      'Function',
  'Macros':         'Function',
  'Custom Events':  'Event',
  'Input':          'Input',
  'Structs':        'Action',
  'Enums':          'Action',
  'Collision':      'Physics',
  'Character':      'Movement',
  'Casting':        'Condition',
  'Animation':      'Animation',
  'String':         'Action',
  'Spawning':       'Scene',
  'Actor':          'Action',
  'Timer':          'Timer',
  'World':          'Scene',
  'Player':         'Camera',
  'Audio':          'Audio',
  'Gamepad':        'Input',
  'Save/Load':      'SaveGame',
  'UI':             'UI',
  // 2D categories
  'Animation 2D':   'Animation',
  'Movement 2D':    'Movement',
  'Physics 2D':     'Physics',
  'Camera 2D':      'Camera',
  'Tilemap':        'Scene',
  'Selection':      'Action',
  'Skeleton':       'Animation',
  'Timeline':       'Animation',
};

function _paletteCatToProfilerCat(paletteCat: string): string {
  return _paletteCatMap[paletteCat] ?? 'Action';
}

// ─────────────────────────────────────────────────────────
//  Node-label → category classifier (FALLBACK only).
//  Used when __pTrack is called without a 3rd arg (e.g.
//  blueprints compiled before the category injection update).
//  Uses a cache so each unique label is classified once.
// ─────────────────────────────────────────────────────────
const _nodeClassCache = new Map<string, string>();

function _classifyNode(label: string): string {
  const hit = _nodeClassCache.get(label);
  if (hit) return hit;
  const cat = _classifyNodeUncached(label);
  _nodeClassCache.set(label, cat);
  return cat;
}

function _classifyNodeUncached(label: string): string {
  // ── Events ──
  if (label.startsWith('Event '))                return 'Event';
  if (label.startsWith('On '))                   return 'Event';
  if (label === 'Anim Update')                   return 'Event';
  if (label === 'State Transition')              return 'Event';

  // ── Flow Control ──
  if (label === 'Branch')                        return 'Flow';
  if (label === 'Sequence')                      return 'Flow';
  if (label.startsWith('For Loop'))              return 'Flow';
  if (label.startsWith('For Each'))              return 'Flow';
  if (label === 'While Loop')                    return 'Flow';
  if (label === 'Delay')                         return 'Flow';
  if (label === 'Retriggerable Delay')           return 'Flow';
  if (label === 'Do Once')                       return 'Flow';
  if (label === 'Do N')                          return 'Flow';
  if (label === 'Flip Flop')                     return 'Flow';
  if (label === 'Gate')                          return 'Flow';
  if (label === 'Multi Gate')                    return 'Flow';
  if (label.startsWith('Switch '))               return 'Flow';

  // ── Function / Custom Event calls ──
  if (label.startsWith('Call '))                 return 'Function';
  if (label === 'Return Node')                   return 'Function';
  if (label.startsWith('Macro'))                 return 'Function';

  // ── Debug ──
  if (label === 'Print String')                  return 'Debug';

  // ── Movement / Character (specific before broad) ──
  if (label === 'Add Movement Input')            return 'Movement';
  if (label === 'Add Movement Input 2D')         return 'Movement';
  if (label === 'Jump' || label === 'Jump 2D')   return 'Movement';
  if (label === 'Stop Jumping' || label === 'Stop Jumping 2D') return 'Movement';
  if (label === 'Crouch')                        return 'Movement';
  if (label === 'UnCrouch')                      return 'Movement';
  if (label === 'Set Max Walk Speed')            return 'Movement';
  if (label === 'Set Max Walk Speed 2D')         return 'Movement';
  if (label === 'Launch Character')              return 'Movement';
  if (label === 'Set Movement Mode')             return 'Movement';
  if (label === 'Set Facing Direction')          return 'Movement';
  if (label === 'Flip Character')                return 'Movement';
  if (label.startsWith('Start Flying'))          return 'Movement';
  if (label.startsWith('Stop Flying'))           return 'Movement';
  if (label.startsWith('Start Swimming'))        return 'Movement';
  if (label.startsWith('Stop Swimming'))         return 'Movement';

  // ── Transform ──
  if (label.startsWith('Set Actor Position'))    return 'Transform';
  if (label.startsWith('Set Actor Rotation'))    return 'Transform';
  if (label.startsWith('Set Actor Scale'))       return 'Transform';
  if (label.startsWith('Add Actor World'))       return 'Transform';
  if (label.startsWith('Add Actor Local'))       return 'Transform';
  if (label === 'Teleport Actor')                return 'Transform';
  if (label.startsWith('Set Component Location'))return 'Transform';
  if (label.startsWith('Set Component Rotation'))return 'Transform';
  if (label.startsWith('Set Component Scale'))   return 'Transform';
  if (label.startsWith('Set Relative Location')) return 'Transform';
  if (label.startsWith('Set Relative Rotation')) return 'Transform';
  if (label.startsWith('Set Relative Scale'))    return 'Transform';

  // ── Physics ──
  if (label.startsWith('Add Force'))             return 'Physics';
  if (label.startsWith('Add Impulse'))           return 'Physics';
  if (label.startsWith('Add Torque'))            return 'Physics';
  if (label.startsWith('Set Velocity'))          return 'Physics';
  if (label.startsWith('Set Angular'))           return 'Physics';
  if (label === 'Set Mass')                      return 'Physics';
  if (label === 'Set Simulate Physics')          return 'Physics';
  if (label.startsWith('Set Gravity'))           return 'Physics';
  if (label.startsWith('Set Linear Damping'))    return 'Physics';
  if (label.startsWith('Set Angular Damping'))   return 'Physics';
  if (label.startsWith('Set Bounciness'))        return 'Physics';
  if (label.startsWith('Set Friction'))          return 'Physics';
  if (label.startsWith('Enable Physics'))        return 'Physics';
  if (label.startsWith('Line Trace'))            return 'Physics';
  if (label.startsWith('Sphere Trace'))          return 'Physics';
  if (label.startsWith('Box Trace'))             return 'Physics';
  if (label.startsWith('Overlap'))               return 'Physics';
  if (label.startsWith('Radial Force'))          return 'Physics';
  if (label.startsWith('Set Constraint'))        return 'Physics';
  if (label.startsWith('Apply Central'))         return 'Physics';
  if (label.startsWith('Set Collision'))         return 'Physics';
  if (label.startsWith('Set Body Type'))         return 'Physics';
  if (label.startsWith('Set Physics Material'))  return 'Physics';
  if (label.startsWith('Cast Ray'))              return 'Physics';

  // ── Audio ──
  if (label.startsWith('Play Sound'))            return 'Audio';
  if (label.startsWith('Stop Sound'))            return 'Audio';
  if (label.startsWith('Pause Sound'))           return 'Audio';
  if (label.startsWith('Resume Sound'))          return 'Audio';
  if (label.startsWith('Set Volume'))            return 'Audio';
  if (label.startsWith('Set Pitch'))             return 'Audio';
  if (label.startsWith('Set Bus Volume'))        return 'Audio';
  if (label.startsWith('Set Master Volume'))     return 'Audio';
  if (label.startsWith('Set Sound'))             return 'Audio';
  if (label.startsWith('Set Spatial'))           return 'Audio';

  // ── Timer ──
  if (label.startsWith('Set Timer'))             return 'Timer';
  if (label.startsWith('Clear Timer'))           return 'Timer';
  if (label.startsWith('Pause Timer'))           return 'Timer';
  if (label.startsWith('Unpause Timer'))         return 'Timer';
  if (label === 'Clear All Timers')              return 'Timer';

  // ── AI ──
  if (label.startsWith('AI '))                   return 'AI';

  // ── Animation / Sprite ──
  if (label.startsWith('Play Animation'))        return 'Animation';
  if (label.startsWith('Stop Animation'))        return 'Animation';
  if (label.startsWith('Set Animation'))         return 'Animation';
  if (label.startsWith('Set Anim '))             return 'Animation';
  if (label.startsWith('Set Sprite'))            return 'Animation';
  if (label.startsWith('Play Sprite'))           return 'Animation';
  if (label.startsWith('Set Flipbook'))          return 'Animation';
  if (label.startsWith('Set Frame'))             return 'Animation';

  // ── Camera / Viewport ──
  if (label.startsWith('Set Camera'))            return 'Camera';
  if (label.startsWith('Set Spring Arm'))        return 'Camera';
  if (label.startsWith('Set FOV'))               return 'Camera';
  if (label.startsWith('Add Controller'))        return 'Camera';
  if (label === 'Possess')                       return 'Camera';
  if (label === 'Unpossess')                     return 'Camera';
  if (label.startsWith('Set View Target'))       return 'Camera';
  if (label.startsWith('Camera Follow'))         return 'Camera';
  if (label.startsWith('Set Camera Zoom'))       return 'Camera';
  if (label.startsWith('Set Camera Bounds'))     return 'Camera';
  if (label.startsWith('Shake Camera'))          return 'Camera';
  if (label.startsWith('Set Viewport'))          return 'Camera';

  // ── UI / Widget ──
  if (label.startsWith('Create Widget'))         return 'UI';
  if (label.startsWith('Add to Viewport'))       return 'UI';
  if (label.startsWith('Remove from Viewport'))  return 'UI';
  if (label.startsWith('Set Widget'))            return 'UI';
  if (label.startsWith('Get Widget'))            return 'UI';
  if (label.startsWith('Remove Widget'))         return 'UI';
  if (label.startsWith('Add Child'))             return 'UI';
  if (label.startsWith('Remove Child'))          return 'UI';
  if (label.startsWith('Play Widget'))           return 'UI';
  if (label.startsWith('Stop Widget'))           return 'UI';
  if (label.startsWith('Set Text'))              return 'UI';
  if (label.startsWith('Set Image'))             return 'UI';
  if (label.startsWith('Set Visibility'))        return 'UI';
  if (label.startsWith('Set Opacity'))           return 'UI';
  if (label.startsWith('Set Color'))             return 'UI';
  if (label.startsWith('Set Progress'))          return 'UI';
  if (label.startsWith('Set Check'))             return 'UI';
  if (label.startsWith('Set Slider'))            return 'UI';
  if (label.startsWith('Set Dropdown'))          return 'UI';
  if (label.startsWith('Set Background'))        return 'UI';
  if (label.startsWith('Set Border'))            return 'UI';
  if (label.startsWith('Set Font'))              return 'UI';
  if (label.startsWith('Set Padding'))           return 'UI';
  if (label.startsWith('Set Margin'))            return 'UI';
  if (label.startsWith('Set Alignment'))         return 'UI';
  if (label.startsWith('Set Size'))              return 'UI';
  if (label.startsWith('Set Min '))              return 'UI';
  if (label.startsWith('Set Max W') && label.includes('idth'))  return 'UI';
  if (label.startsWith('Set Max H') && label.includes('eight')) return 'UI';
  if (label.startsWith('Widget'))                return 'UI';
  if (label.startsWith('Navigate'))              return 'UI';
  if (label.startsWith('Set Justification'))     return 'UI';
  if (label.startsWith('Set Brush'))             return 'UI';

  // ── Save / Load ──
  if (label.startsWith('Create Save'))           return 'SaveGame';
  if (label.startsWith('Save Game'))             return 'SaveGame';
  if (label.startsWith('Load Game'))             return 'SaveGame';
  if (label.startsWith('Delete Save'))           return 'SaveGame';
  if (label.startsWith('Does Save'))             return 'SaveGame';
  if (label.startsWith('Get Save'))              return 'SaveGame';

  // ── Scene / Level ──
  if (label === 'Open Level')                    return 'Scene';
  if (label === 'Destroy Actor')                 return 'Scene';
  if (label.startsWith('Spawn Actor'))           return 'Scene';
  if (label.startsWith('Spawn Emitter'))         return 'Scene';
  if (label === 'Quit Game')                     return 'Scene';
  if (label === 'Set Game Paused')               return 'Scene';
  if (label.startsWith('Get All Actors'))        return 'Scene';

  // ── Variable ──
  if (label === 'Set Variable')                  return 'Variable';
  if (label === 'Set Actor Variable')            return 'Variable';
  if (label.startsWith('Set Game Instance'))     return 'Variable';

  // ── Input Mapping ──
  if (label.includes('Action Mapping'))          return 'Input';
  if (label.includes('Axis Mapping'))            return 'Input';

  // ── Light ──
  if (label.startsWith('Set Light'))             return 'Light';
  if (label.startsWith('Set Point Light'))       return 'Light';
  if (label.startsWith('Set Spot Light'))        return 'Light';
  if (label.startsWith('Set Directional'))       return 'Light';

  // ── Cast / Condition ──
  if (label.startsWith('Cast To'))               return 'Condition';
  if (label === 'Is Valid')                      return 'Condition';

  // ── Tile / 2D Scene ──
  if (label.startsWith('Set Tile'))              return 'Scene';
  if (label.startsWith('Place Tile'))            return 'Scene';
  if (label.startsWith('Remove Tile'))           return 'Scene';
  if (label.startsWith('Set Tilemap'))           return 'Scene';
  if (label.startsWith('Set Sorting'))           return 'Scene';

  // ── Default ──
  return 'Action';
}

// ─────────────────────────────────────────────────────────
//  Helper: wrap a method, record as a node execution
// ─────────────────────────────────────────────────────────
function _rec(
  store: ProfilerStore, id: string, label: string, type: string,
  dur: number, inputs: Record<string, any> = {}, outputs: Record<string, any> = {},
) {
  store.recordNodeExec(
    `${_currentActorId}_${id}`, label, type,
    _currentActorId, _currentActorName, _currentGraphName,
    dur, 'Blueprint', inputs, outputs,
  );
}

/** Build a method-intercepting proxy. `methodMap` maps prop names to [label, type]. */
function _methodProxy(
  store: ProfilerStore, target: any,
  methodMap: Record<string, [string, string]>,
  extraGet?: (target: any, prop: string | symbol, val: any) => any,
): any {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const val = Reflect.get(t, prop, receiver);
      const key = String(prop);
      const entry = methodMap[key];
      if (entry && typeof val === 'function') {
        const [label, type] = entry;
        return function profilerMethodProxy(...args: any[]) {
          if (!store.isRecording) return val.apply(t, args);
          const t0 = performance.now();
          const result = val.apply(t, args);
          const dur = performance.now() - t0;
          _rec(store, key, label, type, dur);
          return result;
        };
      }
      if (extraGet) {
        const r = extraGet(t, prop, val);
        if (r !== undefined) return r;
      }
      return typeof val === 'function' ? val.bind(t) : val;
    },
    set(t, prop, value, receiver) {
      // Handle property setters like __engine.isPaused = true
      const key = String(prop);
      const entry = methodMap[`set_${key}`];
      if (entry && store.isRecording) {
        _rec(store, `set_${key}`, entry[0], entry[1], 0.01, { value });
      }
      return Reflect.set(t, prop, value, receiver);
    },
  });
}

/** Install profiling proxies on the scene object */
function _proxyScene(store: ProfilerStore, scene: any): any {
  if (!scene || scene.__profilerProxied) return scene;

  const proxy = new Proxy(scene, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);

      if (prop === 'spawnActorFromClass' && typeof val === 'function') {
        return function profilerSpawnProxy(...args: any[]) {
          if (!store.isRecording) return val.apply(target, args);
          const t0 = performance.now();
          const result = val.apply(target, args);
          const dur = performance.now() - t0;
          const className = args[1] || 'Unknown';
          _rec(store, `SpawnActorFromClass_${className}`, `Spawn Actor: ${className}`, 'Action', dur,
            { classId: args[0], className: args[1] }, { spawned: result?.name });
          return result;
        };
      }

      if (prop === 'destroyActor' && typeof val === 'function') {
        return function profilerDestroyProxy(...args: any[]) {
          if (!store.isRecording) return val.apply(target, args);
          const destroyed = args[0];
          const t0 = performance.now();
          const result = val.apply(target, args);
          const dur = performance.now() - t0;
          _rec(store, 'DestroyActor', 'Destroy Actor', 'Action', dur, { target: destroyed?.name });
          return result;
        };
      }

      if (prop === 'findById' && typeof val === 'function') {
        return function profilerFindByIdProxy(...args: any[]) {
          if (!store.isRecording) return val.apply(target, args);
          const t0 = performance.now();
          const result = val.apply(target, args);
          const dur = performance.now() - t0;
          _rec(store, 'FindById', 'Find Actor By ID', 'Query', dur, { id: args[0] }, { found: result?.name });
          return result;
        };
      }

      // Intercept gameObjects array queries (find/filter) - these are called
      // inline so we can't easily wrap them, but the array access is fine.
      return val;
    }
  });
  proxy.__profilerProxied = true;
  return proxy;
}

/** Install profiling proxies on the engine object */
function _proxyEngine(store: ProfilerStore, engine: any): any {
  if (!engine || engine.__profilerProxied) return engine;

  // ── Audio sub-proxy ──
  const audioMethods: Record<string, [string, string]> = {
    playSoundCue2D:       ['Play Sound 2D', 'Audio'],
    playSound2D:          ['Play Sound 2D', 'Audio'],
    playSoundCueAtLocation: ['Play Sound At Location', 'Audio'],
    stopSource:           ['Stop Sound', 'Audio'],
    stopAll:              ['Stop All Sounds', 'Audio'],
    pauseSource:          ['Pause Sound', 'Audio'],
    resumeSource:         ['Resume Sound', 'Audio'],
    setSourceVolume:      ['Set Sound Volume', 'Audio'],
    setSourcePitch:       ['Set Sound Pitch', 'Audio'],
    setBusVolume:         ['Set Bus Volume', 'Audio'],
    pauseAll:             ['Pause All Sounds', 'Audio'],
    resumeAll:            ['Resume All Sounds', 'Audio'],
    isPlaying:            ['Is Sound Playing', 'Audio'],
    set_masterVolume:     ['Set Master Volume', 'Audio'],
  };

  // ── Timer sub-proxy ──
  const timerMethods: Record<string, [string, string]> = {
    setTimer:               ['Set Timer', 'Timer'],
    clearTimer:             ['Clear Timer', 'Timer'],
    pauseTimer:             ['Pause Timer', 'Timer'],
    unpauseTimer:           ['Unpause Timer', 'Timer'],
    isTimerActive:          ['Is Timer Active', 'Timer'],
    isTimerPaused:          ['Is Timer Paused', 'Timer'],
    getTimerRemainingTime:  ['Get Timer Remaining Time', 'Timer'],
    getTimerElapsedTime:    ['Get Timer Elapsed Time', 'Timer'],
    clearAllTimers:         ['Clear All Timers', 'Timer'],
  };

  // ── Timer (anim2d style: engine.timers) ──
  const timerAltMethods: Record<string, [string, string]> = {
    isActive:           ['Is Timer Active', 'Timer'],
    isPaused:           ['Is Timer Paused', 'Timer'],
    getRemainingTime:   ['Get Timer Remaining Time', 'Timer'],
    clearAllTimers:     ['Clear All Timers', 'Timer'],
  };

  // ── SaveLoad sub-proxy ──
  const saveLoadMethods: Record<string, [string, string]> = {
    doesSaveGameExist:    ['Does Save Game Exist', 'SaveGame'],
    getAllSaveSlotInfos:  ['Get All Save Slots', 'SaveGame'],
    getSaveSlotCount:     ['Get Save Slot Count', 'SaveGame'],
    createSaveGameObject: ['Create Save Game Object', 'SaveGame'],
    saveGameToSlot:       ['Save Game to Slot', 'SaveGame'],
    loadGameFromSlot:     ['Load Game from Slot', 'SaveGame'],
    getFullSaveData:      ['Load Game from Slot', 'SaveGame'],
    deleteSaveGameInSlot: ['Delete Game in Slot', 'SaveGame'],
  };

  // ── SceneManager sub-proxy ──
  const sceneManagerMethods: Record<string, [string, string]> = {
    loadScene: ['Open Level', 'Action'],
  };

  // ── ParticleManager sub-proxy ──
  const particleMethods: Record<string, [string, string]> = {
    spawnEmitterAtLocation: ['Spawn Emitter At Location', 'Particle'],
  };

  // ── Anim2D sub-proxy ──
  const anim2dMethods: Record<string, [string, string]> = {
    getCurrentState:  ['Get Anim State 2D', 'Animation'],
    getVariable:      ['Get Anim Variable 2D', 'Animation'],
    transitionState:  ['State Transition 2D', 'Animation'],
  };

  // ── Scene2DManager sub-proxy (with camera2D nesting) ──
  const scene2DMethods: Record<string, [string, string]> = {
    spawnActorFromClassId:  ['Spawn Actor 2D', 'Action'],
    despawnSpriteActor2D:   ['Destroy Actor 2D', 'Action'],
  };

  const camera2DMethods: Record<string, [string, string]> = {
    setZoom:           ['Set Camera Zoom 2D', 'Camera'],
    shake:             ['Camera Shake 2D', 'Camera'],
    setPixelsPerUnit:  ['Set Camera Pixels Per Unit 2D', 'Camera'],
    screenToWorld:     ['Screen To World 2D', 'Camera'],
    worldToScreen:     ['World To Screen 2D', 'Camera'],
    set_followTarget:  ['Set Camera Follow Target 2D', 'Camera'],
    set_bounds:        ['Set Camera Bounds 2D', 'Camera'],
    set_deadZone:      ['Set Camera Dead Zone 2D', 'Camera'],
  };

  const physics2DMethods: Record<string, [string, string]> = {
    lineTrace: ['Line Trace 2D', 'Physics'],
  };

  // ── Input sub-proxy (actions — skip per-frame polls, track mutations) ──
  const inputActionMethods: Record<string, [string, string]> = {
    addAction:    ['Add Action Mapping Key', 'Input'],
    removeAction: ['Clear Action Mapping', 'Input'],
    addAxis:      ['Add Axis Mapping Key', 'Input'],
    removeAxis:   ['Clear Axis Mapping', 'Input'],
  };

  const proxy = new Proxy(engine, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);

      // ── eventBus ──
      if (prop === 'eventBus' && val) {
        return new Proxy(val, {
          get(ebT: any, ebP: any) {
            const ebV = Reflect.get(ebT, ebP);
            if (ebP === 'emit' && typeof ebV === 'function') {
              return function profilerEmitProxy(event: string, ...args: any[]) {
                if (!store.isRecording) return ebV.apply(ebT, [event, ...args]);
                const t0 = performance.now();
                const result = ebV.apply(ebT, [event, ...args]);
                const dur = performance.now() - t0;
                _rec(store, `EmitEvent_${event}`, `Emit Event: ${event}`, 'Event', dur, { event });
                return result;
              };
            }
            if (ebP === 'on' && typeof ebV === 'function') {
              return function profilerOnProxy(event: string, ...args: any[]) {
                if (store.isRecording) {
                  _rec(store, `ListenEvent_${event}`, `Listen: ${event}`, 'Event', 0, { event });
                  store.logEvent({ type: 'Custom',
                    detail: `EventBus.on("${event}") — registered listener`,
                    sourceActorId: _currentActorId > 0 ? _currentActorId : null,
                    sourceActorName: _currentActorName || '',
                    targetActorId: null, targetActorName: '',
                    payload: { event }, triggeredNodeCount: 0 });
                }
                return ebV.apply(ebT, [event, ...args]);
              };
            }
            if (ebP === 'off' && typeof ebV === 'function') {
              return function profilerOffProxy(event: string, ...args: any[]) {
                if (store.isRecording) {
                  _rec(store, `UnlistenEvent_${event}`, `Unlisten: ${event}`, 'Event', 0, { event });
                  store.logEvent({ type: 'Custom',
                    detail: `EventBus.off("${event}") — removed listener`,
                    sourceActorId: _currentActorId > 0 ? _currentActorId : null,
                    sourceActorName: _currentActorName || '',
                    targetActorId: null, targetActorName: '',
                    payload: { event }, triggeredNodeCount: 0 });
                }
                return ebV.apply(ebT, [event, ...args]);
              };
            }
            return typeof ebV === 'function' ? ebV.bind(ebT) : ebV;
          }
        });
      }

      // ── audio ──
      if (prop === 'audio' && val) return _methodProxy(store, val, audioMethods);

      // ── timerManager ──
      if (prop === 'timerManager' && val) return _methodProxy(store, val, timerMethods);

      // ── timers (anim2d alt path) ──
      if (prop === 'timers' && val) return _methodProxy(store, val, timerAltMethods);

      // ── saveLoad ──
      if (prop === 'saveLoad' && val) return _methodProxy(store, val, saveLoadMethods);

      // ── sceneManager ──
      if (prop === 'sceneManager' && val) return _methodProxy(store, val, sceneManagerMethods);

      // ── particleManager ──
      if (prop === 'particleManager' && val) return _methodProxy(store, val, particleMethods);

      // ── anim2d ──
      if (prop === 'anim2d' && val) return _methodProxy(store, val, anim2dMethods);

      // ── input (only track mutations, not per-frame polls) ──
      if (prop === 'input' && val) return _methodProxy(store, val, inputActionMethods);

      // ── scene2DManager ── (nested camera2D and physics2D)
      if (prop === 'scene2DManager' && val) {
        return _methodProxy(store, val, scene2DMethods, (s2T, s2P, s2V) => {
          if (s2P === 'camera2D' && s2V) return _methodProxy(store, s2V, camera2DMethods);
          if (s2P === 'physics2D' && s2V) return _methodProxy(store, s2V, physics2DMethods);
          return undefined;
        });
      }

      // ── physics (engine.physics.*) — the engine-level physics API ──
      if (prop === 'physics' && val) {
        // Already handled via _proxyPhysics, but engine.physics is also
        // accessed directly from generated code, so proxy it here too.
        return _proxyPhysicsEngine(store, val);
      }

      // ── Direct engine methods ──
      if (prop === 'spawnActor' && typeof val === 'function') {
        return function profilerEngineSpawn(...args: any[]) {
          if (!store.isRecording) return val.apply(target, args);
          const t0 = performance.now();
          const result = val.apply(target, args);
          const dur = performance.now() - t0;
          _rec(store, 'SpawnActor', `Spawn Actor: ${args[1] || 'Unknown'}`, 'Action', dur,
            { classId: args[0], className: args[1] }, { spawned: result?.name });
          return result;
        };
      }

      if (prop === 'quit' && typeof val === 'function') {
        return function profilerQuit(...args: any[]) {
          if (store.isRecording) _rec(store, 'QuitGame', 'Quit Game', 'Action', 0.01);
          return val.apply(target, args);
        };
      }

      if (prop === 'drawDebugLine' && typeof val === 'function') {
        return function profilerDebugLine(...args: any[]) {
          // Debug drawing — passthrough, don't log (happens every frame for traces)
          return val.apply(target, args);
        };
      }
      if (prop === 'drawDebugPoint' && typeof val === 'function') {
        return function profilerDebugPoint(...args: any[]) {
          return val.apply(target, args);
        };
      }

      return typeof val === 'function' ? val.bind(target) : val;
    },
    set(t, prop, value, receiver) {
      if (prop === 'isPaused' && store.isRecording) {
        _rec(store, 'SetGamePaused', value ? 'Pause Game' : 'Unpause Game', 'Action', 0.01, { paused: value });
      }
      return Reflect.set(t, prop, value, receiver);
    },
  });
  proxy.__profilerProxied = true;
  return proxy;
}

/** Wrap the print function to detect PrintString nodes */
function _proxyPrint(store: ProfilerStore, origPrint: (v: any) => void): (v: any) => void {
  return function profilerPrintProxy(v: any) {
    if (store.isRecording) {
      _rec(store, 'PrintString', 'Print String', 'Debug', 0.01,
        { value: typeof v === 'string' ? v.slice(0, 100) : String(v).slice(0, 100) });
    }
    origPrint(v);
  };
}

/** Wrap __uiManager — all widget/UI methods */
function _proxyUiManager(store: ProfilerStore, uiManager: any): any {
  if (!uiManager) return uiManager;

  const uiMethods: Record<string, [string, string]> = {
    createWidget:            ['Create Widget', 'UI'],
    addToViewport:           ['Add to Viewport', 'UI'],
    removeFromViewport:      ['Remove from Viewport', 'UI'],
    setText:                 ['Set Widget Text', 'UI'],
    getText:                 ['Get Widget Text', 'UI'],
    setVisibility:           ['Set Widget Visibility', 'UI'],
    isVisible:               ['Is Widget Visible', 'UI'],
    setColor:                ['Set Widget Color', 'UI'],
    setOpacity:              ['Set Widget Opacity', 'UI'],
    setProgressBarPercent:   ['Set Progress Bar Percent', 'UI'],
    getProgressBarPercent:   ['Get Progress Bar Percent', 'UI'],
    setSliderValue:          ['Set Slider Value', 'UI'],
    getSliderValue:          ['Get Slider Value', 'UI'],
    setCheckBoxState:        ['Set CheckBox State', 'UI'],
    getCheckBoxState:        ['Get CheckBox State', 'UI'],
    playAnimation:           ['Play Widget Animation', 'UI'],
    setInputMode:            ['Set Input Mode', 'UI'],
    showMouseCursor:         ['Show Mouse Cursor', 'UI'],
    setWidgetVariable:       ['Set Widget Variable', 'UI'],
    getWidgetVariable:       ['Get Widget Variable', 'UI'],
    callWidgetFunction:      ['Call Widget Function', 'UI'],
    callWidgetEvent:         ['Call Widget Event', 'UI'],
    registerEventHandler:    ['Register Widget Event', 'UI'],
  };

  return _methodProxy(store, uiManager, uiMethods);
}

/** Wrap __gameInstance — get/set variable */
function _proxyGameInstance(store: ProfilerStore, gameInstance: any): any {
  if (!gameInstance) return gameInstance;

  const giMethods: Record<string, [string, string]> = {
    getVariable:    ['Get Game Instance Variable', 'Variable'],
    setVariable:    ['Set Game Instance Variable', 'Variable'],
    triggerEvent:   ['Call Game Instance Event', 'Event'],
  };

  return _methodProxy(store, gameInstance, giMethods);
}

/** Wrap ctx.physics — collision subsystem */
function _proxyPhysics(store: ProfilerStore, physics: any): any {
  if (!physics || physics.__profilerProxied) return physics;

  const collisionMethods: Record<string, [string, string]> = {
    lineTrace:          ['Line Trace', 'Physics'],
    lineTraceByChannel: ['Line Trace', 'Physics'],
    sphereTrace:        ['Sphere Trace', 'Physics'],
    sphereOverlap:      ['Sphere Overlap', 'Physics'],
    getOverlappingCount:['Get Overlap Count', 'Physics'],
    isOverlapping:      ['Is Overlapping', 'Physics'],
    resizeSensor:       ['Set Trigger Size', 'Physics'],
    teleportBody:       ['Teleport Actor', 'Physics'],
    setBodyEnabled:     ['Set Collision Enabled', 'Physics'],
    registerCallbacks:  ['Register Collision Callbacks', 'Physics'],
  };

  const proxy = _methodProxy(store, physics, {
    addPhysicsBody:    ['Set Simulate Physics', 'Physics'],
    removePhysicsBody: ['Set Simulate Physics Off', 'Physics'],
  }, (t, prop, val) => {
    if (prop === 'collision' && val) return _methodProxy(store, val, collisionMethods);
    if (prop === 'world' && val) return val; // world.gravity read — passthrough
    return undefined;
  });
  proxy.__profilerProxied = true;
  return proxy;
}

/** Wrap engine.physics — the engine-level physics API (traces, forces, gravity) */
function _proxyPhysicsEngine(store: ProfilerStore, physics: any): any {
  if (!physics) return physics;
  // If already the ctx.physics proxy, return as-is
  if (physics.__profilerProxied) return physics;

  const enginePhysMethods: Record<string, [string, string]> = {
    lineTraceSingle:    ['Line Trace Single', 'Physics'],
    sphereTraceSingle:  ['Sphere Trace Single', 'Physics'],
    boxTraceSingle:     ['Box Trace', 'Physics'],
    lineTraceMulti:     ['Line Trace Multi', 'Physics'],
    overlapSphere:      ['Overlap Sphere', 'Physics'],
    overlapBox:         ['Overlap Box', 'Physics'],
    addRadialForce:     ['Add Radial Force', 'Physics'],
    addRadialImpulse:   ['Add Radial Impulse', 'Physics'],
    setGravity:         ['Set World Gravity', 'Physics'],
    sphereTrace:        ['Sphere Trace', 'Physics'],
    pointIsInside:      ['Point Is Inside', 'Physics'],
    addPhysicsBody:     ['Set Simulate Physics', 'Physics'],
    removePhysicsBody:  ['Set Simulate Physics Off', 'Physics'],
  };

  const collisionMethods: Record<string, [string, string]> = {
    lineTrace:          ['Line Trace', 'Physics'],
    lineTraceByChannel: ['Line Trace', 'Physics'],
    sphereTrace:        ['Sphere Trace', 'Physics'],
    sphereOverlap:      ['Sphere Overlap', 'Physics'],
    getOverlappingCount:['Get Overlap Count', 'Physics'],
    isOverlapping:      ['Is Overlapping', 'Physics'],
    resizeSensor:       ['Set Trigger Size', 'Physics'],
    teleportBody:       ['Teleport Actor', 'Physics'],
    setBodyEnabled:     ['Set Collision Enabled', 'Physics'],
    registerCallbacks:  ['Register Collision Callbacks', 'Physics'],
  };

  return _methodProxy(store, physics, enginePhysMethods, (t, prop, val) => {
    if (prop === 'collision' && val) return _methodProxy(store, val, collisionMethods);
    return undefined;
  });
}

// ═══════════════════════════════════════════════════════════
//  Install / Uninstall
// ═══════════════════════════════════════════════════════════

export function installProfilerHooks(engine: Engine): void {
  if (_installed) return;
  _installed = true;
  _engine = engine;
  _loggedFirstFrame = false;

  const store = ProfilerStore.getInstance();
  const scene = engine.scene;
  const eventBus = EventBus.getInstance();

  console.log('[Profiler] Installing hooks…');
  console.log('[Profiler]   scene.gameObjects:', scene?.gameObjects?.length);

  // ─────────────────────────────────────────────────────
  //  HOOK 1: Wrap Engine._getCtx to return instrumented
  //  context with runtime API proxies
  // ─────────────────────────────────────────────────────
  _origGetCtx = (engine as any)._getCtx.bind(engine);
  _origPrint = engine.onPrint;

  const proxiedScene = _proxyScene(store, scene);
  const proxiedEngine = _proxyEngine(store, engine);
  const proxiedPhysics = _proxyPhysics(store, engine.physics);
  const proxiedPrint = _proxyPrint(store, engine.onPrint);
  const proxiedUiManager = _proxyUiManager(store, engine.uiManager);
  const proxiedGameInstance = _proxyGameInstance(store, engine.gameInstance);

  // The __pTrack callback is injected into the ScriptContext so generated
  // code can call `__pTrack && __pTrack(label, nodeId, category)` for every
  // action node.  The 3rd arg carries the NODE_PALETTE category baked at
  // codegen time, so new nodes are automatically categorised.  If the arg
  // is missing (legacy code), we fall back to the label-based classifier.
  // When not recording, ctx.__pTrack stays null so the && short-circuits.
  const pTrackFn = (label: string, nodeId: string, category?: string) => {
    const cat = category ? _paletteCatToProfilerCat(category) : _classifyNode(label);
    _rec(store, `node_${nodeId}`, label, cat, 0);
  };

  (engine as any)._getCtx = function profilerGetCtx(
    go: any, dt: number, elapsed: number,
  ) {
    const ctx = _origGetCtx!(go, dt, elapsed);
    if (!store.isRecording) {
      ctx.__pTrack = null;
      return ctx;
    }

    // Set current actor context for node exec attribution
    _currentActorId = go?.id ?? -1;
    _currentActorName = go?.name ?? '';
    _currentGraphName = go?.actorAssetId || go?.name || '';

    // Return instrumented context — blueprint code reads these
    // into its closure vars (__scene, __engine, __physics, print, __uiManager, __gameInstance)
    ctx.scene = proxiedScene;
    ctx.engine = proxiedEngine;
    ctx.physics = proxiedPhysics;
    ctx.print = proxiedPrint;
    ctx.__pTrack = pTrackFn;
    if (ctx.uiManager) ctx.uiManager = proxiedUiManager;
    if (ctx.gameInstance) ctx.gameInstance = proxiedGameInstance;

    return ctx;
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 2: Wrap ScriptComponent.prototype.tick to
  //  measure per-actor script execution + record as
  //  EventTick node
  // ─────────────────────────────────────────────────────
  _origScriptTick = ScriptComponent.prototype.tick;

  ScriptComponent.prototype.tick = function profilerTick(ctx: any) {
    if (!store.isRecording || !(this as any)._tickFn) {
      _origScriptTick!.call(this, ctx);
      return;
    }

    const go = ctx?.gameObject;
    const actorId = go?.id ?? -1;
    const actorName = go?.name ?? '';
    const graphName = go?.actorAssetId || go?.name || '';

    // Set attribution context
    _currentActorId = actorId;
    _currentActorName = actorName;
    _currentGraphName = graphName;

    const t0 = performance.now();
    _origScriptTick!.call(this, ctx);
    const dur = performance.now() - t0;

    store.recordActorTick(actorId, dur);
    store.recordNodeExec(
      `${actorId}_EventTick`,
      'Event Tick',
      'Event',
      actorId,
      actorName,
      graphName,
      dur,
      'Engine.update',
      { deltaTime: ctx?.deltaTime },
      {},
    );
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 3: Wrap ScriptComponent.prototype.beginPlay
  //  to record EventBeginPlay node executions
  // ─────────────────────────────────────────────────────
  _origScriptBeginPlay = ScriptComponent.prototype.beginPlay;

  ScriptComponent.prototype.beginPlay = function profilerBeginPlay(ctx: any) {
    // Must respect same early-out as original (e.g. _hasStarted check)
    // so we always delegate to original, only add recording around it
    if (!store.isRecording || !(this as any)._beginPlayFn || (this as any)._hasStarted) {
      _origScriptBeginPlay!.call(this, ctx);
      return;
    }

    const go = ctx?.gameObject;
    const actorId = go?.id ?? -1;
    const actorName = go?.name ?? '';
    const graphName = go?.actorAssetId || go?.name || '';

    _currentActorId = actorId;
    _currentActorName = actorName;
    _currentGraphName = graphName;

    const t0 = performance.now();
    _origScriptBeginPlay!.call(this, ctx);
    const dur = performance.now() - t0;

    store.recordNodeExec(
      `${actorId}_EventBeginPlay`,
      'Event BeginPlay',
      'Event',
      actorId,
      actorName,
      graphName,
      dur,
      'Engine.onPlayStarted',
      {},
      {},
    );

    // Also log as a timeline event
    store.logEvent({
      type: 'Custom',
      sourceActorId: actorId > 0 ? actorId : null,
      sourceActorName: actorName,
      targetActorId: null, targetActorName: '',
      detail: `BeginPlay — "${actorName}" (${graphName}) — ${dur.toFixed(2)}ms`,
      payload: { graphName, durationMs: dur },
      triggeredNodeCount: 0,
    });
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 4: Wrap ScriptComponent.prototype.onDestroy
  // ─────────────────────────────────────────────────────
  _origScriptOnDestroy = ScriptComponent.prototype.onDestroy;

  ScriptComponent.prototype.onDestroy = function profilerOnDestroy(ctx: any) {
    if (!store.isRecording) {
      _origScriptOnDestroy!.call(this, ctx);
      return;
    }

    const go = ctx?.gameObject;
    const actorId = go?.id ?? -1;
    const actorName = go?.name ?? '';
    const graphName = go?.actorAssetId || go?.name || '';

    _currentActorId = actorId;
    _currentActorName = actorName;
    _currentGraphName = graphName;

    const t0 = performance.now();
    _origScriptOnDestroy!.call(this, ctx);
    const dur = performance.now() - t0;

    store.recordNodeExec(
      `${actorId}_EventOnDestroy`,
      'Event OnDestroy',
      'Event',
      actorId,
      actorName,
      graphName,
      dur,
      'Engine.onPlayStopped',
      {},
      {},
    );

    // Also log as a timeline event
    store.logEvent({
      type: 'Destroy',
      sourceActorId: actorId > 0 ? actorId : null,
      sourceActorName: actorName,
      targetActorId: null, targetActorName: '',
      detail: `OnDestroy — "${actorName}" (${graphName}) — ${dur.toFixed(2)}ms`,
      payload: { graphName, durationMs: dur },
      triggeredNodeCount: 0,
    });
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 5: Engine.update() — per-frame actor tracking
  // ─────────────────────────────────────────────────────
  _origUpdate = engine.update.bind(engine);
  const origUpdateRef = _origUpdate;

  engine.update = function profilerWrappedUpdate() {
    if (!store.isRecording) {
      // When recording stops, reset first-frame flag so next recording
      // session re-discovers all actors fresh.
      _loggedFirstFrame = false;
      origUpdateRef();
      return;
    }

    const scene = engine.scene;
    const gameObjects = scene?.gameObjects;
    if (!gameObjects) { origUpdateRef(); return; }

    // On the first recording frame, clear _prevActorIds so *all* actors
    // are detected as "new" — this ensures Classes & Components tab populates
    // even when recording starts mid-play (actors already existed).
    if (!_loggedFirstFrame) {
      _loggedFirstFrame = true;
      _prevActorIds.clear();
      _prev2DActorIds.clear();
      const count2D = engine.scene2DManager?.spriteActors?.length ?? 0;
      console.log(`[Profiler] First recording frame — ${gameObjects.length} 3D actors, ${count2D} 2D actors`);

      // Log a "Recording Started" event
      store.logEvent({
        type: 'Custom',
        sourceActorId: null, sourceActorName: '',
        targetActorId: null, targetActorName: '',
        detail: `Recording started — ${gameObjects.length} 3D actors + ${count2D} 2D actors in scene`,
        payload: { actorCount: gameObjects.length, actorCount2D: count2D },
        triggeredNodeCount: 0,
      });
    }

    const frameStart = performance.now();

    // Track actors — wrapped in try/catch so a single bad actor
    // doesn't break tracking for everyone else
    const currentIds = new Set<number>();
    for (const go of gameObjects) {
      try {
        if (!go || go.isDestroyed) continue;
        currentIds.add(go.id);

        const compNames = _gatherComponents(go);
        const isNew = !_prevActorIds.has(go.id);
        const className = go.actorAssetId
          ? (go.actorType || go.name)
          : (go.actorType || 'actor');

        // Safe position — some actors may not have a mesh (e.g. 2D)
        let pos = { x: 0, y: 0, z: 0 };
        try {
          if (go.mesh?.position) {
            pos = { x: go.mesh.position.x, y: go.mesh.position.y, z: go.mesh.position.z };
          }
        } catch { /* defensive */ }

        store.trackActor(
          go.id, go.name, className,
          go.actorAssetId ?? null, compNames,
          go.tags || [],
          pos,
          go.__tickEnabled, isNew,
        );

        if (isNew) {
          // Record the actor's class
          const classId = go.actorAssetId || go.actorType || go.name;
          store.recordClassInstantiation(className, classId, go.id, 'Scene');

          // Also record each unique component type as a class entry
          for (const cName of compNames) {
            store.recordClassInstantiation(
              cName, `component_${cName}`, go.id, `Component:${className}`,
            );
          }

          // Log an event for actor discovery so the Event Log isn't empty
          store.logEvent({
            type: 'Spawn',
            sourceActorId: go.id,
            sourceActorName: go.name,
            targetActorId: null, targetActorName: '',
            detail: `Discovered "${go.name}" (${className})${compNames.length > 0 ? ` — ${compNames.length} components` : ''}`,
            payload: { className, actorId: go.id, components: compNames },
            triggeredNodeCount: 0,
          });
        }
      } catch (e) {
        // Don't let one bad actor break the entire tracking loop
        if (!(_silentActorErrors > 20)) {
          console.warn('[Profiler] Error tracking actor:', go?.name, e);
          _silentActorErrors++;
        }
      }
    }

    for (const prevId of _prevActorIds) {
      if (!currentIds.has(prevId)) store.onActorDestroyed(prevId);
    }
    _prevActorIds = currentIds;

    // ── 2D Actors — scan Scene2DManager.spriteActors ──
    const s2d = engine.scene2DManager;
    const spriteActors: any[] | undefined = s2d?.spriteActors;
    if (spriteActors && spriteActors.length > 0) {
      const current2DIds = new Set<number>();
      for (const actor of spriteActors) {
        try {
          if (!actor) continue;
          const aid = actor.id as number;
          if (aid == null || aid < 0) continue;
          current2DIds.add(aid);

          const compNames = _gatherComponents2D(actor);
          const isNew = !_prev2DActorIds.has(aid);
          const className = actor.actorType || actor.name || 'SpriteActor';

          // Get position from transform2D (preferred) or group
          let pos = { x: 0, y: 0, z: 0 };
          try {
            if (actor.transform2D?.position) {
              pos = { x: actor.transform2D.position.x, y: actor.transform2D.position.y, z: 0 };
            } else if (actor.group?.position) {
              pos = { x: actor.group.position.x, y: actor.group.position.y, z: actor.group.position.z };
            }
          } catch { /* defensive */ }

          store.trackActor(
            aid, actor.name, className,
            actor.blueprintId ?? null, compNames,
            actor.tags || [],
            pos,
            true, // 2D actors always tick if they have scripts
            isNew,
          );

          if (isNew) {
            const classId = actor.blueprintId || actor.actorType || actor.name;
            store.recordClassInstantiation(className, classId, aid, 'Scene2D');

            for (const cName of compNames) {
              store.recordClassInstantiation(
                cName, `component_${cName}`, aid, `Component2D:${className}`,
              );
            }

            store.logEvent({
              type: 'Spawn',
              sourceActorId: aid,
              sourceActorName: actor.name,
              targetActorId: null, targetActorName: '',
              detail: `Discovered 2D "${actor.name}" (${className})${compNames.length > 0 ? ` — ${compNames.length} components` : ''}`,
              payload: { className, actorId: aid, components: compNames, is2D: true },
              triggeredNodeCount: 0,
            });
          }
        } catch (e) {
          if (!(_silentActorErrors > 20)) {
            console.warn('[Profiler] Error tracking 2D actor:', (actor as any)?.name, e);
            _silentActorErrors++;
          }
        }
      }

      for (const prevId of _prev2DActorIds) {
        if (!current2DIds.has(prevId)) store.onActorDestroyed(prevId);
      }
      _prev2DActorIds = current2DIds;
    } else if (_prev2DActorIds.size > 0) {
      // All 2D actors gone
      for (const prevId of _prev2DActorIds) store.onActorDestroyed(prevId);
      _prev2DActorIds = new Set();
    }

    // Run the real update
    origUpdateRef();

    const frameEnd = performance.now();
    const dt = (frameEnd - frameStart) / 1000;
    const totalActorCount = gameObjects.length + (spriteActors?.length ?? 0);
    store.onFrame(dt > 0 ? dt : 0.016, totalActorCount);
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 6: Scene.destroyActor()
  // ─────────────────────────────────────────────────────
  _origDestroyActor = scene.destroyActor.bind(scene);
  const origDestroyRef = _origDestroyActor;

  scene.destroyActor = function profilerDestroyActor(go: GameObject) {
    if (store.isRecording && go) {
      store.onActorDestroyed(go.id);
      _prevActorIds.delete(go.id);
    }
    origDestroyRef(go);
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 7: Scene.spawnActorFromClass()
  // ─────────────────────────────────────────────────────
  _origSpawnActorFromClass = scene.spawnActorFromClass.bind(scene);
  const origSpawnRef = _origSpawnActorFromClass;

  scene.spawnActorFromClass = function profilerSpawn(
    classId: string, className: string,
    position: any, rotation: any, scale: any,
    owner: any, overrides: any,
  ): GameObject | null {
    const result = origSpawnRef(classId, className, position, rotation, scale, owner, overrides);
    if (result && store.isRecording) {
      store.onActorSpawned(
        result.id, result.name, className, classId,
        _gatherComponents(result), position,
      );
      _prevActorIds.add(result.id);
      store.recordClassInstantiation(className, classId, result.id, 'SpawnActorFromClass');
    }
    return result;
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 8: EventBus.emit()
  // ─────────────────────────────────────────────────────
  _origEventBusEmit = eventBus.emit.bind(eventBus);
  const origEmitRef = _origEventBusEmit;

  eventBus.emit = function profilerEmit(event: string, ...args: any[]) {
    if (store.isRecording) {
      let type = 'Custom';
      const ev = event.toLowerCase();
      if (ev.includes('spawn')) type = 'Spawn';
      else if (ev.includes('collision')) type = 'Collision';
      else if (ev.includes('overlap') || ev.includes('trigger')) type = 'Trigger';
      else if (ev.includes('input') || ev.includes('key')) type = 'Input';
      else if (ev.includes('anim')) type = 'Animation';
      else if (ev.includes('audio') || ev.includes('sound')) type = 'Audio';
      else if (ev.includes('timer') || ev.includes('delay')) type = 'Timer';
      else if (ev.includes('destroy')) type = 'Destroy';

      let sourceActorId: number | null = null;
      let sourceActorName = '';
      let targetActorId: number | null = null;
      let targetActorName = '';

      if (args.length > 0 && args[0]) {
        try {
          const a = args[0];
          if (a.sourceActor?.id != null) { sourceActorId = a.sourceActor.id; sourceActorName = a.sourceActor.name || ''; }
          else if (a.source?.id != null) { sourceActorId = a.source.id; sourceActorName = a.source.name || ''; }
          if (a.targetActor?.id != null) { targetActorId = a.targetActor.id; targetActorName = a.targetActor.name || ''; }
          else if (a.target?.id != null) { targetActorId = a.target.id; targetActorName = a.target.name || ''; }
        } catch { /* safe */ }
      }

      store.logEvent({
        type,
        sourceActorId,
        sourceActorName,
        targetActorId,
        targetActorName,
        detail: `${type}: ${event}`,
        payload: {},
        triggeredNodeCount: 0,
      });
    }
    origEmitRef(event, ...args);
  };

  // ─────────────────────────────────────────────────────
  //  HOOK 9: Scene2DManager.spawnActorFromClassId()
  //  Captures 2D actor spawns immediately (not just
  //  via the per-frame diff).
  // ─────────────────────────────────────────────────────
  const s2d = engine.scene2DManager;
  if (s2d && typeof s2d.spawnActorFromClassId === 'function') {
    _orig2DSpawnFromClassId = s2d.spawnActorFromClassId.bind(s2d);
    const orig2DSpawnRef = _orig2DSpawnFromClassId;

    s2d.spawnActorFromClassId = function profiler2DSpawn(
      classId: string, position?: any, overrides?: any,
    ) {
      const result = orig2DSpawnRef!(classId, position, overrides);
      if (result && store.isRecording) {
        const compNames = _gatherComponents2D(result);
        const className = result.actorType || result.name || 'SpriteActor';
        const pos = result.transform2D?.position
          ? { x: result.transform2D.position.x, y: result.transform2D.position.y, z: 0 }
          : { x: 0, y: 0, z: 0 };

        store.onActorSpawned(
          result.id, result.name, className,
          result.blueprintId || classId,
          compNames, pos,
        );
        _prev2DActorIds.add(result.id);
        store.recordClassInstantiation(className, classId, result.id, 'SpawnActorFromClassId2D');
      }
      return result;
    };
  }

  // ─────────────────────────────────────────────────────
  //  HOOK 10: Scene2DManager.despawnSpriteActor2D()
  //  Captures 2D actor destruction immediately.
  // ─────────────────────────────────────────────────────
  if (s2d && typeof s2d.despawnSpriteActor2D === 'function') {
    _orig2DDespawn = s2d.despawnSpriteActor2D.bind(s2d);
    const orig2DDespawnRef = _orig2DDespawn;

    s2d.despawnSpriteActor2D = function profiler2DDespawn(actor: any) {
      if (store.isRecording && actor) {
        store.onActorDestroyed(actor.id);
        _prev2DActorIds.delete(actor.id);

        store.logEvent({
          type: 'Destroy',
          sourceActorId: actor.id,
          sourceActorName: actor.name || '',
          targetActorId: null, targetActorName: '',
          detail: `Destroy 2D Actor "${actor.name}" (${actor.actorType || 'sprite'})`,
          payload: { actorType: actor.actorType, is2D: true },
          triggeredNodeCount: 0,
        });
      }
      orig2DDespawnRef!(actor);
    };
  }

  console.log('[Profiler] All hooks installed');
}

export function uninstallProfilerHooks(): void {
  if (!_installed || !_engine) return;

  const engine = _engine;
  const scene = engine.scene;
  const eventBus = EventBus.getInstance();

  // Restore all originals
  if (_origUpdate) engine.update = _origUpdate;
  if (_origGetCtx) (engine as any)._getCtx = _origGetCtx;
  if (_origDestroyActor) scene.destroyActor = _origDestroyActor;
  if (_origSpawnActorFromClass) scene.spawnActorFromClass = _origSpawnActorFromClass;
  if (_origEventBusEmit) eventBus.emit = _origEventBusEmit;
  if (_origScriptTick) ScriptComponent.prototype.tick = _origScriptTick;
  if (_origScriptBeginPlay) ScriptComponent.prototype.beginPlay = _origScriptBeginPlay;
  if (_origScriptOnDestroy) ScriptComponent.prototype.onDestroy = _origScriptOnDestroy;

  // Restore 2D hooks
  const s2d = engine.scene2DManager;
  if (s2d) {
    if (_orig2DSpawnFromClassId) s2d.spawnActorFromClassId = _orig2DSpawnFromClassId;
    if (_orig2DDespawn) s2d.despawnSpriteActor2D = _orig2DDespawn;
  }

  // Restore the original ScriptContext fields on the cached context
  if (_origPrint) {
    const cachedCtx = (engine as any)._cachedCtx;
    if (cachedCtx) {
      cachedCtx.scene = scene;
      cachedCtx.engine = engine;
      cachedCtx.physics = engine.physics;
      cachedCtx.print = (v: any) => engine.onPrint(v);
    }
  }

  _origUpdate = null;
  _origGetCtx = null;
  _origDestroyActor = null;
  _origSpawnActorFromClass = null;
  _origEventBusEmit = null;
  _origScriptTick = null;
  _origScriptBeginPlay = null;
  _origScriptOnDestroy = null;
  _origPrint = null;
  _orig2DSpawnFromClassId = null;
  _orig2DDespawn = null;
  _prevActorIds.clear();
  _prev2DActorIds.clear();
  _nodeClassCache.clear();
  _engine = null;
  _installed = false;
  _loggedFirstFrame = false;
  _silentActorErrors = 0;
  _currentActorId = -1;
  _currentActorName = '';
  _currentGraphName = '';

  console.log('[Profiler] Hooks uninstalled');
}

export function isProfilerInstalled(): boolean {
  return _installed;
}
