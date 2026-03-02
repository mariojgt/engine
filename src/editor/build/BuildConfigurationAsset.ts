// ============================================================
//  BuildConfigurationAsset — Game Build Configuration
//  Stores all settings required to produce a shippable build
//  for a specific platform. Modelled after UE's Project Settings.
//
//  Serialized as JSON to <projectRoot>/Builds/<name>.buildconfig.json
// ============================================================

export type BuildPlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'web'
  | 'android'
  | 'ios'
  | 'ps5'
  | 'xbox'
  | 'switch';

export type BuildType = 'debug' | 'development' | 'shipping';
export type Architecture = 'x64' | 'x86' | 'arm64' | 'universal';
export type TextureCompression = 'none' | 'bc1' | 'bc3' | 'bc7' | 'etc2' | 'astc' | 'pvrtc' | 'webp';
export type AudioFormat = 'ogg' | 'mp3' | 'aac' | 'opus' | 'wav';
export type BundleFormat = 'appimage' | 'flatpak' | 'deb' | 'rpm' | 'folder';
export type AndroidOutputFormat = 'apk' | 'aab';
export type LoadingStrategy = 'progressive' | 'full';

// ── General settings (all platforms) ────────────────────────

export interface BuildGeneralSettings {
  gameName: string;
  version: string;
  buildNumber: number;
  autoIncrementBuild: boolean;
  companyName: string;
  platform: BuildPlatform;
  architecture: Architecture;
  buildType: BuildType;
}

// ── Entry point settings ─────────────────────────────────────

export interface BuildEntryPointSettings {
  /** Scene name (without extension) to launch at startup */
  startScene: string;
  /** Texture asset ID for loading screen (empty = none) */
  loadingScreenTextureId: string;
  /** Texture asset ID for splash screen (empty = none) */
  splashScreenTextureId: string;
}

// ── Scene inclusion list ─────────────────────────────────────

export interface BuildSceneEntry {
  sceneName: string;
  included: boolean;
}

// ── Asset cooking settings ───────────────────────────────────

export interface BuildCookingSettings {
  textureCompression: TextureCompression;
  audioFormat: AudioFormat;
  meshOptimization: boolean;
  blueprintStripping: boolean;
  assetBundling: boolean;
  compressBundles: boolean;
  /** Max texture dimension — textures larger than this are downscaled */
  maxTextureDimension: number;
  /** Audio quality 0-10 (10 = lossless) */
  audioQuality: number;
}

// ── Output settings ──────────────────────────────────────────

export interface BuildOutputSettings {
  outputDirectory: string;
  cleanBeforeBuild: boolean;
  openFolderWhenDone: boolean;
}

// ── Branding / icons ─────────────────────────────────────────

export interface BuildIconSettings {
  icon16TextureId: string;
  icon32TextureId: string;
  icon256TextureId: string;
  icon512TextureId: string;
  /** Taskbar / window icon texture ID */
  windowIconTextureId: string;
}

// ── Platform-specific settings ───────────────────────────────

export interface WindowsSettings {
  targetOS: string;
  includeDX12: boolean;
  includeVulkan: boolean;
  generateInstaller: boolean;
  codeSignCertPath: string;
  bundleMsvcRedist: boolean;
}

export interface MacOSSettings {
  minOSVersion: string;
  bundleId: string;
  codeSignIdentity: string;
  notarize: boolean;
  createDMG: boolean;
}

export interface LinuxSettings {
  bundleFormat: BundleFormat;
  targetLibcVersion: string;
}

export interface WebSettings {
  canvasWidth: number;
  canvasHeight: number;
  allowFullscreen: boolean;
  loadingStrategy: LoadingStrategy;
  compressAssets: boolean;
  webglVersion: 1 | 2;
  enableWebGPU: boolean;
  memoryLimitMB: number;
  enablePWA: boolean;
}

export interface AndroidSettings {
  packageName: string;
  minSdkVersion: number;
  targetSdkVersion: number;
  outputFormat: AndroidOutputFormat;
  keystorePath: string;
  keystoreAlias: string;
  orientation: 'portrait' | 'landscape' | 'auto';
  permissionInternet: boolean;
  permissionVibrate: boolean;
  permissionCamera: boolean;
}

