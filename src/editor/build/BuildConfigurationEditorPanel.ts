// ============================================================
//  BuildConfigurationEditorPanel
//  Shown when a BuildConfiguration asset is opened.
//  Lets developers configure all build settings for a target platform.
// ============================================================

import { iconHTML, Icons, ICON_COLORS } from '../icons';
import type { ProjectManager } from '../ProjectManager';
import type { BuildConfigurationManager, BuildConfigurationJSON, BuildPlatform } from './BuildConfigurationAsset';
import {
  defaultWindowsSettings, defaultMacOSSettings, defaultLinuxSettings,
  defaultWebSettings, defaultAndroidSettings, defaultIOSSettings,
  defaultPS5Settings, defaultXboxSettings, defaultSwitchSettings,
} from './BuildConfigurationAsset';
import { BuildRunner } from './BuildRunner';
import type { DependencyAnalyzerContext } from './DependencyAnalyzer';

const PLATFORM_LABELS: Record<BuildPlatform, string> = {
  windows: 'Windows PC',
  macos: 'macOS',
  linux: 'Linux',
  web: 'Web (HTML5)',
  android: 'Android',
  ios: 'iOS',
  ps5: 'PlayStation 5  ⚠️ (requires SDK)',
  xbox: 'Xbox Series    ⚠️ (requires SDK)',
  switch: 'Nintendo Switch ⚠️ (requires SDK)',
};

const CONSOLE_PLATFORMS: BuildPlatform[] = ['ps5', 'xbox', 'switch'];

export class BuildConfigurationEditorPanel {
  public container: HTMLElement;

  private _config: BuildConfigurationJSON;
  private _manager: BuildConfigurationManager;
  private _projectManager: ProjectManager | null;
  private _analyzerCtxProvider: (() => DependencyAnalyzerContext) | null = null;
  private _activeRunner: BuildRunner | null = null;
  private _onSave: ((config: BuildConfigurationJSON) => void) | null = null;
  private _onBuild: ((configId: string) => void) | null = null;
  private _dirty = false;

  constructor(
    container: HTMLElement,
    config: BuildConfigurationJSON,
    manager: BuildConfigurationManager,
    projectManager: ProjectManager | null,
  ) {
    this.container = container;
    this._config = JSON.parse(JSON.stringify(config)); // deep clone
    this._manager = manager;
    this._projectManager = projectManager;
    this._build();
  }

  /** Wire up analyzer context provider for building from this panel */
  setAnalyzerContextProvider(fn: () => DependencyAnalyzerContext): void {
    this._analyzerCtxProvider = fn;
  }

  /** Wire up save callback */
  onSave(cb: (config: BuildConfigurationJSON) => void): void {
    this._onSave = cb;
  }

  /** Wire up build callback (delegates to BuildDashboardPanel) */
  onBuild(cb: (configId: string) => void): void {
    this._onBuild = cb;
  }

  refresh(config: BuildConfigurationJSON): void {
    this._config = JSON.parse(JSON.stringify(config));
    this._dirty = false;
    this._build();
  }

  // ── Main build ────────────────────────────────────────────────

  private _build(): void {
    this.container.innerHTML = '';
    this.container.className = 'panel build-config-panel';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    // ── Header ───────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '6px 10px';
    header.style.gap = '6px';
    header.style.flexShrink = '0';

    const title = document.createElement('span');
    title.style.fontWeight = 'bold';
    title.style.fontSize = '12px';
    title.innerHTML = `${iconHTML(Icons.Hammer, 'xs', ICON_COLORS.blue)} ${this._config.name}`;
    header.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '6px';

    const saveBtn = this._btn('Save', () => this._save(), Icons.Save);
    const buildBtn = this._btn('▶ Build', () => this._triggerBuild(), Icons.Play);
    buildBtn.style.background = '#1e6b3c';
    buildBtn.style.borderColor = '#2d9c5e';

    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(buildBtn);
    header.appendChild(btnGroup);
    this.container.appendChild(header);

    // ── Scrollable body ───────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.flex = '1';
    body.style.overflowY = 'auto';
    body.style.padding = '8px 10px';
    this.container.appendChild(body);

    // ── Sections ─────────────────────────────────────────────────
    body.appendChild(this._sectionGeneral());
    body.appendChild(this._sectionEntryPoint());
    body.appendChild(this._sectionScenes());
    body.appendChild(this._sectionCooking());
    body.appendChild(this._sectionOutput());
    body.appendChild(this._sectionIcons());
    body.appendChild(this._sectionPlatform());
  }

