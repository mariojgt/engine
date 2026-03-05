// ============================================================
//  SpriteMakerPanel — AI-powered pixel art sprite generator
//  Uses OpenAI gpt-image-1 model to create pixel-perfect sprites
//  optimized for 2D game development.
//
//  The user describes a character/object, picks a style preset,
//  selects which animation poses to generate (idle, walk, attack…),
//  and the panel calls OpenAI's image generation API through the
//  Rust HTTP proxy to produce each frame, then saves them to the
//  project's Textures folder and optionally registers them in the
//  Texture Library.
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import { iconHTML, Icons, ICON_COLORS } from './icons';
import type { ProjectManager } from './ProjectManager';
import type { TextureLibrary, TextureAssetData } from './TextureLibrary';

// ---- Types ----

export interface SpritePromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'character' | 'enemy' | 'item' | 'tileset' | 'ui' | 'effect';
  basePrompt: string;
  /** Animation poses this template supports */
  poses: SpritePose[];
  /** Default canvas size */
  defaultSize: { w: number; h: number };
}

export interface SpritePose {
  id: string;
  name: string;
  /** Extra prompt snippet appended for this specific pose */
  promptSuffix: string;
}

interface GenerationResult {
  poseId: string;
  poseName: string;
  dataUrl: string;
  saved: boolean;
  fileName?: string;
}

// ---- Prompt Templates ----

const STYLE_PRESETS: { id: string; name: string; prompt: string }[] = [
  {
    id: 'pixel-16',
    name: '16×16 Pixel Art',
    prompt: '16x16 pixel art sprite, limited color palette, clean pixel edges, no anti-aliasing, retro game style',
  },
  {
    id: 'pixel-32',
    name: '32×32 Pixel Art',
    prompt: '32x32 pixel art sprite, limited color palette, clean pixel edges, no anti-aliasing, retro game style',
  },
  {
    id: 'pixel-64',
    name: '64×64 Pixel Art',
    prompt: '64x64 pixel art sprite, detailed pixel art, clean pixel edges, no anti-aliasing, game asset',
  },
  {
    id: 'pixel-128',
    name: '128×128 Detailed',
    prompt: '128x128 pixel art sprite, high detail pixel art, clean pixel edges, rich shading, game asset',
  },
  {
    id: 'hd-sprite',
    name: 'HD Sprite (256px)',
    prompt: '256x256 game sprite, hand-painted style, clean outlines, transparent background, game asset',
  },
];

const PROMPT_TEMPLATES: SpritePromptTemplate[] = [
  // ── Top-Down Characters ──────────────────────────────────────
  {
    id: 'topdown-character',
    name: 'Top-Down Character',
    description: 'RPG/adventure character viewed from above',
    category: 'character',
    basePrompt: 'top-down view character sprite, facing south, centered on canvas, transparent background',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'idle', name: 'Idle', promptSuffix: 'standing idle pose, relaxed stance' },
      { id: 'walk-down', name: 'Walk Down', promptSuffix: 'walking animation frame facing south, mid-stride' },
      { id: 'walk-up', name: 'Walk Up', promptSuffix: 'walking animation frame facing north, mid-stride, seen from behind' },
      { id: 'walk-left', name: 'Walk Left', promptSuffix: 'walking animation frame facing left, side view, mid-stride' },
      { id: 'walk-right', name: 'Walk Right', promptSuffix: 'walking animation frame facing right, side view, mid-stride' },
      { id: 'attack', name: 'Attack', promptSuffix: 'attack action pose, swinging weapon, dynamic motion' },
      { id: 'cast', name: 'Cast Spell', promptSuffix: 'casting magic spell pose, hands raised with magical energy' },
      { id: 'hurt', name: 'Hurt', promptSuffix: 'taking damage pose, flinching, knocked back slightly' },
      { id: 'death', name: 'Death', promptSuffix: 'defeated pose, lying on the ground, collapsed' },
    ],
  },
  // ── Side-Scroller Characters ─────────────────────────────────
  {
    id: 'sidescroll-character',
    name: 'Side-Scroller Character',
    description: 'Platformer character viewed from the side',
    category: 'character',
    basePrompt: 'side-view character sprite, facing right, centered on canvas, transparent background',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'idle', name: 'Idle', promptSuffix: 'standing idle pose, facing right' },
      { id: 'run-1', name: 'Run Frame 1', promptSuffix: 'running animation frame 1, right leg forward' },
      { id: 'run-2', name: 'Run Frame 2', promptSuffix: 'running animation frame 2, left leg forward' },
      { id: 'jump', name: 'Jump', promptSuffix: 'jumping in the air, knees slightly bent, arms up' },
      { id: 'fall', name: 'Fall', promptSuffix: 'falling through the air, arms slightly spread' },
      { id: 'attack', name: 'Attack', promptSuffix: 'melee attack pose, slashing forward' },
      { id: 'crouch', name: 'Crouch', promptSuffix: 'crouching down, ducking pose' },
      { id: 'hurt', name: 'Hurt', promptSuffix: 'taking damage, knocked backwards' },
      { id: 'death', name: 'Death', promptSuffix: 'defeated, collapsed on the ground' },
    ],
  },
  // ── Enemies / Monsters ───────────────────────────────────────
  {
    id: 'enemy-creature',
    name: 'Enemy Creature',
    description: 'Monster, beast, or enemy NPC',
    category: 'enemy',
    basePrompt: 'game enemy sprite, menacing creature, centered on canvas, transparent background',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'idle', name: 'Idle', promptSuffix: 'idle stance, alert and ready' },
      { id: 'move', name: 'Move', promptSuffix: 'moving forward, mid-stride animation frame' },
      { id: 'attack', name: 'Attack', promptSuffix: 'attacking aggressively, lunging or striking' },
      { id: 'hurt', name: 'Hurt', promptSuffix: 'recoiling from damage, flinching' },
      { id: 'death', name: 'Death', promptSuffix: 'defeated, collapsing or dissolving' },
    ],
  },
  // ── Items & Pickups ──────────────────────────────────────────
  {
    id: 'item-pickup',
    name: 'Item / Pickup',
    description: 'Collectible items, weapons, potions, treasure',
    category: 'item',
    basePrompt: 'game item sprite, single object, centered on canvas, transparent background, clean silhouette',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'default', name: 'Default', promptSuffix: 'standard view, detailed and recognizable' },
      { id: 'glow', name: 'Glowing', promptSuffix: 'glowing with magical aura, subtle particles around it' },
      { id: 'outline', name: 'Outlined', promptSuffix: 'with a bright outline highlight, pickup indicator' },
    ],
  },
  // ── Tilesets ─────────────────────────────────────────────────
  {
    id: 'tileset-terrain',
    name: 'Terrain Tile',
    description: 'Seamless terrain tiles for tilemaps (grass, stone, water…)',
    category: 'tileset',
    basePrompt: 'seamless tileable game tile, top-down view, fills the entire square canvas, no border gaps',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'base', name: 'Base Tile', promptSuffix: 'main terrain texture, uniform and seamless' },
      { id: 'variation', name: 'Variation', promptSuffix: 'slight variation of the base terrain, subtle differences' },
      { id: 'edge', name: 'Edge Transition', promptSuffix: 'edge transition tile, fading to transparent on one side' },
    ],
  },
  // ── UI Elements ──────────────────────────────────────────────
  {
    id: 'ui-element',
    name: 'UI Element',
    description: 'Buttons, frames, icons for game HUD',
    category: 'ui',
    basePrompt: 'game UI element sprite, clean design, transparent background, suitable for HUD overlay',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'normal', name: 'Normal', promptSuffix: 'default state, standard appearance' },
      { id: 'hover', name: 'Hover/Active', promptSuffix: 'highlighted or active state, slightly brighter or glowing' },
      { id: 'disabled', name: 'Disabled', promptSuffix: 'disabled or inactive state, desaturated and dimmed' },
    ],
  },
  // ── Effects ──────────────────────────────────────────────────
  {
    id: 'vfx-effect',
    name: 'VFX / Particle',
    description: 'Explosions, magic effects, hit sparks',
    category: 'effect',
    basePrompt: 'game visual effect sprite, dynamic motion, transparent background, bright and vivid',
    defaultSize: { w: 1024, h: 1024 },
    poses: [
      { id: 'frame-1', name: 'Frame 1 (Start)', promptSuffix: 'first frame of the effect, initial burst, small and bright' },
      { id: 'frame-2', name: 'Frame 2 (Peak)', promptSuffix: 'peak intensity frame, largest and brightest' },
      { id: 'frame-3', name: 'Frame 3 (Fade)', promptSuffix: 'fading out frame, dissipating, smaller and dimmer' },
    ],
  },
];

