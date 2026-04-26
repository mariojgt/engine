// ============================================================
//  Direction — 4-way cardinal helper for grid-based gameplay
//
//  Encoded as integer 0..3 so it travels through Number sockets
//  without needing a custom enum socket type.
//
//  Convention (top-down, Y-up world, Z forward):
//    N = 0  → (0, 0, -1)   yaw  0
//    E = 1  → (1, 0,  0)   yaw -π/2
//    S = 2  → (0, 0,  1)   yaw  π
//    W = 3  → (-1, 0, 0)   yaw  π/2
// ============================================================

import * as THREE from 'three';

export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

export const DIRECTION_NAMES = ['North', 'East', 'South', 'West'] as const;
export type DirectionName = typeof DIRECTION_NAMES[number];

const VECTORS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, -1], // N
  [1, 0,  0], // E
  [0, 0,  1], // S
  [-1, 0, 0], // W
];

const YAWS: ReadonlyArray<number> = [
  0,
  -Math.PI / 2,
  Math.PI,
  Math.PI / 2,
];

export function dirNormalize(d: number): number {
  const n = Math.round(d) % 4;
  return n < 0 ? n + 4 : n;
}

export function dirRotateCW(d: number, steps: number = 1): number {
  return dirNormalize(d + steps);
}

export function dirRotateCCW(d: number, steps: number = 1): number {
  return dirNormalize(d - steps);
}

export function dirOpposite(d: number): number {
  return dirNormalize(d + 2);
}

export function dirToVector(d: number, out?: THREE.Vector3): THREE.Vector3 {
  const v = VECTORS[dirNormalize(d)];
  return (out ?? new THREE.Vector3()).set(v[0], v[1], v[2]);
}

export function dirToYaw(d: number): number {
  return YAWS[dirNormalize(d)];
}

/** Pick the closest cardinal direction for an arbitrary yaw (radians). */
export function dirFromYaw(yaw: number): number {
  // Wrap to (-π, π], then quantize to nearest π/2 step.
  let y = yaw;
  while (y > Math.PI) y -= 2 * Math.PI;
  while (y <= -Math.PI) y += 2 * Math.PI;
  // YAWS table:  N=0, E=-π/2, S=π, W=π/2.
  // Find nearest by comparing absolute diffs (with wrap for S).
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    let d = Math.abs(y - YAWS[i]);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function dirName(d: number): DirectionName {
  return DIRECTION_NAMES[dirNormalize(d)];
}
