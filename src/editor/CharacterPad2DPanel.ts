// ============================================================
//  CharacterPad2DPanel — Configuration panel for Character2D
//  Movement, jumping, physics, collider, animation links, input.
//  All fields update the live actor immediately during Play.
// ============================================================

import { defaultCharacterMovement2DProps, type CharacterMovement2DProperties } from '../engine/CharacterMovement2D';

export interface CharacterPad2DConfig {
  movement: CharacterMovement2DProperties;
  collider: {
    shape: 'capsule' | 'box' | 'circle';
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  animationLinks: {
    animBlueprintId: string;
    idle: string;
    run: string;
    jump: string;
    fall: string;
    attack: string;
    die: string;
  };
  inputBindings: {
    moveLeft: string;
    moveRight: string;
    jump: string;
    attack: string;
    crouch: string;
    dash: string;
  };
}

export function defaultCharacterPad2DConfig(): CharacterPad2DConfig {
  return {
    movement: defaultCharacterMovement2DProps(),
    collider: { shape: 'capsule', width: 0.8, height: 1.8, offsetX: 0, offsetY: 0 },
    animationLinks: {
      animBlueprintId: '',
      idle: '', run: '', jump: '', fall: '', attack: '', die: '',
    },
    inputBindings: {
      moveLeft: 'A / ←',
      moveRight: 'D / →',
      jump: 'Space',
      attack: 'J / LClick',
      crouch: 'S / ↓',
      dash: 'Shift',
    },
  };
}

export class CharacterPad2DPanel {
  private _container: HTMLElement;
  private _config: CharacterPad2DConfig;
  private _targetActorName = '';
  private _onChange: ((config: CharacterPad2DConfig) => void) | null = null;

  constructor(container: HTMLElement) {
    this._container = container;
    this._config = defaultCharacterPad2DConfig();
    this._build();
  }

  setConfig(config: CharacterPad2DConfig, actorName?: string): void {
    this._config = config;
    this._targetActorName = actorName ?? '';
    this._build();
  }

  onChange(cb: (config: CharacterPad2DConfig) => void): void {
    this._onChange = cb;
  }

  getConfig(): CharacterPad2DConfig { return this._config; }

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;overflow-y:auto;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `<span style="opacity:0.6">🧑</span><span style="font-weight:600;flex:1">CHARACTER PAD</span><span style="opacity:0.5">${this._targetActorName}</span>`;
    root.appendChild(header);

    const scroll = document.createElement('div');
    scroll.style.cssText = 'flex:1;overflow-y:auto;padding:8px 10px;';

    // MOVEMENT section
    scroll.appendChild(this._sectionHeader('MOVEMENT'));
    const m = this._config.movement;
    scroll.appendChild(this._numRow('Move Speed', m.moveSpeed, 'px/s', v => { m.moveSpeed = v; this._emit(); }));
    scroll.appendChild(this._numRow('Run Speed', m.runSpeed, 'px/s', v => { m.runSpeed = v; this._emit(); }));
    scroll.appendChild(this._numRow('Acceleration', m.acceleration, '', v => { m.acceleration = v; this._emit(); }));
    scroll.appendChild(this._numRow('Deceleration', m.deceleration, '', v => { m.deceleration = v; this._emit(); }));
    scroll.appendChild(this._numRow('Air Control', m.airControl, '(0-1)', v => { m.airControl = v; this._emit(); }, 0.01));

    // JUMPING section
    scroll.appendChild(this._sectionHeader('JUMPING'));
    scroll.appendChild(this._numRow('Jump Force', m.jumpForce, 'px/s', v => { m.jumpForce = v; this._emit(); }));
    scroll.appendChild(this._numRow('Max Jumps', m.maxJumps, '', v => { m.maxJumps = Math.round(v); this._emit(); }, 1));
    scroll.appendChild(this._numRow('Coyote Time', m.coyoteTime, 's', v => { m.coyoteTime = v; this._emit(); }, 0.01));
    scroll.appendChild(this._numRow('Jump Buffer', m.jumpBufferTime, 's', v => { m.jumpBufferTime = v; this._emit(); }, 0.01));
    scroll.appendChild(this._numRow('Max Fall Speed', m.maxFallSpeed, 'px/s', v => { m.maxFallSpeed = v; this._emit(); }));
    scroll.appendChild(this._checkRow('Jump Cut', m.jumpCut, v => { m.jumpCut = v; this._emit(); }));

