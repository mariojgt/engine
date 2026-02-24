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
}

export interface SpriteAnimEvent {
  frame: number;
  name: string;
}

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
  /** Visual scale multiplier applied on top of the sprite pixel-to-world size */
  public spriteScale: { x: number; y: number } = { x: 1, y: 1 };
  /** Visual offset in world units applied to the mesh position */
  public spriteOffset: { x: number; y: number } = { x: 0, y: 0 };

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

    // Scale mesh to match sprite pixel size in world units, with optional visual scale
    const worldW = (sprite.width / this.pixelsPerUnit) * this.spriteScale.x;
    const worldH = (sprite.height / this.pixelsPerUnit) * this.spriteScale.y;
    this.mesh.scale.set(worldW, worldH, 1);

    // Adjust position based on pivot + optional visual offset
    // Preserve existing Z — sorting layer logic sets mesh.position.z for draw order
    const pivotOffX = (sprite.pivot.x - 0.5) * worldW;
    const pivotOffY = (sprite.pivot.y - 0.5) * worldH;
    this.mesh.position.set(-pivotOffX + this.spriteOffset.x, -pivotOffY + this.spriteOffset.y, this.mesh.position.z);
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
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.material.opacity = opacity;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
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

  /** Cached sprite lookup map (spriteId → SpriteData) rebuilt when sheet changes */
  private _spriteMap = new Map<string, SpriteData>();

  constructor(spriteRenderer: SpriteRenderer) {
    this.spriteRenderer = spriteRenderer;
  }

  setSpriteSheet(sheet: SpriteSheetAsset): void {
    this.spriteSheet = sheet;
    this.spriteRenderer.spriteSheet = sheet;
    // Rebuild sprite lookup map for O(1) frame lookups
    this._spriteMap.clear();
    for (const s of sheet.sprites) {
      this._spriteMap.set(s.spriteId, s);
    }
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

      // Check events on the new frame
      this._checkEvents(this.currentFrame);
    }

    this._applyFrame();
  }

  private _applyFrame(): void {
    if (!this.currentAnim || !this.spriteSheet) return;
    const frameId = this.currentAnim.frames[this.currentFrame];
    const sprite = this._spriteMap.get(frameId);
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

  // ---- Auto-variable sync with RigidBody2D ----

  syncAutoVariables(actor: any): void {
    const rb = actor?.getComponent?.('RigidBody2D');
    if (!rb?.rigidBody) return;
    const vel = rb.rigidBody.linvel();
    this.variables.speed = Math.abs(vel.x);
    this.variables.velocityX = vel.x;
    this.variables.velocityY = vel.y;
    this.variables.isGrounded = rb.isGrounded ?? false;
    this.variables.isJumping = vel.y > 50 && !rb.isGrounded;
    this.variables.isFalling = vel.y < -50 && !rb.isGrounded;
  }
}
