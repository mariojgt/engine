// ============================================================
//  ConsoleBuildTarget — PlayStation 5, Xbox Series X|S, Nintendo Switch
//
//  ❌ HONEST ASSESSMENT: These platforms are NOT currently achievable.
//
//  This engine is built on TypeScript + Three.js + WebGL running in
//  a Tauri (WebView-based) native shell. Console platforms require:
//
//    - Native compiled binaries (no WebView runtime on any console)
//    - Licensed platform SDKs from Sony, Microsoft, and Nintendo
//    - Custom graphics backends (GNM/GNMX for PS5, DirectX 12 for Xbox,
//      NVN for Switch) — not WebGL
//    - Platform certification processes before submission
//    - Hardware devkits for testing and debugging
//
//  A console port would require:
//    1. Rewriting the rendering backend in native C++ or Rust
//    2. Porting the physics (Rapier can compile to native; Three.js cannot)
//    3. Rewriting the Blueprint runtime (JS → compiled native code)
//    4. Platform-specific audio, input, networking, and storage APIs
//    5. Signing NDA agreements with each platform holder
//
//  What this file provides:
//    - Clear error messages explaining what is needed
//    - Links to developer registration portals
//    - A roadmap for how a native port could be structured
//    - Stubs that will surface friendly errors rather than
//      attempting a doomed build that wastes developer time
//
//  Console support is a planned future milestone pending a native
//  runtime port of the engine core.
// ============================================================

import type { BuildConfigurationJSON } from '../BuildConfigurationAsset';

export interface BuildStepResult {
  success: false;
  message: string;
  outputPath?: undefined;
  /** Detailed explanation of what would be needed */
  sdkInfo: ConsoleSdkInfo;
}

export interface ConsoleSdkInfo {
  platformName: string;
  sdkRequired: string;
  registrationUrl: string;
  requiresLicense: boolean;
  nativePortRequired: boolean;
  estimatedWork: string;
  currentStatus: string;
}

const CONSOLE_SDK_INFO: Record<string, ConsoleSdkInfo> = {
  ps5: {
    platformName: 'PlayStation 5',
    sdkRequired: 'PlayStation SDK (licensed from Sony Interactive Entertainment)',
    registrationUrl: 'https://partners.playstation.net',
    requiresLicense: true,
    nativePortRequired: true,
    estimatedWork: 'Full native C++/Rust engine port required (rendering, physics, audio, input)',
    currentStatus: '❌ Not supported — requires native port + licensed SDK',
  },
  xbox: {
    platformName: 'Xbox Series X|S',
    sdkRequired: 'Microsoft GDK (Game Development Kit)',
    registrationUrl: 'https://developer.microsoft.com/en-us/games/xbox/id-at-xbox',
    requiresLicense: true,
    nativePortRequired: true,
    estimatedWork: 'Full native C++/Rust engine port required + DirectX 12 rendering backend',
    currentStatus: '❌ Not supported — requires native port + GDK access',
  },
  switch: {
    platformName: 'Nintendo Switch',
    sdkRequired: 'NintendoSDK (licensed from Nintendo)',
    registrationUrl: 'https://developer.nintendo.com',
    requiresLicense: true,
    nativePortRequired: true,
    estimatedWork: 'Full native C++/Rust engine port required + NVN graphics backend',
    currentStatus: '❌ Not supported — requires native port + licensed NintendoSDK',
  },
};

export class ConsoleBuildTarget {
  private _config: BuildConfigurationJSON;
  private _onLog: (msg: string) => void;

  constructor(
    config: BuildConfigurationJSON,
    _projectPath: string,
    _stagingDir: string,
    onLog: (msg: string) => void,
  ) {
    this._config = config;
    this._onLog = onLog;
  }

  async build(): Promise<BuildStepResult> {
    const platform = this._config.general.platform;
    const info = CONSOLE_SDK_INFO[platform];

    if (!info) {
      return {
        success: false,
        message: `Unknown console platform: ${platform}`,
        sdkInfo: {
          platformName: platform,
          sdkRequired: 'Unknown',
          registrationUrl: '',
          requiresLicense: true,
          nativePortRequired: true,
          estimatedWork: 'Unknown',
          currentStatus: '❌ Unknown platform',
        },
      };
    }

    const lines = [
      `❌ ${info.platformName} builds are not yet supported by Feather Engine.`,
      '',
      `PLATFORM REQUIREMENTS:`,
      `  SDK Required:       ${info.sdkRequired}`,
      `  License Required:   ${info.requiresLicense ? 'Yes — must be a registered developer' : 'No'}`,
      `  Native Port Needed: ${info.nativePortRequired ? 'Yes — WebView/WebGL does not run on this platform' : 'No'}`,
      '',
      `TECHNICAL REASON:`,
      `  ${info.platformName} requires native compiled binaries. Feather Engine`,
      `  currently runs on TypeScript + Three.js + WebGL inside a Tauri WebView.`,
      `  This architecture cannot run on any console platform.`,
      '',
      `WHAT WOULD BE NEEDED:`,
      `  ${info.estimatedWork}`,
      '',
      `TO REGISTER AS A DEVELOPER:`,
      `  ${info.registrationUrl}`,
      '',
      `CURRENT STATUS:`,
      `  ${info.currentStatus}`,
    ];

    const message = lines.join('\n');
    for (const line of lines) {
      this._onLog(line);
    }

    return {
      success: false,
      message,
      sdkInfo: info,
    };
  }

  /** Get the SDK info for display in the Build Configuration UI (no build needed) */
  static getSdkInfo(platform: string): ConsoleSdkInfo | null {
    return CONSOLE_SDK_INFO[platform] ?? null;
  }

  /** Check if the console SDK is configured (path exists on disk) */
  static async isSdkConfigured(platform: string, sdkPath: string): Promise<boolean> {
    if (!sdkPath) return false;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('file_exists', { path: sdkPath });
    } catch {
      return false;
    }
  }
}
