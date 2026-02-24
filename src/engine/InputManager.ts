import { Vector2 } from 'three';

export type KeyCode = string;

export interface ActionMapping {
  name: string;
  keys: KeyCode[];
}

export interface AxisMapping {
  name: string;
  key: KeyCode;
  scale: number;
}

// ── Gamepad Constants ───────────────────────────────────────
// Standard Gamepad API button indices (Xbox layout names)
export const GAMEPAD_BUTTONS = {
  A: 0,        // Cross (PS) / A (Xbox)
  B: 1,        // Circle (PS) / B (Xbox)
  X: 2,        // Square (PS) / X (Xbox)
  Y: 3,        // Triangle (PS) / Y (Xbox)
  LB: 4,       // L1 / Left Bumper
  RB: 5,       // R1 / Right Bumper
  LT: 6,       // L2 / Left Trigger
  RT: 7,       // R2 / Right Trigger
  Back: 8,     // Select / Back / Share
  Start: 9,    // Start / Options
  LS: 10,      // Left Stick Press
  RS: 11,      // Right Stick Press
  DPadUp: 12,
  DPadDown: 13,
  DPadLeft: 14,
  DPadRight: 15,
} as const;

// Standard Gamepad API axis indices
export const GAMEPAD_AXES = {
  LeftStickX: 0,
  LeftStickY: 1,
  RightStickX: 2,
  RightStickY: 3,
} as const;

export class InputManager {
  private _keys = new Set<string>();
  private _prevKeys = new Set<string>();
  private _mouseDown = new Set<number>();
  private _prevMouseDown = new Set<number>();
  private _mousePosition = new Vector2();
  private _mouseDelta = new Vector2();

  private _actionMappings: Map<string, KeyCode[]> = new Map();
  private _axisMappings: Map<string, AxisMapping[]> = new Map();

  // ── Gamepad State ───────────────────────────────────────
  /** Deadzone threshold for sticks (values below this are treated as 0) */
  public gamepadDeadzone = 0.15;
  /** Currently connected gamepad indices */
  private _connectedGamepads = new Set<number>();
  /** Button "pressed last frame" state for just-pressed detection */
  private _prevGamepadButtons: Map<number, boolean[]> = new Map();
  /** Current-frame raw axis values per gamepad */
  private _gamepadAxes: Map<number, number[]> = new Map();
  /** Current-frame button pressed state per gamepad */
  private _gamepadButtons: Map<number, boolean[]> = new Map();

  // Bound listeners
  private _onKeyDownBound = this._onKeyDown.bind(this);
  private _onKeyUpBound = this._onKeyUp.bind(this);
  private _onMouseDownBound = this._onMouseDown.bind(this);
  private _onMouseUpBound = this._onMouseUp.bind(this);
  private _onMouseMoveBound = this._onMouseMove.bind(this);
  private _onBlurBound = this._onBlur.bind(this);
  private _onGamepadConnectedBound = this._onGamepadConnected.bind(this);
  private _onGamepadDisconnectedBound = this._onGamepadDisconnected.bind(this);

  constructor(canvas?: HTMLCanvasElement) {
    if (canvas) this.bindEvents(canvas);
    this._setupDefaultMappings();
  }

