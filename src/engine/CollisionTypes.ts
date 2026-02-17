// ============================================================
//  CollisionTypes — Shared type definitions for the collision &
//  trigger system.  Used by PhysicsWorld, ScriptComponent,
//  ActorAsset, and the node editor code generator.
// ============================================================

// ---- Collision Shape ----

export type CollisionShapeType = 'box' | 'sphere' | 'capsule';

export interface BoxShapeDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface SphereShapeDimensions {
  radius: number;
}

export interface CapsuleShapeDimensions {
  radius: number;
  height: number;
}

export type ShapeDimensions = BoxShapeDimensions | SphereShapeDimensions | CapsuleShapeDimensions;

// ---- Collision Response ----

export type CollisionResponse = 'block' | 'overlap' | 'ignore';

// ---- Collision Channels ----

export type CollisionChannelName =
  | 'WorldStatic'
  | 'WorldDynamic'
  | 'Pawn'
  | 'Player'
  | 'Projectile'
  | 'Trigger'
  | 'Camera';

export type ChannelResponses = Partial<Record<CollisionChannelName, CollisionResponse>>;

// ---- Collision Groups (bitmask) for Rapier ----

/** Collision group membership & filter bits used with Rapier's InteractionGroups.
 *  Each channel gets a bit; the upper 16 bits = membership, lower 16 bits = filter (what to collide with).
 */
export const CollisionGroupBits = {
  WorldStatic:  0x0001,
  WorldDynamic: 0x0002,
  Pawn:         0x0004,
  Player:       0x0008,
  Camera:       0x0010,
  Projectile:   0x0020,
  Trigger:      0x0040,
  All:          0xFFFF,
} as const;

/**
 * Build Rapier interaction groups (membership | filter << 16).
 *  - membership: which groups this collider belongs to
 *  - filter:     which groups this collider collides with
 */
export function makeInteractionGroups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}

/** Character capsule collision groups: belongs to Pawn+Player, collides with WorldStatic + WorldDynamic + Pawn + Player + Trigger, ignores Camera */
export function characterCapsuleGroups(): number {
  const membership = CollisionGroupBits.Pawn | CollisionGroupBits.Player;
  const filter = CollisionGroupBits.WorldStatic | CollisionGroupBits.WorldDynamic | CollisionGroupBits.Pawn | CollisionGroupBits.Player | CollisionGroupBits.Trigger;
  return makeInteractionGroups(membership, filter);
}

/** Trigger sensor collision groups: belongs to Trigger, collides with everything */
export function triggerSensorGroups(): number {
  const membership = CollisionGroupBits.Trigger;
  const filter = CollisionGroupBits.All;
  return makeInteractionGroups(membership, filter);
}

/** Camera spring arm ray collision groups: belongs to Camera, collides with WorldStatic only, ignores Pawn */
export function cameraRayGroups(): number {
  const membership = CollisionGroupBits.Camera;
  const filter = CollisionGroupBits.WorldStatic | CollisionGroupBits.WorldDynamic;
  return makeInteractionGroups(membership, filter);
}

// ---- Collision Profile (UE-style presets) ----

/**
 * A collision profile defines per-channel Block / Overlap / Ignore responses,
 * similar to UE's Collision Presets.  The character controller uses these to
 * build Rapier collision groups and to decide which colliders are obstacles
 * (block) vs overlap-only (sensor pass-through).
 */
export interface CollisionProfile {
  /** Human-readable name of the preset (e.g. "Pawn", "OverlapAll") */
  name: string;
  /** The channel this collider belongs to (its object type) */
  objectType: CollisionChannelName;
  /** Per-channel response overrides. Channels not listed default to 'ignore'. */
  responses: Record<CollisionChannelName, CollisionResponse>;
}

/** Default "Pawn" collision profile — matches UE Pawn preset.
 *  Block walls/floors/other pawns, Overlap triggers, Ignore camera. */
export function defaultPawnCollisionProfile(): CollisionProfile {
  return {
    name: 'Pawn',
    objectType: 'Pawn',
    responses: {
      WorldStatic:  'block',
      WorldDynamic: 'block',
      Pawn:         'block',
      Player:       'block',
      Projectile:   'block',
      Trigger:      'overlap',
      Camera:       'ignore',
    },
  };
}

/** Default "Camera" collision profile — matches UE Camera preset.
 *  Block WorldStatic + WorldDynamic only (camera ray retracts against walls/floors).
 *  Ignore Pawn, Player, Trigger, Camera, Projectile. */
