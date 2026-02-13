import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';

export class PropertiesPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _bodyEl!: HTMLElement;
  private _current: GameObject | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._build();
    this._engine.scene.onSelectionChanged((obj) => this._showProperties(obj));
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<span>Properties</span>';
    this.container.appendChild(header);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'panel-body';
    this.container.appendChild(this._bodyEl);

    this._showProperties(null);
  }

  private _showProperties(go: GameObject | null): void {
    this._current = go;
    this._bodyEl.innerHTML = '';

    if (!go) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.textContent = 'Select an object';
      this._bodyEl.appendChild(empty);
      return;
    }

    // Name
    this._bodyEl.appendChild(this._createGroup('Object', [
      this._createTextRow('Name', go.name, (v) => { go.name = v; this._engine.scene['_emitChanged'](); }),
    ]));

    // Transform — Position
    this._bodyEl.appendChild(this._createGroup('Transform', [
      this._createVec3Row('Pos', go.mesh.position),
      this._createVec3Row('Rot', go.mesh.rotation as any, true),
      this._createVec3Row('Scale', go.mesh.scale),
    ]));

    // Physics
    this._bodyEl.appendChild(this._createGroup('Physics', [
      this._createCheckboxRow('Enabled', go.hasPhysics, (v) => {
        if (v) {
          this._engine.physics.addPhysicsBody(go);
        } else {
          this._engine.physics.removePhysicsBody(go);
        }
      }),
    ]));
  }

  private _createGroup(title: string, rows: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'prop-group';

    const titleEl = document.createElement('div');
    titleEl.className = 'prop-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);

    for (const row of rows) {
      group.appendChild(row);
    }

    return group;
  }

  private _createTextRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _createVec3Row(label: string, vec: { x: number; y: number; z: number }, isDegrees = false): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const toDeg = (r: number) => (r * 180) / Math.PI;
    const toRad = (d: number) => (d * Math.PI) / 180;

    for (const axis of ['x', 'y', 'z'] as const) {
      const axisLabel = document.createElement('span');
      axisLabel.className = `prop-xyz-label ${axis}`;
      axisLabel.textContent = axis.toUpperCase();

      const input = document.createElement('input');
      input.type = 'number';
      input.step = isDegrees ? '1' : '0.1';
      input.className = 'prop-input prop-input-sm';
      input.value = isDegrees
        ? toDeg(vec[axis]).toFixed(1)
        : vec[axis].toFixed(2);

      input.addEventListener('change', () => {
        const val = parseFloat(input.value) || 0;
        (vec as any)[axis] = isDegrees ? toRad(val) : val;
      });

      row.appendChild(axisLabel);
      row.appendChild(input);
    }

    return row;
  }

  private _createCheckboxRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'prop-checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  // Refresh current properties (called externally during play to sync positions)
  refresh(): void {
    if (this._current && !this._engine.physics.isPlaying) return;
    if (this._current) {
      this._showProperties(this._current);
    }
  }
}
