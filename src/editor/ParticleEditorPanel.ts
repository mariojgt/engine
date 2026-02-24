
import * as THREE from 'three';
import { ParticleEmitter } from '../engine/ParticleSystem';
import type { Engine } from '../engine/Engine';
import type { GameObject } from '../engine/GameObject';
import { iconHTML, Icons } from './icons';

export class ParticleEditorPanel {
  public container: HTMLElement;
  private _engine: Engine;
  private _bodyEl!: HTMLElement;
  private _currentEmitter: ParticleEmitter | null = null;
  private _currentObject: GameObject | null = null;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this._engine = engine;
    this._build();

    // Listen to selection
    // Note: The PropertyPanel uses internal engine event listener access, assuming it's exposed similarly
    // If not, we might need to hook differently. Assuming `engine.scene.onSelectionChanged` exists as per PropertiesPanel usage.
    if ((this._engine.scene as any).onSelectionChanged) {
        (this._engine.scene as any).onSelectionChanged((obj: GameObject | null) => {
            if (obj) {
                this._currentObject = obj;
                const emitter = obj.getComponent(ParticleEmitter);
                if (emitter) {
                    this._currentEmitter = emitter;
                    this._refreshUI();
                } else {
                    this._currentEmitter = null;
                    this._showPlaceholder("Selected object has no Particle Emitter");
                    
                    // Offer to add one
                    const btn = document.createElement('button');
                    btn.textContent = "Add Particle Emitter";
                    btn.style.marginTop = "10px";
                    btn.onclick = () => {
                        obj.addComponent(new ParticleEmitter());
                        this._currentEmitter = obj.getComponent(ParticleEmitter);
                        this._refreshUI();
                    };
                    this._bodyEl.appendChild(btn);
                }
            } else {
                this._currentObject = null;
                this._currentEmitter = null;
                this._showPlaceholder("Select an object to edit particles");
            }
        });
    }
  }

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel particle-editor-panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `${iconHTML(Icons.Play, 'sm')} VFX Editor`; // Using closest icon
    this.container.appendChild(header);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'panel-body';
    this._bodyEl.style.padding = '10px';
    this._bodyEl.style.overflowY = 'auto';
    this.container.appendChild(this._bodyEl);

    this._showPlaceholder("Select an object to edit particles");
  }

  private _showPlaceholder(msg: string) {
    this._bodyEl.innerHTML = '';
    const div = document.createElement('div');
    div.style.color = '#888';
    div.style.textAlign = 'center';
    div.style.marginTop = '20px';
    div.textContent = msg;
    this._bodyEl.appendChild(div);
  }

  private _refreshUI() {
    if (!this._currentEmitter) return;
    const settings = this._currentEmitter.settings;
    this._bodyEl.innerHTML = '';

    // ── Header ── 
    const title = document.createElement('h3');
    title.textContent = `Particle System (${this._currentObject?.name})`;
    title.style.marginTop = '0';
    title.style.fontSize = '12px';
    title.style.borderBottom = '1px solid #444';
    title.style.paddingBottom = '5px';
    this._bodyEl.appendChild(title);

    // ── Playback Controls (Mock) ──
    const playbackDiv = document.createElement('div');
    playbackDiv.style.display = 'flex';
    playbackDiv.style.gap = '5px';
    playbackDiv.style.marginBottom = '10px';
    
    const restartBtn = document.createElement('button');
    restartBtn.textContent = "Restart";
    restartBtn.onclick = () => {
        // Implement reset if ParticleSystem exposed it
        // For now, toggle enabled
        if (this._currentEmitter) {
            this._currentEmitter.enabled = false;
            setTimeout(() => { 
                if(this._currentEmitter) this._currentEmitter.enabled = true; 
            }, 10);
        }
    };
    playbackDiv.appendChild(restartBtn);
    this._bodyEl.appendChild(playbackDiv);

    // ── Properties ──

    // Emission
    this._addSection("Emission", [
        this._createNumberInput("Rate (per sec)", settings.emissionRate, (v) => settings.emissionRate = v),
        this._createNumberInput("Max Particles", settings.maxParticles, (v) => settings.maxParticles = v),
    ]);

    // Lifetime
    this._addSection("Lifetime", [
        this._createNumberInput("Start Lifetime", settings.startLifetime, (v) => settings.startLifetime = v),
        this._createNumberInput("Variance", settings.lifetimeVariance, (v) => settings.lifetimeVariance = v),
    ]);

    // Speed
    this._addSection("Speed", [
        this._createNumberInput("Start Speed", settings.startSpeed, (v) => settings.startSpeed = v),
        this._createNumberInput("Variance", settings.speedVariance, (v) => settings.speedVariance = v),
        this._createNumberInput("Drag", settings.drag, (v) => settings.drag = v),
    ]);

    // Size
    this._addSection("Size", [
        this._createNumberInput("Start Size", settings.startSize, (v) => settings.startSize = v),
        this._createNumberInput("End Size", settings.endSize, (v) => settings.endSize = v),
        this._createNumberInput("Variance", settings.sizeVariance, (v) => settings.sizeVariance = v),
    ]);

    // Shape
    this._addSection("Shape", [
        this._createSelectInput("Shape", ['sphere', 'box', 'cone'], settings.shape, (v) => settings.shape = v as any),
        this._createNumberInput("Radius", settings.shapeRadius, (v) => settings.shapeRadius = v),
        this._createNumberInput("Angle (Cone)", settings.shapeAngle, (v) => settings.shapeAngle = v),
    ]);

    // Colors (Simple Hex Inputs for now)
    this._addSection("Color", [
         this._createColorInput("Start Color", settings.startColor.getHexString(), (hex) => settings.startColor.setHex(parseInt(hex, 16))),
         this._createColorInput("End Color", settings.endColor.getHexString(), (hex) => settings.endColor.setHex(parseInt(hex, 16))),
    ]);
    
    // Physics (Gravity)
    this._addSection("Gravity", [
        this._createVector3Input("Gravity", settings.gravity, (v) => settings.gravity.copy(v)),
    ]);
  }

  private _addSection(title: string, rows: HTMLElement[]) {
      const group = document.createElement('details');
      group.open = true;
      group.style.marginBottom = '10px';
      group.style.border = '1px solid #333';
      group.style.padding = '5px';

      const summary = document.createElement('summary');
      summary.textContent = title;
      summary.style.cursor = 'pointer';
      summary.style.fontWeight = 'bold';
      summary.style.fontSize = '11px';
      group.appendChild(summary);

      const content = document.createElement('div');
      content.style.marginTop = '5px';
      content.style.paddingLeft = '5px';
      rows.forEach(r => content.appendChild(r));
      group.appendChild(content);

      this._bodyEl.appendChild(group);
  }

  private _createNumberInput(label: string, value: number, onChange: (val: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '4px';
    row.style.fontSize = '11px';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.step = '0.1';
    input.style.width = '60px';
    input.style.background = '#222';
    input.style.color = '#fff';
    input.style.border = '1px solid #444';
    
    input.onchange = (e) => onChange(parseFloat((e.target as HTMLInputElement).value));
    row.appendChild(input);

    return row;
  }

  private _createSelectInput(label: string, options: string[], value: string, onChange: (val: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '4px';
    row.style.fontSize = '11px';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);

    const select = document.createElement('select');
    select.style.width = '80px';
    select.style.background = '#222';
    select.style.color = '#fff';
    
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === value) o.selected = true;
        select.appendChild(o);
    });

    select.onchange = (e) => onChange((e.target as HTMLSelectElement).value);
    row.appendChild(select);

    return row;
  }
  
  private _createColorInput(label: string, hexValue: string, onChange: (hex: string) => void): HTMLElement {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.marginBottom = '4px';
      row.style.fontSize = '11px';

      const lbl = document.createElement('label');
      lbl.textContent = label;
      row.appendChild(lbl);
      
      const input = document.createElement('input');
      input.type = 'color';
      input.value = '#' + hexValue;
      input.onchange = (e) => {
          const val = (e.target as HTMLInputElement).value;
          onChange(val.substring(1)); // strip #
      };
      row.appendChild(input);
      
      return row;
  }

    private _createVector3Input(label: string, value: THREE.Vector3, onChange: (val: THREE.Vector3) => void): HTMLElement {
      const row = document.createElement('div');
      row.style.marginBottom = '6px';
      
      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.fontSize = '11px';
      lbl.style.marginBottom = '2px';
      row.appendChild(lbl);
      
      const inputsDiv = document.createElement('div');
      inputsDiv.style.display = 'flex';
      inputsDiv.style.gap = '2px';
      
      const createComp = (axis: string, val: number, setter: (v: number) => void) => {
          const w = document.createElement('div');
          w.style.display = 'flex';
          w.style.alignItems = 'center';
          const l = document.createElement('span');
          l.textContent = axis;
          l.style.fontSize = '10px';
          l.style.width = '10px';
          l.style.color = axis === 'X' ? '#f55' : axis === 'Y' ? '#5f5' : '#55f';
          
          const i = document.createElement('input');
          i.type = 'number';
          i.step = '0.1';
          i.value = val.toString();
          i.style.width = '40px';
          i.style.fontSize = '10px';
          i.style.background = '#222';
          i.style.color = '#fff';
          i.style.border = 'none';
          i.onchange = (e) => {
              setter(parseFloat((e.target as HTMLInputElement).value));
              onChange(value); // trigger update
          };
          w.appendChild(l);
          w.appendChild(i);
          return w;
      };
      
      inputsDiv.appendChild(createComp('X', value.x, (v) => value.x = v));
      inputsDiv.appendChild(createComp('Y', value.y, (v) => value.y = v));
      inputsDiv.appendChild(createComp('Z', value.z, (v) => value.z = v));
      row.appendChild(inputsDiv);
      
      return row;
  }
}
