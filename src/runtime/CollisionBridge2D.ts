// ============================================================
//  CollisionBridge2D — Bridges 2D physics collision events to
//  the 3D overlap/hit API used by blueprint compiled code.
//
//  Previously duplicated in Scene2DManager (editor) and in
//  generated game_runtime.ts (export) — now a single shared
//  implementation used by both contexts.
// ============================================================

import type { SpriteActor } from '../engine/SpriteActor';

export interface CollisionCallback2D {
  onOverlapBegin?: (other: any, componentName?: string, otherComponentName?: string) => void;
  onOverlapEnd?: (other: any, componentName?: string, otherComponentName?: string) => void;
  onHit?: (other: any, componentName?: string, otherComponentName?: string) => void;
}

/**
 * Creates a collision/physics context shim for 2D actors that matches
 * the ScriptContext.physics interface expected by compiled blueprint code.
 *
 * This is the SINGLE implementation — used in Play mode and exports.
 */
export function createCollisionShim2D(
  actor: SpriteActor,
  allActors: SpriteActor[] | (() => SpriteActor[]),
  engine: any,
): any {
  const getActors = typeof allActors === 'function' ? allActors : () => allActors;

  return {
    collision: {
      registerCallbacks(
        goId: number,
        onOverlapBegin?: (other: any, comp?: string, otherComp?: string) => void,
        onOverlapEnd?: (other: any, comp?: string, otherComp?: string) => void,
        onHit?: (other: any, comp?: string, otherComp?: string) => void,
      ): void {
        // Bridge: register listeners on the SpriteActor's event emitter
        // 2D physics fires events on the actor; we translate to 3D API format
        if (onOverlapBegin) {
          actor.on('triggerEnter', (ev: any) => {
            const other2D = getActors().find((a: SpriteActor) =>
              a.getComponent('RigidBody2D')?.rigidBody &&
              ev.otherColliderHandle !== undefined &&
              a.getComponent('RigidBody2D')?.rigidBody?.handle === ev.otherBodyHandle
            );
            if (other2D) {
              const otherGO = _findGameObjectForActor(other2D, engine);
              onOverlapBegin(
                otherGO ?? other2D,
                ev.componentName ?? 'Collider2D',
                ev.otherComponentName ?? 'Collider2D',
              );
            }
          });
        }

        if (onOverlapEnd) {
          actor.on('triggerExit', (ev: any) => {
            const other2D = getActors().find((a: SpriteActor) =>
              a.getComponent('RigidBody2D')?.rigidBody &&
              ev.otherColliderHandle !== undefined &&
              a.getComponent('RigidBody2D')?.rigidBody?.handle === ev.otherBodyHandle
            );
            if (other2D) {
              const otherGO = _findGameObjectForActor(other2D, engine);
              onOverlapEnd(
                otherGO ?? other2D,
                ev.componentName ?? 'Collider2D',
                ev.otherComponentName ?? 'Collider2D',
              );
            }
          });
        }

        if (onHit) {
          actor.on('collisionStart', (ev: any) => {
            const other2D = getActors().find((a: SpriteActor) =>
              a.getComponent('RigidBody2D')?.rigidBody &&
              ev.otherColliderHandle !== undefined &&
              a.getComponent('RigidBody2D')?.rigidBody?.handle === ev.otherBodyHandle
            );
            if (other2D) {
              const otherGO = _findGameObjectForActor(other2D, engine);
              onHit(
                otherGO ?? other2D,
                ev.componentName ?? 'Collider2D',
                ev.otherComponentName ?? 'Collider2D',
              );
            }
          });
        }
      },

      isOverlapping(goId: number, otherGoId: number): boolean {
        // Approximation for 2D — check if both actors have active trigger contacts
        return false;
      },

      getOverlappingCount(goId: number): number {
        return 0;
      },

      getOverlappingIds(goId: number): number[] {
        return [];
      },
    },
  };
}

/**
 * Find the 3D GameObject that corresponds to a 2D SpriteActor (by ID match).
 * Blueprint code expects `other` to be a GameObject-like object.
 */
function _findGameObjectForActor(actor2D: SpriteActor, engine: any): any {
  if (!engine?.scene?.gameObjects) return null;
  return engine.scene.gameObjects.find((go: any) => go.id === actor2D.id) ?? null;
}

/**
 * Apply Expose-on-Spawn variable overrides to compiled blueprint code.
 *
 * Previously duplicated in Scene2DManager, PCBuildTarget, WebBuildTarget.
 * Now a single shared implementation.
 */
export function applyExposeOnSpawnOverrides(code: string, overrides: Record<string, any>): string {
  let newCode = code;
  for (const [key, val] of Object.entries(overrides)) {
    const rawVal = JSON.stringify(val);
    // Try to match __gameInstance-sourced vars first
    const regex = new RegExp('var\\s+' + key + '\\s*=\\s*__gameInstance(\\..+?)?;', 'g');
    if (regex.test(newCode)) {
      newCode = newCode.replace(regex, 'var ' + key + ' = ' + rawVal + ';');
    } else {
      // Fall back to replacing any var declaration for this key
      newCode = newCode.replace(
        new RegExp('var\\s+' + key + '\\s*=[^;]+;', 'g'),
        'var ' + key + ' = ' + rawVal + ';',
      );
    }
  }
  return newCode;
}