    // PHYSICS section
    scroll.appendChild(this._sectionHeader('PHYSICS'));
    scroll.appendChild(this._numRow('Gravity Scale', m.gravityScale, '', v => { m.gravityScale = v; this._emit(); }, 0.1));
    scroll.appendChild(this._numRow('Linear Drag', m.linearDrag, '', v => { m.linearDrag = v; this._emit(); }, 0.01));
    scroll.appendChild(this._checkRow('Freeze Rotation', m.freezeRotation, v => { m.freezeRotation = v; this._emit(); }));

    // COLLIDER section
    scroll.appendChild(this._sectionHeader('COLLIDER'));
    const c = this._config.collider;
    const shapeRow = document.createElement('div');
    shapeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    shapeRow.innerHTML = `<span style="width:100px;opacity:0.7">Shape</span>`;
    const shapeSelect = document.createElement('select');
    shapeSelect.style.cssText = 'background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
    for (const s of ['capsule', 'box', 'circle']) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if (s === c.shape) opt.selected = true;
      shapeSelect.appendChild(opt);
    }
    shapeSelect.onchange = () => { c.shape = shapeSelect.value as any; this._emit(); };
    shapeRow.appendChild(shapeSelect);
    scroll.appendChild(shapeRow);
    scroll.appendChild(this._numRow('Width', c.width, 'units', v => { c.width = v; this._emit(); }, 0.1));
    scroll.appendChild(this._numRow('Height', c.height, 'units', v => { c.height = v; this._emit(); }, 0.1));
    scroll.appendChild(this._numRow('Offset X', c.offsetX, '', v => { c.offsetX = v; this._emit(); }, 0.1));
    scroll.appendChild(this._numRow('Offset Y', c.offsetY, '', v => { c.offsetY = v; this._emit(); }, 0.1));

    // ANIMATION LINKS section
    scroll.appendChild(this._sectionHeader('ANIMATION LINKS'));
    const al = this._config.animationLinks;
    scroll.appendChild(this._textRow('Anim Blueprint', al.animBlueprintId, v => { al.animBlueprintId = v; this._emit(); }));
    for (const key of ['idle', 'run', 'jump', 'fall', 'attack', 'die'] as const) {
      scroll.appendChild(this._textRow(key.charAt(0).toUpperCase() + key.slice(1), al[key], v => { (al as any)[key] = v; this._emit(); }));
    }

    // INPUT BINDINGS section
    scroll.appendChild(this._sectionHeader('INPUT BINDINGS'));
    const ib = this._config.inputBindings;
    for (const [key, value] of Object.entries(ib)) {
      const label = key.replace(/([A-Z])/g, ' $1').trim();
      scroll.appendChild(this._textRow(label, value, v => { (ib as any)[key] = v; this._emit(); }));
    }

    // Reset button
    const resetRow = document.createElement('div');
    resetRow.style.cssText = 'padding:10px 0;text-align:center;';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.style.cssText = 'background:#45475a;color:#cdd6f4;border:none;border-radius:4px;padding:5px 12px;cursor:pointer;font-size:12px;';
    resetBtn.onclick = () => { this._config = defaultCharacterPad2DConfig(); this._build(); this._emit(); };
    resetRow.appendChild(resetBtn);
    scroll.appendChild(resetRow);

    root.appendChild(scroll);
  }

  private _sectionHeader(text: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = 'font-weight:700;font-size:11px;color:#89b4fa;padding:8px 0 4px;border-top:1px solid #313244;margin-top:6px;';
    el.textContent = text;
    return el;
  }

  private _numRow(label: string, value: number, suffix: string, onChange: (v: number) => void, step = 1): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'width:110px;opacity:0.7;font-size:11px;';
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.step = String(step);
    input.style.cssText = 'width:70px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
    input.onchange = () => onChange(parseFloat(input.value) || 0);
    row.appendChild(input);

    if (suffix) {
      const sfx = document.createElement('span');
      sfx.textContent = suffix;
      sfx.style.cssText = 'opacity:0.4;font-size:10px;';
      row.appendChild(sfx);
    }
    return row;
  }

  private _checkRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const labelEl = document.createElement('label');
    labelEl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = value;
    cb.onchange = () => onChange(cb.checked);
    labelEl.appendChild(cb);
    labelEl.appendChild(document.createTextNode(label));
    row.appendChild(labelEl);
    return row;
  }

  private _textRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'width:110px;opacity:0.7;font-size:11px;';
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = 'flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:2px 4px;font-size:11px;';
    input.onchange = () => onChange(input.value);
    row.appendChild(input);
    return row;
  }

  private _emit(): void {
    this._onChange?.(this._config);
  }

  dispose(): void {
    this._container.innerHTML = '';
  }
}