export interface iOSSettings {
  bundleId: string;
  minIOSVersion: string;
  teamId: string;
  provisioningProfilePath: string;
  orientation: 'portrait' | 'landscape' | 'auto';
}

export interface PS5Settings {
  sdkPath: string;
  titleId: string;
  contentId: string;
  masterVersion: string;
}

export interface XboxSettings {
  gdkPath: string;
  storeId: string;
  publisherId: string;
}

export interface SwitchSettings {
  sdkPath: string;
  applicationId: string;
}

export type PlatformSettings =
  | { platform: 'windows'; settings: WindowsSettings }
  | { platform: 'macos'; settings: MacOSSettings }
  | { platform: 'linux'; settings: LinuxSettings }
  | { platform: 'web'; settings: WebSettings }
  | { platform: 'android'; settings: AndroidSettings }
  | { platform: 'ios'; settings: iOSSettings }
  | { platform: 'ps5'; settings: PS5Settings }
  | { platform: 'xbox'; settings: XboxSettings }
  | { platform: 'switch'; settings: SwitchSettings };

// ── Top-level asset ───────────────────────────────────────────

export interface BuildConfigurationJSON {
  id: string;
  name: string;
  general: BuildGeneralSettings;
  entryPoint: BuildEntryPointSettings;
  scenes: BuildSceneEntry[];
  cooking: BuildCookingSettings;
  output: BuildOutputSettings;
  icons: BuildIconSettings;
  platformSettings: PlatformSettings;
  /** ISO timestamp of last successful build */
  lastBuiltAt: string | null;
  /** Result of last build */
  lastBuildStatus: 'success' | 'failed' | 'warning' | null;
  /** Size in bytes of the last build output */
  lastBuildSizeBytes: number;
  /** Duration of last build in ms */
  lastBuildDurationMs: number;
}

// ── Defaults ──────────────────────────────────────────────────

export function defaultWindowsSettings(): WindowsSettings {
  return {
    targetOS: 'Windows 10+',
    includeDX12: true,
    includeVulkan: true,
    generateInstaller: false,
    codeSignCertPath: '',
    bundleMsvcRedist: true,
  };
}

export function defaultMacOSSettings(): MacOSSettings {
  return {
    minOSVersion: '12.0',
    bundleId: 'com.mystudio.mygame',
    codeSignIdentity: '',
    notarize: false,
    createDMG: true,
  };
}

export function defaultLinuxSettings(): LinuxSettings {
  return {
    bundleFormat: 'appimage',
    targetLibcVersion: 'glibc 2.31+',
  };
}

export function defaultWebSettings(): WebSettings {
  return {
    canvasWidth: 1920,
    canvasHeight: 1080,
    allowFullscreen: true,
    loadingStrategy: 'progressive',
    compressAssets: true,
    webglVersion: 2,
    enableWebGPU: false,
    memoryLimitMB: 512,
    enablePWA: false,
  };
}

export function defaultAndroidSettings(): AndroidSettings {
  return {
    packageName: 'com.mystudio.mygame',
    minSdkVersion: 26,
    targetSdkVersion: 34,
    outputFormat: 'apk',
    keystorePath: '',
    keystoreAlias: '',
    orientation: 'landscape',
    permissionInternet: true,
    permissionVibrate: false,
    permissionCamera: false,
  };
}

export function defaultIOSSettings(): iOSSettings {
  return {
    bundleId: 'com.mystudio.mygame',
    minIOSVersion: '15.0',
    teamId: '',
    provisioningProfilePath: '',
    orientation: 'landscape',
  };
}

export function defaultPS5Settings(): PS5Settings {
  return { sdkPath: '', titleId: '', contentId: '', masterVersion: '01.00' };
}

export function defaultXboxSettings(): XboxSettings {
  return { gdkPath: '', storeId: '', publisherId: '' };
}

export function defaultSwitchSettings(): SwitchSettings {
  return { sdkPath: '', applicationId: '0x0100000000000000' };
}

