// ============================================================
//  ProjectileComponentNodes — UE-style Projectile Movement
//  Component nodes for the blueprint editor.
//
//  These component-aware nodes let users configure, launch,
//  and control projectile movement on a per-component basis.
//  Each node carries `compName` and `compIndex` to bind to
//  a specific ProjectileMovement component on the actor.
//
//  Nodes:
//    Pure:   GetProjectileConfigNode, GetProjectileCompVelocityNode,
//            IsProjectileActiveNode
//    Exec:   LaunchProjectileCompNode, SetProjectileSpeedNode,
//            SetProjectileGravityScaleNode, SetProjectileBounceNode,
//            SetProjectileCompHomingNode, DestroyProjectileCompNode,
//            SetProjectileLifetimeNode
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ── Get Projectile Config ───────────────────────────────────
// Pure node — reads the projectile component's config fields.
// Outputs: Initial Speed, Max Speed, Gravity Scale, Lifetime,
//          Bounciness, Max Bounces, Homing Accel, Should Bounce,
//          Use Physics, Stop On Hit

export class GetProjectileConfigNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Projectile Config (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('initialSpeed',      new ClassicPreset.Output(numSocket, 'Initial Speed'));
    this.addOutput('maxSpeed',          new ClassicPreset.Output(numSocket, 'Max Speed'));
    this.addOutput('gravityScale',      new ClassicPreset.Output(numSocket, 'Gravity Scale'));
    this.addOutput('lifetime',          new ClassicPreset.Output(numSocket, 'Lifetime'));
    this.addOutput('bounciness',        new ClassicPreset.Output(numSocket, 'Bounciness'));
    this.addOutput('maxBounces',        new ClassicPreset.Output(numSocket, 'Max Bounces'));
    this.addOutput('homingAcceleration', new ClassicPreset.Output(numSocket, 'Homing Accel'));
    this.addOutput('shouldBounce',      new ClassicPreset.Output(boolSocket, 'Should Bounce'));
    this.addOutput('usePhysics',        new ClassicPreset.Output(boolSocket, 'Use Physics'));
    this.addOutput('stopOnHit',         new ClassicPreset.Output(boolSocket, 'Stop On Hit'));
  }
}

// ── Get Projectile Velocity (component-bound) ───────────────
// Pure node — reads the velocity of the active projectile.

export class GetProjectileCompVelocityNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Projectile Velocity (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('vx',    new ClassicPreset.Output(numSocket, 'Velocity X'));
    this.addOutput('vy',    new ClassicPreset.Output(numSocket, 'Velocity Y'));
    this.addOutput('vz',    new ClassicPreset.Output(numSocket, 'Velocity Z'));
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}

// ── Is Projectile Active ────────────────────────────────────
// Pure node — returns true if this component has an active
// projectile in flight.

export class IsProjectileActiveNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Is Projectile Active (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('active', new ClassicPreset.Output(boolSocket, 'Is Active'));
  }
}

// ── Launch Projectile (component-bound) ─────────────────────
// Exec node — launches using the component's config values.
// Direction and optional speed override can be supplied via pins.

export class LaunchProjectileCompNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Launch Projectile (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('speedOverride', new ClassicPreset.Input(numSocket, 'Speed Override'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('projectileId', new ClassicPreset.Output(numSocket, 'Projectile ID'));
  }
}

// ── Set Projectile Speed ────────────────────────────────────
export class SetProjectileSpeedNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Projectile Speed (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Set Projectile Gravity Scale ────────────────────────────
export class SetProjectileGravityScaleNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Gravity Scale (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('gravityScale', new ClassicPreset.Input(numSocket, 'Gravity Scale'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Set Projectile Bounce ───────────────────────────────────
export class SetProjectileBounceNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Bounce (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('shouldBounce', new ClassicPreset.Input(boolSocket, 'Should Bounce'));
    this.addInput('bounciness', new ClassicPreset.Input(numSocket, 'Bounciness'));
    this.addInput('maxBounces', new ClassicPreset.Input(numSocket, 'Max Bounces'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Set Projectile Homing (component-bound) ─────────────────
export class SetProjectileCompHomingNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Homing (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('targetId', new ClassicPreset.Input(numSocket, 'Target Actor ID'));
    this.addInput('homingAccel', new ClassicPreset.Input(numSocket, 'Homing Acceleration'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Destroy Projectile (component-bound) ────────────────────
export class DestroyProjectileCompNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Destroy Projectile (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Set Projectile Lifetime ─────────────────────────────────
export class SetProjectileLifetimeNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Lifetime (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('lifetime', new ClassicPreset.Input(numSocket, 'Lifetime'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ============================================================
//  Register the projectile movement component rule
// ============================================================

registerComponentRule({
  componentTypes: ['projectileMovement'],
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    return [
      // ── Pure / value nodes ──
      { label: `Get Projectile Config (${n})`,    factory: () => new GetProjectileConfigNode(n, index) },
      { label: `Get Projectile Velocity (${n})`,  factory: () => new GetProjectileCompVelocityNode(n, index) },
      { label: `Is Projectile Active (${n})`,     factory: () => new IsProjectileActiveNode(n, index) },
      // ── Action / exec nodes ──
      { label: `Launch Projectile (${n})`,         factory: () => new LaunchProjectileCompNode(n, index) },
      { label: `Set Projectile Speed (${n})`,      factory: () => new SetProjectileSpeedNode(n, index) },
      { label: `Set Gravity Scale (${n})`,         factory: () => new SetProjectileGravityScaleNode(n, index) },
      { label: `Set Bounce (${n})`,                factory: () => new SetProjectileBounceNode(n, index) },
      { label: `Set Homing (${n})`,                factory: () => new SetProjectileCompHomingNode(n, index) },
      { label: `Destroy Projectile (${n})`,        factory: () => new DestroyProjectileCompNode(n, index) },
      { label: `Set Lifetime (${n})`,              factory: () => new SetProjectileLifetimeNode(n, index) },
    ];
  },
});