  public bindEvents(canvas?: HTMLCanvasElement): void {
    window.addEventListener('keydown', this._onKeyDownBound);
    window.addEventListener('keyup', this._onKeyUpBound);
    window.addEventListener('blur', this._onBlurBound);
    
    const target = canvas || window;
    target.addEventListener('mousedown', this._onMouseDownBound as any);
    window.addEventListener('mouseup', this._onMouseUpBound);
    document.addEventListener('mousemove', this._onMouseMoveBound);

    // Gamepad connect/disconnect
    window.addEventListener('gamepadconnected', this._onGamepadConnectedBound as any);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnectedBound as any);
  }

  public unbindEvents(): void {
    window.removeEventListener('keydown', this._onKeyDownBound);
    window.removeEventListener('keyup', this._onKeyUpBound);
    window.removeEventListener('blur', this._onBlurBound);
    window.removeEventListener('mouseup', this._onMouseUpBound);
    document.removeEventListener('mousemove', this._onMouseMoveBound);
    window.removeEventListener('gamepadconnected', this._onGamepadConnectedBound as any);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnectedBound as any);
    // Note: mousedown is tricky if canvas ref is lost, but usually fine
  }

  private _setupDefaultMappings(): void {
    // Standard WASD + Space + Shift
    this.addAxis('MoveForward', 'KeyW', 1.0);
    this.addAxis('MoveForward', 'KeyS', -1.0);
    this.addAxis('MoveForward', 'ArrowUp', 1.0);
    this.addAxis('MoveForward', 'ArrowDown', -1.0);

    this.addAxis('MoveRight', 'KeyD', 1.0);
    this.addAxis('MoveRight', 'KeyA', -1.0);
    this.addAxis('MoveRight', 'ArrowRight', 1.0);
    this.addAxis('MoveRight', 'ArrowLeft', -1.0);

    this.addAxis('Turn', 'MouseX', -1.0);
    this.addAxis('LookUp', 'MouseY', -1.0);

    this.addAction('Jump', ['Space']);
    this.addAction('Crouch', ['ControlLeft', 'ControlRight', 'KeyC']);
    this.addAction('Run', ['ShiftLeft', 'ShiftRight']);
  }

  public loadMappings(
    actionMappings: { name: string; keys: string[] }[],
    axisMappings: { name: string; key: string; scale: number }[]
  ): void {
    this._actionMappings.clear();
    this._axisMappings.clear();

    for (const action of actionMappings) {
      this.addAction(action.name, action.keys);
    }

    for (const axis of axisMappings) {
      this.addAxis(axis.name, axis.key, axis.scale);
    }
  }

  public addAction(name: string, keys: KeyCode[]): void {
    this._actionMappings.set(name, keys);
  }

  public getActionKeys(name: string): KeyCode[] {
    return this._actionMappings.get(name) || [];
  }

  public removeAction(name: string): void {
    this._actionMappings.delete(name);
  }

  public addAxis(name: string, key: KeyCode, scale: number): void {
    if (!this._axisMappings.has(name)) {
      this._axisMappings.set(name, []);
    }
    this._axisMappings.get(name)!.push({ name, key, scale });
  }

  public getAxisMappings(name: string): AxisMapping[] {
    return this._axisMappings.get(name) || [];
  }

  public removeAxis(name: string): void {
    this._axisMappings.delete(name);
  }

  public clearAllMappings(): void {
    this._actionMappings.clear();
    this._axisMappings.clear();
  }

  public getAction(name: string): boolean {
    const keys = this._actionMappings.get(name);
    if (!keys) return false;
    return keys.some(k => this.isKeyDown(k));
  }

  public isActionJustPressed(name: string): boolean {
    const keys = this._actionMappings.get(name);
    if (!keys) return false;
    return keys.some(k => this.isKeyJustPressed(k));
  }

  public isActionJustReleased(name: string): boolean {
    const keys = this._actionMappings.get(name);
    if (!keys) return false;
    return keys.some(k => this.isKeyJustReleased(k));
  }

  public getAxis(name: string): number {
    // Special mouse axes
    if (name === 'MouseX') return this._mouseDelta.x; // Delta is per frame
    if (name === 'MouseY') return this._mouseDelta.y;

    const mappings = this._axisMappings.get(name);
    if (!mappings) return 0;

    let value = 0;
    for (const mapping of mappings) {
      if (mapping.key === 'MouseX') {
        value += this._mouseDelta.x * mapping.scale;
      } else if (mapping.key === 'MouseY') {
        value += this._mouseDelta.y * mapping.scale;
      } else if (mapping.key.startsWith('GamepadAxis_')) {
        const axisName = mapping.key.replace('GamepadAxis_', '');
        const axisIndex = (GAMEPAD_AXES as any)[axisName];
        if (axisIndex !== undefined) {
          value += this.getGamepadAxis(axisIndex) * mapping.scale;
        }
      } else if (this.isKeyDown(mapping.key)) {
        value += mapping.scale;
      }
    }
    return value;
  }

  private _mapKey(code: string): string {
    if (code === 'Space') return ' ';
    if (code.length === 1 && code >= 'A' && code <= 'Z') return code.toLowerCase();
    return code;
  }

  public isKeyDown(code: string): boolean {
    if (code.startsWith('Gamepad_')) {
      const btnName = code.replace('Gamepad_', '');
      const btnIndex = (GAMEPAD_BUTTONS as any)[btnName];
      if (btnIndex !== undefined) return this.isGamepadButtonDown(btnIndex);
      return false;
    }
    if (code === 'Mouse Left') return this._mouseDown.has(0);
    if (code === 'Mouse Middle') return this._mouseDown.has(1);
    if (code === 'Mouse Right') return this._mouseDown.has(2);
    // Map 'Mouse0', 'Mouse1' etc
    if (code.startsWith('MouseButton')) {
      const btn = parseInt(code.replace('MouseButton', ''));
      return this._mouseDown.has(btn);
    }
    return this._keys.has(this._mapKey(code)) || this._keys.has(code);
  }

  public isKeyJustPressed(code: string): boolean {
    if (code.startsWith('Gamepad_')) {
      const btnName = code.replace('Gamepad_', '');
      const btnIndex = (GAMEPAD_BUTTONS as any)[btnName];
      if (btnIndex !== undefined) return this.isGamepadButtonJustPressed(btnIndex);
      return false;
    }
    if (code === 'Mouse Left') return this._mouseDown.has(0) && !this._prevMouseDown.has(0);
    if (code === 'Mouse Middle') return this._mouseDown.has(1) && !this._prevMouseDown.has(1);
    if (code === 'Mouse Right') return this._mouseDown.has(2) && !this._prevMouseDown.has(2);
    if (code.startsWith('MouseButton')) {
      const btn = parseInt(code.replace('MouseButton', ''));
      return this._mouseDown.has(btn) && !this._prevMouseDown.has(btn);
    }
    const mapped = this._mapKey(code);
    return (this._keys.has(mapped) && !this._prevKeys.has(mapped)) || (this._keys.has(code) && !this._prevKeys.has(code));
  }

  public isKeyJustReleased(code: string): boolean {
    if (code.startsWith('Gamepad_')) {
      const btnName = code.replace('Gamepad_', '');
      const btnIndex = (GAMEPAD_BUTTONS as any)[btnName];
      if (btnIndex !== undefined) return this.isGamepadButtonJustReleased(btnIndex);
      return false;
    }
    if (code === 'Mouse Left') return !this._mouseDown.has(0) && this._prevMouseDown.has(0);
    if (code === 'Mouse Middle') return !this._mouseDown.has(1) && this._prevMouseDown.has(1);
    if (code === 'Mouse Right') return !this._mouseDown.has(2) && this._prevMouseDown.has(2);
    if (code.startsWith('MouseButton')) {
      const btn = parseInt(code.replace('MouseButton', ''));
      return !this._mouseDown.has(btn) && this._prevMouseDown.has(btn);
    }
    const mapped = this._mapKey(code);
    return (!this._keys.has(mapped) && this._prevKeys.has(mapped)) || (!this._keys.has(code) && this._prevKeys.has(code));
  }

  /** Call at end of frame to reset per-frame deltas and poll gamepads */
  public update(): void {
    this._prevKeys = new Set(this._keys);
    this._prevMouseDown = new Set(this._mouseDown);
    this._mouseDelta.set(0, 0);
    this._pollGamepads();
  }

  // ── Gamepad Queries ───────────────────────────────────────

  /** Returns true if any gamepad is connected */
  public isGamepadConnected(index = 0): boolean {
    return this._connectedGamepads.has(index);
  }

  /** Get a raw gamepad axis value (after deadzone), index = gamepad index */
  public getGamepadAxis(axisIndex: number, gamepadIndex = 0): number {
    const axes = this._gamepadAxes.get(gamepadIndex);
    if (!axes || axisIndex >= axes.length) return 0;
    const raw = axes[axisIndex];
    return Math.abs(raw) < this.gamepadDeadzone ? 0 : raw;
  }

  /** Returns true while a gamepad button is held down */
  public isGamepadButtonDown(buttonIndex: number, gamepadIndex = 0): boolean {
    const buttons = this._gamepadButtons.get(gamepadIndex);
    if (!buttons || buttonIndex >= buttons.length) return false;
    return buttons[buttonIndex];
  }

  /** Returns true only on the frame the button was first pressed */
  public isGamepadButtonJustPressed(buttonIndex: number, gamepadIndex = 0): boolean {
    const curr = this._gamepadButtons.get(gamepadIndex);
    const prev = this._prevGamepadButtons.get(gamepadIndex);
    if (!curr || buttonIndex >= curr.length) return false;
    const wasDown = prev ? (buttonIndex < prev.length ? prev[buttonIndex] : false) : false;
    return curr[buttonIndex] && !wasDown;
  }

  /** Returns true only on the frame the button was released */
  public isGamepadButtonJustReleased(buttonIndex: number, gamepadIndex = 0): boolean {
    const curr = this._gamepadButtons.get(gamepadIndex);
    const prev = this._prevGamepadButtons.get(gamepadIndex);
    if (!prev || buttonIndex >= prev.length) return false;
    const isDown = curr ? (buttonIndex < curr.length ? curr[buttonIndex] : false) : false;
    return prev[buttonIndex] && !isDown;
  }

  /** Vibrate / rumble the gamepad (if supported) */
  public setGamepadVibration(
    weakMagnitude: number,
    strongMagnitude: number,
    durationMs: number,
    gamepadIndex = 0,
  ): void {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[gamepadIndex];
    if (!gp) return;
    const actuator = (gp as any).vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: Math.max(0, Math.min(weakMagnitude, 1)),
        strongMagnitude: Math.max(0, Math.min(strongMagnitude, 1)),
      }).catch(() => { /* vibration not supported */ });
    }
  }

  /** Poll all connected gamepads and snapshot their state */
  private _pollGamepads(): void {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;
      this._connectedGamepads.add(gp.index);

      // Save previous frame buttons for just-pressed detection
      const prevButtons = this._gamepadButtons.get(gp.index);
      if (prevButtons) {
        this._prevGamepadButtons.set(gp.index, [...prevButtons]);
      }

      // Snapshot axes
      const axes: number[] = [];
      for (let a = 0; a < gp.axes.length; a++) axes.push(gp.axes[a]);
      this._gamepadAxes.set(gp.index, axes);

      // Snapshot buttons
      const buttons: boolean[] = [];
      for (let b = 0; b < gp.buttons.length; b++) buttons.push(gp.buttons[b].pressed);
      this._gamepadButtons.set(gp.index, buttons);
    }
  }

  // ---- Event Handlers ----

  private _onKeyDown(e: KeyboardEvent): void {
    this._keys.add(e.code);
    this._keys.add(e.key.toLowerCase());
    this._keys.add(e.key);
  }

  private _onKeyUp(e: KeyboardEvent): void {
    this._keys.delete(e.code);
    this._keys.delete(e.key.toLowerCase());
    this._keys.delete(e.key);
  }

  private _onMouseDown(e: MouseEvent): void {
    this._mouseDown.add(e.button);
  }

  private _onMouseUp(e: MouseEvent): void {
    this._mouseDown.delete(e.button);
  }

  private _onMouseMove(e: MouseEvent): void {
    this._mousePosition.set(e.clientX, e.clientY);
    this._mouseDelta.x += e.movementX;
    this._mouseDelta.y += e.movementY;
  }

  private _onBlur(): void {
    this._keys.clear();
    this._mouseDown.clear();
    this._mouseDelta.set(0, 0);
  }

  private _onGamepadConnected(e: GamepadEvent): void {
    this._connectedGamepads.add(e.gamepad.index);
    console.log(`[InputManager] Gamepad connected: "${e.gamepad.id}" (index ${e.gamepad.index})`);
  }

  private _onGamepadDisconnected(e: GamepadEvent): void {
    this._connectedGamepads.delete(e.gamepad.index);
    this._gamepadAxes.delete(e.gamepad.index);
    this._gamepadButtons.delete(e.gamepad.index);
    this._prevGamepadButtons.delete(e.gamepad.index);
    console.log(`[InputManager] Gamepad disconnected: "${e.gamepad.id}" (index ${e.gamepad.index})`);
  }
}
