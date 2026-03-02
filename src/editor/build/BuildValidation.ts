// ============================================================
//  BuildValidation — Pre-Build Validation Pass
//  Runs all checks BEFORE cooking to surface errors early.
//  A failed validation stops the build (unless forced).
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON, BuildPlatform } from './BuildConfigurationAsset';
import type { BuildManifest, DependencyIssue } from './DependencyAnalyzer';

export interface ValidationResult {
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  detail?: string;
  /** If set, provides a jump target in the editor (e.g. scene name or asset ID) */
  jumpTarget?: { kind: 'scene' | 'actor' | 'asset'; id: string };
}

// ── Validator ─────────────────────────────────────────────────

export class BuildValidator {
  private _config: BuildConfigurationJSON;
  private _projectPath: string;

  constructor(config: BuildConfigurationJSON, projectPath: string) {
    this._config = config;
    this._projectPath = projectPath;
  }

  async validate(manifest: BuildManifest): Promise<ValidationResult> {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // 1. Validate build config itself
    this._validateBuildConfig(errors, warnings);

    // 2. Propagate dependency issues from manifest
    for (const issue of manifest.issues) {
      if (issue.severity === 'error') {
        errors.push({
          code: 'DEP_MISSING',
          message: issue.message,
          jumpTarget: issue.sceneName
            ? { kind: 'scene', id: issue.sceneName }
            : issue.assetId
              ? { kind: 'asset', id: issue.assetId }
              : undefined,
        });
      } else {
        warnings.push({
          code: 'DEP_WARNING',
          message: issue.message,
          jumpTarget: issue.assetId ? { kind: 'asset', id: issue.assetId } : undefined,
        });
      }
    }

    // 3. Validate start scene exists
    await this._validateStartScene(errors, warnings);

    // 4. Validate output directory is writable
    await this._validateOutputDirectory(errors, warnings);

    // 5. Validate platform tools
    await this._validatePlatformTools(errors, warnings);

    // 6. Validate icons exist (warnings if missing in shipping build)
    this._validateIcons(errors, warnings);

    // 7. Check for oversized textures in manifest
    this._checkTextureWarnings(manifest, warnings);

    // 8. Check that at least one scene is included
    if (manifest.scenes.length === 0) {
      errors.push({
        code: 'NO_SCENES',
        message: 'No scenes are included in the build. Add at least one scene in the Build Configuration.',
      });
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ── Private validators ────────────────────────────────────────

  private _validateBuildConfig(errors: ValidationIssue[], warnings: ValidationIssue[]): void {
    const g = this._config.general;

    if (!g.gameName || g.gameName.trim().length === 0) {
      errors.push({ code: 'NO_GAME_NAME', message: 'Game Name is required in Build Configuration → General.' });
    }

    if (!g.version || !/^\d+\.\d+\.\d+/.test(g.version)) {
      warnings.push({ code: 'INVALID_VERSION', message: `Version "${g.version}" does not follow semver (e.g. 1.0.0).` });
    }

    if (!this._config.entryPoint.startScene) {
      errors.push({ code: 'NO_START_SCENE', message: 'No Start Scene configured. Set the Start Scene in Build Configuration → Entry Point.' });
    }

    // Platform-specific checks
    switch (g.platform) {
      case 'android': {
        const s = (this._config.platformSettings as any).settings;
        if (s && !s.packageName) {
          errors.push({ code: 'ANDROID_NO_PKG', message: 'Android Package Name is required (e.g. com.mystudio.mygame).' });
        }
        break;
      }
      case 'ios': {
        const s = (this._config.platformSettings as any).settings;
        if (s && !s.bundleId) {
          errors.push({ code: 'IOS_NO_BUNDLE', message: 'iOS Bundle ID is required (e.g. com.mystudio.mygame).' });
        }
        break;
      }
      case 'macos': {
        const s = (this._config.platformSettings as any).settings;
        if (s && !s.bundleId) {
          errors.push({ code: 'MACOS_NO_BUNDLE', message: 'macOS Bundle ID is required (e.g. com.mystudio.mygame).' });
        }
        break;
      }
      case 'ps5': {
        const s = (this._config.platformSettings as any).settings;
        if (!s?.sdkPath) {
          errors.push({ code: 'PS5_NO_SDK', message: 'PS5 SDK path is not configured. A licensed PlayStation SDK is required.' });
        }
        break;
      }
      case 'xbox': {
        const s = (this._config.platformSettings as any).settings;
        if (!s?.gdkPath) {
          errors.push({ code: 'XBOX_NO_GDK', message: 'Xbox GDK path is not configured. The Microsoft GDK is required.' });
        }
        break;
      }
      case 'switch': {
        const s = (this._config.platformSettings as any).settings;
        if (!s?.sdkPath) {
          errors.push({ code: 'SWITCH_NO_SDK', message: 'Nintendo SDK path is not configured. A licensed NintendoSDK is required.' });
        }
        break;
      }
    }
  }

  private async _validateStartScene(errors: ValidationIssue[], _warnings: ValidationIssue[]): Promise<void> {
    const startScene = this._config.entryPoint.startScene;
    if (!startScene) return; // Already caught above

    const scenePath = `${this._projectPath}/Scenes/${startScene}.json`;
    const exists = await invoke<boolean>('file_exists', { path: scenePath });
    if (!exists) {
      errors.push({
        code: 'START_SCENE_MISSING',
        message: `Start scene "${startScene}" does not exist. Check the Entry Point settings.`,
        jumpTarget: { kind: 'scene', id: startScene },
      });
    }
  }

  private async _validateOutputDirectory(errors: ValidationIssue[], _warnings: ValidationIssue[]): Promise<void> {
    const outDir = this._config.output.outputDirectory;
    if (!outDir) {
      // Will default to <projectRoot>/Builds/<platform> - that's fine
      return;
    }

    // Try to create a test file to verify write permissions
    try {
      const testPath = `${outDir}/.build_test`;
      await invoke('write_file', { path: testPath, contents: 'test' });
      await invoke('delete_file', { path: testPath });
    } catch {
      errors.push({
        code: 'OUTPUT_NOT_WRITABLE',
        message: `Output directory "${outDir}" is not writable. Check the permissions or choose a different directory.`,
      });
    }
  }

  private async _validatePlatformTools(errors: ValidationIssue[], warnings: ValidationIssue[]): Promise<void> {
    const platform = this._config.general.platform;

    // For Tauri-based platforms, check that the Tauri CLI is available
    if (['windows', 'macos', 'linux', 'android', 'ios'].includes(platform)) {
      try {
        const result = await invoke<string>('check_command_available', { command: 'cargo' });
        if (!result) {
          errors.push({
            code: 'RUST_NOT_FOUND',
            message: 'Rust/Cargo is not installed. Tauri builds require Rust. Install from https://rustup.rs',
          });
        }
      } catch {
        warnings.push({
          code: 'TOOL_CHECK_FAILED',
          message: 'Could not verify Rust installation. The build may fail if Rust is not installed.',
        });
      }
    }

    if (platform === 'android') {
      warnings.push({
        code: 'ANDROID_TOOLS_REQUIRED',
        message: 'Android builds require Android SDK + NDK. Ensure ANDROID_HOME and NDK_HOME environment variables are set.',
      });
    }

    if (platform === 'ios') {
      warnings.push({
        code: 'IOS_TOOLS_REQUIRED',
        message: 'iOS builds require macOS + Xcode. The output will be an Xcode project that must be signed and submitted via Xcode.',
      });
    }
  }

  private _validateIcons(errors: ValidationIssue[], warnings: ValidationIssue[]): void {
    const icons = this._config.icons;
    const platform = this._config.general.platform;
    const isShipping = this._config.general.buildType === 'shipping';

    if (isShipping && !icons.icon256TextureId) {
      warnings.push({
        code: 'NO_APP_ICON',
        message: 'No 256×256 app icon configured. The build will use the default Tauri icon.',
      });
    }
  }

  private _checkTextureWarnings(manifest: BuildManifest, warnings: ValidationIssue[]): void {
    // We can't check actual texture dimensions without reading the binary files,
    // so we emit a general reminder for textures to be sized appropriately.
    const textureCount = manifest.assets.filter(e => e.kind === 'texture').length;
    if (textureCount > 50) {
      warnings.push({
        code: 'MANY_TEXTURES',
        message: `${textureCount} textures found. Consider atlas-ing small textures to reduce draw calls.`,
      });
    }
  }
}