export function defaultCameraCollisionProfile(): CollisionProfile {
  return {
    name: 'Camera',
    objectType: 'Camera',
    responses: {
      WorldStatic:  'block',
      WorldDynamic: 'block',
      Pawn:         'ignore',
      Player:       'ignore',
      Projectile:   'ignore',
      Trigger:      'ignore',
      Camera:       'ignore',
    },
  };
}

/**
 * Build Rapier interaction groups from a CollisionProfile.
 * membership = objectType bit, filter = all channels that are NOT 'ignore'.
 */
export function collisionGroupsFromProfile(profile: CollisionProfile): number {
  const objBit = CollisionGroupBits[profile.objectType] ?? CollisionGroupBits.WorldDynamic;
  let filter = 0;
  for (const [channel, response] of Object.entries(profile.responses) as [CollisionChannelName, CollisionResponse][]) {
    if (response !== 'ignore') {
      filter |= CollisionGroupBits[channel] ?? 0;
    }
  }
  return makeInteractionGroups(objBit, filter);
}

// ---- Collision Type — what the component does ----

export type CollisionMode = 'none' | 'trigger' | 'physics';

// ---- Trigger / Collision Component Configuration ----

export interface CollisionConfig {
  /** Master on/off */
  enabled: boolean;
  /** none = no collision; trigger = overlap only; physics = block + overlap */
  collisionMode: CollisionMode;
  /** Shape of the collision volume */
  shape: CollisionShapeType;
  /** Dimensions for the chosen shape */
  dimensions: ShapeDimensions;
  /** Local position offset of the collision shape relative to the component */
  offset: { x: number; y: number; z: number };
  /** Local rotation offset of the collision shape in degrees */
  rotationOffset: { x: number; y: number; z: number };
  /** Per-channel response overrides (default = ignore for triggers) */
  channelResponses: ChannelResponses;
  /** Fire OnBeginOverlap / OnEndOverlap events */
  generateOverlapEvents: boolean;
  /** Fire OnHit events (physics mode only) */
  generateHitEvents: boolean;
  /** Show collision wireframe in editor viewport */
  showInEditor: boolean;
}

/** Sensible default collision config for a newly-created trigger volume */
export function defaultCollisionConfig(): CollisionConfig {
  return {
    enabled: true,
    collisionMode: 'trigger',
    shape: 'box',
    dimensions: { width: 2, height: 2, depth: 2 } as BoxShapeDimensions,
    offset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    channelResponses: {
      WorldDynamic: 'overlap',
      Pawn: 'overlap',
      Player: 'overlap',
    },
    generateOverlapEvents: true,
    generateHitEvents: false,
    showInEditor: true,
  };
}

/** Default collision config for a Static Mesh component (UE-style physics blocking) */
export function defaultMeshCollisionConfig(): CollisionConfig {
  return {
    enabled: true,
    collisionMode: 'physics',
    shape: 'box',
    dimensions: { width: 2, height: 2, depth: 2 } as BoxShapeDimensions,
    offset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    channelResponses: {
      WorldStatic: 'block',
      WorldDynamic: 'block',
      Pawn: 'block',
      Player: 'block',
      Projectile: 'block',
      Trigger: 'overlap',
    },
    generateOverlapEvents: false,
    generateHitEvents: false,
    showInEditor: true,
  };
}

/** Get default dimensions for a given shape type */
export function defaultDimensionsForShape(shape: CollisionShapeType): ShapeDimensions {
  switch (shape) {
    case 'box':     return { width: 2, height: 2, depth: 2 };
    case 'sphere':  return { radius: 1 };
    case 'capsule': return { radius: 0.5, height: 2 };
  }
}

// ---- Overlap Event Data ----

/** Payload delivered to BeginOverlap / EndOverlap script callbacks */
export interface OverlapEvent {
  /** Name of the other actor */
  otherActorName: string;
  /** Id of the other game object */
  otherActorId: number;
  /** Name of the trigger component that detected the overlap */
  selfComponentName: string;
  /** Index of the trigger component (-1 = root) */
  selfComponentIndex: number;
}

/** Payload delivered to Hit script callbacks */
export interface HitEvent {
  /** Name of the other actor */
  otherActorName: string;
  /** Id of the other game object */
  otherActorId: number;
  /** Impact point in world space */
  impactPoint: { x: number; y: number; z: number };
  /** Impact normal (points away from the surface hit) */
  impactNormal: { x: number; y: number; z: number };
  /** Relative velocity at the point of impact */
  hitVelocity: { x: number; y: number; z: number };
  /** Impulse magnitude of the collision */
  impulse: number;
  /** Name of the trigger/collision component */
  selfComponentName: string;
  /** Index of the component (-1 = root) */
  selfComponentIndex: number;
}
