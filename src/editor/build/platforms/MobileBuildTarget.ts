// ============================================================
//  MobileBuildTarget — Android & iOS builds via Tauri Mobile
//
//  Android: Uses `tauri android build` which requires:
//    - Android SDK (ANDROID_HOME env var)
//    - Android NDK (NDK_HOME or via SDK manager)
//    - Java/Gradle build toolchain
//
//  iOS: Uses `tauri ios build` which requires:
//    - macOS with Xcode installed
//    - Apple Developer account (for signing)
//    - Provisioning profile configured
//
//  Tauri v2 has native mobile support. The engine's WebGL/Three.js
//  renderer works in mobile WebViews (Android System WebView / WKWebView).
//
//  NOTE: Touch input requires additional event mapping which the
//  engine's InputManager must handle. The build provides the
//  infrastructure; input mapping is a runtime concern.
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON, AndroidSettings, iOSSettings } from '../BuildConfigurationAsset';

export interface BuildStepResult {
  success: boolean;
  message: string;
  outputPath?: string;
}

export class MobileBuildTarget {
  private _config: BuildConfigurationJSON;
  private _projectPath: string;
  private _stagingDir: string;
  private _onLog: (msg: string) => void;

  constructor(
    config: BuildConfigurationJSON,
    projectPath: string,
    stagingDir: string,
    onLog: (msg: string) => void,
  ) {
    this._config = config;
    this._projectPath = projectPath;
    this._stagingDir = stagingDir;
    this._onLog = onLog;
  }

  async build(): Promise<BuildStepResult> {
    const platform = this._config.general.platform;
    if (platform === 'android') return this._buildAndroid();
    if (platform === 'ios') return this._buildIOS();
    return { success: false, message: `Unknown mobile platform: ${platform}` };
  }

  // ── Android build ─────────────────────────────────────────────

  private async _buildAndroid(): Promise<BuildStepResult> {
    const settings = (this._config.platformSettings as any).settings as AndroidSettings;
    const gameProjDir = `${this._projectPath}/BuildCache/android/GameProject`;
    const outputDir = this._resolveOutputDir();

    this._log('Preparing Android build...');

    try {
      // Initialize Tauri Android project
      await this._initTauriMobileProject(gameProjDir, 'android');

      // Generate game entry point
      await this._generateGameHtml(gameProjDir);
      await this._copyCookedAssets(gameProjDir);

      // Configure Android-specific Tauri settings
      await this._configureAndroid(gameProjDir, settings);

      // Build
      this._log('Running: cargo tauri android build...');
      const format = settings.outputFormat === 'aab' ? ['--aab'] : [];
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
        'run_build_command',
        {
          cwd: gameProjDir,
          command: 'cargo',
          args: ['tauri', 'android', 'build', ...format],
        }
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: `Android build failed (exit ${result.exitCode}):\n${result.stderr}\n\nMake sure Android SDK, NDK, and ANDROID_HOME/NDK_HOME env vars are set.`,
        };
      }

      // Copy APK/AAB to output
      const ext = settings.outputFormat === 'aab' ? 'aab' : 'apk';
      const artifactsDir = `${gameProjDir}/src-tauri/gen/android/app/build/outputs/${ext}`;
      try {
        await invoke('copy_directory', { src: artifactsDir, dest: outputDir });
      } catch {
        this._log(`Artifacts available at: ${artifactsDir}`);
      }