  // ── Section: General ─────────────────────────────────────────

  private _sectionGeneral(): HTMLElement {
    const g = this._config.general;
    return this._section('GENERAL', [
      this._textRow('Game Name', g.gameName, v => { g.gameName = v; this._dirty = true; }),
      this._textRow('Version', g.version, v => { g.version = v; this._dirty = true; }),
      this._row('Build Number', (() => {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex'; wrap.style.gap = '6px'; wrap.style.alignItems = 'center';
        const num = this._input(String(g.buildNumber), '50px');
        num.type = 'number';
        num.addEventListener('change', () => { g.buildNumber = parseInt(num.value) || 1; this._dirty = true; });
        const chk = this._checkbox(g.autoIncrementBuild, v => { g.autoIncrementBuild = v; this._dirty = true; });
        const lbl = document.createElement('label');
        lbl.style.fontSize = '10px'; lbl.style.color = '#aaa';
        lbl.textContent = 'auto-increment';
        wrap.appendChild(num); wrap.appendChild(chk); wrap.appendChild(lbl);
        return wrap;
      })()),
      this._textRow('Company Name', g.companyName, v => { g.companyName = v; this._dirty = true; }),
      this._row('Platform', (() => {
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;';
        for (const [value, label] of Object.entries(PLATFORM_LABELS)) {
          const opt = document.createElement('option');
          opt.value = value; opt.textContent = label;
          if (value === g.platform) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          g.platform = sel.value as BuildPlatform;
          // Update platform settings to defaults for new platform
          (this._config.platformSettings as any) = {
            platform: g.platform,
            settings: this._defaultPlatformSettings(g.platform),
          };
          this._dirty = true;
          this._build(); // rebuild UI to show platform-specific section
        });
        return sel;
      })()),
      this._row('Architecture', (() => {
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;';
        const archs = g.platform === 'macos' ? ['x64', 'arm64', 'universal'] :
                      g.platform === 'ios' ? ['arm64'] :
                      g.platform === 'android' ? ['arm64', 'x64'] :
                      ['x64', 'x86', 'arm64'];
        for (const a of archs) {
          const opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          if (a === g.architecture) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => { g.architecture = sel.value as any; this._dirty = true; });
        return sel;
      })()),
      this._row('Build Type', (() => {
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;';
        for (const t of ['debug', 'development', 'shipping']) {
          const opt = document.createElement('option');
          opt.value = t; opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
          if (t === g.buildType) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => { g.buildType = sel.value as any; this._dirty = true; });
        return sel;
      })()),
    ]);
  }

  // ── Section: Entry Point ─────────────────────────────────────

  private _sectionEntryPoint(): HTMLElement {
    const ep = this._config.entryPoint;

    const sceneSelect = document.createElement('select');
    sceneSelect.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;';
    const none = document.createElement('option'); none.value = ''; none.textContent = '(Loading scenes...)'; sceneSelect.appendChild(none);
    sceneSelect.addEventListener('change', () => { ep.startScene = sceneSelect.value; this._dirty = true; });

    // Async populate scene list
    if (this._projectManager) {
      this._projectManager.listScenes().then((scenes: string[]) => {
        sceneSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = '(Select scene...)';
        sceneSelect.appendChild(placeholder);
        for (const s of scenes) {
          const opt = document.createElement('option');
          opt.value = s; opt.textContent = s;
          if (s === ep.startScene) opt.selected = true;
          sceneSelect.appendChild(opt);
        }
        if (!ep.startScene && scenes.length > 0) {
          sceneSelect.value = '';
        }
      }).catch(() => {
        sceneSelect.innerHTML = '<option value="">(No scenes found)</option>';
      });
    } else {
      sceneSelect.innerHTML = '<option value="">(No project open)</option>';
    }

    return this._section('ENTRY POINT', [
      this._row('Start Scene', sceneSelect),
      this._textRow('Loading Screen', ep.loadingScreenTextureId || '(none)', v => { ep.loadingScreenTextureId = v; this._dirty = true; }),
      this._textRow('Splash Screen', ep.splashScreenTextureId || '(none)', v => { ep.splashScreenTextureId = v; this._dirty = true; }),
    ]);
  }

  // ── Section: Scenes ──────────────────────────────────────────

  private _sectionScenes(): HTMLElement {
    const wrapper = document.createElement('div');

    const buildContent = (scenes: string[]) => {
      // Sync config scenes list with actual project scenes
      for (const s of scenes) {
        if (!this._config.scenes.find(e => e.sceneName === s)) {
          this._config.scenes.push({ sceneName: s, included: true });
        }
      }
      // Remove scenes that no longer exist (only if we have a real list)
      if (scenes.length > 0) {
        this._config.scenes = this._config.scenes.filter(e => scenes.includes(e.sceneName));
      }

      wrapper.innerHTML = '';

      if (scenes.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#555;font-size:11px;font-style:italic;padding:4px 0;';
        empty.textContent = 'No scenes found. Open a project with scenes.';
        wrapper.appendChild(empty);
        return;
      }

      for (const entry of this._config.scenes) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px;';
        const chk = this._checkbox(entry.included, v => { entry.included = v; this._dirty = true; row.style.opacity = v ? '1' : '0.4'; });
        const lbl = document.createElement('span');
        lbl.style.color = entry.included ? '#ddd' : '#666';
        lbl.textContent = entry.sceneName;
        row.appendChild(chk); row.appendChild(lbl);
        wrapper.appendChild(row);
      }

      const autoBtn = this._btn('Auto-include all', () => {
        for (const entry of this._config.scenes) entry.included = true;
        this._dirty = true;
        buildContent(scenes);
      }, Icons.RefreshCw);
      autoBtn.style.marginTop = '4px';
      wrapper.appendChild(autoBtn);
    };

    // Populate async
    const loading = document.createElement('div');
    loading.style.cssText = 'color:#555;font-size:11px;padding:4px 0;';
    loading.textContent = 'Loading scenes…';
    wrapper.appendChild(loading);

    (this._projectManager?.listScenes() ?? Promise.resolve([])).then(buildContent);

    return this._section('INCLUDED SCENES', [wrapper]);
  }

  // ── Section: Asset Cooking ───────────────────────────────────

  private _sectionCooking(): HTMLElement {
    const c = this._config.cooking;

    const texFormats = ['none', 'bc1', 'bc3', 'bc7', 'etc2', 'astc', 'pvrtc', 'webp'];
    const audioFormats = ['ogg', 'mp3', 'aac', 'opus', 'wav'];

    return this._section('ASSET COOKING', [
      this._selectRow('Texture Compression', texFormats,
        c.textureCompression, v => { c.textureCompression = v as any; this._dirty = true; }),
      this._selectRow('Audio Format', audioFormats,
        c.audioFormat, v => { c.audioFormat = v as any; this._dirty = true; }),
      this._checkRow('Mesh Optimization', c.meshOptimization,
        v => { c.meshOptimization = v; this._dirty = true; }),
      this._checkRow('Blueprint Stripping', c.blueprintStripping,
        v => { c.blueprintStripping = v; this._dirty = true; }),
      this._checkRow('Asset Bundling (.pak)', c.assetBundling,
        v => { c.assetBundling = v; this._dirty = true; }),
      this._checkRow('Compress Bundles (LZ4)', c.compressBundles,
        v => { c.compressBundles = v; this._dirty = true; }),
      this._textRow('Max Texture Dimension', String(c.maxTextureDimension),
        v => { c.maxTextureDimension = parseInt(v) || 4096; this._dirty = true; }),
    ]);
  }

  // ── Section: Output ──────────────────────────────────────────

  private _sectionOutput(): HTMLElement {
    const o = this._config.output;
    return this._section('OUTPUT', [
      this._textRow('Output Directory', o.outputDirectory || '(default)', v => { o.outputDirectory = v; this._dirty = true; }),
      this._checkRow('Clean Before Build', o.cleanBeforeBuild,
        v => { o.cleanBeforeBuild = v; this._dirty = true; }),
      this._checkRow('Open Folder When Done', o.openFolderWhenDone,
        v => { o.openFolderWhenDone = v; this._dirty = true; }),
    ]);
  }

  // ── Section: Icons ────────────────────────────────────────────

  private _sectionIcons(): HTMLElement {
    const ic = this._config.icons;
    return this._section('ICONS & BRANDING', [
      this._textRow('Icon 16×16', ic.icon16TextureId || '(none)', v => { ic.icon16TextureId = v; this._dirty = true; }),
      this._textRow('Icon 32×32', ic.icon32TextureId || '(none)', v => { ic.icon32TextureId = v; this._dirty = true; }),
      this._textRow('Icon 256×256', ic.icon256TextureId || '(none)', v => { ic.icon256TextureId = v; this._dirty = true; }),
      this._textRow('Icon 512×512', ic.icon512TextureId || '(none)', v => { ic.icon512TextureId = v; this._dirty = true; }),
    ]);
  }

  // ── Section: Platform-specific ───────────────────────────────

  private _sectionPlatform(): HTMLElement {
    const platform = this._config.general.platform;
    const settings = (this._config.platformSettings as any).settings as any;
    const rows: HTMLElement[] = [];

    if (CONSOLE_PLATFORMS.includes(platform)) {
      rows.push(this._consoleSdkWarning(platform, settings));
    } else {
      switch (platform) {
        case 'windows': rows.push(...this._rowsWindows(settings)); break;
        case 'macos': rows.push(...this._rowsMacOS(settings)); break;
        case 'linux': rows.push(...this._rowsLinux(settings)); break;
        case 'web': rows.push(...this._rowsWeb(settings)); break;
        case 'android': rows.push(...this._rowsAndroid(settings)); break;
        case 'ios': rows.push(...this._rowsIOS(settings)); break;
      }
    }

    return this._section(`${PLATFORM_LABELS[platform].toUpperCase()} SETTINGS`, rows);
  }

  private _consoleSdkWarning(platform: BuildPlatform, settings: any): HTMLElement {
    const names: Record<string, { sdk: string; url: string }> = {
      ps5:    { sdk: 'PlayStation SDK (Sony Interactive Entertainment)', url: 'https://partners.playstation.net' },
      xbox:   { sdk: 'Microsoft GDK (Game Development Kit)', url: 'https://developer.microsoft.com/en-us/games/xbox/id-at-xbox' },
      switch: { sdk: 'NintendoSDK', url: 'https://developer.nintendo.com' },
    };
    const info = names[platform];

    const box = document.createElement('div');
    box.style.cssText = 'background:#2a1500;border:1px solid #a05a00;border-radius:4px;padding:10px;font-size:11px;color:#e0b060;line-height:1.6;';
    box.innerHTML = `
      <div style="font-weight:bold;font-size:12px;margin-bottom:6px;">⚠️ CONSOLE SDK REQUIRED</div>
      <div style="color:#ccc;margin-bottom:8px;">
        ${platform.toUpperCase()} builds require a licensed ${info.sdk}.<br>
        You must be a registered developer to access the SDK.
      </div>
      <div style="margin-bottom:4px;color:#aaa;">
        ⚠️ Note: This engine is TypeScript/WebGL-based. Console platforms require
        native compiled binaries. A complete native port would be needed for
        production console support.
      </div>
    `;

    const sdkRow = this._textRow('SDK Path', settings.sdkPath || '', v => {
      settings.sdkPath = v;
      this._dirty = true;
    });
    box.appendChild(sdkRow);

    const link = document.createElement('a');
    link.href = info.url;
    link.textContent = `Register as ${platform} Developer →`;
    link.style.cssText = 'display:block;margin-top:8px;color:#60a5fa;font-size:11px;cursor:pointer;';
    link.addEventListener('click', e => { e.preventDefault(); });
    box.appendChild(link);

    return box;
  }

  private _rowsWindows(s: any): HTMLElement[] {
    return [
      this._checkRow('Include DirectX 12', s.includeDX12, v => { s.includeDX12 = v; this._dirty = true; }),
      this._checkRow('Include Vulkan', s.includeVulkan, v => { s.includeVulkan = v; this._dirty = true; }),
      this._checkRow('Generate Installer (NSIS)', s.generateInstaller, v => { s.generateInstaller = v; this._dirty = true; }),
      this._checkRow('Bundle MSVC Redistributables', s.bundleMsvcRedist, v => { s.bundleMsvcRedist = v; this._dirty = true; }),
      this._textRow('Code Sign Certificate Path', s.codeSignCertPath || '', v => { s.codeSignCertPath = v; this._dirty = true; }),
    ];
  }

  private _rowsMacOS(s: any): HTMLElement[] {
    return [
      this._textRow('Min macOS Version', s.minOSVersion, v => { s.minOSVersion = v; this._dirty = true; }),
      this._textRow('Bundle ID', s.bundleId, v => { s.bundleId = v; this._dirty = true; }),
      this._checkRow('Create DMG', s.createDMG, v => { s.createDMG = v; this._dirty = true; }),
      this._checkRow('Notarize (requires signing)', s.notarize, v => { s.notarize = v; this._dirty = true; }),
      this._textRow('Code Sign Identity', s.codeSignIdentity || '', v => { s.codeSignIdentity = v; this._dirty = true; }),
    ];
  }

  private _rowsLinux(s: any): HTMLElement[] {
    return [
      this._selectRow('Bundle Format', ['appimage', 'flatpak', 'deb', 'rpm', 'folder'],
        s.bundleFormat, v => { s.bundleFormat = v; this._dirty = true; }),
      this._textRow('Target libc Version', s.targetLibcVersion, v => { s.targetLibcVersion = v; this._dirty = true; }),
    ];
  }

  private _rowsWeb(s: any): HTMLElement[] {
    return [
      this._textRow('Canvas Width', String(s.canvasWidth), v => { s.canvasWidth = parseInt(v) || 1920; this._dirty = true; }),
      this._textRow('Canvas Height', String(s.canvasHeight), v => { s.canvasHeight = parseInt(v) || 1080; this._dirty = true; }),
      this._checkRow('Allow Fullscreen', s.allowFullscreen, v => { s.allowFullscreen = v; this._dirty = true; }),
      this._checkRow('Compress Assets', s.compressAssets, v => { s.compressAssets = v; this._dirty = true; }),
      this._selectRow('WebGL Version', ['1', '2'], String(s.webglVersion),
        v => { s.webglVersion = parseInt(v); this._dirty = true; }),
      this._textRow('Memory Limit (MB)', String(s.memoryLimitMB), v => { s.memoryLimitMB = parseInt(v) || 512; this._dirty = true; }),
      this._checkRow('PWA Support', s.enablePWA, v => { s.enablePWA = v; this._dirty = true; }),
      this._infoRow('⚠️ Requires a web server to run — cannot open from file://'),
    ];
  }

  private _rowsAndroid(s: any): HTMLElement[] {
    return [
      this._textRow('Package Name', s.packageName, v => { s.packageName = v; this._dirty = true; }),
      this._textRow('Min SDK Version', String(s.minSdkVersion), v => { s.minSdkVersion = parseInt(v) || 26; this._dirty = true; }),
      this._textRow('Target SDK Version', String(s.targetSdkVersion), v => { s.targetSdkVersion = parseInt(v) || 34; this._dirty = true; }),
      this._selectRow('Output Format', ['apk', 'aab'], s.outputFormat,
        v => { s.outputFormat = v; this._dirty = true; }),
      this._selectRow('Orientation', ['portrait', 'landscape', 'auto'], s.orientation,
        v => { s.orientation = v; this._dirty = true; }),
      this._checkRow('Permission: Internet', s.permissionInternet, v => { s.permissionInternet = v; this._dirty = true; }),
      this._checkRow('Permission: Vibrate', s.permissionVibrate, v => { s.permissionVibrate = v; this._dirty = true; }),
      this._infoRow('Requires: Android SDK + NDK (ANDROID_HOME / NDK_HOME env vars)'),
    ];
  }

  private _rowsIOS(s: any): HTMLElement[] {
    return [
      this._textRow('Bundle ID', s.bundleId, v => { s.bundleId = v; this._dirty = true; }),
      this._textRow('Min iOS Version', s.minIOSVersion, v => { s.minIOSVersion = v; this._dirty = true; }),
      this._textRow('Team ID', s.teamId, v => { s.teamId = v; this._dirty = true; }),
      this._selectRow('Orientation', ['portrait', 'landscape', 'auto'], s.orientation,
        v => { s.orientation = v; this._dirty = true; }),
      this._infoRow('⚠️ iOS builds require macOS + Xcode. Output is an Xcode project for signing and submission.'),
    ];
  }

  // ── Actions ───────────────────────────────────────────────────

  private _save(): void {
    this._manager.update(this._config);
    this._onSave?.(this._config);
    this._dirty = false;
    // Update panel title
    const titleEl = this.container.querySelector('.panel-header span');
    if (titleEl) {
      titleEl.innerHTML = `${iconHTML(Icons.Hammer, 'xs', ICON_COLORS.blue)} ${this._config.name}`;
    }
  }

  private _triggerBuild(): void {
    if (this._dirty) this._save();
    this._onBuild?.(this._config.id);
  }

  // ── UI helpers ────────────────────────────────────────────────

  private _section(title: string, children: HTMLElement[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '16px';

    const head = document.createElement('div');
    head.style.cssText = 'font-size:10px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid #333;margin-bottom:6px;';
    head.textContent = title;
    wrap.appendChild(head);

    for (const child of children) wrap.appendChild(child);
    return wrap;
  }

  private _row(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'flex:0 0 160px;color:#aaa;';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  }

  private _textRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const inp = this._input(value, '');
    inp.style.flex = '1';
    inp.addEventListener('change', () => onChange(inp.value));
    return this._row(label, inp);
  }

  private _checkRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const chk = this._checkbox(value, onChange);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
    wrap.appendChild(chk);
    return this._row(label, wrap);
  }

  private _selectRow(label: string, options: string[], value: string, onChange: (v: string) => void): HTMLElement {
    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return this._row(label, sel);
  }

  private _infoRow(msg: string): HTMLElement {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:10px;color:#f59e0b;padding:4px 0 4px 8px;border-left:2px solid #f59e0b;margin:4px 0;';
    d.textContent = msg;
    return d;
  }

  private _input(value: string, width: string): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value;
    inp.style.cssText = `background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:3px 6px;font-size:11px;${width ? `width:${width};` : ''}`;
    return inp;
  }

  private _checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = value;
    chk.style.accentColor = '#60a5fa';
    chk.addEventListener('change', () => onChange(chk.checked));
    return chk;
  }

  private _btn(label: string, onClick: () => void, icon?: any): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = 'background:#2a2a2a;border:1px solid #555;border-radius:3px;color:#ddd;padding:4px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;';
    if (icon) btn.innerHTML = `${iconHTML(icon, 'xs')} ${label}`;
    else btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _defaultPlatformSettings(platform: BuildPlatform): any {
    switch (platform) {
      case 'windows': return defaultWindowsSettings();
      case 'macos':   return defaultMacOSSettings();
      case 'linux':   return defaultLinuxSettings();
      case 'web':     return defaultWebSettings();
      case 'android': return defaultAndroidSettings();
      case 'ios':     return defaultIOSSettings();
      case 'ps5':     return defaultPS5Settings();
      case 'xbox':    return defaultXboxSettings();
      case 'switch':  return defaultSwitchSettings();
    }
  }
}
