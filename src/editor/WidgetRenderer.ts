// ============================================================
//  WidgetRenderer — High-performance HTML Canvas widget renderer
//  Renders widget trees with texture support, 9-slice, tinting,
//  gradients, shadows, outlines, and glow effects.
//  Uses OffscreenCanvas for tint compositing.
// ============================================================

import { TextureLibrary } from './TextureLibrary';
import { FontLibrary } from './FontLibrary';
import type { WidgetNodeJSON, WidgetType } from './WidgetBlueprintData';

// ============================================================
//  Types
// ============================================================

export type TintMode = 'multiply' | 'overlay' | 'colorize' | 'screen' | 'add';

export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GradientStop {
  position: number;
  color: string;
  opacity?: number;
}

export interface GradientDef {
  enabled: boolean;
  type: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
}

export interface ShadowDef {
  enabled: boolean;
  color: string;
  offset: { x: number; y: number };
  blur: number;
}

export interface GlowDef {
  enabled: boolean;
  color: string;
  blur: number;
  strength: number;
}

export interface OutlineDef {
  enabled: boolean;
  color: string;
  width: number;
}

// ============================================================
//  WidgetRenderer
// ============================================================

export class WidgetRenderer {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _container: HTMLElement;
  private _textures: TextureLibrary;
  private _fonts: FontLibrary;

  private _widgets: Map<string, WidgetNodeJSON> = new Map();
  private _dirtyWidgets: Set<string> = new Set();
  private _cachedImages: Map<string, HTMLImageElement> = new Map();

  // Performance: static widget caching
  private _staticCache: Map<string, { canvas: OffscreenCanvas; rect: WidgetRect }> = new Map();
  private _staticWidgets: Set<string> = new Set();

  private _resizeObserver: ResizeObserver | null = null;
  private _animFrameId: number = 0;
  private _running = false;

