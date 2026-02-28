import { ClassicPreset } from 'rete';
import { AIAssetManager } from '../../ai/AIAssetManager';

/**
 * Dropdown control that lists all Behavior Tree assets
 * from the AIAssetManager singleton. Follows the same pattern
 * as EventSelectControl.
 */
export class BTSelectControl extends ClassicPreset.Control {
  public value: string;           // selected BT asset ID
  public displayName: string;     // selected BT asset name (for display)
  public onChange: (val: string) => void;

  constructor(initial: string, onChange: (val: string) => void) {
    super();
    this.value = initial;
    this.displayName = '';
    this.onChange = onChange;

    // Resolve display name from initial value
    if (initial) {
      const mgr = AIAssetManager.getInstance();
      if (mgr) {
        const bt = mgr.getBehaviorTree(initial);
        if (bt) this.displayName = bt.name;
      }
    }
  }

  setValue(val: string) {
    this.value = val;
    // Resolve display name
    const mgr = AIAssetManager.getInstance();
    if (mgr && val) {
      const bt = mgr.getBehaviorTree(val);
      this.displayName = bt ? bt.name : '';
    } else {
      this.displayName = '';
    }
    this.onChange(val);
  }

  getOptions(): { id: string; name: string }[] {
    const mgr = AIAssetManager.getInstance();
    if (!mgr) return [];
    return mgr.getAllBehaviorTrees().map(bt => ({ id: bt.id, name: bt.name }));
  }
}
