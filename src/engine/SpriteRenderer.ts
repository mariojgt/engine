// ============================================================
//  SpriteRenderer — 2D sprite component for Three.js
//  Uses a PlaneGeometry with UV offsets for sprite sheet frames.
//  Never recreates geometry per frame — only updates UV needsUpdate.
// ============================================================

import * as THREE from 'three';

export interface SpriteData {
  spriteId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pivot: { x: number; y: number };
}

export interface SpriteSheetAsset {
  assetId: string;
  assetType: 'spriteSheet';
  assetName: string;
  sourceTexture: string;
  textureWidth: number;
  textureHeight: number;
  pixelsPerUnit: number;
  filterMode: 'point' | 'linear';
  sprites: SpriteData[];
  animations: SpriteAnimationDef[];
  // Runtime loaded texture
  image?: HTMLImageElement;
  texture?: THREE.Texture;
  /** Base-64 data URL of the source image — persisted so sprite sheets survive save/load */
  imageDataUrl?: string;
  /** Relative path to the image file in the project directory */
  imagePath?: string;
}

export interface SpriteAnimationDef {
  animId: string;
  animName: string;
  frames: string[]; // spriteId references
  fps: number;
  loop: boolean;
  events: SpriteAnimEvent[];
  /**
   * Per-frame hitbox / hurtbox / push-box data.
   * Populated by the Hitbox Editor overlay in SpriteAnimationEditor.
   * Emitted each frame-change via SpriteAnimator.onHitboxes().
   */
  hitboxes?: HitboxFrame[];
}

export interface SpriteAnimEvent {
  frame: number;
  name: string;
}

// ============================================================
//  Hitbox / Hurtbox types  (Phase 1.3)
// ============================================================

/** The role of a collision box on a specific animation frame. */
export type HitboxType = 'hit' | 'hurt' | 'push';

/** A single axis-aligned box attached to an animation frame. */
export interface HitboxRect {
  /** Determines which collision response applies. */
  type: HitboxType;
  /** Pixel offset from the sprite's top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** All boxes for a specific frame index within an animation. */
export interface HitboxFrame {
  /** Zero-based frame index this data applies to. */
  frame: number;
  boxes: HitboxRect[];
}

// ============================================================
//  Color remap types  (Phase 1.2)
// ============================================================

/**
 * One color substitution entry for the palette-swap shader.
 * Colors are normalised [0-1] RGB — use THREE.Color.r/g/b or divide hex by 255.
 */
export interface ColorRemapEntry {
  /** Source color to match (approximate) */
  from: [number, number, number];
  /** Replacement color */
  to: [number, number, number];
}

// ---- Color-remap GLSL shaders (loaded once, shared across all instances) ----

const _COLOR_REMAP_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const _COLOR_REMAP_FRAG = /* glsl */`
precision mediump float;
uniform sampler2D map;
uniform int       remapCount;
uniform vec3      remapFrom[16];
uniform vec3      remapTo[16];
uniform float     remapTolerance;
uniform float     opacity;
uniform vec3      tintColor;
varying vec2      vUv;
void main() {
  vec4 texCol = texture2D(map, vUv);
  if (texCol.a < 0.01) discard;
  vec3 rgb = texCol.rgb;
  for (int i = 0; i < 16; i++) {
    if (i >= remapCount) break;
    if (length(rgb - remapFrom[i]) < remapTolerance) {
      rgb = remapTo[i];
      break;
    }
  }
  gl_FragColor = vec4(rgb * tintColor, texCol.a * opacity);
}`;

export class SpriteRenderer {
  public mesh: THREE.Mesh;
  public material: THREE.MeshBasicMaterial;
  public geometry: THREE.PlaneGeometry;
  public flipX = false;
  public flipY = false;
  public tint = 0xffffff;
  public opacity = 1.0;
  public currentSprite: SpriteData | null = null;
  public spriteSheet: SpriteSheetAsset | null = null;
  public pixelsPerUnit = 100;