  constructor(container: HTMLElement, textures: TextureLibrary, fonts: FontLibrary) {
    this._container = container;
    this._textures = textures;
    this._fonts = fonts;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 100;
    `;
    this._ctx = this._canvas.getContext('2d')!;
    this._container.appendChild(this._canvas);

    this._setupResizeObserver();
  }

  // ---- Lifecycle ----

  start(): void {
    if (this._running) return;
    this._running = true;
    this._renderLoop();
  }

  stop(): void {
    this._running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = 0;
    }
  }

  destroy(): void {
    this.stop();
    this._resizeObserver?.disconnect();
    this._canvas.remove();
    this._staticCache.clear();
    this._cachedImages.clear();
  }

  // ---- Widget Management ----

  setWidgets(widgets: Map<string, WidgetNodeJSON>): void {
    this._widgets = widgets;
    this.dirtyAll();
  }

  getWidget(id: string): WidgetNodeJSON | undefined {
    return this._widgets.get(id);
  }

  markDirty(widgetId: string): void {
    this._dirtyWidgets.add(widgetId);
    // Also invalidate static cache
    this._staticCache.delete(widgetId);
  }

  dirtyAll(): void {
    this._widgets.forEach((_, id) => this._dirtyWidgets.add(id));
    this._staticCache.clear();
  }

  // ---- Performance: static caching ----

  markStatic(widgetId: string): void {
    this._staticWidgets.add(widgetId);
  }

  markDynamic(widgetId: string): void {
    this._staticWidgets.delete(widgetId);
    this._staticCache.delete(widgetId);
  }

  // ---- Canvas dimensions ----

  get canvasWidth(): number { return this._canvas.width; }
  get canvasHeight(): number { return this._canvas.height; }

  // ---- Render ----

  render(): void {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    const sorted = [...this._widgets.values()]
      .filter(w => w.visibility !== 'Collapsed' && w.visibility !== 'Hidden')
      .sort((a, b) => (a.slot.zOrder || 0) - (b.slot.zOrder || 0));

    for (const widget of sorted) {
      ctx.save();
      this.renderWidget(widget, { x: 0, y: 0, width: this._canvas.width, height: this._canvas.height });
      ctx.restore();
    }
  }

  renderWidget(widget: WidgetNodeJSON, parentRect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const rect = this._computeRect(widget, parentRect);

    // Global opacity
    ctx.globalAlpha = widget.renderOpacity ?? 1.0;

    // Render transform
    if (widget.renderAngle || (widget.renderScale.x !== 1 || widget.renderScale.y !== 1)) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      ctx.translate(cx, cy);
      if (widget.renderAngle) {
        ctx.rotate(widget.renderAngle * Math.PI / 180);
      }
      ctx.scale(widget.renderScale.x, widget.renderScale.y);
      ctx.translate(-cx, -cy);
    }

    // Render by type
    switch (widget.type) {
      case 'Image': this._renderImage(widget, rect); break;
      case 'Button': this._renderButton(widget, rect); break;
      case 'Text':
      case 'RichText': this._renderText(widget, rect); break;
      case 'ProgressBar': this._renderProgressBar(widget, rect); break;
      case 'Border': this._renderBorder(widget, rect); break;
      case 'Slider': this._renderSlider(widget, rect); break;
      default: break; // Container types — just render children
    }

    // Render children
    if (widget.children) {
      for (const childId of widget.children) {
        const child = this._widgets.get(childId);
        if (child && child.visibility !== 'Collapsed' && child.visibility !== 'Hidden') {
          ctx.save();
          this.renderWidget(child, rect);
          ctx.restore();
        }
      }
    }
  }

  // ---- Type-specific renderers ----

  private _renderImage(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.imageProps;
    if (!props) return;

    // Gradient override
    if ((props as any).gradient?.enabled) {
      this._fillGradient(ctx, rect, (props as any).gradient);
      return;
    }

    // Texture rendering
    if (props.imageSource) {
      const img = this._getCachedImage(props.imageSource);
      if (img && img.complete && img.naturalWidth > 0) {
        const nineSlice = (props as any).nineSlice;
        const uv = (props as any).uvRect as { x: number; y: number; width: number; height: number } | undefined;
        if (nineSlice?.enabled) {
          this._renderNineSlice(ctx, img, rect, nineSlice.margins);
        } else {
          // Tinted or normal
          const tint = props.tintColor;
          const tintMode = (props as any).tintMode as TintMode | undefined;
          const tintStrength = (props as any).tintStrength ?? 1.0;

          // Determine source region (uvRect support for sprite sheets)
          const hasUV = uv && !(uv.x === 0 && uv.y === 0 && uv.width === 1 && uv.height === 1);
          const sx = hasUV ? uv!.x * img.naturalWidth : 0;
          const sy = hasUV ? uv!.y * img.naturalHeight : 0;
          const sw = hasUV ? uv!.width * img.naturalWidth : img.naturalWidth;
          const sh = hasUV ? uv!.height * img.naturalHeight : img.naturalHeight;

          if (tint && tint !== '#ffffff' && tint !== '#FFFFFF') {
            if (hasUV) {
              // Render sub-rect to offscreen then tint
              const off = new OffscreenCanvas(Math.ceil(sw), Math.ceil(sh));
              const offCtx = off.getContext('2d')!;
              offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
              this._renderTintedImage(ctx, off as any, rect, tint, tintMode || 'multiply', tintStrength);
            } else {
              this._renderTintedImage(ctx, img, rect, tint, tintMode || 'multiply', tintStrength);
            }
          } else {
            if (hasUV) {
              ctx.drawImage(img, sx, sy, sw, sh, rect.x, rect.y, rect.width, rect.height);
            } else {
              ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
            }
          }
        }
      } else {
        // Placeholder
        ctx.fillStyle = props.tintColor || '#333';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.min(rect.width, rect.height) * 0.4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('IMG', rect.x + rect.width / 2, rect.y + rect.height / 2);
        ctx.textAlign = 'start';
      }
    }

    // Effects
    this._applyEffects(ctx, rect, props as any);
  }

  private _renderButton(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.buttonProps;
    if (!props) return;

    // Determine current state colors
    const state = (widget as any).currentState || 'normal';
    let bgColor: string;
    switch (state) {
      case 'hovered': bgColor = props.hoveredColor; break;
      case 'pressed': bgColor = props.pressedColor; break;
      case 'disabled': bgColor = props.disabledColor; break;
      default: bgColor = props.normalColor;
    }

    // Check for texture backgrounds
    const stateTextures = (props as any).stateTextures;
    if (stateTextures?.[state]) {
      const texId = stateTextures[state];
      const img = this._getCachedImage(texId);
      if (img && img.complete && img.naturalWidth > 0) {
        const nineSlice = (props as any).nineSlice;
        if (nineSlice?.enabled) {
          this._renderNineSlice(ctx, img, rect, nineSlice.margins);
        } else {
          ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
        }

        // Tint over texture
        const tint = (props as any).stateTints?.[state];
        if (tint && tint !== '#ffffff' && tint !== '#FFFFFF') {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = tint;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        this._drawButtonBg(ctx, rect, bgColor, props.borderRadius, props.borderWidth, props.borderColor);
      }
    } else {
      // Gradient background
      const gradientBg = (props as any).gradient;
      if (gradientBg?.enabled) {
        this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, props.borderRadius || 0);
        ctx.fillStyle = this._createGradient(ctx, rect, gradientBg);
        ctx.fill();
      } else {
        this._drawButtonBg(ctx, rect, bgColor, props.borderRadius, props.borderWidth, props.borderColor);
      }
    }

    // Render button content (icon + text if present)
    const content = (props as any).content;
    if (content) {
      this._renderButtonContent(ctx, widget, rect, content);
    }
  }

  private _drawButtonBg(
    ctx: CanvasRenderingContext2D, rect: WidgetRect,
    color: string, radius: number, borderWidth: number, borderColor: string,
  ): void {
    ctx.fillStyle = color;
    this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius || 0);
    ctx.fill();
    if (borderWidth) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius || 0);
      ctx.stroke();
    }
  }

  private _renderButtonContent(
    ctx: CanvasRenderingContext2D,
    widget: WidgetNodeJSON,
    rect: WidgetRect,
    content: any,
  ): void {
    const padding = content.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    let contentX = rect.x + (padding.left || 0);
    const contentY = rect.y + rect.height / 2;

    // Icon
    if (content.icon?.texture) {
      const img = this._getCachedImage(content.icon.texture);
      if (img && img.complete && img.naturalWidth > 0) {
        const iw = content.icon.size?.width || 24;
        const ih = content.icon.size?.height || 24;
        ctx.drawImage(img, contentX, contentY - ih / 2, iw, ih);
        contentX += iw + (content.icon.padding || 8);
      }
    }

    // Text
    if (content.text) {
      const fontFamily = content.text.font
        ? (this._fonts.resolveFontFamily(content.text.font))
        : 'Arial, sans-serif';
      const fontSize = content.text.size || 16;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = content.text.color || '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(
        content.text.value || '',
        contentX + (rect.width - contentX + rect.x - (padding.right || 0)) / 2,
        contentY,
      );
      ctx.textAlign = 'start';
    }
  }

  private _renderText(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.textProps;
    if (!props) return;

    // Resolve font
    const fontAsset = (props as any).fontAsset;
    const fontFamily = fontAsset
      ? this._fonts.resolveFontFamily(fontAsset)
      : props.fontFamily || 'Arial, sans-serif';

    const fontSize = props.fontSize || 16;
    const fontWeight = props.isBold ? 'bold' : ((props as any).fontWeight || 'normal');
    const fontStyle = props.isItalic ? 'italic' : ((props as any).fontStyle || 'normal');
    const letterSpacing = (props as any).letterSpacing || 0;

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';

    // Justification
    switch (props.justification) {
      case 'Center': ctx.textAlign = 'center'; break;
      case 'Right': ctx.textAlign = 'right'; break;
      default: ctx.textAlign = 'left';
    }

    let textX: number;
    switch (props.justification) {
      case 'Center': textX = rect.x + rect.width / 2; break;
      case 'Right': textX = rect.x + rect.width; break;
      default: textX = rect.x + 2;
    }
    const textY = rect.y + rect.height / 2;

    const text = props.text || '';

    // Letter spacing (manual rendering if needed)
    if (letterSpacing && letterSpacing !== 0) {
      (ctx as any).letterSpacing = `${letterSpacing}px`;
    }

    // Gradient text
    const gradient = (props as any).gradient;
    if (gradient?.enabled) {
      ctx.fillStyle = this._createTextGradient(ctx, rect, gradient);
    } else {
      ctx.fillStyle = props.color || '#FFFFFF';
    }

    // Shadow
    const shadow: ShadowDef = (props as any).shadow || {
      enabled: !!props.shadowColor,
      color: props.shadowColor || '#000000',
      offset: props.shadowOffset || { x: 0, y: 0 },
      blur: (props as any).shadowBlur || 0,
    };
    if (shadow.enabled && shadow.color) {
      ctx.shadowColor = shadow.color;
      ctx.shadowOffsetX = shadow.offset?.x || 0;
      ctx.shadowOffsetY = shadow.offset?.y || 0;
      ctx.shadowBlur = shadow.blur || 0;
    }

    // Outline (drawn first, behind text)
    const outline: OutlineDef | undefined = (props as any).outline;
    if (outline?.enabled) {
      ctx.strokeStyle = outline.color || '#000000';
      ctx.lineWidth = (outline.width || 2) * 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, textX, textY);
    }

    // Main text
    if (props.autoWrap) {
      this._renderWrappedText(ctx, text, textX, rect.y, rect.width, rect.height, fontSize);
    } else {
      ctx.fillText(text, textX, textY);
    }

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;

    // Reset letter spacing
    if (letterSpacing) {
      (ctx as any).letterSpacing = '0px';
    }

    ctx.textAlign = 'start';
  }

  private _renderWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    fontSize: number,
  ): void {
    const lineHeight = fontSize * 1.3;
    const words = text.split(' ');
    let line = '';
    let lineY = y + fontSize;

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
        if (lineY > y + maxHeight) break;
      } else {
        line = testLine;
      }
    }
    if (lineY <= y + maxHeight) {
      ctx.fillText(line, x, lineY);
    }
  }

  private _renderProgressBar(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.progressBarProps;
    if (!props) return;

    const percent = Math.max(0, Math.min(1, props.percent || 0));
    const radius = props.borderRadius || 0;
    const dir = props.fillDirection || 'LeftToRight';

    // Background
    const bgTex = (props as any).backgroundTexture;
    if (bgTex) {
      const img = this._getCachedImage(bgTex);
      if (img && img.complete && img.naturalWidth > 0) {
        const bgNs = (props as any).backgroundNineSlice;
        if (bgNs?.enabled) {
          this._renderNineSlice(ctx, img, rect, bgNs.margins);
        } else {
          ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
        }
      } else {
        ctx.fillStyle = props.backgroundColor || '#333';
        this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = props.backgroundColor || '#333';
      this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
      ctx.fill();
    }

    // Compute fill rect based on direction
    let fillRect: WidgetRect;
    switch (dir) {
      case 'RightToLeft':
        fillRect = { x: rect.x + rect.width * (1 - percent), y: rect.y, width: rect.width * percent, height: rect.height };
        break;
      case 'TopToBottom':
        fillRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height * percent };
        break;
      case 'BottomToTop':
        fillRect = { x: rect.x, y: rect.y + rect.height * (1 - percent), width: rect.width, height: rect.height * percent };
        break;
      default: // LeftToRight
        fillRect = { x: rect.x, y: rect.y, width: rect.width * percent, height: rect.height };
    }

    if (fillRect.width <= 0 || fillRect.height <= 0) return;

    // Fill
    ctx.save();
    this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.clip();

    const fillTex = (props as any).fillTexture;
    const fillNs = (props as any).fillNineSlice;
    if (fillTex) {
      const fImg = this._getCachedImage(fillTex);
      if (fImg && fImg.complete && fImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(fillRect.x, fillRect.y, fillRect.width, fillRect.height);
        ctx.clip();
        if (fillNs?.enabled) {
          this._renderNineSlice(ctx, fImg, rect, fillNs.margins);
        } else {
          ctx.drawImage(fImg, rect.x, rect.y, rect.width, rect.height);
        }
        ctx.restore();
      } else {
        this._drawProgressFillColor(ctx, fillRect, rect, props);
      }
    } else {
      this._drawProgressFillColor(ctx, fillRect, rect, props);
    }
    ctx.restore();
  }

  private _drawProgressFillColor(
    ctx: CanvasRenderingContext2D, fillRect: WidgetRect, fullRect: WidgetRect, props: any,
  ): void {
    const fillGradient = props.fillGradient;
    if (fillGradient?.enabled) {
      ctx.fillStyle = this._createGradient(ctx, fullRect, fillGradient);
    } else {
      ctx.fillStyle = props.fillColor || '#2a9d8f';
    }
    ctx.fillRect(fillRect.x, fillRect.y, fillRect.width, fillRect.height);
  }

  private _renderBorder(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.borderProps;
    if (!props) return;

    const radius = props.borderRadius || 0;

    // Background texture or color or gradient
    if (props.backgroundImage) {
      const img = this._getCachedImage(props.backgroundImage);
      if (img && img.complete && img.naturalWidth > 0) {
        const nineSlice = (props as any).nineSlice;
        if (nineSlice?.enabled) {
          this._renderNineSlice(ctx, img, rect, nineSlice.margins);
        } else {
          ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
        }
      } else {
        ctx.fillStyle = props.backgroundColor;
        this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
        ctx.fill();
      }
    } else {
      const gradient = (props as any).gradient;
      if (gradient?.enabled) {
        this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
        ctx.fillStyle = this._createGradient(ctx, rect, gradient);
        ctx.fill();
      } else {
        ctx.fillStyle = props.backgroundColor;
        this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
        ctx.fill();
      }
    }

    // Border stroke
    if (props.borderWidth > 0) {
      ctx.strokeStyle = props.borderColor;
      ctx.lineWidth = props.borderWidth;
      this._roundRect(ctx, rect.x, rect.y, rect.width, rect.height, radius);
      ctx.stroke();
    }
  }

  private _renderSlider(widget: WidgetNodeJSON, rect: WidgetRect): void {
    const { _ctx: ctx } = this;
    const props = widget.sliderProps;
    if (!props) return;

    const val = Math.max(0, Math.min(1, props.value || 0));
    const isVertical = props.orientation === 'Vertical';
    
    // Determine dimensions
    let trackRect: WidgetRect;
    let fillRect: WidgetRect;
    let handlePos: { x: number, y: number };
    let handleSize = props.handleSize || { width: rect.height * 0.7, height: rect.height * 0.7 };

    if (isVertical) {
      // Logic for vertical slider... simplified for now as similar logic
      const trackW = Math.max(4, rect.width * 0.3);
      trackRect = {
        x: rect.x + (rect.width - trackW) / 2,
        y: rect.y,
        width: trackW,
        height: rect.height
      };
      fillRect = {
        x: trackRect.x,
        y: rect.y + rect.height * (1 - val),
        width: trackW,
        height: rect.height * val
      };
      handlePos = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height * (1 - val)
      };
    } else {
      const trackH = Math.max(4, rect.height * 0.3);
      trackRect = {
        x: rect.x,
        y: rect.y + (rect.height - trackH) / 2,
        width: rect.width,
        height: trackH
      };
      fillRect = {
        x: trackRect.x,
        y: trackRect.y,
        width: trackRect.width * val,
        height: trackH
      };
      handlePos = {
        x: rect.x + rect.width * val,
        y: rect.y + rect.height / 2
      };
    }

    // 1. Draw Track
    if (props.trackTexture) {
      const img = this._getCachedImage(props.trackTexture);
      if (img) {
         if (props.trackNineSlice?.enabled) {
           this._renderNineSlice(ctx, img, trackRect, props.trackNineSlice.margins);
         } else {
           ctx.drawImage(img, trackRect.x, trackRect.y, trackRect.width, trackRect.height);
         }
      }
    } else {
      ctx.fillStyle = props.trackColor || '#444';
      ctx.fillRect(trackRect.x, trackRect.y, trackRect.width, trackRect.height);
    }

    // 2. Draw Fill
    if (props.fillTexture) {
      const img = this._getCachedImage(props.fillTexture);
      if (img) {
         if (props.fillNineSlice?.enabled) {
           this._renderNineSlice(ctx, img, fillRect, props.fillNineSlice.margins);
         } else {
           // Clip or stretch? usually stretch for fill bars unless it's a progress bar style
           ctx.drawImage(img, fillRect.x, fillRect.y, fillRect.width, fillRect.height);
         }
      }
    } else {
      ctx.fillStyle = props.fillColor || '#2a9d8f';
      ctx.fillRect(fillRect.x, fillRect.y, fillRect.width, fillRect.height);
    }

    // 3. Draw Handle
    if (props.handleTexture) {
      const img = this._getCachedImage(props.handleTexture);
      if (img) {
        // Center image on handlePos
        const hRect = {
          x: handlePos.x - handleSize.width / 2,
          y: handlePos.y - handleSize.height / 2,
          width: handleSize.width,
          height: handleSize.height
        };
        ctx.drawImage(img, hRect.x, hRect.y, hRect.width, hRect.height);
      }
    } else {
      ctx.fillStyle = props.handleColor || '#fff';
      ctx.beginPath();
      // Default circular handle
      const radius = Math.min(handleSize.width, handleSize.height) / 2;
      ctx.arc(handlePos.x, handlePos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Image processing ----

  private _renderTintedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    rect: WidgetRect,
    tint: string,
    mode: TintMode,
    strength: number,
  ): void {
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    try {
      const offscreen = new OffscreenCanvas(w, h);
      const offCtx = offscreen.getContext('2d')!;

      // Draw original image
      offCtx.drawImage(img, 0, 0, w, h);

      // Apply tint
      offCtx.globalAlpha = strength;
      switch (mode) {
        case 'multiply':
          offCtx.globalCompositeOperation = 'multiply';
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
          // Restore alpha from original
          offCtx.globalCompositeOperation = 'destination-in';
          offCtx.globalAlpha = 1;
          offCtx.drawImage(img, 0, 0, w, h);
          break;
        case 'overlay':
          offCtx.globalCompositeOperation = 'overlay';
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
          break;
        case 'screen':
          offCtx.globalCompositeOperation = 'screen';
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
          break;
        case 'colorize':
          offCtx.globalCompositeOperation = 'saturation';
          offCtx.globalAlpha = 1;
          offCtx.fillStyle = '#808080';
          offCtx.fillRect(0, 0, w, h);
          offCtx.globalCompositeOperation = 'hue';
          offCtx.globalAlpha = strength;
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
          break;
        case 'add':
          offCtx.globalCompositeOperation = 'lighter';
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
          break;
        default:
          offCtx.globalCompositeOperation = 'source-atop';
          offCtx.fillStyle = tint;
          offCtx.fillRect(0, 0, w, h);
      }

      ctx.drawImage(offscreen, rect.x, rect.y);
    } catch {
      // Fallback: draw without tint
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
    }
  }

  private _renderNineSlice(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    rect: WidgetRect,
    margins?: { top: number; right: number; bottom: number; left: number },
  ): void {
    const m = margins || { top: 10, right: 10, bottom: 10, left: 10 };
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    // Clamp margins so they don't exceed the image
    const mt = Math.min(m.top, ih / 2);
    const mb = Math.min(m.bottom, ih / 2);
    const ml = Math.min(m.left, iw / 2);
    const mr = Math.min(m.right, iw / 2);

    const regions: [number, number, number, number, number, number, number, number][] = [
      // [sx, sy, sw, sh, dx, dy, dw, dh]
      // Top-left
      [0, 0, ml, mt, rect.x, rect.y, ml, mt],
      // Top-center
      [ml, 0, iw - ml - mr, mt, rect.x + ml, rect.y, rect.width - ml - mr, mt],
      // Top-right
      [iw - mr, 0, mr, mt, rect.x + rect.width - mr, rect.y, mr, mt],
      // Middle-left
      [0, mt, ml, ih - mt - mb, rect.x, rect.y + mt, ml, rect.height - mt - mb],
      // Middle-center
      [ml, mt, iw - ml - mr, ih - mt - mb, rect.x + ml, rect.y + mt, rect.width - ml - mr, rect.height - mt - mb],
      // Middle-right
      [iw - mr, mt, mr, ih - mt - mb, rect.x + rect.width - mr, rect.y + mt, mr, rect.height - mt - mb],
      // Bottom-left
      [0, ih - mb, ml, mb, rect.x, rect.y + rect.height - mb, ml, mb],
      // Bottom-center
      [ml, ih - mb, iw - ml - mr, mb, rect.x + ml, rect.y + rect.height - mb, rect.width - ml - mr, mb],
      // Bottom-right
      [iw - mr, ih - mb, mr, mb, rect.x + rect.width - mr, rect.y + rect.height - mb, mr, mb],
    ];

    for (const [sx, sy, sw, sh, dx, dy, dw, dh] of regions) {
      if (dw > 0 && dh > 0 && sw > 0 && sh > 0) {
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      }
    }
  }

  // ---- Gradient helpers ----

  private _fillGradient(ctx: CanvasRenderingContext2D, rect: WidgetRect, gradientDef: GradientDef): void {
    ctx.fillStyle = this._createGradient(ctx, rect, gradientDef);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private _createGradient(ctx: CanvasRenderingContext2D, rect: WidgetRect, def: GradientDef): CanvasGradient {
    let gradient: CanvasGradient;

    if (def.type === 'radial') {
      gradient = ctx.createRadialGradient(
        rect.x + rect.width / 2, rect.y + rect.height / 2, 0,
        rect.x + rect.width / 2, rect.y + rect.height / 2,
        Math.max(rect.width, rect.height) / 2,
      );
    } else {
      const angle = (def.angle || 0) * Math.PI / 180;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const len = Math.sqrt(rect.width ** 2 + rect.height ** 2) / 2;
      gradient = ctx.createLinearGradient(
        cx - Math.cos(angle) * len,
        cy - Math.sin(angle) * len,
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len,
      );
    }

    for (const stop of (def.stops || [])) {
      gradient.addColorStop(stop.position, stop.color);
    }

    return gradient;
  }

  private _createTextGradient(ctx: CanvasRenderingContext2D, rect: WidgetRect, def: GradientDef): CanvasGradient {
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
    for (const stop of (def.stops || [])) {
      gradient.addColorStop(stop.position, stop.color);
    }
    return gradient;
  }

  // ---- Effects ----

  private _applyEffects(ctx: CanvasRenderingContext2D, rect: WidgetRect, props: any): void {
    const effects = props?.effects;
    if (!effects) return;

    if (effects.shadow?.enabled) {
      ctx.shadowColor = effects.shadow.color || '#000';
      ctx.shadowOffsetX = effects.shadow.offset?.x || 5;
      ctx.shadowOffsetY = effects.shadow.offset?.y || 5;
      ctx.shadowBlur = effects.shadow.blur || 10;
    }

    if (effects.glow?.enabled) {
      ctx.shadowColor = effects.glow.color || '#FFF';
      ctx.shadowBlur = effects.glow.blur || 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (effects.outline?.enabled) {
      ctx.strokeStyle = effects.outline.color || '#FFF';
      ctx.lineWidth = effects.outline.width || 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  // ---- Drawing helpers ----

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---- Image caching ----

  private _getCachedImage(textureRef: string): HTMLImageElement | null {
    if (!textureRef) return null;

    // Check cache first
    if (this._cachedImages.has(textureRef)) {
      return this._cachedImages.get(textureRef)!;
    }

    // Try TextureLibrary
    const img = this._textures.getImage(textureRef);
    if (img) {
      this._cachedImages.set(textureRef, img);
      if (!img.complete) {
        img.onload = () => this.dirtyAll();
      }
      return img;
    }

    // Try as direct data URL
    if (textureRef.startsWith('data:')) {
      const newImg = new Image();
      newImg.src = textureRef;
      this._cachedImages.set(textureRef, newImg);
      newImg.onload = () => this.dirtyAll();
      return newImg;
    }

    return null;
  }

  // ---- Layout calculation ----

  private _computeRect(widget: WidgetNodeJSON, parentRect: WidgetRect): WidgetRect {
    const slot = widget.slot;
    const anchor = slot.anchor;

    const x = parentRect.x + anchor.minX * parentRect.width + slot.offsetX;
    const y = parentRect.y + anchor.minY * parentRect.height + slot.offsetY;

    let w: number, h: number;
    if (anchor.minX === anchor.maxX) {
      w = slot.sizeX;
    } else {
      w = (anchor.maxX - anchor.minX) * parentRect.width;
    }
    if (anchor.minY === anchor.maxY) {
      h = slot.sizeY;
    } else {
      h = (anchor.maxY - anchor.minY) * parentRect.height;
    }

    return { x, y, width: w, height: h };
  }

  // ---- Resize ----

  private _setupResizeObserver(): void {
    this._resizeObserver = new ResizeObserver(() => {
      this._canvas.width = this._container.clientWidth * window.devicePixelRatio;
      this._canvas.height = this._container.clientHeight * window.devicePixelRatio;
      this.dirtyAll();
    });
    this._resizeObserver.observe(this._container);
  }

  // ---- Render loop ----

  private _renderLoop = (): void => {
    if (!this._running) return;

    if (this._dirtyWidgets.size > 0) {
      this.render();
      this._dirtyWidgets.clear();
    }

    this._animFrameId = requestAnimationFrame(this._renderLoop);
  };
}
