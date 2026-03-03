// ============================================================
//  WebBuildTarget — HTML5 / Web Export
//  Produces a self-contained folder with index.html + assets
//  Runnable from any modern web server (not file://).
//
//  Strategy:
//  1. Generate a game-only Vite project (no editor, no Tauri)
//  2. Assets are served from /project-data/ via fetch()
//  3. Vite bundles and minifies the TypeScript runtime
//  4. Output: dist/ folder with index.html + all assets
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON, WebSettings } from '../BuildConfigurationAsset';

export interface BuildStepResult {
  success: boolean;
  message: string;
  outputPath?: string;
}

// ── HTML template for web build ───────────────────────────────

function generateWebHtml(config: BuildConfigurationJSON, webSettings: WebSettings): string {
  const { gameName } = config.general;
  const { canvasWidth, canvasHeight, allowFullscreen } = webSettings;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${gameName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #game-container {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    #render-canvas {
      max-width: 100%; max-height: 100%;
      aspect-ratio: ${canvasWidth} / ${canvasHeight};
      display: block;
    }
    ${allowFullscreen ? `
    #fullscreen-btn {
      position: fixed; bottom: 12px; right: 12px;
      background: rgba(0,0,0,0.6); color: #fff;
      border: 1px solid rgba(255,255,255,0.3); border-radius: 4px;
      padding: 6px 12px; cursor: pointer; font-size: 12px;
      z-index: 100;
    }` : ''}
    #loading-overlay {
      position: fixed; inset: 0; background: #000;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; z-index: 9999; color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      transition: opacity 0.4s;
    }
    #loading-overlay.hidden { opacity: 0; pointer-events: none; }
    .loading-title { font-size: 28px; font-weight: 700; margin-bottom: 20px; }
    .loading-bar-outer { width: 280px; height: 5px; background: #222; border-radius: 3px; }
    .loading-bar-inner { height: 100%; background: #60a5fa; border-radius: 3px; width: 0%; transition: width 0.3s; }
    .loading-status { margin-top: 10px; font-size: 12px; color: #888; }
    .cors-note { margin-top: 20px; font-size: 11px; color: #555; text-align: center; max-width: 300px; }
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="loading-title">${gameName}</div>
    <div class="loading-bar-outer"><div class="loading-bar-inner" id="loading-bar"></div></div>
    <div class="loading-status" id="loading-status">Loading...</div>
    <p class="cors-note">⚠️ Requires a web server — not runnable from file://</p>
  </div>
  <div id="game-container">
    <canvas id="render-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
  </div>
  ${allowFullscreen ? `<button id="fullscreen-btn" onclick="document.documentElement.requestFullscreen?.()">⛶ Fullscreen</button>` : ''}
  <script type="module" src="/src/game_runtime.ts"></script>
</body>
</html>`;
}

// ── PWA manifest ──────────────────────────────────────────────

function generateManifest(config: BuildConfigurationJSON): string {
  return JSON.stringify({
    name: config.general.gameName,
    short_name: config.general.gameName,
    start_url: '/',
    display: 'fullscreen',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2);
}

// ── Web runtime entry point ───────────────────────────────────

function generateWebRuntime(config: BuildConfigurationJSON): string {
  const startScene = config.entryPoint.startScene || '';
  return `// ⚠️ AUTO-GENERATED — DO NOT EDIT
// Web game runtime entry point

import { boot } from './runtime/ExportRuntime';

boot({
  startScene: '${startScene}',
  platform: 'web',
}).catch(err => {
  console.error('[Runtime] Fatal error:', err);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = 'Error — see DevTools console';
});
`;
}

// ── Web build target ──────────────────────────────────────────

export class WebBuildTarget {
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
    const webSettings = (this._config.platformSettings as any).settings as WebSettings;
    const outputDir = this._resolveOutputDir();
    const gameProjDir = `${this._projectPath}/BuildCache/web/GameProject`;

    this._log('Generating web game project...');

    // Resolve engine root path (where the engine app is running from)
    let engineRoot: string;
    try {
      engineRoot = await invoke<string>('get_engine_root');
      this._log(`Engine root: ${engineRoot}`);
    } catch (e: any) {
      return { success: false, message: `Failed to resolve engine root: ${e?.message ?? e}` };
    }

    try {
      // 1. Write HTML entry point
      await invoke('write_file', {
        path: `${gameProjDir}/index.html`,
        contents: generateWebHtml(this._config, webSettings),
      });

      // 2. Write PWA manifest if requested
      if (webSettings.enablePWA) {
        await invoke('write_file', {
          path: `${gameProjDir}/public/manifest.json`,
          contents: generateManifest(this._config),
        });
      }

      // 3. Write package.json — include ALL engine deps so npm can resolve
      //    all imports. Vite tree-shakes the final bundle.
      const deps = await this._readCurrentDeps(engineRoot);

      // Separate dev vs runtime deps
      const devPkgNames = new Set([
        '@tauri-apps/cli', 'typescript', 'vite', 'esbuild',
        '@types/react', '@types/react-dom', '@types/three',
      ]);
      const devDependencies: Record<string, string> = {};
      const runtimeDependencies: Record<string, string> = {};
      for (const [name, version] of Object.entries(deps)) {
        if (!version) continue;
        if (devPkgNames.has(name)) devDependencies[name] = version as string;
        else runtimeDependencies[name] = version as string;
      }
      if (!devDependencies['typescript']) devDependencies['typescript'] = '~5.9.3';
      if (!devDependencies['vite']) devDependencies['vite'] = '^8.0.0-beta.13';
      if (!runtimeDependencies['three']) runtimeDependencies['three'] = '^0.182.0';

      await invoke('write_file', {
        path: `${gameProjDir}/package.json`,
        contents: JSON.stringify({
          name: this._config.general.gameName.toLowerCase().replace(/\\s+/g, '-'),
          version: this._config.general.version,
          private: true,
          type: 'module',
          scripts: {
            build: 'vite build'
          },
          devDependencies,
          dependencies: runtimeDependencies,
        }, null, 2),
      });

      // 4. Write Vite config
      await invoke('write_file', {
        path: `${gameProjDir}/vite.config.ts`,
        contents: `import { defineConfig } from 'vite';
export default defineConfig({
  clearScreen: false,
  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: { main: 'index.html' }
    }
  }
});`
      });

      // 5. Copy Engine source code into the generated game project
      this._log('Copying Engine source code...');
      const engineSrcPath = `${engineRoot}/src`;
      this._log(`  Engine source path: ${engineSrcPath}`);
      const srcExists = await invoke<boolean>('file_exists', { path: engineSrcPath });
      if (!srcExists) {
        return {
          success: false,
          message: `Engine source directory not found at: ${engineSrcPath}`,
        };
      }
      this._log(`  ✓ Engine source found at: ${engineSrcPath}`);
      await invoke('copy_directory', {
        src: engineSrcPath,
        dest: `${gameProjDir}/src`,
      });

      // 6. Write game runtime JS (now TS!)
      await invoke('write_file', {
        path: `${gameProjDir}/src/game_runtime.ts`,
        contents: generateWebRuntime(this._config),
      });

      // 7. Write tsconfig
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
            strict: true
          },
          include: ['src']
        }, null, 2),
      });

      // 8. Copy cooked assets to public/project-data/
      this._log('Copying cooked assets...');
      await invoke('copy_directory', {
        src: this._stagingDir,
        dest: `${gameProjDir}/public/project-data`,
      });

      // 9. Install deps only when package.json changed (cached by stamp)
      const depResult = await this._ensureDependencies(gameProjDir);
      if (!depResult.success) {
        return { success: false, message: 'Dependency install failed:\n' + depResult.message };
      }

      this._log('Running Vite build...');
      const buildResult = await this._runCommand(gameProjDir, this._getNpmCmd(), ['run', 'build']);
      if (!buildResult.success) return { success: false, message: 'Vite build failed:\\n' + buildResult.message };

      // 10. Copy dist/ to output directory
      await invoke('copy_directory', {
        src: `${gameProjDir}/dist`,
        dest: outputDir,
      });

      // 7. Write a README about the CORS requirement
      await invoke('write_file', {
        path: `${outputDir}/README.txt`,
        contents: `${this._config.general.gameName} - Web Build
Version: ${this._config.general.version}

To run this game:
  1. Serve this folder from a web server
     (e.g. npx serve . or python3 -m http.server)
  2. Open http://localhost:3000 in a browser

⚠️ This game CANNOT be opened directly from the filesystem (file://)
   because modern browsers block fetch() calls from file:// origins.

Minimum browser requirements:
  - Chrome 90+ / Firefox 88+ / Safari 15+
  - WebGL 2.0 support required
`,
      });

      this._log(`✓ Web build complete → ${outputDir}`);

      return {
        success: true,
        message: 'Web build successful',
        outputPath: outputDir,
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Web build failed: ${e?.message ?? String(e)}`,
      };
    }
  }

  private _resolveOutputDir(): string {
    return this._config.output.outputDirectory ||
      `${this._projectPath}/Builds/web/${this._config.general.gameName.replace(/\\s+/g, '_')}_${this._config.general.version}`;
  }

  private _getNpmCmd(): string {
    // navigator might not exist if running purely in rust context but we are in Tauri webview
    return navigator.userAgent.toLowerCase().includes('windows') ? 'npm.cmd' : 'npm';
  }

  private async _runCommand(cwd: string, cmd: string, args: string[]): Promise<{success: boolean, message: string}> {
    try {
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
        'run_build_command',
        { cwd, command: cmd, args }
      );
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || result.stdout };
      }
      return { success: true, message: 'Success' };
    } catch (e: any) {
      return { success: false, message: String(e) };
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
        this._log('Reusing cached node_modules (package.json unchanged)');
        return { success: true, message: 'cached' };
      }

      this._log('Installing dependencies (package changed or cache missing)...');
      const installResult = await this._runCommand(
        gameProjDir,
        this._getNpmCmd(),
        ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      );
      if (!installResult.success) {
        return { success: false, message: installResult.message };
      }

      await invoke('write_file', { path: stampPath, contents: pkgHash });
      return { success: true, message: 'installed' };
    } catch (e: any) {
      return { success: false, message: e?.message ?? String(e) };
    }
  }

  private _hashString(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private async _readCurrentDeps(engineRoot: string): Promise<any> {
    const pkgPath = `${engineRoot}/package.json`;
    this._log(`  Reading deps from: ${pkgPath}`);
    try {
      const enginePkgRaw = await invoke<string>('read_file', { path: pkgPath });
      const enginePkg = JSON.parse(enginePkgRaw);
      return { ...enginePkg.dependencies, ...enginePkg.devDependencies };
    } catch (e: any) {
      this._log(`  ⚠ Could not read ${pkgPath}: ${e?.message ?? e}. Using default versions.`);
      return {};
    }
  }

  private _log(msg: string): void {
    this._onLog(`[Web] ${msg}`);
  }
}