  /** Active color-remap shader material. null → use standard MeshBasicMaterial. */
  private _remapMaterial: THREE.ShaderMaterial | null = null;
  /** Stored remap entries so setSprite() can keep the shader map in sync. */
  private _colorRemaps: ColorRemapEntry[] = [];

  constructor(pixelsPerUnit = 100) {
    this.pixelsPerUnit = pixelsPerUnit;
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  setTexture(texture: THREE.Texture): void {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.material.map = texture;
    this.material.needsUpdate = true;
    // Keep remap shader in sync when texture changes
    if (this._remapMaterial) {
      this._remapMaterial.uniforms['map'].value = texture;
    }
  }

  // ---- Phase 1.2: Color-remap / palette-swap ----------------------------------------

  /**
   * Apply a palette-swap shader that substitutes up to 16 colors at runtime.
   * Useful for team recolors, day/night palette shifts, status effects, etc.
   *
   * @param remaps  Array of { from, to } entries.  Up to 16 entries; extras ignored.
   * @param tolerance  Color-match distance threshold in [0-1] linear space (default 0.05).
   *
   * @example
   *   renderer.setColorRemap([
   *     { from: [0.8, 0.2, 0.2], to: [0.2, 0.6, 0.9] },  // red → blue uniform
   *   ]);
   */
  setColorRemap(remaps: ColorRemapEntry[], tolerance = 0.05): void {
    this._colorRemaps = remaps;
    if (remaps.length === 0) {
      this.clearColorRemap();
      return;
    }

    // Build uniform arrays (always 16 slots; unused slots stay zero)
    const fromVecs = Array.from({ length: 16 }, (_, i) =>
      remaps[i] ? new THREE.Vector3(...remaps[i].from) : new THREE.Vector3());
    const toVecs = Array.from({ length: 16 }, (_, i) =>
      remaps[i] ? new THREE.Vector3(...remaps[i].to)   : new THREE.Vector3());

    const tint = new THREE.Color(this.tint);

    if (!this._remapMaterial) {
      this._remapMaterial = new THREE.ShaderMaterial({
        vertexShader:   _COLOR_REMAP_VERT,
        fragmentShader: _COLOR_REMAP_FRAG,
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
        uniforms: {
          map:            { value: this.material.map ?? null },
          remapCount:     { value: Math.min(remaps.length, 16) },
          remapFrom:      { value: fromVecs },
          remapTo:        { value: toVecs },
          remapTolerance: { value: tolerance },
          opacity:        { value: this.opacity },
          tintColor:      { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
        },
      });
    } else {
      const u = this._remapMaterial.uniforms;
      u['map'].value            = this.material.map ?? null;
      u['remapCount'].value     = Math.min(remaps.length, 16);
      u['remapFrom'].value      = fromVecs;
      u['remapTo'].value        = toVecs;
      u['remapTolerance'].value = tolerance;
      u['opacity'].value        = this.opacity;
      u['tintColor'].value.set(tint.r, tint.g, tint.b);
    }

    this.mesh.material = this._remapMaterial;
  }

  /** Remove the palette-swap shader and restore the standard material. */
  clearColorRemap(): void {
    this._colorRemaps = [];
    if (this._remapMaterial) {
      this._remapMaterial.dispose();
      this._remapMaterial = null;
    }
    this.mesh.material = this.material;
  }

  /** True when a color-remap shader is currently active. */
  get hasColorRemap(): boolean {
    return this._remapMaterial !== null;
  }

  setSprite(sprite: SpriteData, texture?: THREE.Texture): void {
    this.currentSprite = sprite;
    if (texture) this.setTexture(texture);
    if (!this.material.map) return;

    const tex = this.material.map;
    const img = tex.image as HTMLImageElement | HTMLCanvasElement | { width: number; height: number } | null;
    if (!img) return;

    const texW = (img as any).width || 1;
    const texH = (img as any).height || 1;

    // Calculate UV coordinates
    const u0 = sprite.x / texW;
    const v0 = 1 - (sprite.y + sprite.height) / texH;
    const u1 = (sprite.x + sprite.width) / texW;
    const v1 = 1 - sprite.y / texH;

    // Apply flip
    const uMin = this.flipX ? u1 : u0;
    const uMax = this.flipX ? u0 : u1;
    const vMin = this.flipY ? v1 : v0;
    const vMax = this.flipY ? v0 : v1;

    // Update UVs directly — no geometry recreation
    const uvAttr = this.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const uvArray = uvAttr.array as Float32Array;
    // PlaneGeometry UV layout: [0]bottom-left, [1]bottom-right, [2]top-left, [3]top-right
    uvArray[0] = uMin; uvArray[1] = vMin;   // bottom-left
    uvArray[2] = uMax; uvArray[3] = vMin;   // bottom-right
    uvArray[4] = uMin; uvArray[5] = vMax;   // top-left
    uvArray[6] = uMax; uvArray[7] = vMax;   // top-right
    uvAttr.needsUpdate = true;

    // Scale mesh to match sprite pixel size in world units
    const worldW = sprite.width / this.pixelsPerUnit;
    const worldH = sprite.height / this.pixelsPerUnit;
    this.mesh.scale.set(worldW, worldH, 1);

    // Adjust position based on pivot
    const pivotOffX = (sprite.pivot.x - 0.5) * worldW;
    const pivotOffY = (sprite.pivot.y - 0.5) * worldH;
    this.mesh.position.set(-pivotOffX, -pivotOffY, 0);
  }

  setFlipX(flip: boolean): void {
    if (this.flipX === flip) return;
    this.flipX = flip;
    if (this.currentSprite) this.setSprite(this.currentSprite);
  }

  setFlipY(flip: boolean): void {
    if (this.flipY === flip) return;
    this.flipY = flip;
    if (this.currentSprite) this.setSprite(this.currentSprite);
  }

  setTint(color: number): void {
    this.tint = color;
    this.material.color.setHex(color);
    if (this._remapMaterial) {
      const c = new THREE.Color(color);
      (this._remapMaterial.uniforms['tintColor'].value as THREE.Vector3).set(c.r, c.g, c.b);
    }
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.material.opacity = opacity;
    if (this._remapMaterial) {
      this._remapMaterial.uniforms['opacity'].value = opacity;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this._remapMaterial?.dispose();
  }
}

// ============================================================
//  SpriteAnimator — Drives SpriteRenderer frame-by-frame
//  from sprite sheet animation definitions.
// ============================================================

export class SpriteAnimator {
  public spriteRenderer: SpriteRenderer;
  public spriteSheet: SpriteSheetAsset | null = null;
  public currentAnim: SpriteAnimationDef | null = null;
  public currentFrame = 0;
  public isPlaying = false;
  public playbackSpeed = 1.0;

  // Auto-sync variables (for AnimBP 2D)
  public variables: Record<string, any> = {
    speed: 0,
    velocityX: 0,
    velocityY: 0,
    isGrounded: false,
    isJumping: false,
    isFalling: false,
  };

  private _frameTimer = 0;
  private _onAnimEvent: ((eventName: string) => void) | null = null;
  private _onAnimFinished: ((animName: string) => void) | null = null;
  /** Callback fired on every frame-change with the active hitbox set. */
  private _onHitboxes: ((boxes: HitboxRect[], frame: number) => void) | null = null;

  constructor(spriteRenderer: SpriteRenderer) {
    this.spriteRenderer = spriteRenderer;
  }

  setSpriteSheet(sheet: SpriteSheetAsset): void {
    this.spriteSheet = sheet;
    this.spriteRenderer.spriteSheet = sheet;
    // Keep the renderer's pixelsPerUnit in sync with the sheet.
    if (sheet.pixelsPerUnit && sheet.pixelsPerUnit > 0) {
      this.spriteRenderer.pixelsPerUnit = sheet.pixelsPerUnit;
    }
    if (sheet.texture) {
      this.spriteRenderer.setTexture(sheet.texture);
    }
  }

  play(animName: string, restart = false): void {
    if (!this.spriteSheet) return;
    if (this.currentAnim?.animName === animName && this.isPlaying && !restart) return;

    const anim = this.spriteSheet.animations.find(a => a.animName === animName || a.animId === animName);
    if (!anim) return;

    this.currentAnim = anim;
    this.currentFrame = 0;
    this._frameTimer = 0;
    this.isPlaying = true;
    this._applyFrame();
  }

  stop(): void {
    this.isPlaying = false;
  }

  onAnimEvent(cb: (eventName: string) => void): void {
    this._onAnimEvent = cb;
  }

  onAnimFinished(cb: (animName: string) => void): void {
    this._onAnimFinished = cb;
  }

  /**
   * Register a callback invoked on every frame-change.
   * Receives the array of HitboxRects defined for that frame (may be empty)
   * and the zero-based frame index.
   *
   * @example
   *   animator.onHitboxes((boxes, frame) => {
   *     for (const box of boxes) {
   *       if (box.type === 'hit') checkHitCollision(box);
   *     }
   *   });
   */
  onHitboxes(cb: (boxes: HitboxRect[], frame: number) => void): void {
    this._onHitboxes = cb;
  }

  update(deltaTime: number): void {
    if (!this.isPlaying || !this.currentAnim || !this.spriteSheet) return;

    this._frameTimer += deltaTime * this.playbackSpeed;
    const frameDuration = 1.0 / this.currentAnim.fps;

    while (this._frameTimer >= frameDuration) {
      this._frameTimer -= frameDuration;
      const prevFrame = this.currentFrame;
      this.currentFrame++;

      if (this.currentFrame >= this.currentAnim.frames.length) {
        if (this.currentAnim.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = this.currentAnim.frames.length - 1;
          this.isPlaying = false;
          this._onAnimFinished?.(this.currentAnim.animName);
          break;
        }
      }

      // Check events and hitboxes on the new frame
      this._checkEvents(this.currentFrame);
      this._emitHitboxes(this.currentFrame);
    }

    this._applyFrame();
  }

  private _applyFrame(): void {
    if (!this.currentAnim || !this.spriteSheet) return;
    const frameId = this.currentAnim.frames[this.currentFrame];
    const sprite = this.spriteSheet.sprites.find(s => s.spriteId === frameId);
    if (sprite) {
      this.spriteRenderer.setSprite(sprite, this.spriteSheet.texture);
    }
  }

  private _checkEvents(frameIndex: number): void {
    if (!this.currentAnim) return;
    const events = this.currentAnim.events || [];
    for (const ev of events) {
      if (ev.frame === frameIndex) {
        this._onAnimEvent?.(ev.name);
      }
    }
  }

  /** Emit the hitbox set for the given frame index (can be an empty array). */
  private _emitHitboxes(frameIndex: number): void {
    if (!this._onHitboxes || !this.currentAnim) return;
    const hbFrames = this.currentAnim.hitboxes ?? [];
    const entry = hbFrames.find(f => f.frame === frameIndex);
    this._onHitboxes(entry?.boxes ?? [], frameIndex);
  }

  // ---- Auto-variable sync with RigidBody2D ----

  syncAutoVariables(actor: any): void {
    const rb = actor?.getComponent?.('RigidBody2D');
    if (!rb?.rigidBody) return;
    const vel = rb.rigidBody.linvel();
    // Use full 2D magnitude so top-down games also get non-zero speed
    this.variables.speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    this.variables.velocityX = vel.x;
    this.variables.velocityY = vel.y;
    this.variables.isGrounded = rb.isGrounded ?? false;
    this.variables.isJumping = vel.y > 50 && !rb.isGrounded;
    this.variables.isFalling = vel.y < -50 && !rb.isGrounded;
  }
}
