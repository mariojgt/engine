import { ClassicPreset } from 'rete';
import { EventAssetManager } from '../../EventAsset';

export class EventSelectControl extends ClassicPreset.Control {
  public value: string;
  public onChange: (val: string) => void;

  constructor(initial: string, onChange: (val: string) => void) {
    super();
    this.value = initial;
    this.onChange = onChange;
  }

  setValue(val: string) {
    this.value = val;
    this.onChange(val);
  }

  getOptions(): { id: string; name: string }[] {
    const mgr = EventAssetManager.getInstance();
    if (!mgr) return [];
    return mgr.assets.map(a => ({ id: a.id, name: a.name }));
  }
}
