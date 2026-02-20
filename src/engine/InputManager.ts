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

export class InputManager {
  private _keys = new Set<string>();
  private _mouseDown = new Set<number>();
  private _mousePosition = new Vector2();
  private _mouseDelta = new Vector2();

  private _actionMappings: Map<string, KeyCode[]> = new Map();
  private _axisMappings: Map<string, AxisMapping[]> = new Map();

  // Bound listeners
  private _onKeyDownBound = this._onKeyDown.bind(this);
  private _onKeyUpBound = this._onKeyUp.bind(this);
  private _onMouseDownBound = this._onMouseDown.bind(this);
  private _onMouseUpBound = this._onMouseUp.bind(this);
  private _onMouseMoveBound = this._onMouseMove.bind(this);
  private _onBlurBound = this._onBlur.bind(this);

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
  }

  public unbindEvents(): void {
    window.removeEventListener('keydown', this._onKeyDownBound);
    window.removeEventListener('keyup', this._onKeyUpBound);
    window.removeEventListener('blur', this._onBlurBound);
    window.removeEventListener('mouseup', this._onMouseUpBound);
    document.removeEventListener('mousemove', this._onMouseMoveBound);
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

  public addAction(name: string, keys: KeyCode[]): void {
    this._actionMappings.set(name, keys);
  }

  public addAxis(name: string, key: KeyCode, scale: number): void {
    if (!this._axisMappings.has(name)) {
      this._axisMappings.set(name, []);
    }
    this._axisMappings.get(name)!.push({ name, key, scale });
  }

  public getAction(name: string): boolean {
    const keys = this._actionMappings.get(name);
    if (!keys) return false;
    return keys.some(k => this.isKeyDown(k));
  }

  public getAxis(name: string): number {
    // Special mouse axes
    if (name === 'MouseX') return this._mouseDelta.x; // Delta is per frame
    if (name === 'MouseY') return this._mouseDelta.y;

    const mappings = this._axisMappings.get(name);
    if (!mappings) return 0;

    let value = 0;
    for (const mapping of mappings) {
      if (this.isKeyDown(mapping.key)) {
        value += mapping.scale;
      }
    }
    return value;
  }

  public isKeyDown(code: string): boolean {
    // Map 'Mouse0', 'Mouse1' etc
    if (code.startsWith('MouseButton')) {
      const btn = parseInt(code.replace('MouseButton', ''));
      return this._mouseDown.has(btn);
    }
    return this._keys.has(code);
  }

  /** Call at end of frame to reset per-frame deltas */
  public update(): void {
    this._mouseDelta.set(0, 0);
  }

  // ---- Event Handlers ----

  private _onKeyDown(e: KeyboardEvent): void {
    this._keys.add(e.code);
  }

  private _onKeyUp(e: KeyboardEvent): void {
    this._keys.delete(e.code);
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
}
