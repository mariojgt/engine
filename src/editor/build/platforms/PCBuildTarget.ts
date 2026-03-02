// ============================================================
//  PCBuildTarget — Desktop build target (Windows / macOS / Linux)
//  Uses Tauri's build pipeline to produce native desktop apps.
//
//  What it does:
//  1. Generates a standalone Tauri project for the game
//     (no editor code — only the game runtime)
//  2. Sets Tauri config from the Build Configuration settings
//  3. Calls `tauri build` for the target platform
//  4. Copies output artifacts to the configured output directory
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON } from '../BuildConfigurationAsset';

export interface BuildStepResult {
  success: boolean;
  message: string;
  outputPath?: string;
}

// ── Runtime entry point template ──────────────────────────────
// This is the stripped-down HTML that loads the game runtime
// instead of the editor. It replaces index.html for shipped builds.

function generateGameEntryHtml(config: BuildConfigurationJSON): string {
  const { gameName } = config.general;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${gameName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100%; height: 100vh; overflow: hidden; background: #000; }
    #render-canvas { width: 100%; height: 100%; display: block; }
    #loading-overlay {
      position: fixed; inset: 0; background: #000;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; z-index: 9999; color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .loading-title { font-size: 32px; font-weight: 700; margin-bottom: 16px; }
    .loading-bar-outer { width: 300px; height: 6px; background: #333; border-radius: 3px; }
    .loading-bar-inner { height: 100%; background: #60a5fa; border-radius: 3px; width: 0%; transition: width 0.2s; }
    .loading-status { margin-top: 12px; font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="loading-title">${gameName}</div>
    <div class="loading-bar-outer"><div class="loading-bar-inner" id="loading-bar"></div></div>
    <div class="loading-status" id="loading-status">Loading...</div>
  </div>
  <canvas id="render-canvas"></canvas>
  <script type="module" src="/src/game_runtime.ts"></script>
</body>
</html>`;
}

// ── Tauri config template for the game ───────────────────────

function generateTauriConfig(
  config: BuildConfigurationJSON,
  projectPath: string
): any {
  const { gameName, version, architecture } = config.general;
  const windowConfig: any = {
    title: gameName,
    resizable: true,
    fullscreen: false,
  };

  // PC window settings
  if (config.general.platform !== 'web') {
    const winSettings = (config as any)._windowSettings;
    windowConfig.width = winSettings?.width ?? 1920;
    windowConfig.height = winSettings?.height ?? 1080;
    windowConfig.minWidth = winSettings?.minWidth ?? 1280;
    windowConfig.minHeight = winSettings?.minHeight ?? 720;
    windowConfig.fullscreen = winSettings?.fullscreen ?? false;
  }

  let targets: any = 'all';
  const plat = config.general.platform;
  const ps = (config.platformSettings as any).settings ?? {};

  if (plat === 'linux') {
    const fmt = ps.bundleFormat ?? 'appimage';
    targets = [fmt];
  } else if (plat === 'windows') {
    targets = ps.generateInstaller ? ['nsis', 'msi'] : ['msi'];
  } else if (plat === 'macos') {
    targets = ps.createDMG ? ['dmg', 'app'] : ['app'];
  }

  return {
    $schema: '../node_modules/@tauri-apps/cli/config.schema.json',
    productName: gameName,
    version,
    identifier: ps.bundleId ?? `com.feathergame.${gameName.toLowerCase().replace(/\s+/g, '')}`,
    build: {
      beforeDevCommand: 'npm run dev',
      beforeBuildCommand: 'npm run build',
      frontendDist: '../dist',
      devUrl: 'http://localhost:5173',
    },
    app: {
      windows: [windowConfig],
      security: { csp: null, capabilities: ['default'] },
    },
    bundle: {
      active: true,
      targets,
      icon: [
        'icons/32x32.png',
        'icons/128x128.png',
        'icons/128x128@2x.png',
        'icons/icon.icns',
        'icons/icon.ico',
      ],
    },
  };
}

// ── Package.json template for the standalone game ─────────────

function generateGamePackageJson(config: BuildConfigurationJSON, deps: Record<string, string>): string {
  // Separate dev deps from runtime deps (by known dev-only package names)
  const devPkgNames = new Set([
    '@tauri-apps/cli', 'typescript', 'vite', 'esbuild',
    '@types/react', '@types/react-dom', '@types/three',
  ]);

  const devDependencies: Record<string, string> = {};
  const dependencies: Record<string, string> = {};

  for (const [name, version] of Object.entries(deps)) {
    if (!version) continue;
    if (devPkgNames.has(name)) {
      devDependencies[name] = version;
    } else {
      dependencies[name] = version;
    }
  }

  // Ensure essential packages are present even if engine package.json is weird
  if (!devDependencies['@tauri-apps/cli']) devDependencies['@tauri-apps/cli'] = '^2.10.0';
  if (!devDependencies['typescript']) devDependencies['typescript'] = '~5.9.3';
  if (!devDependencies['vite']) devDependencies['vite'] = '^8.0.0-beta.13';
  if (!dependencies['@tauri-apps/api']) dependencies['@tauri-apps/api'] = '^2.10.1';
  if (!dependencies['three']) dependencies['three'] = '^0.182.0';

  return JSON.stringify({
    name: config.general.gameName.toLowerCase().replace(/\s+/g, '-'),
    version: config.general.version,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      tauri: 'tauri',
    },
    devDependencies,
    dependencies,
  }, null, 2);
}

// ── Vite config template for the standalone game ──────────────

function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  optimizeDeps: { exclude: ['recast-navigation'] },
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: { main: 'index.html' },
    },
  },
});
`;
}

// ── Main PC build target ──────────────────────────────────────

export class PCBuildTarget {
  private _config: BuildConfigurationJSON;
  private _projectPath: string;
  private _stagingDir: string;
  private _onLog: (msg: string) => void;

  constructor(
    config: BuildConfigurationJSON,
    projectPath: string,
    stagingDir: string,
    onLog: (msg: string) => void
  ) {
    this._config = config;
    this._projectPath = projectPath;
    this._stagingDir = stagingDir;
    this._onLog = onLog;
  }

  async build(): Promise<BuildStepResult> {
    const platform = this._config.general.platform;
    const gameName = this._config.general.gameName;
    const version = this._config.general.version;
    const outputDir = this._resolveOutputDir();
    const buildStartTime = Date.now();

    this._log(`═══════════════════════════════════════════════════`);
    this._log(`  PC BUILD TARGET — ${platform.toUpperCase()}`);
    this._log(`  Game: ${gameName} v${version}`);
    this._log(`  Architecture: ${this._config.general.architecture}`);
    this._log(`  Build Type: ${this._config.general.buildType}`);
    this._log(`  Project Path: ${this._projectPath}`);
    this._log(`  Staging Dir: ${this._stagingDir}`);
    this._log(`  Output Dir: ${outputDir}`);
    this._log(`═══════════════════════════════════════════════════`);

    // Generate the standalone game Tauri project directory
    const gameProjDir = `${this._projectPath}/BuildCache/${platform}/GameProject`;
    this._log(`Game project directory: ${gameProjDir}`);

    // Resolve the engine root (where the engine source code lives)
    let engineRoot: string;
    try {
      engineRoot = await invoke<string>('get_engine_root');
      this._log(`Engine root: ${engineRoot}`);
    } catch (e: any) {
      this._log(`✗ Could not determine engine root: ${e?.message ?? e}`);
      return { success: false, message: `Could not determine engine root directory: ${e?.message ?? e}` };
    }

    try {
      // ── Step 1: Write game entry HTML ──────────────────────────
      this._log(`\n[Step 1/10] Writing game entry HTML...`);
      try {
        await invoke('write_file', {
          path: `${gameProjDir}/index.html`,
          contents: generateGameEntryHtml(this._config),
        });
        this._log(`  ✓ Wrote ${gameProjDir}/index.html`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to write index.html: ${e?.message ?? e}`);
        return { success: false, message: `Step 1 failed — could not write index.html: ${e?.message ?? e}` };
      }

      // ── Step 2: Write Tauri config ─────────────────────────────
      this._log(`\n[Step 2/10] Writing Tauri config...`);
      try {
        const tauriConfig = generateTauriConfig(this._config, this._projectPath);
        this._log(`  Tauri config: productName="${tauriConfig.productName}", identifier="${tauriConfig.identifier}", targets=${JSON.stringify(tauriConfig.bundle?.targets)}`);
        await invoke('write_file', {
          path: `${gameProjDir}/src-tauri/tauri.conf.json`,
          contents: JSON.stringify(tauriConfig, null, 2),
        });
        this._log(`  ✓ Wrote ${gameProjDir}/src-tauri/tauri.conf.json`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to write tauri.conf.json: ${e?.message ?? e}`);
        return { success: false, message: `Step 2 failed — could not write tauri.conf.json: ${e?.message ?? e}` };
      }

      // ── Step 3: Copy Tauri Rust source ─────────────────────────
      this._log(`\n[Step 3/10] Copying Tauri Rust source skeleton...`);
      try {
        await this._copyTauriRustSource(gameProjDir, engineRoot);
        this._log(`  ✓ Rust source skeleton written`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to copy Rust source: ${e?.message ?? e}`);
        return { success: false, message: `Step 3 failed — could not copy Rust source: ${e?.message ?? e}` };
      }

      // ── Step 3b: Copy icons ────────────────────────────────────
      this._log(`\n[Step 3b/10] Copying icons...`);
      try {
        const engineIconsDir = `${engineRoot}/src-tauri/icons`;
        const destIconsDir = `${gameProjDir}/src-tauri/icons`;
        const iconsExist = await invoke<boolean>('file_exists', { path: engineIconsDir });
        if (iconsExist) {
          await invoke('copy_directory', { src: engineIconsDir, dest: destIconsDir });
          this._log(`  ✓ Icons copied from ${engineIconsDir}`);
        } else {
          this._log(`  ⚠ No icons directory at ${engineIconsDir}, generating placeholder`);
          // Generate a minimal 32x32 PNG placeholder (1x1 transparent pixel won't work, need real PNG)
          // Tauri requires at least one icon; write the paths listed in tauri.conf.json
          await this._generatePlaceholderIcons(destIconsDir);
        }
      } catch (e: any) {
        this._log(`  ⚠ Could not copy icons: ${e?.message ?? e} (build may still succeed)`);
      }

      // ── Step 3c: Copy Tauri capabilities ──────────────────────
      this._log(`\n[Step 3c/10] Writing Tauri capabilities...`);
      try {
        const capsDir = `${gameProjDir}/src-tauri/capabilities`;
        await invoke('write_file', {
          path: `${capsDir}/default.json`,
          contents: JSON.stringify({
            identifier: 'default',
            description: 'Default game permissions',
            windows: ['main'],
            permissions: [
              'core:default',
              'dialog:default',
              'core:window:default',
              'core:webview:default',
            ],
          }, null, 2),
        });
        this._log(`  ✓ Wrote capabilities/default.json`);
      } catch (e: any) {
        this._log(`  ⚠ Could not write capabilities: ${e?.message ?? e}`);
      }

      // ── Step 4: Write package.json ─────────────────────────────
      this._log(`\n[Step 4/10] Writing package.json...`);
      try {
        const deps = await this._readCurrentDeps(engineRoot);
        this._log(`  Resolved dependencies: ${JSON.stringify(deps, null, 2)}`);
        await invoke('write_file', {
          path: `${gameProjDir}/package.json`,
          contents: generateGamePackageJson(this._config, deps),
        });
        this._log(`  ✓ Wrote ${gameProjDir}/package.json`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to write package.json: ${e?.message ?? e}`);
        return { success: false, message: `Step 4 failed — could not write package.json: ${e?.message ?? e}` };
      }

      // ── Step 5: Write vite config ──────────────────────────────
      this._log(`\n[Step 5/10] Writing vite.config.ts...`);
      try {
        await invoke('write_file', {
          path: `${gameProjDir}/vite.config.ts`,
          contents: generateViteConfig(),
        });
        this._log(`  ✓ Wrote ${gameProjDir}/vite.config.ts`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to write vite.config.ts: ${e?.message ?? e}`);
        return { success: false, message: `Step 5 failed — could not write vite.config.ts: ${e?.message ?? e}` };
      }

      // ── Step 5b: Copy Engine source ────────────────────────────
      this._log(`\n[Step 5b/10] Copying Engine source code...`);
      try {
        // Clean stale src/ from previous builds so copy starts fresh
        const oldSrc = `${gameProjDir}/src`;
        try { await invoke('delete_directory', { path: oldSrc }); } catch { /* ok if not exists */ }
        await this._copyEngineSource(gameProjDir, engineRoot);
        this._log(`  ✓ Engine source copied`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to copy Engine source: ${e?.message ?? e}`);
        return { success: false, message: `Step 5b failed — could not copy Engine source: ${e?.message ?? e}` };
      }

      // ── Step 6: Copy cooked assets ─────────────────────────────
      this._log(`\n[Step 6/10] Copying cooked assets...`);
      try {
        await this._copyCookedAssets(gameProjDir);
        this._log(`  ✓ Cooked assets copied to ${gameProjDir}/public/project-data`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to copy cooked assets: ${e?.message ?? e}`);
        return { success: false, message: `Step 6 failed — could not copy cooked assets: ${e?.message ?? e}` };
      }

      // ── Step 7: Generate game runtime ──────────────────────────
      this._log(`\n[Step 7/10] Generating game_runtime.ts...`);
      try {
        await this._generateGameRuntime(gameProjDir);
        this._log(`  ✓ Wrote ${gameProjDir}/src/game_runtime.ts`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to generate game_runtime.ts: ${e?.message ?? e}`);
        return { success: false, message: `Step 7 failed — could not generate game_runtime.ts: ${e?.message ?? e}` };
      }

      // ── Step 8: Write tsconfig ─────────────────────────────────
      this._log(`\n[Step 8/10] Writing tsconfig.json...`);
      try {
        await invoke('write_file', {
          path: `${gameProjDir}/tsconfig.json`,
          contents: JSON.stringify({
            compilerOptions: {
              target: 'ESNext',
              useDefineForClassFields: true,
              module: 'ESNext',
              lib: ['ESNext', 'DOM'],
              moduleResolution: 'bundler',
              allowImportingTsExtensions: true,
              noEmit: true,
              strict: true,
            },
            include: ['src'],
          }, null, 2),
        });
        this._log(`  ✓ Wrote ${gameProjDir}/tsconfig.json`);
      } catch (e: any) {
        this._log(`  ✗ FAILED to write tsconfig.json: ${e?.message ?? e}`);
        return { success: false, message: `Step 8 failed — could not write tsconfig.json: ${e?.message ?? e}` };
      }

      const prepTime = ((Date.now() - buildStartTime) / 1000).toFixed(1);
      this._log(`\n  Game project prepared in ${prepTime}s`);
      this._log(`\n[Step 9/10] Running Tauri build (this may take several minutes)...`);

      // ── Step 9: Run Tauri build ────────────────────────────────
      const buildResult = await this._runTauriBuild(gameProjDir);

      if (!buildResult.success) {
        this._log(`  ✗ Tauri build FAILED`);
        this._log(`  Error: ${buildResult.message}`);
        return buildResult;
      }
      this._log(`  ✓ Tauri build succeeded`);

      // ── Step 10: Copy artifacts ────────────────────────────────
      this._log(`\n[Step 10/10] Copying artifacts to output directory...`);
      try {
        await this._copyArtifactsToOutput(gameProjDir, outputDir, platform);
        this._log(`  ✓ Artifacts copied to ${outputDir}`);
      } catch (e: any) {
        this._log(`  ⚠ Could not copy artifacts: ${e?.message ?? e}`);
        this._log(`  Artifacts may still be at: ${gameProjDir}/src-tauri/target/release/bundle`);
      }

      const totalTime = ((Date.now() - buildStartTime) / 1000).toFixed(1);
      this._log(`\n═══════════════════════════════════════════════════`);
      this._log(`  ✅ BUILD COMPLETE in ${totalTime}s`);
      this._log(`  Output: ${outputDir}`);
      this._log(`═══════════════════════════════════════════════════`);

      return {
        success: true,
        message: `Build successful (${platform})`,
        outputPath: outputDir,
      };
    } catch (e: any) {
      const totalTime = ((Date.now() - buildStartTime) / 1000).toFixed(1);
      this._log(`\n═══════════════════════════════════════════════════`);
      this._log(`  ❌ BUILD CRASHED after ${totalTime}s`);
      this._log(`  Error: ${e?.message ?? String(e)}`);
      this._log(`  Stack: ${e?.stack ?? '(no stack)'}`);
      this._log(`═══════════════════════════════════════════════════`);
      return {
        success: false,
        message: `Build failed: ${e?.message ?? String(e)}`,
      };
    }
  }

  private _resolveOutputDir(): string {
    return this._config.output.outputDirectory ||
      `${this._projectPath}/Builds/${this._config.general.platform}/${this._config.general.gameName.replace(/\s+/g, '_')}_${this._config.general.version}`;
  }

  private async _copyTauriRustSource(gameProjDir: string, engineRoot: string): Promise<void> {
    // Copy the Rust Cargo.toml and lib.rs from the engine's src-tauri
    // The game Rust backend is identical to the editor backend (same file I/O commands)

    const cargoContent = `[package]
name = "game"
version = "${this._config.general.version}"
description = "${this._config.general.gameName}"
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "game_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.5.4", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.10.0", features = ["macos-private-api"] }
tauri-plugin-log = "2"
tauri-plugin-dialog = "2"
`;

    await invoke('write_file', {
      path: `${gameProjDir}/src-tauri/Cargo.toml`,
      contents: cargoContent,
    });

    // Main binary — reuse engine's lib.rs (stateless file I/O, fully portable)
    const mainRs = `fn main() { game_lib::run(); }`;
    const buildRs = `fn main() { tauri_build::build() }`;

    await invoke('write_file', {
      path: `${gameProjDir}/src-tauri/src/main.rs`,
      contents: mainRs,
    });
    await invoke('write_file', {
      path: `${gameProjDir}/src-tauri/build.rs`,
      contents: buildRs,
    });

    // Read and copy lib.rs from engine — use the known engine root
    const libRsPath = `${engineRoot}/src-tauri/src/lib.rs`;
    this._log(`  Looking for lib.rs at: ${libRsPath}`);

    try {
      const libRs = await invoke<string>('read_file', { path: libRsPath });
      // Rewrite the lib.rs to use game_lib naming
      let gameLibRs = libRs.replace(/app_lib/g, 'game_lib');

      // Remove the get_engine_root function entirely — it uses env!("CARGO_MANIFEST_DIR")
      // which would point to the wrong location in the shipped game.
      // Match from the doc comment through the closing brace of the function.
      // We use a line-by-line approach to be safe.
      const lines = gameLibRs.split('\n');
      const filtered: string[] = [];
      let skipping = false;
      let braceDepth = 0;
      for (const line of lines) {
        if (!skipping && line.includes('fn get_engine_root')) {
          skipping = true;
          braceDepth = 0;
          // Also remove preceding doc comments / attributes
          while (filtered.length > 0) {
            const prev = filtered[filtered.length - 1].trim();
            if (prev.startsWith('///') || prev.startsWith('#[')) {
              filtered.pop();
            } else {
              break;
            }
          }
        }
        if (skipping) {
          for (const ch of line) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
          }
          if (braceDepth <= 0 && line.includes('}')) {
            skipping = false;
          }
          continue; // skip this line
        }
        filtered.push(line);
      }
      gameLibRs = filtered.join('\n');

      // Remove get_engine_root from the generate_handler! list
      gameLibRs = gameLibRs.replace(/\s*get_engine_root,?\n?/g, '\n');

      await invoke('write_file', {
        path: `${gameProjDir}/src-tauri/src/lib.rs`,
        contents: gameLibRs,
      });
      this._log(`  ✓ Copied and patched lib.rs from engine`);
    } catch (e: any) {
      // Fallback: write a minimal lib.rs
      this._log(`  ⚠ Could not read engine lib.rs (${e?.message ?? e}), using minimal fallback`);
      await invoke('write_file', {
        path: `${gameProjDir}/src-tauri/src/lib.rs`,
        contents: `pub fn run() { tauri::Builder::default().run(tauri::generate_context!()).expect("error running app"); }`,
      });
    }
  }

  private async _readCurrentDeps(engineRoot: string): Promise<Record<string, string>> {
    // Read the engine's own package.json to get the correct dependency versions
    const pkgPath = `${engineRoot}/package.json`;
    this._log(`  Reading deps from: ${pkgPath}`);
    try {
      const pkgJson = await invoke<string>('read_file', { path: pkgPath });
      const pkg = JSON.parse(pkgJson);
      // Return ALL dependencies — engine runtime imports editor modules
      // that depend on dockview, rete, react, etc.  Vite will tree-shake
      // unused code, but npm must be able to resolve every import.
      return {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
    } catch (e: any) {
      this._log(`  ⚠ Could not read ${pkgPath}: ${e?.message ?? e}. Using default versions.`);
      return {};
    }
  }

  private async _copyCookedAssets(gameProjDir: string): Promise<void> {
    this._log('Copying cooked assets to game project...');
    // Assets are copied to public/project-data/ where the runtime can fetch them
    await invoke('copy_directory', {
      src: this._stagingDir,
      dest: `${gameProjDir}/public/project-data`,
    });
  }

  private async _copyEngineSource(gameProjDir: string, engineRoot: string): Promise<void> {
    this._log('Copying Engine source code...');
    // Copy the full src/ directory. The engine runtime (src/engine/) has
    // imports into src/editor/ for shared types, asset managers, etc.
    // Vite will tree-shake unused editor code from the final bundle.
    const engineSrcPath = `${engineRoot}/src`;
    this._log(`  Engine source path: ${engineSrcPath}`);

    const exists = await invoke<boolean>('file_exists', { path: engineSrcPath });
    if (!exists) {
      throw new Error(
        `Engine source directory not found at: ${engineSrcPath}\n` +
        `Engine root resolved to: ${engineRoot}\n` +
        `Make sure the engine source is accessible.`
      );
    }

    this._log(`  ✓ Engine source found at: ${engineSrcPath}`);
    await invoke('copy_directory', {
      src: engineSrcPath,
      dest: `${gameProjDir}/src`,
    });
  }

  /** Generate minimal valid PNG icons required by Tauri when engine icons aren't available */
  private async _generatePlaceholderIcons(destIconsDir: string): Promise<void> {
    // Minimal 1x1 white PNG (68 bytes, valid PNG)
    const PNG_1x1 = new Uint8Array([
      0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG signature
      0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53, // 8-bit RGB
      0xDE,0x00,0x00,0x00,0x0C,0x49,0x44,0x41, // IDAT
      0x54,0x08,0xD7,0x63,0xF8,0xCF,0xC0,0x00,
      0x00,0x00,0x02,0x00,0x01,0xE2,0x21,0xBC,
      0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4E, // IEND
      0x44,0xAE,0x42,0x60,0x82,
    ]);
    const iconFiles = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png'];
    for (const name of iconFiles) {
      await invoke('write_binary_file', {
        path: `${destIconsDir}/${name}`,
        contents: Array.from(PNG_1x1),
      });
    }
    this._log(`  ✓ Generated ${iconFiles.length} placeholder icons`);
  }

  private async _generateGameRuntime(gameProjDir: string): Promise<void> {
    const runtime = `// ⚠️ AUTO-GENERATED — DO NOT EDIT
// Game runtime entry point generated by Feather Engine Build System

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Engine } from './engine/Engine';
import { MeshAssetManager } from './editor/MeshAsset';
import { Camera2D } from './engine/Camera2D';
import { TilemapRenderer } from './editor/TilemapRenderer';
import type { TilesetAsset, TilemapAsset } from './engine/TilemapData';
import { isAnimatedTileId, decodeAnimatedTileIndex, TilemapCollisionBuilder } from './engine/TilemapData';
import { Physics2DWorld } from './engine/Physics2DWorld';
import { SpriteActor } from './engine/SpriteActor';
import type { SpriteActorConfig } from './engine/SpriteActor';
import { CharacterMovement2D, defaultCharacterMovement2DProps } from './engine/CharacterMovement2D';
import { SortingLayerManager } from './engine/SortingLayers';
import { ScriptComponent } from './engine/ScriptComponent';
import { EventBus } from './engine/EventBus';
import { AIController } from './engine/AIController';

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const loadingBar = document.getElementById('loading-bar') as HTMLElement;
const loadingStatus = document.getElementById('loading-status') as HTMLElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;

function setProgress(pct: number, msg: string) {
  if (loadingBar) loadingBar.style.width = pct + '%';
  if (loadingStatus) loadingStatus.textContent = msg;
  console.log('[Runtime]', pct + '%', msg);
}

/** Race a promise against a timeout — returns the result or undefined on timeout */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>(r => setTimeout(() => {
      console.warn('[Runtime] TIMEOUT:', label, '(' + ms + 'ms)');
      r(undefined);
    }, ms)),
  ]);
}

// ── Shared state ──
let engine: Engine;
let renderer: THREE.WebGLRenderer;
let fallbackCamera: THREE.PerspectiveCamera;
let sceneLoading = false;

// ── 2D scene state ──
let is2DScene = false;
let camera2D: Camera2D | null = null;
let tilemapRenderer: TilemapRenderer | null = null;
let root2D: THREE.Group | null = null;
let physics2D: Physics2DWorld | null = null;
let spriteActors2D: SpriteActor[] = [];
/** Per-actor compiled blueprint scripts (same as Scene2DManager._actorBlueprintScripts) */
const actorBlueprintScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
/** Per-actor AnimBP event graph scripts (same as Scene2DManager._actorEventScripts) */
const actorAnimBPScripts = new Map<SpriteActor, { script: ScriptComponent | null; started: boolean; elapsed: number }>();
/** Per-actor AnimBP state (current state, sprite sheet, etc.) */
const actorAnimBPStates = new Map<SpriteActor, { abp: any; currentStateId: string }>();
/** 2D AI controllers created for this scene */
let aiControllers2D: any[] = [];
/** Sorting layer manager for correct 2D sprite z-ordering */
let sortingLayerMgr: SortingLayerManager | null = null;
/** Saved 3D renderer settings so we can restore when switching back to a 3D scene */
let saved3DToneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;
let saved3DExposure = 0.75;

/**
 * Set up default scene environment (lights, sky, ground) so the game
 * isn't a black void.  Mirrors the editor's SceneCompositionManager
 * createDefaultComposition() output.  Attempts to load the user's saved
 * composition.json first; falls back to sensible defaults.
 */
async function setupSceneEnvironment(threeScene: THREE.Scene): Promise<void> {
  // Skip 3D environment for 2D scenes — they use their own camera, background, etc.
  if (is2DScene) {
    console.log('[Runtime] Skipping 3D environment setup for 2D scene');
    return;
  }
  // Try loading the project's composition config
  let comp: any = null;
  try {
    const res = await fetch('/project-data/Config/composition.json');
    if (res.ok) comp = await res.json();
  } catch { /* ignore */ }

  // ── Directional Light (Sun) ──
  const dirActor = comp?.actors?.find((a: any) => a.actorType === 'DirectionalLight');
  const dirProps = dirActor?.properties;
  const dirTransform = dirActor?.transform;
  const sunColor = new THREE.Color(dirProps?.color ?? '#FFF8F0');
  const sunIntensity = dirProps?.intensity ?? 1.5;
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  // Use the actor's transform rotation (stored in degrees) to compute sun direction
  const rotX = ((dirTransform?.rotation?.x ?? -45) * Math.PI) / 180;
  const rotY = ((dirTransform?.rotation?.y ?? 0) * Math.PI) / 180;
  sun.position.set(
    Math.sin(rotY) * Math.cos(rotX) * 50,
    -Math.sin(rotX) * 50,
    Math.cos(rotY) * Math.cos(rotX) * 50,
  );
  sun.castShadow = dirProps?.castShadows !== false;
  sun.shadow.mapSize.setScalar(dirProps?.shadowQuality ?? 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = dirProps?.dynamicShadowDistance ?? 80;
  const shadowDist = (dirProps?.dynamicShadowDistance ?? 80) / 2;
  sun.shadow.camera.left = -shadowDist;
  sun.shadow.camera.right = shadowDist;
  sun.shadow.camera.top = shadowDist;
  sun.shadow.camera.bottom = -shadowDist;
  sun.shadow.bias = dirProps?.shadowBias ?? -0.0001;
  sun.shadow.normalBias = dirProps?.shadowNormalBias ?? 0.02;
  sun.shadow.radius = dirProps?.shadowRadius ?? 3;
  threeScene.add(sun);

  // ── Sky Light (Hemisphere) ──
  const skyProps = comp?.actors?.find((a: any) => a.actorType === 'SkyLight')?.properties;
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(skyProps?.skyColor ?? '#B4D4F0'),
    new THREE.Color(skyProps?.groundColor ?? '#AB8860'),
    skyProps?.intensity ?? 0.8,
  );
  threeScene.add(hemi);

  // ── Sky Atmosphere ──
  const skyAtmoActor = comp?.actors?.find((a: any) => a.actorType === 'SkyAtmosphere');
  const skyAtmoProps = skyAtmoActor?.properties;
  const skyType = skyAtmoProps?.skyType ?? 'atmosphere';
  const skyIntensity = skyAtmoProps?.skyIntensity ?? 0.4;

  // PMREMGenerator for environment maps (PBR reflections)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  if (skyType === 'atmosphere') {
    // ── Atmospheric Sky (three.js Sky addon — matches editor SkyAtmosphereActor) ──
    const sky = new Sky();
    sky.scale.setScalar(450000);
    sky.name = '__runtime_sky';
    threeScene.add(sky);

    // Apply atmosphere uniforms
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = skyAtmoProps?.turbidity ?? 0.3;
    uniforms['rayleigh'].value = skyAtmoProps?.rayleigh ?? 0.2;
    uniforms['mieCoefficient'].value = skyAtmoProps?.mieCoefficient ?? 0.001;
    uniforms['mieDirectionalG'].value = skyAtmoProps?.mieDirectionalG ?? 0.3;

    // Compute sun position from elevation/azimuth
    const elevation = skyAtmoProps?.elevation ?? 45;
    const azimuth = skyAtmoProps?.azimuth ?? 180;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunPosition = new THREE.Vector3();
    sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sunPosition);

    // Apply sky intensity
    threeScene.backgroundIntensity = skyIntensity;
    threeScene.environmentIntensity = skyIntensity;

    // Generate IBL environment map from atmospheric sky for PBR reflections
    if (skyAtmoProps?.generateEnvMap !== false) {
      const skyScene = new THREE.Scene();
      const skyCopy = new Sky();
      skyCopy.scale.setScalar(450000);
      const uCopy = skyCopy.material.uniforms;
      uCopy['turbidity'].value = skyAtmoProps?.turbidity ?? 0.3;
      uCopy['rayleigh'].value = skyAtmoProps?.rayleigh ?? 0.2;
      uCopy['mieCoefficient'].value = skyAtmoProps?.mieCoefficient ?? 0.001;
      uCopy['mieDirectionalG'].value = skyAtmoProps?.mieDirectionalG ?? 0.3;
      uCopy['sunPosition'].value.copy(sunPosition);
      skyScene.add(skyCopy);
      const envTexture = pmremGenerator.fromScene(skyScene, 0, 0.1, 1000).texture;
      threeScene.environment = envTexture;
      skyCopy.geometry.dispose();
      (skyCopy.material as THREE.Material).dispose();
    }
  } else if (skyType === 'gradient' && skyAtmoProps) {
    // ── Gradient Sky ──
    const topColor = new THREE.Color(skyAtmoProps.topColor ?? '#87CEEB');
    const bottomColor = new THREE.Color(skyAtmoProps.bottomColor ?? '#FFFFFF');
    const skyGeo = new THREE.SphereGeometry(9000, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
        offset: { value: 33 },
        exponent: { value: skyAtmoProps.gradientExponent ?? 0.6 },
      },
      vertexShader: \`
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      \`,
      fragmentShader: \`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      \`,
      side: THREE.BackSide,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.name = '__runtime_sky';
    threeScene.add(skyMesh);
    threeScene.background = null;
  } else if (skyType === 'color' && skyAtmoProps) {
    // ── Solid Color Sky ──
    threeScene.background = new THREE.Color(skyAtmoProps.solidColor ?? '#87CEEB');
  } else {
    threeScene.background = new THREE.Color(0x87CEEB);
  }

  // ── Ground Plane ──
  const gpProps = comp?.actors?.find((a: any) => a.actorType === 'DevGroundPlane')?.properties;
  if (gpProps?.planeSize || !comp) {
    const size = gpProps?.planeSize ?? 100;
    const groundGeo = new THREE.PlaneGeometry(size, size);

    // Generate the same UE5-style dev checker texture used in the editor
    const texSize = 512;
    const cvs = document.createElement('canvas');
    cvs.width = texSize;
    cvs.height = texSize;
    const ctx2d = cvs.getContext('2d')!;
    const primary = gpProps?.primaryColor ?? '#4a4a5a';
    const secondary = gpProps?.secondaryColor ?? '#3a3a4a';
    const lineCol = gpProps?.lineColor ?? '#555568';
    const tileCount = 8;
    const tileSize = texSize / tileCount;
    for (let y = 0; y < tileCount; y++) {
      for (let x = 0; x < tileCount; x++) {
        ctx2d.fillStyle = (x + y) % 2 === 0 ? primary : secondary;
        ctx2d.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
    ctx2d.strokeStyle = lineCol;
    ctx2d.lineWidth = 1;
    for (let i = 0; i <= tileCount; i++) {
      const pos = i * tileSize;
      ctx2d.beginPath(); ctx2d.moveTo(pos, 0); ctx2d.lineTo(pos, texSize); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(0, pos); ctx2d.lineTo(texSize, pos); ctx2d.stroke();
    }
    ctx2d.strokeStyle = lineCol;
    ctx2d.lineWidth = 2;
    ctx2d.globalAlpha = 0.6;
    const half = texSize / 2;
    ctx2d.beginPath(); ctx2d.moveTo(half, 0); ctx2d.lineTo(half, texSize); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(0, half); ctx2d.lineTo(texSize, half); ctx2d.stroke();
    ctx2d.globalAlpha = 1;
    const devTexture = new THREE.CanvasTexture(cvs);
    devTexture.wrapS = THREE.RepeatWrapping;
    devTexture.wrapT = THREE.RepeatWrapping;
    devTexture.repeat.set(gpProps?.textureScale ?? 20, gpProps?.textureScale ?? 20);
    devTexture.magFilter = THREE.LinearFilter;
    devTexture.minFilter = THREE.LinearMipmapLinearFilter;
    devTexture.colorSpace = THREE.SRGBColorSpace;

    const groundMat = new THREE.MeshStandardMaterial({
      map: devTexture,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.name = '__runtime_ground';
    threeScene.add(ground);

    // Resize the physics ground collider to match the visual ground plane
    if (gpProps?.hasCollision !== false && engine.physics) {
      engine.physics.setGroundPlaneSize(size / 2);
    }
  }

  // ── Post-Process settings ──
  const ppProps = comp?.actors?.find((a: any) => a.actorType === 'PostProcessVolume')?.properties;
  if (ppProps) {
    // Apply tone mapping from composition
    if (ppProps.toneMappingType === 'ACES') {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    } else if (ppProps.toneMappingType === 'Reinhard') {
      renderer.toneMapping = THREE.ReinhardToneMapping;
    } else if (ppProps.toneMappingType === 'Cineon') {
      renderer.toneMapping = THREE.CineonToneMapping;
    } else if (ppProps.toneMappingType === 'Linear') {
      renderer.toneMapping = THREE.LinearToneMapping;
    } else if (ppProps.toneMappingType === 'AgX') {
      renderer.toneMapping = THREE.AgXToneMapping;
    } else if (ppProps.toneMappingType === 'Neutral') {
      renderer.toneMapping = THREE.NeutralToneMapping;
    }
    renderer.toneMappingExposure = ppProps.exposure ?? 1.0;
  }

  // ── World Settings (gravity) ──
  const ws = comp?.worldSettings;
  if (ws && engine.physics?.world) {
    // Composition gravity is in cm/s² (UE-style), convert to m/s² for Rapier
    const gravY = (ws.gravity ?? -980) / 100;
    engine.physics.world.gravity = { x: 0, y: gravY, z: 0 };
  }

  // ── Extract PlayerStart transform ──
  const psActor = comp?.actors?.find((a: any) => a.actorType === 'PlayerStart');
  if (psActor?.transform) {
    engine.playerStartTransform = {
      position: {
        x: psActor.transform.position?.x ?? 0,
        y: psActor.transform.position?.y ?? 0,
        z: psActor.transform.position?.z ?? 0,
      },
      rotationY: ((psActor.transform.rotation?.y ?? 0) * Math.PI) / 180,
    };
    console.log('[Runtime]   ✓ PlayerStart found at', JSON.stringify(engine.playerStartTransform.position));
  }

  // Clean up PMREMGenerator
  pmremGenerator.dispose();

  console.log('[Runtime] Scene environment set up', comp ? '(from composition.json)' : '(defaults)');
}

// ── Mesh Asset Loading ──
// Loads all mesh bundles (mesh + materials + textures) into MeshAssetManager
// so the engine can find and load them when creating game objects.
async function initMeshAssets(): Promise<void> {
  try {
    const indexRes = await fetch('/project-data/Meshes/_index.json');
    if (!indexRes.ok) {
      console.log('[Runtime] No mesh asset index found — skipping mesh preload');
      return;
    }
    const index: Array<{ id: string; name: string; file: string }> = await indexRes.json();
    if (index.length === 0) return;

    const mgr = new MeshAssetManager();
    const allMeshAssets: any[] = [];
    const allMaterials: any[] = [];
    const allTextures: any[] = [];
    const allAnimations: any[] = [];

    for (const entry of index) {
      try {
        const bundleRes = await fetch('/project-data/Meshes/' + entry.file);
        if (!bundleRes.ok) continue;
        const bundle = await bundleRes.json();
        if (bundle.meshAsset) {
          allMeshAssets.push(bundle.meshAsset);
          if (bundle.materials) allMaterials.push(...bundle.materials);
          if (bundle.textures) allTextures.push(...bundle.textures);
          if (bundle.animations) allAnimations.push(...bundle.animations);
        }
      } catch (e) {
        console.warn('[Runtime] Failed to load mesh bundle:', entry.file, e);
      }
    }

    // Also load standalone materials (not tied to any specific mesh)
    try {
      const smRes = await fetch('/project-data/Meshes/_standalone_materials.json');
      if (smRes.ok) {
        const sm = await smRes.json();
        if (sm.materials) allMaterials.push(...sm.materials);
        if (sm.textures) allTextures.push(...sm.textures);
      }
    } catch { /* ignore */ }

    mgr.importAll({
      meshAssets: allMeshAssets,
      materials: allMaterials,
      textures: allTextures,
      animations: allAnimations,
    });
    console.log('[Runtime] Loaded', allMeshAssets.length, 'mesh assets,', allMaterials.length, 'materials,', allTextures.length, 'textures');
  } catch (e) {
    console.warn('[Runtime] Mesh asset init failed:', e);
  }
}

// ── Runtime Asset Loading ──
// Loads all cooked assets (actors, game instances, widgets, sounds, input mappings,
// data tables, structures, enums, save game classes) and wires them into the engine
// so blueprint code has full feature parity with the editor runtime.
async function initRuntimeAssets(projectMeta: any): Promise<void> {
  console.log('[Runtime] Loading runtime assets...');

  // ── 1. Actor Asset Manager shim ──
  // Needed so Engine.onPlayStarted() can resolve controller blueprint code,
  // and Scene.spawnActorFromClass() can spawn actors.
  const actorMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Actors/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Actors/' + entry.file);
          if (r.ok) actorMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no actors */ }

  if (actorMap.size > 0) {
    const assetManagerShim = {
      getAsset(id: string) { return actorMap.get(id) ?? null; },
      getAllAssets() { return Array.from(actorMap.values()); },
      getAssetByName(name: string) {
        for (const a of actorMap.values()) { if (a.name === name) return a; }
        return null;
      },
    };
    engine.assetManager = assetManagerShim as any;
    (engine.scene as any).assetManager = assetManagerShim;
    console.log('[Runtime]   ✓ Actor assets:', actorMap.size);
  }

  // ── 2. AI Asset Manager shim ──
  // Check for AI controllers in the cooked Actors (they are actor assets with actorType)
  const aiControllerMap = new Map<string, any>();
  for (const [id, actor] of actorMap) {
    if (actor.controllerClass === 'AIController' || actor.actorType === 'aiController') {
      aiControllerMap.set(id, actor);
    }
  }
  // Also try dedicated AIControllers folder
  try {
    const res = await fetch('/project-data/AIControllers/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/AIControllers/' + entry.file);
          if (r.ok) aiControllerMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no AI controllers folder */ }

  if (aiControllerMap.size > 0) {
    engine.aiAssetManager = {
      getAIController(id: string) { return aiControllerMap.get(id) ?? null; },
      getAllTasks: () => [],
    } as any;
    console.log('[Runtime]   ✓ AI controller assets:', aiControllerMap.size);
  }

  // ── 3. Game Instance Manager shim ──
  const gameInstanceAssets: any[] = [];
  try {
    const res = await fetch('/project-data/GameInstances/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/GameInstances/' + entry.file);
          if (r.ok) gameInstanceAssets.push(await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no game instances */ }

  // Also try loading directly by ID if no index exists
  if (gameInstanceAssets.length === 0 && projectMeta.gameInstanceClassId) {
    try {
      const r = await fetch('/project-data/GameInstances/' + projectMeta.gameInstanceClassId + '.json');
      if (r.ok) gameInstanceAssets.push(await r.json());
    } catch { /* skip */ }
  }

  if (gameInstanceAssets.length > 0) {
    engine.gameInstanceManager = { assets: gameInstanceAssets } as any;
    console.log('[Runtime]   ✓ Game Instance assets:', gameInstanceAssets.length);
  }

  // ── 4. Game Instance Class ID from project settings ──
  if (projectMeta.gameInstanceClassId) {
    engine.gameInstanceClassId = projectMeta.gameInstanceClassId;
    console.log('[Runtime]   ✓ Game Instance class:', projectMeta.gameInstanceClassId);
  }

  // ── 5. Widget Blueprint resolver ──
  const widgetMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Widgets/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Widgets/' + entry.file);
          if (r.ok) {
            const wbp = await r.json();
            // Build RuntimeWidgetBlueprint from cooked JSON
            widgetMap.set(entry.id, {
              id: wbp.widgetBlueprintId ?? entry.id,
              name: wbp.widgetBlueprintName ?? entry.name,
              rootWidgetId: wbp.rootWidgetId ?? '',
              widgets: wbp.widgets ?? {},
              compiledCode: wbp.compiledCode ?? '',
            });
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* no widgets */ }

  if (widgetMap.size > 0) {
    engine.uiManager.setBlueprintResolver((id: string) => widgetMap.get(id) ?? null);
    console.log('[Runtime]   ✓ Widget blueprints:', widgetMap.size);
  }

  // ── 6. Sound Cue resolver ──
  const soundMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Sounds/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Sounds/' + entry.file);
          if (r.ok) soundMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no sounds */ }

  if (soundMap.size > 0) {
    engine.audio.setSoundCueResolver((cueId: string) => {
      const cue = soundMap.get(cueId);
      if (!cue) return null;
      // Try to resolve to a playable URL
      const url = cue.url ?? cue.fileUrl ?? cue.filePath ?? null;
      if (!url) return null;
      return { url, volume: cue.volume ?? 1, pitch: cue.pitch ?? 1 };
    });
    console.log('[Runtime]   ✓ Sound assets:', soundMap.size);
  }

  // ── 7. Input Mappings ──
  try {
    const res = await fetch('/project-data/InputMappings/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/InputMappings/' + entry.file);
          if (r.ok) {
            const mapping = await r.json();
            if (mapping.actionMappings || mapping.axisMappings) {
              engine.input.loadMappings(
                mapping.actionMappings ?? [],
                mapping.axisMappings ?? [],
              );
              console.log('[Runtime]   ✓ Input mappings loaded:', entry.name ?? entry.id);
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* no input mappings */ }

  // ── 8. Data Tables ──
  const dataTableMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/DataTables/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/DataTables/' + entry.file);
          if (r.ok) dataTableMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no data tables */ }

  if (dataTableMap.size > 0) {
    // Expose via a global so compiled blueprint code can access it
    (globalThis as any).__dataTableManager = {
      getTable(id: string) { return dataTableMap.get(id) ?? null; },
      getRow(tableId: string, rowKey: string) {
        const table = dataTableMap.get(tableId);
        if (!table?.rows) return null;
        return table.rows.find((r: any) => r.key === rowKey || r.id === rowKey || r.name === rowKey) ?? null;
      },
    };
    console.log('[Runtime]   ✓ Data tables:', dataTableMap.size);
  }

  // ── 9. Structures & Enums ──
  const structMap = new Map<string, any>();
  const enumMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/Structures/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Structures/' + entry.file);
          if (r.ok) structMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no structures */ }
  try {
    const res = await fetch('/project-data/Enums/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/Enums/' + entry.file);
          if (r.ok) enumMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no enums */ }

  if (structMap.size > 0 || enumMap.size > 0) {
    (globalThis as any).__structureManager = {
      getStructure(id: string) { return structMap.get(id) ?? null; },
      getEnum(id: string) { return enumMap.get(id) ?? null; },
      getAllStructures() { return Array.from(structMap.values()); },
      getAllEnums() { return Array.from(enumMap.values()); },
    };
    console.log('[Runtime]   ✓ Structures:', structMap.size, 'Enums:', enumMap.size);
  }

  // ── 10. Save Game Classes ──
  const saveGameMap = new Map<string, any>();
  try {
    const res = await fetch('/project-data/SaveGameClasses/_index.json');
    if (res.ok) {
      const index: Array<{ id: string; name: string; file: string }> = await res.json();
      for (const entry of index) {
        try {
          const r = await fetch('/project-data/SaveGameClasses/' + entry.file);
          if (r.ok) saveGameMap.set(entry.id, await r.json());
        } catch { /* skip */ }
      }
    }
  } catch { /* no save game classes */ }

  if (saveGameMap.size > 0) {
    (globalThis as any).__saveGameManager = {
      getClass(id: string) { return saveGameMap.get(id) ?? null; },
      getAllClasses() { return Array.from(saveGameMap.values()); },
    };
    console.log('[Runtime]   ✓ Save game classes:', saveGameMap.size);
  }

  console.log('[Runtime] Runtime assets loaded');
}

// ── Blueprint Script Execution for 2D Actors ──
// Mirrors Scene2DManager._runActorBlueprintScript() — compiles and runs the
// actor blueprint code (Event Graph) each frame so behaviour matches the editor.
function runActorBlueprintScript(actor: SpriteActor, deltaTime: number): void {
  const actorAny = actor as any;
  const code: string | undefined = actorAny.__actorBlueprintCode;
  if (!code) return;

  let ev = actorBlueprintScripts.get(actor);
  if (!ev) {
    const sc = new ScriptComponent();
    sc.code = code;
    const ok = sc.compile();
    ev = { script: ok ? sc : null, started: false, elapsed: 0 };
    actorBlueprintScripts.set(actor, ev);
    if (!ok) {
      console.warn('[Runtime 2D] Failed to compile actor blueprint for "' + actor.name + '".');
    }
  }
  if (!ev.script) return;

  // ── Scene shim ──
  const sceneShim = {
    get gameObjects() { return spriteActors2D as any[]; },
    findById: (id: number) => spriteActors2D.find(a => (a as any).id === id) ?? null,
    destroyActor: (target: any) => {
      // Deferred destroy — remove from spriteActors2D at end of frame
      if (target && spriteActors2D.includes(target)) {
        (target as any).__pendingDestroy = true;
      }
    },
  };

  // ── Collision shim (bridges 3D overlap API → 2D events) ──
  const collisionShim = {
    registerCallbacks(_goId: number) {
      const cbs = {
        onBeginOverlap: [] as Array<(evt: any) => void>,
        onEndOverlap:   [] as Array<(evt: any) => void>,
        onHit:          [] as Array<(evt: any) => void>,
      };
      actor.on('triggerBegin2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onBeginOverlap) cb(mapped);
      });
      actor.on('triggerEnd2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onEndOverlap) cb(mapped);
      });
      actor.on('collisionBegin2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onBeginOverlap) cb(mapped);
      });
      actor.on('collisionEnd2D', (evt: any) => {
        const mapped = {
          otherActorName: evt.otherName ?? evt.otherActor?.name ?? '',
          otherActorId:   evt.otherActor?.id ?? 0,
          selfComponentName: evt.selfComponentName ?? '',
        };
        for (const cb of cbs.onEndOverlap) cb(mapped);
      });
      return cbs;
    },
    isOverlapping(_a: number, _b: number) { return false; },
    getOverlappingCount(_id: number) { return 0; },
    getOverlappingIds(_id: number) { return []; },
  };

  const physicsShim = {
    collision: collisionShim,
    world: null,
  };

  // ── Engine shim (minimal surface that compiled code may access) ──
  const engineShim = {
    scene2DManager: null,  // no Scene2DManager in built game
    navMeshSystem: null,
    _DragSelectionComponent: null,
    eventBus: EventBus.getInstance(),
    get _playCanvas() { return canvas; },
    input: engine.input,
    uiManager: (engine as any).uiManager ?? null,
    spawnActor: (_classId: string, _className: string, _pos: any, _rot: any, _sc: any, _owner: any, _overrides: any) => {
      console.warn('[Runtime 2D] spawnActor not yet supported in build runtime');
      return null;
    },
  };

  const ctx = {
    gameObject:   actor as any,
    deltaTime,
    elapsedTime:  ev.elapsed,
    print:        (v: any) => console.log('[Actor2D]', v),
    physics:      physicsShim,
    scene:        sceneShim,
    animInstance:  null,
    engine:       engineShim,
    gameInstance:  (engine as any).gameInstance ?? null,
  };

  if (!ev.started) {
    console.log('[Runtime 2D] ▶ BeginPlay (actor blueprint) for "' + actor.name + '"');
    ev.script.beginPlay(ctx);
    ev.started = true;
  }
  ev.script.tick(ctx);
  ev.elapsed += deltaTime;
}

/** Flush deferred actor destroys at end of frame */
function flushPendingDestroys(): void {
  for (let i = spriteActors2D.length - 1; i >= 0; i--) {
    const actor = spriteActors2D[i] as any;
    if (actor.__pendingDestroy) {
      spriteActors2D.splice(i, 1);
      if (root2D) root2D.remove(actor.group);
      // Run onDestroy on the script
      const ev = actorBlueprintScripts.get(actor);
      if (ev?.script && ev.started) {
        try {
          const destroyCtx = {
            gameObject: actor,
            deltaTime: 0,
            elapsedTime: ev.elapsed,
            print: (v: any) => console.log('[Actor2D]', v),
            physics: null,
            scene: { get gameObjects() { return spriteActors2D as any[]; }, findById: () => null, destroyActor: () => {} },
            animInstance: null,
            engine: { scene2DManager: null, navMeshSystem: null, _DragSelectionComponent: null, eventBus: EventBus.getInstance(), get _playCanvas() { return canvas; }, input: engine.input, uiManager: null, spawnActor: () => null },
            gameInstance: (engine as any).gameInstance ?? null,
          };
          ev.script.onDestroy(destroyCtx);
        } catch (err) {
          console.error('[Runtime 2D] Error running onDestroy for "' + actor.name + '":', err);
        }
      }
      actorBlueprintScripts.delete(actor);
      actorAnimBPScripts.delete(actor);
      actorAnimBPStates.delete(actor);
      try { actor.dispose(physics2D ?? undefined); } catch {}
    }
  }
}

// ── AnimBP 2D: Sync physics variables into animator ──
// Mirrors Scene2DManager._syncAnimBPVars — populates speed, velocity,
// isGrounded, isFalling, facingRight etc. so AnimBP transitions work.
function syncAnimBPVars(actor: SpriteActor, _deltaTime: number): void {
  const animator = actor.animator;
  const actorAny = actor as any;

  // Bootstrap per-actor anim variable store
  if (!actorAny.__animVars) {
    actorAny.__animVars = {
      speed: 0, velocityX: 0, velocityY: 0,
      isGrounded: false, isJumping: false, isFalling: false, facingRight: true,
    };
    // Copy ABP-declared variable defaults
    const entry = actorAnimBPStates.get(actor);
    const abp = entry?.abp;
    if (abp?.blueprintData?.variables) {
      for (const v of abp.blueprintData.variables as any[]) {
        if (!(v.name in actorAny.__animVars)) {
          let def: any = v.defaultValue ?? null;
          if (v.type === 'Float') def = typeof def === 'number' ? def : 0;
          if (v.type === 'Boolean') def = def === true || def === 'true';
          actorAny.__animVars[v.name] = def;
        }
      }
    }
  }

  // Read physics state
  if (animator) {
    animator.syncAutoVariables(actor);
    actorAny.__animVars['speed']      = animator.variables['speed']      ?? 0;
    actorAny.__animVars['velocityX']  = animator.variables['velocityX']  ?? 0;
    actorAny.__animVars['velocityY']  = animator.variables['velocityY']  ?? 0;
    actorAny.__animVars['isGrounded'] = animator.variables['isGrounded'] ?? false;
    actorAny.__animVars['isJumping']  = animator.variables['isJumping']  ?? false;
    actorAny.__animVars['isFalling']  = animator.variables['isFalling']  ?? false;
  } else {
    const rb = actor.getComponent('RigidBody2D');
    if (rb?.rigidBody) {
      const vel = rb.rigidBody.linvel();
      actorAny.__animVars['speed']      = Math.abs(vel.x);
      actorAny.__animVars['velocityX']  = vel.x;
      actorAny.__animVars['velocityY']  = vel.y;
      actorAny.__animVars['isGrounded'] = rb.isGrounded ?? false;
      actorAny.__animVars['isJumping']  = vel.y >  0.01 && !(rb.isGrounded ?? false);
      actorAny.__animVars['isFalling']  = vel.y < -0.01 && !(rb.isGrounded ?? false);
    }
  }

  // Override with CM2D values (more accurate)
  const cm = actor.characterMovement2D;
  if (cm) {
    const rb = actor.getComponent('RigidBody2D');
    const vy = rb?.rigidBody?.linvel()?.y ?? 0;
    actorAny.__animVars['isGrounded']  = cm.isGrounded;
    actorAny.__animVars['isJumping']   = !cm.isGrounded && vy > 0.01;
    actorAny.__animVars['isFalling']   = !cm.isGrounded && vy < -0.01;
    actorAny.__animVars['facingRight'] = cm.facingRight;
    if (animator) {
      animator.variables['isGrounded']  = cm.isGrounded;
      animator.variables['isJumping']   = !cm.isGrounded && vy > 0.01;
      animator.variables['isFalling']   = !cm.isGrounded && vy < -0.01;
      animator.variables['facingRight'] = cm.facingRight;
    }
  }

  // ── Run AnimBP event graph (compiled code) ──
  const entry = actorAnimBPStates.get(actor);
  const abp = entry?.abp;
  if (!entry || !abp?.compiledCode) return;

  let ev = actorAnimBPScripts.get(actor);
  if (!ev) {
    const sc = new ScriptComponent();
    sc.code = abp.compiledCode;
    const ok = sc.compile();
    ev = { script: ok ? sc : null, started: false, elapsed: 0 };
    actorAnimBPScripts.set(actor, ev);
    if (!ok) console.warn('[Runtime 2D] Failed to compile AnimBP for', abp.name);
  }
  if (!ev.script) return;

  const vars: Record<string, any> = actorAny.__animVars;
  const varShim = {
    get: (k: string) => vars[k],
    set: (k: string, v: any) => { vars[k] = v; if (animator) animator.variables[k] = v; },
    has: (k: string) => k in vars,
  };

  const ctx = {
    gameObject: actor as any,
    deltaTime: _deltaTime,
    elapsedTime: ev.elapsed,
    print: (v: any) => console.log('[AnimBP2D]', v),
    physics: { collision: { registerCallbacks: () => ({ onBeginOverlap: [], onEndOverlap: [], onHit: [] }) }, world: null },
    scene: { get gameObjects() { return spriteActors2D as any[]; }, findById: (id: number) => spriteActors2D.find(a => (a as any).id === id) ?? null, destroyActor: () => {} },
    animInstance: { variables: varShim, asset: abp },
    engine: { scene2DManager: null, navMeshSystem: null, _DragSelectionComponent: null, eventBus: EventBus.getInstance(), get _playCanvas() { return canvas; }, input: engine.input, uiManager: (engine as any).uiManager ?? null, spawnActor: () => null },
    gameInstance: (engine as any).gameInstance ?? null,
  };

  if (!ev.started) {
    ev.script.beginPlay(ctx);
    ev.started = true;
  }
  ev.script.tick(ctx);
  ev.elapsed += _deltaTime;

  // Mirror event-graph vars back to animator
  if (animator) {
    for (const k of Object.keys(vars)) {
      animator.variables[k] = vars[k];
    }
  }
}

// ── AnimBP 2D transition evaluator ──
// Mirrors Scene2DManager._evalAnimBPTransitions
function evalAnimBPTransitions(actor: SpriteActor): void {
  const entry = actorAnimBPStates.get(actor);
  if (!entry) return;
  const { abp } = entry;
  const sm = abp?.stateMachine;
  if (!sm) return;
  const animator = actor.animator;
  if (!animator) return;
  const vars: Record<string, any> = (actor as any).__animVars ?? animator.variables ?? {};

  const transitions: any[] = (sm.transitions ?? [])
    .filter((t: any) => t.fromStateId === entry.currentStateId || t.fromStateId === '*')
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const t of transitions) {
    if (t.toStateId === entry.currentStateId) continue;

    const hasRules = t.rules && t.rules.length > 0;
    if (!hasRules) {
      if (animator.currentAnim?.loop) continue;
      if (animator.isPlaying) continue;
    } else {
      if (!evalTransitionRules(t, vars)) continue;
    }

    const targetState = sm.states.find((s: any) => s.id === t.toStateId);
    if (!targetState) continue;

    entry.currentStateId = t.toStateId;

    // Apply blend space or direct animation
    if (targetState.blendSpace1D) {
      applyBlendSpace(targetState, vars, animator);
    } else if (targetState.spriteAnimationName) {
      animator.play(targetState.spriteAnimationName);
    }
    break;
  }
}

function evalTransitionRules(t: any, vars: Record<string, any>): boolean {
  const groups: any[] = t.rules ?? [];
  if (groups.length === 0) return true;
  const logic: string = t.ruleLogic ?? 'AND';
  const evalGroup = (g: any) => {
    const rules: any[] = g.rules ?? [];
    if (rules.length === 0) return true;
    const evalRule = (r: any) => {
      if (r.kind === 'expr') {
        try { return !!new Function('vars', 'with(vars){return!!(' + r.expr + ')}')(vars); } catch { return false; }
      }
      const val = vars[r.varName]; const cmp = r.value;
      switch (r.op) {
        case '==': return val == cmp; case '!=': return val != cmp;
        case '>': return Number(val) > Number(cmp); case '<': return Number(val) < Number(cmp);
        case '>=': return Number(val) >= Number(cmp); case '<=': return Number(val) <= Number(cmp);
        case 'contains': return String(val).includes(String(cmp));
        default: return false;
      }
    };
    return g.op === 'AND' ? rules.every(evalRule) : rules.some(evalRule);
  };
  return logic === 'AND' ? groups.every(evalGroup) : groups.some(evalGroup);
}

function applyBlendSpace(state: any, vars: Record<string, any>, animator: any): void {
  const bs = state.blendSpace1D;
  if (!bs?.samples?.length) {
    if (state.spriteAnimationName) animator.play(state.spriteAnimationName);
    return;
  }
  const drivingVar = state.blendSpriteAxisVar || bs.drivingVariable;
  const axisValue: number = typeof vars[drivingVar] === 'number' ? vars[drivingVar] : 0;
  const sorted = [...bs.samples].sort((a: any, b: any) => a.rangeMin - b.rangeMin);
  let best = sorted.find((s: any) => axisValue >= s.rangeMin && axisValue <= s.rangeMax);
  if (!best) {
    best = sorted.reduce((prev: any, cur: any) => {
      const pm = (prev.rangeMin + prev.rangeMax) / 2;
      const cm2 = (cur.rangeMin + cur.rangeMax) / 2;
      return Math.abs(axisValue - cm2) < Math.abs(axisValue - pm) ? cur : prev;
    });
  }
  if (!best?.spriteAnimationName) return;
  if (animator.currentAnim?.animName !== best.spriteAnimationName) {
    animator.play(best.spriteAnimationName);
  }
}

// ── Controller shim setup for 2D actors ──
// Attaches lightweight controller/characterController properties so
// blueprint nodes like "Get Controller", "Get Pawn", "Cast To" work.
function setupControllerShims(): void {
  for (const actor of spriteActors2D) {
    const actorAny = actor as any;
    if (!actorAny.__2dControllerShim) {
      actorAny.__2dControllerShim = {
        controllerType: actor.controllerClass === 'AIController' ? 'AIController' : 'PlayerController',
        getPawn: () => ({ gameObject: actor }),
        isPossessing: () => true,
      };
    }
    if (actorAny.controller == null) actorAny.controller = actorAny.__2dControllerShim;
    if (actorAny.characterController == null) actorAny.characterController = { gameObject: actor };
    if (actorAny.actorAssetId == null && actorAny.blueprintId) {
      actorAny.actorAssetId = actorAny.blueprintId;
    }
  }
}

// ── AI Controller setup for 2D actors ──
// Mirrors Scene2DManager.setupAIControllers2D
function setupAIControllers2D(): void {
  for (const ctrl of aiControllers2D) ctrl.destroy?.();
  aiControllers2D = [];

  for (const actor of spriteActors2D) {
    if (actor.controllerClass !== 'AIController') continue;
    if (!actor.characterMovement2D) continue;

    const aiCtrl = new AIController();
    (aiCtrl as any).is2D = true;

    const pawnAdapter: any = {
      gameObject: actor as any,
      controller: null as any,
      destroy() {},
    };
    aiCtrl.possess(pawnAdapter);
    actor.aiController = aiCtrl;
    actor.controller = aiCtrl;

    aiControllers2D.push(aiCtrl);
    engine.aiControllers.register(aiCtrl);
  }

  if (aiControllers2D.length > 0) {
    console.log('[Runtime 2D]   ✓ %d AI controllers created', aiControllers2D.length);
  }
}

// ── Load AnimBP 2D data for actors ──
// Fetches AnimBP JSON files and wires them to sprite actors
async function loadAnimBP2DData(): Promise<void> {
  // Collect unique AnimBP IDs from all 2D actors
  const abpIds = new Set<string>();
  for (const actor of spriteActors2D) {
    if (actor.animBlueprintId) abpIds.add(actor.animBlueprintId);
  }
  if (abpIds.size === 0) return;

  // Try to load AnimBP index
  let abpIndex: Array<{ id: string; name: string; file: string }> = [];
  try {
    const res = await fetch('/project-data/AnimBlueprints/_index.json');
    if (res.ok) abpIndex = await res.json();
  } catch { /* no AnimBP index */ }

  const abpMap = new Map<string, any>();
  for (const entry of abpIndex) {
    if (!abpIds.has(entry.id)) continue;
    try {
      const res = await fetch('/project-data/AnimBlueprints/' + entry.file);
      if (res.ok) {
        const abpData = await res.json();
        abpMap.set(entry.id, abpData);
        console.log('[Runtime 2D]   ✓ AnimBP loaded:', entry.name);
      }
    } catch { /* skip */ }
  }

  // Wire AnimBP to actors
  for (const actor of spriteActors2D) {
    if (!actor.animBlueprintId) continue;
    const abp = abpMap.get(actor.animBlueprintId);
    if (!abp) continue;

    const sm = abp.stateMachine;
    // Use entry state if specified, otherwise fall back to first state
    const entryState = sm?.entryStateId
      ? sm.states?.find((s: any) => s.id === sm.entryStateId) ?? sm?.states?.[0]
      : sm?.states?.[0];
    const initialState = entryState?.id ?? '';
    actorAnimBPStates.set(actor, { abp, currentStateId: initialState });

    // Play the entry state animation
    if (entryState?.spriteAnimationName && actor.animator) {
      // Swap sprite sheet if entry state uses a different one
      if (entryState.spriteSheetId && actor._spriteSheet?.assetId !== entryState.spriteSheetId) {
        const entrySheet = spriteSheetMap.get(entryState.spriteSheetId);
        if (entrySheet?.image && entrySheet?.texture) {
          actor.setSpriteSheet(entrySheet);
          if (entrySheet.animations?.length > 0) {
            actor.initAnimator(entrySheet.animations);
          }
        }
      }
      actor.animator.play(entryState.spriteAnimationName);
    }
  }
}

// ── 2D Scene Setup ──
// Handles tilemap rendering, orthographic camera, background color, physics 2D,
// SpriteActor spawning, CharacterMovement2D, and camera follow.
// Mirrors the editor's Scene2DManager pipeline.
async function setup2DScene(sceneData: any): Promise<void> {
  const config2D = sceneData.scene2DConfig;
  const renderSettings = config2D.renderSettings ?? config2D.config?.renderSettings ?? {};
  const worldSettings = config2D.worldSettings ?? config2D.config?.worldSettings ?? {};

  // ── Background color ──
  const bgColor = renderSettings.backgroundColor ?? '#1a1a2e';
  engine.scene.threeScene.background = new THREE.Color(bgColor);

  // ── Renderer settings for 2D (match editor's _render2D) ──
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ── Create root2D group ──
  root2D = new THREE.Group();
  root2D.name = '__root2D__';
  engine.scene.threeScene.add(root2D);

  // ── Create Camera2D ──
  const ppu = renderSettings.pixelsPerUnit ?? 100;
  camera2D = new Camera2D(undefined, {
    pixelsPerUnit: ppu,
    referenceResolution: renderSettings.referenceResolution ?? { width: 1920, height: 1080 },
    backgroundColor: bgColor,
  });
  camera2D.resize(window.innerWidth, window.innerHeight);

  // ── Initialise Physics2DWorld ──
  physics2D = new Physics2DWorld();
  await physics2D.init({
    gravity: worldSettings.gravity ?? { x: 0, y: -980 },
    pixelsPerUnit: ppu,
  });
  console.log('[Runtime 2D]   ✓ Physics2DWorld initialised (gravity: %s, ppu: %d)',
    JSON.stringify(worldSettings.gravity ?? { x: 0, y: -980 }), ppu);

  // ── Sorting layer manager for z-ordering ──
  const sortingLayerConfig = config2D.config?.sortingLayers ?? config2D.sortingLayers ?? undefined;
  sortingLayerMgr = new SortingLayerManager(sortingLayerConfig);

  // ── Load tileset images and build tilemap meshes ──
  const tilesets: TilesetAsset[] = config2D.tilesets ?? [];
  const tilemaps: TilemapAsset[] = config2D.tilemaps ?? [];

  // Load tileset images from project-data (saved as Textures/<name>_<id>.png)
  for (const ts of tilesets) {
    if (ts.imagePath) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ts.image = img;
            console.log('[Runtime 2D]   ✓ Tileset image loaded:', ts.assetName, img.naturalWidth + 'x' + img.naturalHeight);
            resolve();
          };
          img.onerror = () => {
            console.warn('[Runtime 2D]   ✗ Tileset image failed to load:', ts.imagePath);
            resolve();
          };
          img.src = '/project-data/' + ts.imagePath;
        });
      } catch (e) {
        console.warn('[Runtime 2D] Error loading tileset image:', e);
      }
    } else if (ts.imageDataUrl) {
      // Fallback to inline base64 data URL
      try {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => { ts.image = img; resolve(); };
          img.onerror = () => resolve();
          img.src = ts.imageDataUrl!;
        });
      } catch { /* ignore */ }
    }
  }

  // Create TilemapRenderer and set all tilemaps/tilesets
  tilemapRenderer = new TilemapRenderer(root2D);
  tilemapRenderer.setAllTilemaps(tilemaps, tilesets);
  console.log('[Runtime 2D]   ✓ Tilemap renderer built — %d tilemaps, %d tilesets', tilemaps.length, tilesets.length);

  // ── Build tilemap collision bodies ──
  {
    const collisionBuilder = new TilemapCollisionBuilder();
    for (const tilemap of tilemaps) {
      const tileset = tilesets.find(ts => ts.assetId === tilemap.tilesetId);
      if (!tileset) continue;
      for (const layer of tilemap.layers) {
        collisionBuilder.rebuild(layer, physics2D, tileset);
      }
    }
    const stats = physics2D.getWorldStats();
    console.log('[Runtime 2D]   ✓ Tile collision built — bodies=%d, colliders=%d', stats.bodies, stats.colliders);
  }

  // ── Load sprite sheet images for character pawns ──
  const spriteSheets: any[] = config2D.spriteSheets ?? [];
  const spriteSheetMap = new Map<string, any>();
  for (const ss of spriteSheets) {
    if (ss.imagePath) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ss.image = img;
            console.log('[Runtime 2D]   ✓ SpriteSheet image loaded:', ss.assetName, img.naturalWidth + 'x' + img.naturalHeight);
            resolve();
          };
          img.onerror = () => {
            console.warn('[Runtime 2D]   ✗ SpriteSheet image failed:', ss.imagePath);
            resolve();
          };
          img.src = '/project-data/' + ss.imagePath;
        });
      } catch { /* ignore */ }
    } else if (ss.imageDataUrl) {
      try {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => { ss.image = img; resolve(); };
          img.onerror = () => resolve();
          img.src = ss.imageDataUrl!;
        });
      } catch { /* ignore */ }
    }
    // Build THREE.Texture if image loaded
    if (ss.image) {
      const tex = new THREE.Texture(ss.image as HTMLImageElement);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // must match SpriteRenderer UV math
      tex.needsUpdate = true;
      ss.texture = tex;
    }
    spriteSheetMap.set(ss.assetId, ss);
  }

  // ── Create 2D game objects (characterPawn2D / spriteActor) ──
  // For 2D scenes, we create engine GOs for blueprint execution AND
  // proper SpriteActors with physics bodies in root2D.
  spriteActors2D = [];

  if (sceneData.gameObjects) {
    for (const goData of sceneData.gameObjects) {
      try {
        // Create GO so blueprint scripts can execute
        const go = engine.scene.addGameObjectFromAsset(
          goData.actorAssetId || goData.name,
          goData.name,
          goData.meshType ?? 'cube',
          goData.blueprintData ?? { variables: [], functions: [], macros: [], customEvents: [], structs: [], eventGraph: { nodes: [], connections: [] } },
          goData.position,
          goData.components,
          goData.compiledCode,
          goData.physicsConfig,
          goData.actorType,
          goData.characterPawnConfig || null,
          goData.controllerClass,
          goData.controllerBlueprintId,
        );

        // Hide the 3D mesh — 2D visuals come from SpriteActors in root2D
        if (go.mesh) go.mesh.visible = false;

        // ── Spawn SpriteActor for characterPawn2D / spriteActor ──
        if (goData.actorType === 'characterPawn2D' || goData.actorType === 'spriteActor') {
          const components = goData.components ?? [];
          const sprComp = components.find((c: any) => c.type === 'spriteRenderer');
          const rb2dComp = components.find((c: any) => c.type === 'rigidbody2d');
          const allCollider2dComps: any[] = components.filter((c: any) => c.type === 'collider2d');
          const solidColliders = allCollider2dComps.filter((c: any) => !c.isTrigger);
          const primaryCollider = solidColliders[0] ?? allCollider2dComps[0] ?? null;
          const cm2dComp = components.find((c: any) => c.type === 'characterMovement2d');
          const cam2dComp = components.find((c: any) => c.type === 'camera2d');

          const colliderShape: 'box' | 'circle' | 'capsule' =
            (primaryCollider?.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule';
          const colW = primaryCollider?.collider2dSize?.width ?? 0.8;
          const colH = primaryCollider?.collider2dSize?.height ?? 1.0;

          // Extra colliders (trigger zones etc.) after the primary solid one
          const additionalColliders = allCollider2dComps
            .filter((c: any) => c !== primaryCollider)
            .map((c: any) => ({
              shape: (c.collider2dShape ?? 'box') as 'box' | 'circle' | 'capsule',
              size: c.collider2dSize ? { width: c.collider2dSize.width, height: c.collider2dSize.height } : undefined,
              radius: c.collider2dRadius,
              isTrigger: !!c.isTrigger,
              name: c.name ?? '',
            }));

          // Determine body type (default dynamic for characterPawn2D)
          let bodyType: 'dynamic' | 'static' | 'kinematic' | null = null;
          if (rb2dComp) {
            bodyType = (rb2dComp.bodyType ?? 'dynamic') as 'dynamic' | 'static' | 'kinematic';
          } else if (goData.actorType === 'characterPawn2D') {
            bodyType = 'dynamic'; // character pawns always have dynamic bodies
          } else if (allCollider2dComps.length > 0) {
            // Collider-only actors default to static so they participate in physics
            bodyType = goData.physicsConfig?.simulatePhysics ? 'dynamic' : 'static';
          }

          const spawnPos = { x: goData.position?.x ?? 0, y: goData.position?.y ?? 0 };

          // Read baked characterMovement2DConfig (the real source of movement properties)
          const movCfg = goData.characterMovement2DConfig ?? {};
          const rootPhys = goData.physicsConfig;

          const actorConfig: SpriteActorConfig = {
            name: goData.name,
            actorType: goData.actorType,
            position: spawnPos,
            physicsBodyType: bodyType,
            colliderShape,
            colliderSize: { width: colW, height: colH },
            colliderRadius: primaryCollider?.collider2dRadius,
            componentName: primaryCollider?.name || 'Collider2D',
            isTrigger: primaryCollider?.isTrigger ?? false,
            additionalColliders,
            sortingLayer: sprComp?.sortingLayer ?? 'Default',
            orderInLayer: sprComp?.orderInLayer ?? 0,
            freezeRotation: movCfg.freezeRotation ?? rb2dComp?.freezeRotation ?? rootPhys?.lockRotationZ ?? true,
            ccdEnabled: rb2dComp?.ccdEnabled ?? rootPhys?.ccdEnabled ?? true,
            gravityScale: movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0,
            linearDamping: movCfg.linearDrag ?? rb2dComp?.linearDamping ?? rootPhys?.linearDamping ?? 0.0,
            angularDamping: rb2dComp?.angularDamping ?? rootPhys?.angularDamping ?? 0.05,
            mass: rb2dComp?.mass ?? rootPhys?.mass ?? 1.0,
            friction: rb2dComp?.friction ?? rootPhys?.friction ?? 0.5,
            restitution: rb2dComp?.restitution ?? rootPhys?.restitution ?? 0.1,
            characterMovement2D: !!cm2dComp || goData.actorType === 'characterPawn2D',
            blueprintId: goData.actorAssetId ?? undefined,
          };

          const actor = new SpriteActor(actorConfig);
          actor.id = go.id;
          actor.controllerClass = goData.controllerClass ?? 'None';
          actor.controllerBlueprintId = goData.controllerBlueprintId ?? '';

          // Start with a white placeholder sprite (correct sprite will load if spriteSheet is assigned)
          actor.spriteRenderer.material.color.setHex(0xffffff);
          actor.spriteRenderer.material.transparent = true;

          // Apply sprite renderer properties from component data
          if (sprComp?.flipX) actor.spriteRenderer.flipX = true;
          if (sprComp?.flipY) actor.spriteRenderer.flipY = true;
          if (sprComp?.spriteScale) actor.spriteRenderer.spriteScale = { x: sprComp.spriteScale.x, y: sprComp.spriteScale.y };
          if (sprComp?.spriteOffset) actor.spriteRenderer.spriteOffset = { x: sprComp.spriteOffset.x, y: sprComp.spriteOffset.y };

          // Set animBlueprintId so loadAnimBP2DData() can wire up state machines
          actor.animBlueprintId = sprComp?.animBlueprint2dId ?? null;

          root2D!.add(actor.group);

          // Apply sorting layers for correct z-ordering
          if (sortingLayerMgr) actor.applySorting(sortingLayerMgr);

          // ── Attach physics body ──
          if (physics2D && bodyType) {
            actor.attachPhysicsBody(physics2D, actorConfig);

            // Override gravity scale from baked config
            const rbComp = actor.getComponent('RigidBody2D');
            if (rbComp?.rigidBody) {
              const gs = movCfg.gravityScale ?? rb2dComp?.gravityScale ?? rootPhys?.gravityScale ?? 1.0;
              rbComp.rigidBody.setGravityScale(gs, true);
            }
          }

          // ── Attach CharacterMovement2D ──
          if (cm2dComp || goData.actorType === 'characterPawn2D') {
            // Merge from baked characterMovement2DConfig (the actual source)
            const moveProps = {
              ...defaultCharacterMovement2DProps(),
              ...movCfg,
            };
            const cm2d = new CharacterMovement2D(moveProps);
            cm2d.attach(actor);
            actor.characterMovement2D = cm2d;
            actor.setComponent('CharacterMovement2D', cm2d);

            // Also register in the engine GO's runtime components so blueprints can find them
            if (go._runtimeComponents) {
              go._runtimeComponents.set('CharacterMovement2D', cm2d);
              go._runtimeComponents.set('RigidBody2D', actor.getComponent('RigidBody2D'));
              go._runtimeComponents.set('SpriteRenderer', actor.getComponent('SpriteRenderer'));
            }
          }

          // ── Load sprite sheet (if assigned) ──
          const sheetId = sprComp?.spriteSheetId;
          const sheet = sheetId ? spriteSheetMap.get(sheetId) : null;
          if (sheet?.image && sheet?.texture) {
            actor.setSpriteSheet(sheet);
            // Set default sprite
            const defaultSprite = sprComp?.defaultSprite
              ? sheet.sprites?.find((s: any) => s.name === sprComp.defaultSprite || s.spriteId === sprComp.defaultSprite)
              : sheet.sprites?.[0];
            if (defaultSprite && sheet.texture) {
              actor.spriteRenderer.setSprite(defaultSprite, sheet.texture);
            }
            // Init animator if animations exist
            if (sheet.animations?.length > 0) {
              actor.initAnimator(sheet.animations);
              if (sheet.animations[0]?.animName) {
                actor.animator?.play(sheet.animations[0].animName);
              }
            }
          }

          // ── Camera2D follow from camera2d component ──
          if (cam2dComp && camera2D) {
            const camConfig = cam2dComp.camera2dConfig ?? {};
            const smoothing = camConfig.followSmoothing ?? 0.15;
            const deadZone = {
              x: camConfig.deadZoneX ?? camConfig.deadZone?.width ?? 0.5,
              y: camConfig.deadZoneY ?? camConfig.deadZone?.height ?? 0.5,
            };
            camera2D.follow(actor, smoothing, deadZone);
            if ((camConfig.pixelsPerUnit ?? 0) > 0) camera2D.setPixelsPerUnit(camConfig.pixelsPerUnit);
            camera2D.setPixelPerfect(camConfig.pixelPerfect ?? false);
            if (camConfig.defaultZoom) {
              camera2D.setZoom(camConfig.defaultZoom);
            }
            console.log('[Runtime 2D]   ✓ Camera2D follow target set to "%s" (zoom: %s)', goData.name, camConfig.defaultZoom ?? 'default');
          }

          // ── Store actor blueprint compiled code on the sprite actor ──
          if (goData.compiledCode) {
            (actor as any).__actorBlueprintCode = goData.compiledCode;
          }

          spriteActors2D.push(actor);
          console.log('[Runtime 2D]   + SpriteActor:', goData.name, '(type:', goData.actorType,
            ') physics:', bodyType ?? 'none',
            'hasSprite:', !!sheet,
            'pos:', spawnPos.x.toFixed(2) + ',' + spawnPos.y.toFixed(2));
        } else {
          // Non-2D-actor game objects (e.g. triggers, volumes) — just log
          console.log('[Runtime 2D]   + GO:', goData.name, '(type:', goData.actorType ?? 'default', ')');
        }
      } catch (err) {
        console.error('[Runtime 2D]   ✗ Failed:', goData.name, err);
      }
    }
  }

  // ── Set up controller shims, AI controllers, and AnimBP data ──
  setupControllerShims();
  setupAIControllers2D();
  await loadAnimBP2DData();

  // ── Start physics ──
  physics2D.play();
  console.log('[Runtime 2D]   ✓ Physics2D started — %d sprite actors', spriteActors2D.length);

  // Fire BeginPlay on scripts
  console.log('[Runtime 2D]   Starting onPlayStarted...');
  await withTimeout(engine.onPlayStarted(canvas), 15000, 'onPlayStarted');
  console.log('[Runtime 2D]   ✓ onPlayStarted done');

  // Hide 3D helpers
  engine.scene.setTriggerHelpersVisible(false);
  engine.scene.setLightHelpersVisible(false);
  engine.scene.setComponentHelpersVisible(false);
}

function isLikely2DSceneData(sceneData: any): boolean {
  if (!sceneData || typeof sceneData !== 'object') return false;
  if (sceneData.sceneMode === '2D') return true;

  const cfg2D = sceneData.scene2DConfig;
  if (!cfg2D) return false;

  if (cfg2D.sceneMode === '2D' || cfg2D.config?.sceneMode === '2D') return true;
  if ((cfg2D.tilemaps?.length ?? 0) > 0) return true;
  if ((cfg2D.tilesets?.length ?? 0) > 0) return true;
  if ((cfg2D.spriteSheets?.length ?? 0) > 0) return true;

  const gos: any[] = Array.isArray(sceneData.gameObjects) ? sceneData.gameObjects : [];
  return gos.some(go => go?.actorType === 'characterPawn2D' || go?.actorType === 'spriteActor');
}

// ── Scene loading helper (reused for initial load AND scene switching) ──
async function loadSceneByName(sceneName: string): Promise<void> {
  if (sceneLoading) {
    console.warn('[Runtime] Scene load already in progress, ignoring:', sceneName);
    return;
  }
  sceneLoading = true;

  try {
    console.log('[Runtime] ▶ Loading scene:', sceneName);

    // 1. Clear the current scene
    const scene = engine.scene;
    while (scene.gameObjects.length > 0) {
      scene.removeGameObject(scene.gameObjects[0]);
    }
    console.log('[Runtime]   ✓ Scene cleared');

    // 2. Stop physics from the old scene (pass scene so stop() can clear body refs)
    if (engine.physics && (engine.physics as any).stop) {
      (engine.physics as any).stop(engine.scene);
    }

    // 2b. Destroy existing character/spectator controllers from previous scene
    engine.characterControllers.destroyAll();
    engine.spectatorControllers.destroyAll();

    // 3. Fetch the new scene JSON
    const res = await fetch('/project-data/Scenes/' + sceneName + '.json');
    if (!res.ok) {
      console.error('[Runtime] Scene not found:', sceneName);
      return;
    }
    const sceneData = await res.json();
    console.log('[Runtime]   ✓ Scene JSON loaded:', sceneData.name, '-', (sceneData.gameObjects?.length ?? 0), 'objects');

    // ── Clean up previous 2D scene resources ──
    // Run onDestroy for all blueprint scripts
    for (const [actor, entry] of actorBlueprintScripts.entries()) {
      if (entry.script && entry.started) {
        try { entry.script.onDestroy({ gameObject: actor as any, deltaTime: 0, elapsedTime: entry.elapsed }); } catch {}
      }
    }
    actorBlueprintScripts.clear();
    // Clean up AnimBP scripts
    for (const [, entry] of actorAnimBPScripts.entries()) {
      if (entry.script && entry.started) {
        try { entry.script.onDestroy({}); } catch {}
      }
    }
    actorAnimBPScripts.clear();
    actorAnimBPStates.clear();
    // Destroy AI controllers
    for (const ctrl of aiControllers2D) {
      try { ctrl.destroy?.(); } catch {}
    }
    aiControllers2D = [];
    // Dispose sprite actors first (removes physics bodies from world)
    for (const actor of spriteActors2D) {
      actor.dispose(physics2D ?? undefined);
    }
    spriteActors2D = [];
    if (physics2D) {
      physics2D.cleanup();
      physics2D = null;
    }
    if (tilemapRenderer) {
      tilemapRenderer.dispose();
      tilemapRenderer = null;
    }
    if (root2D) {
      engine.scene.threeScene.remove(root2D);
      root2D = null;
    }
    if (camera2D) {
      camera2D.dispose();
      camera2D = null;
    }

    // ── Remove any previous 3D environment objects (lights, sky, ground) ──
    const toRemove: THREE.Object3D[] = [];
    engine.scene.threeScene.traverse((obj: THREE.Object3D) => {
      if (obj.name?.startsWith('__runtime_') ||
          (obj as any).isDirectionalLight ||
          (obj as any).isHemisphereLight) {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      engine.scene.threeScene.remove(obj);
      (obj as any).geometry?.dispose();
      if ((obj as any).material?.dispose) (obj as any).material.dispose();
    }

    // ── Detect 2D scene (supports legacy / partially-populated sceneMode) ──
    if (isLikely2DSceneData(sceneData) && sceneData.scene2DConfig) {
      is2DScene = true;
      console.log('[Runtime]   ★ 2D scene detected — setting up 2D rendering');
      await setup2DScene(sceneData);
      console.log('[Runtime] ▶ 2D Scene loaded successfully:', sceneName);
      return; // skip 3D deserialization below
    }

    // ── 3D scene path ──
    is2DScene = false;
    // Restore 3D renderer settings (in case previous scene was 2D)
    renderer.toneMapping = saved3DToneMapping;
    renderer.toneMappingExposure = saved3DExposure;
    // Re-create 3D environment
    await setupSceneEnvironment(engine.scene.threeScene);

    // 4. Deserialize game objects
    // Track per-instance material overrides to apply AFTER async meshes load
    const deferredMatOverrides: Array<{ go: any; overrides: any[] }> = [];

    if (sceneData.gameObjects) {
      for (const goData of sceneData.gameObjects) {
        try {
          // Build rootMaterialOverrides by merging:
          //  a) goData.rootMaterialOverrides — baked from actor asset (Record<string, string>)
          //  b) goData.materialOverrides — per-instance overrides with materialAssetId
          // Per-instance overrides (b) take priority over actor-level (a).
          const rootMatOverrides: Record<string, string> = {};

          // Start with actor-asset-level material assignments
          if (goData.rootMaterialOverrides) {
            for (const [slot, matId] of Object.entries(goData.rootMaterialOverrides)) {
              if (matId) rootMatOverrides[slot] = matId as string;
            }
          }

          // Layer per-instance material asset IDs on top (take priority)
          if (goData.materialOverrides) {
            for (const m of goData.materialOverrides) {
              if (m.materialAssetId) rootMatOverrides[String(m.index)] = m.materialAssetId;
            }
          }

          const go = engine.scene.addGameObjectFromAsset(
            goData.actorAssetId || goData.name,
            goData.name,
            goData.meshType,
            goData.blueprintData ?? { variables: [], functions: [], macros: [], customEvents: [], structs: [], eventGraph: { nodes: [], connections: [] } },
            goData.position,
            goData.components,
            goData.compiledCode,
            goData.physicsConfig,
            goData.actorType,
            goData.characterPawnConfig || null,
            goData.controllerClass,
            goData.controllerBlueprintId,
            Object.keys(rootMatOverrides).length > 0 ? rootMatOverrides : undefined,
          );

          // Preserve per-instance physics toggle from serialized scene data
          if (typeof goData.hasPhysics === 'boolean') {
            go.hasPhysics = goData.hasPhysics;
          }

          // Preserve explicit per-instance physics config override
          if (goData.physicsConfig) {
            go.physicsConfig = structuredClone(goData.physicsConfig);
          }

          // Restore custom imported mesh instances (same behavior as SceneSerializer.deserializeScene)
          if (goData.customMeshAssetId) {
            const meshAsset = MeshAssetManager.getInstance().getAsset(goData.customMeshAssetId);
            if (meshAsset) {
              try {
                const meshGo = await engine.scene.addGameObjectFromMeshAsset(meshAsset, goData.position);
                meshGo.name = goData.name;
                meshGo.actorAssetId = goData.actorAssetId ?? null;
                if (goData.rotation) {
                  meshGo.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
                }
                if (goData.scale) {
                  meshGo.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
                }
                if (typeof goData.hasPhysics === 'boolean') {
                  meshGo.hasPhysics = goData.hasPhysics;
                }
                if (goData.physicsConfig) {
                  meshGo.physicsConfig = structuredClone(goData.physicsConfig);
                }
                if (goData.materialOverrides && goData.materialOverrides.length > 0) {
                  deferredMatOverrides.push({ go: meshGo, overrides: goData.materialOverrides });
                }
                console.log('[Runtime]   + Created custom-mesh GO:', goData.name);
                continue;
              } catch (err) {
                console.warn('[Runtime]   ! Failed custom mesh restore for', goData.name, err);
              }
            }
          }

          // Defer per-instance color/PBR overrides — meshes may not be loaded yet
          // (StaticMeshComponent loads asynchronously via loadMeshFromAsset)
          if (goData.materialOverrides && goData.materialOverrides.length > 0) {
            deferredMatOverrides.push({ go, overrides: goData.materialOverrides });
          }

          if (goData.rotation) {
            go.mesh.rotation.set(goData.rotation.x, goData.rotation.y, goData.rotation.z);
          }
          if (goData.scale) {
            go.mesh.scale.set(goData.scale.x, goData.scale.y, goData.scale.z);
          }
          console.log('[Runtime]   + Created:', goData.name);
        } catch (err) {
          console.error('[Runtime]   ✗ Failed to create game object:', goData.name, err);
        }
      }
    }

    // 5. Wait for async mesh loads (with timeout so we don't hang forever)
    console.log('[Runtime]   Waiting for mesh loads...');
    await withTimeout(engine.scene.waitForMeshLoads(), 10000, 'waitForMeshLoads');
    console.log('[Runtime]   ✓ Mesh loads done');

    // 5b. Apply deferred per-instance material color/PBR overrides
    // Now that all static/skeletal meshes are loaded, we can traverse and apply.
    for (const { go, overrides } of deferredMatOverrides) {
      const meshes: THREE.Mesh[] = [];
      const collectMeshes = (obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
        for (const ch of obj.children) {
          if (ch.userData?.__isTriggerHelper || ch.userData?.__isLightHelper || ch.userData?.__isComponentHelper) continue;
          collectMeshes(ch);
        }
      };
      collectMeshes(go.mesh);

      for (const ov of overrides) {
        if (ov.index < 0 || ov.index >= meshes.length) continue;
        const mat = meshes[ov.index].material as THREE.MeshStandardMaterial;
        if (mat && 'color' in mat) {
          if (ov.color) mat.color.set(ov.color);
          if (ov.metalness != null) mat.metalness = ov.metalness;
          if (ov.roughness != null) mat.roughness = ov.roughness;
        }
      }
    }

    // 6. Restart physics
    try {
      engine.physics.play(engine.scene);
      console.log('[Runtime]   ✓ Physics started');
    } catch (err) {
      console.error('[Runtime]   ✗ Physics play failed:', err);
    }

    // 7. Fire BeginPlay on all scripts, set up controllers, navmesh, etc.
    // Clear stale controller scripts from the previous scene to prevent leaks
    (engine as any)._controllerScripts = [];
    (engine as any)._activeControllers = [];
    // Wrap in timeout — navmesh WASM init can hang if module is missing
    console.log('[Runtime]   Starting onPlayStarted...');
    await withTimeout(engine.onPlayStarted(canvas), 15000, 'onPlayStarted');
    console.log('[Runtime]   ✓ onPlayStarted done');

    // 7b. Hide editor-only helpers (same as editor Play mode)
    engine.scene.setTriggerHelpersVisible(false);
    engine.scene.setLightHelpersVisible(false);
    engine.scene.setComponentHelpersVisible(false);

    // 8. Update fallback camera from scene data
    if (sceneData.camera?.position) {
      fallbackCamera.position.set(
        sceneData.camera.position.x ?? 5,
        sceneData.camera.position.y ?? 5,
        sceneData.camera.position.z ?? 5,
      );
    }
    if (sceneData.camera?.target) {
      fallbackCamera.lookAt(
        sceneData.camera.target.x ?? 0,
        sceneData.camera.target.y ?? 0,
        sceneData.camera.target.z ?? 0,
      );
    }

    console.log('[Runtime] ▶ Scene loaded successfully:', sceneName);
  } catch (err) {
    console.error('[Runtime] Scene load failed:', err);
  } finally {
    sceneLoading = false;
  }
}

// ── ProjectManager shim ──
const runtimeProjectManager = {
  async loadSceneRuntime(sceneName: string): Promise<boolean> {
    try {
      await loadSceneByName(sceneName);
      return true;
    } catch (err) {
      console.error('[Runtime] loadSceneRuntime failed:', err);
      return false;
    }
  },
  async openScene(sceneName: string): Promise<boolean> {
    return this.loadSceneRuntime(sceneName);
  },
};

async function main() {
  setProgress(5, 'Initializing renderer...');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  // Match editor: EffectComposer handles sRGB encoding, so renderer uses linear
  // The runtime renders directly to canvas (no EffectComposer / GammaCorrectionShader),
  // so we must use SRGBColorSpace for correct gamma output.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  resize();
  window.addEventListener('resize', resize);

  setProgress(10, 'Initializing engine (WASM)...');

  engine = new Engine();
  // Engine init loads RAPIER WASM — timeout to prevent permanent hang
  const initOk = await withTimeout(engine.init(), 15000, 'engine.init');
  if (initOk === undefined) {
    console.error('[Runtime] Engine WASM init timed out — continuing anyway');
  }
  console.log('[Runtime] Engine initialized');

  // Wire up the projectManager shim so blueprint scripts can switch scenes
  engine.projectManager = runtimeProjectManager;

  // Load mesh assets (mesh bundles with materials/textures) into MeshAssetManager
  setProgress(13, 'Loading mesh assets...');
  await initMeshAssets();

  // ── Load project metadata early so we can read settings ──
  setProgress(15, 'Loading project metadata...');
  const projectRes = await fetch('/project-data/project.json');
  const projectMeta = await projectRes.json();

  // Load ALL runtime assets (actors, game instances, widgets, sounds, input, data tables, etc.)
  setProgress(17, 'Loading runtime assets...');
  await initRuntimeAssets(projectMeta);

  // Save default 3D renderer settings before any scene loads
  saved3DToneMapping = renderer.toneMapping;
  saved3DExposure = renderer.toneMappingExposure;

  // NOTE: environment setup (lights, sky, ground) is now handled inside
  // loadSceneByName — for 3D scenes it calls setupSceneEnvironment(),
  // for 2D scenes it calls setup2DScene().
  setProgress(20, 'Preparing environment...');

  // Fallback camera
  fallbackCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  fallbackCamera.position.set(5, 4, 5);
  fallbackCamera.lookAt(0, 0, 0);

  // ── Determine start scene ──
  const startScene = '${this._config.entryPoint.startScene}' || projectMeta.activeScene || 'DefaultScene';

  setProgress(30, 'Loading scene: ' + startScene + '...');

  // ── Load the initial scene ──
  await loadSceneByName(startScene);

  setProgress(100, 'Ready');

  // Hide loading overlay
  setTimeout(() => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }, 300);

  // ── Game loop ──
  let lastTime = performance.now();
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (sceneLoading) return; // skip rendering while loading a new scene

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    engine.update();

    if (is2DScene && camera2D) {
      // ── 2D rendering path ──
      // Mirrors Scene2DManager.update() order exactly:
      // 1. AI controllers  2. actor.update  3. blueprint scripts
      // 4. syncAnimBPVars  5. evalAnimBPTransitions  6. processEvents  7. flushPendingDestroys

      // Step physics
      if (physics2D) physics2D.step(dt);

      // Update AI controllers
      for (const ctrl of aiControllers2D) {
        try { ctrl.update(dt); } catch {}
      }

      // Update all sprite actors (sync physics → transform, character movement, animator)
      for (const actor of spriteActors2D) {
        actor.update(dt);
        // Execute actor blueprint code (Event Graph)
        runActorBlueprintScript(actor, dt);
        // Sync physics state into AnimBP variables
        syncAnimBPVars(actor, dt);
        // Evaluate AnimBP state machine transitions
        evalAnimBPTransitions(actor);
      }

      // Process collision/trigger events so onBeginOverlap / onEndOverlap fire
      if (physics2D) {
        try { physics2D.processEvents(); } catch {}
      }

      // Flush deferred destroys from blueprint Destroy Actor nodes
      flushPendingDestroys();

      camera2D.resize(window.innerWidth, window.innerHeight);
      camera2D.update(dt);
      // Update animated tiles
      if (tilemapRenderer) tilemapRenderer.update(dt);
      renderer.render(engine.scene.threeScene, camera2D.camera);
    } else {
      // ── 3D rendering path ──
      const cam = engine.characterControllers.getActiveCamera()
        ?? engine.spectatorControllers.getActiveCamera()
        ?? engine.playerControllers.getActiveCamera();

      if (cam) {
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
        renderer.render(engine.scene.threeScene, cam);
      } else {
        fallbackCamera.aspect = window.innerWidth / window.innerHeight;
        fallbackCamera.updateProjectionMatrix();
        renderer.render(engine.scene.threeScene, fallbackCamera);
      }
    }

    engine.input.update();
  }
  requestAnimationFrame(loop);
}

main().catch(err => {
  console.error('[Runtime] Fatal error:', err);
  if (loadingStatus) loadingStatus.textContent = 'Error — see DevTools console (Ctrl+Shift+I)';
});
`;

    await invoke('write_file', {
      path: `${gameProjDir}/src/game_runtime.ts`,
      contents: runtime,
    });
  }

  private async _runTauriBuild(gameProjDir: string): Promise<BuildStepResult> {
    // Determine Tauri build target flag
    const platform = this._config.general.platform;
    let targetFlag = '';
    if (platform === 'windows') targetFlag = '--target x86_64-pc-windows-msvc';
    else if (platform === 'linux') targetFlag = '--target x86_64-unknown-linux-gnu';
    // macOS and native build: no explicit target needed

    const fullCmd = `cargo tauri build ${targetFlag}`.trim();
    this._log(`  Command: ${fullCmd}`);
    this._log(`  Working directory: ${gameProjDir}`);

    // First, check that required tools are available
    this._log(`  Checking prerequisites...`);
    try {
      const cargoCheck = await invoke<string>('check_command_available', { command: 'cargo' });
      this._log(`  cargo: ${cargoCheck || '❌ NOT FOUND'}`);
    } catch {
      this._log(`  cargo: ❌ Could not check`);
    }
    try {
      const tauriCheck = await invoke<string>('check_command_available', { command: 'cargo-tauri' });
      this._log(`  cargo-tauri: ${tauriCheck || '⚠ not found (will try via cargo tauri)'}`);
    } catch {
      this._log(`  cargo-tauri: ⚠ Could not check`);
    }

    // Check if node/npm is available (needed for beforeBuildCommand)
    try {
      const npmCheck = await invoke<string>('check_command_available', { command: 'npm' });
      this._log(`  npm: ${npmCheck || '❌ NOT FOUND'}`);
    } catch {
      this._log(`  npm: ❌ Could not check`);
    }

    // Verify key files exist in the game project
    this._log(`  Verifying game project structure...`);
    const requiredFiles = [
      'index.html',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'src-tauri/tauri.conf.json',
      'src-tauri/Cargo.toml',
      'src-tauri/src/main.rs',
      'src-tauri/src/lib.rs',
      'src-tauri/build.rs',
    ];
    for (const f of requiredFiles) {
      const exists = await invoke<boolean>('file_exists', { path: `${gameProjDir}/${f}` });
      this._log(`    ${exists ? '✓' : '✗'} ${f}`);
    }

    // Check if src/game_runtime.ts exists
    const runtimeExists = await invoke<boolean>('file_exists', { path: `${gameProjDir}/src/game_runtime.ts` });
    this._log(`    ${runtimeExists ? '✓' : '✗'} src/game_runtime.ts`);

    // Check if cooked assets exist
    const cookedExists = await invoke<boolean>('file_exists', { path: `${gameProjDir}/public/project-data` });
    this._log(`    ${cookedExists ? '✓' : '✗'} public/project-data/`);

    // Ensure JS dependencies are installed before cargo tauri invokes beforeBuildCommand.
    // Cached by package.json hash to avoid reinstalling every build.
    const depsReady = await this._ensureDependencies(gameProjDir);
    if (!depsReady.success) {
      return {
        success: false,
        message: `Dependency install failed: ${depsReady.message}`,
      };
    }

    this._log(`  Running build command...`);
    const buildStart = Date.now();

    try {
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
        'run_build_command',
        {
          cwd: gameProjDir,
          command: 'cargo',
          args: ['tauri', 'build', ...(targetFlag ? targetFlag.split(' ') : [])],
        }
      );

      const elapsed = ((Date.now() - buildStart) / 1000).toFixed(1);

      this._log(`  Build command finished in ${elapsed}s (exit code: ${result.exitCode})`);

      // Always log stdout/stderr for visibility
      if (result.stdout?.trim()) {
        this._log(`  ── STDOUT ──────────────────────────────────`);
        for (const line of result.stdout.trim().split('\n').slice(-50)) {
          this._log(`  ${line}`);
        }
      }
      if (result.stderr?.trim()) {
        this._log(`  ── STDERR ──────────────────────────────────`);
        for (const line of result.stderr.trim().split('\n').slice(-80)) {
          this._log(`  ${line}`);
        }
      }
      this._log(`  ───────────────────────────────────────────`);

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: `Tauri build failed (exit code ${result.exitCode}).\nSee build log above for details.\n\nLast stderr lines:\n${result.stderr?.split('\n').slice(-20).join('\n') ?? '(empty)'}`,
        };
      }

      return { success: true, message: 'Tauri build succeeded' };
    } catch (e: any) {
      this._log(`  ✗ Could not execute build command: ${e?.message ?? e}`);
      this._log(`  This usually means 'cargo' is not in PATH or the Tauri CLI is not installed.`);
      this._log(`  Fix: Install Rust (https://rustup.rs) and the Tauri CLI (cargo install tauri-cli)`);
      return {
        success: false,
        message: `Could not run build command: ${e?.message ?? e}.\nMake sure Rust and the Tauri CLI are installed.`,
      };
    }
  }

  private async _ensureDependencies(gameProjDir: string): Promise<{ success: boolean; message: string }> {
    const pkgPath = `${gameProjDir}/package.json`;
    const nodeModulesPath = `${gameProjDir}/node_modules`;
    const stampPath = `${gameProjDir}/.feather-deps.stamp`;

    try {
      const pkgRaw = await invoke<string>('read_file', { path: pkgPath });
      const pkgHash = this._hashString(pkgRaw);

      const [hasNodeModules, oldStamp] = await Promise.all([
        invoke<boolean>('file_exists', { path: nodeModulesPath }).catch(() => false),
        invoke<string>('read_file', { path: stampPath }).catch(() => ''),
      ]);

      if (hasNodeModules && oldStamp.trim() === pkgHash) {
        this._log('  ✓ Reusing cached node_modules (package.json unchanged)');
        return { success: true, message: 'cached' };
      }

      this._log('  Installing dependencies (package changed or cache missing)...');
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>('run_build_command', {
        cwd: gameProjDir,
        command: this._getNpmCmd(),
        args: ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      });

      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || result.stdout || 'npm install failed' };
      }

      await invoke('write_file', { path: stampPath, contents: pkgHash });
      return { success: true, message: 'installed' };
    } catch (e: any) {
      return { success: false, message: e?.message ?? String(e) };
    }
  }

  private _getNpmCmd(): string {
    return navigator.userAgent.toLowerCase().includes('windows') ? 'npm.cmd' : 'npm';
  }

  private _hashString(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private async _copyArtifactsToOutput(gameProjDir: string, outputDir: string, platform: string): Promise<void> {
    this._log(`  Copying artifacts to ${outputDir}...`);

    // Tauri places artifacts in src-tauri/target/release/bundle/
    const artifactsDir = `${gameProjDir}/src-tauri/target/release/bundle`;

    const exists = await invoke<boolean>('file_exists', { path: artifactsDir });
    if (!exists) {
      this._log(`  ⚠ Bundle directory does not exist: ${artifactsDir}`);
      this._log(`  Checking target/release/ for any output...`);
      const releaseExists = await invoke<boolean>('file_exists', { path: `${gameProjDir}/src-tauri/target/release` });
      this._log(`    target/release/ exists: ${releaseExists}`);
      return;
    }

    try {
      await invoke('copy_directory', { src: artifactsDir, dest: outputDir });
      this._log(`  ✓ Artifacts copied`);
    } catch (e: any) {
      this._log(`  ⚠ Copy failed: ${e?.message ?? e}`);
      this._log(`  Artifacts available at: ${artifactsDir}`);
    }
  }

  private _log(msg: string): void {
    this._onLog(`[PC] ${msg}`);
  }
}