// ---- Panel Class ----

export class SpriteMakerPanel {
  private _container: HTMLElement;
  private _projectManager: ProjectManager | null = null;
  private _textureLibrary: TextureLibrary | null = null;

  // State
  private _selectedTemplate: SpritePromptTemplate = PROMPT_TEMPLATES[0];
  private _selectedStyle: (typeof STYLE_PRESETS)[0] = STYLE_PRESETS[1]; // 32×32 default
  private _selectedPoses: Set<string> = new Set(['idle']);
  private _customPrompt = '';
  private _colorHints = '';
  private _framesPerPose = 1;
  private _spriteSheetMode = false;
  private _referenceImageId: string | null = null;
  private _saveSubfolder = 'Textures';
  private _isGenerating = false;
  private _results: GenerationResult[] = [];
  private _progress: { current: number; total: number; currentPose: string } | null = null;

  // DOM refs
  private _bodyEl: HTMLElement | null = null;
  private _resultsEl: HTMLElement | null = null;
  private _statusEl: HTMLElement | null = null;
  private _generateBtn: HTMLButtonElement | null = null;

  constructor(container: HTMLElement) {
    this._container = container;
    this._build();
  }

  setProjectManager(mgr: ProjectManager): void {
    this._projectManager = mgr;
  }

  setTextureLibrary(lib: TextureLibrary): void {
    this._textureLibrary = lib;
  }

  // ─── Build UI ──────────────────────────────────────────────────

  private _build(): void {
    const root = this._container;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#1e1e2e;color:#cdd6f4;font-family:Inter,sans-serif;font-size:12px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #313244;gap:8px;';
    header.innerHTML = `${iconHTML(Icons.Sparkles, 'sm', '#a78bfa')}<span style="font-weight:700;font-size:13px;flex:1">AI Sprite Maker</span>
      <span style="font-size:10px;color:#6c7086;">Powered by OpenAI gpt-image-1</span>`;
    root.appendChild(header);

    // Main layout: left config | right results
    const main = document.createElement('div');
    main.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left column — configuration
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'width:380px;min-width:320px;display:flex;flex-direction:column;border-right:1px solid #313244;overflow-y:auto;padding:10px;gap:12px;';

    leftCol.appendChild(this._buildTemplateSection());
    leftCol.appendChild(this._buildStyleSection());
    leftCol.appendChild(this._buildPromptSection());
    leftCol.appendChild(this._buildReferenceImageSection());
    leftCol.appendChild(this._buildPosesSection());
    leftCol.appendChild(this._buildFrameCountSection());
    leftCol.appendChild(this._buildSpriteSheetSection());
    leftCol.appendChild(this._buildSaveLocationSection());
    leftCol.appendChild(this._buildGenerateSection());

    main.appendChild(leftCol);

    // Right column — results
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

    const resultsHeader = document.createElement('div');
    resultsHeader.style.cssText = 'padding:8px 12px;border-bottom:1px solid #313244;font-weight:600;display:flex;align-items:center;gap:6px;';
    resultsHeader.innerHTML = `${iconHTML(Icons.Image, 'xs', ICON_COLORS.success)} GENERATED SPRITES`;

    this._statusEl = document.createElement('span');
    this._statusEl.style.cssText = 'margin-left:auto;font-size:10px;font-weight:400;color:#6c7086;';
    resultsHeader.appendChild(this._statusEl);

    rightCol.appendChild(resultsHeader);

    this._resultsEl = document.createElement('div');
    this._resultsEl.style.cssText = 'flex:1;overflow-y:auto;padding:10px;display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start;';
    this._resultsEl.innerHTML = '<div style="color:#6c7086;padding:20px;text-align:center;width:100%;">No sprites generated yet.<br>Configure your sprite and click <b>Generate</b>.</div>';
    rightCol.appendChild(this._resultsEl);

    main.appendChild(rightCol);
    root.appendChild(main);

    this._bodyEl = main;
  }

