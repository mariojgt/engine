// ============================================================
//  Projectile Movement Nodes — Blueprint nodes for runtime
//  configuration of the Projectile Movement component.
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, registerNode } from '../sockets';

// ── Launch Projectile ───────────────────────────────────────

export class LaunchProjectileNode extends ClassicPreset.Node {
  constructor() {
    super('Launch Projectile');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorId', new ClassicPreset.Input(numSocket, 'Actor ID'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addInput('gravityScale', new ClassicPreset.Input(numSocket, 'Gravity Scale'));
    this.addInput('lifetime', new ClassicPreset.Input(numSocket, 'Lifetime'));
    this.addInput('bounce', new ClassicPreset.Input(boolSocket, 'Should Bounce'));
    this.addInput('bounciness', new ClassicPreset.Input(numSocket, 'Bounciness'));
    this.addInput('maxBounces', new ClassicPreset.Input(numSocket, 'Max Bounces'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('projectileId', new ClassicPreset.Output(numSocket, 'Projectile ID'));
  }
}

registerNode('Launch Projectile', 'Components', () => new LaunchProjectileNode());

// ── Launch Projectile (Simple) ──────────────────────────────

export class LaunchProjectileSimpleNode extends ClassicPreset.Node {
  constructor() {
    super('Launch Projectile Simple');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('actorId', new ClassicPreset.Input(numSocket, 'Actor ID'));
    this.addInput('dirX', new ClassicPreset.Input(numSocket, 'Dir X'));
    this.addInput('dirY', new ClassicPreset.Input(numSocket, 'Dir Y'));
    this.addInput('dirZ', new ClassicPreset.Input(numSocket, 'Dir Z'));
    this.addInput('speed', new ClassicPreset.Input(numSocket, 'Speed'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('projectileId', new ClassicPreset.Output(numSocket, 'Projectile ID'));
  }
}

registerNode('Launch Projectile Simple', 'Components', () => new LaunchProjectileSimpleNode());

// ── Set Homing Target ───────────────────────────────────────

export class SetProjectileHomingNode extends ClassicPreset.Node {
  constructor() {
    super('Set Projectile Homing');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('projectileId', new ClassicPreset.Input(numSocket, 'Projectile ID'));
    this.addInput('targetId', new ClassicPreset.Input(numSocket, 'Target Actor ID'));
    this.addInput('homingAccel', new ClassicPreset.Input(numSocket, 'Homing Acceleration'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Projectile Homing', 'Components', () => new SetProjectileHomingNode());

// ── Destroy Projectile ──────────────────────────────────────

export class DestroyProjectileNode extends ClassicPreset.Node {
  constructor() {
    super('Destroy Projectile');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('projectileId', new ClassicPreset.Input(numSocket, 'Projectile ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Destroy Projectile', 'Components', () => new DestroyProjectileNode());

// ── Get Projectile Velocity ─────────────────────────────────

export class GetProjectileVelocityNode extends ClassicPreset.Node {
  constructor() {
    super('Get Projectile Velocity');
    this.addInput('projectileId', new ClassicPreset.Input(numSocket, 'Projectile ID'));
    this.addOutput('vx', new ClassicPreset.Output(numSocket, 'Velocity X'));
    this.addOutput('vy', new ClassicPreset.Output(numSocket, 'Velocity Y'));
    this.addOutput('vz', new ClassicPreset.Output(numSocket, 'Velocity Z'));
    this.addOutput('speed', new ClassicPreset.Output(numSocket, 'Speed'));
  }
}

registerNode('Get Projectile Velocity', 'Components', () => new GetProjectileVelocityNode());
