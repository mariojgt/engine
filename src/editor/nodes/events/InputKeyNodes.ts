import { ClassicPreset } from 'rete';
import { execSocket, registerNode } from '../sockets';

// ============================================================
//  Common key list — displayed in the dropdown
// ============================================================
export const INPUT_KEYS = [
  // Letters
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  // Digits
  '0','1','2','3','4','5','6','7','8','9',
  // Arrows
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  // Common
  'Space','Enter','Escape','Shift','Control','Alt','Tab',
  'Backspace','CapsLock',
  // Function keys
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  // Mouse buttons
  'Mouse Left','Mouse Right','Mouse Middle',
  // Mouse wheel
  'Mouse Wheel Up','Mouse Wheel Down',
] as const;

/** Returns the input category: 'keyboard', 'mouse', or 'wheel' */
export function inputType(key: string): 'keyboard' | 'mouse' | 'wheel' {
  if (key === 'Mouse Left' || key === 'Mouse Right' || key === 'Mouse Middle') return 'mouse';
  if (key === 'Mouse Wheel Up' || key === 'Mouse Wheel Down') return 'wheel';
  return 'keyboard';
}

/** Maps our friendly key names to the runtime value used for matching.
 *  - Keyboard: KeyboardEvent.key string
 *  - Mouse:    MouseEvent.button number (as string)
 *  - Wheel:    'up' or 'down' */
export function keyEventCode(key: string): string {
  if (key === 'Space') return ' ';
  if (key === 'Shift') return 'Shift';
  if (key === 'Control') return 'Control';
  if (key === 'Alt') return 'Alt';
  // Mouse buttons → MouseEvent.button number
  if (key === 'Mouse Left') return '0';
  if (key === 'Mouse Right') return '2';
  if (key === 'Mouse Middle') return '1';
  // Mouse wheel direction
  if (key === 'Mouse Wheel Up') return 'up';
  if (key === 'Mouse Wheel Down') return 'down';
  // Single letters: KeyboardEvent.key is lowercase
  if (key.length === 1 && key >= 'A' && key <= 'Z') return key.toLowerCase();
  return key;
}

// ============================================================
//  Input Key Event Node
//  UE-style: select a key, get Pressed/Released exec outputs.
//  Placed in the Event Graph like BeginPlay/Tick.
// ============================================================
export class InputKeyEventNode extends ClassicPreset.Node {
  public selectedKey: string;

  constructor(key: string = 'Space') {
    super('Input Key Event');
    this.selectedKey = key;
    this.addOutput('pressed', new ClassicPreset.Output(execSocket, 'Pressed'));
    this.addOutput('released', new ClassicPreset.Output(execSocket, 'Released'));
  }
}

// ============================================================
//  Is Key Down Node (pure data — use in Tick to poll key state)
// ============================================================
export class IsKeyDownNode extends ClassicPreset.Node {
  public selectedKey: string;

  constructor(key: string = 'Space') {
    super('Is Key Down');
    this.selectedKey = key;
    const boolSocket = new ClassicPreset.Socket('Boolean');
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Is Down'));
  }
}

// We don't register these in NODE_PALETTE because they need the key selector;
// they are added via the context menu's Input category dynamically.
