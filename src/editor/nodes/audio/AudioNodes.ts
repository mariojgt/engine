// ============================================================
//  AudioNodes — Blueprint nodes for the Audio System
//
//  All nodes are UI-only definitions.  Code generation is
//  handled centrally in NodeEditorPanel.tsx genAction()/resolveValue().
// ============================================================

import { ClassicPreset } from 'rete';
import {
  execSocket,
  numSocket,
  boolSocket,
  strSocket,
  registerNode,
} from '../sockets';

// ============================================================
//  Play Sound 2D — plays a non-spatial sound
// ============================================================
export class PlaySound2DNode extends ClassicPreset.Node {
  constructor() {
    super('Play Sound 2D');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sound', new ClassicPreset.Input(strSocket, 'Sound URL'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addInput('pitch', new ClassicPreset.Input(numSocket, 'Pitch'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addInput('bus', new ClassicPreset.Input(strSocket, 'Bus'));
    this.addInput('startTime', new ClassicPreset.Input(numSocket, 'Start Time'));
    this.addInput('fadeIn', new ClassicPreset.Input(numSocket, 'Fade In'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('sourceId', new ClassicPreset.Output(numSocket, 'Source ID'));
  }
}

registerNode('Play Sound 2D', 'Audio', () => new PlaySound2DNode());

// ============================================================
//  Play Sound at Location — plays a spatial 3D sound
// ============================================================
export class PlaySoundAtLocationNode extends ClassicPreset.Node {
  constructor() {
    super('Play Sound at Location');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sound', new ClassicPreset.Input(strSocket, 'Sound URL'));
    this.addInput('locX', new ClassicPreset.Input(numSocket, 'Location X'));
    this.addInput('locY', new ClassicPreset.Input(numSocket, 'Location Y'));
    this.addInput('locZ', new ClassicPreset.Input(numSocket, 'Location Z'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addInput('pitch', new ClassicPreset.Input(numSocket, 'Pitch'));
    this.addInput('loop', new ClassicPreset.Input(boolSocket, 'Loop'));
    this.addInput('bus', new ClassicPreset.Input(strSocket, 'Bus'));
    this.addInput('maxDistance', new ClassicPreset.Input(numSocket, 'Max Distance'));
    this.addInput('startTime', new ClassicPreset.Input(numSocket, 'Start Time'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
    this.addOutput('sourceId', new ClassicPreset.Output(numSocket, 'Source ID'));
  }
}

registerNode('Play Sound at Location', 'Audio', () => new PlaySoundAtLocationNode());

// ============================================================
//  Stop Sound — stops a specific audio source by ID
// ============================================================
export class StopSoundNode extends ClassicPreset.Node {
  constructor() {
    super('Stop Sound');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addInput('fadeOut', new ClassicPreset.Input(numSocket, 'Fade Out'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Stop Sound', 'Audio', () => new StopSoundNode());

// ============================================================
//  Stop All Sounds — stops everything
// ============================================================
export class StopAllSoundsNode extends ClassicPreset.Node {
  constructor() {
    super('Stop All Sounds');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('fadeOut', new ClassicPreset.Input(numSocket, 'Fade Out'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Stop All Sounds', 'Audio', () => new StopAllSoundsNode());

// ============================================================
//  Pause Sound — pauses a specific source
// ============================================================
export class PauseSoundNode extends ClassicPreset.Node {
  constructor() {
    super('Pause Sound');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Pause Sound', 'Audio', () => new PauseSoundNode());

// ============================================================
//  Resume Sound — resumes a paused source
// ============================================================
export class ResumeSoundNode extends ClassicPreset.Node {
  constructor() {
    super('Resume Sound');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Resume Sound', 'Audio', () => new ResumeSoundNode());

// ============================================================
//  Set Sound Volume — set volume on a playing source
// ============================================================
export class SetSoundVolumeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sound Volume');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Sound Volume', 'Audio', () => new SetSoundVolumeNode());

// ============================================================
//  Set Sound Pitch — set pitch on a playing source
// ============================================================
export class SetSoundPitchNode extends ClassicPreset.Node {
  constructor() {
    super('Set Sound Pitch');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addInput('pitch', new ClassicPreset.Input(numSocket, 'Pitch'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Sound Pitch', 'Audio', () => new SetSoundPitchNode());

// ============================================================
//  Is Sound Playing — check if a source is currently playing
// ============================================================
export class IsSoundPlayingNode extends ClassicPreset.Node {
  constructor() {
    super('Is Sound Playing');
    this.addInput('sourceId', new ClassicPreset.Input(numSocket, 'Source ID'));
    this.addOutput('playing', new ClassicPreset.Output(boolSocket, 'Is Playing'));
  }
}

registerNode('Is Sound Playing', 'Audio', () => new IsSoundPlayingNode());

// ============================================================
//  Set Bus Volume — set volume on a mixer bus (SFX, Music, etc.)
// ============================================================
export class SetBusVolumeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Bus Volume');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('bus', new ClassicPreset.Input(strSocket, 'Bus Name'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Bus Volume', 'Audio', () => new SetBusVolumeNode());

// ============================================================
//  Set Master Volume — set the global master volume
// ============================================================
export class SetMasterVolumeNode extends ClassicPreset.Node {
  constructor() {
    super('Set Master Volume');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addInput('volume', new ClassicPreset.Input(numSocket, 'Volume'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Set Master Volume', 'Audio', () => new SetMasterVolumeNode());

// ============================================================
//  Pause All Sounds
// ============================================================
export class PauseAllSoundsNode extends ClassicPreset.Node {
  constructor() {
    super('Pause All Sounds');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Pause All Sounds', 'Audio', () => new PauseAllSoundsNode());

// ============================================================
//  Resume All Sounds
// ============================================================
export class ResumeAllSoundsNode extends ClassicPreset.Node {
  constructor() {
    super('Resume All Sounds');
    this.addInput('exec', new ClassicPreset.Input(execSocket, '▶'));
    this.addOutput('exec', new ClassicPreset.Output(execSocket, '▶'));
  }
}

registerNode('Resume All Sounds', 'Audio', () => new ResumeAllSoundsNode());
