// ============================================================
//  Projectile 3D Template — Ready-to-use projectile actor
//
//  Features out of the box:
//    • Sphere mesh (small, fast-moving)
//    • Physics enabled with Projectile collision channel
//    • CCD (continuous collision detection) for fast objects
//    • OnCollisionHit event → Destroy Actor (self-destruct on hit)
//    • Lifetime auto-destroy after 5 seconds
//    • Small gravity scale (0.1) — mostly straight-line travel
//    • No friction/restitution (slides through on contact → destroyed)
// ============================================================

// ── Blueprint event graph (node + connection data) ──────────

export const projectile3DEventGraph = {
  nodeData: {
    nodes: [
      // ── BeginPlay (placeholder — user can add setup here) ──
      { id: 'proj_beginplay', type: 'EventBeginPlayNode', position: { x: 80, y: 40 },  data: {} },

      // ── Tick (placeholder — user can add logic here) ──
      { id: 'proj_tick',       type: 'EventTickNode',       position: { x: 80, y: 200 }, data: {} },

      // ── On Collision Hit → Destroy Self ──
      { id: 'proj_hit',        type: 'OnCollisionHitNode',  position: { x: 80,  y: 400 }, data: {} },
      { id: 'proj_destroy',    type: 'DestroyActorNode',    position: { x: 460, y: 400 }, data: {} },

      // ── Print damage info (user can replace with real damage logic) ──
      { id: 'proj_print',      type: 'PrintStringNode',     position: { x: 460, y: 560 }, data: { value: 'Projectile hit!' } },
    ],
    connections: [
      // On Collision Hit → Destroy Self
      { id: 'projc1', source: 'proj_hit',     sourceOutput: 'exec', target: 'proj_destroy', targetInput: 'exec' },
      // Destroy → Print (so user can see it works, then replace with their logic)
      { id: 'projc2', source: 'proj_destroy', sourceOutput: 'exec', target: 'proj_print',   targetInput: 'exec' },
    ],
  },
};

// ── Physics config defaults for projectile ──────────────────

export const projectile3DPhysicsDefaults = {
  enabled: true,
  simulatePhysics: true,
  bodyType: 'Dynamic' as const,
  mass: 0.1,
  gravityEnabled: true,
  gravityScale: 0.1,        // Minimal gravity — mostly straight-line
  linearDamping: 0.0,
  angularDamping: 0.0,
  friction: 0.0,
  restitution: 0.0,
  frictionCombine: 'Average' as const,
  restitutionCombine: 'Average' as const,
  colliderShape: 'Sphere' as const,
  autoFitCollider: true,
  boxHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
  sphereRadius: 0.1,
  capsuleRadius: 0.5,
  capsuleHalfHeight: 1.0,
  cylinderRadius: 0.5,
  cylinderHalfHeight: 0.5,
  colliderOffset: { x: 0, y: 0, z: 0 },
  isTrigger: false,
  lockPositionX: false,
  lockPositionY: false,
  lockPositionZ: false,
  lockRotationX: false,
  lockRotationY: false,
  lockRotationZ: false,
  collisionEnabled: true,
  collisionChannel: 'Projectile' as const,
  blocksChannels: ['WorldStatic', 'WorldDynamic', 'Pawn'] as const,
  overlapsChannels: ['Trigger'] as const,
  ccdEnabled: true,          // CCD for fast-moving objects
  generateOverlapEvents: true,
  generateHitEvents: true,
};

// ── Combined export ─────────────────────────────────────────

export const projectile3DTemplate = {
  eventGraph: projectile3DEventGraph,
  physicsDefaults: projectile3DPhysicsDefaults,
};
