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
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
tokio = { version = "1", features = ["full"] }
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
    // Generate a thin boot script that imports the unified ExportRuntime.
    // All 2000+ lines of runtime logic now live in src/runtime/ExportRuntime.ts
    // which is copied to the build project via _copyEngineSource().
    const startScene = this._config.entryPoint.startScene || '';
    const runtime = `// ⚠️ AUTO-GENERATED — DO NOT EDIT
// Game runtime entry point generated by Feather Engine Build System
import { boot } from './runtime/ExportRuntime';

boot({
  startScene: '${startScene}',
  platform: 'pc',
}).catch(err => {
  console.error('[Runtime] Fatal error:', err);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = 'Error — see DevTools console (Ctrl+Shift+I)';
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
