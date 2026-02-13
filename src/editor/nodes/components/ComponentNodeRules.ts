// ============================================================
//  Component Node Rules — extensible registry that maps component
//  types (mesh, collision, particle, …) to the set of nodes a user
//  can place in the blueprint graph.
//
//  When a new component kind is added in the future, just create
//  a new rules entry here and implement the node classes.
// ============================================================

import type { ClassicPreset } from 'rete';
import type { ActorComponentData } from '../../ActorAsset';

// ---- Types ----

/** Describes a single node the user can add for a specific component instance */
export interface ComponentNodeEntry {
  /** Label shown in the context menu, e.g. "Get Location (Cube_0)" */
  label: string;
  /** Factory that creates the Rete node */
  factory: () => ClassicPreset.Node;
}

/** A rule that produces a set of node entries for a given component */
export interface ComponentRule {
  /** Which component types this rule applies to, e.g. ['mesh'] */
  componentTypes: string[];
  /** Given a concrete component, return the node entries for the context menu */
  getEntries: (comp: ActorComponentData, index: number) => ComponentNodeEntry[];
}

// ---- Registry ----

const _rules: ComponentRule[] = [];

/** Register a new component rule. Called once per rule at module init time. */
export function registerComponentRule(rule: ComponentRule): void {
  _rules.push(rule);
}

/**
 * Given the current component list of an actor asset, build every
 * context-menu entry for all components. Also includes the root component.
 */
export function getComponentNodeEntries(
  components: ActorComponentData[],
  rootMeshType: string,
): ComponentNodeEntry[] {
  const entries: ComponentNodeEntry[] = [];

  // Root component (always a mesh) — index -1 signals "root"
  const rootPseudo: ActorComponentData = {
    id: '__root__',
    type: 'mesh',
    meshType: rootMeshType as any,
    name: 'Root',
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };

  for (const rule of _rules) {
    if (rule.componentTypes.includes('mesh')) {
      entries.push(...rule.getEntries(rootPseudo, -1));
    }
  }

  // Child components
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    for (const rule of _rules) {
      if (rule.componentTypes.includes(comp.type)) {
        entries.push(...rule.getEntries(comp, i));
      }
    }
  }

  return entries;
}