  // ---- Template Section ----

  private _buildTemplateSection(): HTMLElement {
    const section = this._section('TEMPLATE', Icons.ClipboardList);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'Choose a sprite type template with preloaded prompts and animation poses.';
    section.appendChild(desc);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';

    for (const tpl of PROMPT_TEMPLATES) {
      const card = document.createElement('div');
      const isActive = tpl.id === this._selectedTemplate.id;
      card.style.cssText = `padding:6px 8px;border-radius:4px;cursor:pointer;border:1px solid ${isActive ? '#a78bfa' : '#313244'};background:${isActive ? '#2a2040' : '#181825'};transition:all 0.15s;`;
      card.innerHTML = `<div style="font-weight:600;font-size:11px;${isActive ? 'color:#a78bfa' : ''}">${this._categoryIcon(tpl.category)} ${tpl.name}</div>
        <div style="font-size:9px;color:#6c7086;margin-top:2px;">${tpl.description}</div>`;

      card.addEventListener('click', () => {
        this._selectedTemplate = tpl;
        this._selectedPoses = new Set([tpl.poses[0]?.id || 'idle']);
        this._rebuild();
      });

      card.addEventListener('mouseenter', () => { if (!isActive) card.style.borderColor = '#45475a'; });
      card.addEventListener('mouseleave', () => { if (!isActive) card.style.borderColor = '#313244'; });

      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  // ---- Style Section ----

  private _buildStyleSection(): HTMLElement {
    const section = this._section('PIXEL ART STYLE', Icons.Palette);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';

    for (const style of STYLE_PRESETS) {
      const chip = document.createElement('button');
      const isActive = style.id === this._selectedStyle.id;
      chip.style.cssText = `padding:4px 10px;border-radius:12px;font-size:11px;cursor:pointer;border:1px solid ${isActive ? '#89b4fa' : '#45475a'};background:${isActive ? '#1e3a5f' : 'transparent'};color:${isActive ? '#89b4fa' : '#cdd6f4'};transition:all 0.15s;`;
      chip.textContent = style.name;

      chip.addEventListener('click', () => {
        this._selectedStyle = style;
        this._rebuild();
      });

      row.appendChild(chip);
    }

    section.appendChild(row);
    return section;
  }

  // ---- Prompt Section ----

  private _buildPromptSection(): HTMLElement {
    const section = this._section('DESCRIPTION', Icons.Pencil);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'Describe your sprite. Be specific about the character, colors, equipment, and style.';
    section.appendChild(desc);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'e.g. A skeleton warrior with rusty iron armor, glowing blue eyes, wielding a jagged sword. Colors: bone white, dark grey armor, blue glow.';
    textarea.value = this._customPrompt;
    textarea.rows = 4;
    textarea.style.cssText = 'width:100%;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:8px;font-size:11px;font-family:Inter,sans-serif;resize:vertical;line-height:1.5;box-sizing:border-box;';
    textarea.addEventListener('input', () => { this._customPrompt = textarea.value; });
    section.appendChild(textarea);

    // Color hints
    const colorLabel = document.createElement('div');
    colorLabel.style.cssText = 'font-size:10px;color:#6c7086;margin-top:8px;margin-bottom:4px;';
    colorLabel.textContent = 'Color palette hints (optional):';
    section.appendChild(colorLabel);

    const colorInput = document.createElement('input');
    colorInput.type = 'text';
    colorInput.placeholder = 'e.g. red, gold, dark brown, white';
    colorInput.value = this._colorHints;
    colorInput.style.cssText = 'width:100%;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:6px 8px;font-size:11px;box-sizing:border-box;';
    colorInput.addEventListener('input', () => { this._colorHints = colorInput.value; });
    section.appendChild(colorInput);

    return section;
  }

  // ---- Poses Section ----

  private _buildPosesSection(): HTMLElement {
    const section = this._section('ANIMATION POSES', Icons.Film);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'Select which poses/frames to generate. Each pose is a separate API call.';
    section.appendChild(desc);

    // Select all / none
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';

    const selectAll = this._miniBtn('Select All', () => {
      this._selectedTemplate.poses.forEach(p => this._selectedPoses.add(p.id));
      this._rebuild();
    });
    const selectNone = this._miniBtn('Clear', () => {
      this._selectedPoses.clear();
      this._rebuild();
    });
    controls.appendChild(selectAll);
    controls.appendChild(selectNone);
    section.appendChild(controls);

    // Pose checkboxes
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px;';

    for (const pose of this._selectedTemplate.poses) {
      const isChecked = this._selectedPoses.has(pose.id);
      const label = document.createElement('label');
      label.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;background:${isChecked ? '#1e3a5f' : 'transparent'};border:1px solid ${isChecked ? '#89b4fa40' : 'transparent'};`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isChecked;
      cb.style.cssText = 'accent-color:#89b4fa;';
      cb.addEventListener('change', () => {
        if (cb.checked) this._selectedPoses.add(pose.id);
        else this._selectedPoses.delete(pose.id);
        this._rebuild();
      });

      label.appendChild(cb);
      label.appendChild(document.createTextNode(pose.name));
      grid.appendChild(label);
    }

    section.appendChild(grid);

    // Estimated cost hint
    const costHint = document.createElement('div');
    costHint.style.cssText = 'font-size:9px;color:#6c7086;margin-top:6px;';
    const poseCount = this._selectedPoses.size;
    if (this._spriteSheetMode) {
      costHint.textContent = `${poseCount} pose${poseCount !== 1 ? 's' : ''} selected — ${poseCount} API call${poseCount !== 1 ? 's' : ''} (1 sprite sheet per pose, ${this._framesPerPose} frames each)`;
    } else {
      const totalCalls = poseCount * this._framesPerPose;
      costHint.textContent = `${poseCount} pose${poseCount !== 1 ? 's' : ''} selected — ${totalCalls} API call${totalCalls !== 1 ? 's' : ''} (×${this._framesPerPose} frame${this._framesPerPose !== 1 ? 's' : ''} each)`;
    }
    section.appendChild(costHint);

    return section;
  }

  // ---- Reference Image Section ----

  private _buildReferenceImageSection(): HTMLElement {
    const section = this._section('REFERENCE IMAGE', Icons.Image);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'Optionally pick a texture from your project as a style/character reference for the AI.';
    section.appendChild(desc);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;';

    // Dropdown
    const select = document.createElement('select');
    select.style.cssText = 'flex:1;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:5px 8px;font-size:11px;cursor:pointer;';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(None)';
    select.appendChild(noneOpt);

    const textures = this._textureLibrary?.allTextures ?? [];
    for (const tex of textures) {
      const opt = document.createElement('option');
      opt.value = tex.assetId;
      opt.textContent = `${tex.assetName} (${tex.metadata.width}×${tex.metadata.height})`;
      if (tex.assetId === this._referenceImageId) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this._referenceImageId = select.value || null;
      this._renderReferencePreview(previewWrap);
    });

    row.appendChild(select);

    const clearBtn = this._miniBtn('Clear', () => {
      this._referenceImageId = null;
      select.value = '';
      this._renderReferencePreview(previewWrap);
    });
    row.appendChild(clearBtn);

    section.appendChild(row);

    // Preview thumbnail
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = 'margin-top:6px;';
    this._renderReferencePreview(previewWrap);
    section.appendChild(previewWrap);

    return section;
  }

  private _renderReferencePreview(container: HTMLElement): void {
    container.innerHTML = '';
    if (!this._referenceImageId || !this._textureLibrary) return;

    const tex = this._textureLibrary.allTextures.find(t => t.assetId === this._referenceImageId);
    if (!tex) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;background:#181825;border:1px solid #313244;border-radius:4px;';

    const img = document.createElement('img');
    img.src = tex.thumbnail || tex.storedData;
    img.style.cssText = 'width:48px;height:48px;image-rendering:pixelated;border-radius:3px;border:1px solid #45475a;object-fit:contain;background:repeating-conic-gradient(#22222e 0% 25%, #181825 0% 50%) 50%/8px 8px;';
    wrapper.appendChild(img);

    const info = document.createElement('div');
    info.style.cssText = 'font-size:10px;color:#bac2de;';
    info.innerHTML = `<div style="font-weight:600;">${tex.assetName}</div><div style="color:#6c7086;">${tex.metadata.width}×${tex.metadata.height} • ${tex.category}</div>`;
    wrapper.appendChild(info);

    container.appendChild(wrapper);
  }

  // ---- Frame Count Section ----

  private _buildFrameCountSection(): HTMLElement {
    const section = this._section('FRAMES PER POSE', Icons.Clapperboard);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'How many animation frames to generate per pose. More frames = smoother animation but more API calls.';
    section.appendChild(desc);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';

    // Quick presets
    for (const count of [1, 2, 3, 4, 6, 8]) {
      const chip = document.createElement('button');
      const isActive = this._framesPerPose === count;
      chip.style.cssText = `width:32px;height:28px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${isActive ? '#89b4fa' : '#45475a'};background:${isActive ? '#1e3a5f' : 'transparent'};color:${isActive ? '#89b4fa' : '#cdd6f4'};transition:all 0.15s;`;
      chip.textContent = String(count);
      chip.title = `${count} frame${count !== 1 ? 's' : ''} per pose`;
      chip.addEventListener('click', () => {
        this._framesPerPose = count;
        this._rebuild();
      });
      row.appendChild(chip);
    }

    // Custom input
    const customLabel = document.createElement('span');
    customLabel.style.cssText = 'font-size:10px;color:#6c7086;margin-left:4px;';
    customLabel.textContent = 'or';
    row.appendChild(customLabel);

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '1';
    customInput.max = '16';
    customInput.value = String(this._framesPerPose);
    customInput.style.cssText = 'width:48px;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:4px 6px;font-size:11px;text-align:center;';
    customInput.addEventListener('change', () => {
      const val = Math.max(1, Math.min(16, parseInt(customInput.value) || 1));
      this._framesPerPose = val;
      customInput.value = String(val);
      this._rebuild();
    });
    row.appendChild(customInput);

    section.appendChild(row);

    // Total calls hint
    const costHint = document.createElement('div');
    costHint.style.cssText = 'font-size:9px;color:#6c7086;margin-top:6px;';
    if (this._spriteSheetMode) {
      costHint.textContent = `${this._selectedPoses.size} pose${this._selectedPoses.size !== 1 ? 's' : ''} × ${this._framesPerPose} frames on 1 sheet each = ${this._selectedPoses.size} total API call${this._selectedPoses.size !== 1 ? 's' : ''}`;
    } else {
      const totalCalls = this._selectedPoses.size * this._framesPerPose;
      costHint.textContent = `${this._selectedPoses.size} pose${this._selectedPoses.size !== 1 ? 's' : ''} × ${this._framesPerPose} frame${this._framesPerPose !== 1 ? 's' : ''} = ${totalCalls} total API call${totalCalls !== 1 ? 's' : ''}`;
    }
    section.appendChild(costHint);

    return section;
  }

  // ---- Sprite Sheet Mode Section ----

  private _buildSpriteSheetSection(): HTMLElement {
    const section = this._section('SPRITE SHEET MODE', Icons.Grid);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:8px;';
    desc.textContent = 'When enabled, all frames for each pose are generated as a single horizontal sprite sheet image instead of separate images. This uses fewer API calls and keeps frames consistent.';
    section.appendChild(desc);

    // Toggle row
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = 'display:flex;align-items:center;gap:10px;';

    // Toggle switch
    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

    const toggleTrack = document.createElement('div');
    toggleTrack.style.cssText = `width:36px;height:20px;border-radius:10px;background:${this._spriteSheetMode ? '#a78bfa' : '#45475a'};position:relative;transition:background 0.2s;cursor:pointer;flex-shrink:0;`;

    const toggleThumb = document.createElement('div');
    toggleThumb.style.cssText = `width:16px;height:16px;border-radius:50%;background:#cdd6f4;position:absolute;top:2px;transition:left 0.2s;left:${this._spriteSheetMode ? '18px' : '2px'};box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
    toggleTrack.appendChild(toggleThumb);

    const toggleText = document.createElement('span');
    toggleText.style.cssText = `font-size:12px;font-weight:600;color:${this._spriteSheetMode ? '#a78bfa' : '#6c7086'};`;
    toggleText.textContent = this._spriteSheetMode ? 'Sprite Sheet ON' : 'Sprite Sheet OFF';

    toggleLabel.appendChild(toggleTrack);
    toggleLabel.appendChild(toggleText);
    toggleLabel.addEventListener('click', () => {
      this._spriteSheetMode = !this._spriteSheetMode;
      this._rebuild();
    });

    toggleRow.appendChild(toggleLabel);
    section.appendChild(toggleRow);

    // Extra info when enabled
    if (this._spriteSheetMode) {
      const infoBox = document.createElement('div');
      infoBox.style.cssText = 'margin-top:8px;padding:8px 10px;background:#2a2040;border:1px solid #a78bfa40;border-radius:4px;font-size:10px;color:#cba6f7;line-height:1.5;';

      const frameCount = this._framesPerPose;
      infoBox.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-weight:600;">
          ${iconHTML(Icons.Image, 'xs', '#a78bfa')} Sprite Sheet Preview
        </div>
        <div>Each pose will generate <b>1 image</b> containing <b>${frameCount} frame${frameCount !== 1 ? 's' : ''}</b> arranged in a horizontal strip.</div>
        <div style="margin-top:4px;color:#6c7086;">Output: 1024×1024 image with ${frameCount} equal columns (${Math.floor(1024 / frameCount)}px per frame)</div>
        <div style="margin-top:6px;display:flex;gap:2px;height:24px;">
          ${Array.from({ length: Math.min(frameCount, 16) }, (_, i) =>
            `<div style="flex:1;background:${i % 2 === 0 ? '#313244' : '#3b3b52'};border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#6c7086;">${i + 1}</div>`
          ).join('')}
        </div>
      `;
      section.appendChild(infoBox);
    }

    return section;
  }

  // ---- Save Location Section ----

  private _buildSaveLocationSection(): HTMLElement {
    const section = this._section('SAVE LOCATION', Icons.Folder);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:10px;color:#6c7086;margin-bottom:6px;';
    desc.textContent = 'Choose where generated sprites are saved within your project.';
    section.appendChild(desc);

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:5px 8px;font-size:11px;cursor:pointer;box-sizing:border-box;';

    const defaultFolders = ['Textures', 'Textures/Sprites', 'Textures/Characters', 'Textures/Enemies', 'Textures/Items', 'Textures/UI', 'Textures/VFX', 'Textures/Tilesets'];
    for (const folder of defaultFolders) {
      const opt = document.createElement('option');
      opt.value = folder;
      opt.textContent = `📁 ${folder}/`;
      if (folder === this._saveSubfolder) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      this._saveSubfolder = select.value;
    });

    section.appendChild(select);

    // Custom subfolder input
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px;';

    const customLabel = document.createElement('span');
    customLabel.style.cssText = 'font-size:10px;color:#6c7086;white-space:nowrap;';
    customLabel.textContent = 'Custom:';
    customRow.appendChild(customLabel);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'e.g. Textures/MyCharacter';
    customInput.style.cssText = 'flex:1;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;padding:4px 8px;font-size:11px;box-sizing:border-box;';
    customInput.addEventListener('change', () => {
      const val = customInput.value.trim();
      if (val) {
        this._saveSubfolder = val;
        // Deselect the dropdown
        select.value = '';
      }
    });
    customRow.appendChild(customInput);

    section.appendChild(customRow);

    // Show full path hint
    const pathHint = document.createElement('div');
    pathHint.style.cssText = 'font-size:9px;color:#6c7086;margin-top:4px;font-family:monospace;';
    const projPath = this._projectManager?.projectPath ?? '<project>';
    pathHint.textContent = `→ ${projPath}/${this._saveSubfolder}/`;
    section.appendChild(pathHint);

    return section;
  }

  // ---- Generate Section ----

  private _buildGenerateSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding:10px 0;border-top:1px solid #313244;';

    this._generateBtn = document.createElement('button');
    this._generateBtn.style.cssText = 'width:100%;padding:10px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;';
    this._updateGenerateButton();

    this._generateBtn.addEventListener('click', () => this._onGenerate());

    section.appendChild(this._generateBtn);

    // Progress bar
    const progressWrapper = document.createElement('div');
    progressWrapper.id = 'sprite-maker-progress';
    progressWrapper.style.cssText = 'margin-top:8px;display:none;';
    progressWrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#6c7086;margin-bottom:4px;">
        <span id="sm-progress-label">Generating...</span>
        <span id="sm-progress-count">0/0</span>
      </div>
      <div style="width:100%;height:4px;background:#313244;border-radius:2px;overflow:hidden;">
        <div id="sm-progress-bar" style="height:100%;background:linear-gradient(90deg,#a78bfa,#89b4fa);width:0%;transition:width 0.3s;border-radius:2px;"></div>
      </div>
    `;
    section.appendChild(progressWrapper);

    return section;
  }

  // ─── Generation Logic ──────────────────────────────────────────

  private async _onGenerate(): Promise<void> {
    if (this._isGenerating) return;

    // Validate
    if (!this._customPrompt.trim()) {
      this._showError('Please enter a sprite description.');
      return;
    }

    const apiKey = this._projectManager?.openaiApiKey;
    if (!apiKey) {
      this._showError('No OpenAI API key configured. Set it in Project Settings → AI — Sprite Maker.');
      return;
    }

    if (this._selectedPoses.size === 0) {
      this._showError('Select at least one pose to generate.');
      return;
    }

    this._isGenerating = true;
    this._results = [];
    this._updateGenerateButton();
    this._renderResults();

    const poses = this._selectedTemplate.poses.filter(p => this._selectedPoses.has(p.id));

    if (this._spriteSheetMode) {
      // ── Sprite Sheet Mode: 1 API call per pose, all frames in one image ──
      const totalCalls = poses.length;
      this._progress = { current: 0, total: totalCalls, currentPose: '' };
      this._showProgress(true);

      for (let i = 0; i < poses.length; i++) {
        const pose = poses[i];
        const sheetLabel = `${pose.name} (${this._framesPerPose}-frame sheet)`;

        this._progress = { current: i, total: totalCalls, currentPose: sheetLabel };
        this._updateProgress();

        try {
          const fullPrompt = this._buildSpriteSheetPrompt(pose, this._framesPerPose);
          console.log(`[SpriteMaker] Generating sprite sheet "${sheetLabel}":\n${fullPrompt}`);

          const dataUrl = await this._callOpenAI(apiKey, fullPrompt);

          const result: GenerationResult = {
            poseId: `${pose.id}_sheet`,
            poseName: sheetLabel,
            dataUrl,
            saved: false,
          };

          this._results.push(result);
          this._renderResults();
        } catch (err: any) {
          console.error(`[SpriteMaker] Failed to generate sheet "${sheetLabel}":`, err);
          this._results.push({
            poseId: `${pose.id}_sheet`,
            poseName: sheetLabel,
            dataUrl: '',
            saved: false,
          });
          this._renderResults();
        }
      }

      this._progress = { current: totalCalls, total: totalCalls, currentPose: 'Done!' };
      this._updateProgress();
    } else {
      // ── Individual Frames Mode: 1 API call per frame ──
      const totalFrames = poses.length * this._framesPerPose;
      this._progress = { current: 0, total: totalFrames, currentPose: '' };
      this._showProgress(true);

      let frameIndex = 0;
      for (let i = 0; i < poses.length; i++) {
        const pose = poses[i];

        for (let f = 0; f < this._framesPerPose; f++) {
          const frameLabel = this._framesPerPose > 1
            ? `${pose.name} (frame ${f + 1}/${this._framesPerPose})`
            : pose.name;

          this._progress = { current: frameIndex, total: totalFrames, currentPose: frameLabel };
          this._updateProgress();

          try {
            const fullPrompt = this._buildFullPrompt(pose, f, this._framesPerPose);
            console.log(`[SpriteMaker] Generating "${frameLabel}":\n${fullPrompt}`);

            const dataUrl = await this._callOpenAI(apiKey, fullPrompt);

            const poseId = this._framesPerPose > 1 ? `${pose.id}_f${f + 1}` : pose.id;
            const result: GenerationResult = {
              poseId,
              poseName: frameLabel,
              dataUrl,
              saved: false,
            };

            this._results.push(result);
            this._renderResults();
          } catch (err: any) {
            console.error(`[SpriteMaker] Failed to generate "${frameLabel}":`, err);
            const poseId = this._framesPerPose > 1 ? `${pose.id}_f${f + 1}` : pose.id;
            this._results.push({
              poseId,
              poseName: frameLabel,
              dataUrl: '',
              saved: false,
            });
            this._renderResults();
          }

          frameIndex++;
        }
      }

      this._progress = { current: totalFrames, total: totalFrames, currentPose: 'Done!' };
      this._updateProgress();
    }

    setTimeout(() => this._showProgress(false), 1500);

    this._isGenerating = false;
    this._updateGenerateButton();
    const successCount = this._results.filter(r => r.dataUrl).length;
    const totalGenerated = this._results.length;
    this._updateStatus(`Generated ${successCount}/${totalGenerated} sprite${this._spriteSheetMode ? ' sheet' : ''}${totalGenerated !== 1 ? 's' : ''}`);
  }

  private _buildFullPrompt(pose: SpritePose, frameIndex: number = 0, totalFrames: number = 1): string {
    const parts: string[] = [];

    // Style preset
    parts.push(this._selectedStyle.prompt);

    // Template base prompt
    parts.push(this._selectedTemplate.basePrompt);

    // User description
    parts.push(this._customPrompt.trim());

    // Pose-specific
    parts.push(pose.promptSuffix);

    // Multi-frame instructions
    if (totalFrames > 1) {
      const progress = frameIndex / (totalFrames - 1); // 0.0 to 1.0
      parts.push(`This is animation frame ${frameIndex + 1} of ${totalFrames} for this pose`);
      if (frameIndex === 0) {
        parts.push('Starting position of the animation, initial keyframe');
      } else if (frameIndex === totalFrames - 1) {
        parts.push('Final position of the animation, ending keyframe');
      } else {
        parts.push(`Mid-animation at ${Math.round(progress * 100)}% progress, in-between frame`);
      }
    }

    // Reference image description
    if (this._referenceImageId && this._textureLibrary) {
      const refTex = this._textureLibrary.allTextures.find(t => t.assetId === this._referenceImageId);
      if (refTex) {
        parts.push(`Match the visual style, color palette, and proportions of the reference image named "${refTex.assetName}"`);
      }
    }

    // Color hints
    if (this._colorHints.trim()) {
      parts.push(`Color palette: ${this._colorHints.trim()}`);
    }

    // General quality hints for pixel art
    parts.push('Single sprite only, centered, transparent or solid color background, no text, no watermarks, no borders, game-ready asset');

    return parts.join('. ') + '.';
  }

  /** Build a prompt that asks the AI to generate a single sprite sheet image with N frames in a horizontal strip */
  private _buildSpriteSheetPrompt(pose: SpritePose, frameCount: number): string {
    const parts: string[] = [];

    // Core sprite sheet instruction
    parts.push(`Generate a single sprite sheet image containing exactly ${frameCount} animation frames arranged in a single horizontal row`);
    parts.push(`The image must be divided into ${frameCount} equal-width columns, each column containing one animation frame`);
    parts.push(`All ${frameCount} frames must be in ONE image, side by side from left to right, forming a horizontal strip`);

    // Style preset
    parts.push(this._selectedStyle.prompt);

    // Template base prompt
    parts.push(this._selectedTemplate.basePrompt);

    // User description
    parts.push(this._customPrompt.trim());

    // Pose-specific
    parts.push(`Animation: ${pose.promptSuffix}`);

    // Frame progression instructions
    parts.push(`Frame 1 (leftmost) is the starting pose, frame ${frameCount} (rightmost) is the ending pose`);
    if (frameCount > 2) {
      parts.push(`Frames 2 through ${frameCount - 1} are smooth in-between animation steps showing gradual progression`);
    }
    parts.push('Each frame should show the same character/object in a slightly different position to create smooth animation when played in sequence');
    parts.push('Every frame must have the exact same character design, colors, proportions, and art style — only the pose changes between frames');

    // Reference image
    if (this._referenceImageId && this._textureLibrary) {
      const refTex = this._textureLibrary.allTextures.find(t => t.assetId === this._referenceImageId);
      if (refTex) {
        parts.push(`Match the visual style, color palette, and proportions of the reference image named "${refTex.assetName}"`);
      }
    }

    // Color hints
    if (this._colorHints.trim()) {
      parts.push(`Color palette: ${this._colorHints.trim()}`);
    }

    // Quality / layout hints
    parts.push('Transparent or solid color background, no text, no labels, no numbers, no watermarks, no borders between frames');
    parts.push('The frames should tile perfectly — same vertical alignment, same ground line, same scale in every column');
    parts.push('Game-ready sprite sheet asset, suitable for slicing into individual animation frames');

    return parts.join('. ') + '.';
  }

  private async _callOpenAI(apiKey: string, prompt: string): Promise<string> {
    const requestBody = JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
    });

    const response = await invoke<{ status: number; body: string }>('http_post_json', {
      url: 'https://api.openai.com/v1/images/generations',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    if (response.status !== 200) {
      const errorData = JSON.parse(response.body);
      throw new Error(errorData.error?.message || `API error (${response.status})`);
    }

    const data = JSON.parse(response.body);
    // gpt-image-1 returns base64 data in data[0].b64_json
    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      return `data:image/png;base64,${b64}`;
    }

    // Fallback: URL-based response
    const url = data.data?.[0]?.url;
    if (url) {
      return url;
    }

    throw new Error('No image data in response');
  }

  // ─── Save to Project ───────────────────────────────────────────

  private async _saveSprite(result: GenerationResult): Promise<void> {
    if (!this._projectManager?.projectPath || !result.dataUrl) return;

    const sanitizedName = this._customPrompt
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 30)
      .replace(/_+$/g, '');

    const fileName = `sprite_${sanitizedName}_${result.poseId}.png`;
    const texturePath = `${this._projectManager.projectPath}/${this._saveSubfolder}/${fileName}`;

    try {
      // Convert data URL to binary
      const base64Data = result.dataUrl.split(',')[1];
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      await invoke('write_binary_file', { path: texturePath, contents: Array.from(bytes) });

      result.saved = true;
      result.fileName = fileName;

      // Register in texture library if available
      if (this._textureLibrary) {
        try {
          await this._textureLibrary.importFromDataURL(
            result.dataUrl,
            fileName.replace('.png', ''),
            undefined,
            { filter: 'nearest' }, // Pixel art should use nearest-neighbor
            'Sprite',
          );
          console.log(`[SpriteMaker] Registered "${fileName}" in Texture Library`);
        } catch (e) {
          console.warn(`[SpriteMaker] Saved file but couldn't register in Texture Library:`, e);
        }
      }

      this._renderResults();
      console.log(`[SpriteMaker] Saved "${fileName}" to ${texturePath}`);
    } catch (err: any) {
      console.error(`[SpriteMaker] Failed to save "${fileName}":`, err);
      this._showError(`Failed to save: ${err.message}`);
    }
  }

  private async _saveAllSprites(): Promise<void> {
    for (const result of this._results) {
      if (result.dataUrl && !result.saved) {
        await this._saveSprite(result);
      }
    }
    this._updateStatus(`Saved ${this._results.filter(r => r.saved).length} sprites to project`);
  }

  // ─── Render Results ────────────────────────────────────────────

  private _renderResults(): void {
    if (!this._resultsEl) return;

    if (this._results.length === 0 && !this._isGenerating) {
      this._resultsEl.innerHTML = '<div style="color:#6c7086;padding:20px;text-align:center;width:100%;">No sprites generated yet.<br>Configure your sprite and click <b>Generate</b>.</div>';
      return;
    }

    this._resultsEl.innerHTML = '';

    // Save All button
    if (this._results.some(r => r.dataUrl && !r.saved)) {
      const saveAllBar = document.createElement('div');
      saveAllBar.style.cssText = 'width:100%;display:flex;gap:8px;margin-bottom:8px;';

      const saveAllBtn = document.createElement('button');
      saveAllBtn.style.cssText = 'padding:6px 16px;background:#a78bfa;color:#1e1e2e;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;';
      saveAllBtn.innerHTML = `${iconHTML(Icons.Save, 'xs', '#1e1e2e')} Save All to Project`;
      saveAllBtn.addEventListener('click', () => this._saveAllSprites());
      saveAllBar.appendChild(saveAllBtn);

      this._resultsEl.appendChild(saveAllBar);
    }

    for (const result of this._results) {
      const card = document.createElement('div');
      card.style.cssText = 'width:180px;background:#181825;border:1px solid #313244;border-radius:6px;overflow:hidden;flex-shrink:0;';

      if (result.dataUrl) {
        // Image preview
        const imgWrap = document.createElement('div');
        imgWrap.style.cssText = 'width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#22222e 0% 25%, #181825 0% 50%) 50%/16px 16px;';

        const img = document.createElement('img');
        img.src = result.dataUrl;
        img.style.cssText = 'max-width:100%;max-height:100%;image-rendering:pixelated;';
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);

        // Info bar
        const info = document.createElement('div');
        info.style.cssText = 'padding:6px 8px;border-top:1px solid #313244;';
        info.innerHTML = `<div style="font-weight:600;font-size:11px;margin-bottom:4px;">${result.poseName}</div>`;

        if (result.saved) {
          info.innerHTML += `<div style="font-size:9px;color:#a6e3a1;display:flex;align-items:center;gap:4px;">${iconHTML(Icons.Check, 'xs', '#a6e3a1')} Saved: ${result.fileName}</div>`;
        } else {
          const saveBtn = document.createElement('button');
          saveBtn.style.cssText = 'padding:3px 8px;background:#313244;border:1px solid #45475a;border-radius:3px;color:#cdd6f4;font-size:10px;cursor:pointer;display:flex;align-items:center;gap:4px;';
          saveBtn.innerHTML = `${iconHTML(Icons.Save, 'xs')} Save to Project`;
          saveBtn.addEventListener('click', () => this._saveSprite(result));
          info.appendChild(saveBtn);
        }

        card.appendChild(info);
      } else {
        // Error state
        card.innerHTML = `
          <div style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:#181825;">
            <div style="text-align:center;color:#f38ba8;font-size:11px;padding:12px;">
              ${iconHTML(Icons.AlertCircle, 'md', '#f38ba8')}<br>
              Failed to generate<br><b>${result.poseName}</b>
            </div>
          </div>
        `;
      }

      this._resultsEl.appendChild(card);
    }
  }

  // ─── UI Helpers ────────────────────────────────────────────────

  private _section(title: string, icon: any[]): HTMLElement {
    const section = document.createElement('div');

    const header = document.createElement('div');
    header.style.cssText = 'font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#bac2de;margin-bottom:6px;display:flex;align-items:center;gap:6px;';
    header.innerHTML = `${iconHTML(icon, 'xs', '#6c7086')} ${title}`;
    section.appendChild(header);

    return section;
  }

  private _miniBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = 'padding:2px 8px;background:#313244;border:1px solid #45475a;border-radius:3px;color:#cdd6f4;font-size:10px;cursor:pointer;';
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _categoryIcon(cat: string): string {
    switch (cat) {
      case 'character': return iconHTML(Icons.PersonStanding, 'xs', '#89b4fa');
      case 'enemy': return iconHTML(Icons.Bot, 'xs', '#f38ba8');
      case 'item': return iconHTML(Icons.Diamond, 'xs', '#f9e2af');
      case 'tileset': return iconHTML(Icons.Grid, 'xs', '#a6e3a1');
      case 'ui': return iconHTML(Icons.Layout, 'xs', '#89dceb');
      case 'effect': return iconHTML(Icons.Zap, 'xs', '#fab387');
      default: return iconHTML(Icons.Image, 'xs');
    }
  }

  private _updateGenerateButton(): void {
    if (!this._generateBtn) return;
    if (this._isGenerating) {
      this._generateBtn.style.background = '#45475a';
      this._generateBtn.style.color = '#6c7086';
      this._generateBtn.style.cursor = 'not-allowed';
      this._generateBtn.innerHTML = `${iconHTML(Icons.Loader2, 'sm', '#6c7086')} Generating...`;
    } else {
      this._generateBtn.style.background = 'linear-gradient(135deg, #a78bfa 0%, #89b4fa 100%)';
      this._generateBtn.style.color = '#1e1e2e';
      this._generateBtn.style.cursor = 'pointer';
      if (this._spriteSheetMode) {
        const sheetCount = this._selectedPoses.size;
        this._generateBtn.innerHTML = `${iconHTML(Icons.Sparkles, 'sm', '#1e1e2e')} Generate ${sheetCount} Sprite Sheet${sheetCount !== 1 ? 's' : ''} (${this._framesPerPose} frames each)`;
      } else {
        const total = this._selectedPoses.size * this._framesPerPose;
        this._generateBtn.innerHTML = `${iconHTML(Icons.Sparkles, 'sm', '#1e1e2e')} Generate ${total} Sprite${total !== 1 ? 's' : ''}`;
      }
    }
  }

  private _showProgress(visible: boolean): void {
    const el = this._container.querySelector('#sprite-maker-progress') as HTMLElement;
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  private _updateProgress(): void {
    if (!this._progress) return;
    const label = this._container.querySelector('#sm-progress-label') as HTMLElement;
    const count = this._container.querySelector('#sm-progress-count') as HTMLElement;
    const bar = this._container.querySelector('#sm-progress-bar') as HTMLElement;

    if (label) label.textContent = `Generating: ${this._progress.currentPose}...`;
    if (count) count.textContent = `${this._progress.current}/${this._progress.total}`;
    if (bar) bar.style.width = `${(this._progress.current / this._progress.total) * 100}%`;
  }

  private _updateStatus(text: string): void {
    if (this._statusEl) this._statusEl.textContent = text;
  }

  private _showError(message: string): void {
    // Show inline toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f38ba8;color:#1e1e2e;padding:10px 16px;border-radius:6px;font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;';
    toast.innerHTML = `${iconHTML(Icons.AlertCircle, 'sm', '#1e1e2e')} ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  private _rebuild(): void {
    this._build();
  }
}
