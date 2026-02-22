/**
 * PhysicsSettingsPanel
 * ────────────────────
 * World-level physics settings: gravity, timestep, solver iterations,
 * interpolation toggle, debug draw toggle.
 *
 * Registered as a dockview panel tab alongside Properties.
 */
import type { Engine } from '../engine/Engine';
import type { PhysicsSettings } from '../engine/PhysicsWorld';
import { iconHTML, Icons } from './icons';

export class PhysicsSettingsPanel {
  public container: HTMLElement;
  private _engine: Engine;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._build();
  }

  /** Rebuild UI (call when settings change externally) */
  refresh(): void {
    this._build();
  }

  // ─── Build ─────────────────────────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel physics-settings-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'Physics Settings';
    this.container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.overflowY = 'auto';
    body.style.padding = '6px';
    this.container.appendChild(body);

    const s = this._engine.physics.settings;

    // ── Gravity ──────────────────────────────────────
    body.appendChild(this._group('Gravity', [
      this._numberRow('X', s.gravity.x, -100, 100, 0.1, (v) => { s.gravity.x = v; this._applyGravity(); }),
      this._numberRow('Y', s.gravity.y, -100, 100, 0.1, (v) => { s.gravity.y = v; this._applyGravity(); }),
      this._numberRow('Z', s.gravity.z, -100, 100, 0.1, (v) => { s.gravity.z = v; this._applyGravity(); }),
    ]));

    // ── Simulation ───────────────────────────────────
    body.appendChild(this._group('Simulation', [
      this._numberRow('Fixed Timestep', s.fixedTimestep, 0.001, 0.1, 0.001, (v) => { s.fixedTimestep = v; }),
      this._numberRow('Max Sub-steps', s.maxSubsteps, 1, 32, 1, (v) => { s.maxSubsteps = Math.round(v); }),
      this._numberRow('Solver Iterations', s.solverIterations, 1, 32, 1, (v) => { s.solverIterations = Math.round(v); }),
    ]));

    // ── Features ─────────────────────────────────────
    body.appendChild(this._group('Features', [
      this._checkboxRow('Enable Interpolation', s.enableInterpolation, (v) => { s.enableInterpolation = v; }),
      this._checkboxRow('Debug Draw', s.debugDraw, (v) => { s.debugDraw = v; }),
    ]));
  }

  private _applyGravity(): void {
    const s = this._engine.physics.settings;
    this._engine.physics.setWorldGravity({ x: s.gravity.x, y: s.gravity.y, z: s.gravity.z });
  }

  // ─── UI Helpers ────────────────────────────────────────────────

  private _group(title: string, rows: HTMLElement[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'prop-group';
    wrapper.style.marginBottom = '8px';

    const hdr = document.createElement('div');
    hdr.className = 'prop-group-header';
    hdr.style.cursor = 'pointer';
    hdr.style.fontWeight = 'bold';
    hdr.style.fontSize = '11px';
    hdr.style.padding = '4px 0';
    hdr.style.color = '#ccc';
    hdr.style.userSelect = 'none';
    hdr.innerHTML = `${iconHTML(Icons.ChevronDown, 'xs')} ${title}`;

    const content = document.createElement('div');
    content.className = 'prop-group-content';
    content.style.paddingLeft = '4px';
    for (const r of rows) content.appendChild(r);

    let collapsed = false;
    hdr.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : '';
      hdr.innerHTML = `${collapsed ? iconHTML(Icons.ChevronRight, 'xs') : iconHTML(Icons.ChevronDown, 'xs')} ${title}`;
    });

    wrapper.appendChild(hdr);
    wrapper.appendChild(content);
    return wrapper;
  }

  private _numberRow(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '2px 0';
    row.style.fontSize = '11px';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    lbl.style.color = '#aaa';
    lbl.style.flex = '0 0 120px';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.width = '70px';
    input.style.background = '#2a2a2a';
    input.style.border = '1px solid #555';
    input.style.borderRadius = '3px';
    input.style.color = '#ddd';
    input.style.padding = '2px 4px';
    input.style.fontSize = '11px';
    input.addEventListener('change', () => {
      const n = parseFloat(input.value);
      if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    });

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private _checkboxRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '2px 0';
    row.style.fontSize = '11px';

    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    lbl.style.color = '#aaa';
    lbl.style.flex = '0 0 120px';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = value;
    cb.addEventListener('change', () => onChange(cb.checked));

    row.appendChild(lbl);
    row.appendChild(cb);
    return row;
  }
}