      this._log(`✓ Android build complete → ${outputDir}`);
      return {
        success: true,
        message: `Android build successful (${settings.outputFormat.toUpperCase()})`,
        outputPath: outputDir,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Android build failed: ${e?.message ?? String(e)}`,
      };
    }
  }

  private async _configureAndroid(gameProjDir: string, settings: AndroidSettings): Promise<void> {
    // Write Tauri config with Android-specific settings
    const tauriConf = {
      $schema: '../node_modules/@tauri-apps/cli/config.schema.json',
      productName: this._config.general.gameName,
      version: this._config.general.version,
      identifier: settings.packageName || 'com.feathergame.mygame',
      build: { frontendDist: '../dist', devUrl: 'http://localhost:5173' },
      app: {
        windows: [{
          title: this._config.general.gameName,
          width: 1920, height: 1080,
          fullscreen: true,
        }],
        security: { csp: null, capabilities: ['default'] },
      },
      bundle: {
        active: true,
        targets: 'all',
        icon: ['icons/icon.png'],
        android: {
          minSdkVersion: settings.minSdkVersion,
          targetSdkVersion: settings.targetSdkVersion,
        },
      },
    };

    await invoke('write_file', {
      path: `${gameProjDir}/src-tauri/tauri.conf.json`,
      contents: JSON.stringify(tauriConf, null, 2),
    });
  }

  // ── iOS build ─────────────────────────────────────────────────

  private async _buildIOS(): Promise<BuildStepResult> {
    const settings = (this._config.platformSettings as any).settings as iOSSettings;
    const gameProjDir = `${this._projectPath}/BuildCache/ios/GameProject`;
    const outputDir = this._resolveOutputDir();

    this._log('Preparing iOS build...');
    this._log('⚠️  iOS builds require macOS + Xcode. Output is an Xcode project for signing and submission.');

    try {
      await this._initTauriMobileProject(gameProjDir, 'ios');
      await this._generateGameHtml(gameProjDir);
      await this._copyCookedAssets(gameProjDir);
      await this._configureIOS(gameProjDir, settings);

      this._log('Running: cargo tauri ios build...');
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
        'run_build_command',
        {
          cwd: gameProjDir,
          command: 'cargo',
          args: ['tauri', 'ios', 'build'],
        }
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: `iOS build failed (exit ${result.exitCode}):\n${result.stderr}\n\nMake sure you are on macOS with Xcode installed.`,
        };
      }

      const xcodeProj = `${gameProjDir}/src-tauri/gen/apple`;
      try {
        await invoke('copy_directory', { src: xcodeProj, dest: outputDir });
      } catch {
        this._log(`Xcode project available at: ${xcodeProj}`);
      }

      this._log(`✓ iOS Xcode project ready → ${outputDir}`);
      this._log('Open the Xcode project to sign and submit to the App Store.');

      return {
        success: true,
        message: 'iOS Xcode project generated. Open in Xcode to sign and distribute.',
        outputPath: outputDir,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `iOS build failed: ${e?.message ?? String(e)}`,
      };
    }
  }

  private async _configureIOS(gameProjDir: string, settings: iOSSettings): Promise<void> {
    const tauriConf = {
      $schema: '../node_modules/@tauri-apps/cli/config.schema.json',
      productName: this._config.general.gameName,
      version: this._config.general.version,
      identifier: settings.bundleId || 'com.feathergame.mygame',
      build: { frontendDist: '../dist', devUrl: 'http://localhost:5173' },
      app: {
        windows: [{ title: this._config.general.gameName, fullscreen: true }],
        security: { csp: null, capabilities: ['default'] },
      },
      bundle: {
        active: true,
        targets: 'all',
        icon: ['icons/icon.png'],
        iOS: {
          minimumSystemVersion: settings.minIOSVersion || '15.0',
          developmentTeam: settings.teamId || '',
        },
      },
    };

    await invoke('write_file', {
      path: `${gameProjDir}/src-tauri/tauri.conf.json`,
      contents: JSON.stringify(tauriConf, null, 2),
    });
  }

  // ── Shared helpers ────────────────────────────────────────────

  private async _initTauriMobileProject(projDir: string, mobileTarget: 'android' | 'ios'): Promise<void> {
    this._log(`Initializing Tauri ${mobileTarget} project...`);

    // Write minimal package.json for the mobile project
    await invoke('write_file', {
      path: `${projDir}/package.json`,
      contents: JSON.stringify({
        name: this._config.general.gameName.toLowerCase().replace(/\s+/g, '-'),
        version: this._config.general.version,
        private: true,
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', tauri: 'tauri' },
        devDependencies: {
          '@tauri-apps/cli': '^2.10.0',
          vite: '^8.0.0-beta.13',
        },
        dependencies: {
          '@tauri-apps/api': '^2.10.1',
          three: '^0.182.0',
          '@dimforge/rapier2d-compat': '^0.19.3',
          '@dimforge/rapier3d-compat': '^0.19.3',
        },
      }, null, 2),
    });

    // Initialize the Tauri mobile target (creates the Android/iOS native project)
    // This is done by running `tauri android init` or `tauri ios init`
    try {
      await invoke<{ exitCode: number }>('run_build_command', {
        cwd: projDir,
        command: 'cargo',
        args: ['tauri', mobileTarget, 'init'],
      });
    } catch {
      // init may fail if already initialized — continue
    }
  }

  private async _generateGameHtml(projDir: string): Promise<void> {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>${this._config.general.gameName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; background: #000; touch-action: none; }
    #render-canvas { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <canvas id="render-canvas"></canvas>
  <script type="module" src="/game_runtime.js"></script>
</body>
</html>`;

    await invoke('write_file', { path: `${projDir}/index.html`, contents: html });
  }

  private async _copyCookedAssets(projDir: string): Promise<void> {
    await invoke('copy_directory', {
      src: this._stagingDir,
      dest: `${projDir}/public/project-data`,
    });
  }

  private _resolveOutputDir(): string {
    const p = this._config.general.platform;
    return this._config.output.outputDirectory ||
      `${this._projectPath}/Builds/${p}/${this._config.general.gameName.replace(/\s+/g, '_')}_${this._config.general.version}`;
  }

  private _log(msg: string): void {
    this._onLog(`[Mobile/${this._config.general.platform}] ${msg}`);
  }
}