function defaultPlatformSettingsFor(platform: BuildPlatform): PlatformSettings {
  switch (platform) {
    case 'windows': return { platform: 'windows', settings: defaultWindowsSettings() };
    case 'macos':   return { platform: 'macos',   settings: defaultMacOSSettings() };
    case 'linux':   return { platform: 'linux',   settings: defaultLinuxSettings() };
    case 'web':     return { platform: 'web',     settings: defaultWebSettings() };
    case 'android': return { platform: 'android', settings: defaultAndroidSettings() };
    case 'ios':     return { platform: 'ios',     settings: defaultIOSSettings() };
    case 'ps5':     return { platform: 'ps5',     settings: defaultPS5Settings() };
    case 'xbox':    return { platform: 'xbox',    settings: defaultXboxSettings() };
    case 'switch':  return { platform: 'switch',  settings: defaultSwitchSettings() };
  }
}

export function defaultBuildConfiguration(
  name: string,
  platform: BuildPlatform = 'windows'
): BuildConfigurationJSON {
  return {
    id: 'bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name,
    general: {
      gameName: 'My Game',
      version: '1.0.0',
      buildNumber: 1,
      autoIncrementBuild: true,
      companyName: 'My Studio',
      platform,
      architecture: platform === 'ios' ? 'arm64' : 'x64',
      buildType: 'shipping',
    },
    entryPoint: {
      startScene: '',
      loadingScreenTextureId: '',
      splashScreenTextureId: '',
    },
    scenes: [],
    cooking: {
      textureCompression: 'bc7',
      audioFormat: 'ogg',
      meshOptimization: true,
      blueprintStripping: true,
      assetBundling: true,
      compressBundles: true,
      maxTextureDimension: 4096,
      audioQuality: 7,
    },
    output: {
      outputDirectory: '',
      cleanBeforeBuild: false,
      openFolderWhenDone: true,
    },
    icons: {
      icon16TextureId: '',
      icon32TextureId: '',
      icon256TextureId: '',
      icon512TextureId: '',
      windowIconTextureId: '',
    },
    platformSettings: defaultPlatformSettingsFor(platform),
    lastBuiltAt: null,
    lastBuildStatus: null,
    lastBuildSizeBytes: 0,
    lastBuildDurationMs: 0,
  };
}

// ── Manager ───────────────────────────────────────────────────

export class BuildConfigurationManager {
  private _configs: Map<string, BuildConfigurationJSON> = new Map();
  private _changeCallbacks: Array<() => void> = [];

  onChanged(cb: () => void): void {
    this._changeCallbacks.push(cb);
  }

  private _notify(): void {
    for (const cb of this._changeCallbacks) cb();
  }

  getAll(): BuildConfigurationJSON[] {
    return Array.from(this._configs.values());
  }

  get(id: string): BuildConfigurationJSON | undefined {
    return this._configs.get(id);
  }

  add(config: BuildConfigurationJSON): void {
    this._configs.set(config.id, config);
    this._notify();
  }

  update(config: BuildConfigurationJSON): void {
    this._configs.set(config.id, config);
    this._notify();
  }

  remove(id: string): void {
    this._configs.delete(id);
    this._notify();
  }

  toJSON(): BuildConfigurationJSON[] {
    return this.getAll();
  }

  fromJSON(data: BuildConfigurationJSON[]): void {
    this._configs.clear();
    for (const c of data) {
      this._configs.set(c.id, c);
    }
    this._notify();
  }

  /** Update last-build metadata after a build finishes */
  recordBuildResult(
    id: string,
    status: 'success' | 'failed' | 'warning',
    durationMs: number,
    sizeBytes: number
  ): void {
    const c = this._configs.get(id);
    if (!c) return;
    c.lastBuildStatus = status;
    c.lastBuiltAt = new Date().toISOString();
    c.lastBuildDurationMs = durationMs;
    c.lastBuildSizeBytes = sizeBytes;
    if (c.general.autoIncrementBuild && status === 'success') {
      c.general.buildNumber++;
    }
    this._notify();
  }
}
