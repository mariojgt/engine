// ============================================================
//  Light Component Nodes — Blueprint nodes for controlling
//  light components attached to actors.
//
//  At runtime light objects are stored on the GameObject:
//    gameObject._lightComponents[compIndex]
//  Each entry is { light: THREE.Light, config: LightConfig }
// ============================================================

import { ClassicPreset } from 'rete';
import { execSocket, numSocket, boolSocket, colorSocket } from '../sockets';
import { registerComponentRule } from './ComponentNodeRules';
import type { ActorComponentData } from '../../ActorAsset';

// ── Setter nodes (exec-flow) ──────────────────────────────

export class SetLightEnabledNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Enabled (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('enabled', new ClassicPreset.Input(boolSocket, 'Enabled'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetLightColorNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Color (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('color', new ClassicPreset.Input(colorSocket, 'Color'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetLightIntensityNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Intensity (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('intensity', new ClassicPreset.Input(numSocket, 'Intensity'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetLightDistanceNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Distance (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('distance', new ClassicPreset.Input(numSocket, 'Distance'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetLightPositionNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Position (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetLightTargetNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Light Target (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('x', new ClassicPreset.Input(numSocket, 'X'));
    this.addInput('y', new ClassicPreset.Input(numSocket, 'Y'));
    this.addInput('z', new ClassicPreset.Input(numSocket, 'Z'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetCastShadowNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Cast Shadow (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('castShadow', new ClassicPreset.Input(boolSocket, 'Cast Shadow'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetSpotAngleNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Spot Angle (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('angle', new ClassicPreset.Input(numSocket, 'Angle (deg)'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

export class SetSpotPenumbraNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Set Spot Penumbra (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('penumbra', new ClassicPreset.Input(numSocket, 'Penumbra'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

// ── Getter nodes (pure/data) ──────────────────────────────

export class GetLightEnabledNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Light Enabled (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('enabled', new ClassicPreset.Output(boolSocket, 'Enabled'));
  }
}

export class GetLightColorNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Light Color (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('color', new ClassicPreset.Output(colorSocket, 'Color'));
  }
}

export class GetLightIntensityNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Light Intensity (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('intensity', new ClassicPreset.Output(numSocket, 'Intensity'));
  }
}

export class GetLightPositionNode extends ClassicPreset.Node {
  public compName: string;
  public compIndex: number;
  constructor(compName: string, compIndex: number) {
    super(`Get Light Position (${compName})`);
    this.compName = compName;
    this.compIndex = compIndex;
    this.addOutput('x', new ClassicPreset.Output(numSocket, 'X'));
    this.addOutput('y', new ClassicPreset.Output(numSocket, 'Y'));
    this.addOutput('z', new ClassicPreset.Output(numSocket, 'Z'));
  }
}

// ── Register the light component rule ──

registerComponentRule({
  componentTypes: ['light'],
  getEntries(comp: ActorComponentData, index: number) {
    const n = comp.name;
    const lightType = comp.light?.lightType ?? 'point';
    const entries = [
      { label: `Set Light Enabled (${n})`,   factory: () => new SetLightEnabledNode(n, index) },
      { label: `Get Light Enabled (${n})`,   factory: () => new GetLightEnabledNode(n, index) },
      { label: `Set Light Color (${n})`,     factory: () => new SetLightColorNode(n, index) },
      { label: `Get Light Color (${n})`,     factory: () => new GetLightColorNode(n, index) },
      { label: `Set Light Intensity (${n})`, factory: () => new SetLightIntensityNode(n, index) },
      { label: `Get Light Intensity (${n})`, factory: () => new GetLightIntensityNode(n, index) },
      { label: `Set Cast Shadow (${n})`,     factory: () => new SetCastShadowNode(n, index) },
    ];

    // Position-based lights
    if (lightType !== 'ambient') {
      entries.push(
        { label: `Set Light Position (${n})`, factory: () => new SetLightPositionNode(n, index) },
        { label: `Get Light Position (${n})`, factory: () => new GetLightPositionNode(n, index) },
      );
    }

    // Distance (point / spot)
    if (lightType === 'point' || lightType === 'spot') {
      entries.push(
        { label: `Set Light Distance (${n})`, factory: () => new SetLightDistanceNode(n, index) },
      );
    }

    // Target (directional / spot)
    if (lightType === 'directional' || lightType === 'spot') {
      entries.push(
        { label: `Set Light Target (${n})`, factory: () => new SetLightTargetNode(n, index) },
      );
    }

    // Spot-only
    if (lightType === 'spot') {
      entries.push(
        { label: `Set Spot Angle (${n})`,    factory: () => new SetSpotAngleNode(n, index) },
        { label: `Set Spot Penumbra (${n})`, factory: () => new SetSpotPenumbraNode(n, index) },
      );
    }

    return entries;
  },
});
