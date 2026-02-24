import { ClassicPreset } from 'rete';
import { execSocket, boolSocket, registerNode } from '../sockets';

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
  // Mouse Axes
  'MouseX', 'MouseY',
  // Gamepad Buttons
  'Gamepad_A', 'Gamepad_B', 'Gamepad_X', 'Gamepad_Y',
  'Gamepad_LB', 'Gamepad_RB', 'Gamepad_LT', 'Gamepad_RT',
  'Gamepad_Back', 'Gamepad_Start', 'Gamepad_LS', 'Gamepad_RS',
  'Gamepad_DPadUp', 'Gamepad_DPadDown', 'Gamepad_DPadLeft', 'Gamepad_DPadRight',
  // Gamepad Axes
  'GamepadAxis_LeftStickX', 'GamepadAxis_LeftStickY',
  'GamepadAxis_RightStickX', 'GamepadAxis_RightStickY',
] as const;

/**
 * Custom control that stores a key name string.
 * Rendered as a dropdown with all INPUT_KEYS by the React preset.
 */
export class KeySelectControl extends ClassicPreset.Control {
  public value: string;

  constructor(initial: string = 'Space') {
    super();
    this.value = initial;
  }

  setValue(v: string) {
    this.value = v;
  }
}

/** Returns the input category: 'keyboard', 'mouse', 'wheel', 'gamepad', or 'axis' */
export function inputType(key: string): 'keyboard' | 'mouse' | 'wheel' | 'gamepad' | 'axis' {
  if (key === 'Mouse Left' || key === 'Mouse Right' || key === 'Mouse Middle') return 'mouse';
  if (key === 'Mouse Wheel Up' || key === 'Mouse Wheel Down') return 'wheel';
  if (key === 'MouseX' || key === 'MouseY') return 'axis';
  if (key.startsWith('GamepadAxis_')) return 'axis';
  if (key.startsWith('Gamepad')) return 'gamepad';
  return 'keyboard';
}

/** Maps our friendly key names to the runtime value used for matching.
 *  - Keyboard: KeyboardEvent.key string
 *  - Mouse:    MouseEvent.button number (as string)
 *  - Wheel:    'up' or 'down'
 *  - Gamepad:  The key string itself
 *  - Axis:     The key string itself */
export function keyEventCode(key: string): string {
  if (key === 'MouseX' || key === 'MouseY') return key;
  if (key.startsWith('Gamepad')) return key;
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
    this.addControl('key', new KeySelectControl(key));
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
    this.addControl('key', new KeySelectControl(key));
    this.addOutput('value', new ClassicPreset.Output(boolSocket, 'Is Down'));
  }
}

// We don't register these in NODE_PALETTE because they need the key selector;
// they are added via the context menu's Input category dynamically.
